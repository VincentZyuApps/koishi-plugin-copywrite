import { describe, expect, it } from 'vitest'

import type { ResolvedProvider } from '../src/config'
import {
  buildOpenAiPayload,
  describeOpenAiFailure,
  inspectOpenAiResponse,
  isTruncatedOutput,
  nextMaxTokens,
  OpenAiClient,
} from '../src/llm/openai'

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
  it('只要 finish_reason=length 就算截断', () => {
    const base = {
      text: '',
      reasoning: '想了很多',
      finishReason: 'length',
      usage: undefined,
      error: undefined,
    }

    expect(isTruncatedOutput(base)).toBe(true)
    expect(isTruncatedOutput({ ...base, text: '正文' })).toBe(true)
    expect(isTruncatedOutput({ ...base, reasoning: '' })).toBe(true)
    expect(isTruncatedOutput({ ...base, finishReason: 'stop' })).toBe(false)
  })

  it('maxTokens 翻倍并封顶 10240', () => {
    expect(nextMaxTokens(2048)).toBe(4096)
    expect(nextMaxTokens(5120)).toBe(10240)
    expect(nextMaxTokens(8192)).toBe(10240)
    expect(nextMaxTokens(10240)).toBeNull()
  })
})

function fakeProvider(
  overrides: Partial<ResolvedProvider> = {},
): ResolvedProvider {
  return {
    baseURL: 'https://example.com',
    apiKey: 'key',
    model: 'model',
    apiFormat: 'openai',
    temperature: 0.65,
    maxTokens: 5120,
    timeout: 1000,
    reasoningEffort: 'auto',
    retryWithoutReasoning: true,
    retryWithMoreTokens: true,
    truncateBehavior: 'partial',
    ...overrides,
  }
}

function fakeCtx(responses: unknown[]) {
  let calls = 0
  const ctx = {
    http: {
      post: async () => responses[Math.min(calls++, responses.length - 1)],
    },
    logger: () => ({
      debug() {},
      info() {},
      warn() {},
      error() {},
    }),
  }
  return { ctx: ctx as never, calls: () => calls }
}

function truncated(text: string) {
  return {
    choices: [
      {
        finish_reason: 'length',
        message: { content: text, reasoning_content: '想了很多' },
      },
    ],
  }
}

describe('truncateBehavior', () => {
  it('partial 返回最后一次的半截内容，并重试两次', async () => {
    const { ctx, calls } = fakeCtx([truncated('半截正文')])
    const client = new OpenAiClient(ctx, fakeProvider(), 'model')
    const result = await client.chat({ messages })

    expect(result.text).toBe('半截正文')
    expect(result.finishReason).toBe('length')
    expect(calls()).toBe(3)
  })

  it('error 直接抛错', async () => {
    const { ctx } = fakeCtx([truncated('半截正文')])
    const client = new OpenAiClient(
      ctx,
      fakeProvider({ truncateBehavior: 'error' }),
      'model',
    )

    await expect(client.chat({ messages })).rejects.toThrow('max_tokens')
  })
})