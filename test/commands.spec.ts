import { describe, expect, it } from 'vitest'

import { normalizeAliases, normalizeCommandName } from '../src/commands/utils'

describe('normalizeCommandName', () => {
  it('空值回退默认值', () => {
    expect(normalizeCommandName('', 'copywrite')).toBe('copywrite')
    expect(normalizeCommandName(undefined, 'copywrite')).toBe('copywrite')
    expect(normalizeCommandName('   ', 'copywrite')).toBe('copywrite')
  })

  it('去空白，带空格时只取第一段', () => {
    expect(normalizeCommandName('  文案  ', 'copywrite')).toBe('文案')
    expect(normalizeCommandName('copywrite extra', 'copywrite')).toBe('copywrite')
  })
})

describe('normalizeAliases', () => {
  it('去空白、去重、剔除空项', () => {
    expect(
      normalizeAliases(['文案', ' 文案 ', '', '  ', '模仿文案'], 'copywrite'),
    ).toEqual(['文案', '模仿文案'])
  })

  it('剔除与主指令同名的项', () => {
    expect(normalizeAliases(['copywrite', '文案'], 'copywrite')).toEqual(['文案'])
  })

  it('非数组直接返回空', () => {
    expect(normalizeAliases(undefined, 'copywrite')).toEqual([])
    expect(normalizeAliases('文案', 'copywrite')).toEqual([])
    expect(normalizeAliases([1, null, '文案'], 'copywrite')).toEqual(['文案'])
  })
})
