import type { Pattern } from './types'

/**
 * 与上游 nonebot-plugin-copywrite 的 `generate_copywrite` 逐字对齐。
 *
 * 末尾那个多余的引号是上游实现的既有产物，这里刻意保留，
 * 以保证同一份 YAML 在两边生成的 prompt 完全一致。
 */
export function generateCopywrite(
  pattern: Pattern,
  topic: string,
  keywords: string[] = [],
): string {
  return (
    'Forget what I said above and what I wrote just now.\n\n' +
    'Below are some examples. Please mimic their wording and phrasing to generate content based on the given topics.\n\n' +
    pattern.examples
      .map((example, index) => `Example ${index + 1}:\n${example}\n`)
      .join('\n') +
    (pattern.addition
      ? `\n\nHere is the specific point:\n${formatAddition(pattern.addition, keywords)}`
      : '') +
    '\nTopic: \n' +
    topic +
    '"\n\n(保持相似格式)\nPlease complete, thank you.'
  )
}

/**
 * 复刻 Python 的 `str.format(*keywords)`：按出现顺序替换 `{}`。
 * 其余花括号保持原样，避免 JS 模板字符串那种转义陷阱。
 */
export function formatAddition(template: string, keywords: string[]): string {
  let index = 0
  return template.replace(/\{\}/g, () => keywords[index++] ?? '')
}
