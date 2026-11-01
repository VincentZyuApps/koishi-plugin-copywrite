import { h, type Context } from 'koishi'

import type { Config } from '../config'
import { LlmRouter } from '../llm'
import { buildNewMeaningMessages } from '../prompts/new-meaning'
import { extractSvg, svgToPng } from '../render'

export function registerNewMeaning(
  ctx: Context,
  config: Config,
  router: LlmRouter,
): void {
  if (!config.enableNewMeaning) return

  ctx
    .command('new-meaning <word:text>', '用一个全新的角度解释汉语词汇')
    .alias('汉语新解')
    .action(async (_, word) => {
      const input = (word ?? '').trim()
      if (!input) return '想解释哪个词？'

      try {
        const result = await router.chat(
          { model: config.newMeaningModel || undefined },
          buildNewMeaningMessages(input),
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
