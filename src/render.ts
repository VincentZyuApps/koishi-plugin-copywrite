import { Resvg } from '@resvg/resvg-js'

export interface SvgRenderOptions {
  fontFamily?: string
  fontFiles?: string[]
  fontDirs?: string[]
  scale?: number
}

/**
 * 把 SVG 转成 PNG。字体缺失时 resvg 会退回默认字体，
 * 不会直接抛错，所以这里只需要给一个合理的默认字体族。
 */
export function svgToPng(svg: string, options: SvgRenderOptions = {}): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: options.scale ?? 2,
    },
    font: {
      fontFiles: options.fontFiles ?? [],
      fontDirs: options.fontDirs ?? [],
      loadSystemFonts: true,
      defaultFontFamily: options.fontFamily || 'Microsoft YaHei',
    },
  })

  const png = resvg.render().asPng()
  return Buffer.isBuffer(png) ? png : Buffer.from(png)
}

const SVG_PATTERN = /<svg[\s\S]*?<\/svg>/i

export function extractSvg(text: string): string | null {
  return text.match(SVG_PATTERN)?.[0] ?? null
}

/** 提取 SVG 里声明的 font-family（用于排查字体缺失） */
export function listFontFamilies(svg: string): string[] {
  const families = new Set<string>()
  const patterns = [
    /font-family\s*:\s*([^;}]+)/gi,
    /font-family\s*=\s*["']([^"']+)["']/gi,
  ]

  for (const pattern of patterns) {
    for (const match of svg.matchAll(pattern)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().replace(/^["']|["']$/g, '')
        if (name) families.add(name)
      }
    }
  }

  return [...families]
}

const CONTENT_FONT_ALIASES = [
  '霞鹜文楷',
  'LXGW WenKai Mono',
  'LXGW WenKai',
  'LXGWWenKaiMono',
  'LXGWWenKai',
]

const TITLE_FONT_ALIASES = [
  '文泉驿等宽正黑',
  'WenQuanYi Zen Hei Mono',
  'WenQuanYi Zen Hei',
  'WenQuanYiZenHeiMono',
  'WenQuanYiZenHei',
]

export interface FontMappingOptions {
  contentFamily: string
  titleFamily: string
}

/**
 * 把模型写死的字体名替换成实际加载的字体。
 * 单次正则替换，避免替换结果被后续别名再次命中。
 */
export function mapSvgFontFamilies(
  svg: string,
  options: FontMappingOptions,
): string {
  const contentRe = buildAliasPattern(CONTENT_FONT_ALIASES)
  const titleRe = buildAliasPattern(TITLE_FONT_ALIASES)

  return svg
    .replace(contentRe, () => options.contentFamily)
    .replace(titleRe, () => options.titleFamily)
}

function buildAliasPattern(aliases: string[]): RegExp {
  const escaped = [...aliases]
    .sort((a, b) => b.length - a.length)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(escaped.join('|'), 'gi')
}
