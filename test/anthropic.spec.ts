import { describe, expect, it } from 'vitest'

import {
  buildAnthropicPayload,
  inspectAnthropicResponse,
} from '../src/llm/anthropic'

const messages = [{ role: 'user' as const, content: 'hi' }]

const provider = {
  temperature: 0.65,
  maxTokens: 2048,
  reasoningEffort: 'auto' as const,
}

describe('buildAnthropicPayload', () => {
  it('auto / off 不发送 thinking', () => {
    for (const effort of ['auto', 'off'] as const) {
      const payload = buildAnthropicPayload(
        { ...provider, reasoningEffort: effort },
        { messages, maxTokens: 2048 },
        'claude',
      )

      expect(payload.thinking).toBeUndefined()
      expect(payload.temperature).toBe(0.65)
      expect(payload.max_tokens).toBe(2048)
    }
  })

  it('low 映射到 1280，并抬高 max_tokens、温度设为 1', () => {
    const payload = buildAnthropicPayload(
      { ...provider, reasoningEffort: 'low' },
      { messages, maxTokens: 2048 },
      'claude',
    )

    expect(payload.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 1280,
    })
    expect(payload.temperature).toBe(1)
    expect(payload.max_tokens).toBeGreaterThanOrEqual(1280 + 2048)
  })

  it('high 映射到 4096', () => {
    const payload = buildAnthropicPayload(
      { ...provider, reasoningEffort: 'high' },
      { messages, maxTokens: 2048 },
      'claude',
    )

    expect(payload.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 4096,
    })
  })
})

describe('inspectAnthropicResponse', () => {
  it('正文只取 text，thinking 单独提取', () => {
    const result = inspectAnthropicResponse({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '先想一想' },
        { type: 'text', text: '最终' },
        { type: 'redacted_thinking' },
        { type: 'text', text: '正文' },
      ],
    })

    expect(result.text).toBe('最终正文')
    expect(result.reasoning).toBe('先想一想')
  })

  it('识别错误', () => {
    const result = inspectAnthropicResponse({
      error: { message: 'bad request' },
    })

    expect(result.error).toEqual({ message: 'bad request' })
  })
})
