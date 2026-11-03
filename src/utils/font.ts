import { createHash } from 'node:crypto'
import { existsSync, statSync, promises as fs } from 'node:fs'
import path from 'node:path'

import type { Context } from 'koishi'

export const LXGW_WENKAI_FILE_NAME = 'LXGWWenKaiMono-Regular.ttf'

const GITEE_RELEASE_BASE =
  'https://gitee.com/vincent-zyu/koishi-plugin-awa-quote-image/releases/download/fonts'
const GITHUB_RELEASE_BASE =
  'https://github.com/VincentZyuApps/koishi-plugin-awa-quote-image/releases/download/fonts'

interface FontIntegrity {
  size: number
  md5: string
  sha1: string
  sha256: string
  sha512: string
}

const INTEGRITY: Record<string, FontIntegrity> = {
  [LXGW_WENKAI_FILE_NAME]: {
    size: 24755236,
    md5: '90e75a25cca0e8868977b880352c6a53',
    sha1: '7f018ad4a181e4d2df4f972f357e612885d6c24a',
    sha256: 'ee9faa6479c5b2434f9bceca8e2e7b643f699f4f3d067aac9609261e07c6be61',
    sha512:
      '793dc4357d311dba539c50b0ae38ff247af066f141ffea54ff0cc51e274453671e736989cee4998fd89211035ecfe52ad38aa828ba7f1739bcf107b94a023be5',
  },
}

const DOWNLOAD_URLS: Record<string, Array<{ source: string; url: string }>> = {
  [LXGW_WENKAI_FILE_NAME]: [
    { source: 'Gitee', url: `${GITEE_RELEASE_BASE}/${LXGW_WENKAI_FILE_NAME}` },
    { source: 'GitHub', url: `${GITHUB_RELEASE_BASE}/${LXGW_WENKAI_FILE_NAME}` },
  ],
}

export interface ResolvedFontPaths {
  fontFiles: string[]
  fontDirs: string[]
  missing: string[]
}

export function getFontDirByBaseDir(baseDir: string): string {
  return path.join(baseDir, 'data', 'fonts')
}

export function getFontPathByBaseDir(
  baseDir: string,
  fileName = LXGW_WENKAI_FILE_NAME,
): string {
  return path.join(getFontDirByBaseDir(baseDir), fileName)
}

// Schema 默认值拿不到 ctx.baseDir，只能用 cwd 展示；运行时再映射到 ctx.baseDir。
export const DEFAULT_LXGW_WENKAI_PATH = getFontPathByBaseDir(process.cwd())

/** 相对路径按 ctx.baseDir 解析；托管字体统一落到 data/fonts */
export function resolveFontPath(ctx: Context, input: string): string {
  const fileName = input.split(/[\\/]/).filter(Boolean).pop() || ''
  if (fileName === LXGW_WENKAI_FILE_NAME) {
    return getFontPathByBaseDir(ctx.baseDir, fileName)
  }
  if (path.isAbsolute(input)) return input
  return path.resolve(ctx.baseDir, input)
}

export function resolveFontPaths(
  ctx: Context,
  inputs: string[],
): ResolvedFontPaths {
  const fontFiles: string[] = []
  const fontDirs: string[] = []
  const missing: string[] = []

  for (const input of inputs || []) {
    if (!input || !input.trim()) continue
    const absolute = resolveFontPath(ctx, input.trim())
    if (!existsSync(absolute)) {
      missing.push(absolute)
      continue
    }

    try {
      const stat = statSync(absolute)
      if (stat.isDirectory()) fontDirs.push(absolute)
      else fontFiles.push(absolute)
    } catch {
      missing.push(absolute)
    }
  }

  return { fontFiles, fontDirs, missing }
}

function calculateHashes(buffer: Buffer) {
  return {
    md5: createHash('md5').update(buffer).digest('hex'),
    sha1: createHash('sha1').update(buffer).digest('hex'),
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sha512: createHash('sha512').update(buffer).digest('hex'),
  }
}

function verifyBuffer(buffer: Buffer, expected: FontIntegrity): boolean {
  if (buffer.length !== expected.size) return false
  const hashes = calculateHashes(buffer)
  return (
    hashes.md5 === expected.md5 &&
    hashes.sha1 === expected.sha1 &&
    hashes.sha256 === expected.sha256 &&
    hashes.sha512 === expected.sha512
  )
}

async function verifyFile(
  filePath: string,
  expected: FontIntegrity,
): Promise<boolean> {
  if (!existsSync(filePath)) return false
  try {
    return verifyBuffer(await fs.readFile(filePath), expected)
  } catch {
    return false
  }
}

async function downloadFont(
  ctx: Context,
  filePath: string,
): Promise<boolean> {
  const fileName = path.basename(filePath)
  const expected = INTEGRITY[fileName]
  const candidates = DOWNLOAD_URLS[fileName]
  if (!expected || !candidates) return false

  for (const candidate of candidates) {
    try {
      ctx.logger('copywrite').info(
        '📥 下载字体 %s（%s）',
        fileName,
        candidate.source,
      )
      const response = await ctx.http.get(candidate.url, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      })
      const buffer = Buffer.from(response)
      if (!verifyBuffer(buffer, expected)) {
        throw new Error('字体 hash 校验失败')
      }
      await fs.writeFile(filePath, buffer)
      if (!(await verifyFile(filePath, expected))) {
        throw new Error('字体写入后 hash 校验失败')
      }
      ctx.logger('copywrite').info(
        '✅ 字体 %s 下载完成（%s）',
        fileName,
        candidate.source,
      )
      return true
    } catch (error) {
      ctx.logger('copywrite').warn(
        '⚠️ %s 下载字体 %s 失败：%s',
        candidate.source,
        fileName,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return false
}

/** 确保 data/fonts 下的内置字体存在且校验通过 */
export async function ensureFonts(ctx: Context): Promise<boolean> {
  const fontDir = getFontDirByBaseDir(ctx.baseDir)
  const filePath = getFontPathByBaseDir(ctx.baseDir)
  const expected = INTEGRITY[LXGW_WENKAI_FILE_NAME]

  if (await verifyFile(filePath, expected)) {
    ctx.logger('copywrite').debug('字体已存在且校验通过：%s', filePath)
    return true
  }

  try {
    await fs.mkdir(fontDir, { recursive: true })
  } catch (error) {
    ctx.logger('copywrite').error(
      '创建字体目录失败：%s',
      error instanceof Error ? error.message : String(error),
    )
    return false
  }

  if (existsSync(filePath)) {
    ctx.logger('copywrite').warn('字体 hash 校验失败，将重新下载：%s', filePath)
  } else {
    ctx.logger('copywrite').info('字体不存在，准备下载到：%s', filePath)
  }

  const ok = await downloadFont(ctx, filePath)
  if (!ok) {
    ctx.logger('copywrite').error(
      '字体下载失败，将回退系统字体（Gitee / GitHub 均不可用或校验失败）',
    )
  }
  return ok
}
