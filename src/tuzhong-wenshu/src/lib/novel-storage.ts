import { join } from 'path'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { resolveDataDir, getDataDir } from './data-dir'

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
