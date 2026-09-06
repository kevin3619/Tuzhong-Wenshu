'use client'

import { useState, useEffect } from 'react'
import { BookOpen, Loader2, RefreshCw, AlertTriangle, Copy } from 'lucide-react'
import type { GeneratedData } from '../ai-generate-wizard'

type ChapterItem = NonNullable<NonNullable<GeneratedData['chapters']>['chapters']>[number] & { [key: string]: unknown }
type VolumeItem = NonNullable<NonNullable<GeneratedData['chapters']>['volumes']>[number]

interface StepChaptersProps {
  data: GeneratedData['chapters']
  onChange: (updated: GeneratedData['chapters']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  onGenerateFromConfig: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  volumeConfig: { volumeCount: number; chaptersPerVolume: number }
  onVolumeConfigChange: (field: 'volumeCount' | 'chaptersPerVolume', value: number) => void
  chapterLoadingProgress: string
  regeneratingField: string | null
  stepName: string
}

// Client-side punctuation cleaner
function cleanPunct(s: unknown): string {
  if (!s) return ''
  if (typeof s !== 'string') {
    if (typeof s === 'object' && s !== null) {
      const obj = s as Record<string, unknown>
      if (obj.event) return cleanPunct(obj.event)
      if (obj.name) return cleanPunct(obj.name)
      if (obj.description) return cleanPunct(obj.description)
      if (obj.content) return cleanPunct(obj.content)
      try { return cleanPunct(JSON.stringify(s)) } catch { return '' }
    }
    return String(s)
  }
  let t = s.trim()
  // 🔥 Bug3修复：先去除卷名前缀（如"第2卷 玄铁矿脉生死劫"），避免前缀导致去重失效
  t = t.replace(/^第\d+卷\s*[:：]?\s*\S{1,20}\s+/g, '')
  // 🔥 与后端 cleanVolumeSummary 保持一致：移除所有结构标签
  const _tagPattern = '(核心目标|开端|开篇|高潮|结局|发展|关键|剧情|主线|伏笔|转折|本卷|此卷|本卷主线|本卷主题|本卷概述|本卷剧情|本卷简介|阶段一|阶段二|阶段三|第一阶段|第二阶段|第三阶段|故事开始|故事发展|故事高潮|故事结局|主要冲突|次要冲突|支线|概括|总结|内容|背景|人物|冲突|节奏|情绪|爽点|打脸|反转|势力|目标|概述|简介|环节|脉络)'
  t = t.replace(new RegExp('^' + _tagPattern + '[：:]\\s*', 'g'), '')
  const _tagRegex = new RegExp('[。；，、！？\\s]*' + _tagPattern + '[：:]\\s*', 'g')
  for (let cleanRound = 0; cleanRound < 5; cleanRound++) {
    const beforeLen = t.length
    t = t.replace(_tagRegex, '。')
    t = t.replace(/[。；;]\s*[。；;]\s*/g, '。')
    t = t.replace(/[；;]\s*/g, '。')
    if (t.length === beforeLen) break
  }
  // 统一标点清理
  t = t.replace(/。。+/g, '。')
  t = t.replace(/，。+/g, '。')
  t = t.replace(/。，+/g, '。')
  t = t.replace(/，，+/g, '，')
  t = t.replace(/、、+/g, '、')
  t = t.replace(/；；+/g, '；')
  t = t.replace(/！！+/g, '！')
  t = t.replace(/？？+/g, '？')
  t = t.replace(/：：+/g, '：')
  t = t.replace(/、，/g, '、')
  t = t.replace(/，、/g, '、')
  t = t.replace(/。！/g, '！')
  t = t.replace(/！。/g, '！')
  t = t.replace(/。？/g, '？')
  t = t.replace(/？。/g, '？')
  t = t.replace(/。。。+/g, '……')
  t = t.replace(/……+/g, '……')
  t = t.replace(/……。+/g, '……')
  t = t.replace(/。……+/g, '……')
  t = t.replace(/^[。，、；：！？…·\s]+/, '')
  t = t.replace(/[：:]\s*$/g, '')
  return t.trim()
}

export default function StepChapters({
  data, onChange, onRegenerate, onGenerate, onGenerateFromConfig, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, volumeConfig, onVolumeConfigChange, chapterLoadingProgress, regeneratingField, stepName,
}: StepChaptersProps) {
  const isWholeStepRegenerating = regeneratingField === stepName

  // 章节深度字段：章节类型、场景转换、爽点设计、情绪节奏、POV视角、悬念钩子等
  // 基于本作前序设定为每章增加14个深度字段
  const _expandedChapters = useState<{[key: string]: boolean}>({})
  let _expandedMap = _expandedChapters[0]
  const _setExpandedMap = _expandedChapters[1]

  // 章节类型分类（基于本作前序大纲设定做章节节奏设计）
  // 开篇钩子=黄金三章强冲突 / 场景铺垫=世界观信息密度 / 冲突升级=矛盾递进 / 爽点高潮=打脸逆袭 / 反转转折=剧情转向 / 收尾钩子=章末悬念
  const _chapterTypeOptions = [
    { value: 'opening_hook', label: '开篇钩子', desc: '黄金三章强冲突，留住读者' },
    { value: 'scene_setup', label: '场景铺垫', desc: '世界观信息密度，不拖沓' },
    { value: 'conflict_escalation', label: '冲突升级', desc: '矛盾递进，张力上升' },
    { value: 'climax', label: '爽点高潮', desc: '打脸逆袭，爽感拉满' },
    { value: 'twist', label: '反转转折', desc: '剧情转向，出人意料' },
    { value: 'ending_hook', label: '收尾钩子', desc: '章末悬念，下章必看' },
  ]
  // 情绪节奏选项（下拉选择）
  const _emotionOptions = ['爽', '燃', '热血', '紧张', '温馨', '悲壮', '虐心', '轻松', '震撼', '压抑']
  // 叙事线选项（下拉选择）
  const _narrativeLineOptions = ['主线', '支线', '暗线']

  // 黄金三章默认展开深度字段（基于本作前序大纲黄金三章的精细设计）
  // 首次加载时，前3章自动展开，其余折叠
  const _initExpanded = function() {
    const _initMap: {[key: string]: boolean} = {}
    if (data?.volumes && Array.isArray(data.volumes)) {
      let _count = 0
      for (let vi = 0; vi < data.volumes.length && _count < 3; vi++) {
        const _chs = data.volumes[vi]?.chapters || []
        for (let ci = 0; ci < _chs.length && _count < 3; ci++) {
          const _ch = _chs[ci]
          if (_ch) {
            const _key = String(_ch.id || ('vol' + (vi + 1) + 'ch' + (ci + 1)))
            _initMap[_key] = true
            _count++
          }
        }
      }
    }
    return _initMap
  }
  // 仅在初次渲染时初始化（避免覆盖用户手动折叠操作）
  const _didInit = useState(false)
  if (!_didInit[0]) {
    const _initMap = _initExpanded()
    if (Object.keys(_initMap).length > 0) {
      _expandedMap = _initMap
      _setExpandedMap(_initMap)
    }
    _didInit[1](true)
  }

  // 切换章节深度字段展开/折叠
  const _toggleChapterExpand = function(chapterKey: string) {
    _setExpandedMap(function(prev: {[key: string]: boolean}) {
      const _next = Object.assign({}, prev)
      _next[chapterKey] = !prev[chapterKey]
      return _next
    })
  }

  // 通用字段更新：更新章节的任意字段（立体化新字段复用此函数）
  // 向后兼容：保留原有title/summary的内联onChange，新字段统一走此函数
  const handleChapterFieldChange = function(chapter: ChapterItem, vIndex: number, field: string, value: unknown) {
    const updatedChapter = Object.assign({}, chapter)
    updatedChapter[field] = value
    const newChapters = [...(data?.chapters || [])]
    for (let i = 0; i < newChapters.length; i++) {
      if (newChapters[i] && newChapters[i].id === chapter.id) {
        newChapters[i] = updatedChapter
        break
      }
    }
    const newVolumes = [...(data?.volumes || [])]
    if (newVolumes[vIndex]) {
      const volChapters = [...(newVolumes[vIndex].chapters || [])]
      for (let j = 0; j < volChapters.length; j++) {
        if (volChapters[j] && volChapters[j].id === chapter.id) {
          volChapters[j] = updatedChapter
          break
        }
      }
      newVolumes[vIndex] = Object.assign({}, newVolumes[vIndex], { chapters: volChapters })
    }
    onChange(Object.assign({}, data, { chapters: newChapters, volumes: newVolumes }))
  }

  // 数组字段解析：逗号/顿号分隔字符串 → 数组（用于characters/locations/shuangPoints）
  const _parseArrayField = function(text: string): string[] {
    if (!text) return []
    return text.split(/[，,、；;]/).map(function(s) { return s.trim() }).filter(function(s) { return s.length > 0 })
  }

  const autoResize = function(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  useEffect(function() {
    const timer = setTimeout(function() {
      document.querySelectorAll('textarea').forEach(function(ta) {
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
    }, 50)
    return function() { clearTimeout(timer) }
  }, [data])

  // 🔥 清理卷名：去除"第X章/第X卷"前缀，保留 keyPlots 中的原始卷名
  // 🔥🔥🔥 关键修复：不再强制截断到8字，不再强制逗号拆分，保留 keyPlots 中合理的卷名
  const sanitizeVolumeName = function(raw: string, volNum: number): string {
    if (!raw) return ''
    let name = raw.trim()
    // 去除所有"第X章"前缀（中文数字+阿拉伯数字）
    name = name.replace(/第\d+章\s*/g, '')
    name = name.replace(/第[一二三四五六七八九十百千\d]+章\s*/g, '')
    // 去除"第X卷"前缀（中文数字+阿拉伯数字，后面可跟:：·. 或空白）
    name = name.replace(/第\d+卷\s*[:：·.、\s]*/g, '')
    name = name.replace(/第[一二三四五六七八九十百千]+卷\s*[:：·.、\s]*/g, '')
    // 去除开头的数字
    name = name.replace(/^\d+\s*[:：·.、]*/, '')
    // 去除章节范围后缀（第X-Y章）
    name = name.replace(/[（(]第\d+[-–—~]\d+章[）)]\s*$/g, '')
    name = name.replace(/第\d+[-–—~]\d+章\s*$/g, '')
    // 🔥 轻度清理：去除·、/、；等分隔符（保留逗号作为合法分隔符）
    // 不再强制重组或截断，保留 keyPlots 中的原始卷名结构
    name = name.replace(/[·/；;]+/g, '，')
    name = name.replace(/[，,]{2,}/g, '，')
    name = name.replace(/^[，,\s]+|[，,\s]+$/g, '')
    // 🔥 卷名去重：检测并移除连续重复的短语（如"魂穿废柴，魂穿废柴"→"魂穿废柴"）
    const _dupMatch = name.match(/^([\u4e00-\u9fff]{2,8})[，,、：:]\s*\1$/)
    if (_dupMatch && _dupMatch[1]) {
      name = _dupMatch[1]
    }
    // 检测更一般的重复：前后半句高度相似
    const _parts = name.split(/[，,、；;]/).filter(function(s) { return s.trim().length >= 2 })
    if (_parts.length === 2 && _parts[0].trim() === _parts[1].trim()) {
      name = _parts[0].trim()
    }
    // 🔥 仅在卷名过长（>20字）时截断，避免影响显示
    if (name.length > 20) {
      name = name.slice(0, 20)
    }
    // 🔥 卷名至少2字，不符合则返回空（提示用户补充）
    if (!name || name.length < 2) return ''
    return name
  }

  // 🔥 生成卷的显示标题："第X卷：卷名（第X-Y章）"
  const formatVolumeDisplayTitle = function(volNum: number, volName: string, chaptersPerVol: number): string {
    const cnNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十']
    const volCn = (volNum >= 1 && volNum <= 20) ? cnNums[volNum - 1] : String(volNum)
    const startCh = (volNum - 1) * chaptersPerVol + 1
    const endCh = volNum * chaptersPerVol
    const namePart = volName || '待命名'
    return '第' + volCn + '卷：' + namePart + '（第' + startCh + '-' + endCh + '章）'
  }

  // 🔥 清理章节标题：确保只保留一次"第X章"前缀
  // 🔥 BUG-13修复：优先保留后端生成的有效标题，避免前端覆盖导致重复
  const sanitizeChapterTitle = function(raw: string, chNum: number, summary?: string): string {
    const extractTitleFromSummary = function(sum: string): string {
      if (!sum || sum.length < 5) return ''
      const s = sum.trim()
      // 提取关键事件模式：找第一个动词+名词的组合
      const patterns = [
        /[\u4e00-\u9fff]{2,4}(?:觉醒|突破|获得|大战|崛起|出山|入世|复仇|揭秘|对决|闯荡|试炼|传承|联盟|逃亡|反击|反攻|遇险|遭遇|偶遇|重逢|分别|启程|归来|对峙|联手|背叛|真相|秘密|危机|考验|挑战|发现|阴谋)/g,
        /[\u4e00-\u9fff]{2,6}(?:的秘密|的真相|的危机|的考验|的挑战|的发现|的遭遇|的阴谋|的逆袭|的胜利|的失败|的转折)/g,
      ]
      const candidates: string[] = []
      for (let pi = 0; pi < patterns.length; pi++) {
        const matches = s.match(patterns[pi])
        if (matches) {
          for (let mi = 0; mi < matches.length; mi++) {
            if (matches[mi].length >= 4 && matches[mi].length <= 12) {
              candidates.push(matches[mi])
            }
          }
        }
      }
      if (candidates.length > 0) {
        let chosen = candidates[chNum % candidates.length]
        if (chosen.length > 12) chosen = chosen.substring(0, 12)
        return chosen
      }
      // 兜底：从摘要中提取主语+谓语结构
      const firstSentence = s.split(/[。！？]/)[0] || ''
      if (firstSentence.length > 4 && firstSentence.length < 20) {
        return firstSentence
      }
      // 最后兜底：提取前若干字符中的关键部分
      let short = s.substring(0, Math.min(30, s.length))
      short = short.replace(/[，。！？、；：""''（）\s]/g, '')
      if (short.length > 8) short = short.substring(short.length - 10)
      if (short.length < 4) return ''
      return short
    }

    if (!raw) {
      // 如果没有标题，尝试从摘要中提取
      if (summary) {
        const extracted = extractTitleFromSummary(summary)
        if (extracted) return `第${chNum}章 ${extracted}`
      }
      return `第${chNum}章 待生成`
    }
    let title = raw.trim()
    // 去除所有"第X章"前缀
    title = title.replace(/第\d+章\s*/g, '')
    title = title.replace(/第[一二三四五六七八九十百千\d]+章\s*/g, '')
    // 去除纯数字前缀
    title = title.replace(/^\d+\s*/, '')
    // 去除标点符号，保留纯中文
    title = title.replace(/[，,·、/；;：:！!？?（）()【】\[\]《》<>""''\s]+/g, '')

    // 🔥 BUG-13修复：如果后端已经生成了有效标题（4-12字），直接使用，不再从摘要重新提取
    // 只有在标题无效（过短、不完整）时才从摘要提取
    const isIncomplete = title.length < 4 || /^(.*)(着|了|的|在|把|被|让|使|将|把|与|和|及|跟|同|向|往|朝|从|自|由|于|以|为|对|给|跟|向|往|朝|从|自|由|于|以|为|对|给)$/.test(title)
    if (isIncomplete && summary) {
      const extracted2 = extractTitleFromSummary(summary)
      if (extracted2 && extracted2.length >= 4) {
        title = extracted2
      }
    }
    // 限制长度在4-12字
    if (title.length > 12) {
      title = title.slice(0, 12)
    }
    // 如果为空或太短，尝试从摘要提取
    if (!title.trim() || title.length < 4) {
      if (summary) {
        const extracted3 = extractTitleFromSummary(summary)
        if (extracted3) title = extracted3
      }
    }
    // 最终兜底
    if (!title.trim() || title.length < 2) title = '待生成'
    // 重新添加唯一的"第X章"前缀
    return `第${chNum}章 ${title.trim()}`
  }

  // 🔥🔥🔥 BUG-13修复：章节标题去重——不再强制统一字数，优先保留后端生成的有效标题
  // 只在标题为空或重复时才进行处理，确保每章标题唯一
  const unifyVolumeChapterTitles = function(chapters: ChapterItem[]): ChapterItem[] {
    if (!Array.isArray(chapters) || chapters.length === 0) return chapters

    // 从文本中提取关键短语（2-6字）
    const _extractKeywords = function(text: string): string[] {
      if (!text) return []
      const _kt = text.replace(/[，。！？、；：""''\s（）()【】\[\]第\d章]/g, '|')
      const _parts = _kt.split('|').filter(function(p) { return p.length >= 2 && p.length <= 6 })
      return _parts
    }

    // 从摘要中提取动宾结构短语作为标题候选
    const _extractActionPhrase = function(sum: string): string {
      if (!sum || sum.length < 5) return ''
      const s = sum.trim()
      const patterns = [
        /[\u4e00-\u9fff]{2,4}(?:觉醒|突破|获得|大战|崛起|出山|入世|复仇|揭秘|对决|闯荡|试炼|传承|联盟|逃亡|反击|反攻|遇险|遭遇|偶遇|重逢|分别|启程|归来|对峙|联手|背叛|真相|秘密|危机|考验|挑战|发现|阴谋)/g,
      ]
      const matches = s.match(patterns[0])
      if (matches) {
        for (let mi = 0; mi < matches.length; mi++) {
          if (matches[mi].length >= 4 && matches[mi].length <= 8) {
            return matches[mi]
          }
        }
      }
      return ''
    }

    // 收集全卷所有摘要的关键短语作为备选
    let _allKeywords: string[] = []
    for (let k = 0; k < chapters.length; k++) {
      if (chapters[k]?.summary) {
        _allKeywords = _allKeywords.concat(_extractKeywords(chapters[k].summary))
      }
    }
    // 去重
    const _uniqKeywords: string[] = []
    const _seen: { [key: string]: boolean } = {}
    for (let uk = 0; uk < _allKeywords.length; uk++) {
      if (!_seen[_allKeywords[uk]]) {
        _seen[_allKeywords[uk]] = true
        _uniqKeywords.push(_allKeywords[uk])
      }
    }

    // 🔥 已使用的标题集合，确保每章标题唯一
    const _usedTitles: { [key: string]: boolean } = {}

    return chapters.map(function(ch: ChapterItem, idx: number) {
      if (!ch) return ch
      const _chNum = ch.chapterNumber || (idx + 1)
      // 提取当前章节的核心标题
      const _m = (ch.title || '').match(/第\d+章\s*([\u4e00-\u9fff]+)/)
      let _core = _m && _m[1] ? _m[1] : ''

      // 🔥 BUG-13修复：如果后端已生成有效标题（4-12字），直接使用，不再截断或补全
      if (!_core || _core.length < 4) {
        // 标题为空或过短，从摘要中提取
        if (ch.summary) {
          const _actionPhrase = _extractActionPhrase(ch.summary)
          if (_actionPhrase && _actionPhrase.length >= 4) {
            _core = _actionPhrase
          } else {
            const _kw = _extractKeywords(ch.summary)
            if (_kw.length > 0) {
              _core = _kw[0]
            }
          }
        }
        if (!_core || _core.length < 2) _core = '剧情' + (idx + 1)
      }

      // 🔥 限制标题长度在4-12字
      if (_core.length > 12) {
        _core = _core.substring(0, 12)
      }

      // 🔥🔥🔥 关键修复：确保标题唯一，如果重复则从摘要中提取新的独特短语
      if (_usedTitles[_core]) {
        // 优先从当前章节摘要中提取动宾结构短语
        let _newPhrase = ''
        if (ch.summary) {
          _newPhrase = _extractActionPhrase(ch.summary)
        }
        if (_newPhrase && !_usedTitles[_newPhrase]) {
          _core = _newPhrase
        } else {
          // 从全卷关键词中找一个未使用的
          let _foundNew = false
          for (let _uki = 0; _uki < _uniqKeywords.length; _uki++) {
            const _candidate = _uniqKeywords[_uki]
            if (_candidate.length >= 4 && _candidate.length <= 8 && !_usedTitles[_candidate]) {
              _core = _candidate
              _foundNew = true
              break
            }
          }
          // 最后的兜底：在原标题后添加章节序号后缀
          if (!_foundNew) {
            _core = _core + (idx + 1)
            if (_core.length > 12) _core = _core.substring(0, 12)
          }
        }
      }

      // 标记为已使用
      _usedTitles[_core] = true

      return Object.assign({}, ch, { title: '第' + _chNum + '章 ' + _core })
    })
  }

  // 🔥 清理卷摘要：确保不包含重复内容和套话
  const sanitizeVolumeSummary = function(raw: string): string {
    if (!raw) return ''
    let summary = raw.trim()
    
    // 🔥 第一步：彻底移除所有标签式分块结构（【】《》[]包裹的标签）
    const _labelPatterns = [
      /【概览】/g, /【背景】/g, /【发展】/g, /【高潮】/g, /【结局】/g, /【结尾】/g,
      /【关键事件】/g, /【核心事件】/g, /【主要事件】/g, /【重要事件】/g,
      /【人物】/g, /【冲突】/g, /【转折】/g, /【悬念】/g, /【伏笔】/g,
      /【核心冲突】/g, /【剧情概述】/g, /【剧情简介】/g, /【内容简介】/g,
      /【卷首语】/g, /【导语】/g, /【简介】/g, /【概述】/g, /【核心目标】/g,
      /【开篇】/g, /【开卷】/g, /【本卷概述】/g, /【章节安排】/g, /【主要人物】/g,
      /《概览》/g, /《背景》/g, /《发展》/g, /《高潮》/g, /《结局》/g,
      /《关键事件》/g, /《核心事件》/g, /《主要事件》/g,
      /\[概览\]/g, /\[背景\]/g, /\[发展\]/g, /\[高潮\]/g, /\[结局\]/g,
      /\[关键事件\]/g, /\[核心事件\]/g, /\[主要事件\]/g,
    ]
    _labelPatterns.forEach(function(pat) {
      summary = summary.replace(pat, '')
    })
    // 移除"核心目标：""开篇：""高潮：""关键事件："这类冒号式标签前缀
    const _colonLabels = [
      '核心目标', '主要目标', '本卷目标', '卷目标',
      '开篇', '开卷', '卷开篇', '开端', '开头',
      '高潮', '卷高潮', '本卷高潮', '核心高潮',
      '关键事件', '核心事件', '主要事件', '重要事件', '事件',
      '结局', '结尾', '卷末', '收尾',
      '背景', '故事背景', '时代背景',
      '人物', '主要人物', '核心人物',
      '冲突', '核心冲突', '主要矛盾',
      '转折', '关键转折', '转折点',
      '悬念', '伏笔', '暗线',
      '概览', '概述', '简介', '导语', '卷首语', '摘要',
    ]
    _colonLabels.forEach(function(label) {
      const re = new RegExp('(^|[，。！？、；；\\n])\\s*' + label + '\\s*[：:]\\s*', 'g')
      summary = summary.replace(re, '$1')
    })
    // 移除行首的"1. 2. 3. ""①②③"等列举式编号
    summary = summary.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*[，,]?/, '')
    summary = summary.replace(/\n\s*\d+\s*[.、、:：]/g, '，')
    summary = summary.replace(/[；;]\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/g, '，')
    
    // 去除开头的"开篇"、"开卷"
    summary = summary.replace(/^开篇[,，]?/, '')
    summary = summary.replace(/^开卷[,，]?/, '')
    // 去除重复的"本卷"开头
    while (summary.indexOf('本卷') >= 0 && summary.indexOf('本卷') < 20) {
      summary = summary.substring(summary.indexOf('本卷') + 2)
    }
    // 🔥 移除所有套话
    const clichéPatterns = [
      /[，,；;。]?[^。！？]{0,20}(实力|人脉|势力|格局)(均发生|发生)(不可逆|重大|巨大)?变化[。！？]?/g,
      /[，,；;]?主角在本卷.*?(发生|改变|变化)[。！？]?/g,
      /[，,；;]?构成了本卷波澜壮阔的篇章[。！？]?/g,
      /[，,；;]?也为下一卷(的全面爆发)?埋下了伏笔[。！？]?/g,
      /[，,；;]?为(后续|下一卷?)(剧情)?埋下伏笔[。！？]?/g,
      /[，,；;]?拉开了序幕[。！？]?/g,
      /[，,；;]?整个故事(由此)?正式拉开帷幕[。！？]?/g,
      /[，,；;]?承上启下[。！？]?/g,
      /[，,；;]?精彩纷呈[。！？]?/g,
      /[，,；;]?好戏才刚刚开始[。！？]?/g,
      /[，,；;]?故事才刚刚开始[。！？]?/g,
      /[，,；;]?更大的危机(正在|悄然)降临[。！？]?/g,
      /[，,；;]?前路暗藏凶险[。！？]?/g,
      /[，,；;]?为后续逆袭之路奠定坚实基础[。！？]?/g,
      /[，,；;]?为后续高潮做好充分准备[。！？]?/g,
      /[，,；;]?新的威胁悄然逼近[。！？]?/g,
      /[，,；;]?整个故事落下帷幕[。！？]?/g,
      /[，,；;]?吹响了.*?号角[。！？]?/g,
    ]
    clichéPatterns.forEach(function(pat) {
      summary = summary.replace(pat, '')
    })
    // 🔥 修复半截断句
    summary = summary.replace(/[，,；;][^。！？；，,]{0,3}[；;]/g, '，')
    summary = summary.replace(/[，,]\s*[；;]\s*/g, '，')
    summary = summary.replace(/；\s*卷末/g, '，')
    summary = summary.replace(/卷末[^。！？]{0,20}[，,；;]/g, '')
    // 🔥 修复连续标点
    summary = summary.replace(/[。！？]{2,}/g, '。')
    summary = summary.replace(/[，,]{2,}/g, '，')
    summary = summary.replace(/[。！？]，/g, '。')
    summary = summary.replace(/，\s*。/g, '。')
    // 🔥 移除极短的不完整短句（如"期间结识。"、"为化解危机，雷。"）
    summary = summary.replace(/[，,；;][^。！？]{1,4}[。！？]/g, '。')
    // 🔥 清理开头的标点
    summary = summary.replace(/^[，,；;。！？\s]+/, '')
    // 确保以句号结尾
    if (!/[。！？…]$/.test(summary)) {
      summary = summary + '。'
    }
    // 截断到合理长度（150-250字最佳）
    if (summary.length > 250) {
      const cutPoint = Math.max(summary.lastIndexOf('。', 248), summary.lastIndexOf('！', 248), summary.lastIndexOf('？', 248))
      if (cutPoint > 140) {
        summary = summary.substring(0, cutPoint + 1)
      } else {
        summary = summary.slice(0, 248) + '。'
      }
    }
    return summary
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">分卷章节划分</h3>
            <p className="text-stone-500 text-sm">AI为你的小说规划了完整的章节结构（可直接编辑章节标题和简介）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder="输入你的需求，如：增加开篇冲突，减少章节数量..."
                className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
              />
              <button
                type="button"
                onClick={onGenerate}
                disabled={isWholeStepRegenerating}
                className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWholeStepRegenerating ? '生成中...' : '🔄 重新生成'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Build global duplicate tracker for all chapters across all volumes
  const allChapterSummaries: string[] = []
  const allChapterTitles: string[] = []
  if (data?.volumes && Array.isArray(data.volumes)) {
    for (let vi = 0; vi < data.volumes.length; vi++) {
      const vChapters = data.volumes[vi]?.chapters || []
      for (let ci = 0; ci < vChapters.length; ci++) {
        if (vChapters[ci]?.summary) allChapterSummaries.push(cleanPunct(vChapters[ci].summary).replace(/[，。！？、；：\s（）续\d+]/g, ''))
        if (vChapters[ci]?.title) allChapterTitles.push(cleanPunct(vChapters[ci].title).replace(/[（续\d+）]/g, ''))
      }
    }
  }

  function isDuplicateSummary(summary: string, currentIdx: number): boolean {
    if (!summary) return false
    const key = cleanPunct(summary).replace(/[，。！？、；：\s（）续\d+]/g, '')
    if (key.length < 5) return false
    for (let i = 0; i < allChapterSummaries.length; i++) {
      if (i === currentIdx) continue
      const existing = allChapterSummaries[i].replace(/[，。！？、；：\s（）续\d+]/g, '')
      if (existing.length < 5) continue
      // Check for exact match (identical summaries)
      if (key === existing) return true
      // Check for high similarity (>80% overlap)
      const minLen = Math.min(key.length, existing.length)
      if (minLen > 15 && key.slice(0, minLen) === existing.slice(0, minLen)) return true
      // Check if one is a substring of the other
      if (key.length > 10 && existing.length > 10 && (key.includes(existing) || existing.includes(key))) return true
      // 🔥🔥🔥 新增：基于字符集合重合度的相似度检查（防止部分重复）
      if (key.length >= 20 && existing.length >= 20) {
        const _shorter = key.length < existing.length ? key : existing
        const _longer = key.length < existing.length ? existing : key
        // 滑动窗口：检查8字以上连续子串重合
        if (_shorter.length >= 8) {
          for (let _sl = 0; _sl <= _shorter.length - 8; _sl++) {
            const _sub = _shorter.slice(_sl, _sl + 8)
            if (_longer.includes(_sub)) {
              return true
            }
          }
        }
      }
      // 🔥🔥🔥 新增：开头5字相同判定为高度重复（很多章节摘要开头都重复介绍背景）
      if (key.length >= 10 && existing.length >= 10 && key.slice(0, 5) === existing.slice(0, 5)) {
        return true
      }
    }
    return false
  }

  function isDuplicateTitle(title: string, currentIdx: number): boolean {
    if (!title) return false
    const key = cleanPunct(title).slice(0, 20).replace(/[，。！？、；：\s]/g, '')
    for (let i = 0; i < allChapterTitles.length; i++) {
      if (i === currentIdx) continue
      const existing = allChapterTitles[i]
      const minLen = Math.min(key.length, existing.length)
      if (minLen > 8 && key.slice(0, minLen) === existing.slice(0, minLen)) return true
    }
    return false
  }

  // 🔥 检测套路化/空洞内容
  function isClicheSummary(summary: string): boolean {
    if (!summary || summary.length < 20) return false
    const clichePatterns = [
      '为后续剧情埋下伏笔',
      '实力大增.*震惊',
      '震惊了.*所有人',
      '让所有人都震惊',
      '与此同时.*心中一惊',
      '然而.*就在这时',
      '本章.*承上启下',
      '推动.*剧情.*发展',
      '为.*打下.*基础',
      '更大的危机.*到来',
      '危机悄然降临',
      '暗流涌动',
      '命运的齿轮',
      '构成了本卷波澜壮阔的篇章',
      '也为下一卷埋下了伏笔',
      '拉开了序幕',
      '好戏才刚刚开始',
      '新的威胁悄然逼近',
    ]
    for (let pi = 0; pi < clichePatterns.length; pi++) {
      const re = new RegExp(clichePatterns[pi])
      if (re.test(summary)) return true
    }
    // 检测是否内容太短（<60字为空洞）
    const cleaned = summary.replace(/[，。！？、；：\s第\d章章]/g, '')
    if (cleaned.length < 45) return true
    // 检测逗号数量（少于2个逗号说明句子太少，内容不够丰满）
    const commaCount = (summary.match(/[，。；]/g) || []).length
    if (commaCount < 3) return true
    return false
  }

  // 🔥 检测章节摘要是否包含卷摘要内容（跨层重复检查）
  function isSummaryCrossLayerDuplicate(chapterSummary: string, volumeSummary: string): boolean {
    if (!chapterSummary || !volumeSummary) return false
    const chClean = chapterSummary.replace(/[，。！？、；：\s]/g, '')
    const volClean = volumeSummary.replace(/[，。！？、；：\s]/g, '')
    if (chClean.length < 10 || volClean.length < 10) return false
    // 检查章节摘要是否包含卷摘要中的连续短语（5字以上）
    for (let i = 0; i < volClean.length - 4; i++) {
      const phrase = volClean.slice(i, i + 5)
      if (chClean.includes(phrase)) return true
    }
    return false
  }

  // 🔥 检测章节标题是否包含卷名关键词（关键词复用检查）
  function isTitleCrossLayerDuplicate(chapterTitle: string, volumeName: string): boolean {
    if (!chapterTitle || !volumeName) return false
    const chClean = chapterTitle.replace(/[第\d章\s]/g, '')
    const volClean = volumeName.replace(/[，,·、/；;\s]/g, '')
    if (chClean.length < 2 || volClean.length < 4) return false
    // 检查章节标题是否包含卷名中的完整词组
    for (let i = 0; i < volClean.length - 1; i++) {
      const phrase = volClean.slice(i, i + 2)
      if (chClean.includes(phrase) && chClean.length <= 6) return true
    }
    return false
  }

  return (
    <div className="space-y-6">
      {/* 警告提示：部分卷数据不完整 */}
      {(() => {
        const invalidVolumes = (data?.volumes || []).filter((v) =>
          !v.name || v.name.includes('待命名') || !v.summary || v.summary.includes('待生成')
        )
        if (invalidVolumes.length === 0) return null
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-yellow-800 text-lg">⚠️</span>
                <div>
                  <span className="text-yellow-800 font-medium">部分卷数据不完整</span>
                  <p className="text-yellow-700 text-sm mt-1">
                    有 {invalidVolumes.length} 卷数据未生成完整，你可以手动编辑或点击下方按钮重新生成
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`确定要重新生成所有${volumeConfig.volumeCount}卷章节吗？`)) {
                    onGenerate()
                  }
                }}
                disabled={isWholeStepRegenerating}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm disabled:opacity-50"
              >
                重新生成全部
              </button>
            </div>
          </div>
        )
      })()}

