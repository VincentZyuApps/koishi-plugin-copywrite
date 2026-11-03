import { h, type Context, type Fragment, type Session } from 'koishi'

import type { Config } from '../config'
import { DEFAULT_NEW_MEANING_COMMAND_NAME } from '../constants'
import { LlmRouter } from '../llm'
import { buildNewMeaningMessages } from '../prompts/newmeaning'
import {
  extractSvg,
  listFontFamilies,
  mapSvgFontFamilies,
  svgToPng,
} from '../render'
import { ensureFonts, resolveFontPaths } from '../utils/font'
import { sendReasoningMessage } from '../utils/reasoning'
import { recallHint, sendWaitingHint, withQuote } from '../utils/reply'
import { normalizeAliases, normalizeCommandName } from '../utils/command'

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
    `${commandName} [词:text]`,
    '用一个全新的角度解释汉语词汇',
  )
  if (aliases.length) command.alias(...aliases)

  command.usage(
    [
      '🖼️ 用一个全新的角度解释一个汉语词汇，输出一张 SVG 卡片。',
      `用法：${commandName} 【词】`,
      `示例：${commandName} 调休`,
    ].join('\n'),
  )

  command.action(async ({ session }, word) => {
    const output = await run(session, word)
    return withQuote(session, config.enableQuote, output)
  })

  async function run(
    session: Session | undefined,
    word: string | undefined,
  ): Promise<Fragment> {
    const input = (word ?? '').trim()
    if (!input) return '想解释哪个词？'

    const messages = buildNewMeaningMessages(input)
    if (config.verboseLog) {
      logger.info(
        'verbose prompt: 「汉语新解」 word=%s messages=%d\n%s',
        input,
        messages.length,
        messages
          .map((message) => `[${message.role}]\n${message.content}`)
          .join('\n\n'),
      )
    }

    const hintId = await sendWaitingHint(
      session,
      config.enableWaitingHint,
      config.enableQuote,
      '🎨 正在渲染「汉语新解」卡片，请稍候…',
    )

    let result
    try {
      result = await router.chat(
        { model: config.newMeaningModel || undefined },
        messages,
      )
    } catch (error) {
      await recallHint(ctx, session, hintId)
      return `发生错误: ${error instanceof Error ? error.message : String(error)}`
    }

    await recallHint(ctx, session, hintId)
    await sendReasoningMessage(ctx, session, config, result.reasoning)

    if (config.verboseLog) {
      logger.info(
        'verbose new-meaning: finishReason=%s text=%d reasoning=%d',
        result.finishReason ?? 'unknown',
        result.text.length,
        result.reasoning?.length ?? 0,
      )
    }

    try {
      const svg = extractSvg(result.text)
      if (!svg) {
        if (config.verboseLog) {
          logger.info(
            'verbose new-meaning output:\n%s',
            result.text.slice(0, 4000),
          )
        }
        if (
          result.finishReason === 'length' ||
          result.finishReason === 'max_tokens'
        ) {
          return '模型输出被截断，未生成完整 SVG，请提高 maxTokens 或关闭思考。'
        }
        return '模型没有返回 SVG，请重试或换一个模型。'
      }

      const originalFonts = listFontFamilies(svg)
      const useCustomFont = config.svgEnableCustomFont
      let fontPaths = resolveFontPaths(ctx, config.svgFontPaths)

      if (
        useCustomFont &&
        config.svgAutoDownloadFont &&
        !fontPaths.fontFiles.length &&
        !fontPaths.fontDirs.length
      ) {
        await ensureFonts(ctx)
        fontPaths = resolveFontPaths(ctx, config.svgFontPaths)
      }

      const mappedSvg = useCustomFont
        ? mapSvgFontFamilies(svg, {
            contentFamily: config.svgContentFontFamily,
            titleFamily: config.svgTitleFontFamily,
          })
        : svg

      if (config.verboseLog) {
        logger.info(
          'verbose new-meaning svg: %d 字, fonts=[%s]',
          svg.length,
          originalFonts.join(' | ') || '(未声明)',
        )
        logger.info(
          'verbose new-meaning fonts mapped: [%s]',
          listFontFamilies(mappedSvg).join(' | ') || '(未声明)',
        )
        logger.info(
          'verbose new-meaning fontPaths: files=[%s] dirs=[%s] missing=[%s]',
          fontPaths.fontFiles.join(' | ') || '-',
          fontPaths.fontDirs.join(' | ') || '-',
          fontPaths.missing.join(' | ') || '-',
        )
        logger.info(
          'verbose new-meaning render: fontFamily=%s scale=%s',
          useCustomFont ? config.svgContentFontFamily : config.svgFontFamily,
          config.svgScale,
        )
      }

      const startedAt = Date.now()
      const png = svgToPng(mappedSvg, {
        fontFamily: useCustomFont
          ? config.svgContentFontFamily
          : config.svgFontFamily,
        fontFiles: useCustomFont ? fontPaths.fontFiles : [],
        fontDirs: useCustomFont ? fontPaths.fontDirs : [],
        scale: config.svgScale,
      })

      if (config.verboseLog) {
        logger.info(
          'verbose new-meaning render done: %dms, %d bytes',
          Date.now() - startedAt,
          png.length,
        )
      }

      return h.image(png, 'image/png')
    } catch (error) {
      return `发生错误: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
