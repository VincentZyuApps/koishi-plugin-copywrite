import { describe, expect, it } from 'vitest'

import {
  describeOpenAiFailure,
  inspectOpenAiResponse,
  isTruncatedByReasoning,
  nextMaxTokens,
} from '../src/llm/openai-response'
import { buildOpenAiPayload } from '../src/llm/openai'

const messages = [{ role: 'user' as const, content: 'hi' }]

describe('buildOpenAiPayload', () => {
  it('auto 不发送 reasoning_effort', () => {
    const payload = buildOpenAiPayload(
      { temperature: 0.65, maxTokens: 2048, reasoningEffort: 'auto' },
      { messages },
      'm',
    )

    expect(payload.reasoning_effort).toBeUndefined()
    expect(payload.model).toBe('m')
    expect(payload.temperature).toBe(0.65)
  })

  it('off / low 等会写入 reasoning_effort', () => {
    for (const effort of ['off', 'low', 'high'] as const) {
      const payload = buildOpenAiPayload(
        { temperature: 0.65, maxTokens: 2048, reasoningEffort: effort },
        { messages },
        'm',
      )
      expect(payload.reasoning_effort).toBe(effort)
    }
  })
})

describe('inspectOpenAiResponse', () => {
  it('正文与思考分别提取', () => {
    const result = inspectOpenAiResponse({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: '最终正文',
            reasoning_content: '思考过程',
          },
        },
      ],
    })

    expect(result.text).toBe('最终正文')
    expect(result.reasoning).toBe('思考过程')
    expect(result.finishReason).toBe('stop')
  })

  it('兼容 content 为数组和单个对象', () => {
    const arrayResult = inspectOpenAiResponse({
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: 'A' },
              { type: 'text', text: 'B' },
            ],
          },
        },
      ],
    })
    expect(arrayResult.text).toBe('AB')

    const objectResult = inspectOpenAiResponse({
      choices: [{ message: { content: { text: 'C' } } }],
    })
    expect(objectResult.text).toBe('C')
  })

  it('识别 HTTP 200 里的 error', () => {
    const result = inspectOpenAiResponse({
      error: { message: 'Invalid option' },
    })

    expect(result.error).toEqual({ message: 'Invalid option' })
    expect(describeOpenAiFailure(result, 2048)).toContain('Invalid option')
  })

  it('finish_reason=length 给出 max_tokens 提示', () => {
    const result = inspectOpenAiResponse({
      choices: [{ finish_reason: 'length', message: { content: '' } }],
      usage: {
        completion_tokens: 2048,
        completion_tokens_details: { reasoning_tokens: 2048 },
      },
    })

    const message = describeOpenAiFailure(result, 2048)
    expect(message).toContain('max_tokens')
    expect(message).toContain('reasoning_tokens=2048')
    expect(message).toContain('off/low')
  })

  it('只有思维链时给出明确提示', () => {
    const result = inspectOpenAiResponse({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: '', reasoning_content: '想了很多' },
        },
      ],
    })

    expect(describeOpenAiFailure(result, 2048)).toContain('思维链')
  })
})

describe('截断重试辅助', () => {
  it('只有 length + 空正文 + 思考才算截断', () => {
    const base = {
      text: '',
      reasoning: '想了很多',
      finishReason: 'length',
      usage: undefined,
      error: undefined,
    }

    expect(isTruncatedByReasoning(base)).toBe(true)
    expect(isTruncatedByReasoning({ ...base, text: '正文' })).toBe(false)
    expect(isTruncatedByReasoning({ ...base, reasoning: '' })).toBe(false)
    expect(isTruncatedByReasoning({ ...base, finishReason: 'stop' })).toBe(false)
  })

  it('maxTokens 翻倍并封顶 10240', () => {
    expect(nextMaxTokens(2048)).toBe(4096)
    expect(nextMaxTokens(8192)).toBe(10240)
    expect(nextMaxTokens(10240)).toBeNull()
  })
})
