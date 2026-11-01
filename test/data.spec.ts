import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadPresetDir, parsePresetYaml } from '../src/data'

const RESOURCES = fileURLToPath(new URL('../resources/presets', import.meta.url))

describe('parsePresetYaml', () => {
  it('读取分类并规范化字段', () => {
    const parsed = parsePresetYaml(
      [
        '__category__: Yan',
        '演示:',
        '  examples:',
        '    - 第一段',
        '    - |',
        '      第二段',
        '      第三段',
        '  addition: 主题是 {}',
        '  model: gemini-2.5-flash-nothinking',
        '  help: 说明',
      ].join('\n'),
      '/tmp/demo.yaml',
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.category).toBe('Yan')
    expect(parsed.patterns).toHaveLength(1)
    expect(parsed.patterns[0]).toMatchObject({
      rawName: '演示',
      name: '演示',
      category: 'Yan',
      examples: ['第一段', '第二段\n第三段\n'],
      addition: '主题是 {}',
      model: 'gemini-2.5-flash-nothinking',
      keywords: 1,
      help: '说明',
    })
  })

  it('缺少 examples 的条目会被跳过而不是整份失败', () => {
    const parsed = parsePresetYaml(
      ['__category__: Yan', '坏的:', '  model: gpt-4o-mini', '好的:', '  examples:', '    - ok'].join('\n'),
      '/tmp/demo.yaml',
    )

    expect(parsed.patterns.map((pattern) => pattern.name)).toEqual(['好的'])
    expect(parsed.errors).toHaveLength(1)
  })

  it('非对象文件与坏 YAML 都不会抛异常', () => {
    expect(parsePresetYaml('- a\n- b', '/tmp/x.yaml').errors).toHaveLength(1)
    expect(parsePresetYaml('a: [1, 2', '/tmp/x.yaml').errors).toHaveLength(1)
  })
})

describe('内置模板', () => {
  it('7 个文件、34 条模板、5 个分类', async () => {
    const result = await loadPresetDir(RESOURCES)

    expect(result.files).toHaveLength(7)
    expect(result.patterns.size).toBe(34)
    expect([...result.categories.keys()].sort()).toEqual([
      'Fran',
      'Life.Checkpoint',
      'SU Joke',
      'VincentZyu',
      'Yan',
    ])
  })

  it('内置模板本身没有解析错误', async () => {
    const result = await loadPresetDir(RESOURCES)
    expect(result.errors).toEqual([])
  })

  it('做好咯 保留了完整的示例', async () => {
    const result = await loadPresetDir(RESOURCES)
    const entry = result.patterns.get('做好咯')

    expect(entry).toBeDefined()
    expect(entry!.examples).toHaveLength(5)
    expect(entry!.examples[0]).toContain('DANK1NG')
    expect(entry!.keywords).toBe(1)
  })
})
