import { describe, expect, it } from 'vitest'

import { listFontFamilies, mapSvgFontFamilies } from '../src/render'

describe('listFontFamilies', () => {
  it('提取 style 与属性里的 font-family，并去重', () => {
    const svg = `<svg>
      <style>
        .title { font-family: '文泉驿等宽正黑', sans-serif; }
        .content { font-family: '霞鹜文楷', serif; }
      </style>
      <text font-family="霞鹜文楷, sans-serif">x</text>
    </svg>`

    expect(listFontFamilies(svg)).toEqual([
      '文泉驿等宽正黑',
      'sans-serif',
      '霞鹜文楷',
      'serif',
    ])
  })
})

describe('mapSvgFontFamilies', () => {
  it('把中文/英文别名映射到实际加载的字体', () => {
    const svg = `<svg>
      <style>
        .title { font-family: '文泉驿等宽正黑', sans-serif; }
        .content { font-family: '霞鹜文楷', serif; }
      </style>
      <text font-family="LXGW WenKai">x</text>
    </svg>`

    const mapped = mapSvgFontFamilies(svg, {
      contentFamily: 'LXGWWenKaiMono',
      titleFamily: 'LXGWWenKaiMono',
    })

    expect(mapped).toContain("font-family: 'LXGWWenKaiMono', sans-serif")
    expect(mapped).toContain("font-family: 'LXGWWenKaiMono', serif")
    expect(mapped).toContain('font-family="LXGWWenKaiMono"')
    expect(mapped).not.toContain('霞鹜文楷')
    expect(mapped).not.toContain('文泉驿等宽正黑')
    expect(mapped).not.toContain('LXGW WenKai')
  })
})