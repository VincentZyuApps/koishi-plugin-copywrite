import type { Context, Session } from 'koishi'

import type { Config } from '../config'
import { sendQQMarkdown } from '../qq'
import { withQuote } from './reply'

/**
 * 把过长的思考文本截断：保留开头 80% 与结尾 20%，中间用「省略 N 字」代替。
 * 纯函数，不依赖 koishi，方便单测。
 */
export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  let omitted = text.length
  let head = 0
  let tail = 0
  let marker = ''

  for (let index = 0; index < 4; index++) {
    marker = `……（省略 ${omitted} 字）……`
    const available = Math.max(0, maxChars - marker.length - 4)
    head = Math.floor(available * 0.8)
    tail = available - head

    const next = text.length - head - tail
    if (next <= 0 || next === omitted) break
    omitted = next
  }

  const headText = head > 0 ? text.slice(0, head) : ''
  const tailText = tail > 0 ? text.slice(text.length - tail) : ''
  return `${headText}\n\n${marker}\n\n${tailText}`
}

/** 思考消息的最终文本（带前缀） */
export function formatReasoningMessage(
  text: string,
  maxChars: number,
): string {
  return `🧠 思考过程\n\n${truncateMiddle(text.trim(), maxChars)}`
}

/** 把普通文本转成 QQ Markdown 引用块（逐行 > xxx） */
export function toBlockquote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.length ? `> ${line}` : '>'))
    .join('\n')
}

/**
 * 在正文之前单独发送思考消息。
 * 失败时只记 debug 日志，绝不影响正文。
 */
export async function sendReasoningMessage(
  ctx: Context,
  session: Session | undefined,
  config: Config,
  reasoning: string | undefined,
): Promise<void> {
  const logger = ctx.logger('copywrite')
  if (!session) {
    if (config.verboseLog) logger.info('verbose reasoning skipped: no session')
    return
  }

  const selfId =
    (session as unknown as { selfId?: string }).selfId ??
    (session.bot as unknown as { selfId?: string })?.selfId ??
    '(unknown)'

  if (config.verboseLog) {
    logger.info(
      'verbose reasoning: platform=%s selfId=%s channel=%s enabled=%s length=%d',
      session.platform,
      selfId,
      session.channelId,
      config.sendReasoning,
      reasoning?.length ?? 0,
    )
  }

  if (!config.sendReasoning) return

  const text = (reasoning ?? '').trim()
  if (!text) {
    if (config.verboseLog) logger.info('verbose reasoning skipped: empty')
    return
  }

  const content = formatReasoningMessage(text, config.reasoningMaxChars)

  if (config.enableReasoningViaQQMarkdown && session.platform === 'qq') {
    const sent = await sendQQMarkdown(session, toBlockquote(content))
    if (config.verboseLog) {
      logger.info('verbose reasoning qq markdown: sent=%s', sent)
    }
    if (sent) return
  }

  try {
    await session.send(withQuote(session, config.enableQuote, content))
    if (config.verboseLog) logger.info('verbose reasoning sent: plain')
  } catch (error) {
    logger.warn(
      '发送思考消息失败：%s',
      error instanceof Error ? error.message : String(error),
    )
  }
}
