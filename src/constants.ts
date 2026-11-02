/** 📌 默认指令名与别名（不依赖 koishi，方便单测直接引用） */
export const DEFAULT_COMMAND_NAME = 'copywrite'
export const DEFAULT_COMMAND_ALIASES = ['文案', '模仿文案']
export const DEFAULT_NEW_MEANING_COMMAND_NAME = 'new-meaning'
export const DEFAULT_NEW_MEANING_ALIASES = ['汉语新解']

/** 🧠 思考等级 */
export const REASONING_EFFORTS = [
  'auto',
  'off',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

/** 🧠 各等级对应的中文说明 */
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  auto: '不发送 reasoning_effort，由上游决定',
  off: '关闭思考（CommandCode / goat 实测有效）',
  low: '低强度思考',
  medium: '中强度思考',
  high: '高强度思考',
  xhigh: '极高强度思考',
  max: '最大强度思考',
}

/** 🧠 Anthropic 各等级对应的 thinking budget_tokens */
export const ANTHROPIC_THINKING_BUDGETS: Partial<
  Record<ReasoningEffort, number>
> = {
  low: 1280,
  medium: 2048,
  high: 4096,
  xhigh: 8192,
  max: 16000,
}
