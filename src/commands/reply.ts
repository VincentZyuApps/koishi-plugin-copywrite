import { h, type Context, type Fragment, type Session } from 'koishi'

/**
 * 给任意指令输出加上「引用触发消息」。
 * 没有 messageId 或未开启时原样返回。
 */
export function withQuote(
  session: Session | undefined,
  enabled: boolean,
  content: Fragment,
): Fragment {
  if (!enabled || !session?.messageId) return content
  return [
    h.quote(session.messageId),
    ...(Array.isArray(content) ? content : [content]),
  ]
}

/** 发送等待提示，返回消息 ID（用于稍后撤回） */
export async function sendWaitingHint(
  session: Session | undefined,
  enabled: boolean,
  quote: boolean,
  text: string,
): Promise<string | undefined> {
  if (!enabled || !session) return

  try {
    const [messageId] = await session.send(withQuote(session, quote, text))
    return messageId
  } catch {
    return undefined
  }
}

/** 撤回等待提示；失败时只记 debug 日志，不影响正常回复 */
export async function recallHint(
  ctx: Context,
  session: Session | undefined,
  messageId: string | undefined,
): Promise<void> {
  if (!messageId || !session?.channelId) return
  if (typeof session.bot?.deleteMessage !== 'function') return

  try {
    await session.bot.deleteMessage(session.channelId, messageId)
  } catch (error) {
    ctx
      .logger('copywrite')
      .debug(
        '撤回等待提示失败：%s',
        error instanceof Error ? error.message : String(error),
      )
  }
}
