import type { Context } from 'koishi'

import type { Config } from '../config'
import type { PatternStore } from '../data'
import type { LlmRouter } from '../llm'
import { registerCopywrite } from './copywrite'
import { registerNewMeaning } from './new-meaning'

export function registerCommands(
  ctx: Context,
  config: Config,
  store: PatternStore,
  router: LlmRouter,
): void {
  registerCopywrite(ctx, config, store, router)
  registerNewMeaning(ctx, config, router)
}
