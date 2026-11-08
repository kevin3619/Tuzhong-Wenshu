// 创作步骤快照缓存机制（自研核心代码，软著原创）
// 世界观→灵感→人物→势力→图谱→大纲每个创作步骤独立生成数据快照
// 支持无限次回退修改、反复增量生成
// 快照落地前强制数据合法性校验，过滤undefined/null等非法值
// 自研循环引用检测+DOM/FiberNode过滤，杜绝Converting circular structure to JSON报错

type StepSnapshotKey = 'idea' | 'worldbuilding' | 'powerSystem' | 'characters' | 'factions' | 'relationships' | 'outline' | 'keyPlots' | 'chapters' | 'synopsis'

interface StepSnapshotStore {
  stepKey: StepSnapshotKey
  snapshots: string[]
  currentIdx: number
}

// 内存快照池（每个步骤独立存储多版本快照）
const projStepSavePool = new Map<string, StepSnapshotStore>()

// 🔥 Bug修复：localStorage 持久化key前缀，防止热重载(Fast Refresh)重置内存Map导致数据丢失
const LS_SNAPSHOT_PREFIX = 'tuzhong-snapshot-'

// 🔥 Bug修复（P2 #1）：按"当前激活作品"隔离快照，避免切换作品时串快照（跨作品污染）
// 默认从应用统一的激活作品键读取；若该键缺失，退回 'temp'（与向导未保存草稿态一致）
const LS_ACTIVE_NOVEL_KEY = 'tuzhong-active-novel-id'
let _snapshotNovelId: string | null = null
export function setSnapshotNovelId(id: string | null): void {
  _snapshotNovelId = id || null
}
function snapshotNovelNS(): string {
  if (_snapshotNovelId) return _snapshotNovelId
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const v = window.localStorage.getItem(LS_ACTIVE_NOVEL_KEY)
      if (v) return v
    }
  } catch (_e) { /* ignore */ }
  return 'temp'
}
// 组合出带作品隔离维度的 localStorage 键：tuzhong-snapshot-<novelId>::<stepKey>
function lsKey(stepKey: StepSnapshotKey): string {
  return LS_SNAPSHOT_PREFIX + snapshotNovelNS() + '::' + stepKey
}

// 🔥 Bug修复：从 localStorage 恢复快照（热重载后自动调用）
function restoreFromLocalStorage(stepKey: StepSnapshotKey): StepSnapshotStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(lsKey(stepKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.snapshots) && parsed.snapshots.length > 0) {
      return {
        stepKey: stepKey,
        snapshots: parsed.snapshots,
        currentIdx: typeof parsed.currentIdx === 'number' ? parsed.currentIdx : parsed.snapshots.length - 1
      }
    }
  } catch (e) {
    console.warn('[step-snapshot-cache] restoreFromLocalStorage failed for ' + stepKey + ':', e)
  }
  return null
}

// 🔥 Bug修复：保存快照到 localStorage（每次 saveStepSnapshot 时同步调用）
function persistToLocalStorage(stepKey: StepSnapshotKey, store: StepSnapshotStore): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    // 仅持久化最新一个快照（节省空间，热重载恢复只需最新版本）
    const toPersist = {
      snapshots: store.snapshots.slice(-3), // 保留最近3个版本
      currentIdx: Math.min(store.currentIdx, 2) // 调整索引
    }
    window.localStorage.setItem(lsKey(stepKey), JSON.stringify(toPersist))
  } catch (e) {
    // localStorage 配额不足时静默失败（不影响主流程）
    console.warn('[step-snapshot-cache] persistToLocalStorage failed for ' + stepKey + ':', e)
  }
}

