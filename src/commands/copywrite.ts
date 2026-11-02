import path from 'node:path'

import type { Context, Fragment, Session } from 'koishi'

import type { Config } from '../config'
import {
  DEFAULT_COMMAND_DESCRIPTION,
  DEFAULT_COMMAND_NAME,
} from '../constants'
import {
  removePatternFile,
  writePatternFile,
  type PatternStore,
} from '../data'
import { LlmRouter } from '../llm'
import { generateCopywrite } from '../prompt'
import { resetPresets } from '../resources'
import { buildOverviewText } from './help'
import { sendReasoningMessage } from './reasoning'
import { recallHint, sendWaitingHint, withQuote } from './reply'
import {
  normalizeAliases,
  normalizeCommandName,
  splitKeywords,
} from './utils'

const RESERVED = new Set(['reload', 'reset', 'clone', 'rm', 'remove', 'delete'])

export function registerCopywrite(
  ctx: Context,
  config: Config,
  store: PatternStore,
  router: LlmRouter,
): void {
  const cooldowns = new Map<string, number>()
  const commandName = normalizeCommandName(config.commandName, DEFAULT_COMMAND_NAME)
  const aliases = normalizeAliases(config.commandAliases, commandName)
  const logger = ctx.logger('copywrite')

  const command = ctx.command(
    `${commandName} [类型:string] [题材:text]`,
    DEFAULT_COMMAND_DESCRIPTION,
  )
  if (aliases.length) command.alias(...aliases)

  // 不设置 command.usage：--help 只保留 Koishi 原生的语法与选项提示，
  // 模板列表与用法由裸指令单独发送。

  command.action(async ({ session }, type, topicText) => {
    const output = await run(session, type, topicText)
    return withQuote(session, config.enableQuote, output)
  })

  async function run(
    session: Session | undefined,
    type: string | undefined,
    topicText: string | undefined,
  ): Promise<Fragment> {
    const rawType = (type ?? '').trim()
    const rest = (topicText ?? '').trim()

    if (!rawType) {
      // 注意不要用 session.execute('--help')：它默认会自己发送结果，
      // 外层再拼引用就会变成「一条纯文本 + 一条只有引用的消息」。
      return buildOverviewText(command, aliases, store, config)
    }

    const name = rawType.toLowerCase()

    if (RESERVED.has(name)) {
      return handleReserved(ctx, config, store, session, name, rest)
    }

    const entry = store.get(name)
    if (!entry) {
      return `没有找到该文案。发送「${commandName}」查看全部类型。`
    }

    if (!rest) return entry.help || '主题呢？'

    const parts = splitKeywords(rest, entry.keywords)
    if (parts.length < entry.keywords) {
      const hint = `需要有${entry.keywords - parts.length}个关键词。`
      return entry.help ? `${hint}\n\n${entry.help}` : hint
    }

    const topic = parts[parts.length - 1]
    const keywords = parts.slice(0, -1)

    const cooldown = checkCooldown(session, config.cooldown, cooldowns)
    if (!cooldown.ok) {
      return `冷却中，请 ${cooldown.remaining} 秒后再试。`
    }

    const prompt = generateCopywrite(entry, topic, keywords)
    if (config.verboseLog) {
      logger.info(
        'verbose prompt: 「%s」 topic=%s keywords=[%s]\n%s',
        entry.rawName,
        topic,
        keywords.join(', '),
        prompt,
      )
    }

    const hintId = await sendWaitingHint(
      session,
      config.enableWaitingHint,
      config.enableQuote,
      '⏳ 正在生成文案，请稍候…',
    )

    let result
    try {
      result = await router.chat(entry, [{ role: 'user', content: prompt }])
    } catch (error) {
      await recallHint(ctx, session, hintId)
      return `发生错误: ${errorMessage(error)}`
    }

    await recallHint(ctx, session, hintId)
    await sendReasoningMessage(ctx, session, config, result.reasoning)
    return result.text
  }
}

