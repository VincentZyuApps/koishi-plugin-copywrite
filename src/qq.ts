import type { Context, Session } from 'koishi'

import type { Config } from './config'
import { DEFAULT_COMMAND_NAME } from './constants'
import type { PatternStore } from './data'
import { isRecord, type PatternEntry } from './types'
import { normalizeCommandName } from './utils/command'

/** QQ 被动回复有效期（官方 5 分钟，留 2 秒余量） */
const PASSIVE_WINDOW = 5 * 60 * 1000 - 2000

export interface QQMessagePayload {
  msg_type?: number
  content?: string
  markdown?: { content: string }
  keyboard?: { content: QQButtonRows }
  msg_id?: string
  msg_seq?: number
  event_id?: string
  [key: string]: unknown
}

interface QQInternalLike {
  sendMessage?: (target: string, payload: QQMessagePayload) => Promise<unknown>
  sendPrivateMessage?: (
    target: string,
    payload: QQMessagePayload,
  ) => Promise<unknown>
}

export class QQSendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QQSendError'
  }
}

export class QQButtonsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QQButtonsConfigError'
  }
}

/** crack 适配器用 `private:<openid>`，satori 适配器直接用 openid */
export function normalizeQQOpenid(channelId: string): string {
  return channelId.startsWith('private:')
    ? channelId.slice('private:'.length)
    : channelId
}

/** 与两个适配器保持一致：msg_seq 从 1 开始递增，避免撞号 */
export function nextMsgSeq(session: Session): number {
  const holder = session as unknown as { seq?: number }
  holder.seq = (holder.seq ?? 0) + 1
  return holder.seq
}

/** 在 5 分钟窗口内补上 msg_id/msg_seq（或 event_id），让消息走被动回复 */
export function applyPassiveRef<T extends QQMessagePayload>(
  session: Session,
  payload: T,
): T {
  const timestamp = session.timestamp ?? Date.now()
  if (Date.now() - timestamp >= PASSIVE_WINDOW) return payload

  if (session.messageId) {
    payload.msg_id = session.messageId
    payload.msg_seq = nextMsgSeq(session)
    return payload
  }

  const holder = session as unknown as {
    qq?: { id?: unknown }
    event?: { id?: unknown }
  }
  const eventId = holder.qq?.id ?? holder.event?.id
  if (eventId !== undefined && eventId !== null && eventId !== '') {
    payload.event_id = String(eventId)
  }

  return payload
}

/**
 * 直接调用 QQ 原始消息接口，绕开各适配器的消息元素差异。
 * crack 与 satori 都暴露 bot.internal.sendMessage / sendPrivateMessage。
 */
export async function sendQQMessage(
  session: Session,
  payload: QQMessagePayload,
): Promise<void> {
  const finalPayload = applyPassiveRef(session, { ...payload })
  const bot = session.bot as unknown as {
    internal?: QQInternalLike
    parent?: { internal?: QQInternalLike }
  }
  const qq = (session as unknown as { qq?: QQInternalLike }).qq
  const channelId = session.channelId ?? ''

  const senders: Array<() => Promise<unknown>> = []

  const internal = bot?.internal
  const parentInternal = bot?.parent?.internal

  if (session.isDirect) {
    const openid = normalizeQQOpenid(channelId)
    const sendPrivate = internal?.sendPrivateMessage?.bind(internal)
    const sendParentPrivate =
      parentInternal?.sendPrivateMessage?.bind(parentInternal)
    const sendQQPrivate = qq?.sendPrivateMessage?.bind(qq)

    if (sendPrivate) senders.push(() => sendPrivate(openid, finalPayload))
    if (sendParentPrivate) {
      senders.push(() => sendParentPrivate(openid, finalPayload))
    }
    if (sendQQPrivate) senders.push(() => sendQQPrivate(openid, finalPayload))
  } else {
    const sendGroup = internal?.sendMessage?.bind(internal)
    const sendQQGroup = qq?.sendMessage?.bind(qq)

    if (sendGroup) senders.push(() => sendGroup(channelId, finalPayload))
    if (sendQQGroup) senders.push(() => sendQQGroup(channelId, finalPayload))
  }

  if (!senders.length) {
    throw new QQSendError('当前适配器没有可用的 QQ internal 发送接口')
  }

  const reasons: string[] = []
  for (const send of senders) {
    try {
      await send()
      return
    } catch (error) {
      reasons.push(errorMessage(error))
    }
  }

  throw new QQSendError(reasons[reasons.length - 1] || '未知发送错误')
}