// DOM元素/React组件属性特征关键字（用于过滤）
const DOM_FILTER_KEYS = [
  '$$typeof', 'type', 'key', 'ref', 'props', '_owner', '_store',
  '_self', '_source', 'alternate', 'child', 'sibling', 'return',
  'stateNode', 'effectTag', 'nextEffect', 'firstEffect', 'lastEffect',
  'tag', 'lanes', 'childLanes', 'pendingProps', 'memoizedProps',
  'memoizedState', 'updateQueue', 'dependencies', 'mode', 'flags',
  'subtreeFlags', 'deletions', 'current', 'containerInfo',
  'nativeEvent', 'target', 'currentTarget', 'eventPhase', 'bubbles',
  'cancelable', 'timeStamp', 'defaultPrevented', 'isTrusted',
  'parentNode', 'childNodes', 'children', 'firstChild', 'lastChild',
  'previousSibling', 'nextSibling', 'ownerDocument', 'namespaceURI',
  'baseURI', 'nodeName', 'nodeType', 'nodeValue', 'textContent',
  'innerHTML', 'outerHTML', 'style', 'classList', 'dataset',
  'offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight',
  'scrollTop', 'scrollLeft', 'scrollWidth', 'scrollHeight',
  'clientTop', 'clientLeft', 'clientWidth', 'clientHeight',
  'getBoundingClientRect', 'addEventListener', 'removeEventListener',
  'dispatchEvent', 'cloneNode', 'contains', 'insertBefore',
  'appendChild', 'removeChild', 'replaceChild', 'querySelector',
  'querySelectorAll', 'onclick', 'onchange', 'oninput', 'onsubmit',
  'onfocus', 'onblur', 'onkeydown', 'onkeyup', 'onmouseover',
  'onmouseout',
]

// 判断一个key是否为DOM/React内部属性
function isDomOrReactKey(key: string): boolean {
  // 以_开头的私有属性
  if (key.length > 0 && key.charAt(0) === '_') {
    return true
  }
  // on开头的标准事件
  if (key.length > 2 && key.slice(0, 2) === 'on' && key.charAt(2) === key.charAt(2).toUpperCase()) {
    return true
  }
  // DOM_FILTER_KEYS 中的已知属性
  for (let fi = 0; fi < DOM_FILTER_KEYS.length; fi++) {
    if (key === DOM_FILTER_KEYS[fi]) {
      return true
    }
  }
  return false
}

// 初始化某步骤的快照存储
function initStageCacheStore(stepKey: StepSnapshotKey): StepSnapshotStore {
  const mapKey = snapshotNovelNS() + '::' + stepKey
  const existing = projStepSavePool.get(mapKey)
  if (existing) {
    return existing
  }
  // 🔥 Bug修复：内存Map中没有时，尝试从localStorage恢复（热重载后自动恢复）
  const restored = restoreFromLocalStorage(stepKey)
  if (restored) {
    projStepSavePool.set(mapKey, restored)
    console.log('[step-snapshot-cache] 从localStorage恢复快照:', mapKey, '版本数:', restored.snapshots.length)
    return restored
  }
  const newStore: StepSnapshotStore = {
    stepKey: stepKey,
    snapshots: [],
    currentIdx: -1,
  }
  projStepSavePool.set(mapKey, newStore)
  return newStore
}

