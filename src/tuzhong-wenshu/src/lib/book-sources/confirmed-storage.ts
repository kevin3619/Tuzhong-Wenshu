/**
 * 已确认书籍数据持久化存储
 * 
 * 功能：
 * 1. 保存用户确认过的正确书籍数据
 * 2. 下次搜索时优先返回已确认的数据
 * 3. 数据存储在本地 JSON 文件中
 */

import * as fs from 'fs'
import * as path from 'path'

export interface ConfirmedBookData {
  title: string
  author: string
  genre: string
  status: string
  totalWords: string
  totalChapters: number
  protagonistName: string
  protagonistDescription: string
  femaleLeadName: string
  femaleLeadDescription: string
  synopsis: string
  tags: string[]
  confirmedAt: string
  confirmedBy: string
}

const STORAGE_DIR = path.join(process.cwd(), 'data', 'confirmed-books')
const STORAGE_FILE = path.join(STORAGE_DIR, 'confirmed-books.json')

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true })
  }
}

function readStorage(): Record<string, ConfirmedBookData> {
  ensureStorageDir()
  if (!fs.existsSync(STORAGE_FILE)) {
    return {}
  }
  try {
    const content = fs.readFileSync(STORAGE_FILE, 'utf-8')
    return JSON.parse(content)
  } catch (e) {
    console.error('[ConfirmedBooksStorage] 读取存储文件失败:', e)
    return {}
  }
}

function writeStorage(data: Record<string, ConfirmedBookData>) {
  ensureStorageDir()
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[ConfirmedBooksStorage] 写入存储文件失败:', e)
  }
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, '')
}

export function getConfirmedBook(title: string): ConfirmedBookData | null {
  const storage = readStorage()
  const key = normalizeTitle(title)
  return storage[key] || null
}

export function saveConfirmedBook(data: ConfirmedBookData): boolean {
  if (!data || !data.title) return false
  
  const storage = readStorage()
  const key = normalizeTitle(data.title)
  storage[key] = {
    ...data,
    confirmedAt: new Date().toISOString(),
  }
  writeStorage(storage)
  console.log(`[ConfirmedBooksStorage] 已保存确认数据: ${data.title}`)
  return true
}

export function getAllConfirmedBooks(): ConfirmedBookData[] {
  const storage = readStorage()
  return Object.values(storage)
}

export function deleteConfirmedBook(title: string): boolean {
  const storage = readStorage()
  const key = normalizeTitle(title)
  if (storage[key]) {
    delete storage[key]
    writeStorage(storage)
    console.log(`[ConfirmedBooksStorage] 已删除确认数据: ${title}`)
    return true
  }
  return false
}
