import { join } from 'path'
import { readFileSync, existsSync, mkdirSync } from 'fs'

// 修复：动态解析数据目录路径，支持 PM2 等不同运行环境
// 支持两种命名：.tuzhong-data (规范) 与 data (用户习惯命名)
function resolveDataDir(): string {
  const cwd = process.cwd()
  const candidates = [
    join(cwd, '.tuzhong-data'),
    join(cwd, 'data'),
    join(cwd, 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    join(cwd, 'src', 'tuzhong-wenshu', 'data'),
    join(cwd, '..', '.tuzhong-data'),
    join(cwd, '..', 'data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
    '/www/wwwroot/tuzhong-wenshu/data',
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {
      // continue
    }
  }
  // 如果都不存在，默认用 .tuzhong-data 并创建
  const defaultPath = join(cwd, '.tuzhong-data')
  try { if (!existsSync(defaultPath)) mkdirSync(defaultPath, { recursive: true }) } catch { /* ignore */ }
  return defaultPath
}

// 每次调用都动态解析（不缓存），支持 PM2 热加载后目录变化
function getDataDir(): string { return resolveDataDir() }

function getNovelBookFile(): string { return join(getDataDir(), 'novels.json') }

export function stripBom(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf-8')
  }
  return buf.toString('utf-8')
}

export function loadFsNovels(): Record<string, unknown>[] {
  const novelBookFile = getNovelBookFile()
  try {
    if (!existsSync(novelBookFile)) {
      console.warn('[novel-storage] novels.json 不存在，路径=' + novelBookFile)
      return []
    }
    const rawBuf = readFileSync(novelBookFile)
    const raw = stripBom(rawBuf)
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    console.error('[novel-storage] 读取 novels.json 失败:', e)
    return []
  }
}
