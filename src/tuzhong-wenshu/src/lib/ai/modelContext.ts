// 请求级模型上下文（历史实现，现已改为在 route.ts 内通过 baseConfig 引用 stamped 实际模型，
// 不再依赖 async_hooks，避免被打包进浏览器端组件导致 "Can't resolve 'async_hooks'" 报错）。
// 保留此空模块以免历史 import 残留报错；如需使用请改用服务端安全的实现。
export type ModelContext = {
  usedModel?: string
  usedProvider?: string
}
