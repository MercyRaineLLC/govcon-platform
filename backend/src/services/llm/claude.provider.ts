import { LLMProvider, LLMRequest, LLMResponse } from './provider.interface'
import { logger } from '../../utils/logger'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-sonnet-4-6'

// Cost per million tokens (USD)
const COST_INPUT_PER_M = 3.0
const COST_OUTPUT_PER_M = 15.0

export class ClaudeProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const controller = new AbortController()
    const timeoutMs = req.timeoutMs ?? 180_000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: req.maxTokens ?? 4000,
          temperature: req.temperature ?? 0,
          system: req.systemPrompt,
          messages: [{ role: 'user', content: req.userPrompt }],
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errText = await response.text()
      logger.error('Claude API error', { status: response.status, body: errText })
      throw new Error(`Claude API error ${response.status}: ${errText}`)
    }

    const data = (await response.json()) as any
    const text: string =
      data.content
        ?.filter((b: any) => b.type === 'text')
        ?.map((b: any) => b.text as string)
        ?.join('') || ''

    const inputTokens: number = data.usage?.input_tokens ?? 0
    const outputTokens: number = data.usage?.output_tokens ?? 0
    const estimatedCostUsd =
      (inputTokens / 1_000_000) * COST_INPUT_PER_M +
      (outputTokens / 1_000_000) * COST_OUTPUT_PER_M

    return { text, inputTokens, outputTokens, estimatedCostUsd, provider: 'claude', model: CLAUDE_MODEL }
  }
}