      {/* 标题区域 */}
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">分卷章节划分</h3>
          <p className="text-stone-500 text-sm">AI为你的小说规划了完整的章节结构（可直接编辑章节标题和简介）</p>
          {chapterLoadingProgress && (
            <div className="mt-3 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-2 text-stone-800 text-sm font-medium">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {chapterLoadingProgress}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder="输入你的需求，如：增加开篇冲突，减少章节数量..."
              className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
            />
            <button
              type="button"
              onClick={() => onRegenerate(stepName)}
              disabled={isWholeStepRegenerating}
              className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWholeStepRegenerating ? '生成中...' : '🔄 重新生成'}
            </button>
          </div>
        </div>
      </div>

      {/* 卷数设置区域 */}
      <div className="bg-gradient-to-r bg-stone-50 rounded-xl p-6 mb-4">
        <h4 className="text-lg font-semibold text-stone-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-stone-800" />
          卷数设置
        </h4>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-stone-600">总卷数</label>
            <input
              type="number"
              min={1}
              max={20}
              value={volumeConfig.volumeCount}
              onChange={(e) => onVolumeConfigChange('volumeCount', parseInt(e.target.value) || 1)}
              className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-600">每卷章节数</label>
            <input
              type="number"
              min={1}
              max={200}
              value={volumeConfig.chaptersPerVolume}
              onChange={(e) => onVolumeConfigChange('chaptersPerVolume', parseInt(e.target.value) || 1)}
              className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-600">总章节数</label>
            <div className="mt-1 px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg text-stone-700 font-medium">
              {(() => {
                const actualCount = (data?.chapters && Array.isArray(data.chapters) ? data.chapters.length : 0)
                || (data?.volumes ? data.volumes.reduce(function(sum: number, v: VolumeItem) { return sum + ((v.chapters && Array.isArray(v.chapters)) ? v.chapters.length : 0); }, 0) : 0)
                return (actualCount > 0 ? actualCount : volumeConfig.volumeCount * volumeConfig.chaptersPerVolume) + ' 章'
              })()}
            </div>
          </div>
        </div>
        {data?.volumes && data.volumes.some((v) =>
          v.chapters?.some((ch: ChapterItem) => ch.status === 'pending' || ch.title?.includes('待生成'))
        ) && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-1">
            <span>⚠️</span>
            <span>卷章配置已变更，部分章节需要重新生成，请点击下方按钮</span>
          </div>
        )}
        <button
          type="button"
          onClick={onGenerateFromConfig}
          disabled={isWholeStepRegenerating}
          className="w-full py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isWholeStepRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isWholeStepRegenerating ? '正在生成章节...' : '按此配置生成章节'}
        </button>
      </div>

