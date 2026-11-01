/**
 * 指令名归一化：去掉首尾空白，空值回退默认名；
 * 名字里带空格时只取第一段，避免把整句当指令名。
 */
export function normalizeCommandName(
  name: string | undefined,
  fallback: string,
): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return fallback
  return trimmed.split(/\s+/)[0] || fallback
}

/**
 * 复刻 Python 的 `str.split(maxsplit=keywords - 1)`：
 * 最后一个片段整体作为主题，前面的是关键词。
 */
export function splitKeywords(text: string, count: number): string[] {
  const parts: string[] = []
  let rest = text.trim()

  for (let index = 1; index < count; index++) {
    const match = rest.match(/\s+/)
    if (!match || match.index === undefined) break
    parts.push(rest.slice(0, match.index))
    rest = rest.slice(match.index + match[0].length)
  }

  if (rest) parts.push(rest)
  return parts
}

/**
 * 别名归一化：去空白、丢弃空项、去重，并剔除与主指令同名的项。
 */
export function normalizeAliases(
  aliases: unknown,
  mainName: string,
): string[] {
  if (!Array.isArray(aliases)) return []

  const seen = new Set<string>([mainName])
  const result: string[] = []

  for (const item of aliases) {
    if (typeof item !== 'string') continue

    const name = item.trim()
    if (!name || seen.has(name)) continue

    seen.add(name)
    result.push(name)
  }

  return result
}
