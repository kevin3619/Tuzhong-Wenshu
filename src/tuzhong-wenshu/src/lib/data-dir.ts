import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

export function resolveDataDir(): string {
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
  const defaultPath = join(cwd, '.tuzhong-data')
  try { if (!existsSync(defaultPath)) mkdirSync(defaultPath, { recursive: true }) } catch { /* ignore */ }
  return defaultPath
}

export function getDataDir(): string { return resolveDataDir() }
