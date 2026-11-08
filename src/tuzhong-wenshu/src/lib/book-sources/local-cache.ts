/**
 * 本地缓存模块
 * 
 * 功能：
 * 1. 百度百科词条缓存（7天有效期）
 * 2. 内存缓存 + 文件缓存双缓存
 * 3. 自动清理过期缓存
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface CacheItem<T> {
  value: T
  timestamp: number
  ttl: number
}

class LocalCache {
  private static instance: LocalCache
  private memoryCache: Map<string, CacheItem<unknown>> = new Map()
  private cacheDir: string
  private defaultTtl = 7 * 24 * 60 * 60 * 1000 // 7天

  private constructor() {
    this.cacheDir = path.join(os.tmpdir(), 'tuzhong-wenshu-cache')
    this.ensureCacheDir()
  }

  static getInstance(): LocalCache {
    if (!LocalCache.instance) {
      LocalCache.instance = new LocalCache()
    }
    return LocalCache.instance
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  private getCacheKey(namespace: string, key: string): string {
    return `${namespace}:${key}`
  }

  private getCacheFileName(namespace: string, key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
    return path.join(this.cacheDir, `${namespace}_${safeKey}.json`)
  }

  /**
   * 获取缓存
   */
  get<T>(namespace: string, key: string): T | null {
    const cacheKey = this.getCacheKey(namespace, key)
    
    // 先从内存缓存取
    const memoryItem = this.memoryCache.get(cacheKey)
    if (memoryItem && Date.now() - memoryItem.timestamp < memoryItem.ttl) {
      return memoryItem.value as T
    }
    
    // 再从文件缓存取
    const cacheFile = this.getCacheFileName(namespace, key)
    if (fs.existsSync(cacheFile)) {
      try {
        const content = fs.readFileSync(cacheFile, 'utf-8')
        const item: CacheItem<T> = JSON.parse(content)
        if (Date.now() - item.timestamp < item.ttl) {
          // 写入内存缓存
          this.memoryCache.set(cacheKey, item)
          return item.value
        } else {
          // 过期删除
          fs.unlinkSync(cacheFile)
        }
      } catch (e) {
        // 解析失败，删除缓存
        try { fs.unlinkSync(cacheFile) } catch (e) { console.error('[local-cache] 删除损坏缓存文件失败:', e) }
      }
    }
    
    return null
  }

  /**
   * 设置缓存
   */
  set<T>(namespace: string, key: string, value: T, ttl?: number): void {
    const cacheKey = this.getCacheKey(namespace, key)
    const actualTtl = ttl || this.defaultTtl
    
    const item: CacheItem<T> = {
      value,
      timestamp: Date.now(),
      ttl: actualTtl,
    }
    
    // 写入内存缓存
    this.memoryCache.set(cacheKey, item)
    
    // 写入文件缓存
    try {
      const cacheFile = this.getCacheFileName(namespace, key)
      fs.writeFileSync(cacheFile, JSON.stringify(item), 'utf-8')
    } catch (e) {
      console.warn('[LocalCache] 写入文件缓存失败:', e)
    }
  }

  /**
   * 检查缓存是否存在且有效
   */
  has(namespace: string, key: string): boolean {
    return this.get(namespace, key) !== null
  }

  /**
   * 删除缓存
   */
  delete(namespace: string, key: string): void {
    const cacheKey = this.getCacheKey(namespace, key)
    this.memoryCache.delete(cacheKey)
    
    try {
      const cacheFile = this.getCacheFileName(namespace, key)
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile)
      }
    } catch (e) {
      console.error('[local-cache] 删除缓存文件失败:', e)
    }
  }

  /**
   * 清理过期缓存
   */
  cleanExpired(): void {
    // 清理内存缓存
    const now = Date.now()
    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.memoryCache.delete(key)
      }
    }
    
    // 清理文件缓存
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir)
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(this.cacheDir, file)
            try {
              const content = fs.readFileSync(filePath, 'utf-8')
              const item = JSON.parse(content)
              if (now - item.timestamp > item.ttl) {
                fs.unlinkSync(filePath)
              }
            } catch (e) {
              try { fs.unlinkSync(filePath) } catch (e) { console.error('[local-cache] 删除过期缓存文件失败:', e) }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LocalCache] 清理过期缓存失败:', e)
    }
  }
}

export default LocalCache.getInstance()