// 自研循环对象清洗器：递归遍历，自动剔除DOM元素、React FiberNode、DOM事件、循环嵌套对象
// 只保留纯业务文本/数组/数字数据（软著原创核心代码）
function stepDataCleanSerialize(rawVal: unknown, depthArg?: number, visitedSet?: WeakSet<object>): unknown {
  // 深度限制：最多递归64层
  const depth = depthArg || 0
  if (depth > 64) {
    return ''
  }

  // 循环引用检测
  let visited = visitedSet
  if (!visited) {
    visited = new WeakSet()
  }

  // undefined直接返回空字符串
  if (rawVal === undefined) {
    return ''
  }
  if (rawVal === null) {
    return ''
  }

  // 基本类型直接返回
  const rawType = typeof rawVal
  if (rawType === 'string') {
    return rawVal
  }
  if (rawType === 'number') {
    return rawVal
  }
  if (rawType === 'boolean') {
    return rawVal
  }

  // function类型过滤（React组件、事件处理器等）
  if (rawType === 'function') {
    return ''
  }

  // symbol类型过滤
  if (rawType === 'symbol') {
    return ''
  }

  // 对象/数组类型
  if (rawType === 'object') {
    // 循环引用检测：已访问过的对象直接返回空
    if (visited.has(rawVal as object)) {
      return ''
    }
    // 标记已访问
    visited.add(rawVal as object)

    // DOM节点检测：如果是HTMLElement/SVGElement等DOM节点，全量过滤
    if (
      rawVal instanceof Element ||
      rawVal instanceof Node ||
      rawVal instanceof Event
    ) {
      return ''
    }
    // typeof HTMLElement 在Node.js环境可能不存在，用特征属性检测兜底
    if (typeof window !== 'undefined') {
      if (window && window.Element && rawVal instanceof window.Element) {
        return ''
      }
      if (window && window.Node && rawVal instanceof window.Node) {
        return ''
      }
    }

    // 数组处理
    if (Array.isArray(rawVal)) {
      const cleanedArr: unknown[] = []
      let arrLen = rawVal.length
      if (arrLen > 10000) {
        arrLen = 10000
      }
      for (let ai = 0; ai < arrLen; ai++) {
        const arrItem = rawVal[ai]
        const cleanedItem = stepDataCleanSerialize(arrItem, depth + 1, visited)
        if (cleanedItem !== '' || (typeof cleanedItem === 'number') || (typeof cleanedItem === 'boolean') || (Array.isArray(cleanedItem) && cleanedItem.length > 0)) {
          cleanedArr.push(cleanedItem)
        }
      }
      return cleanedArr
    }

    // 普通对象处理
    const cleanedObj: Record<string, unknown> = {}
    const objRaw = rawVal as Record<string, unknown>
    const keys = Object.keys(objRaw)
    let keyCount = 0
    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[ki]
      // 过滤React内部属性和DOM相关属性
      if (isDomOrReactKey(key)) {
        continue
      }
      const val = objRaw[key]
      // 跳过函数
      if (typeof val === 'function') {
        continue
      }
      // 跳过undefined
      if (val === undefined) {
        continue
      }
      // 跳过null
      if (val === null) {
        cleanedObj[key] = ''
        continue
      }
      const cleaned = stepDataCleanSerialize(val, depth + 1, visited)
      if (cleaned !== '' || (typeof cleaned === 'number') || (typeof cleaned === 'boolean') || (Array.isArray(cleaned) && cleaned.length > 0)) {
        cleanedObj[key] = cleaned
        keyCount = keyCount + 1
      }
    }
    // 如果对象清洗后为空，返回空字符串
    if (keyCount === 0) {
      return ''
    }
    return cleanedObj
  }

  return ''
}

// 自研安全序列化：分步赋值+if判断，禁用链式JSON写法
function safeSerialize(projStepSaveMsg: unknown): string {
  // 第一步：数据合法性校验
  if (projStepSaveMsg === undefined) {
    return '{}'
  }
  if (projStepSaveMsg === null) {
    return '{}'
  }
  // 第二步：深度清洗（剔除循环引用、DOM节点、函数等）
  const cleaned = stepDataCleanSerialize(projStepSaveMsg)
  if (cleaned === '' || cleaned === undefined || cleaned === null) {
    return '{}'
  }
  // 第三步：序列化
  let serialized = ''
  try {
    serialized = JSON.stringify(cleaned)
  } catch (_serializeErr) {
    return '{}'
  }
  // 第四步：校验序列化结果
  if (serialized === undefined || serialized === null || serialized === '') {
    return '{}'
  }
  return serialized
}

// 自研安全反序列化：分步校验
function safeDeserialize(rawStr: unknown) {
  if (rawStr === undefined || rawStr === null) {
    return {}
  }
  if (typeof rawStr !== 'string') {
    return {}
  }
  if (rawStr === 'undefined' || rawStr === 'null' || rawStr === '') {
    return {}
  }
  try {
    const parsed = JSON.parse(rawStr)
    if (parsed === undefined || parsed === null) {
      return {}
    }
    return parsed
  } catch (_parseErr) {
    return {}
  }
}

// 保存当前步骤快照（软著改造：分步校验+清洗）
export function saveStepSnapshot(stepKey: StepSnapshotKey, projStepSaveMsg: unknown): void {
  const store = initStageCacheStore(stepKey)
  // 截断后续快照
  if (store.currentIdx < store.snapshots.length - 1) {
    store.snapshots = store.snapshots.slice(0, store.currentIdx + 1)
  }
  // 安全序列化后存入
  const serialized = safeSerialize(projStepSaveMsg)
  store.snapshots.push(serialized)
  store.currentIdx = store.snapshots.length - 1
  // 🔥 Bug修复：内存快照此前永不裁剪——向导长会话中快照无限增长；
  // localStorage 侧只留3份，内存侧对齐裁到最近50份并校正索引
  if (store.snapshots.length > 50) {
    store.snapshots = store.snapshots.slice(-50)
    store.currentIdx = store.snapshots.length - 1
  }
  // 🔥 Bug修复：同步持久化到localStorage，防止热重载丢失
  persistToLocalStorage(stepKey, store)
}

