import { realpathSync, existsSync } from 'fs'
import { resolve, dirname, sep, join } from 'path'

/**
 * 安全路径解析：把用户可控的相对路径限制在 baseDir 容器内。
 * 拒绝：绝对路径、盘符路径、NUL、`..` 逃逸、符号链接逃逸。
 * @returns 容器内的真实绝对路径；非法时返回 null
 */
export function resolveInsideBase(baseDir: string, userPath: string): string | null {
  const raw = String(userPath || '').trim()
  if (!raw) return null
  if (raw.indexOf('\0') !== -1) return null
  if (raw.startsWith('/') || raw.startsWith('\\')) return null
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return null
  if (/(^|[\\/])\.\.([\\/]|$)/.test(raw)) return null

  const baseReal = realPathOrSelf(baseDir)
  const candidate = resolve(baseDir, raw)
  const targetReal = realPathOrSelf(candidate)

  if (targetReal !== baseReal && !targetReal.startsWith(baseReal + sep)) return null
  return targetReal
}

/**
 * 尽力解析真实路径：目标不存在时，回退到「最近的已存在祖先」再拼回剩余部分，
 * 这样既能拦住指向容器外已有文件的穿越，也能拦住指向容器外的不存在路径。
 */
function realPathOrSelf(p: string): string {
  let cursor = p
  const tail: string[] = []
  for (let guard = 0; guard < 64; guard++) {
    try {
      return join(realpathSync(cursor), ...tail.reverse())
    } catch {
      const parent = dirname(cursor)
      if (parent === cursor) break
      tail.push(cursor.slice(parent.length + 1))
      cursor = parent
    }
  }
  return resolve(p)
}

/** 允许的文件扩展名白名单（小写，不含点） */
export function hasAllowedExt(p: string, allowed: string[]): boolean {
  const ext = String(p).toLowerCase().split('.').pop() || ''
  return allowed.includes(ext)
}

/** 路径是否存在且为容器内普通文件（配合 resolveInsideBase 使用） */
export function isExistingFile(absPath: string | null): absPath is string {
  if (!absPath) return false
  try {
    return existsSync(absPath)
  } catch {
    return false
  }
}
