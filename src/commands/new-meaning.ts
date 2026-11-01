import { h, type Context } from 'koishi'

import type { Config } from '../config'
import { DEFAULT_NEW_MEANING_COMMAND_NAME } from '../constants'
import { LlmRouter } from '../llm'
import { buildNewMeaningMessages } from '../prompts/new-meaning'
import { extractSvg, svgToPng } from '../render'
import { normalizeAliases, normalizeCommandName } from './utils'

export function registerNewMeaning(
  ctx: Context,
  config: Config,
  router: LlmRouter,
): void {
  if (!config.enableNewMeaning) return

  const commandName = normalizeCommandName(
    config.newMeaningCommandName,
    DEFAULT_NEW_MEANING_COMMAND_NAME,
  )
  const aliases = normalizeAliases(config.newMeaningAliases, commandName)
  const logger = ctx.logger('copywrite')

  const command = ctx.command(
    `${commandName} <word:text>`,
    '用一个全新的角度解释汉语词汇',
  )
  if (aliases.length) command.alias(...aliases)

  command.usage(
    [
      '🖼️ 用一个全新的角度解释一个汉语词汇，输出一张 SVG 卡片。',
      `用法：${commandName} <词>`,
      `示例：${commandName} 调休`,
    ].join('\n'),
  )

  command.action(async (_, word) => {
    const input = (word ?? '').trim()
    if (!input) return '想解释哪个词？'

    const messages = buildNewMeaningMessages(input)
    if (config.verboseLog) {
      logger.info(
        'verbose prompt: 「汉语新解」 word=%s messages=%d\n%s',
        input,
        messages.length,
        messages.map((message) => `[${message.role}]\n${message.content}`).join('\n\n'),
      )
    }

    try {
      const result = await router.chat(
        { model: config.newMeaningModel || undefined },
        messages,
      )

      const svg = extractSvg(result.text)
      if (!svg) {
        return '模型没有返回 SVG，请重试或换一个模型。'
      }

      const png = svgToPng(svg, {
        fontFamily: config.svgFontFamily,
        scale: config.svgScale,
      })

      return h.image(png, 'image/png')
    } catch (error) {
      return `发生错误: ${error instanceof Error ? error.message : String(error)}`
    }
  })
}
