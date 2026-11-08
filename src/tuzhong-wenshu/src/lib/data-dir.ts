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
    } catch (e) {
      console.error('[data-dir] 探测数据目录候选路径失败，继续下一个:', p, e)
    }
  }
  const defaultPath = join(cwd, '.tuzhong-data')
  try { if (!existsSync(defaultPath)) mkdirSync(defaultPath, { recursive: true }) } catch (e) { console.error('[data-dir] 创建默认数据目录失败:', e) }
  return defaultPath
}

export function getDataDir(): string { return resolveDataDir() }

// B 家族：4 候选、无 mkdir 兜底（与原 api/novels/route.ts、
// api/admin/dashboard/all-works/route.ts、api/admin/users/[id]/works/route.ts、
// lib/permissions.ts 中的本地实现逐字符等价）
export function resolveDataDirB(): string {
  const candidates = [
    join(process.cwd(), '.tuzhong-data'),
    join(process.cwd(), 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    join(process.cwd(), '..', '.tuzhong-data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch (e) {
      console.error('[data-dir] 探测数据目录候选路径失败，继续下一个:', p, e)
    }
  }
  return join(process.cwd(), '.tuzhong-data')
}

// C 家族：6 候选 + mkdir 兜底（与原 api/novels/upload-cover/route.ts、
// api/admin/upload-logo/route.ts、api/brand-logo/route.ts 中的本地实现逐字符等价；
// 相比主实现缺少 join(cwd, '..', 'data') 与 '/www/wwwroot/tuzhong-wenshu/data' 两个候选）
export function resolveDataDirC(): string {
  const cwd = process.cwd()
  const candidates = [
    join(cwd, '.tuzhong-data'),
    join(cwd, 'data'),
    join(cwd, 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    join(cwd, 'src', 'tuzhong-wenshu', 'data'),
    join(cwd, '..', '.tuzhong-data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch (e) {
      console.error('[data-dir] 探测数据目录候选路径失败，继续下一个:', p, e)
    }
  }
  const defaultPath = join(cwd, '.tuzhong-data')
  try { if (!existsSync(defaultPath)) mkdirSync(defaultPath, { recursive: true }) } catch (e) { console.error('[data-dir] 创建默认数据目录失败:', e) }
  return defaultPath
}
