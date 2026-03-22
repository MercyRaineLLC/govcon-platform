// LLM Provider interface — all AI providers implement this contract

export interface LLMRequest {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
}

export interface LLMResponse {
  text: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  provider: string
  model: string
}

export interface LLMProvider {
  generate(req: LLMRequest): Promise<LLMResponse>
}
