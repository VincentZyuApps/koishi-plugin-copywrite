import { describe, expect, it } from 'vitest'

import type { Config } from '../src/config'
import {
  buildHelpText,
  displayWidth,
  formatUsageRows,
} from '../src/commands/help'
import type { PatternEntry } from '../src/types'

function entry(
  rawName: string,
  category: string,
  keywords = 1,
): PatternEntry {
  return {
    rawName,
    name: rawName.toLowerCase(),
    category,
    source: `/tmp/${category}.yaml`,
    examples: ['example'],
    model: 'gpt-4o-mini',
    addition: '',
    keywords,
  }
}

function source(entries: PatternEntry[]) {
  return {
    size: entries.length,
    entries: () => entries,
  }
}

const config = {
  commandName: 'copywrite',
  authority: { reload: 4, reset: 4, clone: 3, rm: 3 },
} as Config

describe('displayWidth', () => {
  it('ASCII 算 1，中文与全角符号算 2', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('类型')).toBe(4)
    expect(displayWidth('【类型】')).toBe(8)
  })
})

describe('formatUsageRows', () => {
  it('描述文本从同一列开始', () => {
    const specs: Array<[string, string]> = [
      ['copywrite 【类型】', 'a'],
      ['copywrite 【类型】 【题材】', 'b'],
      ['copywrite reload', 'c'],
    ]
    const rows = formatUsageRows(specs)
    const expected = Math.max(...specs.map(([syntax]) => displayWidth(syntax))) + 2

    rows.forEach((row, index) => {
      const desc = specs[index][1]
      const prefix = row.slice(0, row.length - desc.length)

      expect(prefix.startsWith('  ')).toBe(true)
      expect(displayWidth(prefix)).toBe(2 + expected)
    })
  })
})

describe('buildHelpText', () => {
  it('按分类列出模板并带上总数', () => {
    const text = buildHelpText(
      source([
        entry('做好咯', 'VincentZyu'),
        entry('鸣潮', 'Yan'),
        entry('PUA', 'Yan'),
      ]),
      config,
    )

    expect(text).toContain('📚 可用文案（共 3 条）')
    expect(text).toContain('▸ VincentZyu')
    expect(text).toContain('▸ Yan')
    expect(text).toContain('做好咯')
    expect(text).toContain('PUA')
  })

  it('多关键词模板会标注数量', () => {
    const text = buildHelpText(
      source([entry('多词模板', 'Custom', 2), entry('单词模板', 'Custom')]),
      config,
    )

    expect(text).toContain('多词模板(2)')
    expect(text).toContain('单词模板')
    expect(text).toContain('括号内数字表示该文案需要的关键词数量')
  })

  it('用法行使用配置里的指令名与权限', () => {
    const text = buildHelpText(source([]), {
      ...config,
      commandName: '模仿文案',
      authority: { reload: 5, reset: 5, clone: 2, rm: 2 },
    } as Config)

    expect(text).toContain('模仿文案 【类型】 【题材】')
    expect(text).toContain('权限 5')
    expect(text).toContain('权限 2')
    expect(text).toContain('好像一片空白？')
  })

  it('输出里不再出现尖括号，避免被消息解析吃掉', () => {
    const text = buildHelpText(source([entry('做好咯', 'VincentZyu')]), config)
    expect(text).not.toContain('<')
    expect(text).not.toContain('>')
  })
})
