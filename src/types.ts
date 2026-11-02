/**
 * 定型文模板，字段与上游 nonebot-plugin-copywrite 的 Pattern 一一对应。
 */
export interface Pattern {
  examples: string[]
  model: string
  addition: string
  keywords: number
  help?: string
}

/**
 * 一条已经加载进内存的定型文，附带来源信息。
 */
export interface PatternEntry extends Pattern {
  /** YAML 顶层 key 原样保留（例如 "315"、"PUA"） */
  rawName: string
  /** 小写后的名字，命令里用它查找 */
  name: string
  category: string
  /** 该条目所在的 YAML 文件绝对路径 */
  source: string
}

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * 一次模型调用的结果：正文与思考严格分开。
 * 正文只放最终回答，思考内容永远不混进 text。
 */
export interface ChatResult {
  text: string
  reasoning?: string
}

/**
 * LLM 通道的统一抽象，chatluna / openai / anthropic 各自实现。
 */
export interface LlmClient {
  readonly kind: 'chatluna' | 'openai' | 'anthropic'
  chat(request: ChatRequest): Promise<ChatResult>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
