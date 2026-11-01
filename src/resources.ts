import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { Config } from './config'

const YAML_EXTENSIONS = new Set(['.yaml', '.yml'])

/**
 * 包内自带的模板目录。
 *
 * 本包由 yakumo/esbuild 输出为 CJS，`__dirname` 指向 `lib/`；
 * 开发时 esbuild-register 直接跑 `src/`，同样存在 `__dirname`。
 * 两者加上 `../resources/presets` 都能落到包根目录。
 */
export function resolveBundledDir(): string {
  return path.resolve(__dirname, '../resources/presets')
}

/** 用户目录，相对于 Koishi 的 baseDir */
export function resolvePresetDir(baseDir: string, config: Config): string {
  return path.resolve(baseDir, config.presetDir)
}

export interface ReleaseResult {
  /** 实际要读取的目录 */
  dir: string
  bundledDir: string
  copied: string[]
  existing: string[]
  /** 用户目录是否可写；不可写时会回退到包内目录 */
  writable: boolean
  error?: string
}

export async function listYamlFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => YAML_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort()
}

/**
 * 把包内模板补齐到用户目录：缺失的复制，已存在的保持不动。
 * 与 ChatLuna 的差异：即使目录已存在也会补齐新文件，升级后能带上新模板。
 */
export async function ensurePresets(
  baseDir: string,
  config: Config,
): Promise<ReleaseResult> {
  return release(baseDir, config, false)
}

/** 强制用包内模板覆盖用户目录里的同名文件 */
export async function resetPresets(
  baseDir: string,
  config: Config,
): Promise<ReleaseResult> {
  return release(baseDir, config, true)
}

async function release(
  baseDir: string,
  config: Config,
  overwrite: boolean,
): Promise<ReleaseResult> {
  const bundledDir = resolveBundledDir()
  const target = resolvePresetDir(baseDir, config)
  const result: ReleaseResult = {
    dir: bundledDir,
    bundledDir,
    copied: [],
    existing: [],
    writable: true,
  }

  if (!overwrite && !config.autoRelease) {
    // 关闭自动释放时不写盘，但如果用户目录已经存在，仍然优先读它。
    const exists = await fs
      .stat(target)
      .then((stat) => stat.isDirectory())
      .catch(() => false)
    if (exists) result.dir = target
    return result
  }

  const bundled = await listYamlFiles(bundledDir).catch(() => [] as string[])

  try {
    await fs.mkdir(target, { recursive: true })
  } catch (error) {
    result.writable = false
    result.error = errorMessage(error)
    return result
  }

  result.dir = target

  for (const name of bundled) {
    const source = path.join(bundledDir, name)
    const destination = path.join(target, name)

    const exists = await fs
      .access(destination)
      .then(() => true)
      .catch(() => false)

    if (exists && !overwrite) {
      result.existing.push(name)
      continue
    }

    try {
      await fs.copyFile(source, destination)
      result.copied.push(name)
    } catch (error) {
      result.writable = false
      result.error = errorMessage(error)
      result.dir = bundledDir
      return result
    }
  }

  return result
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
