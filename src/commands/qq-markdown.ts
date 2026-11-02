import { h, type Session } from 'koishi'

interface QQMarkdownPayload {
  msg_type: 2
  content: string
  markdown: { content: string }
  msg_id?: string
  msg_seq?: number
}

/**
 * 在 QQ 官方 Bot 平台发送 Markdown 消息。
 * 参考 sky-renwu-weibo 的实现：优先 session.qq，其次 bot.internal。
 */
export async function sendQQMarkdown(
  session: Session,
  markdown: string,
  quote: boolean,
): Promise<boolean> {
  const payload: QQMarkdownPayload = {
    msg_type: 2,
    content: '思考过程',
    markdown: { content: markdown },
  }

  if (quote && session.messageId) {
    const now = Date.now()
    const timestamp = session.timestamp ?? now
    if (now - timestamp < 5 * 60 * 1000) {
      payload.msg_id = session.messageId
      payload.msg_seq = Math.floor(Math.random() * 0xffffff) + 1
    }
  }

  const qq = (session as unknown as { qq?: any }).qq
  try {
    if (qq?.sendPrivateMessage && session.isDirect) {
      await qq.sendPrivateMessage(session.channelId, payload)
      return true
    }
    if (qq?.sendMessage) {
      await qq.sendMessage(session.channelId, payload)
      return true
    }

    const internal = (session.bot as any)?.internal
    if (typeof internal?.sendMessage === 'function') {
      await internal.sendMessage(session.channelId, payload)
      return true
    }
  } catch {
    return false
  }

  try {
    await session.send(h('qq:rawmarkdown', { content: markdown }))
    return true
  } catch {
    return false
  }
}
