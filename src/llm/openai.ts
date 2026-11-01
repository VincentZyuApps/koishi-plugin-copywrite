import type { Context } from 'koishi'

import type { ResolvedProvider } from '../config'
import { isRecord, type ChatRequest, type LlmClient } from '../types'
import { LlmRequestError, LlmUnavailableError } from './errors'

interface OpenAiResponse {
  choices?: Array<{
    finish_reason?: string | null
    message?: { content?: unknown }
  }>
}

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

  async chat(request: ChatRequest): Promise<string> {
    const model = request.model || this.model
    if (!model) throw new LlmUnavailableError('没有指定模型名')

    const endpoint = appendEndpoint(
      this.provider.baseURL,
      '/v1/chat/completions',
    )
    const payload = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? this.provider.temperature,
    }
    const maxTokens = request.maxTokens ?? this.provider.maxTokens
    const options = {
      headers: {
        Authorization: `Bearer ${this.provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: this.provider.timeout,
      signal: request.signal,
    }

    let response: OpenAiResponse | string
    try {
      response = await this.ctx.http.post<OpenAiResponse | string>(
        endpoint,
        { ...payload, max_tokens: maxTokens },
        options,
      )
    } catch (error) {
      if (!shouldRetryWithMaxCompletionTokens(error)) {
        throw requestError('OpenAI 兼容接口', error)
      }
      try {
        response = await this.ctx.http.post<OpenAiResponse | string>(
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

    const content = readOpenAiContent(response?.choices?.[0]?.message?.content)
    if (!content.trim()) {
      throw new LlmRequestError('OpenAI 兼容接口返回内容为空')
    }
    return content.trim()
  }
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

function readOpenAiContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (!isRecord(part)) return ''
      if (typeof part.text === 'string') return part.text
      if (isRecord(part.text) && typeof part.text.value === 'string') {
        return part.text.value
      }
      return ''
    })
    .join('')
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
