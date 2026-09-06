'use client'

// 全局当前大模型上下文（浏览器安全：不依赖 async_hooks 等 Node 专属模块）
// AI 生成每步成功后，wizard 将后端返回的 _meta 写入此处；全局 header 订阅并展示在右上角。
export type ModelInfo = { usedModel?: string; usedProvider?: string } | null

type Listener = (m: ModelInfo) => void

let _current: ModelInfo = null
const _listeners = new Set<Listener>()

export function setActiveModel(m: ModelInfo): void {
  _current = m
  _listeners.forEach(function (l) { l(m) })
}

export function getActiveModel(): ModelInfo {
  return _current
}

export function subscribeActiveModel(l: Listener): () => void {
  _listeners.add(l)
  return function () {
    _listeners.delete(l)
  }
}
