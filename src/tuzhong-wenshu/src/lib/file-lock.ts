/**
 * JSON 文件原子写入工具（修复 v6 L1：文件读写无并发控制）
 *
 * 解决方案：
 * 1. 写入时使用临时文件 + rename 实现原子写入（防止写入中断导致文件损坏）
 * 2. 使用进程内互斥锁防止同一进程内的并发写入
 * 3. 读取时容忍 BOM 头和 JSON 解析失败
 *
 * 注意：多进程部署场景需要迁移到数据库或使用文件系统锁（flock）
 */

import { writeFileSync, readFileSync, existsSync, renameSync, mkdirSync, openSync, fsyncSync, closeSync, copyFileSync } from 'fs'
import { dirname } from 'path'

// 进程内互斥锁（按文件路径区分）
const _lockMap = new Map<string, Promise<void>>()

/**
 * 原子写入 JSON 文件
 * 先写入临时文件，再 rename 覆盖目标文件，确保写入的原子性
 */
/**
 * 写前损坏守卫：目标文件存在且非空但 JSON 解析不了，说明上次写入被打断。
 * 此时「读失败→当空数据→整体覆盖」的调用链会清库，因此拒绝覆盖并隔离现场。
 */
function guardCorruptTarget(filePath: string): boolean {
  if (!existsSync(filePath)) return true
  let text = ''
  try { text = readFileSync(filePath, 'utf-8') } catch { return false }
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (trimmed === '') return true
  try { JSON.parse(trimmed); return true } catch {
    try { copyFileSync(filePath, filePath + '.corrupt-' + Date.now()) } catch { /* 忽略 */ }
    console.error('[file-lock] 拒绝写入损坏的 JSON 文件，已隔离副本：' + filePath)
    return false
  }
}

export async function runExclusive<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = _lockMap.get(key)
  const task = prev ? prev.then(fn, fn) : Promise.resolve().then(fn)
  const tracked = task.then(() => undefined, () => undefined)
  _lockMap.set(key, tracked)
  try { return await task } finally { if (_lockMap.get(key) === tracked) _lockMap.delete(key) }
}

export function atomicWriteJson(filePath: string, data: unknown): void {
  if (!guardCorruptTarget(filePath)) {
    throw new Error('数据文件已损坏，已拒绝覆盖写入以保护原始数据：' + filePath)
  }
  // 确保目录存在
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // 写入临时文件
  const tmpPath = filePath + '.tmp.' + process.pid + '.' + Date.now() + '.' + Math.random().toString(36).slice(2, 8)
  try {
    const fd = openSync(tmpPath, 'w')
    try {
      writeFileSync(fd, JSON.stringify(data, null, 2), 'utf-8')
      fsyncSync(fd) // 先落盘再 rename，避免掉电留下 0 字节文件
    } finally { closeSync(fd) }
    renameSync(tmpPath, filePath)
  } catch (err) {
    try { if (existsSync(tmpPath)) renameSync(tmpPath, filePath + '.failed-' + Date.now()) } catch { /* 忽略 */ }
    throw err
  }
}

/**
 * 带锁的原子写入 JSON 文件（进程内并发安全）
 */
export async function atomicWriteJsonWithLock(filePath: string, data: unknown): Promise<void> {
  // 等待该文件的前一个写入操作完成
  const prevLock = _lockMap.get(filePath)
  if (prevLock) {
    await prevLock
  }

  // 创建新的锁 Promise
  const lockPromise = new Promise<void>((resolve, reject) => {
    try {
      atomicWriteJson(filePath, data)
      resolve()
    } catch (err) {
      reject(err)
    }
  })

  _lockMap.set(filePath, lockPromise)

  try {
    await lockPromise
  } finally {
    // 清理已完成的锁
    if (_lockMap.get(filePath) === lockPromise) {
      _lockMap.delete(filePath)
    }
  }
}

/**
 * 安全读取 JSON 文件（容忍 BOM 头和解析失败）
 */
export function safeReadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback
  }
  try {
    const buf = readFileSync(filePath)
    // 移除 BOM 头
    let text = buf.toString('utf-8')
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/**
 * 带锁的读取-修改-写入（用于需要先读取再修改再写入的场景）
 */
export async function withJsonLock<T>(
  filePath: string,
  modifier: (data: unknown) => unknown,
  initialData: unknown = []
): Promise<T> {
  // 等待前一个操作完成
  const prevLock = _lockMap.get(filePath)
  if (prevLock) {
    await prevLock
  }

  const lockPromise = (async () => {
    const current = safeReadJson(filePath, initialData)
    const modified = modifier(current)
    atomicWriteJson(filePath, modified)
  })()

  const trackedLock = lockPromise.then(() => undefined)
  _lockMap.set(filePath, trackedLock)

  try {
    await lockPromise
    return safeReadJson<T>(filePath, initialData as T)
  } finally {
    if (_lockMap.get(filePath) === trackedLock) {
      _lockMap.delete(filePath)
    }
  }
}
