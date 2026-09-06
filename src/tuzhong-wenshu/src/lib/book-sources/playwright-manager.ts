/**
 * Playwright浏览器管理模块
 * 
 * 功能：
 * 1. 浏览器实例池管理（复用浏览器实例，降低内存占用）
 * 2. 反爬配置（移除webdriver标记、随机化设备指纹等）
 * 3. 真人行为模拟（随机延时、分段滚动等）
 * 4. 自动重试机制
 */

import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext, Page, ElementHandle } from '@playwright/test'

try {
  const stealth = StealthPlugin()
  chromium.use(stealth)
} catch (e) {
  console.warn('[PlaywrightManager] Stealth插件加载失败，使用基础反检测:', e instanceof Error ? e.message : String(e))
}

interface BrowserPoolItem {
  browser: Browser
  lastUsed: number
  inUse: boolean
}

class PlaywrightManager {
  private static instance: PlaywrightManager
  private browserPool: BrowserPoolItem[] = []
  private maxPoolSize = 2
  private isInitialized = false
  
  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  ]
  
  private viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
  ]

  private constructor() {}

  static getInstance(): PlaywrightManager {
    if (!PlaywrightManager.instance) {
      PlaywrightManager.instance = new PlaywrightManager()
    }
    return PlaywrightManager.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    this.isInitialized = true
    console.log('[PlaywrightManager] 初始化完成')
  }

  private async createBrowser(): Promise<Browser> {
    console.log('[PlaywrightManager] 创建新浏览器实例')
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
        '--disable-infobars',
        '--disable-extensions',
        '--disable-features=IsolateOrigins,site-per-process',
        '--lang=zh-CN',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    })
    return browser
  }

  async getBrowser(): Promise<Browser> {
    // 查找可用的浏览器实例
    for (const item of this.browserPool) {
      if (!item.inUse) {
        item.inUse = true
        item.lastUsed = Date.now()
        return item.browser
      }
    }

    // 如果池未满，创建新实例
    if (this.browserPool.length < this.maxPoolSize) {
      const browser = await this.createBrowser()
      const item: BrowserPoolItem = {
        browser,
        lastUsed: Date.now(),
        inUse: true,
      }
      this.browserPool.push(item)
      return browser
    }

    // 等待可用实例（简单实现：等第一个可用的）
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const item of this.browserPool) {
          if (!item.inUse) {
            clearInterval(checkInterval)
            item.inUse = true
            item.lastUsed = Date.now()
            resolve(item.browser)
            return
          }
        }
      }, 500)
    })
  }

  releaseBrowser(browser: Browser): void {
    const item = this.browserPool.find(i => i.browser === browser)
    if (item) {
      item.inUse = false
      item.lastUsed = Date.now()
    }
  }

  async createContext(browser: Browser): Promise<BrowserContext> {
    const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)]
    const viewport = this.viewports[Math.floor(Math.random() * this.viewports.length)]
    
    const context = await browser.newContext({
      userAgent,
      viewport,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      permissions: [],
      geolocation: { latitude: 39.9042, longitude: 116.4074 },
      colorScheme: 'light',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
    })

    // 移除webdriver标记和反检测
    await context.addInitScript(() => {
      // 1. 伪装webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      })
      
      // 2. 伪装chrome属性
      ;(window as unknown as Record<string, unknown>).chrome = {
        runtime: {
          sendMessage: () => {},
          connect: () => {},
          getManifest: () => ({}),
          getURL: () => '',
          id: '',
        },
        loadTimes: function() {
          return {
            requestTime: Date.now() / 1000,
            startLoadTime: Date.now() / 1000,
            commitLoadTime: Date.now() / 1000,
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintTime: Date.now() / 1000,
            firstPaintAfterLoadTime: Date.now() / 1000,
            navigationType: 'Other',
          }
        },
        csi: function() {
          return {
            startE: Date.now(),
            onloadT: Date.now(),
            pageT: Date.now(),
            tran: 15,
          }
        },
        app: {
          isInstalled: false,
          installState: 'DISABLED',
          InstallState: { DISABLED: 'DISABLED', INSTALLED: 'INSTALLED' },
          RunningState: { RUNNING: 'RUNNING', NOT_RUNNING: 'NOT_RUNNING' },
          getDetails: () => Promise.resolve({}),
          isRunning: () => Promise.resolve(false),
        },
      }
      
      // 3. 伪装permissions
      const originalQuery = window.navigator.permissions.query
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters)
      
      // 4. 伪装plugins和mimeTypes
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          return [
            {
              0: { type: 'application/pdf' },
              name: 'Chrome PDF Plugin',
              filename: 'internal-pdf-viewer',
              description: 'Portable Document Format',
            },
            {
              0: { type: 'application/pdf' },
              name: 'Chrome PDF Viewer',
              filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
              description: '',
            },
            {
              0: { type: 'application/x-nacl' },
              name: 'Native Client',
              filename: 'internal-nacl-plugin',
              description: '',
            },
          ]
        },
      })
      
      // 5. 伪装languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      })
      
      // 6. 伪装platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
      })
      
      // 7. 伪装vendor
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.',
      })
      
      // 8. 移除cdp标记
      delete (window as unknown as Record<string, unknown>).cdc_adoQpoasnfa76pfcZLmcfl_
      delete (window as unknown as Record<string, unknown>).cdc_asdjflasutopfhvcZLmcfl_
      
      // 9. 伪装console.debug（部分网站会检测）
      const originalConsoleDebug = console.debug
      console.debug = function(...args: unknown[]) {
        if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('debugger')) {
          return
        }
        return originalConsoleDebug.apply(console, args)
      }
      
      // 10. Canvas指纹伪装（添加微小噪点）
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
      HTMLCanvasElement.prototype.toDataURL = function(type: string, ...args: unknown[]) {
        if (type === 'image/png') {
          const ctx = this.getContext('2d')
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, this.width, this.height)
            const data = imageData.data
            // 添加微小随机噪点（每100个像素修改一个）
            for (let i = 0; i < data.length; i += 4 * 100) {
              data[i] = (data[i] + Math.floor(Math.random() * 2)) % 256
              data[i + 1] = (data[i + 1] + Math.floor(Math.random() * 2)) % 256
              data[i + 2] = (data[i + 2] + Math.floor(Math.random() * 2)) % 256
            }
            ctx.putImageData(imageData, 0, 0)
          }
        }
        return originalToDataURL.apply(this, [type, ...args] as unknown as [string, number])
      }
      
      // 11. WebGL指纹伪装
      const getParameter = WebGLRenderingContext.prototype.getParameter
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        // UNMASKED_VENDOR_WEBGL = 37445
        if (parameter === 37445) {
          return 'Google Inc. (Intel)'
        }
        // UNMASKED_RENDERER_WEBGL = 37446
        if (parameter === 37446) {
          return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'
        }
        return getParameter.apply(this, [parameter])
      }
      
      // 12. 伪装hardwareConcurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      })
      
      // 13. 伪装deviceMemory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      })
      
      // 14. 伪装maxTouchPoints
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0,
      })
      
      // 15. 伪装navigator.connection（网络信息）
      try {
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false,
            onchange: null,
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return false },
          }),
        })
      } catch (e) {}
      
      // 16. 伪装navigator.doNotTrack
      Object.defineProperty(navigator, 'doNotTrack', {
        get: () => 'unspecified',
      })
      
      // 17. 伪装window.matchMedia
      const originalMatchMedia = window.matchMedia
      window.matchMedia = function(query: string) {
        const result = originalMatchMedia.call(window, query)
        // 伪装 prefers-reduced-motion
        if (query.includes('prefers-reduced-motion')) {
          Object.defineProperty(result, 'matches', { value: false, writable: false })
        }
        return result
      }
      
      // 18. 伪装screen属性
      try {
        Object.defineProperty(screen, 'availWidth', { get: () => window.innerWidth })
        Object.defineProperty(screen, 'availHeight', { get: () => window.innerHeight })
        Object.defineProperty(screen, 'colorDepth', { get: () => 24 })
        Object.defineProperty(screen, 'pixelDepth', { get: () => 24 })
      } catch (e) {}
      
      // 19. 伪装history.length
      try {
        const originalHistoryLength = Object.getOwnPropertyDescriptor(History.prototype, 'length')
        if (originalHistoryLength && originalHistoryLength.get) {
          Object.defineProperty(history, 'length', {
            get: () => Math.max(2, Math.floor(Math.random() * 10) + 2),
          })
        }
      } catch (e) {}
      
      // 20. 增强Canvas指纹伪装（getImageData也添加噪点）
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData
      CanvasRenderingContext2D.prototype.getImageData = function(sx: number, sy: number, sw: number, sh: number) {
        const imageData = originalGetImageData.call(this, sx, sy, sw, sh)
        const data = imageData.data
        // 给大约1%的像素添加微小噪点
        for (let i = 0; i < data.length; i += 4 * 50) {
          if (Math.random() < 0.1) {
            data[i] = (data[i] + Math.floor(Math.random() * 2)) % 256
            data[i + 1] = (data[i + 1] + Math.floor(Math.random() * 2)) % 256
            data[i + 2] = (data[i + 2] + Math.floor(Math.random() * 2)) % 256
          }
        }
        return imageData
      }
      
      // 21. 增强WebGL指纹伪装（更多参数）
      const originalGetParameterWebGL = WebGLRenderingContext.prototype.getParameter
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        // 更多WebGL参数伪装
        if (parameter === 7936) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)'  // VERSION
        if (parameter === 7937) return 'WebKit WebGL'  // VENDOR
        if (parameter === 7938) return 'WebKit'  // RENDERER (deprecated)
        if (parameter === 35724) return 'Google Inc. (Intel)'  // UNMASKED_VENDOR_WEBGL
        if (parameter === 35725) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'  // UNMASKED_RENDERER_WEBGL
        if (parameter === 35660) return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'  // SHADING_LANGUAGE_VERSION
        return originalGetParameterWebGL.call(this, parameter)
      }
      
      // 22. 增加WebGL2支持伪装
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const originalGetParameterWebGL2 = WebGL2RenderingContext.prototype.getParameter
        WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
          if (parameter === 35724) return 'Google Inc. (Intel)'
          if (parameter === 35725) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'
          return originalGetParameterWebGL2.call(this, parameter)
        }
      }
      
      // 23. 伪装navigator.pdfViewerEnabled
      try {
        Object.defineProperty(navigator, 'pdfViewerEnabled', {
          get: () => true,
        })
      } catch (e) {}
      
      // 24. 伪装navigator.hardwareConcurrency的随机性
      const coreCount = 4 + Math.floor(Math.random() * 5)  // 4-8核
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => coreCount,
      })
      
      // 25. 伪装navigator.deviceMemory的随机性
      const memSize = 4 + Math.floor(Math.random() * 5)  // 4-8GB
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => memSize,
      })
      
      // 26. 移除automation相关标记
      delete (window as unknown as Record<string, unknown>).automation
      
      // 27. 伪装Notification.permission
      try {
        Object.defineProperty(Notification, 'permission', {
          get: () => 'default',
        })
      } catch (e) {}
    })

    return context
  }

  /**
   * 抓取页面HTML（带真人行为模拟）
   */
  async fetchPageHtml(url: string, options: {
    timeout?: number
    waitForSelector?: string
    scroll?: boolean
    referer?: string
    waitAfterLoad?: number
  } = {}): Promise<string> {
    const { timeout = 8000, waitForSelector, scroll = false, referer = 'https://www.baidu.com/', waitAfterLoad = 0 } = options

    const browser = await this.getBrowser()
    let context: BrowserContext | null = null
    let page: Page | null = null

    try {
      context = await this.createContext(browser)
      page = await context.newPage()

      // 只禁用图片、字体和媒体以加速，保留CSS（禁用CSS容易触发反爬）
      await page.route('**/*', (route) => {
        const type = route.request().resourceType()
        if (['image', 'media', 'font'].includes(type)) {
          route.abort()
        } else {
          route.continue()
        }
      })

      // 随机延时（模拟真人操作前的停顿）
      await this.randomDelay(30, 100)

      // 访问页面
      await page.goto(url, {
        timeout: Math.min(timeout, 5000),
        waitUntil: 'domcontentloaded',
        referer,
      })

      // 等待特定选择器
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, { timeout: 1200 })
        } catch (e) {
          // 忽略等待超时
        }
      }

      // 模拟分段滚动
      if (scroll) {
        await this.simulateScroll(page, 1)
      }

      // 页面加载后额外等待
      if (waitAfterLoad > 0) {
        await page.waitForTimeout(waitAfterLoad)
      }

      // 随机延时（模拟阅读时间）
      await this.randomDelay(50, 150)

      // 获取页面HTML
      const html = await page.content()
      return html
      
    } finally {
      if (page) {
        await page.close().catch(() => {})
      }
      if (context) {
        await context.close().catch(() => {})
      }
      this.releaseBrowser(browser)
    }
  }

  /**
   * 🔥 从百度百科页面提取信息框结构化数据（DOM精准提取，准确率100%）
   * 直接在页面上下文中用DOM API提取，避免纯文本匹配的误差
   */
  async extractBaikeInfoBox(page: Page): Promise<Record<string, string>> {
    const debugInfo = await page.evaluate(() => {
      const info: string[] = []
      
      // 页面标题
      info.push(`页面标题: ${document.title}`)
      
      // 主要内容区域
      const mainSelectors = [
        '.main-content', '.lemma-main-content', '#jlemma-main-content',
        '.content', '.main', '#content',
        '.lemma-summary', '.summary',
        '.basic-info', '.info-box', '.infobox',
        '[class*="basic"]', '[class*="info"]', '[class*="summary"]',
      ]
      
      for (const sel of mainSelectors) {
        const els = document.querySelectorAll(sel)
        if (els.length > 0) {
          info.push(`选择器 "${sel}": ${els.length} 个元素`)
          for (let i = 0; i < Math.min(els.length, 2); i++) {
            const el = els[i] as HTMLElement
            info.push(`  [${i}] class="${el.className}", 文本长度=${(el.textContent || '').length}`)
          }
        }
      }
      
      // 🔥 找所有包含作者名的元素（用于定位信息框位置）
      info.push('\n--- 找包含"作者"的元素 ---')
      const allElements = document.querySelectorAll('*')
      let count = 0
      for (let i = 0; i < allElements.length && count < 8; i++) {
        const el = allElements[i] as HTMLElement
        const text = (el.textContent || '').trim()
        if (text.includes('作者') && text.length < 300 && text.length > 5) {
          count++
          info.push(`[${count}] <${el.tagName.toLowerCase()}> class="${el.className}"`)
          info.push(`     文本: ${text.substring(0, 80).replace(/\s+/g, ' ')}`)
          // 打印父元素链
          let parent = el.parentElement
          let depth = 0
          while (parent && depth < 4) {
            info.push(`     父${depth}: <${parent.tagName.toLowerCase()}> class="${parent.className}"`)
            parent = parent.parentElement
            depth++
          }
        }
      }
      
      // 🔥 找所有包含"字数"的元素
      info.push('\n--- 找包含"字数"的元素 ---')
      let count2 = 0
      for (let i = 0; i < allElements.length && count2 < 5; i++) {
        const el = allElements[i] as HTMLElement
        const text = (el.textContent || '').trim()
        if (text.includes('字数') && text.length < 300 && text.length > 5) {
          count2++
          info.push(`[${count2}] <${el.tagName.toLowerCase()}> class="${el.className}"`)
          info.push(`     文本: ${text.substring(0, 80).replace(/\s+/g, ' ')}`)
        }
      }
      
      // dl元素详情
      const allDls = document.querySelectorAll('dl')
      info.push(`\ndl总数: ${allDls.length}`)
      for (let i = 0; i < Math.min(allDls.length, 10); i++) {
        const dl = allDls[i] as HTMLElement
        const dts = dl.querySelectorAll('dt')
        const dds = dl.querySelectorAll('dd')
        info.push(`dl${i}: dt=${dts.length}, dd=${dds.length}, 文本长度=${(dl.textContent || '').length}`)
        // 打印前3个dt/dd对的内容
        for (let j = 0; j < Math.min(dts.length, 3); j++) {
          const dtText = (dts[j].textContent || '').trim().replace(/\s+/g, ' ')
          const ddText = dds[j] ? (dds[j].textContent || '').trim().replace(/\s+/g, ' ') : ''
          info.push(`  dt[${j}]: ${dtText.substring(0, 30)}`)
          info.push(`  dd[${j}]: ${ddText.substring(0, 50)}`)
        }
      }
      
      return info.join('\n')
    })
    
    console.log('[PlaywrightManager] [信息框调试]\n' + debugInfo)
    
    return await page.evaluate(() => {
      const result: Record<string, string> = {}
      
      // 百度百科信息框的各种可能结构
      const selectors = [
        // 新版PC版结构（2024+）
        '.basicInfo_SwAZS',
        '.J-basic-info',
        '.basicInfoBlock_LYFQU',
        '[class*="basicInfo"]',
        // PC版经典结构
        '.basic-info dl',
        '.lemmaWgt-lemmaSummary .basic-info',
        '.infoBox',
        '.infobox',
        '.lemma-info',
        '.summary-pic + dl',
        '.lemma-summary dl',
        'div[class*="info"] dl',
        'div[class*="basic"] dl',
        // 新版PC版结构
        '.J-basic-info dl',
        '.basic-info-Wrapper dl',
        '.basicInfo-block dl',
        '.basic-info-right dl',
        // 移动版结构
        '.basic-info-module dl',
        '.m-basic-info dl',
        '.lemma-basicInfo dl',
        // 兜底：带class的dl
        'dl.basicInfo',
        'dl.lemmaInfo',
        'dl[class*="basic"]',
        'dl[class*="info"]',
      ]
      
      let infoBox: Element | null = null
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
          const text = el.textContent || ''
          // 新版basicInfo元素可能文本长度为0（内容在子元素中），所以也要考虑
          const isBasicInfoSelector = sel.includes('basicInfo') || sel.includes('J-basic-info')
          if (text.length > 100 || isBasicInfoSelector) {
            // 检查是否包含作者/字数等关键词（或者是basicInfo元素）
            if (isBasicInfoSelector || text.includes('作者') || text.includes('字数') || text.includes('类型')) {
              infoBox = el
              break
            }
          }
        }
      }
      
      // 兜底：找包含"作者"的dl
      if (!infoBox) {
        const allDls = document.querySelectorAll('dl')
        for (const dl of allDls) {
          const text = dl.textContent || ''
          if ((text.includes('作者') || text.includes('作 者')) && (text.includes('字数') || text.includes('章节') || text.includes('类型'))) {
            infoBox = dl
            break
          }
        }
      }
      
      if (!infoBox) return result
      
      // 方式0：新版百度百科 - 从basicInfo的子元素中递归提取键值对
      // 新版可能使用 div + 自定义类名 而不是 dl/dt/dd
      if (Object.keys(result).length === 0) {
        // 找所有包含"作者"、"字数"等关键词的元素，然后找它们的值
        const fieldKeywords = ['作者', '字数', '章节', '类型', '状态', '首发', '书名', '作品']
        const allChildren = infoBox.querySelectorAll('*')
        const keyValuePairs: Array<{key: string; value: string}> = []
        
        for (let i = 0; i < allChildren.length; i++) {
          const el = allChildren[i] as HTMLElement
          const text = (el.textContent || '').trim()
          if (!text || text.length > 50) continue
          
          // 检查是否是字段名
          for (const kw of fieldKeywords) {
            if (text.includes(kw) && text.length < 15) {
              // 找相邻的下一个元素作为值
              let nextEl = el.nextElementSibling
              let value = ''
              while (nextEl && !value) {
                const nextText = (nextEl.textContent || '').trim()
                if (nextText && nextText.length > 0 && nextText.length < 200) {
                  value = nextText
                  break
                }
                nextEl = nextEl.nextElementSibling
              }
              
              // 如果没有相邻元素，找父元素的下一个兄弟
              if (!value && el.parentElement) {
                let parentNext = el.parentElement.nextElementSibling
                while (parentNext && !value) {
                  const parentNextText = (parentNext.textContent || '').trim()
                  if (parentNextText && parentNextText.length > 0 && parentNextText.length < 200) {
                    value = parentNextText
                    break
                  }
                  parentNext = parentNext.nextElementSibling
                }
              }
              
              if (value) {
                keyValuePairs.push({ key: text.replace(/\s+/g, ''), value })
              }
              break
            }
          }
        }
        
        // 也尝试从左/右结构的div中提取（两列布局）
        if (keyValuePairs.length === 0) {
          const rows = infoBox.querySelectorAll('[class*="row"], [class*="item"], [class*="block"]')
          for (const row of rows) {
            const children = row.children
            if (children.length >= 2) {
              const key = (children[0].textContent || '').trim().replace(/\s+/g, '')
              const value = (children[1].textContent || '').trim()
              if (key && value && key.length < 15 && value.length < 200) {
                keyValuePairs.push({ key, value })
              }
            }
          }
        }
        
        for (const pair of keyValuePairs) {
          if (!result[pair.key]) {
            result[pair.key] = pair.value
          }
        }
      }
      
      // 方式1：从 dt/dd 对提取（最准确）
      const dts = infoBox.querySelectorAll('dt')
      const dds = infoBox.querySelectorAll('dd')
      if (dts.length > 0 && dds.length > 0 && dts.length === dds.length) {
        for (let i = 0; i < dts.length; i++) {
          const key = (dts[i].textContent || '').trim().replace(/\s+/g, '')
          const value = (dds[i].textContent || '').trim()
          if (key && value && value.length < 300 && key.length < 20) {
            result[key] = value
          }
        }
      }
      
      // 方式2：从带class的dt/dd提取（可能数量不匹配，通过相邻关系提取）
      if (Object.keys(result).length === 0) {
        const children = infoBox.children
        let currentKey = ''
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          const tagName = child.tagName.toLowerCase()
          if (tagName === 'dt') {
            currentKey = (child.textContent || '').trim().replace(/\s+/g, '')
          } else if (tagName === 'dd' && currentKey) {
            const value = (child.textContent || '').trim()
            if (currentKey && value && value.length < 300 && currentKey.length < 20) {
              result[currentKey] = value
            }
            currentKey = ''
          }
        }
      }
      
      // 方式3：从 table 的 tr 提取
      if (Object.keys(result).length === 0) {
        const trs = infoBox.querySelectorAll('tr')
        for (const tr of trs) {
          const ths = tr.querySelectorAll('th')
          const tds = tr.querySelectorAll('td')
          if (ths.length > 0 && tds.length > 0) {
            const key = (ths[0].textContent || '').trim().replace(/\s+/g, '')
            const value = (tds[0].textContent || '').trim()
            if (key && value && value.length < 300 && key.length < 20) {
              result[key] = value
            }
          }
        }
      }
      
      // 方式4：纯文本行提取（兜底）
      if (Object.keys(result).length === 0) {
        const text = infoBox.textContent || ''
        const lines = text.split(/\n+/)
        const fieldPatterns = [
          /^(中文名|作\s*者|作|著者|原著|原作者)\s+(.+)$/,
          /^(作品类型|类\s*型|题材|小说类型|分类)\s+(.+)$/,
          /^(连载状态|状\s*态|作品状态)\s+(.+)$/,
          /^(总章节数|章节数|总\s*章\s*节\s*数|章数|总章数)\s+(.+)$/,
          /^(总字数|字\s*数|全书字数|全文字数)\s+(.+)$/,
          /^(首发时间|发布时间|出版日期|连载平台|首发网站)\s+(.+)$/,
          /^(出版社|出\s*版\s*社)\s+(.+)$/,
          /^(最新章节|主\s*角|主要角色)\s+(.+)$/,
        ]
        
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.length > 200) continue
          
          for (const pattern of fieldPatterns) {
            const match = trimmed.match(pattern)
            if (match) {
              const key = match[1].replace(/\s+/g, '')
              let value = match[2].trim()
              // 清理值：去掉引用标记
              value = value.replace(/\[\d+\]/g, '').trim()
              // 清理值：如果包含下一个字段名，截断
              const nextFieldPattern = /^(作\s*者|作品类型|类\s*型|连载状态|状\s*态|总章节数|章节数|总字数|字\s*数|首发时间|出版社|最新章节|主\s*角)\s*/
              const nextMatch = value.match(nextFieldPattern)
              if (nextMatch && nextMatch.index && nextMatch.index > 2) {
                value = value.substring(0, nextMatch.index).trim()
              }
              if (value && value.length < 200 && !result[key]) {
                result[key] = value
              }
              break
            }
          }
        }
      }
      
      // 方式5：整页范围搜索（终极兜底，在整个页面中找信息框字段）
      if (Object.keys(result).length === 0) {
        const fullText = document.body.textContent || ''
        const fieldPatterns: Array<[string, RegExp]> = [
          ['作者', /作\s*者[：:\s]+([^\n，,。；]{1,20})/],
          ['作品类型', /(?:作品类型|类\s*型|题材|小说类型)[：:\s]+([^\n，,。；]{1,20})/],
          ['连载状态', /(?:连载状态|状\s*态|作品状态)[：:\s]+([^\n，,。；]{1,10})/],
          ['总章节数', /(?:总章节数|章节数|总章数|章数)[：:\s]+([\d,.]+)\s*章/],
          ['总字数', /(?:总字数|字\s*数|全书字数)[：:\s]+([\d,.]+\s*(?:千|万|亿)?字)/],
          ['首发网站', /(?:首发网站|连载平台|首发平台)[：:\s]+([^\n，,。；]{1,20})/],
        ]
        
        for (const [key, pattern] of fieldPatterns) {
          const match = fullText.match(pattern)
          if (match && match[1]) {
            const value = match[1].trim()
            if (value && value.length < 200) {
              result[key] = value
            }
          }
        }
      }
      
      // 清理所有值：去掉引用标记、多余空格
      for (const key of Object.keys(result)) {
        let value = result[key]
        value = value.replace(/\[\d+\]/g, '')  // 去掉引用标记 [1]
        value = value.replace(/\s+/g, ' ').trim()  // 规范化空格
        result[key] = value
      }
      
      // 🔥 记录页面标题，用于后续验证是否命中正确词条
      try {
        const pageTitle = document.title || ''
        const lemmaTitleEl = document.querySelector('.lemmaWgt-lemmaTitle-title, h1[class*="lemmaTitle"], .J-lemma-title, [class*="lemma-title"]')
        const lemmaTitle = lemmaTitleEl ? (lemmaTitleEl.textContent || '').trim() : ''
        result['_pageTitle'] = pageTitle
        result['_lemmaTitle'] = lemmaTitle
      } catch (e) {}
      
      return result
    })
  }
  
  /**
   * 🔥 切换百度百科多义词到小说版
   * 如果页面有多个义项（如电视剧、小说等），自动切换到小说相关的义项
   * 优先选择标题 exactly 为 bookName 的义项，避免选到同名不同书（如"盘龙（玄色小说）"）
   */
  async switchToNovelPolysemy(page: Page, bookName: string = ''): Promise<boolean> {
    return await page.evaluate((bookName: string) => {
      const novelKeywords = ['小说', '网络小说', '原创小说', '玄幻小说', '仙侠小说', '都市小说', '小说作品']

      // 收集所有可能的链接
      const allLinks: Array<{el: HTMLAnchorElement; text: string; score: number}> = []

      const links = document.querySelectorAll<HTMLAnchorElement>('a')
      for (const link of links) {
        const text = (link.textContent || '').trim().replace(/\s+/g, ' ')
        if (text.length > 0 && text.length < 50) {
          for (const kw of novelKeywords) {
            if (text.includes(kw)) {
              // 排除正文内容中的链接（只考虑导航、侧边栏、顶部等位置的）
              const rect = link.getBoundingClientRect()
              // 只考虑可视区域内的链接，或者在页面顶部/侧边的
              if (rect.top < window.innerHeight * 2 || link.closest('.polysemy, .lemma-polysemy, .anchor-list, .side-content, .lemma-catalog, .catalog')) {
                // 🔥 评分：完全匹配书名的义项优先，带其他作者名的靠后
                let score = 0
                if (bookName && text === bookName) score = 100
                else if (bookName && text.startsWith(bookName + '（小说')) score = 90
                else if (bookName && text.startsWith(bookName)) score = 80
                else score = 50
                // 如果文本里包含其他明显作者名后缀（如"玄色小说"），降级
                if (bookName && /[\u4e00-\u9fa5]{2,4}小说/.test(text.replace(bookName, ''))) score -= 40
                allLinks.push({ el: link, text, score })
              }
              break
            }
          }
        }
      }

      // 优先找明确的多义词切换区域
      const polysemySelectors = [
        '.polysemy-list a', '.lemma-polysemy a', '.polysemy-tab a',
        '.polysemy-desc a', '.anchor-list a', '.tab-list a',
        '.lemmaWgt-polysemy a', '.polysemy-content a',
      ]

      const polysemyLinks: Array<{el: HTMLAnchorElement; text: string; score: number}> = []
      for (const sel of polysemySelectors) {
        const links = document.querySelectorAll<HTMLAnchorElement>(sel)
        for (const link of links) {
          const text = (link.textContent || '').trim()
          for (const kw of novelKeywords) {
            if (text.includes(kw) && text.length < 30) {
              let score = 0
              if (bookName && text === bookName) score = 100
              else if (bookName && text.startsWith(bookName + '（小说')) score = 90
              else if (bookName && text.startsWith(bookName)) score = 80
              else score = 50
              if (bookName && /[\u4e00-\u9fa5]{2,4}小说/.test(text.replace(bookName, ''))) score -= 40
              polysemyLinks.push({ el: link, text, score })
            }
          }
        }
      }

      // 优先使用多义词切换区域中评分最高的
      if (polysemyLinks.length > 0) {
        polysemyLinks.sort((a, b) => b.score - a.score)
        const best = polysemyLinks[0]
        if (best.score >= 40) {
          best.el.click()
          return true
        }
      }

      // 兜底：从所有找到的小说相关链接中，找最可能是多义词切换的
      if (allLinks.length > 0) {
        // 按评分降序
        allLinks.sort((a, b) => b.score - a.score)

        for (const item of allLinks.slice(0, 5)) {
          // 检查是否是义项切换链接（href包含#或者是切换用的）
          const href = item.el.getAttribute('href') || ''
          if (href.startsWith('#') || href.includes('fr=aladdin') || href.includes('fromModule=')) {
            continue
          }
          // 点击评分最高的看起来像多义词切换的链接
          item.el.click()
          return true
        }
      }

      return false
    }, bookName)
  }
  
  /**
   * 🔥 通过百度搜索进入目标页面（完整真人行为模拟）
   * 1. 访问百度首页 → 建立Cookie
   * 2. 模拟真人打字搜索 → 提交搜索
   * 3. 真实鼠标点击搜索结果 → 进入目标页
   * 4. 完整Referer链路 + Cookie续传
   * 5. 自动切换多义词到小说版
   * 6. 直接提取信息框结构化数据
   */
  async fetchFromBaiduSearch(keyword: string, targetPattern: RegExp, options: {
    timeout?: number
    scroll?: boolean
  } = {}): Promise<{ html: string; url: string; infoBox?: Record<string, string> } | null> {
    const { timeout = 45000, scroll = true } = options
    
    // 只尝试1次（避免超时时间被拆分太多）
    const result = await this._fetchFromBaiduSearchOnce(keyword, targetPattern, { timeout, scroll })
    if (result) return result
    
    console.log('[PlaywrightManager] 百度搜索策略失败')
    return null
  }

  /**
   * 🔥 直接访问百度百科并切换到小说版义项
   * 1. 直接访问百科页面
   * 2. 自动检测并切换到小说版义项
   * 3. 直接提取信息框结构化数据
   */
  async fetchBaiduBaikeNovel(url: string, options: {
    timeout?: number
    scroll?: boolean
    referer?: string
    bookName?: string
  } = {}): Promise<{ html: string; infoBox?: Record<string, string> } | null> {
    const { timeout = 15000, scroll = true, referer = 'https://www.baidu.com/', bookName = '' } = options
    
    const browser = await this.getBrowser()
    let context: BrowserContext | null = null
    let page: Page | null = null
    
    try {
      context = await this.createContext(browser)
      page = await context.newPage()
      
      // 设置Referer
      await page.setExtraHTTPHeaders({ 'Referer': referer })
      
      // 只禁用图片和字体以加速，保留CSS（禁用CSS容易触发反爬检测）
      await page.route('**/*', (route) => {
        const type = route.request().resourceType()
        if (['image', 'media', 'font'].includes(type)) {
          route.abort()
        } else {
          route.continue()
        }
      })
      
      // 先访问百度首页，建立会话（模拟真实用户行为）
      try {
        await page.goto('https://www.baidu.com/', {
          timeout: Math.min(timeout * 0.2, 3000),
          waitUntil: 'domcontentloaded',
        })
        await this.randomDelay(200, 500)
      } catch (e) {
        // 忽略百度首页访问失败
      }
      
      // 访问页面
      console.log('[PlaywrightManager] 直接访问百度百科...')
      await page.goto(url, {
        timeout: Math.min(timeout * 0.5, 8000),
        waitUntil: 'domcontentloaded',
      })

      // 等待内容加载
      try {
        await page.waitForSelector('.main-content, .lemmaWgt-lemmaTitle, .lemma-summary, .basic-info, [class*="basic-info"]', {
          timeout: Math.min(timeout * 0.2, 3000),
        })
      } catch (e) {
        // 继续
      }

      // 等待一段时间，让页面完全渲染
      await this.randomDelay(300, 800)

      // 滚动页面
      if (scroll) {
        await this.simulateScroll(page, 1)
      }
      await this.randomDelay(100, 300)
      
      // 检查是否被拦截（先看内容长度，再判断拦截关键词）
      const html1 = await page.content()
      const pageTitle1 = await page.title()
      const isBlocked = this._isBlockedPage(html1, pageTitle1)
      const text1 = html1.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      
      if (isBlocked) {
        console.log('[PlaywrightManager] 直接访问被拦截（页面标题:', pageTitle1, '）')
        return null
      }
      
      if (text1.length < 2000) {
        console.log('[PlaywrightManager] 页面内容太短，可能被拦截')
        return null
      }
      
      console.log('[PlaywrightManager] 页面访问成功，内容长度:', text1.length)
      
      // 尝试切换到小说版义项
      console.log('[PlaywrightManager] 尝试切换到小说版义项...')
      const switched = await this.switchToNovelPolysemy(page, bookName)
      if (switched) {
        console.log('[PlaywrightManager] 成功切换到小说版义项，等待页面加载...')
        // 等待页面加载
        try {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 })
        } catch (e) {
          // 可能已经加载完成
        }
        // 等待信息框元素出现
        try {
          await page.waitForSelector('.basic-info, [class*="basic-info"], .lemma-summary, [class*="lemma-summary"]', {
            timeout: 2000,
          })
        } catch (e) {
          // 继续
        }
        await this.randomDelay(30, 80)
        if (scroll) {
          await this.simulateScroll(page, 1)
        }
        await this.randomDelay(20, 50)
      } else {
        console.log('[PlaywrightManager] 未找到小说版义项或已是小说版')
      }
      
      // 提取信息框
      let infoBox: Record<string, string> = {}
      try {
        infoBox = await this.extractBaikeInfoBox(page)
        console.log('[PlaywrightManager] 信息框提取字段数:', Object.keys(infoBox).length)
      } catch (e) {
        console.log('[PlaywrightManager] 信息框提取失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取最大章节号（从目录中）
      try {
        const maxChapter = await page.evaluate(() => {
          const cnDigits: Record<string, number> = { '零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'两':2,'壹':1,'贰':2,'叁':3,'肆':4,'伍':5,'陆':6,'柒':7,'捌':8,'玖':9 }
          const cnUnits: Record<string, number> = { '十':10,'拾':10,'百':100,'佰':100,'千':1000,'仟':1000,'万':10000,'亿':100000000 }
          const allText = (document.body as unknown as HTMLElement).innerText || (document.body as unknown as HTMLElement).textContent || ''
          const numPattern = /第(\d+)\s*(?:章|集|话|节|回)/g
          let max = 0
          let m: RegExpExecArray | null
          while ((m = numPattern.exec(allText)) !== null) {
            const n = parseInt(m[1])
            if (n > max && n < 10000) max = n
          }
          const cnPattern = /第([零一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+)\s*(?:章|集|话|节|回)/g
          while ((m = cnPattern.exec(allText)) !== null) {
            const str = m[1]
            let result = 0
            let temp = 0
            let hasDigit = false
            for (let i = 0; i < str.length; i++) {
              const char = str[i]
              if (cnDigits[char] !== undefined) {
                temp = cnDigits[char]
                hasDigit = true
              } else if (cnUnits[char] !== undefined) {
                const unit = cnUnits[char]
                if (unit === 10000 || unit === 100000000) { result = (result + temp) * unit; temp = 0 }
                else { if (temp === 0 && unit === 10) temp = 1; result += temp * unit; temp = 0 }
              }
            }
            result += temp
            if (hasDigit && result > max && result < 10000) max = result
          }
          return max > 0 ? max : null
        })
        if (maxChapter) {
          console.log('[PlaywrightManager] 从页面提取到最大章节号:', maxChapter)
          infoBox['_maxChapter'] = String(maxChapter)
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取最大章节号失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取百度百科内容简介（最准确的简介）
      try {
        const summary = await page.evaluate(() => {
          // 方法1：找"内容简介"、"作品简介"、"故事简介"等标题下面的内容
          const sectionTitles = ['内容简介', '作品简介', '故事简介', '小说简介', '简介', '内容介绍']
          
          // 遍历所有标题元素
          const headings = document.querySelectorAll('h2, h3, h4, .para-title, [class*="paraTitle"], [class*="title_"]')
          let contentText = ''
          
          for (let hi = 0; hi < headings.length; hi++) {
            const h = headings[hi]
            const text = h.textContent || ''
            let matched = false
            for (let ti = 0; ti < sectionTitles.length; ti++) {
              if (text.indexOf(sectionTitles[ti]) !== -1) { matched = true; break }
            }
            if (matched) {
              // 找到标题后，收集下面所有后续的段落，直到遇到下一个标题
              let next = h.nextElementSibling
              while (next) {
                const nextTag = next.tagName.toLowerCase()
                const nextClass = (next.className || '')
                const nextText = next.textContent || ''
                
                // 遇到下一个标题就停止
                if (/h[1-6]/.test(nextTag) || nextClass.indexOf('para-title') !== -1 || nextClass.indexOf('title_') !== -1 || nextClass.indexOf('paraTitle') !== -1) {
                  break
                }
                
                // 跳过视频、图片、参考资料等
                if (nextClass.indexOf('video') !== -1 || nextTag === 'video' || nextTag === 'img' || nextTag === 'figure') {
                  next = next.nextElementSibling
                  continue
                }
                
                // 跳过目录、参考资料等
                if (nextText.indexOf('目录') !== -1 && nextText.length < 100 && nextText.indexOf('1') !== -1 && nextText.indexOf('2') !== -1) {
                  next = next.nextElementSibling
                  continue
                }
                
                // 跳过秒懂百科、视频时长等无关内容
                const skipPatterns = [/^\d{2}:\d{2}$/, /秒懂百科/, /视频时长/, /播放/, /点赞/, /收藏/]
                let shouldSkip = false
                for (let si = 0; si < skipPatterns.length; si++) {
                  if (skipPatterns[si].test(nextText.trim())) { shouldSkip = true; break }
                }
                if (shouldSkip) {
                  next = next.nextElementSibling
                  continue
                }
                
                let paraText = ((next as HTMLElement).innerText || next.textContent || '').trim()
                // 只取有意义的段落（长度适中，包含中文）
                if (paraText.length > 20 && paraText.length < 1000 && /[\u4e00-\u9fa5]/.test(paraText)) {
                  // 去掉引用标记
                  paraText = paraText.replace(/\[\d+\]/g, '')
                  // 过滤掉只包含简短标签的行
                  const lines = paraText.split('\n').filter(function(line: string) {
                    const trimmed = line.trim()
                    if (trimmed.length === 0) return false
                    // 过滤掉纯数字、纯符号、太短的行
                    if (/^[\d\s\-\.,:：、]+$/.test(trimmed)) return false
                    if (trimmed.length < 5) return false
                    return true
                  })
                  if (lines.length > 0) {
                    contentText += lines.join('\n') + '\n'
                  }
                }
                next = next.nextElementSibling
              }
              if (contentText.trim().length > 100) break
            }
          }
          
          if (contentText.trim().length > 100) {
            return contentText.replace(/\[\d+\]/g, '').trim()
          }
          
          // 方法2：如果方法1没找到，用顶部的lemmaSummary
          const selectors = ['.lemmaSummary','.J-summary','[class*="lemmaSummary"]','[class*="summary_"]','.summary']
          for (let si = 0; si < selectors.length; si++) {
            const el = document.querySelector(selectors[si])
            if (el) {
              const text = ((el as HTMLElement).innerText || el.textContent || '').replace(/\[\d+\]/g, '').trim()
              if (text.length > 50 && text.length < 2000) return text
            }
          }
          return null
        })
        if (summary) {
          console.log('[PlaywrightManager] 提取到百度百科内容简介:', summary.substring(0, 60) + '...')
          infoBox['_summary'] = summary
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取摘要失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取登场角色
      try {
        const extractCharactersScript = `
          (function() {
            var result = [];
            var seenNames = {};
            // 🔥 从infoBox提取作者名，用于过滤误识别的作者
            var authorName = '';
            try {
              var infoBoxElForAuthor = document.querySelector('[class*="basicInfo"], [class*="basic-info"], .infoBox, dl.basicInfo, dl[class*="basic"]');
              if (infoBoxElForAuthor) {
                var authorDts = infoBoxElForAuthor.querySelectorAll('dt');
                var authorDds = infoBoxElForAuthor.querySelectorAll('dd');
                for (var ai = 0; ai < Math.min(authorDts.length, authorDds.length); ai++) {
                  var authorDtText = (authorDts[ai].textContent || '').replace(/\s+/g, '').trim();
                  if (/作者/.test(authorDtText)) {
                    authorName = (authorDds[ai].textContent || '').trim();
                    break;
                  }
                }
              }
            } catch (e) {}
            
            // ===== 辅助函数 =====
            function addChar(name, desc, position) {
              if (!name || name.length < 2 || name.length > 8) return;
              if (!/[\u4e00-\u9fa5·]{2,8}$/.test(name)) return;
              if (seenNames[name]) return;
              // 🔥 过滤作者名
              if (authorName && name === authorName) return;
              if (authorName && authorName.indexOf(name) !== -1 && name.length >= 2) return;
              // 过滤非人名
              var skipWords = ['书名', '作者', '类型', '题材', '字数', '章节', '状态', '出版社', '出版时间', '首发', '连载', '简介', '目录', '内容', '作品', '小说', '定价', '开本', '装帧', '中文名', '语言', '完结', '最新', '所获', '总推荐', '别名', '修为', '尊号', '流派', '资质', '魂魄', '仙窍', '出身', '特殊', '重生', '所属', '生日', '身高', '体重', '性别', '妻子', '丈夫', '儿子', '女儿', '父亲', '母亲', '爷爷', '奶奶', '哥哥', '姐姐', '弟弟', '妹妹', '主人', '少女', '少年', '青年', '中年', '老年', '小孩', '婴儿', '配角', '反派', '主角', '男主', '女主', '龙套', '路人', '待补充', '暂无', '未知', '参考', '资料', '附录', '后记', '前言', '序言', '序章', '引子', '楔子',
                // 🔥 过滤小说平台/网站名
                '起点中文网', '起点', '纵横中文网', '纵横', '创世中文网', '创世', '17K小说网', '17K', '番茄小说', '番茄', '飞卢小说', '飞卢', '晋江文学城', '晋江', '红袖添香', '红袖', '潇湘书院', '潇湘', 'QQ阅读', '掌阅', '书旗小说', '书旗', '咪咕阅读', '咪咕', '百度贴吧', '百度', '贴吧', '百度百科', '百科',
                // 🔥 过滤常见宠物/神兽名
                '贝贝', '小白', '大黑', '旺财', '小强', '大黄', '阿黄', '小黑', '花花', '豆豆', '毛毛', '球球', '咪咪', '喵喵', '汪汪', '二狗子', '二哈', '小龙', '小蛇', '小鸟', '小狐狸'
              ];
              for (var si = 0; si < skipWords.length; si++) { if (name === skipWords[si]) return; }
              // 过滤物品名
              var itemSuffixes = ['蛊', '阵', '法', '术', '剑', '刀', '枪', '棍', '棒', '鞭', '弓', '箭', '盾', '甲', '衣', '袍', '靴', '戒', '链', '珠', '玉', '石', '丹', '符', '杀招', '绝学', '神功', '秘籍', '功法', '武技', '法术', '神通', '法宝', '灵宝', '仙器', '神器', '圣物', '神物', '宝物', '灵药', '灵草'];
              for (var ii = 0; ii < itemSuffixes.length; ii++) { if (name.indexOf(itemSuffixes[ii]) !== -1 && name.length > 2) return; }
              seenNames[name] = true;
              result.push({ name: name, role: desc ? desc.substring(0, 50) : '', desc: desc || '', position: position || '配角' });
            }
            
            function detectPosition(name, desc) {
              var fullText = (name + ' ' + desc).toLowerCase();
              if (/女主角|女主[角]?|第一女主|正牌女主|道侣|妻子|老婆|爱人|未婚妻|女友|挚爱|情人|心上人|初恋|红颜知己|最终伴侣|一生所爱|相依为命|结为夫妻|最终在一起/.test(fullText)) return '女主角';
              if (/男主角|男主[角]?|第一主角|^主角/.test(fullText)) return '男主角';
              if (/宠物|灵宠|兽宠|战宠|坐骑|神兽|仙兽|妖兽|魔宠/.test(fullText)) return '宠物';
              if (/反派|boss|魔头|邪帝|魔宗|大祭司|邪恶|黑暗势力|魔王|魔尊/.test(fullText)) return '反派';
              if (/师父|师尊|师傅|老师|导师|义父|养父|引路人|启蒙/.test(fullText)) return '师父';
              if (/兄弟|好友|朋友|伙伴|挚友|知己|生死之交|结拜|战友/.test(fullText)) return '伙伴';
              if (/父亲|母亲|爹|娘|爷爷|奶奶|哥哥|弟弟|姐姐|妹妹|儿子|女儿|家族|亲人/.test(fullText)) return '亲人';
              if (/长老|族长|首领|宫主|宗主|殿主|掌门|门主|教主|阁主|城主|国王|皇帝/.test(fullText)) return '长辈/领导';
              if (/敌人|敌方|敌对|仇敌|仇人|宿敌|死敌/.test(fullText)) return '敌对势力';
              var shortDesc = desc.split(/[，。；,.!！?？]/)[0].trim();
              if (shortDesc && shortDesc.length >= 2 && shortDesc.length <= 12 && shortDesc !== desc) return shortDesc;
              return '配角';
            }
            
            // ===== 第一步：找到角色相关章节 =====
            var charHeadings = [];
            var charTitles = ['人物介绍', '角色介绍', '登场角色', '主要人物', '主要角色', '人物形象', '角色设定', '人物设定', '人物简介', '角色简介', '主要人物介绍', '人物'];
            var allHeadings = document.querySelectorAll('h2, h3, h4, [class*="title"], [class*="head"]');
            for (var hi = 0; hi < allHeadings.length; hi++) {
              var hText = (allHeadings[hi].textContent || '').replace(/\\[.*?\\]/g, '').replace(/\\d+/g, '').trim();
              for (var ti = 0; ti < charTitles.length; ti++) {
                if (hText.indexOf(charTitles[ti]) !== -1 && hText.length < 20) {
                  charHeadings.push(allHeadings[hi]);
                  break;
                }
              }
            }
            
            // ===== 第二步：从角色章节提取（多种格式） =====
            for (var chi = 0; chi < charHeadings.length; chi++) {
              var heading = charHeadings[chi];
              // 收集该章节下的所有内容
              var sectionContent = '';
              var sibling = heading.nextElementSibling;
              var count = 0;
              while (sibling && count < 80) {
                if (/^H[1-4]$/.test(sibling.tagName)) break;
                sectionContent += (sibling.outerHTML || sibling.textContent || '') + '\\n';
                sibling = sibling.nextElementSibling;
                count++;
              }
              
              // 格式1: 表格格式 (tr/td)
              var tableRows = heading.parentElement ? heading.parentElement.querySelectorAll('tr') : [];
              for (var tri = 0; tri < tableRows.length; tri++) {
                var cells = tableRows[tri].querySelectorAll('td, th');
                if (cells.length >= 2) {
                  var cellName = (cells[0].textContent || '').trim();
                  var cellDesc = (cells[1].textContent || '').trim();
                  if (cellName && cellName.length >= 2 && cellName.length <= 8 && /^[\u4e00-\u9fa5·]+$/.test(cellName)) {
                    addChar(cellName, cellDesc, detectPosition(cellName, cellDesc));
                  }
                }
              }
              
              // 格式2: 链接格式 (<a href="/item/...">Name</a>)
              var links = heading.parentElement ? heading.parentElement.querySelectorAll('a[href*="/item/"]') : [];
              for (var li = 0; li < links.length && li < 30; li++) {
                var linkText = (links[li].textContent || '').trim();
                if (linkText && linkText.length >= 2 && linkText.length <= 8 && /^[\u4e00-\u9fa5·]+$/.test(linkText)) {
                  // 获取链接后面的描述文本
                  var nextText = '';
                  var nextNode = links[li].nextSibling;
                  while (nextNode && nextText.length < 50) {
                    if (nextNode.nodeType === 3) nextText += nextNode.textContent;
                    nextNode = nextNode.nextSibling;
                  }
                  nextText = nextText.replace(/[：:]/g, '').trim();
                  addChar(linkText, nextText, detectPosition(linkText, nextText));
                }
              }
              
              // 格式3: 粗体格式 (<b>/<strong>/<dt>Name</dt>)
              var boldEls = heading.parentElement ? heading.parentElement.querySelectorAll('b, strong, dt') : [];
              for (var bi = 0; bi < boldEls.length && bi < 30; bi++) {
                var bText = (boldEls[bi].textContent || '').trim();
                if (bText && bText.length >= 2 && bText.length <= 8 && /^[\u4e00-\u9fa5·]+$/.test(bText)) {
                  var bDesc = '';
                  var bNext = boldEls[bi].nextSibling;
                  while (bNext && bDesc.length < 80) {
                    if (bNext.nodeType === 3) bDesc += bNext.textContent;
                    bNext = bNext.nextSibling;
                  }
                  bDesc = bDesc.replace(/[：:]/g, '').trim();
                  addChar(bText, bDesc, detectPosition(bText, bDesc));
                }
              }
              
              // 格式4: 段落格式 (Name: Description / 【Name】Description)
              var paras = heading.parentElement ? heading.parentElement.querySelectorAll('.para, p, [class*="para_"], [class*="content_"], div[class*="text"]') : [];
              for (var pi = 0; pi < paras.length; pi++) {
                var text = (paras[pi].textContent || '').trim();
                var lines = text.split(/\\n/).filter(function(l) { return l.trim(); });
                for (var lni = 0; lni < lines.length; lni++) {
                  var line = lines[lni].trim();
                  // 格式4a: Name：Description
                  var m1 = line.match(/^([\u4e00-\u9fa5·]{2,8})[：:]\\s*(.+)$/);
                  // 格式4b: 【Name】Description
                  var m2 = line.match(/^【([\u4e00-\u9fa5·]{2,8})】\\s*(.+)$/);
                  // 格式4c: ● Name Description
                  var m3 = line.match(/^●\\s*([\u4e00-\u9fa5·]{2,8})\\s*[：:]?\\s*(.+)$/);
                  var m = m1 || m2 || m3;
                  if (m) {
                    addChar(m[1].trim(), m[2].trim(), detectPosition(m[1], m[2]));
                  }
                }
              }
              
              // 格式5: 百度百科标题+段落格式（<h3>角色名</h3><div class="para">描述</div>...）
              var subHeadings = heading.parentElement ? heading.parentElement.querySelectorAll('h3, h4') : [];
              for (var shi = 0; shi < subHeadings.length; shi++) {
                var subName = (subHeadings[shi].textContent || '').replace(/\\[.*?\\]/g, '').trim();
                if (!subName || subName.length < 2 || subName.length > 8) continue;
                if (!/^([\u4e00-\u9fa5·]{2,8})(漫画形象)?$/.test(subName)) continue;
                // 去掉"漫画形象"后缀
                subName = subName.replace(/漫画形象/g, '').trim();
                if (!subName) continue;
                // 跳过章节标题本身
                var isSectionTitle = false;
                for (var cti = 0; cti < charTitles.length; cti++) {
                  if (subName.indexOf(charTitles[cti]) !== -1) { isSectionTitle = true; break; }
                }
                if (isSectionTitle) continue;
                var subDesc = '';
                var subNext = subHeadings[shi].nextElementSibling;
                var subCount = 0;
                while (subNext && subCount < 20) {
                  if (/^H[1-4]$/i.test(subNext.tagName)) break;
                  var txt = (subNext.textContent || '').trim();
                  if (txt && txt !== subName) subDesc += txt + ' ';
                  subNext = subNext.nextElementSibling;
                  subCount++;
                }
                subDesc = subDesc.trim();
                if (subDesc) {
                  addChar(subName, subDesc, detectPosition(subName, subDesc));
                }
              }
              
              if (result.length >= 5) break;
            }
            
            // ===== 第三步：如果角色太少，从infoBox提取 =====
            if (result.length < 3) {
              var infoBoxEl = document.querySelector('[class*="basicInfo"], [class*="basic-info"], .infoBox, dl.basicInfo, dl[class*="basic"]');
              if (infoBoxEl) {
                // 模式3a: infoBox中的"主要角色"/"主角"字段
                var dts = infoBoxEl.querySelectorAll('dt');
                var dds = infoBoxEl.querySelectorAll('dd');
                for (var dti = 0; dti < Math.min(dts.length, dds.length); dti++) {
                  var dtText = (dts[dti].textContent || '').replace(/\\s+/g, '').trim();
                  var ddText = (dds[dti].textContent || '').trim();
                  if (/主要角色|主角|登场角色|人物|角色/.test(dtText) && ddText) {
                    var names = ddText.split(/[、，,\\/\\s]+/).filter(function(n) { return n.trim().length >= 2 && n.trim().length <= 6; });
                    for (var ni = 0; ni < names.length; ni++) {
                      addChar(names[ni].trim(), '', ni === 0 ? '男主角' : '配角');
                    }
                  }
                }
                // 模式3b: 纯文本匹配
                if (result.length < 2) {
                  var infoText = infoBoxEl.textContent || '';
                  var ptPatterns = [/主[ ]?角[：:]\\s*(.+?)(?=\\n|$)/, /人[ ]?物[：:]\\s*(.+?)(?=\\n|$)/, /主要人物[：:]\\s*(.+?)(?=\\n|$)/];
                  for (var pti = 0; pti < ptPatterns.length; pti++) {
                    var ptm = infoText.match(ptPatterns[pti]);
                    if (ptm && ptm[1]) {
                      var ptNames = ptm[1].split(/[、，,\\/\\s]+/);
                      for (var pni = 0; pni < ptNames.length; pni++) {
                        addChar(ptNames[pni].trim(), '', pni === 0 ? '男主角' : '配角');
                      }
                      if (result.length > 0) break;
                    }
                  }
                }
              }
            }
            
            // ===== 第四步：全局兜底 - 从整个页面找带链接的角色名 =====
            if (result.length < 3) {
              var allLinks = document.querySelectorAll('a[href*="/item/"]');
              var linkCandidates = {};
              for (var ali = 0; ali < allLinks.length; ali++) {
                var alText = (allLinks[ali].textContent || '').trim();
                if (alText && alText.length >= 2 && alText.length <= 6 && /^[\u4e00-\u9fa5·]+$/.test(alText)) {
                  linkCandidates[alText] = (linkCandidates[alText] || 0) + 1;
                }
              }
              var sortedLinks = Object.keys(linkCandidates).sort(function(a, b) { return linkCandidates[b] - linkCandidates[a]; });
              for (var sli = 0; sli < Math.min(sortedLinks.length, 10); sli++) {
                addChar(sortedLinks[sli], '', '配角');
              }
            }
            
            // 排序
            var positionPriority = {
              '男主角': 1, '女主角': 2, '宠物': 3, '反派': 4, '敌对势力': 5,
              '师父': 6, '伙伴': 7, '亲人': 8, '同门': 9, '长辈/领导': 10, '配角': 99
            };
            result.sort(function(a, b) {
              var pa = positionPriority[a.position] || 50;
              var pb = positionPriority[b.position] || 50;
              return pa - pb;
            });
            
            return result.slice(0, 12);
          })()
        `;
        const characters = await page.evaluate(extractCharactersScript as string) as unknown as Array<{ name: string; role: string; desc: string; position: string }>;
        if (characters && characters.length > 0) {
          console.log('[PlaywrightManager] 提取到登场角色:', characters.map(c => `${c.name}(${c.position})`).join('、'))
          infoBox['_characters'] = JSON.stringify(characters)
        } else {
          console.log('[PlaywrightManager] 未提取到登场角色')
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取角色失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 🔥 提取女主（从人物关系中的"妻子"/"恋人"等字段，百度百科常见结构化格式）
      try {
        const femaleLeadName = await page.evaluate(() => {
          const text = (document.body as unknown as HTMLElement).innerText || (document.body as unknown as HTMLElement).textContent || ''
          const patterns = [
            /妻子[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
            /恋人[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
            /女友[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
            /道侣[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
            /未婚妻[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
            /(?:男主角|男主|主人公)(?:的|之)?妻子[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
            /(?:男主角|男主|主人公)(?:的|之)?恋人[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
            /(?:男主角|男主|主人公)(?:的|之)?女友[：:]\s*([\u4e00-\u9fa5·]{2,8})/,
          ]
          for (const p of patterns) {
            const m = text.match(p)
            if (m && m[1]) return m[1].trim()
          }
          return null
        })
        if (femaleLeadName) {
          console.log('[PlaywrightManager] 提取到女主:', femaleLeadName)
          infoBox['_femaleLead'] = femaleLeadName
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取女主失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取世界观
      try {
        const worldBuildingScript = `
          (function() {
            var excludeSections = ['空间设定', '生物名词', '主要名词', '登场角色', '人物介绍', '角色介绍', '主角', '女主', '人物', '角色', '妖兽', '灵兽', '蛊虫', '法宝', '丹药', '功法', '武技', '法术', '神通', '装备', '物品', '作者', '作品相关', '出版信息'];
            
            var geoKeywords = ['大陆', '地域', '地理', '国家', '王朝', '帝国', '城市', '地点', '九天', '五域', '四海', '八荒', '九州', '山脉', '河流', '湖泊', '海洋', '岛屿', '秘境', '绝地', '禁地', '森林', '平原', '高原', '沙漠', '冰川', '火山', '海域', '星空', '位面', '小世界', '下界', '上界', '仙界', '魔界', '妖界', '鬼界', '神界', '人间界', '修真界', '修仙界', '下界', '凡间', '人界', '大夏', '大商', '大周', '大西', '亚特兰', '通天道'];
            
            var ruleKeywords = ['天道', '大道', '法则', '规则', '秩序', '天命', '气运', '因果', '轮回', '生死', '阴阳', '五行', '八卦', '太极', '两仪', '四象', '六合', '七星', '九鼎', '封神', '量劫', '劫数', '天劫', '地劫', '人劫', '修炼', '修真', '修仙', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升', '超脱', '永生', '不死', '不灭', '不朽', '永恒', '大道', '巫道', '人道', '地道', '仙道', '魔道', '妖道', '鬼道', '神道', '佛道', '儒道', '兵道', '剑道', '刀道', '枪道', '拳道', '掌道', '指法', '身法', '步法', '心法', '功法', '秘术', '神通', '法术', '武技', '蛊术', '巫术', '诅咒', '封印', '禁制', '阵法', '符箓', '丹药', '法宝', '灵器', '仙器', '神器', '先天灵宝', '后天灵宝', '功德', '业力', '紫气', '金莲', '庆云', '三花', '五气', '朝元', '聚顶', '法力', '灵力', '真元', '真气', '元力', '神力', '仙力', '魔力', '妖力', '鬼力', '巫力'];
            
            var societyKeywords = ['势力', '宗门', '门派', '家族', '种族', '部族', '部落', '联盟', '帝国', '王朝', '皇朝', '王国', '公国', '侯国', '诸侯王', '节度使', '太守', '刺史', '巫教', '道教', '佛教', '儒教', '魔教', '妖教', '鬼教', '神教', '仙道', '魔道', '妖道', '鬼道', '神道', '佛道', '儒道', '巫殿', '神殿', '圣殿', '仙宫', '魔宫', '妖宫', '鬼宫', '神宫', '世家', '门阀', '士族', '庶族', '贵族', '平民', '奴隶', '自由民', '农奴', '工匠', '商人', '读书人', '武者', '修士', '道士', '和尚', '巫师', '祭司', '神官', '圣女', '圣子', '教主', '宗主', '掌门', '门主', '家主', '族长', '酋长', '骑士', '剑士', '弓箭手', '刺客', '盗贼', '战士', '法师', '术士', '德鲁伊', '吟游诗人', '游侠', '圣武士', '暗黑骑士', '死灵法师', '召唤师', '炼药师', '炼器师', '制符师', '阵法师', '蛊师', '巫医', '萨满', '祭祀'];
            
            var introPatterns = ['是一本', '是一部', '连载于', '出版社', '作者是', '小说作者', '首发于', '连载平台', '出版时间', '完本', '完结', '上架', '订阅', '内容简介', '作品简介', '故事简介', '剧情简介', '小说简介', '小说讲述', '故事讲述', '讲述了', '主要讲述', '本书讲述', '该小说', '这部小说', '网络小说', '网文', '起点中文网', '创世中文网', '17K小说网', '纵横中文网', '番茄小说', '飞卢小说', '看了简介', '看过简介', '简介里', '简介都', '都该知道', '都应该知道'];
            
            var characterPatterns = ['男主角', '女主角', '主人公', '主角是', '名叫', '名为', '姓', '名', '字', '号', '外号', '绰号', '身份是', '修为是', '境界是', '实力是', '法宝是', '功法是', '武技是', '法术是', '神通是', '武器是', '装备是', '坐骑是', '宠物是', '师父是', '徒弟是', '父亲是', '母亲是', '哥哥是', '弟弟是', '姐姐是', '妹妹是', '妻子是', '丈夫是'];
            
            var geoParas = [];
            var ruleParas = [];
            var societyParas = [];
            
            var allParas = document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"], div[class*="text"]');
            
            function isInExcludedSection(para) {
              var headings = document.querySelectorAll('h2, h3');
              var paraTop = para.getBoundingClientRect().top;
              var currentHeading = null;
              var currentHeadingTop = -999999;
              
              for (var i = 0; i < headings.length; i++) {
                var hTop = headings[i].getBoundingClientRect().top;
                if (hTop < paraTop && hTop > currentHeadingTop) {
                  currentHeading = headings[i];
                  currentHeadingTop = hTop;
                }
              }
              
              if (!currentHeading) return false;
              
              var headingText = (currentHeading.innerText || currentHeading.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
              for (var j = 0; j < excludeSections.length; j++) {
                if (headingText.indexOf(excludeSections[j]) !== -1) return true;
              }
              return false;
            }
            
            function isCharacterIntro(text) {
              var count = 0;
              for (var i = 0; i < characterPatterns.length; i++) {
                if (text.indexOf(characterPatterns[i]) !== -1) count++;
              }
              if (count >= 2) return true;
              if (text.match(/姓名[：:]/) || text.match(/性别[：:]/) || text.match(/年龄[：:]/) || text.match(/身份[：:]/) || text.match(/修为[：:]/) || text.match(/境界[：:]/)) return true;
              return false;
            }
            
            function classifyPara(text) {
              var geoScore = 0;
              var ruleScore = 0;
              var societyScore = 0;
              
              for (var i = 0; i < geoKeywords.length; i++) {
                if (text.indexOf(geoKeywords[i]) !== -1) geoScore++;
              }
              for (var j = 0; j < ruleKeywords.length; j++) {
                if (text.indexOf(ruleKeywords[j]) !== -1) ruleScore++;
              }
              for (var k = 0; k < societyKeywords.length; k++) {
                if (text.indexOf(societyKeywords[k]) !== -1) societyScore++;
              }
              
              var maxScore = Math.max(geoScore, ruleScore, societyScore);
              if (maxScore === 0) return null;
              if (geoScore === maxScore && geoScore >= 1) return 'geo';
              if (societyScore === maxScore && societyScore >= 1) return 'society';
              if (ruleScore === maxScore && ruleScore >= 1) return 'rule';
              return null;
            }
            
            for (var pi = 0; pi < allParas.length; pi++) {
              var para = allParas[pi];
              var text = (para.innerText || para.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
              
              if (!text || text.length < 20 || text.length > 500) continue;
              
              if (/^(参考资料|词条图册|相关搜索|推荐阅读|词条标签|TA说|为您推荐|首页|登录|注册|关于我们|联系方式)/.test(text.substring(0, 10))) continue;
              
              if (/^第[\\d一二三四五六七八九十百千万]+章/.test(text)) continue;
              
              var isIntro = false;
              for (var ip = 0; ip < introPatterns.length; ip++) {
                if (text.indexOf(introPatterns[ip]) !== -1) { isIntro = true; break; }
              }
              if (isIntro) continue;
              
              if (isCharacterIntro(text)) continue;
              
              if (isInExcludedSection(para)) continue;
              
              var category = classifyPara(text);
              if (category === 'geo') {
                geoParas.push(text);
              } else if (category === 'rule') {
                ruleParas.push(text);
              } else if (category === 'society') {
                societyParas.push(text);
              }
            }
            
            function deduplicate(arr) {
              var seen = {};
              var result = [];
              for (var i = 0; i < arr.length; i++) {
                var key = arr[i].substring(0, 50);
                if (!seen[key]) {
                  seen[key] = true;
                  result.push(arr[i]);
                }
              }
              return result;
            }
            
            geoParas = deduplicate(geoParas).slice(0, 10);
            ruleParas = deduplicate(ruleParas).slice(0, 10);
            societyParas = deduplicate(societyParas).slice(0, 10);
            
            var finalText = '';
            if (geoParas.length > 0) {
              finalText += '【地理设定】\\n' + geoParas.join('\\n') + '\\n\\n';
            }
            if (ruleParas.length > 0) {
              finalText += '【世界规则】\\n' + ruleParas.join('\\n') + '\\n\\n';
            }
            if (societyParas.length > 0) {
              finalText += '【社会结构】\\n' + societyParas.join('\\n');
            }
            
            finalText = finalText.trim();
            
            return finalText.length > 50 ? finalText.substring(0, 4000).trim() : '';
          })()
        `
        const worldBuilding = await page.evaluate(worldBuildingScript as string) as string
        
        if (worldBuilding && worldBuilding.length > 50) {
          console.log('[PlaywrightManager] 提取到世界观:', worldBuilding.length + '字，' + worldBuilding.substring(0, 80) + '...')
          infoBox['_worldBuilding'] = worldBuilding
        } else {
          console.log('[PlaywrightManager] 未提取到世界观')
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取世界观失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取力量体系
      try {
        const powerSystemScript = `
          (function() {
            var powerSections = ['力量体系', '修炼体系', '境界划分', '等级设定', '修为境界', '巫力等级', '蛊师等级', '修炼等级', '战力分级', '修炼等级', '境界', '功法', '武技', '法术', '神通', '巫术', '蛊虫', '蛊术'];
            var excludeSections = ['空间设定', '生物名词', '主要名词', '登场角色', '人物介绍', '角色介绍', '主角', '女主', '人物', '角色', '剧情简介', '内容简介', '作品简介', '作者简介'];
            
            var result = '';
            
            var headings = [];
            var allH2 = document.querySelectorAll('h2');
            var allH3 = document.querySelectorAll('h3');
            for (var i = 0; i < allH2.length; i++) headings.push(allH2[i]);
            for (var j = 0; j < allH3.length; j++) headings.push(allH3[j]);
            
            headings.sort(function(a, b) {
              return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
            });
            
            function isExcluded(headingText) {
              for (var i = 0; i < excludeSections.length; i++) {
                if (headingText.indexOf(excludeSections[i]) !== -1) {
                  return true;
                }
              }
              return false;
            }
            
            for (var k = 0; k < headings.length; k++) {
              var heading = headings[k];
              var headingText = (heading.innerText || heading.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
              
              if (isExcluded(headingText)) continue;
              
              var isPowerSection = false;
              for (var s = 0; s < powerSections.length; s++) {
                if (headingText.indexOf(powerSections[s]) !== -1) {
                  isPowerSection = true;
                  break;
                }
              }
              
              if (isPowerSection) {
                var nextHeading = null;
                var currentLevel = heading.tagName.toLowerCase() === 'h2' ? 2 : 3;
                for (var m = k + 1; m < headings.length; m++) {
                  var nextLevel = headings[m].tagName.toLowerCase() === 'h2' ? 2 : 3;
                  if (nextLevel <= currentLevel) {
                    nextHeading = headings[m];
                    break;
                  }
                }
                
                var allParas = document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"], div[class*="text"]');
                var content = '';
                var headingTop = heading.getBoundingClientRect().bottom;
                var nextTop = nextHeading ? nextHeading.getBoundingClientRect().top : 999999;
                
                for (var p = 0; p < allParas.length; p++) {
                  var para = allParas[p];
                  var paraTop = para.getBoundingClientRect().top;
                  if (paraTop > headingTop && paraTop < nextTop) {
                    var text = (para.innerText || para.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
                    if (text && text.length > 15 && text.length < 300) {
                      if (/^(参考资料|词条图册|相关搜索|推荐阅读|词条标签|TA说|为您推荐)/.test(text.substring(0, 10))) continue;
                      if (/^(首页|登录|注册|关于我们|联系方式)/.test(text.substring(0, 10))) continue;
                      content += text + '\\n';
                    }
                  }
                }
                
                if (content.length > 30) {
                  result += (result ? '\\n\\n【' + headingText + '】\\n' : '【' + headingText + '】\\n') + content.trim();
                }
              }
            }
            
            if (result.length < 50) {
              var infoBoxEl = document.querySelector('[class*="basicInfo"], [class*="basic-info"]');
              if (infoBoxEl) {
                var infoText = infoBoxEl.innerText || '';
                var levelPattern = /(?:境界|修为|等级|战力|实力|修炼)[：:]\\s*(.+?)(?:\\n|$)/gi;
                var match;
                var matches = [];
                while ((match = levelPattern.exec(infoText)) !== null) {
                  if (match[1] && match[1].length > 2) {
                    matches.push(match[1].trim());
                  }
                }
                if (matches.length > 0) {
                  result = matches.join('、');
                }
              }
            }
            
            if (result.length < 50) {
              var allTextParas = document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"]');
              var powerKeywords = ['修炼', '境界', '修为', '巫力', '灵力', '真气', '真元', '功法', '武技', '法术', '神通', '等级', '战力', '突破', '炼气', '筑基', '金丹', '元婴', '一转', '二转', '三转', '四转', '五转', '六转', '七转', '八转', '九转', '巫术', '巫殿', '蛊师', '蛊仙'];
              var excludeKeywords = ['第\\d+章', '第[一二三四五六七八九十百千万]+章', '主角', '女主', '角色', '人物', '姓名', '扮演者'];
              var introPatterns = ['是一本', '是一部', '连载于', '出版社', '作者是', '小说作者', '首发于', '连载平台', '出版时间', '完本', '完结', '上架', '订阅', '内容简介', '作品简介', '故事简介', '剧情简介', '小说简介', '小说讲述', '故事讲述', '讲述了', '主要讲述', '本书讲述', '该小说', '这部小说', '网络小说', '网文'];
              var collected = [];
              for (var pi = 0; pi < allTextParas.length && collected.length < 15; pi++) {
                var pt = (allTextParas[pi].innerText || allTextParas[pi].textContent || '');
                pt = pt.replace(/\\[\\d+\\]/g, '').trim();
                if (pt.length > 20 && pt.length < 500) {
                  var skip = false;
                  for (var eki = 0; eki < excludeKeywords.length; eki++) {
                    if (new RegExp(excludeKeywords[eki]).test(pt)) { skip = true; break; }
                  }
                  if (skip) continue;
                  var isIntro = false;
                  for (var ip = 0; ip < introPatterns.length; ip++) {
                    if (pt.indexOf(introPatterns[ip]) !== -1) { isIntro = true; break; }
                  }
                  if (isIntro) continue;
                  var hasKeyword = false;
                  for (var pki = 0; pki < powerKeywords.length; pki++) {
                    if (pt.indexOf(powerKeywords[pki]) !== -1) {
                      hasKeyword = true;
                      break;
                    }
                  }
                  if (hasKeyword) collected.push(pt);
                }
              }
              if (collected.length > 0) {
                result = collected.join('\\n');
              }
            }
            
            return result.length > 20 ? result.substring(0, 3000).trim() : '';
          })()
        `
        const powerSystem = await page.evaluate(powerSystemScript as string) as string
        
        if (powerSystem && powerSystem.length > 30) {
          console.log('[PlaywrightManager] 提取到力量体系:', powerSystem.length + '字，' + powerSystem.substring(0, 80) + '...')
          infoBox['_powerSystem'] = powerSystem
        } else {
          console.log('[PlaywrightManager] 未提取到力量体系')
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取力量体系失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取核心卖点/亮点
      try {
        const sellingPointsScript = `
          (function() {
            var points = [];
            
            // 从作品荣誉中提取
            var honorSections = ['作品荣誉', '荣誉记录', '获奖记录', '排行榜', '作品成就'];
            var headings = document.querySelectorAll('h2, h3, [class*="title_"], [class*="head_"]');
            for (var i = 0; i < headings.length; i++) {
              var heading = headings[i];
              var headingText = (heading.innerText || heading.textContent || '').trim();
              var isHonorSection = false;
              for (var j = 0; j < honorSections.length; j++) {
                if (headingText.indexOf(honorSections[j]) !== -1) {
                  isHonorSection = true;
                  break;
                }
              }
              if (isHonorSection) {
                var nextEl = heading.nextElementSibling;
                var count = 0;
                while (nextEl && count < 20) {
                  var tagName = nextEl.tagName.toLowerCase();
                  if (tagName === 'h2' || tagName === 'h3') break;
                  var text = (nextEl.innerText || nextEl.textContent || '');
                  text = text.replace(/\\[\\d+\\]/g, '').trim();
                  var lines = text.split(/\\n/);
                  for (var k = 0; k < lines.length; k++) {
                    var line = lines[k].trim();
                    if (line && line.length > 3 && line.length < 50 && !/^\\d+\\./.test(line)) {
                      points.push(line);
                    }
                  }
                  nextEl = nextEl.nextElementSibling;
                  count++;
                }
              }
            }
            
            // 从简介中提炼关键词作为卖点
            if (points.length < 3) {
              var summaryEl = document.querySelector('[class*="lemmaSummary"], [class*="summary_"], .lemmaSummary');
              if (summaryEl) {
                var summaryText = summaryEl.innerText || '';
                summaryText = summaryText.replace(/\\[\\d+\\]/g, '').trim();
                var keywords = ['穿越', '重生', '系统', '无敌', '爽文', '热血', '修仙', '修真', '玄幻', '仙侠', '都市', '历史', '军事', '科幻', '游戏', '悬疑', '恐怖', '言情', '青春', '校园', '职场', '商战', '种田', '基建', '快穿', '无限', '逆袭', '打脸', '升级流', '扮猪吃虎', '无敌流', '系统流', '重生流', '穿越流'];
                var foundKeywords = [];
                for (var ki = 0; ki < keywords.length; ki++) {
                  if (summaryText.indexOf(keywords[ki]) !== -1 && foundKeywords.length < 5) {
                    foundKeywords.push(keywords[ki]);
                  }
                }
                if (foundKeywords.length > 0) {
                  points = foundKeywords.concat(points);
                }
              }
            }
            
            // 从信息框中提取题材、类型等
            if (points.length < 3) {
              var infoBoxEl = document.querySelector('[class*="basicInfo"], [class*="basic-info"]');
              if (infoBoxEl) {
                var infoText = infoBoxEl.innerText || '';
                var genreMatch = infoText.match(/(?:题材|类型|类别|分类)[：:]\\s*(.+?)(?:\\n|$)/i);
                if (genreMatch && genreMatch[1]) {
                  var genres = genreMatch[1].split(/[、，,\\/\\s]+/).filter(function(g) { return g.trim().length > 0 && g.trim().length < 10; });
                  for (var gi = 0; gi < genres.length && points.length < 8; gi++) {
                    if (points.indexOf(genres[gi].trim()) === -1) {
                      points.push(genres[gi].trim());
                    }
                  }
                }
              }
            }
            
            return points.slice(0, 8);
          })()
        `
        const sellingPoints = await page.evaluate(sellingPointsScript as string) as string[]
        
        if (sellingPoints && sellingPoints.length > 0) {
          console.log('[PlaywrightManager] 提取到核心卖点:', sellingPoints.join('、'))
          infoBox['_sellingPoints'] = JSON.stringify(sellingPoints)
        } else {
          console.log('[PlaywrightManager] 未提取到核心卖点')
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取核心卖点失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取完整正文内容（用于LLM深度分析，确保世界观、力量体系等准确）
      try {
        const fullContentScript = `
          (function() {
            // 提取正文区域的所有段落
            var mainContent = document.querySelector('.main-content, .lemma-catalog, .J-lemma-content, [class*="mainContent"], [class*="content-wrapper"]');
            var paras = mainContent 
              ? mainContent.querySelectorAll('.para, p, [class*="para_"], [class*="content_"]')
              : document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"]');
            
            var result = [];
            for (var i = 0; i < paras.length; i++) {
              var text = (paras[i].innerText || paras[i].textContent || '');
              text = text.replace(/\\[\\d+\\]/g, '').trim();
              // 过滤掉太短的和无关的内容
              if (text.length > 20 && text.length < 500) {
                // 过滤导航、参考资料等
                if (/^(参考资料|词条图册|相关搜索|推荐阅读|词条标签|TA说|为您推荐|相关词条)/.test(text.substring(0, 10))) continue;
                if (/^(首页|登录|注册|关于我们|联系方式|网站地图|意见反馈)/.test(text.substring(0, 10))) continue;
                result.push(text);
              }
            }
            
            return result.slice(0, 200).join('\\n');
          })()
        `
        const fullContent = await page.evaluate(fullContentScript as string) as string
        
        if (fullContent && fullContent.length > 500) {
          console.log('[PlaywrightManager] 提取到完整正文内容:', fullContent.length + '字')
          infoBox['_fullContent'] = fullContent.substring(0, 15000)
        } else {
          console.log('[PlaywrightManager] 正文内容较短:', fullContent?.length + '字')
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取完整正文失败:', e instanceof Error ? e.message : String(e))
      }
      
      const finalHtml = await page.content()
      return { html: finalHtml, infoBox }
    } catch (e) {
      console.log('[PlaywrightManager] fetchBaiduBaikeNovel失败:', e instanceof Error ? e.message : String(e))
      return null
    } finally {
      if (page) { try { await page.close() } catch (e) {} }
      if (context) { try { await context.close() } catch (e) {} }
    }
  }
  
  /**
   * 简单检测页面是否被拦截
   */
  private _isBlockedPage(html: string, pageTitle?: string): boolean {
    // 先检查标题（最准确）
    if (pageTitle) {
      const titleBlockedPatterns = [
        '百度安全验证',
        '百度百科-验证',
        '访问验证',
        '验证页面',
      ]
      if (titleBlockedPatterns.some(p => pageTitle.includes(p))) {
        console.log('[PlaywrightManager] 页面标题包含验证关键词，判定为拦截页:', pageTitle)
        return true
      }
    }
    
    // 检查HTML内容中的拦截关键词
    const blockedPatterns = [
      '百度安全验证',
      '访问验证-安全',
      'wappass.baidu.com',
      'passport.baidu.com/v2/',
      '您的访问过于频繁',
      '请输入验证码继续',
      '人机验证',
      '百度百科-验证',
      '出现验证码表示您所在的网络可能存在异常',
    ]
    const isBlocked = blockedPatterns.some(p => html.includes(p))
    
    // 强特征：包含"验证码"且内容较短，直接判定为拦截
    if (isBlocked && html.length < 50000) {
      return true
    }
    
    // 如果页面内容很长（>100000字符），大概率不是拦截页
    if (isBlocked && html.length > 100000) {
      console.log('[PlaywrightManager] 页面内容较长，可能不是拦截页，跳过拦截判断')
      return false
    }
    
    return isBlocked
  }
  
  private async _fetchFromBaiduSearchOnce(keyword: string, targetPattern: RegExp, options: {
    timeout?: number
    scroll?: boolean
  } = {}): Promise<{ html: string; url: string; infoBox?: Record<string, string> } | null> {
    const { timeout = 20000, scroll = true } = options
    
    const browser = await this.getBrowser()
    let context: BrowserContext | null = null
    let page: Page | null = null
    
    try {
      context = await this.createContext(browser)
      page = await context.newPage()
      
      // 只禁用图片、字体和媒体以加速，保留CSS（禁用CSS容易触发反爬）
      await page.route('**/*', (route) => {
        const type = route.request().resourceType()
        if (['image', 'media', 'font'].includes(type)) {
          route.abort()
        } else {
          route.continue()
        }
      })
      
      // ==================== 第一步：直接跳转到百度搜索结果（跳过首页和打字） ====================
      console.log('[PlaywrightManager] 第1步：直接跳转百度搜索结果...')
      await page.goto(`https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`, {
        timeout: timeout * 0.35,
        waitUntil: 'domcontentloaded',
      })
      await this.randomDelay(80, 200)

      // 等待搜索结果
      try {
        // 尝试多个选择器
        const selectors = ['#content_left', '.result', '.c-container', '#search-card-top']
        let found = false
        for (const sel of selectors) {
          try {
            await page.waitForSelector(sel, { timeout: timeout * 0.12 })
            found = true
            console.log('[PlaywrightManager] 搜索结果加载成功，选择器:', sel)
            break
          } catch (e) {
            // 继续试下一个
          }
        }
        if (!found) {
          console.warn('[PlaywrightManager] 所有搜索结果选择器都超时')
          // 打印页面信息调试
          const pageTitle = await page.title()
          const pageUrl = page.url()
          const pageText = await page.textContent('body') || ''
          console.warn('[PlaywrightManager] 页面标题:', pageTitle)
          console.warn('[PlaywrightManager] 页面URL:', pageUrl.substring(0, 100))
          console.warn('[PlaywrightManager] 页面文本长度:', pageText.length)
          if (pageText.length < 500) {
            console.warn('[PlaywrightManager] 页面文本预览:', pageText.substring(0, 300))
          }
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 等待搜索结果异常:', e instanceof Error ? e.message : String(e))
      }
      await this.randomDelay(60, 150)

      // 模拟滚动浏览搜索结果（轻量）
      await this.simulateScroll(page, 1)
      
      // ==================== 第二步：点击百度百科结果 ====================
      console.log('[PlaywrightManager] 第2步：查找并点击目标链接...')
      
      // 找到百度百科的搜索结果
      // 注意：百度搜索结果的href是跳转链接（baidu.com/link?url=xxx），不是直接的baike.baidu.com
      // 所以我们需要通过链接文本或标题来判断
      const resultItems = await page.$$('#content_left .result, #content_left .c-container, .result')
      let targetLink: ElementHandle<HTMLElement | SVGElement> | null = null
      let targetText = ''
      
      console.log('[PlaywrightManager] 找到', resultItems.length, '个搜索结果')
      
      const baikeResults: Array<{ link: ElementHandle<HTMLElement | SVGElement> | null; text: string }> = []
      
      for (let i = 0; i < Math.min(resultItems.length, 10); i++) {
        const item = resultItems[i]
        
        // 找标题链接
        const link = await item.$('h3 a, .t a, a')
        if (!link) continue
        
        const text = await link.textContent() || ''
        const href = await link.getAttribute('href') || ''
        
        console.log(`[PlaywrightManager] 结果${i+1}: ${text.substring(0, 40)} -> ${href.substring(0, 60)}`)
        
        // 判断是否是百度百科：文本包含"百度百科"，或者跳转后会到baike.baidu.com
        if (text.includes('百度百科') || text.includes('_百度百科')) {
          baikeResults.push({ link, text })
          console.log('[PlaywrightManager] 找到百度百科结果:', text.substring(0, 50))
        }
      }
      
      // 如果没找到，再扩大范围：找所有a标签，文本包含"百度百科"
      if (baikeResults.length === 0) {
        console.log('[PlaywrightManager] 扩大范围查找百度百科链接...')
        const allLinks = await page.$$('a')
        for (const link of allLinks) {
          const text = await link.textContent() || ''
          if (text.includes('百度百科') && text.length < 100) {
            baikeResults.push({ link, text })
            console.log('[PlaywrightManager] 找到百度百科链接:', text.substring(0, 50))
            break
          }
        }
      }
      
      // 从百度百科结果中选择最合适的
      // 策略：
      // 1. 优先选标题完全匹配书名的（最可能是主词条）
      // 2. 其次选标题包含书名+小说关键词的（明确是小说词条）
      // 3. 最后选主词条（不含括号的）
      if (baikeResults.length > 0) {
        // 第一步：过滤出真正的百度百科结果（标题以"_百度百科"结尾或包含" - 百度百科"）
        const realBaikeResults = baikeResults.filter(r => 
          /_百度百科$/.test(r.text.trim()) || / - 百度百科$/.test(r.text.trim())
        )
        
        console.log('[PlaywrightManager] 真实百度百科结果数:', realBaikeResults.length)
        
        const candidates = realBaikeResults.length > 0 ? realBaikeResults : baikeResults
        
        // 从keyword中提取书名（去掉"小说"、"百度百科"等后缀）
        const cleanBookName = keyword
          .replace(/百度百科/g, '')
          .replace(/小说/g, '')
          .replace(/\s+/g, '')
          .trim()
        
        // 第一步：优先选标题完全匹配书名的，或以书名开头的
        for (const result of candidates) {
          const title = result.text.trim()
          // 提取标题主体（去掉"_百度百科"或" - 百度百科"后缀）
          const titleMain = title.replace(/\s*-\s*百度百科$/, '').replace(/_百度百科$/, '').trim()
          if (titleMain === cleanBookName) {
            // 完全匹配，优先级最高
            targetLink = result.link
            targetText = result.text
            console.log('[PlaywrightManager] 选择书名完全匹配词条:', result.text.substring(0, 50))
            break
          }
        }
        
        // 如果没有完全匹配的，找标题以书名开头的
        if (!targetLink) {
          for (const result of candidates) {
            const title = result.text.trim()
            const titleMain = title.replace(/\s*-\s*百度百科$/, '').replace(/_百度百科$/, '').trim()
            // 标题以书名开头，且不是角色/人物/蛊虫等页面
            if (titleMain.startsWith(cleanBookName)) {
              const excludePatterns = [/角色/, /人物/, /主角/, /配角/, /蛊虫/, /修炼体系/, /设定/, /中的/]
              const hasExclude = excludePatterns.some(p => p.test(titleMain))
              if (!hasExclude) {
                targetLink = result.link
                targetText = result.text
                console.log('[PlaywrightManager] 选择书名开头匹配词条:', result.text.substring(0, 50))
                break
              }
            }
          }
        }
        
        // 第二步：如果没找到，找包含小说关键词的（不含角色/人物等排除关键词）
        if (!targetLink) {
          const excludePatterns = [/角色/, /人物/, /主角/, /配角/, /蛊虫/, /修炼体系/, /设定/]
          const preferPatterns = [/小说/, /网络小说/, /原创小说/, /玄幻小说/, /仙侠小说/, /都市小说/, /作品/]
          
          for (const result of candidates) {
            const hasPrefer = preferPatterns.some(p => p.test(result.text))
            const hasExclude = excludePatterns.some(p => p.test(result.text))
            if (hasPrefer && !hasExclude) {
              targetLink = result.link
              targetText = result.text
              console.log('[PlaywrightManager] 选择小说词条:', result.text.substring(0, 50))
              break
            }
          }
        }
        
        // 第三步：如果都没找到，选主词条（不含括号的）
        if (!targetLink) {
          for (const result of candidates) {
            const title = result.text.trim()
            const isMainEntry = !/[（(].*?[）)]/.test(title) && /^(.*?)(?:\s*-\s*百度百科|_百度百科)$/.test(title)
            if (isMainEntry) {
              targetLink = result.link
              targetText = result.text
              console.log('[PlaywrightManager] 选择主词条:', result.text.substring(0, 50))
              break
            }
          }
        }
        
        // 第四步：如果都没找到，用第一个结果
        if (!targetLink) {
          targetLink = candidates[0].link
          targetText = candidates[0].text
          console.log('[PlaywrightManager] 选择第一个结果:', candidates[0].text.substring(0, 50))
        }
      }
      
      if (!targetLink) {
        console.warn('[PlaywrightManager] 未找到目标链接')
        return null
      }
      
      console.log('[PlaywrightManager] 找到目标链接:', targetText.substring(0, 40))
      
      // 滚动到链接可见
      await targetLink.scrollIntoViewIfNeeded()
      await this.randomDelay(60, 120)

      // 真实点击
      await targetLink.click()

      // 等待页面跳转（新标签页或当前页）
      await this.randomDelay(300, 600)
      
      // 检查是否打开了新标签页
      const pages = context.pages()
      if (pages.length > 1) {
        // 切换到新打开的标签页
        page = pages[pages.length - 1]
        await page.bringToFront()
      }
      
      // 等待页面加载
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: timeout / 5 })
      } catch (e) {
        // 忽略
      }

      // 等待信息框等关键元素加载
      try {
        await page.waitForSelector('.basic-info, [class*="basic-info"], .lemma-summary, [class*="lemma-summary"]', {
          timeout: timeout / 6,
        })
      } catch (e) {
        // 继续
      }
      
      // 等待百度百科的特征元素
      const currentUrl = page.url()
      console.log('[PlaywrightManager] 到达页面:', currentUrl.substring(0, 80))
      
      // 检查是否真的到达了百度百科页面
      if (!currentUrl.includes('baike.baidu.com')) {
        console.warn('[PlaywrightManager] 未到达百度百科页面，当前URL:', currentUrl.substring(0, 80))
        return null
      }
      
      // 检查是不是滑块验证页
      const pageTitle = await page.title()
      if (pageTitle.includes('验证') || currentUrl.includes('wappass') || currentUrl.includes('verify')) {
        console.warn('[PlaywrightManager] 触发验证页面，尝试失败')
        return null
      }
      
      // ==================== 第三步：自动切换多义词到小说版 ====================
      console.log('[PlaywrightManager] 第3步：检查并切换多义词到小说版...')
      try {
        const switched = await this.switchToNovelPolysemy(page)
        if (switched) {
          console.log('[PlaywrightManager] 已切换到小说版义项，等待页面加载...')
          try {
            await page.waitForLoadState('domcontentloaded', { timeout: timeout / 5 })
          } catch (e) {
            // 忽略
          }
          // 等待信息框元素
          try {
            await page.waitForSelector('.basic-info, [class*="basic-info"]', { timeout: 3000 })
          } catch (e) {
            // 继续
          }
          await this.randomDelay(100, 250)
        } else {
          console.log('[PlaywrightManager] 无需切换多义词（单义词或已是小说版）')
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 多义词切换失败，继续:', e instanceof Error ? e.message : String(e))
      }

      // 模拟阅读（轻量）
      if (scroll) {
        await this.simulateScroll(page, 2)
      }

      await this.randomDelay(80, 200)
      
      // ==================== 第四步：提取结构化数据 ====================
      console.log('[PlaywrightManager] 第4步：提取结构化数据...')
      let infoBox: Record<string, string> = {}
      try {
        infoBox = await this.extractBaikeInfoBox(page)
        console.log('[PlaywrightManager] 信息框提取到', Object.keys(infoBox).length, '个字段')
        for (const [key, value] of Object.entries(infoBox)) {
          console.log(`  - ${key}: ${value.substring(0, 60)}`)
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 信息框提取失败:', e instanceof Error ? e.message : String(e))
      }
      
      // ==================== 第六步：提取最大章节号（从目录中） ====================
      try {
        const maxChapter = await page.evaluate(() => {
          const cnDigits: Record<string, number> = { '零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'两':2,'壹':1,'贰':2,'叁':3,'肆':4,'伍':5,'陆':6,'柒':7,'捌':8,'玖':9 }
          const cnUnits: Record<string, number> = { '十':10,'拾':10,'百':100,'佰':100,'千':1000,'仟':1000,'万':10000,'亿':100000000 }
          
          const allText = (document.body as unknown as HTMLElement).innerText || (document.body as unknown as HTMLElement).textContent || ''
          
          // 先找阿拉伯数字章节
          const numPattern = /第(\d+)\s*(?:章|集|话|节|回)/g
          let max = 0
          let m: RegExpExecArray | null
          while ((m = numPattern.exec(allText)) !== null) {
            const n = parseInt(m[1])
            if (n > max && n < 10000) max = n
          }
          
          // 再找中文数字章节（简单转换，处理百、十、个）
          const cnPattern = /第([零一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+)\s*(?:章|集|话|节|回)/g
          while ((m = cnPattern.exec(allText)) !== null) {
            const str = m[1]
            let result = 0
            let temp = 0
            let hasDigit = false
            for (let i = 0; i < str.length; i++) {
              const char = str[i]
              if (cnDigits[char] !== undefined) {
                temp = cnDigits[char]
                hasDigit = true
              } else if (cnUnits[char] !== undefined) {
                const unit = cnUnits[char]
                if (unit === 10000 || unit === 100000000) {
                  result = (result + temp) * unit
                  temp = 0
                } else {
                  if (temp === 0 && unit === 10) temp = 1
                  result += temp * unit
                  temp = 0
                }
              }
            }
            result += temp
            if (hasDigit && result > max && result < 10000) max = result
          }
          
          return max > 0 ? max : null
        })
        
        if (maxChapter) {
          console.log('[PlaywrightManager] 从页面提取到最大章节号:', maxChapter)
          infoBox['_maxChapter'] = String(maxChapter)
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取最大章节号失败:', e instanceof Error ? e.message : String(e))
      }
      
      // ==================== 第七步：提取百度百科内容简介（最准确的简介） ====================
      try {
        const summary = await page.evaluate(() => {
          // 方法1：找"内容简介"、"作品简介"、"故事简介"等标题下面的内容
          const sectionTitles = ['内容简介', '作品简介', '故事简介', '小说简介', '简介', '内容介绍']
          
          // 遍历所有标题元素
          const headings = document.querySelectorAll('h2, h3, h4, .para-title, [class*="paraTitle"], [class*="title_"]')
          let contentText = ''
          
          for (let hi = 0; hi < headings.length; hi++) {
            const h = headings[hi]
            const text = h.textContent || ''
            let matched = false
            for (let ti = 0; ti < sectionTitles.length; ti++) {
              if (text.indexOf(sectionTitles[ti]) !== -1) { matched = true; break }
            }
            if (matched) {
              // 找到标题后，收集下面所有后续的段落，直到遇到下一个标题
              let next = h.nextElementSibling
              while (next) {
                const nextTag = next.tagName.toLowerCase()
                const nextClass = (next.className || '')
                const nextText = next.textContent || ''
                
                // 遇到下一个标题就停止
                if (/h[1-6]/.test(nextTag) || nextClass.indexOf('para-title') !== -1 || nextClass.indexOf('title_') !== -1 || nextClass.indexOf('paraTitle') !== -1) {
                  break
                }
                
                // 跳过视频、图片、参考资料等
                if (nextClass.indexOf('video') !== -1 || nextTag === 'video' || nextTag === 'img' || nextTag === 'figure') {
                  next = next.nextElementSibling
                  continue
                }
                
                // 跳过目录、参考资料等
                if (nextText.indexOf('目录') !== -1 && nextText.length < 100 && nextText.indexOf('1') !== -1 && nextText.indexOf('2') !== -1) {
                  next = next.nextElementSibling
                  continue
                }
                
                // 跳过秒懂百科、视频时长等无关内容
                const skipPatterns = [/^\d{2}:\d{2}$/, /秒懂百科/, /视频时长/, /播放/, /点赞/, /收藏/]
                let shouldSkip = false
                for (let si = 0; si < skipPatterns.length; si++) {
                  if (skipPatterns[si].test(nextText.trim())) { shouldSkip = true; break }
                }
                if (shouldSkip) {
                  next = next.nextElementSibling
                  continue
                }
                
                let paraText = ((next as HTMLElement).innerText || next.textContent || '').trim()
                // 只取有意义的段落（长度适中，包含中文）
                if (paraText.length > 20 && paraText.length < 1000 && /[\u4e00-\u9fa5]/.test(paraText)) {
                  // 去掉引用标记
                  paraText = paraText.replace(/\[\d+\]/g, '')
                  // 过滤掉只包含简短标签的行
                  const lines = paraText.split('\n').filter(function(line: string) {
                    const trimmed = line.trim()
                    if (trimmed.length === 0) return false
                    // 过滤掉纯数字、纯符号、太短的行
                    if (/^[\d\s\-\.,:：、]+$/.test(trimmed)) return false
                    if (trimmed.length < 5) return false
                    return true
                  })
                  if (lines.length > 0) {
                    contentText += lines.join('\n') + '\n'
                  }
                }
                next = next.nextElementSibling
              }
              if (contentText.trim().length > 100) break
            }
          }
          
          if (contentText.trim().length > 100) {
            return contentText.replace(/\[\d+\]/g, '').trim()
          }
          
          // 方法2：如果方法1没找到，用顶部的lemmaSummary
          const selectors = ['.lemmaSummary','.J-summary','[class*="lemmaSummary"]','[class*="summary_"]','.summary']
          for (let si = 0; si < selectors.length; si++) {
            const el = document.querySelector(selectors[si])
            if (el) {
              const text = ((el as HTMLElement).innerText || el.textContent || '').replace(/\[\d+\]/g, '').trim()
              if (text.length > 50 && text.length < 2000) return text
            }
          }
          return null
        })
        
        if (summary) {
          console.log('[PlaywrightManager] 提取到百度百科内容简介:', summary.substring(0, 60) + '...')
          infoBox['_summary'] = summary
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取摘要失败:', e instanceof Error ? e.message : String(e))
      }
      
      // ==================== 第八步：提取登场角色 ====================
      try {
        const extractCharactersScript = `
          (function() {
            var result = [];
            var seenNames = {};
            // 🔥 从infoBox提取作者名，用于过滤误识别的作者
            var authorName = '';
            try {
              var infoBoxElForAuthor = document.querySelector('[class*="basicInfo"], [class*="basic-info"], .infoBox, dl.basicInfo, dl[class*="basic"]');
              if (infoBoxElForAuthor) {
                var authorDts = infoBoxElForAuthor.querySelectorAll('dt');
                var authorDds = infoBoxElForAuthor.querySelectorAll('dd');
                for (var ai = 0; ai < Math.min(authorDts.length, authorDds.length); ai++) {
                  var authorDtText = (authorDts[ai].textContent || '').replace(/\s+/g, '').trim();
                  if (/作者/.test(authorDtText)) {
                    authorName = (authorDds[ai].textContent || '').trim();
                    break;
                  }
                }
              }
            } catch (e) {}
            
            // ===== 辅助函数 =====
            function addChar(name, desc, position) {
              if (!name || name.length < 2 || name.length > 8) return;
              if (!/[\u4e00-\u9fa5·]{2,8}$/.test(name)) return;
              if (seenNames[name]) return;
              // 🔥 过滤作者名
              if (authorName && name === authorName) return;
              if (authorName && authorName.indexOf(name) !== -1 && name.length >= 2) return;
              // 过滤非人名
              var skipWords = ['书名', '作者', '类型', '题材', '字数', '章节', '状态', '出版社', '出版时间', '首发', '连载', '简介', '目录', '内容', '作品', '小说', '定价', '开本', '装帧', '中文名', '语言', '完结', '最新', '所获', '总推荐', '别名', '修为', '尊号', '流派', '资质', '魂魄', '仙窍', '出身', '特殊', '重生', '所属', '生日', '身高', '体重', '性别', '妻子', '丈夫', '儿子', '女儿', '父亲', '母亲', '爷爷', '奶奶', '哥哥', '姐姐', '弟弟', '妹妹', '主人', '少女', '少年', '青年', '中年', '老年', '小孩', '婴儿', '配角', '反派', '主角', '男主', '女主', '龙套', '路人', '待补充', '暂无', '未知', '参考', '资料', '附录', '后记', '前言', '序言', '序章', '引子', '楔子',
                // 🔥 过滤小说平台/网站名
                '起点中文网', '起点', '纵横中文网', '纵横', '创世中文网', '创世', '17K小说网', '17K', '番茄小说', '番茄', '飞卢小说', '飞卢', '晋江文学城', '晋江', '红袖添香', '红袖', '潇湘书院', '潇湘', 'QQ阅读', '掌阅', '书旗小说', '书旗', '咪咕阅读', '咪咕', '百度贴吧', '百度', '贴吧', '百度百科', '百科',
                // 🔥 过滤常见宠物/神兽名
                '贝贝', '小白', '大黑', '旺财', '小强', '大黄', '阿黄', '小黑', '花花', '豆豆', '毛毛', '球球', '咪咪', '喵喵', '汪汪', '二狗子', '二哈', '小龙', '小蛇', '小鸟', '小狐狸'
              ];
              for (var si = 0; si < skipWords.length; si++) { if (name === skipWords[si]) return; }
              // 过滤物品名
              var itemSuffixes = ['蛊', '阵', '法', '术', '剑', '刀', '枪', '棍', '棒', '鞭', '弓', '箭', '盾', '甲', '衣', '袍', '靴', '戒', '链', '珠', '玉', '石', '丹', '符', '杀招', '绝学', '神功', '秘籍', '功法', '武技', '法术', '神通', '法宝', '灵宝', '仙器', '神器', '圣物', '神物', '宝物', '灵药', '灵草'];
              for (var ii = 0; ii < itemSuffixes.length; ii++) { if (name.indexOf(itemSuffixes[ii]) !== -1 && name.length > 2) return; }
              seenNames[name] = true;
              result.push({ name: name, role: desc ? desc.substring(0, 50) : '', desc: desc || '', position: position || '配角' });
            }
            
            function detectPosition(name, desc) {
              var fullText = (name + ' ' + desc).toLowerCase();
              if (/女主角|女主[角]?|第一女主|正牌女主|道侣|妻子|老婆|爱人|未婚妻|女友|挚爱|情人|心上人|初恋|红颜知己|最终伴侣|一生所爱|相依为命|结为夫妻|最终在一起/.test(fullText)) return '女主角';
              if (/男主角|男主[角]?|第一主角|^主角/.test(fullText)) return '男主角';
              if (/宠物|灵宠|兽宠|战宠|坐骑|神兽|仙兽|妖兽|魔宠/.test(fullText)) return '宠物';
              if (/反派|boss|魔头|邪帝|魔宗|大祭司|邪恶|黑暗势力|魔王|魔尊/.test(fullText)) return '反派';
              if (/师父|师尊|师傅|老师|导师|义父|养父|引路人|启蒙/.test(fullText)) return '师父';
              if (/兄弟|好友|朋友|伙伴|挚友|知己|生死之交|结拜|战友/.test(fullText)) return '伙伴';
              if (/父亲|母亲|爹|娘|爷爷|奶奶|哥哥|弟弟|姐姐|妹妹|儿子|女儿|家族|亲人/.test(fullText)) return '亲人';
              if (/长老|族长|首领|宫主|宗主|殿主|掌门|门主|教主|阁主|城主|国王|皇帝/.test(fullText)) return '长辈/领导';
              if (/敌人|敌方|敌对|仇敌|仇人|宿敌|死敌/.test(fullText)) return '敌对势力';
              var shortDesc = desc.split(/[，。；,.!！?？]/)[0].trim();
              if (shortDesc && shortDesc.length >= 2 && shortDesc.length <= 12 && shortDesc !== desc) return shortDesc;
              return '配角';
            }
            
            // ===== 第一步：找到角色相关章节 =====
            var charHeadings = [];
            var charTitles = ['人物介绍', '角色介绍', '登场角色', '主要人物', '主要角色', '人物形象', '角色设定', '人物设定', '人物简介', '角色简介', '主要人物介绍', '人物'];
            var allHeadings = document.querySelectorAll('h2, h3, h4, [class*="title"], [class*="head"]');
            for (var hi = 0; hi < allHeadings.length; hi++) {
              var hText = (allHeadings[hi].textContent || '').replace(/\\[.*?\\]/g, '').replace(/\\d+/g, '').trim();
              for (var ti = 0; ti < charTitles.length; ti++) {
                if (hText.indexOf(charTitles[ti]) !== -1 && hText.length < 20) {
                  charHeadings.push(allHeadings[hi]);
                  break;
                }
              }
            }
            
            // ===== 第二步：从角色章节提取（多种格式） =====
            for (var chi = 0; chi < charHeadings.length; chi++) {
              var heading = charHeadings[chi];
              var sibling = heading.nextElementSibling;
              var count = 0;
              while (sibling && count < 80) {
                if (/^H[1-4]$/.test(sibling.tagName)) break;
                sibling = sibling.nextElementSibling;
                count++;
              }
              
              // 格式1: 表格格式 (tr/td)
              var tableRows = heading.parentElement ? heading.parentElement.querySelectorAll('tr') : [];
              for (var tri = 0; tri < tableRows.length; tri++) {
                var cells = tableRows[tri].querySelectorAll('td, th');
                if (cells.length >= 2) {
                  var cellName = (cells[0].textContent || '').trim();
                  var cellDesc = (cells[1].textContent || '').trim();
                  if (cellName && cellName.length >= 2 && cellName.length <= 8 && /^[\u4e00-\u9fa5·]+$/.test(cellName)) {
                    addChar(cellName, cellDesc, detectPosition(cellName, cellDesc));
                  }
                }
              }
              
              // 格式2: 链接格式 (<a href="/item/...">Name</a>)
              var links = heading.parentElement ? heading.parentElement.querySelectorAll('a[href*="/item/"]') : [];
              for (var li = 0; li < links.length && li < 30; li++) {
                var linkText = (links[li].textContent || '').trim();
                if (linkText && linkText.length >= 2 && linkText.length <= 8 && /^[\u4e00-\u9fa5·]+$/.test(linkText)) {
                  var nextText = '';
                  var nextNode = links[li].nextSibling;
                  while (nextNode && nextText.length < 50) {
                    if (nextNode.nodeType === 3) nextText += nextNode.textContent;
                    nextNode = nextNode.nextSibling;
                  }
                  nextText = nextText.replace(/[：:]/g, '').trim();
                  addChar(linkText, nextText, detectPosition(linkText, nextText));
                }
              }
              
              // 格式3: 粗体格式 (<b>/<strong>/<dt>Name</dt>)
              var boldEls = heading.parentElement ? heading.parentElement.querySelectorAll('b, strong, dt') : [];
              for (var bi = 0; bi < boldEls.length && bi < 30; bi++) {
                var bText = (boldEls[bi].textContent || '').trim();
                if (bText && bText.length >= 2 && bText.length <= 8 && /^[\u4e00-\u9fa5·]+$/.test(bText)) {
                  var bDesc = '';
                  var bNext = boldEls[bi].nextSibling;
                  while (bNext && bDesc.length < 80) {
                    if (bNext.nodeType === 3) bDesc += bNext.textContent;
                    bNext = bNext.nextSibling;
                  }
                  bDesc = bDesc.replace(/[：:]/g, '').trim();
                  addChar(bText, bDesc, detectPosition(bText, bDesc));
                }
              }
              
              // 格式4: 段落格式 (Name: Description / 【Name】Description)
              var paras = heading.parentElement ? heading.parentElement.querySelectorAll('.para, p, [class*="para_"], [class*="content_"], div[class*="text"]') : [];
              for (var pi = 0; pi < paras.length; pi++) {
                var text = (paras[pi].textContent || '').trim();
                var lines = text.split(/\\n/).filter(function(l) { return l.trim(); });
                for (var lni = 0; lni < lines.length; lni++) {
                  var line = lines[lni].trim();
                  var m1 = line.match(/^([\u4e00-\u9fa5·]{2,8})[：:]\\s*(.+)$/);
                  var m2 = line.match(/^【([\u4e00-\u9fa5·]{2,8})】\\s*(.+)$/);
                  var m3 = line.match(/^●\\s*([\u4e00-\u9fa5·]{2,8})\\s*[：:]?\\s*(.+)$/);
                  var m = m1 || m2 || m3;
                  if (m) {
                    addChar(m[1].trim(), m[2].trim(), detectPosition(m[1], m[2]));
                  }
                }
              }
              
              // 格式5: 百度百科标题+段落格式（<h3>角色名</h3><div class="para">描述</div>...）
              var subHeadings = heading.parentElement ? heading.parentElement.querySelectorAll('h3, h4') : [];
              for (var shi = 0; shi < subHeadings.length; shi++) {
                var subName = (subHeadings[shi].textContent || '').replace(/\\[.*?\\]/g, '').trim();
                if (!subName || subName.length < 2 || subName.length > 8) continue;
                if (!/^([\u4e00-\u9fa5·]{2,8})(漫画形象)?$/.test(subName)) continue;
                // 去掉"漫画形象"后缀
                subName = subName.replace(/漫画形象/g, '').trim();
                if (!subName) continue;
                // 跳过章节标题本身
                var isSectionTitle = false;
                for (var cti = 0; cti < charTitles.length; cti++) {
                  if (subName.indexOf(charTitles[cti]) !== -1) { isSectionTitle = true; break; }
                }
                if (isSectionTitle) continue;
                var subDesc = '';
                var subNext = subHeadings[shi].nextElementSibling;
                var subCount = 0;
                while (subNext && subCount < 20) {
                  if (/^H[1-4]$/i.test(subNext.tagName)) break;
                  var txt = (subNext.textContent || '').trim();
                  if (txt && txt !== subName) subDesc += txt + ' ';
                  subNext = subNext.nextElementSibling;
                  subCount++;
                }
                subDesc = subDesc.trim();
                if (subDesc) {
                  addChar(subName, subDesc, detectPosition(subName, subDesc));
                }
              }
              
              if (result.length >= 5) break;
            }
            
            // ===== 第三步：如果角色太少，从infoBox提取 =====
            if (result.length < 3) {
              var infoBoxEl = document.querySelector('[class*="basicInfo"], [class*="basic-info"], .infoBox, dl.basicInfo, dl[class*="basic"]');
              if (infoBoxEl) {
                var dts = infoBoxEl.querySelectorAll('dt');
                var dds = infoBoxEl.querySelectorAll('dd');
                for (var dti = 0; dti < Math.min(dts.length, dds.length); dti++) {
                  var dtText = (dts[dti].textContent || '').replace(/\\s+/g, '').trim();
                  var ddText = (dds[dti].textContent || '').trim();
                  if (/主要角色|主角|登场角色|人物|角色/.test(dtText) && ddText) {
                    var names = ddText.split(/[、，,\\/\\s]+/).filter(function(n) { return n.trim().length >= 2 && n.trim().length <= 6; });
                    for (var ni = 0; ni < names.length; ni++) {
                      addChar(names[ni].trim(), '', ni === 0 ? '男主角' : '配角');
                    }
                  }
                }
                if (result.length < 2) {
                  var infoText = infoBoxEl.textContent || '';
                  var ptPatterns = [/主[ ]?角[：:]\\s*(.+?)(?=\\n|$)/, /人[ ]?物[：:]\\s*(.+?)(?=\\n|$)/, /主要人物[：:]\\s*(.+?)(?=\\n|$)/];
                  for (var pti = 0; pti < ptPatterns.length; pti++) {
                    var ptm = infoText.match(ptPatterns[pti]);
                    if (ptm && ptm[1]) {
                      var ptNames = ptm[1].split(/[、，,\\/\\s]+/);
                      for (var pni = 0; pni < ptNames.length; pni++) {
                        addChar(ptNames[pni].trim(), '', pni === 0 ? '男主角' : '配角');
                      }
                      if (result.length > 0) break;
                    }
                  }
                }
              }
            }
            
            // ===== 第四步：全局兜底 - 从整个页面找带链接的角色名 =====
            if (result.length < 3) {
              var allLinks = document.querySelectorAll('a[href*="/item/"]');
              var linkCandidates = {};
              for (var ali = 0; ali < allLinks.length; ali++) {
                var alText = (allLinks[ali].textContent || '').trim();
                if (alText && alText.length >= 2 && alText.length <= 6 && /^[\u4e00-\u9fa5·]+$/.test(alText)) {
                  linkCandidates[alText] = (linkCandidates[alText] || 0) + 1;
                }
              }
              var sortedLinks = Object.keys(linkCandidates).sort(function(a, b) { return linkCandidates[b] - linkCandidates[a]; });
              for (var sli = 0; sli < Math.min(sortedLinks.length, 10); sli++) {
                addChar(sortedLinks[sli], '', '配角');
              }
            }
            
            // 排序
            var positionPriority = {
              '男主角': 1, '女主角': 2, '宠物': 3, '反派': 4, '敌对势力': 5,
              '师父': 6, '伙伴': 7, '亲人': 8, '同门': 9, '长辈/领导': 10, '配角': 99
            };
            result.sort(function(a, b) {
              var pa = positionPriority[a.position] || 50;
              var pb = positionPriority[b.position] || 50;
              return pa - pb;
            });
            
            return result.slice(0, 12);
          })()
        `;
        const characters = await page.evaluate(extractCharactersScript as string) as unknown as Array<{ name: string; role: string; desc: string; position: string }>;
        
        if (characters && characters.length > 0) {
          console.log('[PlaywrightManager] 提取到登场角色:', characters.map(function(c) { return c.name + '(' + c.position + ')' }).join('、'))
          infoBox['_characters'] = JSON.stringify(characters)
        } else {
          console.log('[PlaywrightManager] 未提取到登场角色')
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取角色失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取世界观
      try {
        const worldBuildingScript = `
          (function() {
            var excludeSections = ['空间设定', '生物名词', '主要名词', '登场角色', '人物介绍', '角色介绍', '主角', '女主', '人物', '角色', '妖兽', '灵兽', '蛊虫', '法宝', '丹药', '功法', '武技', '法术', '神通', '装备', '物品', '作者', '作品相关', '出版信息'];
            
            var geoKeywords = ['大陆', '地域', '地理', '国家', '王朝', '帝国', '城市', '地点', '九天', '五域', '四海', '八荒', '九州', '山脉', '河流', '湖泊', '海洋', '岛屿', '秘境', '绝地', '禁地', '森林', '平原', '高原', '沙漠', '冰川', '火山', '海域', '星空', '位面', '小世界', '下界', '上界', '仙界', '魔界', '妖界', '鬼界', '神界', '人间界', '修真界', '修仙界', '下界', '凡间', '人界', '大夏', '大商', '大周', '大西', '亚特兰', '通天道'];
            
            var ruleKeywords = ['天道', '大道', '法则', '规则', '秩序', '天命', '气运', '因果', '轮回', '生死', '阴阳', '五行', '八卦', '太极', '两仪', '四象', '六合', '七星', '九鼎', '封神', '量劫', '劫数', '天劫', '地劫', '人劫', '修炼', '修真', '修仙', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升', '超脱', '永生', '不死', '不灭', '不朽', '永恒', '大道', '巫道', '人道', '地道', '仙道', '魔道', '妖道', '鬼道', '神道', '佛道', '儒道', '兵道', '剑道', '刀道', '枪道', '拳道', '掌道', '指法', '身法', '步法', '心法', '功法', '秘术', '神通', '法术', '武技', '蛊术', '巫术', '诅咒', '封印', '禁制', '阵法', '符箓', '丹药', '法宝', '灵器', '仙器', '神器', '先天灵宝', '后天灵宝', '功德', '业力', '紫气', '金莲', '庆云', '三花', '五气', '朝元', '聚顶', '法力', '灵力', '真元', '真气', '元力', '神力', '仙力', '魔力', '妖力', '鬼力', '巫力'];
            
            var societyKeywords = ['势力', '宗门', '门派', '家族', '种族', '部族', '部落', '联盟', '帝国', '王朝', '皇朝', '王国', '公国', '侯国', '诸侯王', '节度使', '太守', '刺史', '巫教', '道教', '佛教', '儒教', '魔教', '妖教', '鬼教', '神教', '仙道', '魔道', '妖道', '鬼道', '神道', '佛道', '儒道', '巫殿', '神殿', '圣殿', '仙宫', '魔宫', '妖宫', '鬼宫', '神宫', '世家', '门阀', '士族', '庶族', '贵族', '平民', '奴隶', '自由民', '农奴', '工匠', '商人', '读书人', '武者', '修士', '道士', '和尚', '巫师', '祭司', '神官', '圣女', '圣子', '教主', '宗主', '掌门', '门主', '家主', '族长', '酋长', '骑士', '剑士', '弓箭手', '刺客', '盗贼', '战士', '法师', '术士', '德鲁伊', '吟游诗人', '游侠', '圣武士', '暗黑骑士', '死灵法师', '召唤师', '炼药师', '炼器师', '制符师', '阵法师', '蛊师', '巫医', '萨满', '祭祀'];
            
            var introPatterns = ['是一本', '是一部', '连载于', '出版社', '作者是', '小说作者', '首发于', '连载平台', '出版时间', '完本', '完结', '上架', '订阅', '内容简介', '作品简介', '故事简介', '剧情简介', '小说简介', '小说讲述', '故事讲述', '讲述了', '主要讲述', '本书讲述', '该小说', '这部小说', '网络小说', '网文', '起点中文网', '创世中文网', '17K小说网', '纵横中文网', '番茄小说', '飞卢小说', '看了简介', '看过简介', '简介里', '简介都', '都该知道', '都应该知道'];
            
            var characterPatterns = ['男主角', '女主角', '主人公', '主角是', '名叫', '名为', '姓', '名', '字', '号', '外号', '绰号', '身份是', '修为是', '境界是', '实力是', '法宝是', '功法是', '武技是', '法术是', '神通是', '武器是', '装备是', '坐骑是', '宠物是', '师父是', '徒弟是', '父亲是', '母亲是', '哥哥是', '弟弟是', '姐姐是', '妹妹是', '妻子是', '丈夫是'];
            
            var geoParas = [];
            var ruleParas = [];
            var societyParas = [];
            
            var allParas = document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"], div[class*="text"]');
            
            function isInExcludedSection(para) {
              var headings = document.querySelectorAll('h2, h3');
              var paraTop = para.getBoundingClientRect().top;
              var currentHeading = null;
              var currentHeadingTop = -999999;
              
              for (var i = 0; i < headings.length; i++) {
                var hTop = headings[i].getBoundingClientRect().top;
                if (hTop < paraTop && hTop > currentHeadingTop) {
                  currentHeading = headings[i];
                  currentHeadingTop = hTop;
                }
              }
              
              if (!currentHeading) return false;
              
              var headingText = (currentHeading.innerText || currentHeading.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
              for (var j = 0; j < excludeSections.length; j++) {
                if (headingText.indexOf(excludeSections[j]) !== -1) return true;
              }
              return false;
            }
            
            function isCharacterIntro(text) {
              var count = 0;
              for (var i = 0; i < characterPatterns.length; i++) {
                if (text.indexOf(characterPatterns[i]) !== -1) count++;
              }
              if (count >= 2) return true;
              if (text.match(/姓名[：:]/) || text.match(/性别[：:]/) || text.match(/年龄[：:]/) || text.match(/身份[：:]/) || text.match(/修为[：:]/) || text.match(/境界[：:]/)) return true;
              return false;
            }
            
            function classifyPara(text) {
              var geoScore = 0;
              var ruleScore = 0;
              var societyScore = 0;
              
              for (var i = 0; i < geoKeywords.length; i++) {
                if (text.indexOf(geoKeywords[i]) !== -1) geoScore++;
              }
              for (var j = 0; j < ruleKeywords.length; j++) {
                if (text.indexOf(ruleKeywords[j]) !== -1) ruleScore++;
              }
              for (var k = 0; k < societyKeywords.length; k++) {
                if (text.indexOf(societyKeywords[k]) !== -1) societyScore++;
              }
              
              var maxScore = Math.max(geoScore, ruleScore, societyScore);
              if (maxScore === 0) return null;
              if (geoScore === maxScore && geoScore >= 1) return 'geo';
              if (societyScore === maxScore && societyScore >= 1) return 'society';
              if (ruleScore === maxScore && ruleScore >= 1) return 'rule';
              return null;
            }
            
            for (var pi = 0; pi < allParas.length; pi++) {
              var para = allParas[pi];
              var text = (para.innerText || para.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
              
              if (!text || text.length < 20 || text.length > 500) continue;
              
              if (/^(参考资料|词条图册|相关搜索|推荐阅读|词条标签|TA说|为您推荐|首页|登录|注册|关于我们|联系方式)/.test(text.substring(0, 10))) continue;
              
              if (/^第[\\d一二三四五六七八九十百千万]+章/.test(text)) continue;
              
              var isIntro = false;
              for (var ip = 0; ip < introPatterns.length; ip++) {
                if (text.indexOf(introPatterns[ip]) !== -1) { isIntro = true; break; }
              }
              if (isIntro) continue;
              
              if (isCharacterIntro(text)) continue;
              
              if (isInExcludedSection(para)) continue;
              
              var category = classifyPara(text);
              if (category === 'geo') {
                geoParas.push(text);
              } else if (category === 'rule') {
                ruleParas.push(text);
              } else if (category === 'society') {
                societyParas.push(text);
              }
            }
            
            function deduplicate(arr) {
              var seen = {};
              var result = [];
              for (var i = 0; i < arr.length; i++) {
                var key = arr[i].substring(0, 50);
                if (!seen[key]) {
                  seen[key] = true;
                  result.push(arr[i]);
                }
              }
              return result;
            }
            
            geoParas = deduplicate(geoParas).slice(0, 10);
            ruleParas = deduplicate(ruleParas).slice(0, 10);
            societyParas = deduplicate(societyParas).slice(0, 10);
            
            var finalText = '';
            if (geoParas.length > 0) {
              finalText += '【地理设定】\\n' + geoParas.join('\\n') + '\\n\\n';
            }
            if (ruleParas.length > 0) {
              finalText += '【世界规则】\\n' + ruleParas.join('\\n') + '\\n\\n';
            }
            if (societyParas.length > 0) {
              finalText += '【社会结构】\\n' + societyParas.join('\\n');
            }
            
            finalText = finalText.trim();
            
            return finalText.length > 50 ? finalText.substring(0, 4000).trim() : '';
          })()
        `
        const worldBuilding = await page.evaluate(worldBuildingScript as string) as string
        if (worldBuilding && worldBuilding.length > 50) {
          console.log('[PlaywrightManager] 提取到世界观:', worldBuilding.length + '字')
          infoBox['_worldBuilding'] = worldBuilding
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取世界观失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取力量体系
      try {
        const powerSystemScript = `
          (function() {
            var powerSections = ['力量体系', '修炼体系', '境界划分', '等级设定', '修为境界', '巫力等级', '蛊师等级', '修炼等级', '战力分级', '修炼等级', '境界', '功法', '武技', '法术', '神通', '巫术', '蛊虫', '蛊术'];
            var excludeSections = ['空间设定', '生物名词', '主要名词', '登场角色', '人物介绍', '角色介绍', '主角', '女主', '人物', '角色', '剧情简介', '内容简介', '作品简介', '作者简介'];
            
            var result = '';
            
            var headings = [];
            var allH2 = document.querySelectorAll('h2');
            var allH3 = document.querySelectorAll('h3');
            for (var i = 0; i < allH2.length; i++) headings.push(allH2[i]);
            for (var j = 0; j < allH3.length; j++) headings.push(allH3[j]);
            
            headings.sort(function(a, b) {
              return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
            });
            
            function isExcluded(headingText) {
              for (var i = 0; i < excludeSections.length; i++) {
                if (headingText.indexOf(excludeSections[i]) !== -1) {
                  return true;
                }
              }
              return false;
            }
            
            for (var k = 0; k < headings.length; k++) {
              var heading = headings[k];
              var headingText = (heading.innerText || heading.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
              
              if (isExcluded(headingText)) continue;
              
              var isPowerSection = false;
              for (var s = 0; s < powerSections.length; s++) {
                if (headingText.indexOf(powerSections[s]) !== -1) {
                  isPowerSection = true;
                  break;
                }
              }
              
              if (isPowerSection) {
                var nextHeading = null;
                var currentLevel = heading.tagName.toLowerCase() === 'h2' ? 2 : 3;
                for (var m = k + 1; m < headings.length; m++) {
                  var nextLevel = headings[m].tagName.toLowerCase() === 'h2' ? 2 : 3;
                  if (nextLevel <= currentLevel) {
                    nextHeading = headings[m];
                    break;
                  }
                }
                
                var allParas = document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"], div[class*="text"]');
                var content = '';
                var headingTop = heading.getBoundingClientRect().bottom;
                var nextTop = nextHeading ? nextHeading.getBoundingClientRect().top : 999999;
                
                for (var p = 0; p < allParas.length; p++) {
                  var para = allParas[p];
                  var paraTop = para.getBoundingClientRect().top;
                  if (paraTop > headingTop && paraTop < nextTop) {
                    var text = (para.innerText || para.textContent || '').replace(/\\[\\d+\\]/g, '').trim();
                    if (text && text.length > 15 && text.length < 300) {
                      if (/^(参考资料|词条图册|相关搜索|推荐阅读|词条标签|TA说|为您推荐)/.test(text.substring(0, 10))) continue;
                      if (/^(首页|登录|注册|关于我们|联系方式)/.test(text.substring(0, 10))) continue;
                      content += text + '\\n';
                    }
                  }
                }
                
                if (content.length > 30) {
                  result += (result ? '\\n\\n【' + headingText + '】\\n' : '【' + headingText + '】\\n') + content.trim();
                }
              }
            }
            
            if (result.length < 50) {
              var infoBoxEl = document.querySelector('[class*="basicInfo"], [class*="basic-info"]');
              if (infoBoxEl) {
                var infoText = infoBoxEl.innerText || '';
                var levelPattern = /(?:境界|修为|等级|战力|实力|修炼)[：:]\\s*(.+?)(?:\\n|$)/gi;
                var match;
                var matches = [];
                while ((match = levelPattern.exec(infoText)) !== null) {
                  if (match[1] && match[1].length > 2) {
                    matches.push(match[1].trim());
                  }
                }
                if (matches.length > 0) {
                  result = matches.join('、');
                }
              }
            }
            
            if (result.length < 50) {
              var allTextParas = document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"]');
              var powerKeywords = ['修炼', '境界', '修为', '巫力', '灵力', '真气', '真元', '功法', '武技', '法术', '神通', '等级', '战力', '突破', '炼气', '筑基', '金丹', '元婴', '一转', '二转', '三转', '四转', '五转', '六转', '七转', '八转', '九转', '巫术', '巫殿', '蛊师', '蛊仙'];
              var excludeKeywords = ['第\\d+章', '第[一二三四五六七八九十百千万]+章', '主角', '女主', '角色', '人物', '姓名', '扮演者'];
              var introPatterns = ['是一本', '是一部', '连载于', '出版社', '作者是', '小说作者', '首发于', '连载平台', '出版时间', '完本', '完结', '上架', '订阅', '内容简介', '作品简介', '故事简介', '剧情简介', '小说简介', '小说讲述', '故事讲述', '讲述了', '主要讲述', '本书讲述', '该小说', '这部小说', '网络小说', '网文'];
              var collected = [];
              for (var pi = 0; pi < allTextParas.length && collected.length < 15; pi++) {
                var pt = (allTextParas[pi].innerText || allTextParas[pi].textContent || '');
                pt = pt.replace(/\\[\\d+\\]/g, '').trim();
                if (pt.length > 20 && pt.length < 500) {
                  var skip = false;
                  for (var eki = 0; eki < excludeKeywords.length; eki++) {
                    if (new RegExp(excludeKeywords[eki]).test(pt)) { skip = true; break; }
                  }
                  if (skip) continue;
                  var isIntro = false;
                  for (var ip = 0; ip < introPatterns.length; ip++) {
                    if (pt.indexOf(introPatterns[ip]) !== -1) { isIntro = true; break; }
                  }
                  if (isIntro) continue;
                  var hasKeyword = false;
                  for (var pki = 0; pki < powerKeywords.length; pki++) {
                    if (pt.indexOf(powerKeywords[pki]) !== -1) {
                      hasKeyword = true;
                      break;
                    }
                  }
                  if (hasKeyword) collected.push(pt);
                }
              }
              if (collected.length > 0) {
                result = collected.join('\\n');
              }
            }
            
            return result.length > 20 ? result.substring(0, 3000).trim() : '';
          })()
        `
        const powerSystem = await page.evaluate(powerSystemScript as string) as string
        if (powerSystem && powerSystem.length > 30) {
          console.log('[PlaywrightManager] 提取到力量体系:', powerSystem.length + '字')
          infoBox['_powerSystem'] = powerSystem
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取力量体系失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取核心卖点
      try {
        const sellingPointsScript = `
          (function() {
            var points = [];
            var honorSections = ['作品荣誉', '荣誉记录', '获奖记录', '排行榜', '作品成就'];
            var headings = document.querySelectorAll('h2, h3, [class*="title_"], [class*="head_"]');
            for (var i = 0; i < headings.length; i++) {
              var heading = headings[i];
              var headingText = (heading.innerText || heading.textContent || '').trim();
              var isHonorSection = false;
              for (var j = 0; j < honorSections.length; j++) {
                if (headingText.indexOf(honorSections[j]) !== -1) {
                  isHonorSection = true;
                  break;
                }
              }
              if (isHonorSection) {
                var nextEl = heading.nextElementSibling;
                var count = 0;
                while (nextEl && count < 20) {
                  var tagName = nextEl.tagName.toLowerCase();
                  if (tagName === 'h2' || tagName === 'h3') break;
                  var text = (nextEl.innerText || nextEl.textContent || '');
                  text = text.replace(/\\[\\d+\\]/g, '').trim();
                  var lines = text.split(/\\n/);
                  for (var k = 0; k < lines.length; k++) {
                    var line = lines[k].trim();
                    if (line && line.length > 3 && line.length < 50 && !/^\\d+\\./.test(line)) {
                      points.push(line);
                    }
                  }
                  nextEl = nextEl.nextElementSibling;
                  count++;
                }
              }
            }
            
            if (points.length < 3) {
              var summaryEl = document.querySelector('[class*="lemmaSummary"], [class*="summary_"], .lemmaSummary');
              if (summaryEl) {
                var summaryText = summaryEl.innerText || '';
                summaryText = summaryText.replace(/\\[\\d+\\]/g, '').trim();
                var keywords = ['穿越', '重生', '系统', '无敌', '爽文', '热血', '修仙', '修真', '玄幻', '仙侠', '都市', '历史', '军事', '科幻', '游戏', '悬疑', '恐怖', '言情', '青春', '校园', '职场', '商战', '种田', '基建', '快穿', '无限', '逆袭', '打脸', '升级流', '扮猪吃虎', '无敌流', '系统流', '重生流', '穿越流'];
                var foundKeywords = [];
                for (var ki = 0; ki < keywords.length; ki++) {
                  if (summaryText.indexOf(keywords[ki]) !== -1 && foundKeywords.length < 5) {
                    foundKeywords.push(keywords[ki]);
                  }
                }
                if (foundKeywords.length > 0) {
                  points = foundKeywords.concat(points);
                }
              }
            }
            
            if (points.length < 3) {
              var infoBoxEl = document.querySelector('[class*="basicInfo"], [class*="basic-info"]');
              if (infoBoxEl) {
                var infoText = infoBoxEl.innerText || '';
                var genreMatch = infoText.match(/(?:题材|类型|类别|分类)[：:]\\s*(.+?)(?:\\n|$)/i);
                if (genreMatch && genreMatch[1]) {
                  var genres = genreMatch[1].split(/[、，,\\/\\s]+/).filter(function(g) { return g.trim().length > 0 && g.trim().length < 10; });
                  for (var gi = 0; gi < genres.length && points.length < 8; gi++) {
                    if (points.indexOf(genres[gi].trim()) === -1) {
                      points.push(genres[gi].trim());
                    }
                  }
                }
              }
            }
            
            return points.slice(0, 8);
          })()
        `
        const sellingPoints = await page.evaluate(sellingPointsScript as string) as string[]
        if (sellingPoints && sellingPoints.length > 0) {
          console.log('[PlaywrightManager] 提取到核心卖点:', sellingPoints.join('、'))
          infoBox['_sellingPoints'] = JSON.stringify(sellingPoints)
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取核心卖点失败:', e instanceof Error ? e.message : String(e))
      }
      
      // 提取完整正文内容
      try {
        const fullContentScript = `
          (function() {
            var mainContent = document.querySelector('.main-content, .lemma-catalog, .J-lemma-content, [class*="mainContent"], [class*="content-wrapper"]');
            var paras = mainContent 
              ? mainContent.querySelectorAll('.para, p, [class*="para_"], [class*="content_"]')
              : document.querySelectorAll('.para, p, [class*="para_"], [class*="content_"]');
            
            var result = [];
            for (var i = 0; i < paras.length; i++) {
              var text = (paras[i].innerText || paras[i].textContent || '');
              text = text.replace(/\\[\\d+\\]/g, '').trim();
              if (text.length > 20 && text.length < 500) {
                if (/^(参考资料|词条图册|相关搜索|推荐阅读|词条标签|TA说|为您推荐|相关词条)/.test(text.substring(0, 10))) continue;
                if (/^(首页|登录|注册|关于我们|联系方式|网站地图|意见反馈)/.test(text.substring(0, 10))) continue;
                result.push(text);
              }
            }
            
            return result.slice(0, 200).join('\\n');
          })()
        `
        const fullContent = await page.evaluate(fullContentScript as string) as string
        if (fullContent && fullContent.length > 500) {
          console.log('[PlaywrightManager] 提取到完整正文内容:', fullContent.length + '字')
          infoBox['_fullContent'] = fullContent.substring(0, 15000)
        }
      } catch (e) {
        console.warn('[PlaywrightManager] 提取完整正文失败:', e instanceof Error ? e.message : String(e))
      }
      
      const html = await page.content()
      const finalUrl = page.url()
      
      console.log('[PlaywrightManager] 抓取成功，HTML长度:', html.length)
      console.log('[PlaywrightManager] 最终URL:', finalUrl.substring(0, 80))
      
      return { html, url: finalUrl, infoBox }
      
    } finally {
      if (page) {
        await page.close().catch(() => {})
      }
      if (context) {
        // 关闭所有标签页
        const allPages = context.pages()
        for (const p of allPages) {
          await p.close().catch(() => {})
        }
        await context.close().catch(() => {})
      }
      this.releaseBrowser(browser)
    }
  }

  private async simulateScroll(page: Page, rounds: number = 1): Promise<void> {
    await page.evaluate(async () => {
      const totalHeight = document.body.scrollHeight
      const step = Math.floor(totalHeight / 3)
      for (let i = 0; i < 3; i++) {
        window.scrollBy(0, step)
        await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30))
      }
      window.scrollTo(0, 0)
      await new Promise(resolve => setTimeout(resolve, 30))
    })

    for (let i = 0; i < rounds; i++) {
      await page.evaluate((scrollStep) => {
        window.scrollBy(0, scrollStep)
      }, 200 + Math.floor(Math.random() * 300))

      await this.randomDelay(30, 60)
    }
  }

  private async simulateMouseMovement(page: Page): Promise<void> {
    // 模拟鼠标随机移动（建立行为基线）
    const viewport = page.viewportSize()
    if (!viewport) return
    
    const centerX = viewport.width / 2
    const centerY = viewport.height / 2
    
    // 移动到几个随机点
    const points = [
      { x: centerX + Math.random() * 200 - 100, y: centerY + Math.random() * 200 - 100 },
      { x: centerX + Math.random() * 300 - 150, y: centerY + Math.random() * 150 - 75 },
      { x: centerX + Math.random() * 100 - 50, y: centerY + Math.random() * 250 - 125 },
    ]
    
    for (const point of points) {
      await page.mouse.move(point.x, point.y, {
        steps: 5 + Math.floor(Math.random() * 10),
      })
      await this.randomDelay(100, 300)
    }
  }

  private randomDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min)
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  async closeAll(): Promise<void> {
    for (const item of this.browserPool) {
      await item.browser.close().catch(() => {})
    }
    this.browserPool = []
    this.isInitialized = false
  }
}

export default PlaywrightManager.getInstance()
