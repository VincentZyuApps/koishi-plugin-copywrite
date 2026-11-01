import { Resvg } from '@resvg/resvg-js'

export interface SvgRenderOptions {
  fontFamily?: string
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