      {/* 🔥 卷信息编辑区域 - 扩大显示框 */}
      <div className="space-y-5 mb-6">
        {Array.from({ length: (data?.volumes && Array.isArray(data.volumes) && data.volumes.length > 0) ? data.volumes.length : volumeConfig.volumeCount }, (_, vIndex) => {
          const volumeNum = vIndex + 1
          const volumeData: VolumeItem = data?.volumes?.[vIndex] || ({} as VolumeItem)
          const volName = sanitizeVolumeName(volumeData.name, volumeNum)
          const volSummary = sanitizeVolumeSummary(volumeData.summary || '')
          const _volChapterCount = (volumeData.chapterCount as number) || volumeConfig.chaptersPerVolume
          const _volKeyPlots = (volumeData.keyPlots as string[]) || []
          // 计算实际章节范围
          const startChapter = (volumeNum - 1) * volumeConfig.chaptersPerVolume + 1
          const endChapter = volumeNum * volumeConfig.chaptersPerVolume
          // 中文数字
          const cnNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十']
          const volCn = (volumeNum >= 1 && volumeNum <= 20) ? cnNums[volumeNum - 1] : String(volumeNum)

          return (
            <div key={volumeNum} className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden">
              {/* 卷标题头 */}
              <div className="bg-gradient-to-r from-stone-50 via-stone-50 to-stone-50 px-5 py-4 border-b border-stone-100">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xl font-bold text-stone-800">第{volCn}卷</span>
                  <span className="text-stone-400">：</span>
                  <input
                    type="text"
                    value={volName}
                    onChange={(e) => {
                      const newVolumes = [...(data?.volumes || [])]
                      newVolumes[vIndex] = { ...volumeData, name: e.target.value } as VolumeItem
                      onChange({ ...data, volumes: newVolumes })
                    }}
                    placeholder={`基于本作大纲阶段名称填写卷名`}
                    className="flex-1 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-base font-semibold text-stone-800 focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
                  />
                  <span className="text-sm text-stone-500 whitespace-nowrap bg-white px-2 py-1 rounded border border-stone-200">
                    （第{startChapter}-{endChapter}章）
                  </span>
                </div>
              </div>

              {/* 卷摘要 */}
              <div className="p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-700">卷摘要</span>
                  <span className="text-xs text-stone-400">（120-180字，宏观叙事：核心目标+开篇节点+高潮节点+卷末钩子，禁用套话，不写单章细节）</span>
                </div>
                <textarea
                  value={volSummary}
                  onChange={(e) => {
                    const newVolumes = [...(data?.volumes || [])]
                    newVolumes[vIndex] = { ...volumeData, summary: e.target.value } as VolumeItem
                    onChange({ ...data, volumes: newVolumes })
                  }}
                  onInput={autoResize}
                  placeholder={`输入第${volumeNum}卷摘要（120-180字，宏观叙事：核心目标+开篇节点+高潮节点+卷末钩子，禁用套话，不写单章细节）...`}
                  rows={3}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-700 leading-relaxed resize-y min-h-[80px] focus:ring-2 focus:ring-stone-400 focus:border-stone-400 focus:bg-white"
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${volSummary.length >= 120 && volSummary.length <= 180 ? 'text-green-600' : 'text-amber-600'}`}>
                    {volSummary.length}字 {volSummary.length < 120 ? `（需120字以上，还差${120 - volSummary.length}字）` : volSummary.length > 180 ? '（建议不超过180字）' : '✓'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* 🔥 章节列表 - 按卷分组显示，扩大一倍 max-h */}
      <div className="space-y-4 max-h-[1000px] overflow-y-auto">
        {Array.from({ length: (data?.volumes && Array.isArray(data.volumes) && data.volumes.length > 0) ? data.volumes.length : volumeConfig.volumeCount }, (_, vIndex) => {
          const volumeNum = vIndex + 1
          const volumeName = sanitizeVolumeName(data?.volumes?.[vIndex]?.name, volumeNum)

          // 优先从 volumes[vIndex].chapters 读取
          const _rawChapters = (data?.volumes?.[vIndex]?.chapters || [])
            .length > 0
            ? data?.volumes?.[vIndex]?.chapters
            : (data?.chapters?.filter((ch: ChapterItem) => Number(ch.volume) === volumeNum) || [])

          // 🔥 统一本卷所有章节标题字数（4/5/6字统一）
          const actualChapters = unifyVolumeChapterTitles(_rawChapters)

          // 统计本卷已生成和未生成的章节数
          const generatedCount = actualChapters.filter((ch: ChapterItem) => ch.summary && ch.summary.trim().length > 0).length
          const totalCount = volumeConfig.chaptersPerVolume
          const isVolumeComplete = generatedCount === totalCount && totalCount > 0

          // Count duplicate summaries in this volume
          let volDupCount = 0
          for (let dv = 0; dv < actualChapters.length; dv++) {
            if (actualChapters[dv]._duplicateWarning) volDupCount++
          }

          return (
            <div key={volumeNum} className={`border rounded-xl overflow-hidden ${isVolumeComplete ? 'border-green-200' : 'border-stone-200'}`}>
              {/* 🔥 卷头 - 扩大高度 */}
              <div className={`px-5 py-4 flex items-center justify-between ${isVolumeComplete ? 'bg-gradient-to-r from-green-50 to-emerald-50' : 'bg-gradient-to-r from-stone-50 to-stone-50'}`}>
                <div>
                  <h5 className="font-semibold text-stone-800 text-base">
                    {formatVolumeDisplayTitle(volumeNum, volumeName, volumeConfig.chaptersPerVolume)}
                  </h5>
                  {volDupCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600 text-xs mt-1">
                      <Copy className="w-3 h-3" /> {volDupCount}处重复内容
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isLoading && !isVolumeComplete && (
                    <svg className="animate-spin h-4 w-4 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span className={`text-sm ${isVolumeComplete ? 'text-green-600' : 'text-stone-500'}`}>
                    {isVolumeComplete ? '✅' : ''} {generatedCount}/{totalCount}章
                  </span>
                </div>
              </div>
              {/* 🔥 进度条 - 加高 */}
              {totalCount > 0 && !isVolumeComplete && (
                <div className="h-1.5 bg-stone-100">
                  <div
                    className="h-full wenshu-btn-primary transition-all duration-500"
                    style={{ width: `${totalCount > 0 ? (generatedCount / totalCount * 100) : 0}%` }}
                  />
                </div>
              )}
              <div className="divide-y divide-stone-100">
                {(() => {
                  const sortedChapters = [...actualChapters]
                  sortedChapters.sort(function(a: ChapterItem, b: ChapterItem) {
                    const aNum = typeof a.chapterNumber === 'number' ? a.chapterNumber : (parseInt(String(a.chapterNumber)) || 0)
                    const bNum = typeof b.chapterNumber === 'number' ? b.chapterNumber : (parseInt(String(b.chapterNumber)) || 0)
                    return aNum - bNum
                  })
                  // Track global summary index for duplicate detection
                  let globalSummaryIdx = 0
                  for (let gv = 0; gv < vIndex; gv++) {
                    const prevChs = data?.volumes?.[gv]?.chapters || []
                    globalSummaryIdx += prevChs.length
                  }
                  return sortedChapters.map(function(chapter, index: number) {
                  const hasContent = chapter.summary && chapter.summary.trim().length > 0
                  const hasRealTitle = chapter.title && !chapter.title.match(/^第\d+章\s*(关键剧情|待生成|章节|剧情发展|高潮迭起|转折点)?$/)
                  const displayTitle = sanitizeChapterTitle(chapter.title || '', chapter.chapterNumber || (index + 1), chapter.summary || '')
                  const displaySummary = cleanPunct(chapter.summary || '')
                  const isDup = chapter._duplicateWarning || isDuplicateSummary(chapter.summary || '', globalSummaryIdx + index)
                  const isCliche = isClicheSummary(chapter.summary || '')
                  const isEmpty = chapter._emptySummary || !chapter.summary || chapter.summary.trim().length < 70
                  
                  // 🔥 跨层重复检查：章节摘要与卷摘要、章节标题与卷名
                  const volumeSummary = (data?.volumes?.[vIndex]?.summary || '').trim()
                  const volumeName = (data?.volumes?.[vIndex]?.name || '').trim()
                  const isSummaryCrossLayer = isSummaryCrossLayerDuplicate(displaySummary, volumeSummary)
                  const isTitleCrossLayer = isTitleCrossLayerDuplicate(displayTitle, volumeName)

                  // Determine border style
                  let rowBorder = 'border-stone-200'
                  let rowBg = hasContent ? 'hover:bg-stone-50' : 'bg-amber-50/30'
                  if (isDup) { rowBorder = 'border-red-300'; rowBg = 'bg-red-50/40' }
                  else if (isCliche) { rowBorder = 'border-orange-300'; rowBg = 'bg-orange-50/30' }
                  else if (isSummaryCrossLayer || isTitleCrossLayer) { rowBorder = 'border-stone-300'; rowBg = 'bg-stone-50/40' }
                  else if (isEmpty) { rowBorder = 'border-amber-300'; rowBg = 'bg-amber-50/50' }

                  // 章节深度字段展开状态：每章独立折叠/展开，默认折叠
                  const _chKey = String(chapter.id || ('vol' + volumeNum + 'ch' + (index + 1)))
                  const _isExpanded = !!_expandedMap[_chKey]

                  return (
                    <div key={`${chapter.id}-${index}`} className={`flex items-start space-x-4 p-4 ${rowBg} ${rowBorder}`}>
                      {/* 🔥 章节序号 - 扩大 */}
                      <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        isDup ? 'bg-red-100 text-red-600' :
                        isCliche ? 'bg-orange-100 text-orange-600' :
                        isEmpty ? 'bg-amber-100 text-amber-500' :
                        hasContent ? 'bg-stone-100 text-stone-700' : 'bg-amber-100 text-amber-500'
                      }`}>
                        {chapter.chapterNumber || index + 1}
                      </span>
                      {/* 🔥 章节内容区 - 扩大 */}
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="relative">
                          <input
                            type="text"
                            value={displayTitle}
                            onChange={(e) => {
                              const updatedChapter = { ...chapter, title: e.target.value }
                              const newChapters = [...(data?.chapters || [])]
                              const chIndex = newChapters.findIndex((ch: ChapterItem) => ch.id === chapter.id)
                              if (chIndex >= 0) {
                                newChapters[chIndex] = updatedChapter
                              }
                              const newVolumes = [...(data?.volumes || [])]
                              if (newVolumes[vIndex]) {
                                const volChapters = [...(newVolumes[vIndex].chapters || [])]
                                const volChIndex = volChapters.findIndex((ch: ChapterItem) => ch.id === chapter.id)
                                if (volChIndex >= 0) {
                                  volChapters[volChIndex] = updatedChapter
                                }
                                newVolumes[vIndex] = { ...newVolumes[vIndex], chapters: volChapters }
                              }
                              onChange({ ...data, chapters: newChapters, volumes: newVolumes })
                            }}
                            className={`w-full px-3 py-2 bg-white border rounded-lg font-medium text-stone-900 text-sm focus:ring-2 focus:ring-stone-400 ${
                              !hasRealTitle ? 'border-amber-300 bg-amber-50/50' : 'border-stone-200'
                            }`}
                            placeholder={!hasRealTitle ? '等待AI生成标题...' : '章节标题'}
                          />
                        </div>
                        <div className="relative">
                          <textarea
                              value={displaySummary}
                              onChange={(e) => {
                                const updatedChapter = { ...chapter, summary: e.target.value }
                                const newChapters = [...(data?.chapters || [])]
                                const chIndex = newChapters.findIndex((ch: ChapterItem) => ch.id === chapter.id)
                                if (chIndex >= 0) {
                                  newChapters[chIndex] = updatedChapter
                                }
                                const newVolumes = [...(data?.volumes || [])]
                                if (newVolumes[vIndex]) {
                                  const volChapters = [...(newVolumes[vIndex].chapters || [])]
                                  const volChIndex = volChapters.findIndex((ch: ChapterItem) => ch.id === chapter.id)
                                  if (volChIndex >= 0) {
                                    volChapters[volChIndex] = updatedChapter
                                  }
                                  newVolumes[vIndex] = { ...newVolumes[vIndex], chapters: volChapters }
                                }
                                onChange({ ...data, chapters: newChapters, volumes: newVolumes })
                              }}
                            placeholder={!hasContent ? '⏳ 等待AI生成...' : '章节摘要（40-120字，本章场景→主角行动→本章收尾转折）...'}
                            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-stone-600 leading-relaxed focus:ring-2 focus:ring-stone-400 ${
                              isDup ? 'border-red-400 bg-red-50/50' :
                              isCliche ? 'border-orange-300 bg-orange-50/30' :
                              'border-stone-200'
                            }`}
                            style={{ minHeight: '60px' }}
                            onInput={autoResize}
                            rows={3}
                          />
                          <span className={`text-xs ${
                              displaySummary.length >= 40 && displaySummary.length <= 120 ? 'text-green-600' :
                              displaySummary.length < 40 ? 'text-amber-600' : 'text-orange-600'
                            }`}>
                              {displaySummary.length}字 {displaySummary.length < 40 ? `（需40字以上，还差${40 - displaySummary.length}字）` : displaySummary.length > 120 ? '（建议不超过120字）' : '✓'}
                            </span>
                          </div>
                          {/* 章节深度字段展开/折叠按钮 */}
                          <button
                            type="button"
                            onClick={function() { _toggleChapterExpand(_chKey) }}
                            className="text-xs text-stone-800 hover:text-stone-900 font-medium flex items-center gap-1 mt-1 self-start"
                          >
                            {_isExpanded ? '▼ 收起深度字段' : '▶ 展开深度字段（冲突/爽点/POV/情绪等）'}
                          </button>
                          {/* 章节深度字段区域（基于本作前序设定做章节精细设计） */}
                          {_isExpanded && (
                            <div className="mt-2 p-3 bg-stone-50/40 border border-stone-200 rounded-lg space-y-2.5">
                              <div className="text-xs font-bold text-stone-800 flex items-center gap-1">
                                章节深度设计（14项字段）
                              </div>
                              {/* 章节类型 + 场景转换（基于本作前序大纲的场景流转） */}
                              <div className="grid grid-cols-2 gap-2 p-2 bg-amber-50/50 border border-amber-200 rounded">
                                <div>
                                  <label className="text-xs text-amber-700 block mb-0.5 font-medium">📖 章节类型 <span className="text-stone-400">（决定本章节奏定位）</span></label>
                                  <select
                                    value={String(chapter.chapterType || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'chapterType', e.target.value) }}
                                    className="w-full px-2 py-1 text-xs bg-white border border-amber-200 rounded focus:ring-1 focus:ring-amber-400"
                                  >
                                    <option value="">选择章节类型</option>
                                    {_chapterTypeOptions.map(function(opt) {
                                      return <option key={opt.value} value={opt.value}>{opt.label}·{opt.desc}</option>
                                    })}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-amber-700 block mb-0.5 font-medium">🎬 场景转换 <span className="text-stone-400">（从X→到Y→为何转换）</span></label>
                                  <input
                                    type="text"
                                    value={String(chapter.sceneTransition || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'sceneTransition', e.target.value) }}
                                    placeholder="基于本作世界观：填写本章场景流转（参考地理环境+势力领地）"
                                    className="w-full px-2 py-1 text-xs bg-white border border-amber-200 rounded focus:ring-1 focus:ring-amber-400"
                                  />
                                </div>
                              </div>
                              {/* 第一行：POV视角 + 情绪节奏 + 叙事线 + 爽点强度 */}
                              <div className="grid grid-cols-4 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">POV视角</label>
                                  <input
                                    type="text"
                                    value={String(chapter.pov || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'pov', e.target.value) }}
                                    placeholder="基于本作主角设定：填写本章POV视角角色（使用前文真实角色名）"
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">情绪节奏</label>
                                  <select
                                    value={String(chapter.emotion || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'emotion', e.target.value) }}
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  >
                                    <option value="">选择</option>
                                    {_emotionOptions.map(function(opt) { return <option key={opt} value={opt}>{opt}</option> })}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">叙事线</label>
                                  <select
                                    value={String(chapter.narrativeLine || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'narrativeLine', e.target.value) }}
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  >
                                    <option value="">选择</option>
                                    {_narrativeLineOptions.map(function(opt) { return <option key={opt} value={opt}>{opt}</option> })}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">爽点强度: {Number(chapter.intensity) || 1}/10</label>
                                  <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={Number(chapter.intensity) || 1}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'intensity', parseInt(e.target.value) || 1) }}
                                    className="w-full"
                                  />
                                </div>
                              </div>
                              {/* 第二行：核心冲突 + 章末钩子（强制必填） */}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">核心冲突</label>
                                  <input
                                    type="text"
                                    value={String(chapter.conflict || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'conflict', e.target.value) }}
                                    placeholder="基于本作前序角色/势力设定：填写本章冲突双方（使用前文真实角色/势力名）"
                                    className={`w-full px-2 py-1 text-xs bg-white border rounded focus:ring-1 focus:ring-stone-400 ${!chapter.conflict ? 'border-amber-300 bg-amber-50/30' : 'border-stone-200'}`}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-red-600 block mb-0.5 font-medium">🔔 章末钩子 <span className="text-red-400">（必填）</span></label>
                                  <input
                                    type="text"
                                    value={chapter.hook || ''}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'hook', e.target.value) }}
                                    placeholder="基于本作剧情节奏：填写本章结尾悬念钩子"
                                    className={`w-full px-2 py-1 text-xs bg-white border rounded focus:ring-1 focus:ring-red-400 ${!chapter.hook ? 'border-red-300 bg-red-50/30' : 'border-stone-200'}`}
                                  />
                                  {!chapter.hook && <span className="text-xs text-red-500 mt-0.5 block">⚠️ 每章必填章末钩子（基于本作剧情节奏设计悬念）</span>}
                                </div>
                              </div>
                              {/* 第三行：出场人物 + 场景地点 + 爽点设计（数组字段，逗号分隔） */}
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">出场人物（逗号分隔）</label>
                                  <input
                                    type="text"
                                    value={((chapter.characters as string[] | undefined) || []).join('，')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'characters', _parseArrayField(e.target.value)) }}
                                    placeholder="基于本作角色设定：填写本章出场人物（使用前文真实角色名，逗号分隔）"
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">场景地点（逗号分隔）</label>
                                  <input
                                    type="text"
                                    value={((chapter.locations as string[] | undefined) || []).join('，')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'locations', _parseArrayField(e.target.value)) }}
                                    placeholder="基于本作世界观：填写本章场景地点（参考地理环境+势力领地）"
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">爽点设计（逗号分隔）</label>
                                  <input
                                    type="text"
                                    value={(chapter.shuangPoints || []).join('，')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'shuangPoints', _parseArrayField(e.target.value)) }}
                                    placeholder="基于本作金手指/力量体系：填写本章爽点设计（参考金手指能力+核心冲突）"
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  />
                                </div>
                              </div>
                              {/* 第四行：伏笔标记 + 信息差 + 字数预估 */}
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">伏笔标记</label>
                                  <input
                                    type="text"
                                    value={String(chapter.foreshadowing || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'foreshadowing', e.target.value) }}
                                    placeholder="基于本作伏笔映射：填写本章埋设的伏笔（参考大纲foreshadowingMap）"
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">信息差</label>
                                  <input
                                    type="text"
                                    value={String(chapter.informationGap || '')}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'informationGap', e.target.value) }}
                                    placeholder="基于本作伏笔映射：填写本章信息差（读者知道而角色不知的信息）"
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 block mb-0.5">字数预估</label>
                                  <input
                                    type="number"
                                    value={Number(chapter.estimatedWords) || ''}
                                    onChange={function(e) { handleChapterFieldChange(chapter, vIndex, 'estimatedWords', parseInt(e.target.value) || 0) }}
                                    placeholder="基于本章内容预估字数"
                                    className="w-full px-2 py-1 text-xs bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      {/* 🔥 状态标识区 - 扩大 */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {isDup && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                            <Copy className="w-3 h-3" />重复
                          </span>
                        )}
                        {isCliche && !isDup && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                            <AlertTriangle className="w-3 h-3" />套路化
                          </span>
                        )}
                        {isSummaryCrossLayer && !isDup && !isCliche && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 text-stone-800 text-xs rounded-full font-medium">
                            <AlertTriangle className="w-3 h-3" />与卷摘要重复
                          </span>
                        )}
                        {isTitleCrossLayer && !isDup && !isCliche && !isSummaryCrossLayer && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 text-stone-800 text-xs rounded-full font-medium">
                            <AlertTriangle className="w-3 h-3" />与卷名重复
                          </span>
                        )}
                        {isEmpty && !isDup && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                          内容过短
                          </span>
                        )}
                        {hasContent && !isDup && !isEmpty && !isCliche && !isSummaryCrossLayer && !isTitleCrossLayer && (
                          <span className="text-xs text-green-500">✓</span>
                        )}
                      </div>
                    </div>
                  )
                  })
                })()}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}