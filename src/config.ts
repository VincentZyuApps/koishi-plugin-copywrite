import { Schema } from 'koishi'

// ====================
// 🧩 常量定义
// ====================

/** 🧭 模型通道与回退顺序 */
export const LLM_MODES = {
  'chatluna-only': '☁️ 仅 ChatLuna',
  'custom-only': '🔐 仅自定义 API',
  'chatluna-first': '☁️➡️🔐 先 ChatLuna，不可用时回退自定义 API',
  'custom-first': '🔐➡️☁️ 先自定义 API，不可用时回退 ChatLuna',
} as const

export type LlmMode = keyof typeof LLM_MODES

/** 🧩 自定义 API 的接口格式 */
export const API_FORMATS = {
  openai: 'OpenAI 兼容',
  anthropic: 'Anthropic',
} as const

export type ApiFormat = keyof typeof API_FORMATS

export {
  DEFAULT_COMMAND_NAME,
  DEFAULT_COMMAND_ALIASES,
  DEFAULT_NEW_MEANING_COMMAND_NAME,
  DEFAULT_NEW_MEANING_ALIASES,
} from './constants'

import {
  DEFAULT_COMMAND_ALIASES,
  DEFAULT_COMMAND_NAME,
  DEFAULT_NEW_MEANING_ALIASES,
  DEFAULT_NEW_MEANING_COMMAND_NAME,
  REASONING_EFFORTS,
  REASONING_EFFORT_LABELS,
  type ReasoningEffort,
} from './constants'
import { DEFAULT_BUTTON_ROWS, stringifyCompact } from './qq'

// ====================
// 📋 配置接口定义
// ====================

/** 🔐 一条自定义 API 通道 */
export interface CustomProvider {
  baseURL: string
  apiKey: string
  /** 🤖 实际请求的模型名，留空则使用该条目在表格中的 key */
  model?: string
  apiFormat: ApiFormat
}

export type TruncateBehavior = 'partial' | 'error'

/** ⚙️ 自定义 API 的全局调用参数 */
export interface RequestDefaults {
  temperature: number
  maxTokens: number
  timeout: number
  reasoningEffort: ReasoningEffort
  retryWithoutReasoning: boolean
  retryWithMoreTokens: boolean
  truncateBehavior: TruncateBehavior
}

/** 🔌 通道 + 全局参数，客户端实际使用的形态 */
export interface ResolvedProvider extends CustomProvider, RequestDefaults {}

/** 🛡️ 各管理命令的权限等级 */
export interface AuthorityConfig {
  reload: number
  reset: number
  clone: number
  rm: number
}

export interface Config {
  // 💬 消息发送
  enableQuote: boolean
  enableWaitingHint: boolean
  sendReasoning: boolean
  enableReasoningViaQQMarkdown: boolean
  reasoningMaxChars: number
  enableQQButtons: boolean
  qqButtonsJson: string

  // 📌 指令配置
  commandName: string
  commandAliases: string[]
  newMeaningCommandName: string
  newMeaningAliases: string[]

  // 🤖 模型接入
  llmMode: LlmMode
  fallbackOnError: boolean

  // ☁️ ChatLuna 接入
  chatlunaModel: string
  chatlunaModelMap: Record<string, string>

  // 🔐 自定义 API 通道
  customProviders: Record<string, CustomProvider>
  defaultCustomProvider: string

  // ⚙️ 调用参数
  temperature: number
  maxTokens: number
  timeout: number
  reasoningEffort: ReasoningEffort
  retryWithoutReasoning: boolean
  retryWithMoreTokens: boolean
  truncateBehavior: TruncateBehavior

  // 📂 模板数据
  presetDir: string
  autoRelease: boolean
  watchPresets: boolean

  // 🎨 汉语新解
  enableNewMeaning: boolean
  newMeaningModel: string
  svgFontFamily: string
  svgScale: number

  // ⏳ 频率限制
  cooldown: number

  // 🛡️ 命令权限
  authority: AuthorityConfig

  // 🐛 调试
  verboseLog: boolean
}

// ====================
// ⚙️ 配置 Schema 定义
// ====================