async function handleReserved(
  ctx: Context,
  config: Config,
  store: PatternStore,
  session: Session | undefined,
  name: string,
  rest: string,
): Promise<string> {
  switch (name) {
    case 'reload': {
      if (!(await hasAuthority(ctx, session, config.authority.reload))) {
        return '没有权限哦。'
      }
      return (await store.reload())
        ? '重新加载完成。'
        : `重新加载完成。（共 ${store.size} 条模板）`
    }

    case 'reset': {
      if (!(await hasAuthority(ctx, session, config.authority.reset))) {
        return '没有权限哦。'
      }
      const result = await resetPresets(ctx.baseDir, config)
      if (!result.writable) {
        return `重新释放失败：${result.error ?? '目录不可写'}`
      }
      await store.reload(result.dir)
      return `已重新释放 ${result.copied.length} 个内置模板。`
    }

    case 'clone': {
      if (!(await hasAuthority(ctx, session, config.authority.clone))) {
        return '没有权限哦。'
      }
      return clone(ctx, store, rest)
    }

    case 'rm':
    case 'remove':
    case 'delete': {
      if (!(await hasAuthority(ctx, session, config.authority.rm))) {
        return '没有权限哦。'
      }
      return remove(store, session, rest)
    }

    default:
      return '没有找到该文案'
  }
}

async function clone(
  ctx: Context,
  store: PatternStore,
  rest: string,
): Promise<string> {
  const [originName, newName] = rest.split(/\s+/)

  if (!originName || !newName) {
    return '用法：/文案 clone <原名> <新名>'
  }

  const origin = store.get(originName)
  if (!origin) return '没有找到该文案'
  if (store.get(newName)) return `「${newName}」已存在`
  if (isReadonly(store)) return '当前为只读模式，无法写入模板。'

  try {
    await writePatternFile(store.presetDir, newName, origin)
    await store.reload()
    return `已复制为「${newName}」，可以在 ${store.presetDir} 下继续编辑。`
  } catch (error) {
    ctx.logger('copywrite').warn('复制模板失败：%s', errorMessage(error))
    return `复制失败：${errorMessage(error)}`
  }
}

async function remove(
  store: PatternStore,
  session: Session | undefined,
  rest: string,
): Promise<string> {
  const name = rest.split(/\s+/)[0]
  if (!name) return '用法：/文案 rm <名字>'

  const entry = store.get(name)
  if (!entry) return '没有找到该文案'
  if (isReadonly(store)) return '当前为只读模式，无法删除模板。'

  const confirmed = await confirm(session, `回复 Y 确认删除「${entry.rawName}」`)
  if (confirmed === null) return '已取消。'
  if (!confirmed) return '已取消。'

  try {
    const result = await removePatternFile(entry, store.presetDir)
    await store.reload()
    return result === 'deleted'
      ? `已删除「${entry.rawName}」。`
      : `已从文件中移除「${entry.rawName}」。`
  } catch (error) {
    return `删除失败：${errorMessage(error)}`
  }
}

async function confirm(
  session: Session | undefined,
  hint: string,
): Promise<boolean | null> {
  if (!session?.prompt) return true

  await session.send(hint)
  const answer = await session.prompt(30_000)
  if (!answer) return null

  return answer.trim().toUpperCase() === 'Y'
}

async function hasAuthority(
  ctx: Context,
  session: Session | undefined,
  level: number,
): Promise<boolean> {
  if (level <= 0) return true
  if (!session) return false

  try {
    await (
      session as unknown as { observeUser?: (fields: string[]) => Promise<void> }
    ).observeUser?.(['authority'])
    return await ctx.permissions.test(`authority:${level}`, session)
  } catch {
    const user = session.user as unknown as { authority?: number } | undefined
    return (user?.authority ?? 0) >= level
  }
}

function isReadonly(store: PatternStore): boolean {
  return path.resolve(store.activeDir) !== path.resolve(store.presetDir)
}

function checkCooldown(
  session: Session | undefined,
  seconds: number,
  cache: Map<string, number>,
): { ok: boolean; remaining: number } {
  if (!seconds || seconds <= 0 || !session) return { ok: true, remaining: 0 }

  const key = `${session.platform ?? ''}:${session.userId ?? ''}`
  const now = Date.now()
  const until = cache.get(key) ?? 0

  if (until > now) {
    return { ok: false, remaining: Math.ceil((until - now) / 1000) }
  }

  cache.set(key, now + seconds * 1000)

  if (cache.size > 1000) {
    for (const [item, expires] of cache) {
      if (expires <= now) cache.delete(item)
    }
  }

  return { ok: true, remaining: 0 }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
