import { Schema } from 'koishi'

export const LLM_MODES = {
  'chatluna-only': '仅 ChatLuna',
  'custom-only': '仅自定义 API',
  'chatluna-first': '先 ChatLuna，不可用时回退自定义 API',
  'custom-first': '先自定义 API，不可用时回退 ChatLuna',
} as const

export type LlmMode = keyof typeof LLM_MODES
export type ApiFormat = 'openai' | 'anthropic'

export interface CustomProvider {
  baseURL: string
  apiKey: string
  /** 实际请求的模型名，留空则使用条目里 config.customProviders 的 key */
  model?: string
  apiFormat: ApiFormat
  temperature: number
  maxTokens: number
  timeout: number
}

export interface AuthorityConfig {
  reload: number
  reset: number
  clone: number
  rm: number
}

export interface Config {
  llmMode: LlmMode

  chatlunaModel: string
  chatlunaModelMap: Record<string, string>

  customProviders: Record<string, CustomProvider>
  defaultCustomProvider: string
  fallbackOnError: boolean

  presetDir: string
  autoRelease: boolean
  watchPresets: boolean

  enableNewMeaning: boolean
  newMeaningModel: string
  svgFontFamily: string
  svgScale: number

  cooldown: number
  authority: AuthorityConfig
}

export const Config = Schema.object({
  llmMode: Schema.union(
    (Object.keys(LLM_MODES) as LlmMode[]).map((key) =>
      Schema.const(key).description(LLM_MODES[key]),
    ),
  )
    .default('chatluna-first')
    .description('接入方式与回退顺序。'),

  chatlunaModel: Schema.dynamic('model')
    .description('ChatLuna 模式下的默认模型，留空则使用 ChatLuna 配置里的默认模型。'),
  chatlunaModelMap: Schema.dict(Schema.string())
    .role('table')
    .description(
      'YAML 里 model 名到 ChatLuna 模型的映射，例如 `gemini-2.5-flash-nothinking: gemini/gemini-2.5-flash`。',
    ),

  customProviders: Schema.dict(
    Schema.object({
      baseURL: Schema.string()
        .required()
        .description('接口地址，可带或不带 `/v1`。'),
      apiKey: Schema.string().role('secret').required().description('API Key。'),
      model: Schema.string().description('实际请求的模型名，留空则使用该条目的 key。'),
      apiFormat: Schema.union([
        Schema.const('openai').description('OpenAI 兼容（/chat/completions）'),
        Schema.const('anthropic').description('Anthropic（/v1/messages）'),
      ])
        .default('openai')
        .description('接口格式。'),
      temperature: Schema.number().min(0).max(2).step(0.05).default(0.65),
      maxTokens: Schema.number().min(1).default(2048),
      timeout: Schema.number().min(1000).default(120000).description('超时时间（毫秒）。'),
    }),
  )
    .role('table')
    .description(
      '自定义 API 通道，key 对应 YAML 里的 model 字段。结构对齐上游的 configs/chatgpt-vision/keys.yaml。',
    ),
  defaultCustomProvider: Schema.string().description(
    '找不到对应 key 时使用的自定义通道名，留空则取 customProviders 的第一个。',
  ),
  fallbackOnError: Schema.boolean()
    .default(false)
    .description('是否在请求报错（而非配置缺失）时也切换到下一条通道。'),

  presetDir: Schema.string()
    .default('data/copywrite/presets')
    .description('用户模板目录，相对于 Koishi 的 baseDir。'),
  autoRelease: Schema.boolean()
    .default(true)
    .description('启动时把内置模板补齐到用户目录（不覆盖已存在的文件）。'),
  watchPresets: Schema.boolean()
    .default(true)
    .description('监听模板目录，改动后自动重载。'),

  enableNewMeaning: Schema.boolean().default(true).description('是否启用「汉语新解」。'),
  newMeaningModel: Schema.string().description(
    '汉语新解使用的模型：ChatLuna 模式填模型名，自定义模式填 customProviders 的 key；留空使用默认。',
  ),
  svgFontFamily: Schema.string()
    .default('Microsoft YaHei')
    .description('SVG 渲染时的默认字体。'),
  svgScale: Schema.number().min(0.5).max(4).default(2).description('SVG 转 PNG 的缩放倍数。'),

  cooldown: Schema.number()
    .min(0)
    .default(0)
    .description('同一用户两次生成之间的冷却时间（秒），0 表示不限制。'),

  authority: Schema.object({
    reload: Schema.natural().max(5).default(4).description('重载模板'),
    reset: Schema.natural().max(5).default(4).description('重新释放内置模板'),
    clone: Schema.natural().max(5).default(3).description('复制模板'),
    rm: Schema.natural().max(5).default(3).description('删除模板'),
  }).description('命令权限等级（Koishi authority，0–5）。'),
}) as unknown as Schema<Config>
