import { createHash } from 'node:crypto'
import { promises as fs, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'

import { dump, load } from 'js-yaml'
import type { Context } from 'koishi'

import type { Config } from './config'
import {
  ensurePresets,
  listYamlFiles,
  resolvePresetDir,
  type ReleaseResult,
} from './resources'
import { isRecord, type Pattern, type PatternEntry } from './types'

export interface ParsedFile {
  category: string
  patterns: PatternEntry[]
  errors: string[]
}

export interface LoadResult {
  dir: string
  files: string[]
  patterns: Map<string, PatternEntry>
  categories: Map<string, Set<string>>
  errors: string[]
  signature: string
}

const DEFAULT_MODEL = 'gpt-4o-mini'

export function parsePresetYaml(text: string, source: string): ParsedFile {
  let doc: unknown
  try {
    doc = load(text)
  } catch (error) {
    return {
      category: '',
      patterns: [],
      errors: [`${path.basename(source)}: YAML 解析失败：${errorMessage(error)}`],
    }
  }

  if (!isRecord(doc)) {
    return {
      category: '',
      patterns: [],
      errors: [`${path.basename(source)}: 顶层内容不是一个对象`],
    }
  }

  const rawCategory = doc.__category__
  const category =
    typeof rawCategory === 'string' && rawCategory.trim()
      ? rawCategory.trim()
      : 'Default'

  // 上游 0.3.2 起支持文件级的 __model__，作为该文件内所有条目的默认模型。
  const rawModel = doc.__model__
  const defaultModel =
    typeof rawModel === 'string' && rawModel.trim()
      ? rawModel.trim()
      : DEFAULT_MODEL

  const patterns: PatternEntry[] = []
  const errors: string[] = []

  for (const [rawName, raw] of Object.entries(doc)) {
    if (rawName === '__category__' || rawName === '__model__') continue

    const name = rawName.trim().toLowerCase()
    if (!name) {
      errors.push(`${path.basename(source)}: 存在空模板名`)
      continue
    }

    const pattern = normalizePattern(
      raw,
      rawName.trim(),
      name,
      category,
      source,
      defaultModel,
    )
    if (!pattern) {
      errors.push(`${path.basename(source)}: 「${rawName}」缺少有效的 examples，已跳过`)
      continue
    }

    patterns.push(pattern)
  }

  return { category, patterns, errors }
}

function normalizePattern(
  raw: unknown,
  rawName: string,
  name: string,
  category: string,
  source: string,
  defaultModel = DEFAULT_MODEL,
): PatternEntry | null {
  if (!isRecord(raw)) return null

  const examples = toStringArray(raw.examples)
  if (!examples.length) return null

  const model =
    typeof raw.model === 'string' && raw.model.trim()
      ? raw.model.trim()
      : defaultModel

  const addition = typeof raw.addition === 'string' ? raw.addition : ''
  const keywords =
    typeof raw.keywords === 'number' &&
    Number.isInteger(raw.keywords) &&
    raw.keywords > 0
      ? raw.keywords
      : 1
  const help = typeof raw.help === 'string' ? raw.help : undefined

  return {
    rawName,
    name,
    category,
    source,
    examples,
    model,
    addition,
    keywords,
    help,
  }
}

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : []
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  )
}

export async function loadPresetDir(dir: string): Promise<LoadResult> {
  const files = await listYamlFiles(dir).catch(() => [] as string[])
  const patterns = new Map<string, PatternEntry>()
  const categories = new Map<string, Set<string>>()
  const errors: string[] = []
  const hash = createHash('sha256')

  for (const file of files) {
    const source = path.join(dir, file)
    let text: string

    try {
      text = await fs.readFile(source, 'utf-8')
    } catch (error) {
      errors.push(`${file}: 读取失败：${errorMessage(error)}`)
      continue
    }

    hash.update(file).update('\0').update(text).update('\0')

    const parsed = parsePresetYaml(text, source)
    errors.push(...parsed.errors)

    for (const pattern of parsed.patterns) {
      const previous = patterns.get(pattern.name)
      if (previous && previous.source !== source) {
        errors.push(
          `「${pattern.rawName}」在 ${path.basename(previous.source)} 与 ${file} 中重复，后者覆盖`,
        )
      }
      patterns.set(pattern.name, pattern)

      let set = categories.get(pattern.category)
      if (!set) {
        set = new Set()
        categories.set(pattern.category, set)
      }
      set.add(pattern.name)
    }
  }

  return {
    dir,
    files,
    patterns,
    categories,
    errors,
    signature: hash.digest('hex'),
  }
}