// 回退到上一个快照
export function rollbackStepSnapshot(stepKey: StepSnapshotKey) {
  const store = initStageCacheStore(stepKey)
  if (store.currentIdx <= 0) {
    return null
  }
  store.currentIdx = store.currentIdx - 1
  const rawSnapshot = store.snapshots[store.currentIdx]
  return safeDeserialize(rawSnapshot)
}

// 获取当前快照
export function getCurrentStepSnapshot(stepKey: StepSnapshotKey) {
  const store = initStageCacheStore(stepKey)
  if (store.currentIdx < 0 || store.currentIdx >= store.snapshots.length) {
    return null
  }
  const rawSnapshot = store.snapshots[store.currentIdx]
  return safeDeserialize(rawSnapshot)
}

// 检查是否有历史快照可回退
export function canRollbackStep(stepKey: StepSnapshotKey): boolean {
  const store = initStageCacheStore(stepKey)
  if (store.currentIdx <= 0) {
    return false
  }
  return true
}

// 清空某步骤所有快照
export function clearStepSnapshots(stepKey: StepSnapshotKey): void {
  projStepSavePool.delete(snapshotNovelNS() + '::' + stepKey)
  // 🔥 Bug修复：localStorage 键不同步删除的话，下一步 initStageCacheStore 又把旧快照恢复回来（"清空"失效）
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(lsKey(stepKey))
    }
  } catch (_e) { /* 忽略 */ }
}

// 清空所有步骤快照（仅清理当前激活作品命名空间 + 旧版无命名空间残留键）
export function clearAllSnapshots(): void {
  const ns = snapshotNovelNS()
  const nsPrefix = LS_SNAPSHOT_PREFIX + ns + '::'
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const toRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (!k) continue
        if (k.indexOf(nsPrefix) === 0) toRemove.push(k) // 当前作品命名空间
        else if (k.indexOf(LS_SNAPSHOT_PREFIX) === 0 && k.indexOf('::') === -1) toRemove.push(k) // 旧版无命名空间残留
      }
      for (const k of toRemove) window.localStorage.removeItem(k)
    }
  } catch (_e) { /* 忽略 */ }
  // 同时清空内存 Map 中当前作品命名空间的条目
  const memPrefix = ns + '::'
  for (const mk of Array.from(projStepSavePool.keys())) {
    if (mk.indexOf(memPrefix) === 0) projStepSavePool.delete(mk)
  }
}

// 自研业务数据克隆方法：剥离页面DOM绑定、React内部实例属性
// 只保留纯业务数据，用于AI接口传参和快照存储
export function cloneBizDataOnly(rawVal: unknown) {
  if (rawVal === undefined || rawVal === null) {
    return null
  }
  const rawType = typeof rawVal
  if (rawType === 'string' || rawType === 'number' || rawType === 'boolean') {
    return rawVal
  }
  if (rawType !== 'object') {
    return null
  }
  // 使用安全的深度清洗方法进行克隆（自动过滤DOM/React属性）
  return stepDataCleanSerialize(rawVal, 0, new WeakSet())
}

// 自研数据清洗序列化工具（软著自研代码，供全项目外部调用）
// 功能：自动剔除DOM对象、循环引用属性、undefined、无效函数
// 仅保留纯业务文本、数组、数值，返回安全可序列化的JSON字符串
export function stageMsgCleanSave(projStepSaveMsg: unknown): string {
  return safeSerialize(projStepSaveMsg)
}

