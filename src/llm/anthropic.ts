import type { Context } from 'koishi'

import type { ResolvedProvider } from '../config'
import { ANTHROPIC_THINKING_BUDGETS } from '../constants'
import {
  isRecord,
  type ChatRequest,
  type ChatResult,
  type LlmClient,
} from '../types'
import { LlmRequestError, LlmUnavailableError } from './errors'
import { appendEndpoint, describeError } from './openai'

export interface AnthropicInspection {
  text: string
  reasoning: string
  stopReason: string | null
  error: unknown
}

export interface AnthropicPayloadOptions {
  disableThinking?: boolean
  maxTokens?: number
}

export class AnthropicClient implements LlmClient {
  readonly kind = 'anthropic' as const

  constructor(
    private readonly ctx: Context,
    private readonly provider: ResolvedProvider,
    private readonly fallbackModel?: string,
  ) {
    if (!provider.baseURL) throw new LlmUnavailableError('未填写 baseURL')
    if (!provider.apiKey) throw new LlmUnavailableError('未填写 apiKey')
  }

  private get model(): string {
    return this.provider.model || this.fallbackModel || ''
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const model = request.model || this.model
    if (!model) throw new LlmUnavailableError('没有指定模型名')

    const endpoint = appendEndpoint(this.provider.baseURL, '/v1/messages')
    const configuredMaxTokens = request.maxTokens ?? this.provider.maxTokens
    const options = {
      headers: {
        'x-api-key': this.provider.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: this.provider.timeout,
      signal: request.signal,
    }
    const logger = this.ctx.logger('copywrite')

    const attempt = (payloadOptions: AnthropicPayloadOptions = {}) =>
      this.post(
        endpoint,
        buildAnthropicPayload(
          this.provider,
          request,
          model,
          payloadOptions,
        ),
        options,
      )

    const first = await attempt()
    if (first.text.trim()) return toChatResult(first)
    if (!isAnthropicTruncated(first)) {
      throw new LlmRequestError(describeAnthropicFailure(first))
    }

    const errors = [`首次请求：${describeAnthropicFailure(first)}`]

    if (
      this.provider.retryWithoutReasoning &&
      this.provider.reasoningEffort !== 'off'
    ) {
      try {
        logger.debug('输出被思考截断，尝试关闭 Anthropic thinking 重试')
        const retried = await attempt({
          disableThinking: true,
          maxTokens: configuredMaxTokens,
        })
        if (retried.text.trim()) return toChatResult(retried)
        errors.push(`关闭思考重试：${describeAnthropicFailure(retried)}`)
      } catch (error) {
        errors.push(`关闭思考重试失败：${errorMessage(error)}`)
      }
    }

    if (this.provider.retryWithMoreTokens) {
      const budget =
        this.provider.reasoningEffort &&
        this.provider.reasoningEffort !== 'auto'
          ? ANTHROPIC_THINKING_BUDGETS[this.provider.reasoningEffort]
          : undefined
      const current = budget
        ? Math.max(configuredMaxTokens, budget + 2048)
        : configuredMaxTokens
      const cap = Math.max(10240, (budget ?? 0) + 2048)
      const next = Math.min(cap, current * 2)

      if (next > current) {
        try {
          logger.debug('尝试提高 Anthropic max_tokens 到 %d 重试', next)
          const retried = await attempt({ maxTokens: next })
          if (retried.text.trim()) return toChatResult(retried)
          errors.push(`提高 maxTokens(${next}) 重试：${describeAnthropicFailure(retried)}`)
        } catch (error) {
          errors.push(`提高 maxTokens 重试失败：${errorMessage(error)}`)
        }
      }
    }

    throw new LlmRequestError(errors.join('\n'))
  }

  private async post(
    endpoint: string,
    payload: Record<string, unknown>,
    options: any,
  ): Promise<AnthropicInspection> {
    let response: unknown
    try {
      response = await this.ctx.http.post(endpoint, payload, options)
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

    return inspectAnthropicResponse(response)
  }
}

/** 纯函数，方便单测 */
export function buildAnthropicPayload(
  provider: Pick<
    ResolvedProvider,
    'temperature' | 'maxTokens' | 'reasoningEffort'
  >,
  request: Pick<ChatRequest, 'messages' | 'temperature' | 'maxTokens'>,
  model: string,
  options: AnthropicPayloadOptions = {},
): Record<string, unknown> {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const userContent = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => message.content)
    .join('\n\n')

  const configuredMaxTokens =
    options.maxTokens ?? request.maxTokens ?? provider.maxTokens
  const budget =
    !options.disableThinking &&
    provider.reasoningEffort &&
    provider.reasoningEffort !== 'auto'
      ? ANTHROPIC_THINKING_BUDGETS[provider.reasoningEffort]
      : undefined

  const payload: Record<string, unknown> = {
    model,
    system: system || undefined,
    messages: [{ role: 'user', content: userContent }],
    max_tokens: configuredMaxTokens,
    temperature: request.temperature ?? provider.temperature,
  }

  if (budget !== undefined) {
    // Anthropic 要求 budget_tokens >= 1024 且 < max_tokens，同时给正文留出空间。
    payload.max_tokens = Math.max(configuredMaxTokens, budget + 2048)
    payload.temperature = 1
    payload.thinking = { type: 'enabled', budget_tokens: budget }
  }

  return payload
}

export function inspectAnthropicResponse(
  response: unknown,
): AnthropicInspection {
  const result: AnthropicInspection = {
    text: '',
    reasoning: '',
    stopReason: null,
    error: undefined,
  }

  if (!isRecord(response)) {
    result.error = response ?? '响应不是对象'
    return result
  }

  if (response.error !== undefined && response.error !== null) {
    result.error = response.error
  }
  if (typeof response.stop_reason === 'string') {
    result.stopReason = response.stop_reason
  }

  const content = response.content
  if (!Array.isArray(content)) return result

  for (const part of content) {
    if (!isRecord(part)) continue
    if (part.type === 'text') {
      result.text += typeof part.text === 'string' ? part.text : ''
    } else if (part.type === 'thinking') {
      result.reasoning += typeof part.thinking === 'string' ? part.thinking : ''
    }
    // redacted_thinking 只记录，不作为正文
  }

  return result
}

/** 是否被思考内容截断 */
export function isAnthropicTruncated(info: AnthropicInspection): boolean {
  return (
    info.stopReason === 'max_tokens' &&
    !info.text.trim() &&
    Boolean(info.reasoning.trim())
  )
}

function describeAnthropicFailure(info: AnthropicInspection): string {
  if (info.error !== undefined && info.error !== null) {
    return `Anthropic 接口返回错误：${safeJson(info.error)}`
  }
  if (info.stopReason === 'max_tokens') {
    return (
      'Anthropic 输出达到 max_tokens 上限。请提高「⚙️ 调用参数」里的 maxTokens，' +
      '或把思考等级调低/设为 off。'
    )
  }
  if (info.reasoning.trim()) {
    return `Anthropic 只返回了思维链（${info.reasoning.length} 字），没有最终正文。`
  }
  return 'Anthropic 接口返回内容为空。'
}

function toChatResult(info: AnthropicInspection): ChatResult {
  return {
    text: info.text.trim(),
    reasoning: info.reasoning.trim() || undefined,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safeJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
