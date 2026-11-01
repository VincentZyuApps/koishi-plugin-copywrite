import type { Context } from 'koishi'

import type { Config, CustomProvider, LlmMode } from '../config'
import type { ChatMessage, LlmClient } from '../types'
import { AnthropicClient } from './anthropic'
import { ChatlunaClient, getChatlunaService } from './chatluna'
import { LlmRequestError, LlmUnavailableError } from './errors'
import { OpenAiClient } from './openai'

export { LlmRequestError, LlmUnavailableError } from './errors'

export type LlmVia = 'chatluna' | 'custom'

export interface RouteResult {
  text: string
  via: LlmVia
  /** chatluna 模式是模型名，custom 模式是 customProviders 的 key */
  channel: string
}

export function resolveOrder(mode: LlmMode): LlmVia[] {
  switch (mode) {
    case 'chatluna-only':
      return ['chatluna']
    case 'custom-only':
      return ['custom']
    case 'custom-first':
      return ['custom', 'chatluna']
    case 'chatluna-first':
    default:
      return ['chatluna', 'custom']
  }
}

export interface PatternModelRef {
  model?: string
}

export class LlmRouter {
  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {}

  order(): LlmVia[] {
    return resolveOrder(this.config.llmMode)
  }

  chatlunaModelName(model?: string): string {
    const mapped = model ? this.config.chatlunaModelMap?.[model] : undefined
    if (mapped) return mapped
    if (this.config.chatlunaModel) return this.config.chatlunaModel
    return getChatlunaService(this.ctx)?.config?.defaultModel ?? ''
  }

  customProvider(
    model?: string,
  ): { key: string; provider: CustomProvider } | null {
    const providers = this.config.customProviders ?? {}
    const keys = Object.keys(providers)
    if (!keys.length) return null

    let key = model && providers[model] ? model : ''
    if (
      !key &&
      this.config.defaultCustomProvider &&
      providers[this.config.defaultCustomProvider]
    ) {
      key = this.config.defaultCustomProvider
    }
    if (!key) key = keys[0]

    const raw = providers[key]
    if (!raw) return null

    const provider: CustomProvider = { ...raw, model: raw.model || key }
    if (!provider.baseURL || !provider.apiKey) return null

    return { key, provider }
  }

  async chat(
    pattern: PatternModelRef | undefined,
    messages: ChatMessage[],
  ): Promise<RouteResult> {
    const model = pattern?.model
    const errors: string[] = []

    for (const via of this.order()) {
      try {
        const client = await this.create(via, model)
        const text = await client.chat({ messages })
        return {
          text,
          via,
          channel:
            via === 'chatluna'
              ? this.chatlunaModelName(model)
              : (this.customProvider(model)?.key ?? ''),
        }
      } catch (error) {
        if (!(error instanceof LlmUnavailableError) && !this.config.fallbackOnError) {
          throw error
        }
        errors.push(`${via}: ${errorMessage(error)}`)
      }
    }

    throw new LlmRequestError(
      `没有可用的模型通道。\n${errors.join('\n') || '未配置任何通道'}`,
    )
  }

  private async create(via: LlmVia, model?: string): Promise<LlmClient> {
    if (via === 'chatluna') {
      return ChatlunaClient.create(this.ctx, this.chatlunaModelName(model))
    }

    const found = this.customProvider(model)
    if (!found) {
      throw new LlmUnavailableError('没有可用的自定义 API 通道')
    }

    return found.provider.apiFormat === 'anthropic'
      ? new AnthropicClient(this.ctx, found.provider, found.key)
      : new OpenAiClient(this.ctx, found.provider, found.key)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
