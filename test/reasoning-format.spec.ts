import { describe, expect, it } from 'vitest'

import {
  formatReasoningMessage,
  toBlockquote,
  truncateMiddle,
} from '../src/commands/reasoning-format'

describe('truncateMiddle', () => {
  it('不超过上限时原样返回', () => {
    expect(truncateMiddle('short text', 100)).toBe('short text')
  })

  it('超长时保留开头 80% 与结尾 20%，中间省略', () => {
    const text = `${'A'.repeat(2000)}${'B'.repeat(2000)}`
    const result = truncateMiddle(text, 500)

    expect(result.length).toBe(500)
    expect(result).toContain('省略')
    expect(result.startsWith('A')).toBe(true)
    expect(result.endsWith('B')).toBe(true)
    expect(result).not.toContain('A'.repeat(1500))
  })
})

describe('formatReasoningMessage', () => {
  it('带思考前缀', () => {
    expect(formatReasoningMessage('abc', 100)).toBe('🧠 思考过程\n\nabc')
  })
})

describe('toBlockquote', () => {
  it('逐行添加 >，空行保留为 >', () => {
    expect(toBlockquote('第一行\n\n第三行')).toBe('> 第一行\n>\n> 第三行')
  })
})
