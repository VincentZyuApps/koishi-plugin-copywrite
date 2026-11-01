import type { Context } from 'koishi'

import { registerCommands } from './commands'
import { Config } from './config'
import { PatternStore } from './data'
import { LlmRouter } from './llm'

export const name = 'copywrite'

export const inject = {
  required: ['http'],
  optional: ['chatluna', 'database'],
}

export { Config }
export { PatternStore } from './data'
export { LlmRouter } from './llm'
export * from './types'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('copywrite')
  const store = new PatternStore(ctx, config)
  const router = new LlmRouter(ctx, config)

  ctx.effect(() => () => store.dispose())

  registerCommands(ctx, config, store, router)

  // ChatLuna 是可选的：在它可用时再注册 Schema.dynamic('model') 的下拉数据源。
  ctx.inject(['chatluna'], (ctx) => {
    void import('./llm/chatluna').then((mod) => mod.registerModelSchema(ctx))
  })

  ctx.on('ready', async () => {
    try {
      const release = await store.start()
      if (release.writable && release.copied.length) {
        logger.info('已释放 %d 个内置模板到 %s', release.copied.length, release.dir)
      }
      logger.info('已加载 %d 条模板（%s）', store.size, store.activeDir)
    } catch (error) {
      logger.error(
        '加载模板失败：%s',
        error instanceof Error ? error.message : String(error),
      )
    }
  })
}
