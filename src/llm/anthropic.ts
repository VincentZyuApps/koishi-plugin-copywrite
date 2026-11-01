import type { Context } from 'koishi'

import type { CustomProvider } from '../config'
import { isRecord, type ChatRequest, type LlmClient } from '../types'
import { LlmRequestError, LlmUnavailableError } from './errors'
import { appendEndpoint, describeError } from './openai'

interface AnthropicResponse {
  stop_reason?: string | null
  content?: Array<{ type?: string; text?: string }>
}

export class AnthropicClient implements LlmClient {
  readonly kind = 'anthropic' as const

  constructor(
    private readonly ctx: Context,
    private readonly provider: CustomProvider,
    private readonly fallbackModel?: string,
  ) {
    if (!provider.baseURL) throw new LlmUnavailableError('未填写 baseURL')
    if (!provider.apiKey) throw new LlmUnavailableError('未填写 apiKey')
  }

  private get model(): string {
    return this.provider.model || this.fallbackModel || ''
  }

  async chat(request: ChatRequest): Promise<string> {
    const model = request.model || this.model
    if (!model) throw new LlmUnavailableError('没有指定模型名')

    const endpoint = appendEndpoint(this.provider.baseURL, '/v1/messages')
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n')
    const userContent = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => message.content)
      .join('\n\n')

    let response: AnthropicResponse | string
    try {
      response = await this.ctx.http.post<AnthropicResponse | string>(
        endpoint,
        {
          model,
          system: system || undefined,
          messages: [{ role: 'user', content: userContent }],
          max_tokens: request.maxTokens ?? this.provider.maxTokens,
          temperature: request.temperature ?? this.provider.temperature,
        },
        {
          headers: {
            'x-api-key': this.provider.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: this.provider.timeout,
          signal: request.signal,
        },
      )
    } catch (error) {
      throw new LlmRequestError(
        `Anthropic 接口请求失败：${describeError(error)}`,
        { cause: error },
      )
    }

    if (typeof response === 'string') {
      throw new LlmRequestError(
        `Anthropic 接口返回了非 JSON 内容：${response.slice(0, 200)}`,
      )
    }

    const content = (response?.content ?? [])
      .filter((part) => isRecord(part) && part.type === 'text')
      .map((part) => part.text ?? '')
      .join('')

    if (!content.trim()) {
      throw new LlmRequestError('Anthropic 接口返回内容为空')
    }
    return content.trim()
  }
}