/**
 * 在 QQ 官方 Bot 平台发送 Markdown 消息。
 * 优先走 bot.internal（兼容 crack / satori），失败后再尝试 rawmarkdown 元素。
 */
export async function sendQQMarkdown(
  session: Session,
  markdown: string,
): Promise<boolean> {
  try {
    await sendQQMessage(session, {
      msg_type: 2,
      markdown: { content: markdown },
    })
    return true
  } catch {
    // 继续尝试元素发送
  }

  try {
    const { h } = await import('koishi')
    await session.send(h('qq:rawmarkdown', { content: markdown }))
    return true
  } catch {
    return false
  }
}

export const QQ_BUTTONS_HINT = [
  '## 还想来点什么文案？',
  '> 你说的对，但是「文案」是由 [Yan 自主研发的一款nonebot 插件](https://github.com/Yan-Zero/nonebot-plugin-copywrite)……',
].join('\n')

export interface QQButton {
  id: string
  render_data: {
    label: string
    visited_label: string
    style: number
    [key: string]: unknown
  }
  action: {
    type: number
    permission: { type: number; [key: string]: unknown }
    data: string
    enter?: boolean
    reply?: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface QQButtonRow {
  buttons: QQButton[]
}

export interface QQButtonRows {
  rows: QQButtonRow[]
}

export interface QQButtonVariables {
  commandName: string
  randomType?: string
}

/** 默认按钮配置；`${...}` 会在发送前替换成实际值 */
export const DEFAULT_BUTTON_ROWS: QQButtonRows = {
  rows: [
    {
      buttons: [
        {
          id: 'copywrite-help',
          render_data: {
            label: '查看文案',
            visited_label: '查看文案',
            style: 0,
          },
          action: {
            type: 2,
            permission: { type: 2 },
            data: '${commandName}',
            enter: true,
            reply: false,
          },
        },
        {
          id: 'copywrite-retry',
          render_data: {
            label: '再来一条',
            visited_label: '再来一条',
            style: 1,
          },
          action: {
            type: 2,
            permission: { type: 2 },
            data: '${commandName} ${randomType} 请输入你的主题',
            enter: false,
            reply: false,
          },
        },
      ],
    },
  ],
}

/** 把 rows 配置格式化成适合放进 textarea 的紧凑 JSON */
export function stringifyCompact(value: QQButtonRows): string {
  const rows = value.rows
  let result = '{\n  "rows": [\n'

  for (let ri = 0; ri < rows.length; ri++) {
    const buttons = rows[ri].buttons.map(
      (button) => '        ' + JSON.stringify(button),
    )
    result += '    {\n'
    result += '      "buttons": [\n'
    result += buttons.join(',\n')
    result += '\n      ]\n'
    result += '    }' + (ri < rows.length - 1 ? ',' : '') + '\n'
  }

  result += '  ]\n}'
  return result
}

/**
 * 随机挑一个单关键词模板。
 * 多关键词模板填一个主题会提示关键字不足，所以不参与随机。
 */
export function pickRandomType(
  entries: readonly PatternEntry[],
  current?: string,
  random: () => number = Math.random,
): string | undefined {
  const single = entries.filter((entry) => entry.keywords === 1)
  const others = current
    ? single.filter((entry) => entry.name !== current)
    : single
  const pool = others.length ? others : single
  if (!pool.length) return

  const index = Math.min(
    pool.length - 1,
    Math.max(0, Math.floor(random() * pool.length)),
  )
  return pool[index]?.name
}

/**
 * 解析配置里的按钮 JSON。
 * 空串、非法 JSON、结构错误都会抛出 QQButtonsConfigError，不会回退默认值。
 */
export function resolveCopywriteRows(
  template: string,
  vars: QQButtonVariables,
): QQButtonRows {
  const raw = (template ?? '').trim()
  if (!raw) {
    throw new QQButtonsConfigError(
      'qqButtonsJson 为空，请填写按钮 JSON 或恢复默认值',
    )
  }

  const replaced = raw
    .replace(/\$\{commandName\}/g, escapeJsonString(vars.commandName))
    .replace(/\$\{randomType\}/g, escapeJsonString(vars.randomType ?? ''))

  let parsed: unknown
  try {
    parsed = JSON.parse(replaced)
  } catch (error) {
    throw new QQButtonsConfigError(`JSON 解析失败：${errorMessage(error)}`)
  }

  const rows = extractRows(parsed)
  if (!rows) {
    throw new QQButtonsConfigError('缺少 rows 数组（或 content.rows）')
  }

  return { rows: validateRows(rows) }
}

/** 在正文之后追加一条独立的按钮消息；失败时抛错，由调用方提示 */
export async function sendCopywriteButtons(
  session: Session | undefined,
  config: Config,
  store: PatternStore,
  current?: string,
): Promise<void> {
  if (!session || !config.enableQQButtons || session.platform !== 'qq') return

  const commandName = normalizeCommandName(
    config.commandName,
    DEFAULT_COMMAND_NAME,
  )
  const type = pickRandomType(store.entries(), current)
  const rows = resolveCopywriteRows(config.qqButtonsJson, {
    commandName,
    randomType: type,
  })

  await sendQQMessage(session, {
    msg_type: 2,
    markdown: { content: QQ_BUTTONS_HINT },
    keyboard: { content: rows },
  })
}

function extractRows(value: unknown): unknown[] | undefined {
  if (!isRecord(value)) return

  if (Array.isArray(value.rows)) return value.rows
  if (isRecord(value.content) && Array.isArray(value.content.rows)) {
    return value.content.rows
  }

  return
}

function validateRows(rows: unknown[]): QQButtonRow[] {
  if (rows.length < 1 || rows.length > 5) {
    throw new QQButtonsConfigError('rows 数量必须在 1–5 行之间')
  }

  rows.forEach((row, rowIndex) => {
    if (!isRecord(row) || !Array.isArray(row.buttons)) {
      throw new QQButtonsConfigError(
        `第 ${rowIndex + 1} 行缺少 buttons 数组`,
      )
    }
    if (row.buttons.length < 1 || row.buttons.length > 5) {
      throw new QQButtonsConfigError(
        `第 ${rowIndex + 1} 行的按钮数量必须在 1–5 个之间`,
      )
    }

    row.buttons.forEach((button, buttonIndex) => {
      const where = `第 ${rowIndex + 1} 行第 ${buttonIndex + 1} 个按钮`
      if (!isRecord(button)) {
        throw new QQButtonsConfigError(`${where}不是对象`)
      }

      const render = button.render_data
      if (
        !isRecord(render) ||
        typeof render.label !== 'string' ||
        !render.label.trim()
      ) {
        throw new QQButtonsConfigError(`${where}缺少 render_data.label`)
      }
      if (Array.from(render.label).length > 10) {
        throw new QQButtonsConfigError(`${where}的 label 超过 10 个字符`)
      }

      const action = button.action
      if (!isRecord(action) || typeof action.type !== 'number') {
        throw new QQButtonsConfigError(`${where}缺少 action.type`)
      }
      if (
        !isRecord(action.permission) ||
        typeof action.permission.type !== 'number'
      ) {
        throw new QQButtonsConfigError(`${where}缺少 action.permission.type`)
      }
      if (typeof action.data !== 'string') {
        throw new QQButtonsConfigError(`${where}缺少 action.data`)
      }
    })
  })

  return rows as QQButtonRow[]
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
