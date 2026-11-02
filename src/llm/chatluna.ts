import type { Context } from 'koishi'

import { isRecord, type ChatMessage, type ChatRequest, type ChatResult, type LlmClient } from '../types'
import { LlmRequestError, LlmUnavailableError } from './errors'

/**
 * 非字面量的动态导入：tsc 不去解析，esbuild 也不会尝试打包，
 * 因此 ChatLuna 未安装时这段代码只是不会执行，而不是构建失败。
 */
export async function optionalImport(id: string): Promise<any> {
  try {
    return await import(id)
  } catch {
    return null
  }
}

export function getChatlunaService(ctx: Context): any {
  return (ctx as unknown as { chatluna?: any }).chatluna ?? null
}

export function hasChatluna(ctx: Context): boolean {
  return Boolean(getChatlunaService(ctx)?.createChatModel)
}

export class ChatlunaClient implements LlmClient {
  readonly kind = 'chatluna' as const

  private constructor(
    private readonly model: { invoke: (input: unknown) => Promise<any> },
    readonly modelName: string,
  ) {}

  static async create(ctx: Context, modelName: string): Promise<ChatlunaClient> {
    const service = getChatlunaService(ctx)
    if (!service?.createChatModel) {
      throw new LlmUnavailableError('ChatLuna 服务不可用')
    }
    if (!modelName) {
      throw new LlmUnavailableError(
        '没有指定 ChatLuna 模型，请在插件配置里选择 chatlunaModel',
      )
    }

    const ref = await service.createChatModel(modelName)
    const model = ref?.value ?? ref

    if (!model?.invoke) {
      throw new LlmUnavailableError(
        `ChatLuna 模型「${modelName}」未加载，请检查 ChatLuna 的模型配置`,
      )
    }

    return new ChatlunaClient(model, modelName)
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    try {
      const messages = await buildMessages(request.messages)
      const result = messages
        ? await this.model.invoke(messages)
        : await this.model.invoke(flattenMessages(request.messages))

      const text = readContent(result?.content ?? result)
      const reasoning = readReasoning(result)
      if (!text.trim()) throw new Error('模型返回内容为空')
      return {
        text: text.trim(),
        reasoning: reasoning.trim() || undefined,
      }
    } catch (error) {
      throw new LlmRequestError(
        `ChatLuna 请求失败：${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
}

async function buildMessages(messages: ChatMessage[]): Promise<unknown[] | null> {
  const mod = await optionalImport('@langchain/core/messages')
  if (!mod) return null

  const SystemMessage = mod.SystemMessage
  const HumanMessage = mod.HumanMessage
  const AIMessage = mod.AIMessage

  if (!SystemMessage || !HumanMessage) return null

  return messages.map((message) => {
    if (message.role === 'system') return new SystemMessage(message.content)
    if (message.role === 'assistant') {
      return AIMessage
        ? new AIMessage(message.content)
        : new HumanMessage(message.content)
    }
    return new HumanMessage(message.content)
  })
}

function flattenMessages(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      if (message.role === 'system') return message.content
      if (message.role === 'assistant') return `Assistant: ${message.content}`
      return message.content
    })
    .join('\n\n')
}

function readContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (isRecord(part) && typeof part.text === 'string') return part.text
      return ''
    })
    .join('')
}

function readReasoning(result: unknown): string {
  if (!isRecord(result)) return ''

  const kwargs = result.additional_kwargs
  if (isRecord(kwargs)) {
    const value =
      readContent(kwargs.reasoning_content) || readContent(kwargs.reasoning)
    if (value) return value
  }

  const metadata = result.response_metadata
  if (isRecord(metadata)) {
    return (
      readContent(metadata.reasoning_content) || readContent(metadata.reasoning)
    )
  }

  return ''
}

/**
 * 注册 `Schema.dynamic('model')` 的下拉数据源。
 * 只有 ChatLuna 在场时才需要，失败也不影响插件主体。
 */
export async function registerModelSchema(ctx: Context): Promise<boolean> {
  const mod = await optionalImport('koishi-plugin-chatluna/utils/schema')
  if (typeof mod?.modelSchema !== 'function') return false

  try {
    mod.modelSchema(ctx)
    return true
  } catch (error) {
    ctx
      .logger('copywrite')
      .warn(
        '注册 ChatLuna 模型选择器失败：%s',
        error instanceof Error ? error.message : String(error),
      )
    return false
  }
}
