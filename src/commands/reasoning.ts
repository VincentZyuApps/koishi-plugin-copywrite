import type { Context, Session } from 'koishi'

import type { Config } from '../config'
import { sendQQMarkdown } from './qq-markdown'
import { withQuote } from './reply'
import { formatReasoningMessage, toBlockquote } from './reasoning-format'

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
  if (!config.sendReasoning || !session) return

  const text = (reasoning ?? '').trim()
  if (!text) return

  const content = formatReasoningMessage(text, config.reasoningMaxChars)

  if (config.enableReasoningViaQQMarkdown && session.platform === 'qq') {
    const sent = await sendQQMarkdown(
      session,
      toBlockquote(content),
      config.enableQuote,
    )
    if (sent) return
  }

  try {
    await session.send(withQuote(session, config.enableQuote, content))
  } catch (error) {
    ctx
      .logger('copywrite')
      .debug(
        '发送思考消息失败：%s',
        error instanceof Error ? error.message : String(error),
      )
  }
}