export const Config = Schema.intersect([
  // ==================
  // 💬 消息发送分组
  // ==================
  Schema.object({
    enableQuote: Schema.boolean()
      .default(true)
      .description('💬 bot 发送所有指令结果时，是否引用触发指令的消息。'),
    enableWaitingHint: Schema.boolean()
      .default(true)
      .description(
        '⏳ 调用模型生成文案 / 汉语新解时，是否先发送「正在生成」提示，完成后自动撤回。',
      ),
    sendReasoning: Schema.boolean()
      .default(false)
      .description('🧠 是否在正文之前单独发送模型的思考过程。思考为空时跳过。'),
    enableReasoningViaQQMarkdown: Schema.boolean()
      .default(false)
      .description(
        '🧾 仅在 QQ 官方 Bot 平台发送思考消息时使用 Markdown 引用块（&gt; xxx）。正文始终以普通文本发送。',
      ),
    reasoningMaxChars: Schema.number()
      .min(200)
      .max(10240)
      .step(1)
      .default(2222)
      .description(
        '✂️ 思考消息最大字符数。超出后保留开头 80%%、结尾 20%%，中间以「省略 N 字」代替。',
      ),
    enableQQButtons: Schema.boolean()
      .default(true)
      .description(
        '🤖 仅在 QQ 官方 Bot 平台：每次回复后追加「查看文案 / 再来一条」按钮消息（群聊点击只会填入输入框）。',
      ),
    qqButtonsJson: Schema.string()
      .role('textarea', { rows: [5, 10] })
      .default(stringifyCompact(DEFAULT_BUTTON_ROWS))
      .description(
        '📋 QQ 按钮 JSON 配置<br><em>支持变量：<code>${commandName}</code> <code>${randomType}</code>；为空或 JSON 无效时不会发送按钮，并会在聊天中提示。</em>',
      ),
  }).description('💬 消息发送'),

  // ==================
  // 📌 指令配置分组
  // ==================
  Schema.object({
    commandName: Schema.string()
      .default(DEFAULT_COMMAND_NAME)
      .description('📌 生成文案的主指令名，默认是 <code>copywrite</code>。'),
    commandAliases: Schema.array(Schema.string())
      .role('table')
      .default([...DEFAULT_COMMAND_ALIASES])
      .description(
        '🏷️ 主指令的别名表格，默认提供「文案」和「模仿文案」。空项、重复项以及与主指令同名的项会自动忽略。',
      ),
    newMeaningCommandName: Schema.string()
      .default(DEFAULT_NEW_MEANING_COMMAND_NAME)
      .description('🖼️ 汉语新解的主指令名，默认是 <code>new-meaning</code>。'),
    newMeaningAliases: Schema.array(Schema.string())
      .role('table')
      .default([...DEFAULT_NEW_MEANING_ALIASES])
      .description(
        '🏷️ 汉语新解的别名表格，默认提供「汉语新解」。空项、重复项以及与主指令同名的项会自动忽略。',
      ),
  }).description('📌 指令配置'),

  // ==================
  // 🤖 模型接入分组
  // ==================
  Schema.object({
    llmMode: Schema.union(
      (Object.keys(LLM_MODES) as LlmMode[]).map((key) =>
        Schema.const(key).description(LLM_MODES[key]),
      ),
    )
      .role('radio')
      .default('chatluna-first')
      .description(
        '🧭 模型通道的优先级与回退顺序。默认先 ChatLuna，未安装或模型不可用时自动回退到自定义 API。',
      ),
    fallbackOnError: Schema.boolean()
      .default(false)
      .description(
        '🛟 请求报错时是否也切换到下一条通道。默认关闭，避免一次请求被重复计费。',
      ),
  }).description('🤖 模型接入'),

  // ==================
  // ☁️ ChatLuna 接入分组
  // ==================
  Schema.object({
    chatlunaModel: Schema.dynamic('model').description(
      '☁️ ChatLuna 模式下使用的默认模型。留空则使用 ChatLuna 配置里的默认模型。',
    ),
    chatlunaModelMap: Schema.dict(Schema.string())
      .role('table')
      .description(
        '🔀 把模板 YAML 里的 <code>model</code> 名映射到 ChatLuna 的 <code>platform/model</code>，例如 <code>gemini-2.5-flash-nothinking: gemini/gemini-2.5-flash</code>。',
      ),
  }).description('☁️ ChatLuna 接入'),

  // ==================
  // 🔐 自定义 API 通道分组
  // ==================
  Schema.object({
    customProviders: Schema.dict(
      Schema.object({
        baseURL: Schema.string().required().description('地址'),
        apiKey: Schema.string()
          .role('secret')
          .required()
          .description('API Key'),
        model: Schema.string().description('模型'),
        apiFormat: Schema.union(
          (Object.keys(API_FORMATS) as ApiFormat[]).map((key) =>
            Schema.const(key).description(API_FORMATS[key]),
          ),
        )
          .role('radio')
          .default('openai')
          .description('格式'),
      }),
      Schema.string().description('通道名'),
    )
      .role('table')
      .description(
        [
          '📋 表头已尽量精简，详细说明见下：',
          '🔌 <b>通道名</b>：对应模板 YAML 里的 <code>model</code> 字段；一个通道可以被多个模板共用。',
          '🌐 <b>地址</b>：可带或不带 <code>/v1</code>，插件会自动补全 <code>/chat/completions</code> 或 <code>/messages</code>。',
          '🔑 <b>API Key</b>：只保存在本地配置中。',
          '🤖 <b>模型</b>：实际请求的模型名，留空则直接使用通道名。',
          `🧩 <b>格式</b>：<code>${API_FORMATS.openai}</code> 走 <code>/v1/chat/completions</code>；<code>${API_FORMATS.anthropic}</code> 走 <code>/v1/messages</code>。`,
          '⚙️ 采样温度、最大 token 数、超时时间与思考等级在「⚙️ 调用参数」分组里统一调整。',
          '🧭 找不到对应通道时使用下方的默认通道；默认通道也留空则取表格第一行。',
        ].join('<br/>'),
      ),
    defaultCustomProvider: Schema.string().description(
      '🪄 找不到匹配 key 时使用的通道名；留空则取表格第一项。',
    ),
  }).description('🔐 自定义 API 通道'),

  // ==================
  // ⚙️ 调用参数分组
  // ==================
  Schema.object({
    temperature: Schema.number()
      .min(0)
      .max(2)
      .step(0.05)
      .default(0.65)
      .description('🌡️ 自定义 API 的默认采样温度（0–2），越高越发散。'),
    maxTokens: Schema.number()
      .min(1)
      .default(5120)
      .description('📏 自定义 API 单次回复的最大 token 数。'),
    timeout: Schema.number()
      .min(1000)
      .default(120000)
      .description('⏱️ 自定义 API 的请求超时时间（毫秒）。'),
    reasoningEffort: Schema.union(
      REASONING_EFFORTS.map((key) =>
        Schema.const(key).description(
          `🧠 ${key}：${REASONING_EFFORT_LABELS[key]}`,
        ),
      ),
    )
      .role('radio')
      .default('auto')
      .description(
        '🧠 思考等级。auto 不发送 reasoning_effort；off 关闭思考；其余为具体强度。Anthropic 通道会映射为 thinking.budget_tokens。',
      ),
    retryWithoutReasoning: Schema.boolean()
      .default(true)
      .description(
        '🔁 输出被截断（finish_reason=length / stop_reason=max_tokens）时，自动关闭思考重试一次。',
      ),
    retryWithMoreTokens: Schema.boolean()
      .default(true)
      .description(
        '📈 关闭思考重试仍失败，或未开启上一项时，把 maxTokens 翻倍重试一次（上限 10240，仅当 maxTokens < 10240 时生效）。',
      ),
    truncateBehavior: Schema.union([
      Schema.const('partial').description('返回最后一次的半截内容。'),
      Schema.const('error').description('直接报错，不返回半截内容。'),
    ])
      .role('radio')
      .default('partial')
      .description(
        '✂️ 文案与汉语新解共用：截断重试后仍然不完整时的处理方式。',
      ),
  }).description('⚙️ 调用参数'),

  // ==================
  // 📂 模板数据分组
  // ==================
  Schema.object({
    presetDir: Schema.string()
      .default('data/copywrite/presets')
      .description('📁 用户模板目录，相对于 Koishi 的 <code>baseDir</code>。'),
    autoRelease: Schema.boolean()
      .default(true)
      .description(
        '📦 启动时把内置模板补齐到用户目录；只补缺失，不覆盖已有文件。',
      ),
    watchPresets: Schema.boolean()
      .default(true)
      .description('👀 监听模板目录，改完 YAML 保存即生效，无需重启。'),
  }).description('📂 模板数据'),

  // ==================
  // 🎨 汉语新解分组
  // ==================
  Schema.object({
    enableNewMeaning: Schema.boolean()
      .default(true)
      .description(
        '🖼️ 是否启用「汉语新解」指令（默认 <code>/汉语新解 调休</code>）。',
      ),
    newMeaningModel: Schema.string().description(
      '🤖 汉语新解使用的模型：ChatLuna 模式填模型名，自定义模式填通道 key；留空则跟随默认。',
    ),
    svgFontFamily: Schema.string()
      .default('Microsoft YaHei')
      .description('🔤 SVG 渲染时的默认字体族，缺字体时自动回退。'),
    svgScale: Schema.number()
      .role('slider')
      .min(0.5)
      .max(4)
      .step(0.5)
      .default(2)
      .description('🔍 SVG 转 PNG 的缩放倍数，越大越清晰、图片也越大。'),
  }).description('🎨 汉语新解'),

  // ==================
  // ⏳ 频率限制分组
  // ==================
  Schema.object({
    cooldown: Schema.number()
      .min(0)
      .max(300)
      .step(5)
      .default(0)
      .description('⏳ 同一用户两次生成之间的冷却时间（秒），0 表示不限制。'),
  }).description('⏳ 频率限制'),

  // ==================
  // 🛡️ 命令权限分组
  // ==================
  Schema.object({
    authority: Schema.object({
      reload: Schema.natural().max(5).default(4).description('🔄 重载模板目录。'),
      reset: Schema.natural()
        .max(5)
        .default(4)
        .description('♻️ 重新释放内置模板（覆盖同名文件）。'),
      clone: Schema.natural()
        .max(5)
        .default(3)
        .description('📄 复制一份模板到用户目录。'),
      rm: Schema.natural().max(5).default(3).description('🗑️ 删除用户目录里的模板。'),
    }).description('🛡️ 各管理命令所需的 Koishi authority 等级（0–5）。'),
  }).description('🛡️ 命令权限'),

  // ==================
  // 🐛 调试分组
  // ==================
  Schema.object({
    verboseLog: Schema.boolean()
      .default(false)
      .description(
        '🐛 在日志里输出完整 prompt、命中的模型通道与耗时。<br><i>内容较长，仅在排查问题时开启。</i>',
      ),
  }).description('🐛 调试'),
]) as unknown as Schema<Config>
