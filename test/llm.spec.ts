import { describe, expect, it } from 'vitest'

import type { Config, CustomProvider } from '../src/config'
import { splitKeywords } from '../src/commands/utils'
import { LlmRouter, resolveOrder } from '../src/llm'
import { appendEndpoint } from '../src/llm/openai'
import type { Context } from 'koishi'

describe('resolveOrder', () => {
  it('四种模式的优先级与回退顺序', () => {
    expect(resolveOrder('chatluna-only')).toEqual(['chatluna'])
    expect(resolveOrder('custom-only')).toEqual(['custom'])
    expect(resolveOrder('chatluna-first')).toEqual(['chatluna', 'custom'])
    expect(resolveOrder('custom-first')).toEqual(['custom', 'chatluna'])
  })
})

describe('appendEndpoint', () => {
  it('自动补全路径', () => {
    expect(appendEndpoint('https://api.example.com', '/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
  })

  it('baseURL 已带 /v1 时不重复', () => {
    expect(appendEndpoint('https://api.example.com/v1', '/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
  })

  it('已经是完整路径时原样返回', () => {
    expect(
      appendEndpoint(
        'https://api.example.com/v1/chat/completions',
        '/v1/chat/completions',
      ),
    ).toBe('https://api.example.com/v1/chat/completions')
  })

  it('Anthropic 端点同样处理', () => {
    expect(appendEndpoint('https://api.anthropic.com/v1', '/v1/messages')).toBe(
      'https://api.anthropic.com/v1/messages',
    )
  })
})

describe('splitKeywords', () => {
  it('复刻 Python 的 maxsplit 行为', () => {
    expect(splitKeywords('a b c', 1)).toEqual(['a b c'])
    expect(splitKeywords('a b c', 2)).toEqual(['a', 'b c'])
    expect(splitKeywords('a b c', 3)).toEqual(['a', 'b', 'c'])
    expect(splitKeywords('a', 3)).toEqual(['a'])
  })
})

const provider = (overrides: Partial<CustomProvider> = {}): CustomProvider => ({
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  apiFormat: 'openai',
  ...overrides,
})

function createRouter(overrides: Partial<Config>) {
  const config = {
    llmMode: 'custom-only',
    chatlunaModel: '',
    chatlunaModelMap: {},
    customProviders: {},
    defaultCustomProvider: '',
    fallbackOnError: false,
    ...overrides,
  } as Config

  const ctx = {
    logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
  } as unknown as Context

  return new LlmRouter(ctx, config)
}

describe('LlmRouter.customProvider', () => {
  it('按 YAML 里的 model 名命中对应通道', () => {
    const router = createRouter({
      customProviders: {
        'gemini-2.5-flash-nothinking': provider(),
        fallback: provider({ baseURL: 'https://fallback.example.com' }),
      },
      defaultCustomProvider: 'fallback',
    })

    expect(router.customProvider('gemini-2.5-flash-nothinking')?.key).toBe(
      'gemini-2.5-flash-nothinking',
    )
    expect(router.customProvider('unknown')?.key).toBe('fallback')
  })

  it('没有显式默认值时取第一个', () => {
    const router = createRouter({
      customProviders: {
        first: provider(),
        second: provider(),
      },
    })

    expect(router.customProvider()?.key).toBe('first')
  })

  it('缺少 baseURL / apiKey 时视为不可用', () => {
    const router = createRouter({
      customProviders: { broken: provider({ apiKey: '' }) },
    })

    expect(router.customProvider()).toBeNull()
  })
})

describe('LlmRouter.chatlunaModelName', () => {
  it('映射表优先，其次全局配置', () => {
    const router = createRouter({
      chatlunaModel: 'openai/gpt-4o-mini',
      chatlunaModelMap: { 'gemini-2.5-flash-nothinking': 'gemini/gemini-2.5-flash' },
    })

    expect(router.chatlunaModelName('gemini-2.5-flash-nothinking')).toBe(
      'gemini/gemini-2.5-flash',
    )
    expect(router.chatlunaModelName('unknown')).toBe('openai/gpt-4o-mini')
  })
})

describe('LlmRouter.chat', () => {
  it('所有通道都不可用时给出明确错误', async () => {
    const router = createRouter({ llmMode: 'custom-only' })

    await expect(
      router.chat({ model: 'x' }, [{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/没有可用的模型通道/)
  })
})
