import { isRecord } from '../types'

export interface OpenAiInspection {
  /** 最终正文，只来自 message.content */
  text: string
  /** 思考内容，只用于可选展示，永远不混进正文 */
  reasoning: string
  finishReason: string | null
  usage: unknown
  error: unknown
}

/** 兼容 content 为字符串、对象、数组等多种返回形态 */
export function extractText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).join('')
  }

  if (isRecord(value)) {
    for (const key of ['text', 'content', 'value']) {
      if (key in value) {
        const text = extractText(value[key])
        if (text) return text
      }
    }
  }

  return ''
}

export function inspectOpenAiResponse(response: unknown): OpenAiInspection {
  const result: OpenAiInspection = {
    text: '',
    reasoning: '',
    finishReason: null,
    usage: undefined,
    error: undefined,
  }

  if (!isRecord(response)) {
    result.error = response ?? '响应不是对象'
    return result
  }

  if (response.error !== undefined && response.error !== null) {
    result.error = response.error
  }
  result.usage = response.usage

  const choices = response.choices
  if (!Array.isArray(choices) || !choices.length) return result

  const choice = choices[0]
  if (!isRecord(choice)) return result

  if (typeof choice.finish_reason === 'string') {
    result.finishReason = choice.finish_reason
  }

  const message = isRecord(choice.message)
    ? choice.message
    : isRecord(choice.delta)
      ? choice.delta
      : {}

  result.text = extractText(message.content)
  result.reasoning =
    extractText(message.reasoning_content) || extractText(message.reasoning)

  return result
}

export function describeOpenAiFailure(
  info: OpenAiInspection,
  maxTokens: number,
): string {
  if (info.error !== undefined && info.error !== null) {
    return `OpenAI 兼容接口返回错误：${safeJson(info.error)}`
  }

  const usage = isRecord(info.usage) ? info.usage : {}
  const details = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {}
  const completionTokens = numberOrNull(usage.completion_tokens)
  const reasoningTokens = numberOrNull(details.reasoning_tokens)

  if (info.finishReason === 'length') {
    return (
      `输出达到 max_tokens 上限（maxTokens=${maxTokens}，` +
      `completion_tokens=${completionTokens ?? '?'}，` +
      `reasoning_tokens=${reasoningTokens ?? '?'}）。` +
      '请提高「⚙️ 调用参数」里的 maxTokens，或把思考等级调到 off/low。'
    )
  }

  if (info.reasoning.trim()) {
    return (
      `模型只返回了思维链（${info.reasoning.length} 字），没有最终正文。` +
      '请提高 maxTokens 或调整思考等级。'
    )
  }

  if (info.finishReason === 'content_filter') {
    return '请求被上游内容过滤拦截（finish_reason=content_filter）。'
  }

  return `OpenAI 兼容接口返回内容为空（finish_reason=${info.finishReason ?? 'unknown'}）。`
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function safeJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
