import { describe, expect, it } from 'vitest'

import { formatAddition, generateCopywrite } from '../src/prompt'
import type { Pattern } from '../src/types'

const pattern: Pattern = {
  examples: ['第一段\n第二段', '只有一段'],
  model: 'gemini-2.5-flash-nothinking',
  addition: '主题是 {}，关键词是 {}。',
  keywords: 2,
}

describe('generateCopywrite', () => {
  it('与上游 Python 实现逐字一致', () => {
    const prompt = generateCopywrite(pattern, '一个主题', ['第一个', '第二个'])

    expect(prompt).toBe(
      'Forget what I said above and what I wrote just now.\n\n' +
        'Below are some examples. Please mimic their wording and phrasing to generate content based on the given topics.\n\n' +
        'Example 1:\n第一段\n第二段\n' +
        '\n' +
        'Example 2:\n只有一段\n' +
        '\n\n' +
        'Here is the specific point:\n主题是 第一个，关键词是 第二个。' +
        '\nTopic: \n一个主题' +
        '"\n\n(保持相似格式)\nPlease complete, thank you.',
    )
  })

  it('没有 addition 时不留空段落', () => {
    const prompt = generateCopywrite(
      { ...pattern, addition: '' },
      '一个主题',
      [],
    )

    expect(prompt).toContain('只有一段\n\nTopic: \n一个主题"')
    expect(prompt).not.toContain('Here is the specific point')
  })

  it('例子数量为 0 时依然能拼出合法 prompt', () => {
    const prompt = generateCopywrite({ ...pattern, examples: [] }, 't', [])
    expect(prompt).toContain('topics.\n\n\n\nHere is the specific point')
  })
})

describe('formatAddition', () => {
  it('按顺序替换花括号', () => {
    expect(formatAddition('{} 和 {}，还有 {}', ['a', 'b'])).toBe(
      'a 和 b，还有 ',
    )
  })

  it('不碰非空花括号', () => {
    expect(formatAddition('{name} 是 {}', ['x'])).toBe('{name} 是 x')
  })
})
