import type { Context } from 'koishi'

import type { ResolvedProvider } from '../config'
import type { ChatRequest, ChatResult, LlmClient } from '../types'
import { LlmRequestError, LlmUnavailableError } from './errors'
import {
  describeOpenAiFailure,
  inspectOpenAiResponse,
  isTruncatedByReasoning,
  nextMaxTokens,
  type OpenAiInspection,
} from './openai-response'

export class OpenAiClient implements LlmClient {
  readonly kind = 'openai' as const

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

    const endpoint = appendEndpoint(
      this.provider.baseURL,
      '/v1/chat/completions',
    )
    const maxTokens = request.maxTokens ?? this.provider.maxTokens
    const options = {
      headers: {
        Authorization: `Bearer ${this.provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: this.provider.timeout,
      signal: request.signal,
    }
    const logger = this.ctx.logger('copywrite')

    const attempt = (
      provider: ResolvedProvider = this.provider,
      tokens = maxTokens,
    ) =>
      this.post(
        endpoint,
        buildOpenAiPayload(provider, request, model),
        tokens,
        options,
      )

    const first = await attempt()
    if (first.text.trim()) return toChatResult(first)
    if (!isTruncatedByReasoning(first)) {
      throw new LlmRequestError(describeOpenAiFailure(first, maxTokens))
    }

    const errors = [`首次请求：${describeOpenAiFailure(first, maxTokens)}`]

    if (
      this.provider.retryWithoutReasoning &&
      this.provider.reasoningEffort !== 'off'
    ) {
      try {
        logger.debug('输出被思考截断，尝试关闭思考重试')
        const retried = await attempt({
          ...this.provider,
          reasoningEffort: 'off',
        })
        if (retried.text.trim()) return toChatResult(retried)
        errors.push(`关闭思考重试：${describeOpenAiFailure(retried, maxTokens)}`)
      } catch (error) {
        errors.push(`关闭思考重试失败：${errorMessage(error)}`)
      }
    }

    if (this.provider.retryWithMoreTokens) {
      const next = nextMaxTokens(maxTokens)
      if (next !== null) {
        try {
          logger.debug('尝试提高 maxTokens 到 %d 重试', next)
          const retried = await attempt(this.provider, next)
          if (retried.text.trim()) return toChatResult(retried)
          errors.push(
            `提高 maxTokens(${next}) 重试：${describeOpenAiFailure(retried, next)}`,
          )
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
    maxTokens: number,
    options: any,
  ): Promise<OpenAiInspection> {
    let response: unknown
    try {
      response = await this.ctx.http.post(
        endpoint,
        { ...payload, max_tokens: maxTokens },
        options,
      )
    } catch (error) {
      if (!shouldRetryWithMaxCompletionTokens(error)) {
        throw requestError('OpenAI 兼容接口', error)
      }
      try {
        response = await this.ctx.http.post(
          endpoint,
          { ...payload, max_completion_tokens: maxTokens },
          options,
        )
      } catch (retryError) {
        throw requestError('OpenAI 兼容接口', retryError)
      }
    }

    if (typeof response === 'string') {
      throw new LlmRequestError(
        `OpenAI 兼容接口返回了非 JSON 内容：${truncate(response, 200)}`,
      )
    }

    return inspectOpenAiResponse(response)
  }
}

function toChatResult(info: OpenAiInspection): ChatResult {
  return {
    text: info.text.trim(),
    reasoning: info.reasoning.trim() || undefined,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 纯函数，方便单测；reasoningEffort 为 auto 时不发送该字段 */
export function buildOpenAiPayload(
  provider: Pick<
    ResolvedProvider,
    'temperature' | 'maxTokens' | 'reasoningEffort'
  >,
  request: Pick<ChatRequest, 'messages' | 'temperature'>,
  model: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    messages: request.messages,
    temperature: request.temperature ?? provider.temperature,
  }

  if (provider.reasoningEffort && provider.reasoningEffort !== 'auto') {
    payload.reasoning_effort = provider.reasoningEffort
  }

  return payload
}

export function appendEndpoint(baseURL: string, endpoint: string): string {
  const base = String(baseURL || '').trim()
  if (!base) return ''

  try {
    const url = new URL(base)
    const pathname = url.pathname.replace(/\/+$/, '')
    if (isCompleteEndpoint(pathname, endpoint)) {
      return base.replace(/\/+$/, '')
    }
    const suffix =
      pathname.endsWith('/v1') && endpoint.startsWith('/v1/')
        ? endpoint.slice(3)
        : endpoint
    url.pathname = `${pathname}${suffix}`
    return url.toString()
  } catch {
    const normalized = base.replace(/\/+$/, '')
    if (isCompleteEndpoint(normalized, endpoint)) return normalized
    if (normalized.endsWith('/v1') && endpoint.startsWith('/v1/')) {
      return normalized + endpoint.slice(3)
    }
    return normalized + endpoint
  }
}

function isCompleteEndpoint(pathname: string, endpoint: string): boolean {
  const tail = endpoint.split('/').pop()
  return Boolean(tail) && pathname.endsWith(`/${tail}`)
}

function shouldRetryWithMaxCompletionTokens(error: unknown): boolean {
  const text = `${describeError(error)} ${safeJson(error)}`
  return (
    /max_completion_tokens/i.test(text) ||
    (/max_tokens/i.test(text) &&
      /(unsupported|not supported|unknown|invalid|unrecognized)/i.test(text))
  )
}

function requestError(channel: string, error: unknown): LlmRequestError {
  return new LlmRequestError(`${channel}请求失败：${describeError(error)}`, {
    cause: error,
  })
}

export function describeError(error: unknown): string {
  if (!error) return '未知错误'
  if (typeof error === 'string') return truncate(error, 500)

  const value = error as Record<string, unknown>
  const response = value.response as
    | { status?: number; statusText?: string }
    | undefined

  if (response?.status) {
    const body =
      typeof value.body === 'string'
        ? value.body
        : safeJson(value.body ?? value.data)
    return truncate(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}${body ? `: ${body}` : ''}`,
      500,
    )
  }

  return truncate(error instanceof Error ? error.message : String(error), 500)
}

function safeJson(value: unknown): string {
  if (value === undefined || value === null) return ''
  try {
    return truncate(JSON.stringify(value), 500)
  } catch {
    return ''
  }
}

function truncate(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1)}…`
}
