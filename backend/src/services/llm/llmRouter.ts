import * as crypto from 'crypto'
import { prisma } from '../../config/database'
import { redis } from '../../config/redis'
import { logger } from '../../utils/logger'
import { LLMRequest, LLMResponse } from './provider.interface'
import { ClaudeProvider } from './claude.provider'
import { OpenAIProvider } from './openai.provider'
import { DeepSeekProvider } from './deepseek.provider'
import { InsightEngineProvider } from './insight.provider'
import { LocalAIProvider } from './localai.provider'

export type LLMTask = 'DOCUMENT_ANALYSIS' | 'COMPLIANCE_MATRIX' | 'BID_GUIDANCE' | 'AI_ASSISTANT'

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

function cacheKey(task: LLMTask, req: LLMRequest, provider: string): string {
  const fingerprint = `${provider}|${req.systemPrompt.slice(0, 100)}|${req.userPrompt.slice(0, 200)}`
  const hash = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)
  return `llm:${task}:${hash}`
}

export async function generateWithRouter(
  req: LLMRequest,
  consultingFirmId: string | undefined,
  opts: { task: LLMTask; useCache?: boolean }
): Promise<LLMResponse> {
  // Resolve provider config from DB, with platform env vars as fallback.
  // DEFAULT_LLM_PROVIDER env var sets the platform-wide default (e.g. 'openai')
  // so AI features work out of the box without firms configuring their own keys.
  const platformDefault = process.env.DEFAULT_LLM_PROVIDER || 'claude'
  let llmProvider = platformDefault
  let anthropicApiKey: string | null = process.env.ANTHROPIC_API_KEY || null
  let openaiApiKey: string | null = process.env.OPENAI_API_KEY || null
  let deepseekApiKey: string | null = process.env.DEEPSEEK_API_KEY || null
  let insightEngineApiKey: string | null = process.env.INSIGHT_ENGINE_API_KEY || null
  let localaiBaseUrl: string | null = process.env.LOCALAI_BASE_URL || null
  let localaiModel: string | null = process.env.LOCALAI_MODEL || null

  if (consultingFirmId) {
    try {
      const firm = await prisma.consultingFirm.findUnique({
        where: { id: consultingFirmId },
        select: { llmProvider: true, anthropicApiKey: true, openaiApiKey: true, deepseekApiKey: true, insightEngineApiKey: true, localaiBaseUrl: true, localaiModel: true },
      })
      if (firm) {
        // Use firm's provider choice if they set one, otherwise use platform default
        llmProvider = firm.llmProvider ?? platformDefault
        // Firm-level keys override platform env keys
        if (firm.anthropicApiKey) anthropicApiKey = firm.anthropicApiKey
        if (firm.openaiApiKey) openaiApiKey = firm.openaiApiKey
        if (firm.deepseekApiKey) deepseekApiKey = firm.deepseekApiKey
        if (firm.insightEngineApiKey) insightEngineApiKey = firm.insightEngineApiKey
        if (firm.localaiModel) localaiModel = firm.localaiModel
        if (firm.localaiBaseUrl) {
          localaiBaseUrl = firm.localaiBaseUrl.replace(
            /https?:\/\/localhost(:\d+)?/,
            (_, port) => `http://ollama${port || ':11434'}`
          )
        }
      }
    } catch (err) {
      logger.warn('Failed to load firm LLM config, using env defaults', { error: (err as Error).message })
    }
  }

  // LocalAI (Mistral 7B class) cannot reliably produce the 16K-token structured
  // JSON required for full proposal drafts — the output is truncated/malformed
  // and renders as a blank PDF. Block LocalAI for BID_GUIDANCE entirely.
  const localAiBlockedForTask = opts.task === 'BID_GUIDANCE'
  if (llmProvider === 'localai' && localAiBlockedForTask) {
    throw new Error('NO_LLM_KEY')
  }

  // Validate the key for the chosen provider (LocalAI runs locally — no key required)
  const activeKey =
    llmProvider === 'openai' ? openaiApiKey :
    llmProvider === 'deepseek' ? deepseekApiKey :
    llmProvider === 'insight_engine' ? insightEngineApiKey :
    llmProvider === 'localai' ? 'localai' :
    anthropicApiKey

  if (!activeKey) {
    throw new Error('NO_LLM_KEY')
  }

  const key = cacheKey(opts.task, req, llmProvider)

  // Cache read (skip for DOCUMENT_ANALYSIS — content varies per doc)
  if (opts.useCache) {
    try {
      const cached = await redis.get(key)
      if (cached) {
        logger.debug('LLM cache hit', { task: opts.task, provider: llmProvider })
        const cachedResponse = JSON.parse(cached) as LLMResponse

        // Log cache hit with zero cost
        if (consultingFirmId) {
          prisma.apiUsageLog.create({
            data: {
              consultingFirmId,
              provider: llmProvider,
              model: cachedResponse.model,
              task: opts.task,
              inputTokens: 0,
              outputTokens: 0,
              estimatedCostUsd: 0,
              cacheHit: true,
              durationMs: 0,
            },
          }).catch((err: Error) => {
            logger.warn('Failed to log cached LLM response to ApiUsageLog', { error: err.message })
          }) // non-blocking
        }
        return cachedResponse
      }
    } catch {
      // Redis miss or error — proceed with live call
    }
  }

  // Instantiate provider — LocalAI gets a Claude fallback if it fails
  const provider =
    llmProvider === 'openai'         ? new OpenAIProvider(activeKey) :
    llmProvider === 'deepseek'       ? new DeepSeekProvider(activeKey) :
    llmProvider === 'insight_engine' ? new InsightEngineProvider(activeKey) :
    llmProvider === 'localai'        ? new LocalAIProvider(localaiBaseUrl, localaiModel) :
    new ClaudeProvider(activeKey)

  const startMs = Date.now()
  let result: LLMResponse
  try {
    result = await provider.generate(req)
  } catch (providerErr) {
    const errMsg = (providerErr as Error).message

    // Surface rate-limit errors immediately — no point retrying
    if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate_limit')) {
      throw new Error('RATE_LIMITED')
    }

    if (llmProvider === 'localai') {
      // LocalAI failed — try Claude, then give up
      if (anthropicApiKey) {
        logger.warn('LocalAI call failed — falling back to Claude', { error: errMsg })
        result = await new ClaudeProvider(anthropicApiKey).generate(req)
      } else {
        throw providerErr
      }
    } else {
      // LocalAI fallback is disabled for BID_GUIDANCE (proposal drafts) — Mistral 7B
      // can't produce reliable 16K JSON output and silently corrupts the artifact.
      const localaiUrl = localaiBaseUrl || process.env.LOCALAI_BASE_URL || null
      if (!localaiUrl || localAiBlockedForTask) {
        logger.warn(`${llmProvider} call failed, LocalAI fallback skipped`, { error: errMsg, task: opts.task })
        throw providerErr
      }
      logger.warn(`${llmProvider} call failed — falling back to LocalAI`, { error: errMsg, url: localaiUrl })
      try {
        result = await new LocalAIProvider(localaiUrl, localaiModel).generate(req)
        result = { ...result, provider: `localai-fallback-from-${llmProvider}` }
      } catch (localaiErr) {
        logger.error('LocalAI fallback also failed', { error: (localaiErr as Error).message })
        throw providerErr
      }
    }
  }
  const durationMs = Date.now() - startMs

  // Log usage (non-blocking)
  if (consultingFirmId) {
    prisma.apiUsageLog.create({
      data: {
        consultingFirmId,
        provider: result.provider,
        model: result.model,
        task: opts.task,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        cacheHit: false,
        durationMs,
      },
    }).catch((err) => logger.warn('Failed to log AI usage', { error: (err as Error).message }))
  }

  // Cache write
  if (opts.useCache) {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
    } catch {
      // Cache write failure is non-fatal
    }
  }

  return result
}
