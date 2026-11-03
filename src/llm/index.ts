import type { Context, Logger } from 'koishi'

import type {
  Config,
  CustomProvider,
  LlmMode,
  ResolvedProvider,
} from '../config'
import type { ChatMessage, LlmClient } from '../types'
import { AnthropicClient } from './anthropic'
import { ChatlunaClient, getChatlunaService } from './chatluna'
import { LlmRequestError, LlmUnavailableError } from './errors'
import { OpenAiClient } from './openai'

export { LlmRequestError, LlmUnavailableError } from './errors'

export type LlmVia = 'chatluna' | 'custom'

export interface RouteResult {
  text: string
  reasoning?: string
  finishReason?: string | null
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
  private readonly logger: Logger

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {
    this.logger = ctx.logger('copywrite')
  }

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
      const startedAt = Date.now()
      try {
        const client = await this.create(via, model)
        const result = await client.chat({ messages })
        const channel =
          via === 'chatluna'
            ? this.chatlunaModelName(model)
            : (this.customProvider(model)?.key ?? '')

        if (this.config.verboseLog) {
          this.logger.info(
            'verbose route: %s → %s (%dms, reasoning=%d 字, maxTokens=%d, reasoningEffort=%s, truncate=%s, retryWithout=%s, retryMore=%s)',
            via,
            channel || '(未指定)',
            Date.now() - startedAt,
            result.reasoning?.length ?? 0,
            this.config.maxTokens,
            this.config.reasoningEffort,
            this.config.truncateBehavior,
            this.config.retryWithoutReasoning,
            this.config.retryWithMoreTokens,
          )
        }

        return {
          text: result.text,
          reasoning: result.reasoning,
          finishReason: result.finishReason,
          via,
          channel,
        }
      } catch (error) {
        if (!(error instanceof LlmUnavailableError) && !this.config.fallbackOnError) {
          if (this.config.verboseLog) {
            this.logger.warn(
              'verbose route: %s 请求失败（%s）',
              via,
              errorMessage(error),
            )
          }
          throw error
        }

        if (this.config.verboseLog) {
          this.logger.warn(
            'verbose route fallback: %s 不可用（%s），尝试下一条通道',
            via,
            errorMessage(error),
          )
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

    const resolved: ResolvedProvider = {
      ...found.provider,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      timeout: this.config.timeout,
      reasoningEffort: this.config.reasoningEffort,
      retryWithoutReasoning: this.config.retryWithoutReasoning,
      retryWithMoreTokens: this.config.retryWithMoreTokens,
      truncateBehavior: this.config.truncateBehavior,
      verboseLog: this.config.verboseLog,
    }

    return resolved.apiFormat === 'anthropic'
      ? new AnthropicClient(this.ctx, resolved, found.key)
      : new OpenAiClient(this.ctx, resolved, found.key)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
