'use client'

import { useState, useEffect } from 'react'
import { Image as ImageIcon, Download, RefreshCw, Loader2, ImageOff, Palette, Type, Sparkles, Wand2 } from 'lucide-react'
import type { GeneratedData } from '../ai-generate-wizard'

interface StepCoverProps {
  data: GeneratedData['cover']
  generatedData: GeneratedData
  onCoverGenerated: (coverUrl: string) => void
  isLoading: boolean
  setIsLoading: (v: boolean) => void
}

const SIZE_PRESETS = [
  { label: '番茄小说', width: 600, height: 800, icon: '🍅' },
  { label: '起点中文', width: 800, height: 1067, icon: '📖' },
  { label: '七猫小说', width: 560, height: 800, icon: '🐱' },
  { label: '通用竖版', width: 400, height: 600, icon: '📱' },
  { label: '横版海报', width: 1200, height: 628, icon: '🖼️' },
]

const COLOR_SCHEMES = [
  { label: '金色玄幻', colors: ['#d4a017', '#1a0a2e', '#f0e6d3'] },
  { label: '仙侠白蓝', colors: ['#7eb8da', '#0a1628', '#e8f0f8'] },
  { label: '都市霓虹', colors: ['#e94560', '#1a1a2e', '#f0f0f0'] },
  { label: '历史红金', colors: ['#c9a96e', '#2e1a0a', '#f5e6d3'] },
  { label: '科幻蓝紫', colors: ['#00d4ff', '#0a0a1a', '#e0f0ff'] },
  { label: '末世血红', colors: ['#ff4444', '#1a0a0a', '#e0d0d0'] },
]