export class PatternStore {
  private patterns = new Map<string, PatternEntry>()
  private categories = new Map<string, Set<string>>()
  private errors: string[] = []
  private signature = ''
  private dir = ''
  private watcher?: FSWatcher
  private timer?: ReturnType<typeof setTimeout>
  private readonly aborter = new AbortController()
  private readonly logger

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {
    this.logger = ctx.logger('copywrite')
  }

  get presetDir(): string {
    return resolvePresetDir(this.ctx.baseDir, this.config)
  }

  get activeDir(): string {
    return this.dir || this.presetDir
  }

  get size(): number {
    return this.patterns.size
  }

  get lastErrors(): string[] {
    return [...this.errors]
  }

  async start(): Promise<ReleaseResult> {
    const release = await ensurePresets(this.ctx.baseDir, this.config)

    if (!release.writable) {
      this.logger.warn(
        '模板目录不可写（%s），已回退为直接读取内置模板。',
        release.error,
      )
    } else if (release.copied.length) {
      this.logger.debug('已释放内置模板：%s', release.copied.join(', '))
    }

    await this.reload(release.dir)
    this.watch(release.dir)
    return release
  }

  get(name: string): PatternEntry | undefined {
    return this.patterns.get(name.trim().toLowerCase())
  }

  entries(): PatternEntry[] {
    return [...this.patterns.values()]
  }

  groups(): Array<{ category: string; keys: string[] }> {
    return [...this.categories.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, keys]) => ({
        category,
        keys: [...keys].sort(
          (a, b) => b.length - a.length || a.localeCompare(b),
        ),
      }))
  }

  async reload(dir?: string): Promise<boolean> {
    const target = dir ?? this.activeDir
    const result = await loadPresetDir(target)

    if (target === this.dir && result.signature === this.signature) return false

    this.dir = target
    this.signature = result.signature
    this.patterns = result.patterns
    this.categories = result.categories
    this.errors = result.errors

    for (const error of result.errors) this.logger.warn(error)
    this.logger.debug(
      '已加载 %d 条模板（%d 个文件），来自 %s',
      this.patterns.size,
      result.files.length,
      target,
    )

    return true
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.aborter.abort()
    this.watcher?.close()
    this.watcher = undefined
  }

  private watch(dir: string): void {
    if (!this.config.watchPresets) return

    try {
      this.watcher = watch(dir, { signal: this.aborter.signal }, (_, filename) => {
        if (filename) {
          const ext = path.extname(String(filename)).toLowerCase()
          if (ext !== '.yaml' && ext !== '.yml') return
        }
        this.schedule()
      })
      this.watcher.on('error', (error) => {
        this.logger.warn('模板目录监听异常：%s', errorMessage(error))
      })
    } catch (error) {
      this.logger.warn('无法监听模板目录：%s', errorMessage(error))
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.reload().catch((error) => {
        this.logger.warn('重载模板失败：%s', errorMessage(error))
      })
    }, 150)
  }
}

export async function writePatternFile(
  dir: string,
  name: string,
  pattern: Pattern,
  category = 'Custom',
): Promise<string> {
  const file = path.join(dir, `${safeFileName(name)}.yaml`)
  const doc: Record<string, unknown> = {
    __category__: category,
    [name]: toRawPattern(pattern),
  }

  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(file, dump(doc, { lineWidth: -1, noRefs: true }), 'utf-8')
  return file
}

export async function removePatternFile(
  entry: PatternEntry,
  presetDir: string,
): Promise<'deleted' | 'rewritten'> {
  const source = path.resolve(entry.source)
  const root = path.resolve(presetDir)

  if (source !== root && !source.startsWith(root + path.sep)) {
    throw new Error('只能删除用户目录下的模板文件')
  }

  const doc = load(await fs.readFile(source, 'utf-8'))
  if (!isRecord(doc) || !(entry.rawName in doc)) {
    throw new Error('模板文件里找不到该条目')
  }

  delete doc[entry.rawName]

  const remaining = Object.keys(doc).filter((key) => key !== '__category__')
  if (!remaining.length) {
    await fs.rm(source)
    return 'deleted'
  }

  await fs.writeFile(source, dump(doc, { lineWidth: -1, noRefs: true }), 'utf-8')
  return 'rewritten'
}

function toRawPattern(pattern: Pattern): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    examples: pattern.examples,
    model: pattern.model,
  }
  if (pattern.addition) raw.addition = pattern.addition
  if (pattern.keywords !== 1) raw.keywords = pattern.keywords
  if (pattern.help) raw.help = pattern.help
  return raw
}

export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
  return cleaned || 'copywrite'
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
