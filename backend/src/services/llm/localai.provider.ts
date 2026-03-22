// LocalAI — Free, open-source, self-hosted AI. OpenAI-compatible API.
import OpenAI from 'openai'
import { LLMProvider, LLMRequest, LLMResponse } from './provider.interface'
import { logger } from '../../utils/logger'

const DEFAULT_BASE_URL = 'http://localhost:8080/v1'
const DEFAULT_MODEL = 'llama-3.2-1b-instruct:q4_k_m'

export class LocalAIProvider implements LLMProvider {
  private client: OpenAI
  private model: string

  constructor(baseUrl?: string | null, model?: string | null, apiKey?: string | null) {
    this.model = model || DEFAULT_MODEL
    this.client = new OpenAI({
      apiKey: apiKey || 'none',
      baseURL: baseUrl || DEFAULT_BASE_URL,
    })
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 4000,
        temperature: req.temperature ?? 0,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      })

      const text = completion.choices[0]?.message?.content ?? ''
      const inputTokens = completion.usage?.prompt_tokens ?? 0
      const outputTokens = completion.usage?.completion_tokens ?? 0

      return {
        text,
        inputTokens,
        outputTokens,
        estimatedCostUsd: 0,
        provider: 'localai',
        model: this.model,
      }
    } catch (err) {
      logger.error('LocalAI API error', { error: (err as Error).message })
      throw err
    }
  }
}
