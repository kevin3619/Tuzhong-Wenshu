// 服务端专用：基于 AsyncLocalStorage 的请求级 LLM 上下文（仿写约束 + 动态兜底池）。
// ⚠️ 仅允许被 server route 引入（如 app/api/ai-generate/route.ts），禁止被客户端组件引用，
//    否则 node:async_hooks 会被打进客户端 bundle 导致构建失败。
import { AsyncLocalStorage } from 'node:async_hooks'
import { _setLLMContextProvider, type LLMRequestContext, type LLMConfig } from './llm'

const llmRequestCtx = new AsyncLocalStorage<LLMRequestContext>()

// 注入 provider：callLLMWithFallback 通过 currentLLMContext() 读取当前请求上下文
_setLLMContextProvider(() => llmRequestCtx.getStore() || null)

// 在请求级上下文中执行 fn；setImitateGuard/setExtraFallbackPool 会写入该上下文（隔离并发串扰）
export function runWithLLMRequestContext<T>(guard: string, pool: LLMConfig[], fn: () => Promise<T>): Promise<T> {
  return llmRequestCtx.run({ imitateGuard: guard || '', extraFallbackPool: pool || [] }, fn)
}
