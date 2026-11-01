/** 通道不可用（未安装、未配置、模型不存在），可以安全地切换到下一条通道 */
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmUnavailableError'
  }
}

/** 通道可用但请求失败，默认不触发回退，避免重复计费 */
export class LlmRequestError extends Error {
  constructor(
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = 'LlmRequestError'
    if (options?.cause !== undefined) this.cause = options.cause
  }
}