// 表单字段合法性自检：检测力量体系表单缺失字段，自动兜底填充
// 软著改造：适配新版本嵌套结构（protagonistAbility + worldPowerSystem）
export function validateAndFixPowerSystem(rawData: unknown): {
  cleanedData: {
    protagonistAbility: Record<string, unknown>
    worldPowerSystem: Record<string, unknown>
    [key: string]: unknown
  }
  hasMissingFields: boolean
  missingFieldNames: string[]
} {
  let hasMissing = false
  const missingNames: string[] = []

  // 字符串类型/空值兜底
  if (typeof rawData === 'string' || rawData === undefined || rawData === null) {
    return {
      cleanedData: {
        protagonistAbility: {
          name: '',
          type: '',
          abilities: [],
          limitations: [],
          evolution: ''
        },
        worldPowerSystem: {
          name: '',
          type: '',
          levels: [],
          rules: '',
          elements: []
        }
      },
      hasMissingFields: true,
      missingFieldNames: ['主角能力详情', '世界力量体系'],
    }
  }

  const cleaned: Record<string, unknown> = {}
  const data = rawData as Record<string, unknown>

  // ===== 主角能力（protagonistAbility）=====
  let pa: Record<string, unknown> = {}
  if (data.protagonistAbility && typeof data.protagonistAbility === 'object') {
    pa = data.protagonistAbility as Record<string, unknown>
  }

  const paName = pa.name
  if (!paName || typeof paName !== 'string' || paName.trim() === '') {
    pa.name = ''
    hasMissing = true
    missingNames.push('主角能力名称')
  }
  const paType = pa.type
  if (!paType || typeof paType !== 'string' || paType.trim() === '') {
    pa.type = ''
    hasMissing = true
    missingNames.push('主角能力类型')
  }
  if (!Array.isArray(pa.abilities) || pa.abilities.length === 0) {
    pa.abilities = []
    hasMissing = true
    missingNames.push('主角具体能力')
  }
  if (!Array.isArray(pa.limitations) || pa.limitations.length === 0) {
    pa.limitations = []
    hasMissing = true
    missingNames.push('主角能力限制')
  }
  const paEvolution = pa.evolution
  if (!paEvolution || typeof paEvolution !== 'string' || paEvolution.trim() === '') {
    pa.evolution = ''
    hasMissing = true
    missingNames.push('主角成长发展路线')
  }
  cleaned.protagonistAbility = pa

  // ===== 世界力量体系（worldPowerSystem）=====
  let wp: Record<string, unknown> = {}
  if (data.worldPowerSystem && typeof data.worldPowerSystem === 'object') {
    wp = data.worldPowerSystem as Record<string, unknown>
  }

  const wpName = wp.name
  if (!wpName || typeof wpName !== 'string' || wpName.trim() === '') {
    wp.name = ''
    hasMissing = true
    if (missingNames.indexOf('世界力量体系名称') === -1) missingNames.push('世界力量体系名称')
  }
  const wpType = wp.type
  if (!wpType || typeof wpType !== 'string' || wpType.trim() === '') {
    wp.type = ''
    hasMissing = true
    if (missingNames.indexOf('世界力量体系类型') === -1) missingNames.push('世界力量体系类型')
  }
  if (!Array.isArray(wp.levels) || wp.levels.length === 0) {
    wp.levels = []
    hasMissing = true
    if (missingNames.indexOf('力量等级划分') === -1) missingNames.push('力量等级划分')
  }
  const wpRules = wp.rules
  if (!wpRules || typeof wpRules !== 'string' || wpRules.trim() === '') {
    wp.rules = ''
    hasMissing = true
    if (missingNames.indexOf('力量体系规则') === -1) missingNames.push('力量体系规则')
  }
  if (!Array.isArray(wp.elements) || wp.elements.length === 0) {
    wp.elements = []
    hasMissing = true
  }
  cleaned.worldPowerSystem = wp

  // ===== 兼容性字段：保留原始数据中的其他字段 =====
  if (data.coreArtifact && typeof data.coreArtifact === 'object') {
    cleaned.coreArtifact = data.coreArtifact
  }
  if (data.goldenFingerOrigin && typeof data.goldenFingerOrigin === 'string') {
    cleaned.goldenFingerOrigin = data.goldenFingerOrigin
  }

  return {
    cleanedData: cleaned as { protagonistAbility: Record<string, unknown>; worldPowerSystem: Record<string, unknown>; [key: string]: unknown },
    hasMissingFields: hasMissing,
    missingFieldNames: missingNames,
  }
}

// 增量数组拼接器：存量在前，新增在后（自研核心方法，软著原创）
export function appendNewToStoreArray(existingArr: unknown[], newArr: unknown[]): unknown[] {
  const merged: unknown[] = []
  if (existingArr && Array.isArray(existingArr)) {
    for (let ei = 0; ei < existingArr.length; ei++) {
      merged.push(existingArr[ei])
    }
  }
  if (newArr && Array.isArray(newArr)) {
    for (let ni = 0; ni < newArr.length; ni++) {
      merged.push(newArr[ni])
    }
  }
  return merged
}