export default function StepCover({
  data, generatedData, onCoverGenerated, isLoading, setIsLoading,
}: StepCoverProps) {
  const synopsis = (generatedData?.synopsis || {}) as NonNullable<GeneratedData['synopsis']>
  const idea = (generatedData?.idea || {}) as NonNullable<GeneratedData['idea']>
  const worldbuilding = (generatedData?.worldbuilding || {}) as NonNullable<GeneratedData['worldbuilding']>
  const characters = (generatedData?.characters || {}) as NonNullable<GeneratedData['characters']>
  const coverUrl = data?.coverUrl
  const [selectedSize, setSelectedSize] = useState(SIZE_PRESETS[0])
  const [rawCoverUrl, setRawCoverUrl] = useState<string>('')

  const [bookTitle, setBookTitle] = useState(idea.title || '')
  const [authorName, setAuthorName] = useState(String((generatedData as Record<string, unknown>)?.author || '') || localStorage.getItem('tuzhong-author-name') || '')
  const [subtitleText, setSubtitleText] = useState('')

  const [coverLoading, setCoverLoading] = useState(false)
  const [selectedScheme, setSelectedScheme] = useState(COLOR_SCHEMES[0])
  const [customPrompt, setCustomPrompt] = useState('')
  const [svgContent, setSvgContent] = useState<string>('')
  const [showCustomDesign, setShowCustomDesign] = useState(false)
  const [composing, setComposing] = useState(false)

  useEffect(function() {
    const _gd = generatedData as Record<string, unknown>
    if (!subtitleText) {
      const title = (idea.title || '').toString()
      const genre = (_gd.genre || idea.genre || '').toString()
      const mc = (characters?.protagonist?.name || '').toString()
      const _gf = _gd.goldenfinger as Record<string, unknown> | undefined
      const gf = (_gf?.name || _gf?.type || '').toString()
      const hook = (idea.hook || synopsis.oneLineIntro || '').toString()
      let gq = ''
      try {
        const candidates = []
        if (mc && gf) candidates.push(mc + '携' + gf.replace('系统','').replace('血脉','').replace('武魂','').slice(0,4) + '，横压当世')
        if (mc && title) {
          const tshort = title.length > 6 ? title.slice(0, 6) : title
          candidates.push(tshort + '：' + mc + '逆天崛起')
        }
        if (gf) {
          const gfShort = (gf || '').slice(0, 6)
          if (genre.indexOf('玄幻') >= 0) candidates.push(gfShort + '在手，万界我有')
          if (genre.indexOf('仙侠') >= 0) candidates.push('得' + gfShort + '，踏碎凌霄')
          if (genre.indexOf('都市') >= 0) candidates.push(gfShort + '加持，都市横行')
          if (genre.indexOf('科幻') >= 0) candidates.push(gfShort + '觉醒，星际称王')
          if (genre.indexOf('历史') >= 0) candidates.push(gfShort + '在身，执掌乾坤')
          if (genre.indexOf('末世') >= 0) candidates.push(gfShort + '降临，末世称尊')
          if (genre.indexOf('悬疑') >= 0) candidates.push(gfShort + '解迷，真相大白')
          if (genre.indexOf('武侠') >= 0) candidates.push(gfShort + '出鞘，谁与争锋')
          if (genre.indexOf('系统') >= 0 || genre.indexOf('重生') >= 0 || genre.indexOf('穿越') >= 0) candidates.push(gfShort + '开局，逆袭封神')
        }
        if (mc) candidates.push('且看' + mc + '，独步天下')
        if (!gf && !mc) {
          if (genre.indexOf('玄幻') >= 0) candidates.push('一念破万法，一剑斩诸天')
          if (genre.indexOf('仙侠') >= 0) candidates.push('修仙路漫漫，吾当凌绝顶')
          if (genre.indexOf('都市') >= 0) candidates.push('都市沉浮，我主风云')
          if (genre.indexOf('科幻') >= 0) candidates.push('星海无垠，强者为尊')
          if (genre.indexOf('历史') >= 0) candidates.push('王朝更迭，我为帝王')
          if (genre.indexOf('末世') >= 0) candidates.push('末世求生，血战到底')
          if (genre.indexOf('悬疑') >= 0) candidates.push('迷局重重，拨云见日')
          if (genre.indexOf('武侠') >= 0) candidates.push('江湖路远，剑指天涯')
          candidates.push('热血开局，逆天改命')
        }
        // 🔥 QA-封面修复：副标题必须是「宣传金句」，不再盲目截取 tagline/hook 前 18 字
        //   （旧逻辑曾把详细设定长句截断当金句：「现代程序员雨田诺魂穿1645年二月，」）
        //   取值优先级：简介金句字段 → 灵感金句字段 → 通过「金句体检」的短 tagline/hook → 按题材合成 → 默认
        var _cleanSlogan = function(v: unknown): string { return String(v || '').replace(/[。！？!?…—\s"''""（）()【】\[\]《》<>]/g, '') }
        var _sloganBad = /魂穿|穿越|重生|附身|转世|借尸|穿到|回到|公元|现代|程序员|社畜|打工人|开局.*[0-9一二三四五六七八九十]+年/
        var _quoteOk = function(v: unknown): boolean {
          var s = _cleanSlogan(v)
          return s.length >= 6 && s.length <= 18 && !_sloganBad.test(s)
        }
        const quoteMain = _cleanSlogan(synopsis.coreGoldenQuote || (idea as Record<string, unknown>).coreGoldenQuote || '')
        const tagCand = _cleanSlogan(idea.tagline || '')
        const hookCand = _cleanSlogan(hook)
        if (quoteMain.length >= 6) candidates.unshift(quoteMain.length <= 24 ? quoteMain : quoteMain.slice(0, 18))
        else {
          if (_quoteOk(tagCand)) candidates.unshift(tagCand)
          if (_quoteOk(hookCand)) candidates.unshift(hookCand)
        }
        for (let ci = 0; ci < candidates.length; ci++) {
          let s = String(candidates[ci] || '')
          s = s.replace(/[\s"'""（）()【】\[\]《》<>]/g, '').slice(0, 18)
          if (s.length >= 6) { gq = s; break }
        }
        if (!gq && hook && !_sloganBad.test(_cleanSlogan(hook))) gq = _cleanSlogan(hook).slice(0, 18)
        if (!gq) gq = '热血逆袭，一战封神'
      } catch (_se) {
        gq = (synopsis.coreGoldenQuote || idea.hook || idea.tagline || '热血逆袭，一战封神').toString()
        gq = gq.replace(/[。！？!?…—\s"'""（）()【】\[\]《》<>]/g, '').slice(0, 18)
        if (gq.length < 4) gq = '热血逆袭，一战封神'
      }
      queueMicrotask(function() { setSubtitleText(gq) })
    }
  }, [idea, synopsis, generatedData, characters])

  useEffect(function() {
    if (idea.title && !bookTitle) queueMicrotask(function() { setBookTitle(idea.title) })
  }, [idea.title])

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise(function(resolve, reject) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = function() { resolve(img) }
      img.onerror = function(e) { reject(e) }
      img.src = src
    })
  }
  function wrapTitle(title: string, maxCharsPerLine: number): string[] {
    if (!title) return ['']
    const lines: string[] = []
    let remaining = title
    while (remaining.length > 0) {
      if (remaining.length <= maxCharsPerLine) { lines.push(remaining); break }
      let cut = maxCharsPerLine
      for (let i = maxCharsPerLine; i >= Math.max(1, maxCharsPerLine - 3); i--) {
        if (/[，。、；：·—…！？\s]/.test(remaining[i] || '')) { cut = i + 1; break }
      }
      lines.push(remaining.substring(0, cut))
      remaining = remaining.substring(cut)
    }
    return lines.slice(0, 3)
  }
  function hexToRgb(hex: string) {
    let h = hex.replace('#', '')
    if (h.length === 3) h = h.split('').map(function(c) { return c + c }).join('')
    const bigint = parseInt(h, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
  }
  function rgbToHex(r: number, g: number, b: number) {
    return '#' + [r, g, b].map(function(v) { const s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length === 1 ? '0' + s : s }).join('')
  }
  function lightenColor(hex: string, amt: number) { const {r, g, b} = hexToRgb(hex); return rgbToHex(r + 255 * amt / 100, g + 255 * amt / 100, b + 255 * amt / 100) }
  function darkenColor(hex: string, amt: number) { const {r, g, b} = hexToRgb(hex); return rgbToHex(r - 255 * amt / 100, g - 255 * amt / 100, b - 255 * amt / 100) }
  function drawCornerOrnament(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, lightColor: string, size: number, pos: 'tl' | 'tr' | 'bl' | 'br') {
    ctx.save()
    ctx.translate(x, y)
    if (pos === 'tr') ctx.scale(-1, 1)
    if (pos === 'bl') ctx.scale(1, -1)
    if (pos === 'br') ctx.scale(-1, -1)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, Math.floor(size * 0.12))
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, size * 0.9); ctx.lineTo(0, 0); ctx.lineTo(size * 0.9, 0)
    ctx.stroke()
    ctx.strokeStyle = lightColor
    ctx.lineWidth = Math.max(1, Math.floor(size * 0.05))
    ctx.beginPath()
    ctx.moveTo(size * 0.15, size * 0.7); ctx.lineTo(size * 0.15, size * 0.15); ctx.lineTo(size * 0.7, size * 0.15)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(size * 0.1, size * 0.1, Math.max(2, size * 0.08), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  async function composeCoverOnCanvas(rawImageSrc: string, title: string, author: string, subtitle: string, scheme: typeof COLOR_SCHEMES[0], width: number, height: number): Promise<string> {
    const img = await loadImage(rawImageSrc)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    const coverH = height, coverW = width

    const drawRatio = Math.max(coverW / img.width, coverH / img.height)
    const drawW = img.width * drawRatio, drawH = img.height * drawRatio
    ctx.drawImage(img, (coverW - drawW) / 2, (coverH - drawH) / 2, drawW, drawH)

    const topGradH = Math.floor(coverH * 0.28)
    const topGrad = ctx.createLinearGradient(0, 0, 0, topGradH)
    topGrad.addColorStop(0, 'rgba(0,0,0,0.75)'); topGrad.addColorStop(0.5, 'rgba(0,0,0,0.35)'); topGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = topGrad; ctx.fillRect(0, 0, coverW, topGradH)

    const bottomGradH = Math.floor(coverH * 0.42)
    const bottomGrad = ctx.createLinearGradient(0, coverH - bottomGradH, 0, coverH)
    bottomGrad.addColorStop(0, 'rgba(0,0,0,0)'); bottomGrad.addColorStop(0.35, 'rgba(0,0,0,0.45)'); bottomGrad.addColorStop(0.75, 'rgba(0,0,0,0.8)'); bottomGrad.addColorStop(1, 'rgba(0,0,0,0.92)')
    ctx.fillStyle = bottomGrad; ctx.fillRect(0, coverH - bottomGradH, coverW, bottomGradH)

    const accent = scheme.colors?.[0] || '#d4a017'
    const lightAccent = lightenColor(accent, 35)
    const darkAccent = darkenColor(accent, 30)
    const borderW = Math.max(4, Math.floor(coverW * 0.012))
    const innerPad = Math.floor(coverW * 0.02)
    ctx.strokeStyle = darkAccent; ctx.lineWidth = borderW
    ctx.strokeRect(innerPad / 2, innerPad / 2, coverW - innerPad, coverH - innerPad)
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, Math.floor(borderW * 0.3))
    ctx.strokeRect(innerPad + borderW / 2, innerPad + borderW / 2, coverW - innerPad * 2 - borderW, coverH - innerPad * 2 - borderW)
    const cornerSize = Math.floor(coverW * 0.06)
    drawCornerOrnament(ctx, innerPad + borderW, innerPad + borderW, accent, lightAccent, cornerSize, 'tl')
    drawCornerOrnament(ctx, coverW - innerPad - borderW, innerPad + borderW, accent, lightAccent, cornerSize, 'tr')
    drawCornerOrnament(ctx, innerPad + borderW, coverH - innerPad - borderW, accent, lightAccent, cornerSize, 'bl')
    drawCornerOrnament(ctx, coverW - innerPad - borderW, coverH - innerPad - borderW, accent, lightAccent, cornerSize, 'br')

    const centerX = coverW / 2
    const titleLines = wrapTitle(title || '未命名小说', (title || '').length <= 4 ? 2 : 4)
    let titleFontSize = Math.floor(coverH / (titleLines.length >= 3 ? 12.5 : titleLines.length === 2 ? 10 : 8))
    titleFontSize = Math.max(28, Math.min(titleFontSize, 120))
    const titleBaseY = coverH * 0.63
    const lineGap = Math.floor(titleFontSize * 1.2)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    for (let li = 0; li < titleLines.length; li++) {
      const lineText = titleLines[li]
      const ty = titleBaseY + li * lineGap
      const titleGrad = ctx.createLinearGradient(centerX - coverW * 0.35, ty - titleFontSize / 2, centerX + coverW * 0.35, ty + titleFontSize / 2)
      titleGrad.addColorStop(0, lightAccent); titleGrad.addColorStop(0.3, accent); titleGrad.addColorStop(0.5, '#fff4c2'); titleGrad.addColorStop(0.7, accent); titleGrad.addColorStop(1, darkAccent)
      ctx.font = `900 ${titleFontSize}px "Ma Shan Zheng", "STKaiti", "KaiTi", "楷体", "STSong", "SimSun", serif`
      ctx.lineJoin = 'round'; ctx.miterLimit = 2
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = Math.floor(titleFontSize * 0.15); ctx.shadowOffsetX = Math.floor(titleFontSize * 0.04); ctx.shadowOffsetY = Math.floor(titleFontSize * 0.06)
      ctx.strokeStyle = '#000000'; ctx.lineWidth = Math.floor(titleFontSize * 0.18); ctx.strokeText(lineText, centerX, ty)
      ctx.strokeStyle = darkAccent; ctx.lineWidth = Math.floor(titleFontSize * 0.08); ctx.strokeText(lineText, centerX, ty)
      ctx.shadowBlur = Math.floor(titleFontSize * 0.08); ctx.shadowColor = accent; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
      ctx.fillStyle = titleGrad; ctx.fillText(lineText, centerX, ty)
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0

    if (subtitle) {
      const subText = subtitle.length > 20 ? subtitle.substring(0, 20) : subtitle
      const subFontSize = Math.max(14, Math.floor(titleFontSize * 0.32))
      const subY = titleBaseY + titleLines.length * lineGap + Math.floor(lineGap * 0.55)
      const subPadX = Math.floor(coverW * 0.08), subH = Math.floor(subFontSize * 1.8)
      const subGradBg = ctx.createLinearGradient(0, subY - subH / 2, 0, subY + subH / 2)
      subGradBg.addColorStop(0, accent + '00'); subGradBg.addColorStop(0.15, accent + '33'); subGradBg.addColorStop(0.5, accent + '55'); subGradBg.addColorStop(0.85, accent + '33'); subGradBg.addColorStop(1, accent + '00')
      ctx.fillStyle = subGradBg; ctx.fillRect(subPadX, subY - subH / 2, coverW - subPadX * 2, subH)
      ctx.beginPath(); ctx.moveTo(subPadX, subY); ctx.lineTo(subPadX + Math.floor(coverW * 0.06), subY)
      ctx.strokeStyle = lightAccent; ctx.lineWidth = 2; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(coverW - subPadX - Math.floor(coverW * 0.06), subY); ctx.lineTo(coverW - subPadX, subY); ctx.stroke()
      ctx.font = `600 ${subFontSize}px "STKaiti", "KaiTi", "楷体", "Microsoft YaHei", sans-serif`
      ctx.fillStyle = '#fff4c2'; ctx.strokeStyle = darkAccent; ctx.lineWidth = Math.max(1, Math.floor(subFontSize * 0.15))
      ctx.strokeText(subText, centerX, subY); ctx.fillText(subText, centerX, subY)
    }

    const authorText = (author || '佚名') + '  著'
    const authorFontSize = Math.max(13, Math.floor(titleFontSize * 0.28))
    const authorY = coverH - Math.floor(coverH * 0.06)
    ctx.font = `bold ${authorFontSize}px "STKaiti", "KaiTi", "楷体", "Microsoft YaHei", sans-serif`
    ctx.fillStyle = lightAccent; ctx.strokeStyle = '#000000'; ctx.lineWidth = Math.max(1, Math.floor(authorFontSize * 0.1))
    ctx.strokeText(authorText, centerX, authorY); ctx.fillText(authorText, centerX, authorY)
    const sealSize = Math.floor(authorFontSize * 1.3)
    const aw = ctx.measureText(authorText).width
    const sealXp = centerX - aw / 2 - sealSize - 18, sealYp = authorY - sealSize / 2
    ctx.fillStyle = '#c2201e'; ctx.fillRect(sealXp, sealYp, sealSize, sealSize)
    ctx.strokeStyle = '#8b0000'; ctx.lineWidth = Math.max(1, Math.floor(sealSize * 0.06)); ctx.strokeRect(sealXp, sealYp, sealSize, sealSize)
    ctx.fillStyle = '#ffd4c8'; ctx.font = `bold ${Math.floor(sealSize * 0.5)}px "STKaiti", "KaiTi", "SimSun", serif`
    ctx.textAlign = 'center'; ctx.fillText('印', sealXp + sealSize / 2, sealYp + sealSize / 2 + Math.floor(sealSize * 0.12))

    return canvas.toDataURL('image/png', 0.95)
  }

  async function doCompose(src?: string) {
    const s = src || rawCoverUrl
    if (!s) { alert('请先生成封面图') ; return }
    setComposing(true)
    try {
      const composed = await composeCoverOnCanvas(s, bookTitle || idea.title || '', authorName || '', subtitleText || '', selectedScheme, selectedSize.width, selectedSize.height)
      onCoverGenerated(composed)
    } catch (e: unknown) {
      console.error('封面合成失败:', e)
      alert('封面合成失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setComposing(false)
    }
  }

  const handleGenerateCover = async () => {
    setCoverLoading(true)
    setSvgContent('')
    try {
      const genre = String((generatedData as Record<string, unknown>)?.genre || '')
      const title = bookTitle || idea.title || 'untitled'
      const author = authorName || ''
      const era = worldbuilding.era || ''
      const protagonistName = characters.protagonist?.name || ''
      const oneLineIntro = synopsis.oneLineIntro || idea.hook || ''

      const coverPrompt = customPrompt.trim() || buildCoverPrompt(genre, title, era, protagonistName, oneLineIntro, worldbuilding, selectedScheme)
      
      const res = await fetch('/tuzhong-wenshu/api/generate-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({
          prompt: coverPrompt,
          title,
          author,
          genre,
          width: selectedSize.width,
          height: selectedSize.height,
          colorScheme: selectedScheme,
          // 🔥 P1 修复：传递前序设定与拆书结果，让封面风格贴合目标作品题材
          previousData: {
            idea,
            synopsis,
            worldbuilding,
            characters,
            powerSystem: generatedData?.powerSystem,
            bookAnalysis: generatedData?.bookAnalysis,
          },
        }),
      })

      if (res.ok) {
        const json = await res.json()
        if (json.coverUrl) {
          setRawCoverUrl(json.coverUrl)
          if (json.svgContent) {
            setSvgContent(json.svgContent)
            onCoverGenerated(json.coverUrl)
          } else {
            setSvgContent('')
            setComposing(true)
            try {
              const composed = await composeCoverOnCanvas(json.coverUrl, title, author, subtitleText, selectedScheme, selectedSize.width, selectedSize.height)
              onCoverGenerated(composed)
            } catch (composeErr: unknown) {
              console.warn('封面合成失败，使用原图:', composeErr instanceof Error ? composeErr.message : String(composeErr))
              onCoverGenerated(json.coverUrl)
            } finally {
              setComposing(false)
            }
          }
          if (json.isFallback) {
            const reason = json.fallbackReason || '图片生成服务暂时不可用'
            alert('图片生成服务暂时不可用，已生成SVG占位封面。\n\n降级原因：' + reason + '\n\n如需AI生成封面，请检查配置后重试。')
          }
        } else {
          alert('封面生成失败：' + (json.error || json.detail || '未知错误'))
        }
      } else {
        const err = await res.json().catch(() => ({}))
        const errMsg = err.error || err.detail || 'HTTP ' + res.status
        alert('封面生成失败：' + errMsg)
      }
    } catch (err) {
      console.error('封面生成失败:', err)
      const errMsg = err instanceof Error ? (err.message || String(err)) : String(err)
      alert('封面生成失败：' + errMsg + '\n\n请检查网络连接后重试。')
    } finally {
      setCoverLoading(false)
    }
  }

  const handleDownload = () => {
    if (!coverUrl) return
    const title = (bookTitle || idea.title || 'book_cover').replace(/[\\/:*?"<>|]/g, '_')
    const filename = `${title}_cover_${selectedSize.width}x${selectedSize.height}.png`
    
    if (coverUrl.startsWith('data:image/svg')) {
      const a = document.createElement('a')
      a.href = coverUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }
    
    fetch(coverUrl, { mode: 'cors' })
      .then(function(response) {
        if (!response.ok) throw new Error('Network error')
        return response.blob()
      })
      .then(function(blob) {
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)
      })
      .catch(function() {
        const a = document.createElement('a')
        a.href = coverUrl
        a.download = filename
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      })
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-gradient-to-r wenshu-title-band shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="p-6 text-center">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">制作小说封面</h3>
          <p className="text-stone-500 text-sm">AI生图+自动合成书名/作者/副标题，输出专业网文级封面</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">书名 <span className="text-amber-600 text-xs">（艺术字叠加在封面图）</span></label>
            <input
              type="text"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              placeholder="输入小说书名"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">作者名</label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="输入作者名"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-stone-700 mb-1">副标题/宣传语 <span className="text-amber-600 text-xs">（金句/Slogan·18字内最佳）</span></label>
            <input
              type="text"
              value={subtitleText}
              onChange={(e) => setSubtitleText(e.target.value)}
              placeholder="基于本作题材与爽点设计封面宣传语（18字内）"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <h4 className="text-sm font-medium text-stone-700 mb-3">选择平台尺寸</h4>
        <div className="flex flex-wrap gap-2">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setSelectedSize(preset)}
              className={`px-3 py-2 rounded-lg text-sm transition-all ${
                selectedSize.label === preset.label
                  ? 'bg-stone-100 border-2 border-stone-400 text-stone-800 font-medium'
                  : 'bg-stone-50 border-2 border-stone-200 text-stone-600 hover:border-stone-300'
              }`}
            >
              {preset.icon} {preset.label}
              <span className="text-xs text-stone-400 ml-1">({preset.width}x{preset.height})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <h4 className="text-sm font-medium text-stone-700 mb-3">选择封面配色（艺术字&边框）</h4>
        <div className="flex flex-wrap gap-2">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.label}
              onClick={() => setSelectedScheme(scheme)}
              className={`px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                selectedScheme.label === scheme.label
                  ? 'bg-stone-100 border-2 border-stone-400 text-stone-800 font-medium'
                  : 'bg-stone-50 border-2 border-stone-200 text-stone-600 hover:border-stone-300'
              }`}
            >
              <div className="flex">
                {scheme.colors.map((color, idx) => (
                  <span key={idx} className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }}></span>
                ))}
              </div>
              {scheme.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <button
          onClick={() => setShowCustomDesign(!showCustomDesign)}
          className="w-full flex items-center justify-between hover:bg-stone-50 p-2 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-stone-400" />
            <span className="font-medium text-stone-700">自定义设计</span>
          </div>
          <span className={`text-sm transition-colors ${showCustomDesign ? 'text-stone-800' : 'text-stone-400'}`}>
            {showCustomDesign ? '收起 ▲' : '展开 ▼'}
          </span>
        </button>
        
        {showCustomDesign && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-2">自定义封面描述 <span className="text-xs text-stone-400">（留空则按下方本书元素自动构建）</span></label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={'例：' + [
                  (characters?.protagonist?.name || '主角') + '立于',
                  String(worldbuilding.mainLocation || worldbuilding.era || '关键场景'),
                  '之巅，' + String((generatedData as Record<string, unknown>)?.goldenfinger && ((generatedData as Record<string, unknown>).goldenfinger as Record<string, unknown>)?.name || '金手指') + '光华笼罩四方',
                ].join('') + '（可自由改写画面构成）'}
                rows={3}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-stone-400 resize-none"
              />
            </div>
            
            <div className="bg-stone-50 rounded-lg p-3 text-sm text-stone-700">
              <p className="font-medium mb-1">💡 封面生成后将自动叠加：</p>
              <ul className="space-y-1 list-disc list-inside text-xs">
                <li>书名艺术字（渐变描边+发光阴影+双层描边）</li>
                <li>副标题/宣传语（渐变横条底+左右装饰线）</li>
                <li>作者名+红色「印」章（专业封面落款）</li>
                <li>双层古风边框+四角祥云纹装饰</li>
                <li>顶底渐变遮光带（突出文字层次）</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-6">
        <div 
          className="relative rounded-lg overflow-hidden shadow-xl border-2 border-stone-200 bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center"
          style={{
            width: Math.min(selectedSize.width * 0.4, 320),
            height: Math.min(selectedSize.height * 0.4, 427),
          }}
        >
          {coverUrl ? (
            svgContent ? (
              <div className="w-full h-full" style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: svgContent.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"') }} />
            ) : (
              <img src={coverUrl} alt="小说封面" className="w-full h-full object-cover" />
            )
          ) : (
            <div className="text-center p-4">
              <ImageIcon className="w-16 h-16 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">封面将在此显示</p>
              <p className="text-stone-300 text-xs mt-1">{selectedSize.width} × {selectedSize.height}</p>
            </div>
          )}
          {(coverLoading || composing) && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">{coverLoading ? 'AI正在绘图...' : '正在合成封面文字...'}</p>
            </div>
          )}
        </div>

        {coverUrl && !svgContent && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-w-md">
            <p className="text-amber-700 text-xs">
              💡 修改了书名/作者/副标题/配色？点击「重新合成文字」立即刷新封面，无需重绘图片
            </p>
          </div>
        )}

        {coverUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md">
            <p className="text-green-700 text-sm">
              ✅ 封面已生成！实际尺寸 {selectedSize.width}×{selectedSize.height}，可下载保存。
            </p>
          </div>
        )}

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            type="button"
            onClick={handleGenerateCover}
            disabled={coverLoading || composing}
            className="inline-flex items-center gap-2 px-8 py-3 text-white bg-stone-800 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
          >
            {coverLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                正在生成封面...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                {coverUrl ? '重新生成封面' : '生成小说封面'}
              </>
            )}
          </button>

          {coverUrl && !svgContent && (
            <button
              type="button"
              onClick={() => doCompose()}
              disabled={composing}
              className="inline-flex items-center gap-2 px-6 py-3 text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {composing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  合成中...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  重新合成文字
                </>
              )}
            </button>
          )}

          {coverUrl && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-8 py-3 text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-lg font-medium"
            >
              <Download className="w-5 h-5" />
              下载封面
            </button>
          )}
        </div>

        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 max-w-lg text-sm text-stone-700">
          <p className="font-medium mb-2">🍅 番茄平台爆款封面要素：</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>人物特写居中，眼神有戏，占画面60%+</li>
            <li>黄金侧光+体积光，电影级布光+HDR高对比</li>
            <li>书名醒目渐变描边（金色玄幻/白蓝仙侠/红金历史）</li>
            <li>双层古风边框+四角装饰纹，顶底渐变遮光带</li>
            <li>作者名+红色印章落款，视觉层次清晰</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function buildCoverPrompt(genre: string, title: string, era: string, protagonistName: string, oneLineIntro: string, worldbuilding: Record<string, unknown>, colorScheme: { label: string; colors: string[] } = COLOR_SCHEMES[0]): string {
  const wb: Record<string, unknown> = worldbuilding || {}
  const theme = String(wb.coreTheme || wb.theme || wb.coreConflict || oneLineIntro || title || '')
  const eraName = String(era || wb.era || wb.historyEra || wb.worldName || '')
  const _impLocs = Array.isArray(wb.importantLocations) ? (wb.importantLocations as Array<Record<string, unknown>>) : []
  const _forbZones = Array.isArray(wb.forbiddenZones) ? (wb.forbiddenZones as Array<Record<string, unknown>>) : []
  const loc = String(wb.mainLocation || (_impLocs[0] && _impLocs[0].name) || (_forbZones[0] && _forbZones[0].name) || '')
  const race = String((Array.isArray(wb.raceSystem) ? wb.raceSystem[0] : '') || '')
  const _impItems = Array.isArray(wb.importantItems) ? (wb.importantItems as Array<unknown>) : []
  const relic = String(wb.coreRelic || wb.supremeTreasure || _impItems[0] || '')
  const gfName = String(wb.goldenFinger || wb.corePower || '')
  const sceneKeywords = [theme, eraName, loc, race, relic, gfName].filter(Boolean).join(', ').slice(0, 120)

  let genrePrompt = ''
  const g = String(genre || '玄幻')
  if (g.indexOf('玄幻') >= 0) genrePrompt = 'ancient Chinese fantasy, majestic ancient sect gate, towering spirit mountain, dao mark runes swirling, dragon qi aura, heaven and earth vision, primal chaos energy, battlefield of gods and demons backdrop, ancient bronze cauldron silhouette'
  else if (g.indexOf('仙侠') >= 0) genrePrompt = 'xianxia immortal realm, celestial peach tree, sword mountain piercing clouds, nine colored immortal lightning, jade capital, dao altar, ethereal spirit mist drifting, flying cranes, lotus pond at heavenly peak'
  else if (g.indexOf('都市') >= 0) genrePrompt = 'modern prosperous metropolis, skyscraper observation deck, neon night rain, luxury sports car silhouette, top tier business district, LED billboards, urban legend atmosphere'
  else if (g.indexOf('科幻') >= 0 || g.indexOf('星际') >= 0 || g.indexOf('未来') >= 0) genrePrompt = 'futuristic sci-fi, interstellar mothership bridge, warp tunnel light streak, alien planet double sunrise, mecha legion array, holographic star map, quantum reactor core glow'
  else if (g.indexOf('末世') >= 0 || g.indexOf('末日') >= 0) genrePrompt = 'post-apocalyptic wasteland, half collapsed skyscraper, mutated beast silhouette in dust storm, crimson sunset, barbed wire outpost, ash rain, survival fortress beacon'
  else if (g.indexOf('历史') >= 0 || g.indexOf('王朝') >= 0 || g.indexOf('争霸') >= 0) genrePrompt = 'ancient Chinese dynasty, imperial palace hall, golden tiled roof, battle flag array, grand army phalanx on horizon, strategic map on sand table, dawn before decisive battle'
  else if (g.indexOf('军事') >= 0 || g.indexOf('战争') >= 0) genrePrompt = 'military battlefield panorama, artillery fire, tank phalanx, fighter jet contrails, soldier silhouette in trench, smoke and fire, dramatic war torn sky'
  else if (g.indexOf('悬疑') >= 0 || g.indexOf('推理') >= 0 || g.indexOf('刑侦') >= 0) genrePrompt = 'noir thriller, rainy cobblestone alley, vintage street lamp halo, detective silhouette holding magnifying glass, mysterious shadow on brick wall, fog shrouded crime scene'
  else if (g.indexOf('武侠') >= 0 || g.indexOf('江湖') >= 0) genrePrompt = 'wuxia martial arts world, ancient bamboo forest, swirling fallen leaves, long sword glint, wine jar by riverside stone, traditional ink wash style, distant mountain silhouette'
  else if (g.indexOf('系统') >= 0 || g.indexOf('重生') >= 0 || g.indexOf('穿越') >= 0) genrePrompt = 'dimensional rift, golden level up light cone, translucent game status panel, time gear clockwork, portal of rebirth, digital runes floating, before after visual split'
  else if (g.indexOf('西幻') >= 0 || g.indexOf('魔法') >= 0) genrePrompt = 'western fantasy medieval, wizard tower, ancient dragon circling, magic circle glowing, knight armor with heraldry, gothic castle silhouette, enchanted forest twilight'
  else if (g.indexOf('奇幻') >= 0) genrePrompt = 'high fantasy epic, floating islands in aurora, ancient world tree, phoenix in flight, crystal palace, magical runestones, ethereal mist waterfall'
  else if (g.indexOf('网游') >= 0 || g.indexOf('电竞') >= 0) genrePrompt = 'cyberspace game arena, pixelated neon light trail, boss health bar UI, virtual reality headset POV, tournament stadium, keyboard and sword hybrid visual'
  else if (g.indexOf('宫斗') >= 0 || g.indexOf('宅斗') >= 0) genrePrompt = 'ancient Chinese harem courtyard, red lantern corridor, silk dress flowing, jade hairpin detail, forbidden city wall at dusk, plum blossom in winter'
  else if (g.indexOf('种田') >= 0 || g.indexOf('经营') >= 0) genrePrompt = 'idyllic countryside cottage, terraced rice paddy at sunrise, village market street, warm kitchen smoke, old well, wooden fence with morning vine'
  else genrePrompt = 'fantasy world, dramatic cinematic composition, awe inspiring central element, volumetric god rays, legendary atmosphere, movie poster quality'

  let protagonistDetail = ''
  // 🔥 QA-封面修复：不再「总是出现人物因素」——按书名哈希轮换 人物主视觉/场景主视觉 两种构图；
  //   历史/玄幻/仙侠/科幻等场景型题材固定场景主视觉（番茄爆款封面以大场景+氛围为主，人物非必需）。
  const _sceneFirstGenres = ['历史', '王朝', '争霸', '军事', '战争', '科幻', '星际', '末世', '末日', '种田', '经营']
  const _isSceneFirstGenre = _sceneFirstGenres.some(function (gk) { return g.indexOf(gk) >= 0 })
  let _personHash = 0
  for (let _phi = 0; _phi < (title || '').length; _phi++) { _personHash = (_personHash * 31 + (title || '').charCodeAt(_phi)) >>> 0 }
  const _includePerson = !_isSceneFirstGenre && (_personHash % 2 === 1)
  if (protagonistName && _includePerson) {
    let protoGender = 'male'
    try {
      const gnList = ['雪','月','柔','婉','婷','怡','欣','妍','嫣','妤','萱','瑶','诗','涵','薇','晴','梦','兰','凤','姬','嫣','绫','纱','芸','若','双','儿','灵','珊','珠','翠','柳','桃','荷','莲','菊','桂','芝','玉','华','秀','娟','英','慧','敏']
      for (let _gi = 0; _gi < gnList.length; _gi++) { if (protagonistName.indexOf(gnList[_gi]) >= 0) { protoGender = 'female'; break } }
    } catch (_e) { console.error('[StepCover] 主角性别推断失败:', _e) }
    if (g.indexOf('玄幻') >= 0 || g.indexOf('仙侠') >= 0) {
      protagonistDetail = protoGender === 'female'
        ? ', heroic female cultivator protagonist in center, holding a glowing spirit sword, celestial silk robe flowing, eyes sharp with determined intent, long hair dancing in spirit wind'
        : ', heroic young male protagonist in center, gripping a mysterious ancient weapon, embroidered dark robe with golden dao runes, firm gaze with killing intent, wind swept hair'
    } else if (g.indexOf('都市') >= 0) {
      protagonistDetail = protoGender === 'female'
        ? ', stylish modern female protagonist in center, elegant business attire, confident expression, city night lights behind'
        : ', charismatic modern male protagonist in center, tailored suit with subtle swagger, cold piercing eyes, leaning against luxury car'
    } else if (g.indexOf('科幻') >= 0 || g.indexOf('末世') >= 0 || g.indexOf('军事') >= 0) {
      protagonistDetail = ', tough survivor protagonist in center, combat gear, energy weapon in hand, weathered face with sharp eyes, tactical headset, battle scars'
    } else if (g.indexOf('历史') >= 0 || g.indexOf('争霸') >= 0 || g.indexOf('宫斗') >= 0) {
      protagonistDetail = protoGender === 'female'
        ? ', graceful yet cunning female protagonist in center, exquisite hanfu with gold embroidery, phoenix hairpin, calculating intelligent gaze, imperial garden backdrop'
        : ', ambitious ruler or general protagonist in center, dragon robe or crimson general armor, holding sword hilt, strategist eyes overlooking empire map'
    } else if (g.indexOf('悬疑') >= 0 || g.indexOf('推理') >= 0) {
      protagonistDetail = ', sharp detective protagonist in center, trench coat collar turned up, holding lighter or pocket watch, eyes analyzing hidden clues in shadow'
    } else {
      protagonistDetail = ', protagonist figure in center with compelling stance, eyes conveying core emotion of the story'
    }
  } else if (protagonistName && !_includePerson) {
    // 场景主视觉：明确告知生图模型不要以人物为中心
    protagonistDetail = ', no prominent human figures, epic scene-focused composition, atmosphere and world-building as the true protagonist of the artwork'
  }

  const mainColor = colorScheme.colors?.[0] || '#d4a017'
  const bgColor = colorScheme.colors?.[1] || '#1a0a2e'
  const accentLight = colorScheme.colors?.[2] || '#f0e6d3'
  const colorContext = `, color palette dominated by ${mainColor} accents with ${bgColor} deep background, highlight tones of ${accentLight}, cinematic color grading, use ${mainColor} as signature accent for aura and rim light`

  const compositionGuide = 'cinematic poster composition, rule of thirds, strong foreground midground background depth, low angle hero shot, volumetric lighting, god rays piercing through clouds or mist, intricate hyper detailed texture, professional novel cover framing, negative space reserved for title, high contrast HDR, 8k ultra detailed masterpiece, digital painting trending on artstation'

  let themeTag = ''
  if (sceneKeywords && sceneKeywords.length > 8) themeTag = `, background elements suggesting: ${sceneKeywords}`

  return `Chinese web novel cover art, ${genrePrompt}${themeTag}${protagonistDetail}${colorContext}, ${compositionGuide}`
}
