import { DEFAULT_COMMAND_NAME } from '../constants'
import type { Config } from '../config'
import type { PatternEntry } from '../types'
import { normalizeCommandName } from './utils'

/** buildHelpText 只需要这两样能力，方便单测注入替身 */
export interface HelpSource {
  readonly size: number
  entries(): PatternEntry[]
}

/**
 * `文案` 与 `文案 --help` 共用的说明文本：
 * 前半部分是实时的模板结构，后半部分是用法。
 */
export function buildHelpText(store: HelpSource, config: Config): string {
  const commandName = normalizeCommandName(
    config.commandName,
    DEFAULT_COMMAND_NAME,
  )
  const entries = store.entries()
  const hasMultiKeyword = entries.some((entry) => entry.keywords > 1)

  const lines: string[] = [`📚 可用文案（共 ${store.size} 条）`]

  if (!entries.length) {
    lines.push('  好像一片空白？')
  } else {
    const byCategory = new Map<string, PatternEntry[]>()

    for (const entry of entries) {
      let list = byCategory.get(entry.category)
      if (!list) byCategory.set(entry.category, (list = []))
      list.push(entry)
    }

    for (const category of [...byCategory.keys()].sort((a, b) =>
      a.localeCompare(b),
    )) {
      const list = byCategory
        .get(category)!
        .sort(
          (a, b) =>
            b.rawName.length - a.rawName.length ||
            a.rawName.localeCompare(b.rawName),
        )
      lines.push(`▸ ${category}`)
      lines.push('  ' + list.map(formatEntry).join(' · '))
    }
  }

  if (hasMultiKeyword) {
    lines.push('')
    lines.push('ℹ️ 括号内数字表示该文案需要的关键词数量，未标注的默认 1 个。')
  }

  lines.push('')
  lines.push('📖 用法')
  lines.push(`  ${commandName} <类型>                     查看该文案的说明`)
  lines.push(`  ${commandName} <类型> <题材>              生成文案`)
  lines.push(
    `  ${commandName} <类型> <关键词...> <题材>    需要多个关键词时按顺序填写`,
  )
  lines.push(
    `  ${commandName} reload                    重新扫描模板目录（权限 ${config.authority.reload}）`,
  )
  lines.push(
    `  ${commandName} reset                     重新释放内置模板（权限 ${config.authority.reset}）`,
  )
  lines.push(
    `  ${commandName} clone <原名> <新名>        复制一份模板（权限 ${config.authority.clone}）`,
  )
  lines.push(
    `  ${commandName} rm <名字>                  删除用户目录里的模板（权限 ${config.authority.rm}）`,
  )
  lines.push('')
  lines.push(
    `💡 直接发送「${commandName}」或「${commandName} --help」都会显示这份说明。`,
  )

  return lines.join('\n')
}

function formatEntry(entry: PatternEntry): string {
  return entry.keywords > 1
    ? `${entry.rawName}(${entry.keywords})`
    : entry.rawName
}
