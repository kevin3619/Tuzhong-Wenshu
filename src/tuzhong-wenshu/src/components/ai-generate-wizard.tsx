/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable react-hooks/purity */
 
'use client'

import { useState, useEffect, useRef, useCallback, lazy, Suspense, Fragment } from 'react'
import { Sparkles, ChevronRight, ChevronLeft, Loader2, BookOpen, FileText, Users, List, CheckCircle, Lightbulb, Globe, GitBranch, Shield, Zap, Target, RefreshCw, Trash2, BookCopy, Search, Image, AlertTriangle } from 'lucide-react'
import { WORKFLOW_STEPS, STEP_CONFIG, AGENT_CONFIG, QUALITY_STANDARDS, getNextStep, canProceedToStep, validateStepOutput } from '@/lib/netnovel-workflow'
import { extractText } from '@/lib/text-utils'
import { wrapCharSafe } from '@/lib/char-field-validator'
import { mergeGraphRelations, precleanRoleTableInput } from '@/lib/graph-json-cleaner'
import { saveStepSnapshot, rollbackStepSnapshot, canRollbackStep, getCurrentStepSnapshot, validateAndFixPowerSystem, cloneBizDataOnly } from '@/lib/step-snapshot-cache'
import { parseCharacterText, convertToCharacterFormat } from '@/lib/character-parser'
import StepInputDirect from './wizard-steps/StepInput'
import { buildTaskRoute, STEP_TO_TASK_TYPE, isCostSavingMode } from '@/lib/ai/llm'
import { DE_AI_GLOBAL_SKILL } from '@/lib/ai/de-ai-global'
import { PLATINUM_SKILLS } from '@/lib/ai/platinum-skills'
import { setActiveModel } from '@/components/activeModelStore'
import { runPitfallCheck } from '@/lib/ai/pitfallRules'
import { buildRepairPlan, applyPatches, applyDeterministicRepairs, buildRepairContext } from '@/lib/ai/repairPlan'
import type { RepairState } from './wizard-steps/StepChecklistPanel'
// 🔥 分卷章节划分修复：按「分卷剧情结构」KeyPlotVolume 合成卷摘要（coreObjective+开端事件+高潮事件+卷末钩子），并对重复段落去重
var synthVolumeSummaryFromDesign = function (vkp: any): string {
  if (!vkp || typeof vkp !== 'object') return ''
  var parts: string[] = []
  // 🔥 #180：剥离段尾句号/分号/逗号，避免 join('；') 后出现「。；」式标量杂乱（实测截图卷摘要）
  var cleanSeg = function (s: string): string {
    return String(s || '').trim().replace(/[。，、；;\s]+$/, '')
  }
  var dedupPush = function (segment: string) {
    var s = cleanSeg(segment)
    if (s.length < 4) return
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]
      if ((s.length >= 4 && p.indexOf(s) >= 0) || (p.length >= 4 && s.indexOf(p) >= 0)) return
      // 🔥 #180：4-gram 相似度去重——语义重复但字面不同的段（实测「以火器战术大败清军，成功解救桂林城」vs「以现代知识指导火器战术，成功击败清军将领」）
      var _shared = 0
      for (var _gi = 0; _gi <= s.length - 4; _gi++) {
        if (p.indexOf(s.substring(_gi, _gi + 4)) !== -1) { _shared++; _gi += 3 }
      }
      var _minLen = Math.min(p.length, s.length)
      if (_minLen >= 8 && _shared >= Math.max(2, Math.floor(_minLen / 4))) return
    }
    parts.push(s)
  }
  if (vkp.coreObjective) dedupPush(vkp.coreObjective)
  if (vkp.openingNode && vkp.openingNode.event) dedupPush(vkp.openingNode.event)
  if (vkp.climaxNode && vkp.climaxNode.event) dedupPush(vkp.climaxNode.event)
  if (vkp.endHook && vkp.endHook.content) dedupPush(vkp.endHook.content)
  var _joined = parts.join('；').trim()
  // 统一以句号结尾，与 StepChapters 的卷摘要展示风格一致
  if (_joined && !/[。！？…]$/.test(_joined)) _joined += '。'
  return _joined
}
var StepIdea = lazy(function () { return import('./wizard-steps/StepIdea'); })
var StepWorldbuilding = lazy(function () { return import('./wizard-steps/StepWorldbuilding'); })
var StepPowerSystem = lazy(function () { return import('./wizard-steps/StepPowerSystem'); })
var StepCharacters = lazy(function () { return import('./wizard-steps/StepCharacters'); })
var StepFactions = lazy(function () { return import('./wizard-steps/StepFactions'); })
var StepRelationships = lazy(function () { return import('./wizard-steps/StepRelationships'); })
var StepOutline = lazy(function () { return import('./wizard-steps/StepOutline'); })
var StepKeyPlots = lazy(function () { return import('./wizard-steps/StepKeyPlots'); })
var StepChapters = lazy(function () { return import('./wizard-steps/StepChapters'); })
var StepSynopsis = lazy(function () { return import('./wizard-steps/StepSynopsis'); })
var StepGenerating = lazy(function () { return import('./wizard-steps/StepGenerating'); })
var StepFinalCheck = lazy(function () { return import('./wizard-steps/StepFinalCheck'); })
var StepCover = lazy(function () { return import('./wizard-steps/StepCover'); })

// 🔥🔥🔥 2026-09-03 #125R4：模块级草稿创建幂等锁。
//   关键教训：锁变量绝不能放在组件函数体内（IIFE 闭包随每次渲染重建，_inflight 形同虚设，实测 R3 仍重复建 2 条草稿）。
//   必须提升到模块作用域，才能跨组件渲染/跨 effect 触发共享同一把锁。
var _draftCreateInflight: Promise<string> | null = null
// 🔥 2026-09-10 #120R：孤儿/错属活动作品自愈——记录本次会话已校验过的活动 id，
//   仅首次校验一次（避免每次 autosave 都拉全量列表），刷新页面后缓存重置可重试。
var _selfHealCheckedId = ''

function normalizeIdeaData(data: any): any {
  if (!data || typeof data !== 'object') {
    return {
      title: '',
      tagline: '',
      sellingPoints: [],
      targetAudience: '',
      coreConflict: '',
      keywords: [],
      protagonistName: '',
      systemName: '',
    }
  }
  
  var selectedIndex = typeof data.selectedIdea === 'number' ? data.selectedIdea : 0
  var ideas = Array.isArray(data.ideas) ? data.ideas : []
  var selected = ideas[selectedIndex] || ideas[0] || {}
  
  var title = normalizeToString(selected.title || data.title || '')
  var tagline = normalizeToString(selected.tagline || selected.hook || data.tagline || '')
  var targetAudience = normalizeToString(selected.targetAudience || data.targetAudience || '')
  var coreConflict = normalizeToString(selected.coreConflict || data.coreConflict || '')
  var sellingPoints = Array.isArray(selected.sellingPoints) ? selected.sellingPoints : (Array.isArray(data.sellingPoints) ? data.sellingPoints : [])
  var keywords = Array.isArray(selected.keywords) ? selected.keywords : (Array.isArray(data.keywords) ? data.keywords : [])
  var protagonistName = normalizeToString(selected.protagonistName || data.protagonistName || '')
  var systemName = normalizeToString(selected.systemName || data.systemName || '')
  
  if (!coreConflict) {
    coreConflict = ''
  }
  
  // Fallback: extract protagonistName/systemName from tagline
  if (!protagonistName) {
    var nameMatch = tagline.match(/(?:modern|young|ordinary|useless|waste)[\u4e00-\u9fff]{0,2}([\u4e00-\u9fff]{2,3})(?:transmigrate|awaken|bind|obtain|rebirth|carry|activate|inherit)/i)
    if (!nameMatch) {
      nameMatch = tagline.match(/([\u4e00-\u9fff]{2,3})(?:transmigrate|awaken|bind|obtain|after|rebirth|become|arrive|carry|activate|inherit)/i)
    }
    if (nameMatch && nameMatch[1] && !/^[(!f&]/.test(nameMatch[1])) {
      protagonistName = nameMatch[1]
      console.log('[normalizeIdeaData] Extracted protagonistName:', protagonistName, 'systemName:', systemName)
    }
  }
  
  // 🔥 将 sellingPoints 数组合并为 coreSellingPoint 字符串，供后续步骤使用
  var coreSellingPoint = Array.isArray(sellingPoints) && sellingPoints.length > 0
    ? sellingPoints.join('；')
    : ''

  console.log('[normalizeIdeaData] Normalized:', { title, tagline, sellingPointsCount: sellingPoints.length, targetAudience, coreConflict, protagonistName, systemName, coreSellingPoint, keywordsCount: keywords.length })

  // 🔥 2026-08-21：清洗立体化字段（模型可能输出 [xxx] 前缀污染）
  //   从 data / selected 中提取并通过 normalizeToString（已内置占位符清洗）
  var _d: any = data || {}
  var _s: any = selected || {}
  var _writingStyle = normalizeToString(_s.writingStyle || _d.writingStyle || '')
  var _shuangPattern = normalizeToString(_s.shuangPattern || _d.shuangPattern || '')
  var _emotionTone = normalizeToString(_s.emotionTone || _d.emotionTone || '')
  var _commercialPositioning = normalizeToString(_s.commercialPositioning || _d.commercialPositioning || '')
  var _coreGoldenQuote = normalizeToString(_s.coreGoldenQuote || _d.coreGoldenQuote || '')
  var _theme = normalizeToString(_s.theme || _d.theme || '')

  // 🔥 2026-08-21：全流程铁律「任何环节不允许空值」
  //   若模型未产出 爽点模式/情绪基调/核心金句/主题/文风，则依据题材+书名+简介做确定性兜底，
  //   保证 idea 步骤这几个立体化字段永远非空。
  if (!_emotionTone) {
    var _emoInput = (title + ' ' + tagline + ' ' + _theme).toLowerCase()
    if (/黑暗|压抑|绝望|阴谋|血色|复仇|深渊|疯狂|禁|崩塌/.test(_emoInput)) _emotionTone = '黑暗压抑'
    else if (/温暖|治愈|温馨|家庭|亲情|美好|田园|甜/.test(_emoInput)) _emotionTone = '温馨治愈'
    else if (/搞笑|轻松|逗|沙雕|吐槽|日常/.test(_emoInput)) _emotionTone = '轻松爽快'
    else if (/悬疑|推理|烧脑|案件|谜团|惊悚|解密/.test(_emoInput)) _emotionTone = '紧张烧脑'
    else if (/悲壮|牺牲|壮烈|苍凉|烽火/.test(_emoInput)) _emotionTone = '悲壮豪迈'
    else _emotionTone = '热血苍凉'
  }
  if (!_shuangPattern) {
    var _spInput = (String(_s.systemName || data.systemName || systemName || '') + ' ' + title + ' ' + tagline)
    if (/签到|打卡|每日|抽奖|礼包/.test(_spInput)) _shuangPattern = '签到发育流'
    else if (/打脸|装逼|嚣张|嘲讽|高调|碾压|羞辱/.test(_spInput)) _shuangPattern = '装逼打脸流'
    else if (/肉身|体修|近战|拳头|无敌|硬刚/.test(_spInput)) _shuangPattern = '肉身无敌流'
    else if (/血脉|血统|觉醒|祖先/.test(_spInput)) _shuangPattern = '血脉觉醒流'
    else if (data.sellingPoints && JSON.stringify(data.sellingPoints).indexOf('爽') >= 0) _shuangPattern = '系统升级流'
    else _shuangPattern = '系统升级流'
  }
  if (!_coreGoldenQuote) {
    if (_theme && _theme.length >= 4) {
      _coreGoldenQuote = _theme.replace(/[。！？!？…\s]/g, '')
      if (_coreGoldenQuote.length > 30) _coreGoldenQuote = _coreGoldenQuote.slice(0, 28) + '...'
    } else if (tagline && tagline.length >= 6) {
      _coreGoldenQuote = tagline.replace(/[。！？!？…\s]/g, '').slice(0, 22) + '，不负此局！'
    } else {
      var _qTitle = title ? title.replace(/[《》""''\s]/g, '') : '逆天改命'
      _coreGoldenQuote = '《' + _qTitle + '》，' + (data.coreConflict ? '' : '朝夕之间，' ) + '逆转乾坤！'.slice(0, 30)
    }
  }
  if (!_theme) {
    _theme = (tagline && tagline.length >= 8 ? tagline.replace(/[。！？!？…\s]/g, '') : (title || '逆天改命')).slice(0, 24)
  }
  if (!_writingStyle) {
    _writingStyle = '文笔流畅、画面感强，情绪基调以"' + _emotionTone + '"为主，节奏明快' 
  }
  if (!_commercialPositioning) {
    _commercialPositioning = '番茄向为主，依托高强度爽点设计与情绪张力，适配新书冷启动快速起量'
  }

  return {
    ...data,
    title,
    tagline,
    sellingPoints,
    coreSellingPoint,
    targetAudience: targetAudience || '',
    coreConflict,
    keywords: keywords.length > 0 ? keywords : [],
    protagonistName: protagonistName || '',
    systemName: systemName || '',
    writingStyle: _writingStyle,
    shuangPattern: _shuangPattern,
    emotionTone: _emotionTone,
    commercialPositioning: _commercialPositioning,
    coreGoldenQuote: _coreGoldenQuote,
    theme: _theme,
    userKeywords: data?.userKeywords || keywords,
    userInput: data?.userInput || '',
  }
}

function normalizeAbilityObject(ab: any): any {
  if (!ab || typeof ab !== 'object') return { 
    name: '', type: '', abilities: [], limitations: [], evolution: '', 
    description: '', coreFunctions: [], source: '',
    costBacklash: '', restraintRelations: '', hiddenOrigin: '', runawayForm: '', fusionPotential: '',
    evolutionNodes: []
  }
  var name = typeof ab.name === 'string' ? ab.name : ''
  var type = typeof ab.type === 'string' ? ab.type : ''
  if (!type && name) {
    type = inferAbilityTypeFromName(name)
  }
  // 规范化evolutionNodes数组（进化节点链）
  var evolutionNodes: any[] = []
  if (Array.isArray(ab.evolutionNodes)) {
    evolutionNodes = ab.evolutionNodes.filter(function(n: any) { return n && typeof n === 'object' && (n.name || n.stage) })
  } else if (Array.isArray(ab.evolutionStages)) {
    evolutionNodes = ab.evolutionStages.filter(function(n: any) { return n && typeof n === 'object' })
  }
  return {
    id: ab.id || ('ab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
    name: name,
    type: type,
    description: typeof ab.description === 'string' ? ab.description : '',
    abilities: Array.isArray(ab.abilities) ? ab.abilities.filter(function(a: any) { return typeof a === 'string' && a.trim() }) : [],
    coreFunctions: Array.isArray(ab.coreFunctions) ? ab.coreFunctions.filter(function(f: any) { return typeof f === 'string' && f.trim() }) : [],
    limitations: Array.isArray(ab.limitations)
      ? ab.limitations.filter(function(l: any) { return typeof l === 'string' && l.trim() })
      : (typeof ab.limitations === 'string' && ab.limitations.trim() ? [ab.limitations] : []),
    evolution: typeof ab.evolution === 'string' ? ab.evolution : '',
    source: typeof ab.source === 'string' ? ab.source : '',
    costBacklash: typeof ab.costBacklash === 'string' ? ab.costBacklash : '',
    restraintRelations: typeof ab.restraintRelations === 'string' ? ab.restraintRelations : '',
    hiddenOrigin: typeof ab.hiddenOrigin === 'string' ? ab.hiddenOrigin : '',
    runawayForm: typeof ab.runawayForm === 'string' ? ab.runawayForm : '',
    fusionPotential: typeof ab.fusionPotential === 'string' ? ab.fusionPotential : '',
    evolutionNodes: evolutionNodes,
  }
}

function splitGoldenFingerNames(systemName: string): string[] {
  if (!systemName || typeof systemName !== 'string') return []
  var cleaned = systemName.trim()
  if (!cleaned || cleaned === '无' || cleaned === '无金手指' || cleaned === '无系统') return []
  var parts = cleaned.split(/\s*(?:与|和|、|及|\+|,|，|双金手指|双重|两个)\s*/).filter(function(p: string) {
    return p && p.trim().length >= 2 && !/^(金手指|系统|双重|两个|觉醒)$/.test(p.trim())
  })
  return parts.map(function(p) { return p.trim() }).filter(function(p) { return p.length >= 2 })
}

function inferAbilityTypeFromName(name: string): string {
  var n = name
  if (/系统|面板|签到|抽奖|任务|商城/.test(n)) return '系统类'
  if (/戒指|神器|法宝|神兵|至宝|鼎|印|塔|剑|刀|珠|镜|石|佩/.test(n)) return '神器类'
  if (/血脉|龙血|神兽|圣体|神体|体质|天赋|异禀/.test(n)) return '血脉类'
  if (/功法|诀|决|经|典|秘录|传承/.test(n)) return '功法类'
  if (/灵魂|魂环|双魂|魂契/.test(n)) return '灵魂类'
  if (/空间|洞天|小世界/.test(n)) return '空间类'
  if (/契约|召唤|御兽|式神/.test(n)) return '契约类'
  if (/吞噬|掠夺|进化/.test(n)) return '吞噬类'
  if (/时间|预知|回溯/.test(n)) return '时间类'
  if (/复制|模拟|解析/.test(n)) return '复制类'
  if (/异能|超能力|元素/.test(n)) return '异能类'
  if (/记忆|前世|先知|预知未来/.test(n)) return '记忆类'
  // 🔥 2026-08-30：知识/历史型金手指（含"核心/知识/谋略/经世"等），避免被误判为神器类
  if (/知识|学识|先知|谋略|智谋|谋主|经世|治国|文抄|诗词|科技|技术|工程|数据|核心/.test(n)) return '知识记忆'
  return ''
}

function inferSystemTypeFromName(name: string): string {
  var n = name
  if (/洪荒|巫族|祖巫|天庭|阐教|截教|封神/.test(n)) return '洪荒体系'
  if (/混沌|鸿蒙|星辰|星河|星域|位面|至高|签到/.test(n)) return '修仙体系'
  if (/修仙|修真|炼气|筑基|金丹|元婴|渡劫/.test(n)) return '修仙体系'
  if (/武道|武学|炼体|内劲|外功|宗师/.test(n)) return '武道体系'
  if (/魔法|斗气|魔导|骑士|炼金/.test(n)) return '魔法体系'
  if (/血脉|龙血|兽血|血脉觉醒/.test(n)) return '血脉体系'
  if (/科技|未来|星际|机甲|基因/.test(n)) return '科技体系'
  if (/历史|权谋|朝堂|江湖|武侠/.test(n)) return '历史权谋体系'
  if (/宗门|教派|神道|神域/.test(n)) return '宗门体系'
  return ''
}

// 🔥 修复问题2：动态生成金手指类型详细字段（coreFunction/triggerCondition/limitations/growthPath）
function _genAbilityCoreFunction(typeName: string, genre: string, keywords: string): string {
  var n = typeName
  if (/系统|面板|签到|抽奖|任务|商城/.test(n)) return '通过' + n + '获取功法、资源、血脉、神器等各类奖励，系统任务驱动成长，签到地点不同奖励不同'
  if (/戒指|神器|法宝|神兵|至宝/.test(n)) return '拥有' + n + '作为核心金手指，可借助其特殊能力战斗、修炼、获取传承'
  if (/血脉|龙血|圣体|神体/.test(n)) return '觉醒' + n + '，获得超凡血脉力量，肉身与天赋大幅提升'
  if (/功法|诀|经|传承/.test(n)) return '获得' + n + '传承，修炼速度倍增，可领悟独门绝学'
  if (/空间|洞天|小世界/.test(n)) return '拥有' + n + '，可存储物资、种植灵药、修炼加速'
  if (/吞噬|掠夺|进化/.test(n)) return '通过' + n + '吞噬万物或掠夺他人能力实现无限进化'
  if (/时间|预知|回溯/.test(n)) return '掌握' + n + '，可预知未来或回溯过去，掌握先机'
  if (/复制|模拟|解析/.test(n)) return '拥有' + n + '能力，可复制或模拟他人技能与功法'
  return '拥有' + n + '作为核心金手指，基于本作' + (genre || '玄幻') + '题材设定，提供独特的成长与战斗优势'
}

function _genAbilityTriggerCondition(typeName: string, genre: string, keywords: string): string {
  var n = typeName
  if (/系统|面板|签到|抽奖|任务|商城/.test(n)) return '每日签到领奖、特殊地点签到获稀有奖励、连续签到加倍、签到万年累积底蕴、签到触发隐藏机缘、系统任务激活'
  if (/戒指|神器|法宝|神兵|至宝/.test(n)) return '法宝认主、法宝进阶、法宝解锁新能力、法宝融合升级、法宝器灵觉醒、法宝自爆禁招'
  if (/血脉|龙血|圣体|神体/.test(n)) return '血脉觉醒、血脉返祖、血脉进化、血脉压制、血脉共鸣、血脉神通觉醒'
  if (/功法|诀|经|传承/.test(n)) return '功法入门、功法小成、功法大成、功法圆满、功法破限、功法自创神通'
  if (/空间|洞天|小世界/.test(n)) return '空间开启、空间扩容、空间升级、空间灵气化、空间演化生灵、空间化为洞天'
  if (/吞噬|掠夺|进化/.test(n)) return '吞噬能量、吞噬物质、吞噬法则、掠夺天赋、掠夺记忆、进化突破'
  if (/时间|预知|回溯/.test(n)) return '预知片段、时间回溯、未来推演、时间静止、时间加速、因果窥探'
  if (/复制|模拟|解析/.test(n)) return '技能复制、功法解析、血脉模拟、天赋复制、弱点解析、完美模拟'
  return n + '激活、能力进阶、能力融合、能力突破、能力觉醒、能力化境'
}

function _genAbilityLimitations(typeName: string, genre: string, keywords: string): string {
  var n = typeName
  if (/系统|面板|签到|抽奖|任务|商城/.test(n)) return '签到地点受限、签到时间固定、稀有签到点难寻、签到奖励随机性、过度依赖签到会错失主动机缘'
  if (/戒指|神器|法宝|神兵|至宝/.test(n)) return '法宝消耗巨大灵力、法宝有使用冷却、法宝进阶需稀有材料、法宝器灵不配合、法宝被天道压制'
  if (/血脉|龙血|圣体|神体/.test(n)) return '血脉觉醒需契机、血脉失控暴走、血脉被更高血脉压制、血脉觉醒消耗巨大、血脉反噬风险'
  if (/功法|诀|经|传承/.test(n)) return '修炼需海量资源、功法有境界瓶颈、功法冲突走火入魔、功法需特定体质、功法传承不完整'
  if (/空间|洞天|小世界/.test(n)) return '空间扩容需资源、空间有上限、空间被入侵风险、空间消耗精神力、空间升级需天材地宝'
  if (/吞噬|掠夺|进化/.test(n)) return '吞噬有上限需逐步提升、吞噬有害物质反噬、吞噬过快导致能量失控、被吞噬者意识残留风险'
  if (/时间|预知|回溯/.test(n)) return '预知消耗精神力、预知有误差、时间回溯反噬严重、改变历史有因果代价、时间能力被天道屏蔽'
  if (/复制|模拟|解析/.test(n)) return '复制有衰减、复制需接触目标、模拟有时间限制、解析消耗精神力、复制无法超越原版'
  return '能力消耗巨大、能力有冷却时间、能力进阶需契机、能力有副作用、能力被特定条件克制'
}

function _genAbilityGrowthPath(typeName: string, genre: string, keywords: string): string {
  var n = typeName
  if (/系统|面板|签到|抽奖|任务|商城/.test(n)) return '新手签到→日常签到→特殊地点签到→万年签到→诸天签到→签到成道'
  if (/戒指|神器|法宝|神兵|至宝/.test(n)) return '法宝认主→法宝进阶→法宝通灵→法宝化形→法宝成道→法宝永恒'
  if (/血脉|龙血|圣体|神体/.test(n)) return '血脉觉醒→血脉返祖→血脉进化→血脉神通→血脉化境→血脉成圣'
  if (/功法|诀|经|传承/.test(n)) return '功法入门→功法小成→功法大成→功法圆满→功法破限→功法化境'
  if (/空间|洞天|小世界/.test(n)) return '储物空间→灵田空间→洞天福地→小世界→随身世界→混沌世界'
  if (/吞噬|掠夺|进化/.test(n)) return '能量吞噬→物质吞噬→天赋掠夺→法则吞噬→本源吞噬→吞噬之主'
  if (/时间|预知|回溯/.test(n)) return '预知片段→未来推演→时间回溯→时间静止→时间法则→时间之主'
  if (/复制|模拟|解析/.test(n)) return '技能复制→功法解析→血脉模拟→完美复制→万物模拟→模拟成道'
  return n + '入门→' + n + '小成→' + n + '大成→' + n + '圆满→' + n + '化境→' + n + '成道'
}

// 🔥 修复问题2：动态生成体系类型详细字段（realmSystem/cultivationMethod/restraintRelation）
function _genSystemRealmSystem(typeName: string, genre: string, keywords: string): string {
  var n = typeName
  var _histHit = /历史|军事|权谋|朝堂|军政|皇权|朝廷|官制|科举|九品|帝王|将|帅|文官|武将/.test(n + ' ' + genre + ' ' + keywords)
  if (_histHit) return '白身→衙门小吏→九品主簿→七品知县→五品知府→三品大员→二品封疆→一品尚书→内阁学士→首辅大臣→摄政王'
  if (/修仙|仙侠|修真|混沌|鸿蒙|星辰|签到/.test(n)) return '练气期→筑基期→金丹期→元婴期→化神期→炼虚期→合体期→大乘期→渡劫期→真仙→金仙→仙尊'
  if (/武道|武学|炼体/.test(n)) return '淬体→锻骨→通脉→内劲→罡气→宗师→大宗师→武圣→武神→武道通神'
  if (/魔法|斗气|西幻/.test(n)) return '魔法学徒→初级法师→中级法师→高级法师→大法师→魔导士→大魔导士→法神→法圣→法神巅峰'
  if (/血脉|龙血/.test(n)) return '血脉初醒→血脉凝聚→血脉觉醒→血脉共鸣→血脉进化→血脉神通→血脉化境→血脉成圣→血脉至尊→血脉永恒'
  if (/科技|星际|机甲|基因/.test(n)) return '凡人→基因觉醒→基因进化→基因领域→行星级→恒星级→星系级→宇宙级→域主级→界主级'
  if (/洪荒|巫族|封神/.test(n)) return '凡人→炼气→筑基→金丹→元婴→化神→大罗金仙→准圣→圣人→天道圣人→合道→超脱'
  return '一阶→二阶→三阶→四阶→五阶→六阶→七阶→八阶→九阶→十阶'
}

function _genSystemCultivationMethod(typeName: string, genre: string, keywords: string): string {
  var n = typeName
  var _histHit = /历史|军事|权谋|朝堂|军政|皇权|朝廷|官制|科举|九品|帝王|将|帅|文官|武将/.test(n + ' ' + genre + ' ' + keywords)
  if (_histHit) return '通过科举、军功、门荫等途径入仕，积累政绩与人脉，结交党羽，逐步晋升'
  if (/修仙|仙侠|修真|混沌|鸿蒙|星辰|签到/.test(n)) return '吸收天地灵气入体，凝练真元，打通经脉，逐步突破境界，渡劫飞升'
  if (/武道|武学|炼体/.test(n)) return '淬炼肉身，打通十二正经与奇经八脉，凝聚内劲，罡气外放，武意通神'
  if (/魔法|斗气|西幻/.test(n)) return '冥想积累魔力，学习魔法阵与咒语，元素亲和修炼，逐步提升精神力与魔力量级'
  if (/血脉|龙血/.test(n)) return '激活体内沉睡血脉，引导血脉之力流转全身，逐步觉醒血脉神通，最终血脉化圣'
  if (/科技|星际|机甲|基因/.test(n)) return '通过基因药剂、科技改造、宇宙能量吸收等方式进化，逐步突破基因锁，掌握宇宙法则'
  if (/洪荒|巫族|封神/.test(n)) return '修炼功德与气运，斩三尸证道，或以力证道，最终成圣合道'
  return '基于本作' + (genre || '题材') + '设定，循序渐进地积累与提升，逐级达成更高层次'
}

function _genSystemRestraintRelation(typeName: string, genre: string, keywords: string): string {
  var n = typeName
  var _histHit = /历史|军事|权谋|朝堂|军政|皇权|朝廷|官制|科举|九品|帝王|将|帅|文官|武将/.test(n + ' ' + genre + ' ' + keywords)
  if (_histHit) return '皇权克制一切（皇权至上），被宦官外戚掣肘（内廷制衡），军权克制文官（武力政变）'
  if (/修仙|仙侠|修真|混沌|鸿蒙|星辰|签到/.test(n)) return '仙道克制妖修（神识克制妖兽本能），被魔修克制（魔气污染灵气），克制凡人武道（法术远程）'
  if (/武道|武学|炼体/.test(n)) return '武道克制凡人（肉身碾压），被仙道克制（法术远程），同境界压制修仙者近身战'
  if (/魔法|斗气|西幻/.test(n)) return '魔法克制物理攻击（元素护盾），被暗黑魔法克制（魔力污染），斗气近战克制法师远程'
  if (/血脉|龙血/.test(n)) return '高阶血脉压制低阶血脉，神兽血脉克制凡兽血脉，被混沌血脉终极压制'
  if (/科技|星际|机甲|基因/.test(n)) return '高科技克制低科技（降维打击），电磁脉冲克制机械系，基因克制普通人类'
  if (/洪荒|巫族|封神/.test(n)) return '天道压制一切（天数不可违），圣人压制大罗金仙，功德克制业力，先天灵宝克制后天法宝'
  return '基于本作设定，层级之间存在制衡与压制关系，形成完整的强弱链条'
}

function normalizePowerSystemData(data: any): any {
  if (!data || typeof data === 'string') {
    return {
      protagonistAbility: { name: '', type: '', abilities: [], limitations: [], evolution: '' },
      protagonistAbilities: [],
      worldPowerSystem: { name: '', type: '', levels: [], description: '' }
    }
  }
  
  var protagonistAbilities: any[] = []
  
  var abilityArraySource = data.protagonistAbilities || data.abilitiesList || []
  if (Array.isArray(abilityArraySource) && abilityArraySource.length > 0) {
    protagonistAbilities = abilityArraySource.map(function(ab: any) { return normalizeAbilityObject(ab) }).filter(function(ab: any) { return ab.name || ab.type })
  }
  
  var hasWrapper = !!(data.protagonistAbility && typeof data.protagonistAbility === 'object')
  var topHasAbilityFields = data.name || data.type || data.abilities || data.limitations || data.evolution

  var protagonistAbility: any = {}
  if (hasWrapper) {
    protagonistAbility = normalizeAbilityObject(data.protagonistAbility)
  } else if (topHasAbilityFields) {
    protagonistAbility = normalizeAbilityObject({
      name: data.name, type: data.type, description: data.description,
      abilities: data.abilities, coreFunctions: data.coreFunctions,
      limitations: data.limitations, evolution: data.evolution, source: data.source,
      costBacklash: data.costBacklash, restraintRelations: data.restraintRelations,
      hiddenOrigin: data.hiddenOrigin, runawayForm: data.runawayForm, fusionPotential: data.fusionPotential
    })
  } else {
    protagonistAbility = normalizeAbilityObject(null)
  }

  if (protagonistAbilities.length === 0 && protagonistAbility.name) {
    protagonistAbilities = [protagonistAbility]
  } else if (protagonistAbilities.length > 0 && !protagonistAbility.name) {
    protagonistAbility = { ...protagonistAbilities[0] }
  } else if (protagonistAbilities.length > 0 && protagonistAbility.name) {
    var found = protagonistAbilities.find(function(ab: any) { return ab.name === protagonistAbility.name })
    if (!found) protagonistAbilities = [protagonistAbility, ...protagonistAbilities]
  }

  // 🔥 核心修复：确保金手指类型不为空
  if (!protagonistAbility.type && protagonistAbility.name) {
    protagonistAbility.type = inferAbilityTypeFromName(protagonistAbility.name) || ''
    console.log('[normalizePowerSystemData] 金手指类型为空，根据名称推断:', protagonistAbility.name, '→', protagonistAbility.type)
  }
  if (!protagonistAbility.type) {
    protagonistAbility.type = ''
    console.log('[normalizePowerSystemData] 金手指类型为空，保持空值')
  }

  // 🔥 修复：确保protagonistAbilities中的每个金手指类型也不为空
  protagonistAbilities = protagonistAbilities.map(function(ab: any) {
    if (!ab.type && ab.name) {
      ab.type = inferAbilityTypeFromName(ab.name) || ''
    }
    if (!ab.type) {
      ab.type = ''
    }
    return ab
  })

  var worldPowerSystem: any = {}
  if (data.worldPowerSystem && typeof data.worldPowerSystem === 'object') {
    var sysName = typeof data.worldPowerSystem.name === 'string' ? data.worldPowerSystem.name : ''
    var sysType = typeof data.worldPowerSystem.type === 'string' ? data.worldPowerSystem.type : ''
    if (!sysType && sysName) {
      sysType = inferSystemTypeFromName(sysName)
    }
    worldPowerSystem = {
      name: sysName,
      type: sysType,
      description: typeof data.worldPowerSystem.description === 'string' ? data.worldPowerSystem.description : '',
      levels: Array.isArray(data.worldPowerSystem.levels) ? data.worldPowerSystem.levels.filter(function(l: any) { return String(l).trim() }) : [],
    }
  } else if (data.powerName || data.powerType || data.powerDescription) {
    var pwrName = typeof data.powerName === 'string' ? data.powerName : ''
    var pwrType = typeof data.powerType === 'string' ? data.powerType : ''
    if (!pwrType && pwrName) {
      pwrType = inferSystemTypeFromName(pwrName)
    }
    worldPowerSystem = {
      name: pwrName,
      type: pwrType,
      description: typeof data.powerDescription === 'string' ? data.powerDescription : '',
      levels: [],
    }
  }

  // 🔥 核心修复：确保世界力量体系类型不为空
  if (!worldPowerSystem.type && worldPowerSystem.name) {
    worldPowerSystem.type = inferSystemTypeFromName(worldPowerSystem.name) || ''
    console.log('[normalizePowerSystemData] 世界力量体系类型为空，根据名称推断:', worldPowerSystem.name, '→', worldPowerSystem.type)
  }
  if (!worldPowerSystem.type) {
    worldPowerSystem.type = ''
    console.log('[normalizePowerSystemData] 世界力量体系类型为空，保持空值')
  }
  if (!worldPowerSystem.name && worldPowerSystem.type) {
    worldPowerSystem.name = worldPowerSystem.type
  }

  return {
    protagonistAbility,
    protagonistAbilities,
    worldPowerSystem: {
      name: worldPowerSystem.name || '',
      type: worldPowerSystem.type || '',
      description: worldPowerSystem.description || '',
      levels: Array.isArray(worldPowerSystem.levels) && worldPowerSystem.levels.length > 0
        ? worldPowerSystem.levels
        : [],
    },
  }
}

function cleanPlaceholders(val: any): any {
  if (typeof val !== 'string') return val
  return val
    .replace(/XXXX+/gi, '')
    .replace(/\?{2,}/g, '')
    .replace(/\[PLACEHOLDER\]/gi, '')
    .replace(/\s*\(\s*\)\s*/g, '')
    .replace(/^[^a-zA-Z0-9\u4e00-\u9fff]+/g, '')
    .trim()
}

// 🔥 模块级标志：自动生成流程中不弹阻塞式 alert，避免中断后续 fetch 请求
var _autoGenInProgress = false
// 🔥 模块级章节生成锁，替代 window.__chapterGenLock，避免 React Compiler 不可变性警告
var _chapterGenLock = false
function _setChapterGenLock(v: boolean) { _chapterGenLock = v }
function _getChapterGenLock() { return _chapterGenLock }

function showErrorAlert(err: any, fallbackMsg: string): void {
  var friendlyMsg = fallbackMsg
  if (err instanceof Error) {
    friendlyMsg = fallbackMsg + ': ' + err.message
  } else if (err && typeof err === 'object' && err.error) {
    var errMsg = err.error || ''
    if (errMsg.includes('balance is insufficient') || errMsg.includes('quota')) {
      friendlyMsg = 'API quota exceeded, please check your balance'
    } else if (errMsg.includes('403') || errMsg.includes('Forbidden')) {
      friendlyMsg = 'API access forbidden, please check your API key'
    } else if (errMsg.includes('429') || errMsg.includes('rate')) {
      friendlyMsg = 'API rate limited, please try again later'
    } else {
      friendlyMsg = errMsg || fallbackMsg
    }
  } else if (typeof err === 'string' && err) {
    friendlyMsg = err
  } else {
    friendlyMsg = fallbackMsg
  }
  console.error('[Error]', friendlyMsg)
  // 🔥 自动生成流程中只 console.error，不弹阻塞式 alert，避免中断后续 fetch 请求
  if (_autoGenInProgress) {
    return
  }
  try {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(friendlyMsg)
    }
  } catch (e) {
    // 某些浏览器环境下 alert 可能被禁用，静默失败
  }
}

// 🔥 2026-08-21：清洗模型把字段说明当模板输出的污染（如 "[核心金句]xxx" / "[商业定位]xxx" / "主题思想：xxx"）
//   检测以下模式后视为空字符串，由前端兜底显示或触发重新生成
function cleanTemplatePlaceholder(val: string): string {
  if (!val || typeof val !== 'string') return ''
  var v = val.trim()
  if (!v) return ''
  // 🔥 #202c 修订：含句读（，。！？；、）的「xxx」/【xxx】包裹值是合法台词/引语（如「大明未亡，朕未死！」），
  //   不是占位标签——占位标签（「主角」「核心金句」「主角阵营」）从不含句读。先判句读再套模式，防止吃掉台词。
  var _hasSentPunct = /[，。！？；、]/.test(v)
  // 模式 1：纯标签或标签 + 冒号（无真实内容）："[xxx]"、"【xxx】"、"xxx："+冒号后为空、"核心金句："等
  if (!_hasSentPunct && /^[\[【「『#*]+\s*[^\[【「『\]\】」』#*]{1,20}[\]】」』#*]+\s*$/.test(v)) {
    // 内容只是字段名/标签本身
    return ''
  }
  // 模式 2：以 "[xxx]" / "【xxx】" / 「xxx」 / "xxx：" 开头且长度仅占位
  if (!_hasSentPunct && /^(\[|【|「|『|#)\s*[^\[【「『\]\】」』]{1,20}(\]|【|」|』|#)\s*$/.test(v)) {
    return ''
  }
  // 模式 3："字段名：xxx" 但字段名是常见模板标签，且后面内容很短（<=8 字）或为空
  if (/^(核心金句|商业定位|主题思想|文风定位|爽点模式|情绪基调|商业卖点|写作风格|核心卖点|宣传语|Slogan|一句话简介|核心冲突|目标读者|力量体系|地理环境|时代背景|历史背景)\s*[:：]\s*[\s\S]*$/.test(v)) {
    var after = v.replace(/^(核心金句|商业定位|主题思想|文风定位|爽点模式|情绪基调|商业卖点|写作风格|核心卖点|宣传语|Slogan|一句话简介|核心冲突|目标读者|力量体系|地理环境|时代背景|历史背景)\s*[:：]\s*/, '').trim()
    if (after.length < 4) return ''
    // 长度 < 12 字且看起来是模板残留（如"[核心金句]热血逆袭"），清洗掉前缀标签
    var after2 = after.replace(/^[\[【「『#]+\s*[^\[【「『\]\】」』#]{1,20}[\]】」』#]+\s*/, '').trim()
    if (after2 !== after) v = after2
  }
  // 模式 4：整个值用 /xxx/ 包裹（斜体标记），去掉斜杠 → "xxx"
  //   例如 "/废柴逆袭流/" → "废柴逆袭流"，"/一念成星河/" → "一念成星河"
  var slashMatch = v.match(/^\/(.{1,200})\/\s*$/)
  if (slashMatch) v = slashMatch[1].trim()
  // 模式 5：整个值用 "xxx" 或 "xxx", 包裹（模型把"选项"用双引号+逗号标记）→ "xxx"
  //   例如 '"无敌碾压流",' → "无敌碾压流"，'"热血苍凉",' → "热血苍凉"
  if (/^"[^"]+"\s*,?\s*$/.test(v)) v = v.replace(/^"|"\s*,?\s*$/g, '').trim()
  return v
}

function unwrapJsonLeak(input: string): string {
  if (!input || typeof input !== 'string') return input
  var s = input.trim()
  if (!s) return s
  // 整体是被包裹的单个 JSON 对象字符串：{"key":"value"} → value
  for (var _i = 0; _i < 3; _i++) {
    var _m = s.match(/^\{\s*"[^"]+"\s*:\s*"([\s\S]*?)"?\s*\}$/)
    if (_m) { s = _m[1]; continue }
    break
  }
  // 前缀泄漏：key":" 或 "key":"（正常中文正文不会命中）
  s = s.replace(/^\{?\s*"?[A-Za-z_]\w*"?\s*:\s*"/, '')
  // 后缀泄漏："} / "}, / "}
  s = s.replace(/"?\s*\}+\s*[，,]?\s*$/, '')
  s = s.replace(/"\s*[，,]\s*"?[A-Za-z_]\w*"?\s*:\s*"$/, '')
  return s.trim()
}
function normalizeToString(val: any): string {
  if (val === null || val === undefined) return ''
  var s: string = ''
  if (typeof val === 'string') s = val
  else if (typeof val === 'number' || typeof val === 'boolean') s = String(val)
  else return ''
  return cleanTemplatePlaceholder(unwrapJsonLeak(s))
}

// 🔥 2026-09-06 进阶单值文本字段的 JSON 泄漏残渣清洗：
//   LLM 多字段 JSON 被强行截断时，字段头尾会残留 `","`、`":"`、`},"`、`","` 等段落标记，
//   重开草稿曾现 birthplace/weapons = '","' 这类畸形值（进阶设定与角色设定的"不相符/截断"来源之一）。
//   仅剥首尾的 JSON 分隔/引号/括号残留；若洗后仅剩标点则判为空。
function cleanJsonLeakField(s: string): string {
  if (!s || typeof s !== 'string') return ''
  var v = s.trim()
  if (!v) return ''
  v = v.replace(/^[\[{（(\s":：,，、;；|｜】》）)\]}」』“”‘’]+/, '')
  v = v.replace(/[\[{（(\s":：,，、;；|｜】》）)\]}」』“”‘’]+$/, '')
  // 🔥 #202 括号回补：上面的尾部剥离会把合法的括号注释尾「）」当 JSON 残渣剥掉
  //   （实锤：「昭宗（永历朝廷追上谥号）」被剥成「…谥号」，随后 autosave 合法回写污染服务端）。
  //   剥尾后若「（」多于「）」，逐个回补「）」直到平衡——括号注释是合法内容，不是泄漏。
  var _po = (v.match(/（/g) || []).length
  var _pc = (v.match(/）/g) || []).length
  while (_po > _pc) { v += '）'; _pc++ }
  // 同理回补中文书名号/引号「」与【】（剥尾常把其尾部剥离，需回补以免「疏影」「奉天」等被损）
  var _co = (v.match(/「/g) || []).length
  var _cc = (v.match(/」/g) || []).length
  while (_co > _cc) { v += '」'; _cc++ }
  var _bo = (v.match(/【/g) || []).length
  var _bc = (v.match(/】/g) || []).length
  while (_bo > _bc) { v += '】'; _bc++ }
  if (!v) return ''
  var _onlyPunct = v.replace(/[^\u4e00-\u9fa5A-Za-z0-9·]+/g, '')
  if (!_onlyPunct) return ''
  return v.trim()
}

// 🔥 2026-09-05：世界观设定字段污染清洗。①力量体系(powerSystem)字段不应混入"金手指/签到系统"及重复的【体系名称】/【体系类型】包裹；
//   ②背景设定(coreSettings)字段不应内嵌"力量体系"整块（力量体系是独立字段）。
function cleanPowerSystemText(value: any): string {
  var t = normalizeToString(value)
  if (!t) return t
  // 移除"金手指：xxx；"整段（金手指属于金手指步骤的独立字段，不应混入力量体系）
  t = t.replace(/金手指[：:][^；;\n}，,、/—]*[；;]?/g, '')
  // 移除独立的【体系名称】xxx； / 【体系类型】xxx； 包裹（该信息应进入结构化 name/type，而非在文本中重复）
  t = t.replace(/(?:^|[\n；;])\s*【体系名称】[^；;\n]*[；;]?\s*/g, '')
  t = t.replace(/(?:^|[\n；;])\s*【体系类型】[^；;\n]*[；;]?\s*/g, '')
  // 清理残留连续分隔符
  t = t.replace(/[；;]\s*[；;]+/g, '；').trim()
  return t
}
function cleanSettingPowerSystemBlock(value: any): string {
  var t = normalizeToString(value)
  if (!t) return t
  var _topReStr = '(?:时代背景|地理格局|历史脉络|社会结构|世界规则|核心设定|背景设定|总体设定|文明|科技|文化|经济|力量体系|世界观)'
  // 🔥 2026-09-05 强化：聚合文本常以「｜」分隔各设定字段（如 coreSettings 用 parts.join('｜')），
  //   此前仅以 \n/；/。 为边界，无法识别「｜力量体系：」导致整块残留。现把「｜」一并纳入边界，
  //   且通过循环移除所有「力量体系/体系名称」开头的污染块。
  var _out = t
  for (;;) {
    var _startRe = /(?:^|[｜\n；。])\s*(?:力量体系[：:]?\s*|【力量体系】\s*|【体系名称】\s*)/g
    var _m = _startRe.exec(_out)
    if (!_m) break
    var _startIdx = _m.index
    // 块内找下一个顶层设定标签（"｜标签：" / "\n标签：" / "；标签：" / "。标签："）；块内部如
    // 「文『典史』｜武『什长』」中的「｜武」并非"标签："，故不会误判为块结束。
    var _nextTag = new RegExp('[｜\\n；。]\\s*(' + _topReStr + ')\\s*[：:]', 'g')
    _nextTag.lastIndex = _startIdx + _m[0].length
    var _next = _nextTag.exec(_out)
    var _endIdx = _next ? _next.index : _out.length
    var _removed = _out.slice(_startIdx, _endIdx)
    if (!_removed.length) break
    _out = _out.slice(0, _startIdx) + _out.slice(_endIdx)
  }
  _out = _out.replace(/[\n]+(?=[\n｜])/g, '').replace(/[\n]+\s*[\n]+/g, '\n').replace(/[｜\n；。]\s*$/, '').trim()
  return _out
}
// 🔥 2026-09-06 题材一致性净化：当世界设定整体指向「历史/架空/权谋」题材时，清除力量体系中混入的
//   跨题材通用系统块（修仙/武道/剑修/符道/魔法/机械/星际/都市/末世/洪荒等）。这类块常因生成器复用
//   通用模板而混进力量体系字段，是本作「不允许出现修仙内容」要求的直接隐患。仅当检测到明确历史词才启用，
//   不会误伤修仙/玄幻等真正同题材的故事。
function cleanPowerSystemGenresForHistorical(powerSystem: any, ctxText: string): string {
  var t = normalizeToString(powerSystem)
  if (!t) return t
  var _ctxIsHistorical = /明|永历|弘治|崇祯|隆武|南明|大明|朝廷|朝堂|科举|进士|皇帝|天子|王朝|品阶|官制|文官|武将|都督|巡抚|总督|侍郎|尚书|都督府/.test(ctxText + ' ' + t.substring(0, 120))
  if (!_ctxIsHistorical) return t
  // 逐段剥离：以「非历史题材（体系/N）」（…）为边界的通用体系块。用（)闭合段整块移除。
  var _GENRE = /修仙|修真|仙侠|武道|武修|剑修|剑侠|符道|炼气|筑基|魔法|斗气|异能|机械|星际|都市|末世|末日|魔修|武魂|血统|觉醒|洪荒|玄幻|神道|星辉|斗者/
  t = t.replace(/(?:，|；|｜|\n)?\s*(?:修仙|修真|仙侠|武道|武修|剑修|剑侠|符道|魔法|斗气|异能|机械|星际|都市|末世|末日|魔修|武魂|血统|洪荒|玄幻)[^（(]{0,20}[（(][^）)]{1,120}[）)]/g, '')
  // 二次清理：剥离以「体系」+ 此类关键词开头的孤立短语（如「武道体系：…」）
  t = t.replace(/(?:，|；|｜|\n)?\s*[^，；｜\n]*(?:修仙|修真|仙侠|武道|武修|剑修|符道|魔法|斗气|异能|机械|星际|都市|末世|洪荒)[^，；｜\n]{0,40}/g, (m) => /修仙|修真|仙侠|武道|武修|剑修|符道|魔法|斗气|异能|机械|星际|都市|末世|洪荒/.test(m) && m.length <= 80 ? '' : m)
  // 清理残留分隔符
  t = t.replace(/[，；；]+/g, '，').replace(/[，；]\s*$/g, '').replace(/\s*[，；｜]\s*$/, '').trim()
  return t
}

function normalizeWorldbuildingData(data: any): any {
  // 默认空对象包含所有基础+立体化字段
  var defaultWorld = {
    era: '',
    geography: '',
    history: '',
    powerSystem: '',
    rules: [],
    socialStructure: '',
    technology: '',
    coreSettings: '',
    culturalFeatures: '',
    secretHistory: '',
    // 🔥 立体化字段（深度设定）
    raceSystem: [],
    historicalEpochs: [],
    civilizationFaults: '',
    geopoliticalPatterns: '',
    resourceSystem: '',
    tabooForbidden: [],
  }
  if (!data) return defaultWorld
  // Accept both AI-schema field names (worldRules, technologyLevel, coreSettings) and frontend field names
  var rawRules = data.worldRules || data.rules || []
  var rules: string[] = []
  if (Array.isArray(rawRules)) {
    rules = rawRules.flatMap(function(r: any) {
      if (typeof r === 'string') return r.trim() ? [r.trim()] : []
      if (Array.isArray(r)) return r.filter(function(x: any) { return typeof x === 'string' && x.trim() }).map(function(x: string) { return x.trim() })
      return []
    })
  } else if (typeof rawRules === 'string' && rawRules.trim()) {
    rules = [rawRules.trim()]
  }
  if (rules.length === 0) {
    rules = []
  }
  var technology = data.technologyLevel || data.technology || ''
  var culturalFeatures = normalizeToString(data.culturalFeatures || data.culture || '')
  var secretHistory = normalizeToString(data.secretHistory || data.hiddenHistory || '')
  var era = normalizeToString(data.era)
  var geography = normalizeToString(data.geography)
  var history = normalizeToString(data.history)
  // 🔥 2026-09-05：清洗力量体系文本（混入的金手指/体系名/体系类型包裹）
  var powerSystem = cleanPowerSystemText(data.powerSystem)
  // 🔥 2026-09-06 题材一致性：若世界设定整体是历史题材，进一步清除力量体系中混入的跨题材系统块
  var _wbCtxForGenre = era + ' ' + history + ' ' + normalizeToString(data.powerSystemType || '') + ' ' + normalizeToString(data.coreSettings || data.coreSetting || '')
  powerSystem = cleanPowerSystemGenresForHistorical(powerSystem, _wbCtxForGenre)
  var socialStructure = normalizeToString(data.socialStructure)
  // 🔥 规范化立体化字段
  var raceSystem: string[] = []
  if (Array.isArray(data.raceSystem)) {
    raceSystem = data.raceSystem.filter(function(r: any) { return typeof r === 'string' && r.trim() }).map(function(r: string) { return r.trim() })
  }
  var historicalEpochs: any[] = []
  if (Array.isArray(data.historicalEpochs)) {
    historicalEpochs = data.historicalEpochs.filter(function(e: any) { return e && typeof e === 'object' && (e.name || e.epochName) })
  } else if (Array.isArray(data.epochs)) {
    historicalEpochs = data.epochs.filter(function(e: any) { return e && typeof e === 'object' })
  }
  var civilizationFaults = normalizeToString(data.civilizationFaults || data.civilizationFault || data.historyFaults || '')
  var geopoliticalPatterns = normalizeToString(data.geopoliticalPatterns || data.geopolitics || data.politicalPatterns || '')
  var resourceSystem = normalizeToString(data.resourceSystem || data.resources || data.cultivationResources || data.economicSystem || '')
  var tabooForbidden: string[] = []
  if (Array.isArray(data.tabooForbidden)) {
    tabooForbidden = data.tabooForbidden.filter(function(t: any) { return typeof t === 'string' && t.trim() }).map(function(t: string) { return t.trim() })
  } else if (Array.isArray(data.taboos)) {
    tabooForbidden = data.taboos.filter(function(t: any) { return typeof t === 'string' && t.trim() }).map(function(t: string) { return t.trim() })
  }
  // 🔥 字段名映射：AI返回historicalEpochs(数组) → 前端eraChain(字符串)
  var eraChain = ''
  if (Array.isArray(data.historicalEpochs) && data.historicalEpochs.length > 0) {
    eraChain = data.historicalEpochs.map(function(e: any, i: number) {
      var eName = e.name || e.epochName || e.era || ('纪元' + (i+1))
      var eDesc = e.description || e.event || e.summary || ''
      return eName + (eDesc ? '：' + eDesc : '')
    }).join('；')
  } else if (typeof data.eraChain === 'string') {
    eraChain = data.eraChain
  }
  // 🔥 字段名映射：AI返回civilizationFaults → 前端civilizationFault
  var civilizationFault = civilizationFaults
  // 🔥 字段名映射：AI返回geopoliticalPatterns → 前端geopolitics
  var geopolitics = geopoliticalPatterns
  // 🔥 字段名映射：AI返回resourceSystem → 前端economicSystem
  var economicSystem = resourceSystem
  // 🔥 字段名映射：AI返回tabooForbidden → 前端taboos
  var taboos = tabooForbidden
  // 核心设定：若AI未返回，则自动由 era + geography + history + powerSystem + socialStructure 聚合生成
  var coreSettings = normalizeToString(data.coreSettings || data.coreSetting || data.summary || data.overview || '')
  if (!coreSettings || coreSettings.length < 15) {
    var parts: string[] = []
    if (era) parts.push('时代背景：' + era)
    if (geography) parts.push('地理格局：' + geography)
    if (history) parts.push('历史脉络：' + history.slice(0, 60))
    if (powerSystem) parts.push('力量体系：' + powerSystem.slice(0, 60))
    if (socialStructure) parts.push('社会结构：' + socialStructure.slice(0, 60))
    if (rules.length > 0) parts.push('世界规则：' + rules.slice(0, 2).map(function(r: any) { return String(r).slice(0, 40) }).join('；'))
    coreSettings = parts.join('｜') || ''
  }
  // 🔥 2026-09-05：背景设定(coreSettings)不应内嵌"力量体系"整块（力量体系是独立字段），整块移除
  coreSettings = cleanSettingPowerSystemBlock(coreSettings)
  return {
    ...defaultWorld,
    ...data,
    era,
    geography,
    history,
    powerSystem,
    rules,
    socialStructure,
    technology,
    culturalFeatures,
    secretHistory,
    coreSettings,
    // 🔥 返回所有立体化字段（含两种字段名，确保兼容）
    raceSystem,
    historicalEpochs,
    eraChain,
    civilizationFaults,
    civilizationFault,
    geopoliticalPatterns,
    geopolitics,
    resourceSystem,
    economicSystem,
    tabooForbidden,
    taboos,
  }
}

function normalizeCharactersData(data: any, detailedDesignInput?: string): any {
  // 🔥 2026-09-03 任务②增强：从「详细设定输入区」解析「姓名(身份)/姓名（身份）」「姓名:身份」等括号映射，
  //   作为徽章 title 的最高优先级覆盖源。LLM 在 identity/aliases 中按正史知识自由填的头衔（如多尔衮→摄政王、
  //   李定国→延平王、王太后→太皇太后）会被用户钦定身份（睿亲王/大西军晋王/皇太后）覆盖。
  //   解析仅命中已知名单（避免误匹配文本中的普通名词），同一姓名取首个有效映射；
  //   括号/冒号内含多项时取首段身份（如「郑成功(国姓爷，延平王)」→ 国姓爷）。
  var _titleOverride: Record<string, string> = {}
  function _buildTitleOverrideFromUserDesign(text: string): Record<string, string> {
    var _ovr: Record<string, string> = {}
    if (!text || typeof text !== 'string') return _ovr
    // 已知候选名单（来自 data 全部角色的 name）
    var _cands: Array<{ n: string; len: number }> = []
    var _seen: Record<string, boolean> = {}
    function _pushCand(rawName: any) {
      var _nn = normalizeToString(rawName)
      if (!_nn || _nn.length < 2 || _nn.length > 8) return
      if (_seen[_nn]) return
      _seen[_nn] = true
      _cands.push({ n: _nn, len: _nn.length })
    }
    if (data) {
      if (data.protagonist) _pushCand(data.protagonist.name)
      if (data.femaleLead) _pushCand(data.femaleLead.name)
      if (Array.isArray(data.femaleLeads)) data.femaleLeads.forEach(function(c: any) { _pushCand(c && c.name) })
      if (Array.isArray(data.antagonists)) data.antagonists.forEach(function(c: any) { _pushCand(c && c.name) })
      if (data.antagonist) _pushCand(data.antagonist.name)
      if (Array.isArray(data.supporting)) data.supporting.forEach(function(c: any) { _pushCand(c && c.name) })
      if (Array.isArray(data.characters)) data.characters.forEach(function(c: any) { _pushCand(c && c.name) })
    }
    if (_cands.length === 0) return _ovr
    // 长名字优先匹配（如"李定国"先于"李"），再按名单顺序逐个在文本中锚定
    _cands.sort(function(a, b) { return b.len - a.len })
    // 已消费的名字区间（防止短名命中长名内部，如"定国"命中"李定国"）
    var _used: Array<Array<number>> = []
    var _insideUsed = function(idx: number): boolean {
      for (var u = 0; u < _used.length; u++) {
        if (idx >= _used[u][0] && idx < _used[u][1]) return true
      }
      return false
    }
    // 说明性/非头衔词黑名单（命中说明括号内不是身份，而是旁注）
    // 🔥 #218g 追加死亡/败亡类事件词：设定文本中「史可法（扬州殉国）」这类原史事件注记
    //   会被误提取为头衔并每次前端归一化覆盖正史徽章（实测兵部尚书→扬州殉国循环回退）。
    // 🔥 #219 追加派系/军旅词：「李定国（原大西军，张献忠死后联明抗清…）」中派系出身注记
    //   被误提取为徽章（实测晋王→原大西军），同样属于旁注而非身份头衔。
    var _TITLE_DIRTY = ['主角', '女主', '女配', '反派', '配角', '本名', '原名', '诨名', '自称', '人称', '又名', '外号', '绰号', '名号', '身份', '称呼', '别名', '别称', '意即', '小说', '原型', '角色',
      '殉国', '殉难', '战死', '阵亡', '就义', '牺牲', '病逝', '遇害', '被俘', '被杀', '遇刺', '自尽', '兵败', '败亡', '覆灭',
      '大西军', '大顺军', '义军', '明军', '清军', '清兵', '清廷', '降将', '降臣', '降清', '仕清', '归明', '反正', '余部', '旧部', '残部', '起兵', '起义', '流寇', '叛军', '叛将', '劲旅', '麾下']
    var _cleanTitleSeg = function(_raw: string): string {
      var _t = String(_raw || '').trim()
      // 括号/冒号内若含多个身份，取首段（「郑成功(国姓爷，延平王)」→ 国姓爷）
      _t = _t.split(/[，、,;；]/)[0] || ''
      _t = _t.trim()
      _t = _t.replace(/^["'“「『《]+/, '').replace(/["'”」』》]+$/, '')
      if (_t.length < 2 || _t.length > 16) return ''
      // 必须纯中文，且不含虚词/连接词（说明这是短语而非完整句子）
      if (!/^[\u4e00-\u9fa5]+$/.test(_t)) return ''
      for (var d = 0; d < _TITLE_DIRTY.length; d++) {
        if (_t.indexOf(_TITLE_DIRTY[d]) !== -1) return ''
      }
      if (/[的为是乃与及和或但之其这那即曾所]/.test(_t)) return ''
      return _t
    }
    var _ci = 0
    while (_ci < _cands.length) {
      var _nm = _cands[_ci].n
      _ci++
      if (_ovr[_nm]) continue // 同一姓名取首个映射
      var _from = 0
      while (_from <= text.length) {
        var _pos = text.indexOf(_nm, _from)
        if (_pos === -1) break
        _from = _pos + _nm.length
        if (_insideUsed(_pos)) continue
        // 锚点之后必须是（、(、:、： 才视为身份映射（跳过纯叙述出现）
        var _after = _pos + _nm.length
        while (_after < text.length && /[\s]/.test(text.charAt(_after))) _after++
        var _ch = _after < text.length ? text.charAt(_after) : ''
        if (_ch !== '（' && _ch !== '(' && _ch !== '：' && _ch !== ':') continue
        var _titleRaw = ''
        if (_ch === '（' || _ch === '(') {
          // 括号内容：到配对的半角/全角闭括号为止
          var _closeCh = _ch === '（' ? '）' : ')'
          var _end = text.indexOf(_closeCh, _after + 1)
          var _endAlt = text.indexOf((_ch === '（' ? ')' : '）'), _after + 1)
          if (_end === -1) _end = _endAlt
          else if (_endAlt !== -1 && _endAlt < _end) _end = _endAlt
          if (_end === -1) continue
          _titleRaw = text.substring(_after + 1, _end)
        } else {
          // 冒号内容：到首个分隔符/换行/括号为止（最多取 24 字）
          var _end2 = text.length
          var _sepM = text.substring(_after + 1, Math.min(text.length, _after + 1 + 40)).search(/[，、。；;\n\r（(）)]/)
          if (_sepM !== -1) _end2 = _after + 1 + _sepM
          else _end2 = Math.min(text.length, _after + 1 + 24)
          _titleRaw = text.substring(_after + 1, _end2)
        }
        var _title = _cleanTitleSeg(_titleRaw)
        if (_title) {
          _ovr[_nm] = _title
          _used.push([_pos, _pos + _nm.length])
          break // 首个有效映射即停
        }
      }
    }
    return _ovr
  }
  _titleOverride = _buildTitleOverrideFromUserDesign(detailedDesignInput || '')

  // API 可能直接返回 { characters: [...] } 扁平数组
  if (data && Array.isArray(data.characters) && !data.protagonist) {
    var charsArr = data.characters
    var proto: any = null
    var fls: any[] = []
    var ants: any[] = []
    var sups: any[] = []
    for (var ci = 0; ci < charsArr.length; ci++) {
      var c = charsArr[ci]
      var rp = normalizeToString(c.rolePosition || c.role || '')
      if (/主角|protagonist/i.test(rp) && !proto) proto = c
      else if (/女主|femaleLead/i.test(rp)) fls.push(c)
      else if (/反派|antagonist|villain/i.test(rp)) ants.push(c)
      else sups.push(c)
    }
    if (!proto && charsArr[0]) proto = charsArr[0]
    data = {
      protagonist: proto,
      femaleLead: fls[0] || null,
      femaleLeads: fls,
      antagonist: ants[0] || null,
      antagonists: ants,
      supporting: sups,
      _harem: data._harem || null,
    }
  }

  function createEmptyCharacter(roleType: string): any {
    return { name: '', role: roleType, title: '', identity: '', age: 0, gender: '', appearance: '', personality: '', personalityOrigin: '', background: '', motivation: '', goal: '', skills: [], weaknesses: '', growthArc: '', hiddenTraits: '', coreMotivation: '', faction: '', mentor: '', speechHabit: '', catchphrase: '', quirks: '', relationToProtagonist: '', stats: null, _needsRefine: false, aliases: '', birthplace: '', realmLevel: '', weapons: '', techniques: '', experience: '', socialNetwork: '' }
  }
  // 🔥 2026-09-05 最终防线：确定性合成一位贴题女主（单女主设定必非空）。当所有后端/候选池回退都失败时调用，
  //   保证 UI 女主卡永不落入空态、也绝不高仿真实历史男角。默认走历史题材（当前"永历中兴"）。
  function synthesizeFemaleLead(_protagonist: any, genreHint: string): any {
    var _isCult = /修仙|修真|仙侠/.test(genreHint)
    var _isApocalypse = /末世|末日/.test(genreHint)
    var _name = _isCult ? '苏挽月' : (_isApocalypse ? '沈临风' : '沈青璃')
    var _age = 20
    var _title = _isCult ? '玄月宗内门弟子' : (_isApocalypse ? '第七基地首席医官' : '没落世家嫡长女')
    var _camp = _isCult ? '玄月宗（主角阵营）' : (_isApocalypse ? '第七基地（主角阵营）' : '主角阵营')
    var _birth = _isCult ? '中州玄月宗' : (_isApocalypse ? '第七基地' : '旧族聚居之地')
    var _appearance = '一袭白衣墨发如瀑，眉目清冷中透着坚毅，腕间一枚旧玉幡随步轻晃，周身自有千军难撼的从容。'
    var _personality = '外表温婉娴静，实则心思缜密、杀伐果断；待人以诚、重情重义，于危局中愈显沉着。'
    var _personalityOrigin = '年少时亲历家国倾覆、亲友离散，见惯乱世疾苦，遂养成外柔内刚、处变不惊的性子。'
    var _identity = _isCult ? '中州玄月宗内门弟子，擅术法与医理，身负一桩宗门秘辛。'
      : (_isApocalypse ? '第七基地首席医官，通生物药剂与野外求生，背负半城幸存者的托付。'
      : '没落世家嫡长女，自幼随父经商，亦通医术、兵法布阵与商路情报，乱世流落义军后成为一方擎旗者。')
    var _background = _isCult ? '出身中州玄月宗，家世与宗门渊源颇深；师门倾覆后流落人间，凭术法与医理在仙凡之间立足，与主角结下同门之谊。'
      : (_isApocalypse ? '第七基地首席医官，灾变后以一身医术挽救了半城幸存者；为寻解药以身涉险，与主角结为生死之交。'
      : '没落富商世家的嫡长女，家道中落后流落义军，凭医术与谋略在乱世中立足，后与主角并肩谋复山河、历尽战火而不改其志。')
    var _motivation = _isCult ? '要为蒙冤的师门讨回公道，重振玄月宗一脉正名。'
      : (_isApocalypse ? '要在末日废土中为幸存者寻出一条生路，唤醒人类重燃的希望。'
      : '不愿见山河沦丧、百姓流离，誓要辅佐仁主平定金瓯、重整山河。')
    var _goal = _isCult ? '查清师门倾覆真相，夺回被盗宗门至宝，重振道统。'
      : (_isApocalypse ? '携手共创可自给自足的生态基地，让文明在废土上重建。'
      : '助主角收拢义军、抚慰黎庶，克复故都，还天下一个朗朗乾坤。')
    var _skills = _isCult ? ['术法研习', '医药丹道', '阵法推演']
      : (_isApocalypse ? ['战场急救', '药剂合成', '野外求生']
      : ['医术精湛', '机关阵术', '商路情报'])
    var _weapon = _isCult ? '青锋剑「聆风」' : (_isApocalypse ? '改装急救枪「雪獠」' : '缠银软剑「疏影」')
    var _titleForBadge = _title
    return {
      id: 'char-fl-synth-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name: _name,
      age: _age,
      gender: '女',
      role: '女主',
      title: _titleForBadge,
      rolePosition: '女主',
      camp: _camp,
      job: '女主',
      identity: _identity,
      appearance: _appearance,
      personality: _personality,
      personalityOrigin: _personalityOrigin,
      background: _background,
      motivation: _motivation,
      goal: _goal,
      coreMotivation: _motivation,
      skills: _skills,
      coreSkills: _skills,
      hiddenTraits: _isCult ? '暗藏一门世代单传的封印秘术，非生死关头不轻动。' : (_isApocalypse ? '曾于荒野深处目击灾变真相，隐秘贯连全作谜团。' : '暗藏先祖传下的一卷兵图与秘方，非绝境不轻出。'),
      weaknesses: _isCult ? '性情过于重情，遇亲故危难时易失方寸。' : (_isApocalypse ? '旧伤缠身，长途奔袭时体力难支。' : '旧伤缠身，且心系亡故家人在危局中易生愧疚。'),
      growthArc: _isCult ? '从宗门遗孤，历经波折，成长为执掌一脉道统的掌门之才。' : (_isApocalypse ? '从基地医官，屡涉绝境，成长为能独当一面的末世领袖。' : '从落难名门女，历经战火淬炼，成长为独当一面的乱世女将。'),
      faction: _camp,
      mentor: _isCult ? '恩师玄机真人（下落不明）' : (_isApocalypse ? '恩师林初秋（第七基地前首席）' : '父亲宁远山（已故），授其经商与医术'),
      speechHabit: _isCult ? '常以「道阻且长，行则将至」自勉。' : (_isApocalypse ? '常以「活着，就有明天」为念。' : '常以「山河未复，何以言家」为念，谈及家国多出警句。'),
      catchphrase: _isCult ? '「道阻且长，行则将至。」' : (_isApocalypse ? '「只要还活着，就有明天。」' : '「山河未复，何以言家？」'),
      quirks: _isCult ? '运术时习惯轻捻指尖结印。' : (_isApocalypse ? '紧张时轻拂腕间医用腕带。' : '紧张时轻抚腰间剑穗。'),
      relationToProtagonist: '并肩作战、生死相托的知己与伴侣',
      growthBackground: _isCult ? '清修宗门中长大，幼读经卷、长习术法，师门倾覆后流落江湖，以济世救人历练己心。' : (_isApocalypse ? '灾变前是军校医学生，灾变后随基地成长，以救死扶伤与经营生存为重。' : '出身没落富商世家，自幼习文练武、通读医理，家道中落后以医济世，于乱世结识主角。'),
      psychologicalTrauma: _isCult ? '眼睁睁看着师门满门罹难、至宝被盗的当日，是永难释怀的梦魇。' : (_isApocalypse ? '灾变之夜失去双亲与过半同窗，午夜梦回仍觉痛楚。' : '家人为流寇所害、家业尽毁的往昔，今仍是她午夜梦回的痛处。'),
      moralBottomLine: _isCult ? '宁折不弯，纵与天下为敌也绝不行有违道义之事。' : (_isApocalypse ? '宁可同归于尽，也绝不放弃基地里任何一个想活下去的人。' : '宁折不弯，绝不放纵自身行有违道义之事。'),
      decisionPattern: _isCult ? '谋定而后动，善以一己之力牵制全局，换最小代价、最大胜算。' : (_isApocalypse ? '凡事先求保全于人，再图反击，以最小的牺牲换取最大的胜算。' : '谋定而后动，善以最小代价换取最大胜算。'),
      signatureItem: _weapon,
      themeColor: _isCult ? '月白' : (_isApocalypse ? '苍青' : '青'),
      values: _isCult ? '道义、真相、师门传承高于一切' : (_isApocalypse ? '责任、求存、人与人的守望相助' : '忠义、仁心、家国高于私情'),
      aliases: _isCult ? '苏姑娘，聆风仙使' : (_isApocalypse ? '沈首席，临风姑娘' : '青璃姑娘，宁家大小姐'),
      birthplace: _birth,
      realmLevel: _isCult ? '筑基后期' : '',  // 仅修仙题材有"境界"概念；历史/末世不涉境界，避免跨题材污染
      weapons: _weapon,
      techniques: _isCult ? '〔聆风剑诀·封印秘术〕' : (_isApocalypse ? '急救双针·荒野药剂调配' : '宁氏针法（点穴救急）'),
      experience: _isCult ? '入门苦修→师门罹难→流落江湖→结识主角→寻真相重振道统' : (_isApocalypse ? '灾变求生→受训成医→基地立足→随军远征→寻找解药' : '家道中落→流落义军→献策立足→随军征战→克复故土'),
      socialNetwork: _isCult ? '与主角、玄月宗旧部及江湖故交相交颇深' : (_isApocalypse ? '与主角、基地幸存者及各势力头目相交' : '与主角、各路义军及旧部故交相交'),
      contradiction: _isCult ? '看似清冷超脱，实则执念深重；医者仁心，为护道统也能痛下杀手。' : (_isApocalypse ? '竭力救人的医者，却不得不一次次亲手做下牺牲他人的取舍。' : '看似清冷疏离，实则重情至深；医者仁心，为大局却能下杀伐狠手。'),
      arcNodes: [
        { stage: '起步', event: _name + '初现身于乱世，于落难之处与主角相遇。', change: '从被命运裹挟，到第一次主动握紧自己的选择。', powerLevel: '' },
        { stage: '觉醒', event: '家国变故/师门罹难/基地危难临头，她被迫扛起守护之责。', change: '明白空谈无益，唯有实力与担当方能护住所爱之人。', powerLevel: '' },
        { stage: '成长', event: '随主角连番征战/历练，医术与谋略在此间步步精进。', change: '从依仗人力到懂得借势，心境愈发开阔沉稳。', powerLevel: '' },
        { stage: '巅峰', event: '于关键一役（北伐/决战/远征）中力挽狂澜，化解全线危局。', change: '终成可独当一面的擎旗者，与主角并肩走到山河将定。', powerLevel: '' },
        { stage: '超脱', event: '大业初成之际，放下私怨执念，守护真正想守护的东西。', change: '最终于家国与个人之间求得两全，心境圆满。', powerLevel: '' },
      ],
      stats: { strength: 62, intelligence: 88, command: 70, politics: 78, charm: 90 },
      attributes: { strength: 62, intelligence: 88, command: 70, politics: 78, charm: 90 },
      _synthesized: true,
    }
  }
  function parseCharacterText(_text: string, _roleType: string): any {
    return null
  }
  function normalizeChar(char: any, roleType: string, titleOverride?: Record<string, string>): any {
    if (!char) return createEmptyCharacter(roleType)
    if (typeof char === 'string') {
      var parsed = parseCharacterText(char, roleType)
      if (parsed) return parsed
      return createEmptyCharacter(roleType)
    }
    var name = normalizeToString(char.name)
    // 🔥 关键修复：优先使用position字段作为角色定位（知名小说库数据中position更详细）
    var role = normalizeToString(char.position || char.role || char.rolePosition || roleType)
    var identity = normalizeToString(char.identity || char.title || '')
    // 🔥 名字校验：过滤明显错误的名字（包含占位词、格式不对、角色编号等）
    var _badNamePatterns = ['主角', '配角', '反派', '女主', '家族', '角色', '人物', '待定', '未知', '示例', '模板', 'placeholder', 'todo']
    var _hasBadWord = _badNamePatterns.some(function(bw) { return name.indexOf(bw) >= 0 })
    // 🔥 增强过滤：匹配"角色+数字"、"人物+数字"、"配角+数字"、"反派+数字"、"男/女配+数字"等编号模式
    var _badNumberPattern = /^(主角|配角|反派|女主|男主|男配|女配|人物|角色|路人|NPC|神秘人|神秘男子|神秘女子)\d*$/i
    var _isNumberedPlaceholder = _badNumberPattern.test(name)
    if (_hasBadWord || _isNumberedPlaceholder || !name || name.length < 2) {
      // 🔥 修复：删除所有硬编码名字列表，返回空字符串，让AI重新生成
      name = ''
    }
    var age = char.age
    if (age === undefined || age === null || age === 0 || age === '' || age === '0') {
      // 根据角色类型设置合理年龄范围
      if (roleType === 'protagonist' || roleType === 'femaleLead') {
        age = 18 + Math.floor(Math.random() * 5)
      } else if (roleType === 'mentor' || /长辈|老师|师父|师傅|爷爷|奶奶/.test(role)) {
        age = 40 + Math.floor(Math.random() * 30)
      } else if (roleType === 'antagonist') {
        age = 30 + Math.floor(Math.random() * 40)
      } else {
        age = 18 + Math.floor(Math.random() * 25)
      }
    }
    if (typeof age === 'string') {
      var parsedAge = parseInt(age, 10)
      age = isNaN(parsedAge) ? (18 + Math.floor(Math.random() * 25)) : parsedAge
    }
    // 年龄合理性检查：根据角色类型限制年龄范围
    if (typeof age === 'number') {
      if ((roleType === 'protagonist' || roleType === 'femaleLead') && age > 30) {
        age = 18 + Math.floor(Math.random() * 5)
      } else if ((roleType === 'mentor' || /长辈|老师|师父|师傅|爷爷|奶奶/.test(role)) && age < 35) {
        age = 40 + Math.floor(Math.random() * 30)
      } else if (roleType === 'antagonist' && age < 25) {
        age = 30 + Math.floor(Math.random() * 40)
      }
      // 非特殊身份角色年龄上限检查（扩展豁免列表覆盖洪荒/神话题材）
      var _ageExemptTitles = ['仙人', '神祇', '长老', '先祖', '老祖', '圣者', '魔神', '先天', '上古', '太古', '混沌', '祖巫', '大巫', '巫族', '妖圣', '妖帝', '妖皇', '东皇', '妖师', '大妖', '妖族', '鲲鹏', '金仙', '大罗', '太乙', '准圣', '圣人', '天道', '大道', '神王', '神帝', '天帝', '道祖', '祖龙', '元凤', '始麒麟', '洪荒', '封神', '巫殿', '穿越', '重生', '量劫']
      var _charContextForAge = (char.identity || '') + ' ' + (char.background || '') + ' ' + (char.name || '')
      // 🔥 修复：年龄异常值检测——超过10000岁视为AI错误数据（可能是时间戳/随机数），重置为合理值
      if (age > 10000) {
        console.warn('[normalizeChar] 年龄异常值检测: ' + age + '，重置为合理值')
        if (roleType === 'protagonist' || roleType === 'femaleLead') {
          age = 18 + Math.floor(Math.random() * 8)
        } else if (roleType === 'mentor' || /长辈|老师|师父|师傅|爷爷|奶奶/.test(role)) {
          age = 40 + Math.floor(Math.random() * 30)
        } else if (roleType === 'antagonist') {
          age = 30 + Math.floor(Math.random() * 40)
        } else {
          age = 20 + Math.floor(Math.random() * 25)
        }
      } else if (age > 150 && !_ageExemptTitles.some(function(title) { return _charContextForAge.indexOf(title) >= 0 })) {
        age = Math.min(age, 150)
      }
    }
    var gender = normalizeToString(char.gender || '')
    if (!gender) {
      if (/女|女主|母亲|阿姨|姐姐|妹妹|婆婆|奶奶|师太/.test(role + name)) gender = '女'
      else if (/男|父亲|叔叔|伯伯|舅舅|爷爷|公公/.test(role + name)) gender = '男'
      else gender = Math.random() > 0.5 ? '男' : '女'
    }
    var appearance = normalizeToString(char.appearance)
    var personality = normalizeToString(char.personality)
    // 🔥 2026-09-06：检测旧数据残留的模板占位性格串（如「性格鲜明，为人处世有其独特原则」等），
    //   替换为基于角色名字/身份/背景派生的具体性格描述，杜绝 NPC 性格空泛雷同（线上存库 57 处模板占位）。
    if (personality) {
      var _TPL_MARKS = ['性格鲜明', '性格开朗', '性格稳重', '性格复杂', '有独立思想', '为人处世有其独特原则', '有着自己的坚持和信念', '独特原则', '独特的原则', '多面性的性格', '在故事中展现', '重要角色', '关键角色', '神秘人物', '形象独特', '不可或缺的重要角色']
      var _hitTpl = false
      for (var _ti = 0; _ti < _TPL_MARKS.length; _ti++) { if (personality.indexOf(_TPL_MARKS[_ti]) >= 0) { _hitTpl = true; break } }
      // 仅当命中模板特征 且 描述过短（真实性格通常更长）才替换，避免误伤真实描写
      if (_hitTpl && personality.length <= 45) {
        var _tplCharName = name || '该角色'
        var _tplRoleWord = String(role || roleType || '')
        var _tplIdHint = String(identity || char.background || '')
        var _tplSeed = _tplIdHint.replace(/^(.{1,12}?阵营(?:\s*[（(][^）)]{1,12}[）)])?\s*[·•]?\s*)/, '')
        _tplSeed = _tplSeed.split(/[，,。；;]/)[0] || ''
        if (_tplSeed.length < 2) _tplSeed = ''
        if (/反派|敌|恶|boss|antagonist/i.test(_tplRoleWord + _tplSeed)) {
          personality = _tplCharName + '心高气傲，城府极深，为达目的不择手段' + (_tplSeed ? '，因' + _tplSeed + '之出身，行事更显狠辣决绝' : '，表面上温文尔雅，实则心狠手辣')
        } else if (/女主|femaleLead|female/i.test(_tplRoleWord)) {
          personality = _tplCharName + '外柔内刚，聪慧过人，表面温婉实则内心坚定' + (_tplSeed ? '，' + _tplSeed + '的经历更淬炼出其坚韧心性' : '，对待感情专一执着，关键时刻有决断力')
        } else if (/主角|protagonist/i.test(_tplRoleWord)) {
          personality = _tplCharName + '性格坚韧果敢，外冷内热，面对强敌不卑不亢' + (_tplSeed ? '，' + _tplSeed + '的处境养成了其深沉城府' : '，重情重义却绝不心慈手软')
        } else {
          personality = _tplSeed
            ? (_tplCharName + '性情' + _tplSeed.slice(0, 12) + '，行事不拘小节却极重信诺，于公于私皆有原则，面对强敌与权谋时自有其应对章法，剑走偏锋亦不失分寸。')
            : (_tplCharName + '处事沉稳果决，明利害而不失仁厚，对部曲亲厚有加，对敌手则恩威并施，在朝堂与沙场之间历练得长袖善舞而不失忠义本色。')
        }
        console.log('[normalizeChar] 替换NPC模板性格占位 →', name, '|', personality.slice(0, 30))
      }
    }
    var background = normalizeToString(char.background || char.description)
    var motivation = normalizeToString(char.motivation || char.coreMotivation || char.goal || char.motive || char.reasonField || char.drive)
    var coreMotivation = normalizeToString(char.coreMotivation || char.motivation || char.goal)
    var skills = Array.isArray(char.skills) ? char.skills
      : (Array.isArray(char.coreSkills) ? char.coreSkills
      : (typeof char.skills === 'string' ? [char.skills] : []))
    var growthArc = normalizeToString(char.growthArc || char.development || '')
    var hiddenTraits = normalizeToString(char.hiddenTraits || '')
    var weaknesses = normalizeToString(char.weaknesses || '')
    // 🔥 新增深度字段（参考巫颂/完美世界角色设计标准）
    var personalityOrigin = normalizeToString(char.personalityOrigin || char.personalityBackground || '')
    var goal = normalizeToString(char.goal || char.coreGoal || '')
    var faction = normalizeToString(char.faction || char.affiliation || char.force || '')
    var mentor = normalizeToString(char.mentor || char.master || char.teacher || '')
    var speechHabit = normalizeToString(char.speechHabit || char.speechStyle || '')
    var catchphrase = normalizeToString(char.catchphrase || char.signatureLine || '')
    var quirks = normalizeToString(char.quirks || char.habits || '')
    var relationToProtagonist = normalizeToString(char.relationToProtagonist || char.relation || char.relationship || '')
    // 🔥 2026-09-03 #122：属性面板归一化——后端已强解析 stats/attributes，前端再兜一层。
    //   原实现 `var stats = char.stats || null` 会把「字符串型 stats」「中文键对象」原样透传给 UI，
    //   正是用户截图里「出现字符串（未解析的 JSON 键裸露）」的来源。
    var _STAT_KEYS_FE = ['strength', 'intelligence', 'command', 'politics', 'charm']
    var _STAT_CN_MAP_FE: Record<string, string> = {
      '武力': 'strength', '武力值': 'strength', '力量': 'strength', '武艺': 'strength',
      '智力': 'intelligence', '智力值': 'intelligence', '智谋': 'intelligence', '谋略': 'intelligence',
      '统帅': 'command', '统帅值': 'command', '统御': 'command', '军事': 'command',
      '政治': 'politics', '政治值': 'politics', '政务': 'politics', '权谋': 'politics',
      '魅力': 'charm', '魅力值': 'charm', '声望': 'charm', '人格魅力': 'charm',
    }
    var _parseStatsFE = function (raw: any): Record<string, number> {
      var out: Record<string, number> = {}
      if (!raw) return out
      var _setFe = function (k: string, v: any) {
        var n = Number(String(v).replace(/[^0-9.\-]/g, ''))
        if (!isFinite(n)) return
        if (n > 0 && n <= 1) n = Math.round(n * 100)
        n = Math.round(n)
        if (n < 1) n = 1
        if (n > 100) n = 100
        out[k] = n
      }
      try {
        var _target: any = raw
        if (typeof raw === 'string' && raw.trim()) {
          var _pFe: any = null
          try { _pFe = JSON.parse(raw) } catch (_e) { _pFe = null }
          _target = _pFe || raw
        }
        if (_target && typeof _target === 'object' && !Array.isArray(_target)) {
          for (var _kFe in _target) {
            if (!Object.prototype.hasOwnProperty.call(_target, _kFe)) continue
            var _lkFe = String(_kFe).toLowerCase().trim()
            var _mappedFe = _STAT_KEYS_FE.indexOf(_lkFe) >= 0 ? _lkFe : (_STAT_CN_MAP_FE[String(_kFe).trim()] || '')
            if (!_mappedFe) continue
            _setFe(_mappedFe, _target[_kFe])
          }
        } else if (typeof _target === 'string') {
          var _reFe = /([一-龥]{2,4})\s*[:：]?\s*(\d{1,3})/g
          var _mFe: RegExpExecArray | null = null
          while ((_mFe = _reFe.exec(_target)) !== null) {
            var _cnFe = String(_mFe[1] || '')
            var _tgtFe = _STAT_CN_MAP_FE[_cnFe] || ''
            if (!_tgtFe) { for (var _ckFe in _STAT_CN_MAP_FE) { if (_cnFe.indexOf(_ckFe) >= 0) { _tgtFe = _STAT_CN_MAP_FE[_ckFe]; break } } }
            if (_tgtFe) _setFe(_tgtFe, _mFe[2])
          }
        }
      } catch (_peFe) { /* ignore */ }
      return out
    }
    var _defaultStatsFE = { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 }
    var _mergedStatsFE: Record<string, number> = {}
    var _pStatsFE = _parseStatsFE(char.stats)
    var _pAttrsFE = _parseStatsFE(char.attributes)
    for (var _siFe = 0; _siFe < _STAT_KEYS_FE.length; _siFe++) {
      var _kkFe = _STAT_KEYS_FE[_siFe]
      var _vvFe = (_pStatsFE[_kkFe] != null) ? _pStatsFE[_kkFe] : ((_pAttrsFE[_kkFe] != null) ? _pAttrsFE[_kkFe] : 50)
      _mergedStatsFE[_kkFe] = _vvFe
    }
    var stats = _mergedStatsFE || _defaultStatsFE
    // 🔥 阶段4 P2：进阶字段透传（基于本作前序设定做立体化设计）
    var growthBackground = normalizeToString(char.growthBackground || char.growthBg || char.backgroundDetail || char.upbringing || '')
    var psychologicalTrauma = normalizeToString(char.psychologicalTrauma || char.trauma || char.innerTrauma || char.obsession || '')
    var moralBottomLine = normalizeToString(char.moralBottomLine || char.bottomLine || char.moralLine || '')
    var decisionPattern = normalizeToString(char.decisionPattern || char.decisionStyle || char.decisionMode || '')
    var signatureItem = normalizeToString(char.signatureItem || char.signatureProp || char.signatureWeapon || char.iconicItem || '')
    var themeColor = normalizeToString(char.themeColor || char.color || char.themeImage || char.characterColor || '')
    var values = normalizeToString(char.values || char.belief || char.valueSystem || char.creed || '')
    // 🔥 2026-09-03 修复（图一/图二 · 标志性台词/口头禅空值）：LLM 常对配角省略 catchphrase/signatureItem。
    //   只要非空就保留原作值；空则从既有素材推导，保证 UI 永不出现空槽：
    //   · 口头禅：优先 speechHabit/个性/身份里带「」的引语 → 无引语则取 目标/动机 首句做人物宣言 → 最后兜底为「名号+名」式行动信条。
    //   · 标志性道具：优先 weapons 首件 → techniques 首项 → 核心技能首条，均非空（素材本身即角色的标志物）。
    function _cleanQuote(_s: string): string {
      if (!_s) return ''
      var _q = String(_s).match(/[「『]([^」』]{2,20})[」』]/)
      if (_q && _q[1]) return _q[1].trim()
      return ''
    }
    function _deriveCatchphrase(germ: any): string {
      var _raw = normalizeToString(germ) || ''
      var _q = _cleanQuote(_raw)
      if (_q) return _q
      var _hl = _raw.split(/[，。；,;]/)[0] || _raw
      _hl = _hl.trim().replace(/^[「『]|[」』]+$/g, '')
      if (_hl.length >= 2 && _hl.length <= 24 && !/[的为是在与及和或但而]/.test(_hl)) return _hl
      return ''
    }
    if (!catchphrase) {
      catchphrase = _deriveCatchphrase(speechHabit)
      || _deriveCatchphrase(quirks) || _deriveCatchphrase(personality) || _deriveCatchphrase(motivation) || _deriveCatchphrase(goal)
      if (!catchphrase) {
        var _cidGoal = goal || motivation || coreMotivation || ''
        var _cg = _cidGoal.split(/[。！？;；]/)[0] || _cidGoal
        _cg = String(_cg).trim().replace(/[「『」』]/g, '').substring(0, 18)
        if (_cg.length >= 4) catchphrase = '「' + _cg + '」'
        else catchphrase = (name || '执旗者') + '·一往无前'
      }
    }
    if (!signatureItem) {
      // 标志性道具 = 武器/技法/技能中的标志物（素材即角色的专属标识，非杜撰）
      signatureItem = String(char.weapons || char.weapon || char.arms || '').split(/[，,、；;]/)[0] || ''
      if (!signatureItem) {
        signatureItem = String(char.techniques || char.technique || char.cultivationMethod || '').split(/[，,、；;]/)[0] || ''
      }
      if (!signatureItem && Array.isArray(skills) && skills.length) {
        signatureItem = normalizeToString(skills[0]).split(/[：:，,（(]/)[0] || ''
      }
    }
    // 🔥 2026-09-03 修复（图一 · 弧光节点空值）：LLM 常省 arcNodes。空则依据「人物弧光成长线」+「经历时间线」
    //   确定性拼出 5 个节点（起步→觉醒→成长→巅峰→超脱），杜绝空列表。素材来自 growthArc/experience，非杜撰。
    // 🔥 Bug3 修复（主角/女主 arcNodes 空值 + 模板句）：不再产出空 stage/event 或「在此阶段完成从处境到心境的双重转变」模板句，
    //   改为从角色已有素材（experience / growthArc / background / goal / growthBackground）确定性派生真实节点，
    //   保证 stage（阶段名，取事件首段，如「肇庆立朝」）、event（该阶段关键事件）、change（含角色名+具体事件的心境转变）均非空、非模板。
    var _arcStageNames = ['起步', '觉醒', '成长', '巅峰', '超脱']
    var _arcEventPool = String(char.experience || char.lifeEvents || char.storyArc || char.majorEvents || '')
      .split(/[→>▸\n]+/).map(function (_x: string) { return String(_x || '').trim() }).filter(function (_x: string) { return _x.length >= 4 })
    var _arcChangePool = String(growthArc || char.growthBackground || char.background || char.identity || '')
      .split(/[。！？;；\n]+/).map(function (_x: string) { return String(_x || '').trim() }).filter(function (_x: string) { return _x.length >= 6 })
    var _arcGoal = normalizeToString(char.goal || char.motivation || char.coreMotivation || motivation || '')
    // 从事件原文提取阶段名（取首个子句，2-8 字），无则回退通用阶段名
    var _arcStageFromEvent = function (_evt: string, _idx: number): string {
      var _s = String(_evt || '').replace(/^[·\-—\s\d.、]+/, '')
      var _head = (_s.split(/[，,。；;：:、\s]/)[0] || '').trim()
      if (_head.length >= 2 && _head.length <= 8) return _head
      if (_head.length > 8) return _head.slice(0, 6)
      return _arcStageNames[_idx] || ('第' + (_idx + 1) + '阶段')
    }
    var _arcSource = (function () {
      var _nodes: any[] = []
      var _evtLen = _arcEventPool.length
      var _chgLen = _arcChangePool.length
      for (var _ai = 0; _ai < 5; _ai++) {
        var _evt = _evtLen > 0 ? _arcEventPool[_ai % _evtLen] : ''
        var _stage = _evt ? _arcStageFromEvent(_evt, _ai) : (_arcStageNames[_ai] || ('第' + (_ai + 1) + '阶段'))
        // 事件：优先经历时间线原文（含具体事件）；缺失时用角色名+目标+阶段兜底（仍非模板）
        var _event = _evt || ((name || '该角色') + (_arcGoal ? '为「' + _arcGoal.slice(0, 12) + '」' : '') + '迈入' + _arcStageNames[_ai] + '阶段，迎来新的转折')
        // 心境转变：优先成长弧光原文；并显式带角色名与具体事件，杜绝「双重转变」模板句
        var _mind = _chgLen > 0 ? _arcChangePool[_ai % _chgLen] : '心境由被动承受转向主动进取，立场愈发坚定'
        if (_mind === _event) _mind = '在心境与立场上完成一次由内而外的转变'
        var _change = (name ? name + '因「' + _event.slice(0, 16) + '」，' : '') + _mind
        _nodes.push({
          stage: _stage,
          event: _event,
          change: _change,
          powerLevel: '',
        })
      }
      return _nodes
    })()
    // 🔥 2026-09-08 #165 弧光去重：LLM/兜底常见 event===change，change 空或与 event 同文时按阶段重建，
    //   杜绝「关键事件/心理变化」两栏内容一模一样（用户实测重复出现的根因之一：后端名单补齐路径 event/change 同值）。
    function _stageChangeFallback(stageName: string, chName: string): string {
      var _who = chName ? chName : '此角'
      var _st = String(stageName || '')
      if (_st.indexOf('起步') >= 0 || _st.indexOf('初心') >= 0) return _who + '初立其志，在时局洪流中找准自身位置，迈出第一步'
      if (_st.indexOf('觉醒') >= 0 || _st.indexOf('转折') >= 0) return _who + '遭遇变局，旧有观念被现实击碎，完成第一次蜕变'
      if (_st.indexOf('成长') >= 0 || _st.indexOf('磨砺') >= 0) return _who + '历经挫折磨砺，处事愈发沉稳，从独善其身转向统御全局'
      if (_st.indexOf('巅峰') >= 0 || _st.indexOf('高光') >= 0) return _who + '站上巅峰后心态归于从容笃定，格局由取胜转向治世'
      if (_st.indexOf('超脱') >= 0 || _st.indexOf('归宿') >= 0) return _who + '回望来路信念升华，个人命运汇入时代洪流'
      // 🔥 Bug3 修复：未命中阶段关键词（如派生阶段名「肇庆立朝」）时，改用角色素材派生具体转变，
      //   彻底杜绝「在此阶段完成从处境到心境的双重转变」模板句；无素材时给非模板的通用句。
      var _fbMat = String(growthArc || char.growthBackground || background || goal || char.goal || '').trim()
      if (_st) return _who + '在「' + _st + '」阶段' + (_fbMat ? '，' + _fbMat.slice(0, 16) : '，完成心境与立场的转变')
      if (_fbMat) return _who + '于「' + _fbMat.slice(0, 16) + '」中完成心境与立场的转变'
      return _who + '在时局磨砺中逐步确立自身立场，完成由被动到主动的心境转变'
    }
    // 🔥 阶段4 P2：双写字段保证前后端兼容（coreSkills/skills、rolePosition/role）
    var coreSkillsValue = Array.isArray(char.coreSkills) ? char.coreSkills : (Array.isArray(char.skills) ? char.skills : [])
    var rolePositionValue = normalizeToString(char.rolePosition || char.role || roleType)
    // 🔥 2026-09-02 修复（图2 · 二轮）：阵营/职能提取——与「角色定位」彻底解耦，并兼容全部复合格式。
    //   身份背景常见形态：
    //     · 「永历阵营（主角阵营）忠臣文官，原大明南都兵部尚书…」→ 阵营=永历阵营（主角阵营），职能=忠臣文官
    //     · 「永历特首（主角阵营）忠臣文官，…」                 → 阵营在括号内，旧正则漏提取（徽章显示成"配角"的根因）
    //     · 「清军阵营（敌对）…」「中立/第三方阵营…」
    //   ① 阵营（camp）优先取后端字段，其次依次尝试两种头部形态；
    //   ② 职能（job）从剥离阵营后的首段（首个逗号前、2-8 字纯汉字）提取，供「角色定位」下拉使用。
    //   ⚠️ 徽章显示【阵营】、下拉编辑【职能】，改下拉绝不联动徽章。
    var _RE_CAMP_HEAD = /^([\u4e00-\u9fa5A-Za-z0-9·\/]{2,10}阵营\s*(?:[（(][^）)]{1,14}[）)])?)/
    var _RE_CAMP_PAREN = /^([\u4e00-\u9fa5A-Za-z0-9·\/]{2,10}(?:[（(][^）)]{0,12}阵营[^）)]{0,12}[）)]))/
    var _extractCamp = function (_src: any): string {
      var _s = String(_src || '').trim()
      if (!_s) return ''
      var _m = _s.match(_RE_CAMP_HEAD)
      if (_m && _m[1]) return _m[1].trim()
      var _m2 = _s.match(_RE_CAMP_PAREN)
      if (_m2 && _m2[1]) return _m2[1].trim()
      return ''
    }
    // 从「阵营前缀 + 职能，其余描述」中提取职能（剥离阵营后取首个逗号前的 2-8 字纯汉字）
    // 🔥 2026-09-03 修复图二（史可法 + 全角色角色定位）：rolePosition 常为通用型「配角/中立/盟友」，
    //   若直接命中会短路掉 identity 里更具体的剧情职能（如史可法「配角」→ 实为「忠臣文官」）。
    //   故凡结果命中通用角色词，一律视为"未提取到"，继续回退去 identity/position 里挖具体职能。
    var _GENERIC_ROLE_WORDS = ['主角', '男主', '女主', '女配', '男配', '配角', '反派', '盟友', '导师', '中立', '核心', '反派1']
    var _extractJob = function (_src: any): string {
      var _s = String(_src || '').trim()
      if (!_s) return ''
      var _camp = _extractCamp(_s)
      var _rest = _camp ? _s.substring(_camp.length).replace(/^[·\-—\s]+/, '') : _s
      var _head = _rest.split(/[，,。；;]/)[0] || ''
      _head = _head.trim()
      // 仅当剥离后首段是紧凑的职能词（2-8 字纯汉字）才采用，避免把长描述误当职能
      if (_head.length >= 2 && _head.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(_head) && _GENERIC_ROLE_WORDS.indexOf(_head) === -1) return _head
      return ''
    }
    var _campValue = normalizeToString(char.camp || char.campName || '')
    if (!_campValue) _campValue = _extractCamp(rolePositionValue)
    if (!_campValue) _campValue = _extractCamp(char.identity)
    if (!_campValue) _campValue = _extractCamp(char.position)
    // 职能：后端 job/positionTail 优先，否则从 rolePosition/identity 复合串中提取
    var _jobValue = normalizeToString(char.job || char.positionTail || char.roleTail || '')
    if (!_jobValue) _jobValue = _extractJob(rolePositionValue)
    if (!_jobValue) _jobValue = _extractJob(char.identity)
    var fallbackPersonality = personality || ''
    var fallbackBackground = background || (char as any).description || ''
    var fallbackMotivation = motivation || coreMotivation || (char as any).goal || (char as any).motive || (char as any).reasonField || (char as any).drive || ''
    var fallbackAppearance = appearance || ''
    var fallbackWeaknesses = weaknesses || ''
    var fallbackGrowthArc = growthArc || ''
    var fallbackHiddenTraits = hiddenTraits || ''
    var fallbackIdentity = identity || ''
    // 🔥 Bug修复：如果identity为空，根据角色信息生成具体的身份背景
    if (!fallbackIdentity) {
      var identityParts: string[] = []
      // 从背景中提取身份线索
      if (background && typeof background === 'string') {
        var bgShort = background.substring(0, Math.min(30, background.length))
        if (bgShort.length > 5) identityParts.push(bgShort)
      }
      // 从技能推断身份
      if (skills && skills.length > 0) {
        var mainSkill = typeof skills[0] === 'string' ? skills[0] : ''
        if (mainSkill) identityParts.push('擅长' + mainSkill)
      }
      // 根据角色类型添加定位
      if (role && role !== 'supporting') {
        var roleLabels: Record<string, string> = {
          '主角': '故事核心人物',
          'protagonist': '小说男主角（故事核心人物）',
          '女主': '重要女性角色',
          '反派': '关键对手',
          '盟友': '可靠伙伴',
          '导师': '指引者',
          '中立': '平衡角色',
        }
        identityParts.push(roleLabels[role] || role + '角色')
      }
      fallbackIdentity = identityParts.length > 0 ? identityParts.join('，') : ''
    }

    var safe = char || {}
    // 🔥 关键修复：skills字段fallback - 确保核心技能/金手指不为空
    var fallbackSkills = Array.isArray(safe.skills) ? safe.skills : (typeof safe.skills === 'string' ? [safe.skills] : [])
    if (fallbackSkills.length === 0) {
      fallbackSkills = []
    }
    // 🔥 2026-09-02 修复（图2 · 二轮）：「角色定位」应体现剧情职能（如「忠臣文官」），
    //   而不是千篇一律的「配角」。当后端给的是通用定位词时，用从复合串提取的具体职能覆盖。
    var _GENERIC_ROLES = ['配角', 'supporting', '中立', 'neutral', '其他', '角色', '']
    var _baseRole = normalizeToString(char.position || safe.role || safe.rolePosition || roleType)
    var _finalRole = _baseRole
    if (_jobValue && _GENERIC_ROLES.indexOf(_baseRole) !== -1) _finalRole = _jobValue
    // 🔥 2026-09-03 任务②：真实身份头衔（左上角徽章专用，与「角色定位」下拉彻底解耦）
    //   · 徽章 = 真实身份头衔，如「永历帝/黔国公/满清平西王/大西军秦王」；角色定位 = 剧情职能（忠臣武将/盟友/长辈…）。
    //   · title 提取优先级：① 用户在「详细设定输入区」括号内钦定的身份（如「多尔衮(满清睿亲王)」）
    //                      ② 显式 title/honorific 字段 ③ aliases 首项身份词 ④ identity 首段身份短语。
    //   · 提取结果仅作「默认徽章文案」，UI 上始终可点击徽章手动编辑（写回 title），编辑绝不联动 role。
    // 整词挡词表（命中说明是说明性脏文本，不作身份头衔）
    var _TITLE_BAD_WORDS = ['主角', '女主', '女配', '反派', '配角', '诨名', '流传', '相称', '身份', '名号', '称呼', '别名', '军中', '门内', '同辈', '以字', '本作', '该角', '角色', '人物']
    var _hasTitleBadWord = function (_s: string): boolean {
      for (var _bi = 0; _bi < _TITLE_BAD_WORDS.length; _bi++) {
        if (_s.indexOf(_TITLE_BAD_WORDS[_bi]) !== -1) return true
      }
      return false
    }
    var _titleSource = ''
    // ① 用户在「详细设定输入区」括号内钦定的真实身份头衔（最高优先级，覆盖 LLM 自由生成的正史头衔）
    if (titleOverride && name) {
      var _ovr = normalizeToString(titleOverride[name] || '')
      if (_ovr) _titleSource = _ovr
    }
    // ② 显式 title/honorific 字段
    if (!_titleSource) {
      _titleSource = normalizeToString(char.title || char.honorific || char.headerTitle || char.identityTitle || '')
    }
    // 🔥 2026-09-03 修复图二（史可法等：徽章显示谥号/别名而非官衔）：在 aliases 之前，
    //   先从 identity 里提取「具体官衔」作徽章（史可法 → 兵部尚书/东阁大学士），避免取到「史忠正」这类谥号别称。
    //   仅当身份文本明确含官衔词才采用；无则继续走 alias 兜底（如多尔衮→摄政王）。
    if (!_titleSource) {
      var _rankTitle = (function (_src: string): string {
        var _s = String(_src || '')
        // 剥掉朝代/方位/加衔等前置词，防止拼出「南明兵部尚书」这类过长徽章
        var _s2 = _s.replace(/(原|故明|南明|大明|满清|清朝|后金|大西|大顺|大周|南朝|北朝|南都|加衔|衔|正一品|从一品|正二品|从二品|正三品|从三品)/g, '')
        // 官衔词：王爵/宰辅/军职/宗室等，长度控制在 2-6 字
        var _m = _s2.match(/([一-龥]{1,3})(尚书|侍郎|大学士|总督|督师|巡抚|总兵|提督|都统|节度使|指挥使|布政使|按察使|知府|知州|首辅|丞相|宰相|掌印太监|国师|教主|盟主|掌门|宗主|家主|族长|亲王|郡王|太子|太师|太傅|太保|少保)/)
        if (_m) {
          var _r = (_m[1] || '') + _m[2]
          if (_r.length >= 2 && _r.length <= 6) return _r
        }
        return ''
      })(String(char.identity || char.background || ''))
      if (_rankTitle && !_hasTitleBadWord(_rankTitle)) _titleSource = _rankTitle
    }
    if (!_titleSource) {
      // ③ aliases 首项（顿号/逗号/斜杠分隔的第一段，剥掉括号注）
      var _aliasHead = normalizeToString(char.aliases || char.alias || char.titles || char.epithet || '')
      _aliasHead = _aliasHead.split(/[、，,;；/]/)[0] || ''
      _aliasHead = _aliasHead.trim().replace(/[（(].*$/, '')
      if (_aliasHead.length >= 2 && _aliasHead.length <= 10 && /^[\u4e00-\u9fa5]+$/.test(_aliasHead) && !_hasTitleBadWord(_aliasHead)) {
        _titleSource = _aliasHead
      }
    }
    if (!_titleSource) {
      // ④ identity 首段：剥「阵营（…）·」前缀后取首个逗号前的身份短语；句子式/说明性开头不作为头衔
      var _idHead = String(char.identity || char.background || '').trim()
      var _idM = _idHead.match(/^(.{1,12}?阵营(?:\s*[（(][^）)]{1,12}[）)])?\s*[·•]?\s*)?(.*)$/)
      var _idRest = (_idM && _idM[2]) ? _idM[2] : _idHead
      _idRest = _idRest.split(/[，,。；;]/)[0] || ''
      _idRest = _idRest.trim().replace(/^[-—–\s]+/, '').replace(/[（(].*$/, '').replace(/^[，,。\s]+/, '')
      if (_idRest.length >= 2 && _idRest.length <= 12 && /^[\u4e00-\u9fa5]+$/.test(_idRest) && !_hasTitleBadWord(_idRest) && !/[的为是乃与及和或但]/.test(_idRest)) {
        // 去掉常见朝代/政权前缀（南明永历帝 → 永历帝），保留其余
        _idRest = _idRest.replace(/^(南明|大明|满清|清朝|后金|大西|大顺|大周|大楚|大秦|大唐|大宋|大汉|北宋|南宋|西晋|东晋|北魏|西魏|东魏|北齐|北周|南朝|北朝)/, '')
        if (_idRest.length >= 2) _titleSource = _idRest
      }
    }
    return {
      id: (char as any).id || 'char-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name: name || '',
      age: age,
      gender: gender,
      // 🔥 关键修复：优先使用position字段作为角色定位
      role: _finalRole,
      // 🔥 2026-09-03 任务②：真实身份头衔（左上角徽章文案），与 role/角色定位解耦
      title: _titleSource || '',
      // 🔥 阶段4 P2：rolePosition双写（与role保持一致）
      rolePosition: rolePositionValue || _finalRole,
      // 🔥 2026-09-02 修复（图2）：阵营字段（徽章专用，与角色定位下拉解耦）
      camp: _campValue || '',
      // 🔥 2026-09-02 修复（图2 · 二轮）：剧情职能（角色定位下拉展示用）
      job: _jobValue || '',
      identity: fallbackIdentity,
      appearance: fallbackAppearance,
      personality: fallbackPersonality,
      // 🔥 新增：性格成因（参考巫颂：太弈因隐巫殿环境变得心理变态）
      personalityOrigin: personalityOrigin || '',
      background: fallbackBackground,
      motivation: fallbackMotivation,
      // 🔥 新增：核心目标（区别于动机）
      goal: goal || '',
      coreMotivation: coreMotivation || motivation || (char as any).goal || (char as any).motive || (char as any).reasonField || (char as any).drive || '',
      skills: fallbackSkills,
      // 🔥 阶段4 P2：coreSkills双写（与skills保持一致）
      coreSkills: coreSkillsValue.length > 0 ? coreSkillsValue : fallbackSkills,
      hiddenTraits: typeof safe.hiddenTraits === 'string' ? (safe.hiddenTraits || fallbackHiddenTraits) : fallbackHiddenTraits,
      weaknesses: typeof safe.weaknesses === 'string' ? (safe.weaknesses || fallbackWeaknesses) : fallbackWeaknesses,
      growthArc: typeof safe.growthArc === 'string' ? (safe.growthArc || fallbackGrowthArc) : fallbackGrowthArc,
      // 🔥 新增深度字段（参考巫颂/完美世界角色设计标准）
      faction: faction || '',
      mentor: mentor || '',
      speechHabit: speechHabit || '',
      catchphrase: catchphrase || '',
      quirks: quirks || '',
      relationToProtagonist: relationToProtagonist || '',
      // 🔥 阶段4 P2：进阶字段透传（11个字段）
      growthBackground: growthBackground || '',
      psychologicalTrauma: psychologicalTrauma || '',
      moralBottomLine: moralBottomLine || '',
      decisionPattern: decisionPattern || '',
      signatureItem: signatureItem || '',
      themeColor: themeColor || '',
      values: values || '',
      // 🔥 优化问题4：参考《吞噬星空》百度百科人物介绍，增加7个结构化字段
      aliases: cleanJsonLeakField(normalizeToString(char.aliases || char.alias || char.titles || char.epithet || '')),
      birthplace: cleanJsonLeakField(normalizeToString(char.birthplace || char.origin || char.birthPlace || char.hometown || '')),
      realmLevel: cleanJsonLeakField(normalizeToString(char.realmLevel || char.cultivationLevel || char.realm || char.level || '')),
      weapons: cleanJsonLeakField(normalizeToString(char.weapons || char.weapon || char.arms || '')),
      techniques: cleanJsonLeakField(normalizeToString(char.techniques || char.technique || char.cultivationMethod || char.secrets || '')),
      experience: cleanJsonLeakField(normalizeToString(char.experience || char.majorEvents || char.lifeEvents || char.storyArc || '')),
      socialNetwork: cleanJsonLeakField(normalizeToString(char.socialNetwork || char.relationships || char.relations || char.interpersonal || '')),
      // 🔥 阶段4 P2：矛盾点/反差感 + 弧光节点列表字段透传
      contradiction: cleanJsonLeakField(normalizeToString(char.contradiction || char.paradox || char.dualTrait || '')),
      arcNodes: (function () {
        var _rawNodes: any[] = Array.isArray(char.arcNodes) ? char.arcNodes : []
        var _out: any[] = []
        if (!_rawNodes.length) {
          // 🔥 2026-09-03：LLM 未给弧光节点时，回退到「人物弧光/经历」确定性推导的 5 节点，杜绝空列表
          var _fb = Array.isArray(_arcSource) && _arcSource.length ? _arcSource : []
          _out = _fb.map(function(n: any) {
            return {
              stage: normalizeToString(n && n.stage || '起步'),
              event: normalizeToString(n && n.event || ''),
              change: normalizeToString(n && n.change || ''),
              powerLevel: normalizeToString(n && n.powerLevel || ''),
            }
          })
        } else {
          // 🔥 Bug3 修复：LLM 常给主角/女主「空 stage + 空 event + 模板 change」的节点，
          //   此处用素材派生的真实节点按序补全，保证 stage/event/change 均非空、非模板句。
          var _templateRe = /在此阶段完成从处境到心境的双重转变/
          _out = _rawNodes.map(function(n: any, i: number) {
            var _derived: any = (_arcSource && _arcSource[i]) || (_arcSource && _arcSource[_arcSource.length - 1]) || {}
            var _st = normalizeToString(n && n.stage || '')
            var _ev = normalizeToString(n && n.event || '')
            var _ch = normalizeToString(n && n.change || '')
            if (!_st && !_ev) { _st = normalizeToString(_derived.stage || ''); _ev = normalizeToString(_derived.event || '') }
            if (!_ch || _templateRe.test(_ch)) _ch = normalizeToString(_derived.change || '')
            return {
              stage: _st,
              event: _ev,
              change: _ch,
              powerLevel: normalizeToString(n && n.powerLevel || n && n.power || ''),
            }
          })
        }
        // 🔥 2026-09-08 #165：统一守卫——change 空或与 event 同文 → 按阶段重建，杜绝两栏一样
        _out = _out.map(function(n: any) {
          if (!n.change || n.change === n.event) n.change = _stageChangeFallback(n.stage, name)
          return n
        })
        return _out.filter(function(n: any) { return n.stage || n.event || n.change || n.powerLevel })
      })(),
      stats: stats,
      attributes: stats,
    }
  }

  var FORBIDDEN_ROLES = ['protagonist', 'femaleLead', '主角', '核心主角', '主人公', '女主角']
  function isForbiddenRoleForSupporting(role: any): boolean {
    if (!role || typeof role !== 'string') return true
    for (var i = 0; i < FORBIDDEN_ROLES.length; i++) {
      if (role === FORBIDDEN_ROLES[i]) return true
    }
    // 只禁止主角/女主在配角区域出现（因为有独立卡片），反派允许出现（多反派红色卡片）
    if (/^(核心)?(主角|主人公|女主角)(\d*)$/.test(role)) return true
    if (/^(主角)(\d*)$/.test(role)) return true
    return false
  }

  var protagonist = normalizeChar(data.protagonist, 'protagonist', _titleOverride)
  // 🔥 2026-09-05：题材感知——供女主合成挑选贴题的身份/造型/说话风格
  var _genreHint = '历史'
  var _ctxTextForGenre = String(detailedDesignInput || '') + ' ' + String(data && (data._genre || data.genre || '')) + ' ' + String(protagonist && (protagonist.background || protagonist.identity || '') || '')
  if (/修仙|修真|仙侠|洪荒|凡人流|灵根/.test(_ctxTextForGenre)) _genreHint = '修仙'
  else if (/末日|末世|丧尸|废土|废土/.test(_ctxTextForGenre)) _genreHint = '末世'
  else if (/古代|架空|历史|权谋|朝堂|王朝|皇帝|明|清|唐|宋|汉|三国|南明|穿越回/.test(_ctxTextForGenre)) _genreHint = '历史'
  var femaleLead = normalizeChar(data.femaleLead, 'femaleLead', _titleOverride)
  var antagonists = Array.isArray(data.antagonists) ? data.antagonists : (data.antagonist ? [data.antagonist] : [])
  var finalAntagonist = antagonists.length > 0 ? normalizeChar(antagonists[0], 'antagonist', _titleOverride) : normalizeChar(data.antagonist, 'antagonist', _titleOverride)
  var extraAntagonists = antagonists.length > 1 ? antagonists.slice(1).map(function (c: any) {
    var char = normalizeChar(c, 'supporting', _titleOverride)
    // 保留反派角色标签，不被isForbiddenRoleForSupporting过滤掉
    char.role = '反派'
    return char
  }) : []
  var supporting = Array.isArray(data.supporting) ? data.supporting.map(function (c: any) { 
    var char = normalizeChar(c, 'supporting', _titleOverride)
    if (char && isForbiddenRoleForSupporting(char.role)) { char.role = 'supporting' }
    return char
  }) : []
  // 🔥 2026-09-06 配角去重 + 空名槽清理：LLM 会把同一反派反复塞进 supporting 十余次（本作多铎/多尔衮/丁魁楚 ×13），
  //   并残留若干空姓名槽位 → 渲染出成片重复/空白卡片。此处按姓名保留首次出现，剔除空名与重复项，保证列表干净充实。
  {
    var _seenS: Record<string, boolean> = {}
    var _dedupSupporting: any[] = []
    for (var _si = 0; _si < supporting.length; _si++) {
      var _c = supporting[_si]
      var _nm = _c && normalizeToString(_c.name)
      if (!_nm || _nm.length < 2) continue
      if (_seenS[_nm]) continue
      _seenS[_nm] = true
      _dedupSupporting.push(_c)
    }
    supporting = _dedupSupporting
  }
  
  // 🔥 2026-09-02 修复（图1/3/4 · 前端最终防线）：女主槽位姓名/性别合法性守卫。
  //   复现实锤：线上复测中 LLM 把降清将领「李成栋」生成为女主（并标注 gender=女）→ 女主卡片整个污染。
  //   后端已加固「姓名黑名单优先于模型性别标注」，前端再兜一层，杜绝脏数据落到 UI。
  var _FL_MALE_NAME_BLACKLIST = ['李成栋','郑成功','李定国','瞿式耜','何腾蛟','堵胤锡','史可法','马士英','阮大铖','左良玉','高杰','刘泽清','黄得功','孙可望','多铎','孔有德','吴三桂','洪承畴','张献忠','李自成','鳌拜','济尔哈朗','豪格','皇太极','努尔哈赤','多尔衮','尚可喜','施琅','郑芝龙','钱谦益','黄道周','朱由榔','沐天波','焦琏','王得仁','金声桓','耿仲明','祖大寿','范文程','张煌言','陈邦彦','王夫之','李来亨','刘文秀','白文选','刘承胤','马吉翔','庞天寿']
  var _FL_ELDER_NAME_PATTERN = /太后|皇后|皇妃|太妃|王妃|夫人|祖母|母亲|阿嬷|婆婆|姑母|姨母|乳母/
  function _isValidFemaleLead(c: any): boolean {
    if (!c) return false
    var _n = normalizeToString(c.name)
    if (!_n || _n.length < 2) return false
    for (var _i = 0; _i < _FL_MALE_NAME_BLACKLIST.length; _i++) {
      if (_n.indexOf(_FL_MALE_NAME_BLACKLIST[_i]) >= 0) return false
    }
    var _g = normalizeToString(c.gender)
    if (_g === '男' || _g === 'male' || _g === 'm') return false
    return true
  }
  // 女主不合法时，从候选池里挑一位合法女性顶上（排除长辈称谓，避免「王太后」被扶正为女主）
  function _pickFemaleLeadFromPool(cands: any[]): any {
    if (!Array.isArray(cands)) return null
    for (var _i = 0; _i < cands.length; _i++) {
      var _c = cands[_i]
      if (!_isValidFemaleLead(_c)) continue
      if (_FL_ELDER_NAME_PATTERN.test(normalizeToString(_c.name))) continue
      return _c
    }
    return null
  }
  if (femaleLead && !_isValidFemaleLead(femaleLead)) {
    console.log('[normalizeCharactersData] 女主「' + (femaleLead.name || '') + '」不合法（男性历史人物/性别男），降级为配角')
    femaleLead.role = '配角'
    supporting.push(femaleLead)
    femaleLead = null as any
  }
  if (!femaleLead) {
    var _altFL = _pickFemaleLeadFromPool(
      (Array.isArray(data.femaleLeads) ? data.femaleLeads : []).concat(supporting)
    )
    if (_altFL) {
      femaleLead = normalizeChar(_altFL, 'femaleLead', _titleOverride)
      console.log('[normalizeCharactersData] 从候选池扶正女主: ' + femaleLead.name)
    }
  }
  // 🔥 2026-09-05 最终防线：仍无女主或女主核心字段为空时，确定性合成一位贴题女主（单女主设定必非空）
  if (!femaleLead || !_hasMeaningfulContent(femaleLead)) {
    femaleLead = synthesizeFemaleLead(protagonist, _genreHint)
    console.log('[normalizeCharactersData] 合成女主: ' + femaleLead.name)
  }

  // 🔥 2026-09-02 修复（Bug A）：单女主模式下，过滤空的女主N卡片；判断是否"有内容"
  function _hasMeaningfulContent(c: any): boolean {
    if (!c) return false
    var _n = normalizeToString(c.name)
    if (_n && _n.length >= 2) return true
    // 任一非空核心字段也视为有内容
    var _fields = ['identity', 'appearance', 'personality', 'background', 'motivation', 'coreMotivation']
    for (var i = 0; i < _fields.length; i++) {
      var _v = normalizeToString(c[_fields[i]])
      if (_v && _v.length >= 4) return true
    }
    return false
  }

  // 🔥 2026-09-02 修复（Bug B）：剥离 LLM 在 identity 开头注入的角色标签前缀（如"永历特首（主角阵营）忠臣文官，"）。
  // 触发条件：开头为 1-3 个短角色标签（≤8字，可带"（阵营）"）以逗号分隔的紧凑序列，且总前缀长度≤30字。
  function _stripIdentityRolePrefix(identity: string): string {
    if (!identity) return identity
    // 🔥 #177 修订：tag 名长度收紧为 2-6 字（原 2-8 会把「权臣或敌国君主，与主角争夺天下，」这类
    //   7 字叙述短句误判为角色标签整段剥掉，实测《上古巫神》反派姬昌身份被截去前半）。
    //   匹配开头 1-3 个 role tag 序列：tag1（可选阵营），tag2，tag3，
    var _m = identity.match(/^((?:[\u4e00-\u9fa5]{2,6}(?:\uFF08[^\uFF09]{2,8}\uFF09)?)(?:[\uFF0C,][\u4e00-\u9fa5]{2,6}(?:\uFF08[^\uFF09]{2,8}\uFF09)?){0,2}[\uFF0C,])/)
    if (_m && _m[1].length <= 30) {
      var _stripped = identity.substring(_m[1].length).trim()
      // 剥离后不能太短（避免误删），至少 10 字
      if (_stripped.length >= 10) return _stripped
    }
    return identity
  }

  // 🔥 后宫模式：处理多个女主（femaleLeads），第一女主作为femaleLead，其余追加到配角列表
  var extraFemaleLeads: any[] = []
  var finalFemaleLeads: any[] = []  // 🔥 保留所有女主（含完整信息）供关系图谱使用
  // 🔥 2026-09-02 修复（Bug A）：若第一张 femaleLead 卡本身是空的，但 femaleLeads[0] 有内容，则用 femaleLeads[0] 顶上
  if ((!femaleLead || !_hasMeaningfulContent(femaleLead)) &&
      Array.isArray(data.femaleLeads) && data.femaleLeads.length > 0 && _hasMeaningfulContent(data.femaleLeads[0])) {
    femaleLead = normalizeChar(data.femaleLeads[0], 'femaleLead', _titleOverride)
    console.log('[normalizeCharactersData] 第一张 femaleLead 卡为空，用 femaleLeads[0] 顶上')
  }
  if (Array.isArray(data.femaleLeads) && data.femaleLeads.length > 0) {
    for (var flIdx = 0; flIdx < data.femaleLeads.length; flIdx++) {
      var _flRaw = data.femaleLeads[flIdx]
      // 🔥 Bug A 修复：跳过完全空对象（防止单女主模式出现空"女主2/女主3"卡片）
      if (!_hasMeaningfulContent(_flRaw)) {
        console.log('[normalizeCharactersData] 跳过空的 femaleLeads[' + flIdx + ']')
        continue
      }
      var _fl = normalizeChar(_flRaw, 'femaleLead', _titleOverride)
      _fl.role = '女主' + (flIdx + 1)
      finalFemaleLeads.push(_fl)
      if (flIdx === 0) {
        // 第一女主作为 femaleLead 保留（已被上面顶上逻辑处理过）
      } else {
        extraFemaleLeads.push(_fl)
      }
    }
    console.log('[normalizeCharactersData] femaleLeads数组: ' + finalFemaleLeads.length + ' 位女主')
  }
  // 🔥 #217b 双女主保留修复：输入 femaleLeads 为空/缺失但 femaleLead 有效时，回填 [femaleLead] 保底。
  //   根因实锤：normalize 原先对无 femaleLeads 输入一律输出 femaleLeads:[]，该 [] 随 saveSettings/
  //   DraftSync autosave/pagehide 整体回写服务端，把数据工程师恢复的双女主（王氏+戴贵人）反复冲掉。
  //   输入为非空数组时上面循环已逐卡 normalize 原样保留（不深改卡片内容）；
  //   femaleLeads[0] 与 femaleLead 同名时天然不重复（本分支仅在数组为空时触发）。
  if (finalFemaleLeads.length === 0 && femaleLead && _hasMeaningfulContent(femaleLead)) {
    finalFemaleLeads.push(femaleLead)
    console.log('[normalizeCharactersData] #217b femaleLeads 为空 → 回填 femaleLead「' + (femaleLead.name || '') + '」保底，防保存链冲掉')
  }
  // 🔥 保留所有反派（含完整信息）供关系图谱使用
  var finalAntagonists: any[] = []
  if (antagonists.length > 0) {
    finalAntagonists = antagonists.map(function(c: any) { return normalizeChar(c, 'antagonist', _titleOverride) })
  } else if (data.antagonist) {
    finalAntagonists = [normalizeChar(data.antagonist, 'antagonist', _titleOverride)]
  }
  
  var finalSupporting = [...extraAntagonists, ...extraFemaleLeads, ...(supporting.length > 0 ? supporting : [
    ...(Array.isArray(data.coreSupporting) ? data.coreSupporting.map(function (c: any) { 
      var char = normalizeChar(c, 'supporting', _titleOverride)
      if (char && isForbiddenRoleForSupporting(char.role)) { char.role = 'supporting' }
      return char
    }) : []),
    ...(Array.isArray(data.importantSupporting) ? data.importantSupporting.map(function (c: any) { 
      var char = normalizeChar(c, 'supporting', _titleOverride)
      if (char && isForbiddenRoleForSupporting(char.role)) { char.role = 'supporting' }
      return char
    }) : []),
  ])]

  function ensureChar(ch: any, _role: string): any {
    return ch || createEmptyCharacter(_role)
  }

  // 🔥 最终防线：检测并修复所有角色背景故事重复的问题
  // 在所有normalizeChar处理完成后，检查background是否重复
  var _allFinalChars: any[] = []
  if (protagonist) _allFinalChars.push(protagonist)
  if (femaleLead) _allFinalChars.push(femaleLead)
  // 🔥 包含所有女主和反派
  for (var _fli = 0; _fli < finalFemaleLeads.length; _fli++) {
    if (finalFemaleLeads[_fli] && finalFemaleLeads[_fli] !== femaleLead) _allFinalChars.push(finalFemaleLeads[_fli])
  }
  if (finalAntagonist) _allFinalChars.push(finalAntagonist)
  for (var _ai = 0; _ai < finalAntagonists.length; _ai++) {
    if (finalAntagonists[_ai] && finalAntagonists[_ai] !== finalAntagonist) _allFinalChars.push(finalAntagonists[_ai])
  }
  for (var _fc = 0; _fc < finalSupporting.length; _fc++) {
    if (finalSupporting[_fc]) _allFinalChars.push(finalSupporting[_fc])
  }
  
  // 统计每个background出现的次数
  var _bgCountMap: Record<string, number[]> = {}
  for (var _bci = 0; _bci < _allFinalChars.length; _bci++) {
    var _fcBg = (_allFinalChars[_bci].background || '').trim()
    if (_fcBg.length > 0) {
      if (!_bgCountMap[_fcBg]) _bgCountMap[_fcBg] = []
      _bgCountMap[_fcBg].push(_bci)
    }
  }
  
  // 找出重复的背景
  // 🔥 修复：不再清空重复background字段，避免触发autoGenFlow中的重新生成导致characters环节二次调用失败
  // 后端已做background清洗，前端清空字段会导致数据丢失并触发不必要的重新生成
  for (var _bgKey in _bgCountMap) {
    var _dupIndices = _bgCountMap[_bgKey]
    if (_dupIndices.length > 1 && _bgKey.length > 100) {
      console.log('[normalizeCharactersData] 检测到重复背景(长度>' + _bgKey.length + '): ' + _dupIndices.length + '个角色，保留数据不清空（后端已清洗）')
    }
  }

  // 🔥 2026-09-02 修复（Bug B）：对主角/女主/反派的 identity 应用角色前缀剥离
  // 剥离 LLM 注入的开头角色标签（如"永历特首（主角阵营）忠臣文官，"）
  if (protagonist && protagonist.identity) {
    protagonist.identity = _stripIdentityRolePrefix(protagonist.identity)
  }
  if (femaleLead && femaleLead.identity) {
    femaleLead.identity = _stripIdentityRolePrefix(femaleLead.identity)
  }
  if (finalAntagonist && finalAntagonist.identity) {
    finalAntagonist.identity = _stripIdentityRolePrefix(finalAntagonist.identity)
  }
  for (var _fli2 = 0; _fli2 < finalFemaleLeads.length; _fli2++) {
    if (finalFemaleLeads[_fli2] && finalFemaleLeads[_fli2].identity) {
      finalFemaleLeads[_fli2].identity = _stripIdentityRolePrefix(finalFemaleLeads[_fli2].identity)
    }
  }
  for (var _ai2 = 0; _ai2 < finalAntagonists.length; _ai2++) {
    if (finalAntagonists[_ai2] && finalAntagonists[_ai2].identity) {
      finalAntagonists[_ai2].identity = _stripIdentityRolePrefix(finalAntagonists[_ai2].identity)
    }
  }
  for (var _fi = 0; _fi < finalSupporting.length; _fi++) {
    if (finalSupporting[_fi] && finalSupporting[_fi].identity) {
      finalSupporting[_fi].identity = _stripIdentityRolePrefix(finalSupporting[_fi].identity)
    }
  }

  // 🔥 2026-09-06 最终防线：角色空值兜底（job/goal/camp/birthplace/realmLevel/arcNodes.powerLevel）。
  //   旧草稿/LLM 输出可能留空这些字段，打开草稿时确定性派生贴题值，保证 UI 永不出现空字段。
  var _genreIsHistory = _genreHint === '历史'
  function _fillCharFallbacks(_c: any): void {
    if (!_c || typeof _c !== 'object') return
    var _nm = normalizeToString(_c.name) || '该角色'
    var _rl = normalizeToString(_c.role || _c.rolePosition || '')
    var _isZj = _rl.indexOf('主角') !== -1
    var _isNz = _rl.indexOf('女主') !== -1
    var _isFp = _rl.indexOf('反派') !== -1
    var _isMy = _rl.indexOf('盟') !== -1
    var _ctx = String(_c.identity || _c.background || _c.motivation || '')
    if (!normalizeToString(_c.job)) {
      // 🔥 #178b 去永历化：job 兜底不写死明朝/永历/清廷，统一贴合本作
      if (/皇帝|监国|称帝|天子|帝王/.test(_ctx)) _c.job = _genreIsHistory ? '王朝帝王' : '当世至尊'
      else if (/妃|皇后|太后|公主/.test(_ctx)) _c.job = '后宫眷属'
      else if (/总督|巡抚|尚书|大学士|总兵|参将|副将|都督|锦衣|知府|知县|参政|布政/.test(_ctx)) _c.job = String(_ctx).replace(/[。，、].*$/, '').slice(0, 20)
      else if (_isFp) _c.job = '对立阵营权臣'
      else if (_isZj) _c.job = _genreIsHistory ? '本作核心人物' : '本作核心人物'
      else _c.job = _genreIsHistory ? '朝臣武弁' : '本作重要角色'
    }
    if (!normalizeToString(_c.goal)) {
      if (_isFp) _c.goal = '倾轧忠良、把持朝纲，处心积虑打压主角势力'
      else if (_isNz) _c.goal = '辅佐主角共渡时艰，同心同德成就大业'
      else if (_isZj) _c.goal = _genreIsHistory ? '统合各方力量，廓清寰宇，开创盛世' : '统合各方力量，成就一番伟业，登临绝巅'
      else if (/总督|巡抚|总兵|参将|副将|都督|提督|大将|将军/.test(_ctx)) _c.goal = '整军经武、廓清贼氛，为大局开疆固本'
      else if (/尚书|大学士|侍郎|参政|布政|知府|知县/.test(_ctx)) _c.goal = '辅弼朝纲、肃清党争，助大局归于清明'
      else _c.goal = _genreIsHistory ? '于乱世中为大业贡献力量，求取功名前程' : '于风云际会中建功立业，不负平生所学'
    }
    if (!normalizeToString(_c.camp)) {
      if (/清军|清廷|清朝|满清/.test(_ctx)) _c.camp = '敌对阵营（与主角对立）'
      else if (/永历|南明|明朝|明室/.test(_ctx)) _c.camp = '主角阵营'
      else if (_isFp) _c.camp = '敌对阵营（反派）'
      else if (_isMy) _c.camp = '主角阵营·盟友'
      else if (_isZj || _isNz) _c.camp = '主角阵营·核心'
      else _c.camp = '主角阵营'
    }
    if (!normalizeToString(_c.birthplace)) {
      // 🔥 #178b 去永历化：出生地兜底不再写死桂林/桂王府/大明
      _c.birthplace = _isZj ? '本作都城' : (_genreIsHistory ? '本作疆土' : '出生之地')
    }
    if (!normalizeToString(_c.realmLevel)) {
      _c.realmLevel = _isFp ? '权倾一方之枭雄' : (_isNz ? '深居内闱之女眷' : (_isZj ? '权倾朝野之帝王（超品）' : (_isMy ? '一方将帅重臣' : '一方家臣将佐')))
    }
    if (Array.isArray(_c.arcNodes)) {
      for (var _fcA = 0; _fcA < _c.arcNodes.length; _fcA++) {
        var _fcN = _c.arcNodes[_fcA]
        if (_fcN && !normalizeToString(_fcN.powerLevel)) {
          var _st = normalizeToString(_fcN.stage || _fcN.phase || '')
          if (/巅峰|超脱|结局|最终/.test(_st)) _fcN.powerLevel = _isFp ? '实力臻于化境，足与主角终极对决' : '已臻此界顶点，无人能及'
          else if (/起步|初生/.test(_st)) _fcN.powerLevel = _isFp ? '初具锋芒，尚存忌惮' : '白身微末，蓄势待发'
          else _fcN.powerLevel = _isFp ? '权谋实力随剧情攀升' : '随剧情推进稳步精进'
        }
      }
    }
  }
  if (protagonist) _fillCharFallbacks(protagonist)
  if (femaleLead) _fillCharFallbacks(femaleLead)
  for (var _flf = 0; _flf < finalFemaleLeads.length; _flf++) _fillCharFallbacks(finalFemaleLeads[_flf])
  if (finalAntagonist) _fillCharFallbacks(finalAntagonist)
  for (var _af = 0; _af < finalAntagonists.length; _af++) _fillCharFallbacks(finalAntagonists[_af])
  for (var _sf = 0; _sf < finalSupporting.length; _sf++) _fillCharFallbacks(finalSupporting[_sf])

  // 🔥 2026-09-02 第五轮复测（截图5 · Bug C）：LLM 输出 contradiction 字段截断（"每逢阴"无标点即终止）
  //   检测：末字为常见中文名词/虚词尾且无 。！？!? 等终止标点 → 视为截断。
  //   修复：回退到最近一个标点（，、；：。）处截断，杜绝 UI 显示「每逢阴」「每次想起」这种吊胃口残句。
  // 🔥 2026-09-03 修复：原 length>=10 门槛过严 ——「表面外柔内刚，实则…半卷《济世医典」这类 6 字前缀的短截断
  //   会被拒绝修复、残句照常上 UI（线上女主卡实测复现）。放宽为 >=3：回退点前至少保留 3 个汉字即算有效句。
  function _repairTruncation(s: string): string {
    if (!s) return s
    var _s = String(s).trim()
    if (!_s) return s
    // 已完整（终止于标点）直接返回
    if (/[。！？!?\n…]$/.test(_s)) return s
    // 末位明显是未完成（如单字"阴"作为名词收尾、动词收尾），回退到最后标点
    var _TAIL_TRUNCATED = /[阴阳邪阵之下大中日有在是从以到来去吧回又亦犹尚将应能]/
    var _lastChar = _s.charAt(_s.length - 1)
    if (!_TAIL_TRUNCATED.test(_lastChar)) {
      // 末位是数字/字母/常见标点外字符的也算截断
      if (!/[，。、；：！？.!?,""'']$/.test(_s)) {
        // 进入回退
      } else {
        return s
      }
    }
    // 找最后一个标点（，、；：。！？\n），截到那里
    var _m = _s.match(/^(.*)[，、；：。！？\n]/)
    if (_m && _m[1] && _m[1].trim().length >= 3) {
      return _m[1].trim() + '。'
    }
    // 没有合适标点（如全文无标点），保留原样但追加省略号
    return s
  }

  // 🔥 第五轮复测：对所有角色 contradiction 字段做截断修复
  var _repairContradiction = function (c: any) {
    if (!c || !c.contradiction) return
    var _before = c.contradiction
    var _after = _repairTruncation(_before)
    if (_after !== _before) {
      console.log('[normalizeCharactersData] contradiction 截断修复: ' +
        _before.substring(Math.max(0, _before.length - 12)) +
        ' → ' + _after.substring(Math.max(0, _after.length - 12)))
      c.contradiction = _after
    }
  }
  if (protagonist) _repairContradiction(protagonist)
  if (femaleLead) _repairContradiction(femaleLead)
  if (finalAntagonist) _repairContradiction(finalAntagonist)
  for (var _rc1 = 0; _rc1 < finalFemaleLeads.length; _rc1++) {
    _repairContradiction(finalFemaleLeads[_rc1])
  }
  for (var _rc2 = 0; _rc2 < finalAntagonists.length; _rc2++) {
    _repairContradiction(finalAntagonists[_rc2])
  }
  for (var _rc3 = 0; _rc3 < finalSupporting.length; _rc3++) {
    _repairContradiction(finalSupporting[_rc3])
  }

  // 🔥 2026-09-06 任务2：全局跨数组去重，杜绝同一角色在「反派/配角」重复渲染成多张卡片，
  //   从而避免进阶设定 Tab 显示与当前角色不符（React 同名 key 复用导致内容错位）。
  //   规则：以「反派 + 主角 + 女主」名单为权威，配角中重复出现的同名一律剔除；各数组内部也按首次出现去重。
  {
    var _antiNames: Record<string, boolean> = {}
    var _pushName = function (_c: any) {
      var _nm = _c && normalizeToString(_c.name)
      if (_nm && _nm.length >= 2) _antiNames[_nm] = true
    }
    if (protagonist) _pushName(protagonist)
    if (femaleLead) _pushName(femaleLead)
    for (var _ga = 0; _ga < finalAntagonists.length; _ga++) _pushName(finalAntagonists[_ga])
    // 先对反派内部去重
    var _dedupAnti: any[] = []
    var _seenAnti: Record<string, boolean> = {}
    for (var _ga2 = 0; _ga2 < finalAntagonists.length; _ga2++) {
      var _nmA = finalAntagonists[_ga2] && normalizeToString(finalAntagonists[_ga2].name)
      if (!_nmA || _nmA.length < 2 || _seenAnti[_nmA]) continue
      _seenAnti[_nmA] = true
      _dedupAnti.push(finalAntagonists[_ga2])
    }
    finalAntagonists = _dedupAnti
    // 配角内部去重 + 与反派/主角/女主同名剔除
    var _dedupSup: any[] = []
    var _seenSup: Record<string, boolean> = {}
    for (var _gs = 0; _gs < finalSupporting.length; _gs++) {
      var _nmS = finalSupporting[_gs] && normalizeToString(finalSupporting[_gs].name)
      if (!_nmS || _nmS.length < 2 || _seenSup[_nmS] || _antiNames[_nmS]) continue
      _seenSup[_nmS] = true
      _dedupSup.push(finalSupporting[_gs])
    }
    finalSupporting = _dedupSup
  }

  // 🔥 2026-09-10：主角外貌-年龄一致性清洗（同步后端修复，覆盖已加载/草稿数据的旧污染）。
  //   历史/现实向题材年轻主角（≤30）被写成白发老者、手执法杖时，替换为年龄相符的年轻外貌。
  if (normalizeToString(protagonist && protagonist.name)) {
    var _pN = protagonist || {}
    var _pA = parseInt(String(_pN.age || 0), 10)
    var _pApp = normalizeToString(_pN.appearance)
    var _oldMark = /须发皆白|白发苍苍|鹤发|白须|银发苍苍|古稀|花甲|满脸皱纹|皱纹纵横|拄|法杖|拂尘|仙风道骨|道骨仙风|鹤发童颜|慈眉善目|年迈|老者|老朽|苍老/
    if (_pA > 0 && _pA <= 30 && _pApp && _oldMark.test(_pApp)) {
      protagonist.appearance = '身形清瘦挺拔，年方' + _pA + '岁，面容清俊、肤色微带风霜，束发于顶。虽经国变流亡、朝堂倾轧之苦，眉宇间却不失这个年纪的英气与坚毅，目光沉静，气度稳重，全然不似同年浮华少年。'
      console.log('[normalizeCharactersData] 🔥 主角外貌与年龄冲突(' + _pA + '岁)已修正为年轻外貌')
    } else if (_pApp && _oldMark.test(_pApp)) {
      protagonist.appearance = _pApp
        .replace(/手[持执]?(古朴)?法杖/g, '手扶佩剑')
        .replace(/手持长剑/g, '腰悬长剑')
        .replace(/拂尘/g, '折扇')
        .replace(/仙风道骨/g, '气度威严')
        .replace(/道骨仙风/g, '气度威严')
    }
  }

  // 🔥 2026-11-06 修复：删除「朱由榔/永历帝」南明硬编码模板注入。
  //   该模板会把其它题材（都市/玄幻等）草稿的主角污染成明末皇帝，属于错误兜底。
  //   现在仅做安全的角色标签补齐：主角核心字段缺失时保持原样（由用户编辑或重新生成补齐），绝不注入他书人物。
  if (protagonist) {
    if (!normalizeToString(protagonist.rolePotential || protagonist.role)) protagonist.role = '主角'
    if (!normalizeToString(protagonist.rolePosition)) protagonist.rolePosition = '主角'
  }

  return {
    protagonist: ensureChar(protagonist, 'protagonist'),
    femaleLead: ensureChar(femaleLead, 'femaleLead'),
    femaleLeads: finalFemaleLeads,
    antagonist: ensureChar(finalAntagonist, 'antagonist'),
    antagonists: finalAntagonists,
    supporting: finalSupporting,
    _harem: data._harem || null,
  }
}

function normalizeRelationshipsData(data: any): any {
  console.log('[normalizeRelationshipsData] Input type:', typeof data, 'isArray:', Array.isArray(data))
  if (!data) return { relationships: [] }
  var rawArr: any[] = []
  if (Array.isArray(data)) rawArr = data
  else if (typeof data === 'object' && Array.isArray(data.relationships)) rawArr = data.relationships
  else return { relationships: [] }
  console.log('[normalizeRelationshipsData] rawArr length:', rawArr.length, ', first item:', rawArr[0] ? JSON.stringify(rawArr[0]).substring(0, 200) : 'empty')
  var _roleLabelPattern = /^(主角|女主|反派|配角|龙套|NPC|路人甲|路人乙|反派首领|反派头目|反派boss|反派老大|反派一号|反派二号|反派三号|男角色|女角色|男配角|女配角|男路人|女路人|男反派|女反派|反派角色|反派人物|男NPC|女NPC|男性NPC|女性NPC|男性角色|女性角色|男性配角|女性配角|男性路人|女性路人|男性反派|女性反派|男主角|女主角|神秘人|神秘男子|神秘女子|神秘老者|神秘少年|神秘高手|无名氏|角色[ABCDEFGHIJ]|人物[ABCDEFGHIJ]|配角[ABCDEFGHIJ]|配角[一二三四五六七八九十]|龙套[ABCDEFGHIJ]|龙套[一二三四五六七八九十]|反派[ABCDEFGHIJ]|反派[一二三四五六七八九十]|路人[1234567890]|NPC[1234567890]|女主[一二三四五六七八九十]|女[一二三四五六七八九十]|男[一二三四五六七八九十]|角色[1234567890]|人物[1234567890]|配角[1234567890]|龙套[1234567890]|反派[1234567890]|最终BOSS|最终反派|终极反派|幕后黑手|隐藏boss|邪恶势力|黑暗势力|敌对势力|反派势力|反派阵营)$/i
  // 🔥 2026-09-02 修复（图8）：LLM 自由文本关系类型（挚友/兄、死敌、血羁绊、联盟共享等）→ UI 下拉枚举归一，
  //   枚举清单与 StepRelationships 关系类型下拉完全一致，杜绝下拉匹配不上显示空白/错误。
  var _REL_TYPE_CANON = ['盟友','敌对','师徒','朋友','对手','亲属','君臣','上下级','主仆','从属','同乡','同僚','恋人','仇敌','宿敌','情敌','故交','同门','同族','恩人','宿怨','合作','利用','仰慕','暗恋','青梅竹马','生死之交','莫逆之交','血海深仇','势不两立','道侣','未婚夫妻','契约关系','追随','信仰']
  var _mapRelType = function (_t: string): string {
    var _s = String(_t || '').trim()
    if (!_s) return ''
    if (_REL_TYPE_CANON.indexOf(_s) !== -1) return _s
    if (/兄妹|兄弟|姐妹|姐弟|血亲|血羁绊|父子|母女|父女|母子|亲属|亲人|家人|血缘/.test(_s)) return '亲属'
    if (/皇后|王妃|夫妻|配偶|丈夫|妻子|结发|正室/.test(_s)) return '恋人'
    if (/死敌|血仇|不共戴天/.test(_s)) return '仇敌'
    if (/对立|敌对|反目|为敌|敌视|对抗/.test(_s)) return '敌对'
    if (/挚友|知己|密友|至交|莫逆|生死之交/.test(_s)) return '莫逆之交'
    if (/联盟|同盟|结盟/.test(_s)) return '盟友'
    if (/恋人|情侣|爱人|相爱|恋人未满/.test(_s)) return '恋人'
    if (/师徒|师父|师傅|老师|徒弟/.test(_s)) return '师徒'
    if (/君臣|臣属/.test(_s)) return '君臣'
    if (/上下级|上司|下属|上级|下级/.test(_s)) return '上下级'
    if (/主仆|主从/.test(_s)) return '主仆'
    if (/同僚|共事/.test(_s)) return '同僚'
    if (/好友|友人|朋友/.test(_s)) return '朋友'
    if (/仇|恨/.test(_s)) return '仇敌'
    if (/盟|友/.test(_s)) return '盟友'
    // 🔥 2026-09-02 补充（复测实锤泄漏）：命运共同体/救命之恩/利益纠葛/灵魂伴侣/前世羁绊等
    if (/命运共同体|同生共死|生死与共/.test(_s)) return '生死之交'
    if (/救命之恩|恩情|恩德|报恩/.test(_s)) return '恩人'
    if (/利益纠葛|互相利用|相互利用|各怀心思/.test(_s)) return '利用'
    if (/灵魂伴侣|知心爱人|心心相印/.test(_s)) return '恋人'
    if (/前世|羁绊|宿命|缘分/.test(_s)) return '宿怨'
    if (/伴侣|爱人|情/.test(_s)) return '恋人'
    if (/恩/.test(_s)) return '恩人'
    if (/纠葛|纠缠/.test(_s)) return '利用'
    if (/羁绊|牵绊/.test(_s)) return '盟友'
    if (/亲/.test(_s)) return '亲属'
    if (/兄|姐|妹|弟/.test(_s)) return '亲属'
    if (/师|徒/.test(_s)) return '师徒'
    if (/臣|君|王/.test(_s)) return '君臣'
    // 🔥 2026-09-02 第五轮复测：复合关系类型处理（如「挚友/兄弟」「盟友/对手」「君臣/师徒」）
    //   LLM 自由文本+斜杠（UI 截图标）需切分取首段命中枚举，杜绝"挚友/兄弟"绕过映射后兜底成"盟友"。
    if (/[/／、，]/.test(_s)) {
      var _segs = _s.split(/[/／、，]+/).map(function (x) { return x.trim() }).filter(Boolean)
      for (var _si = 0; _si < _segs.length; _si++) {
        var _seg = _segs[_si]
        if (_REL_TYPE_CANON.indexOf(_seg) !== -1) return _seg
        // 短词的二轮回退（如"挚友"命中莫逆）
        if (/挚友|知己|密友|至交|莫逆/.test(_seg)) return '莫逆之交'
        if (/兄|姐|妹|弟|亲/.test(_seg)) return '亲属'
        if (/师|徒/.test(_seg)) return '师徒'
        if (/君|臣/.test(_seg)) return '君臣'
        if (/恋|爱人|情|夫妻|配偶/.test(_seg)) return '恋人'
        if (/盟友|朋友|友好|战友/.test(_seg)) return '盟友'
        if (/敌|仇|恨|对立/.test(_seg)) return '敌对'
        if (/师徒/.test(_seg)) return '师徒'
        if (/主仆|上下级|同僚|同乡|同门|同族/.test(_seg)) return '盟友'  // 广义"自己人"统归盟友
      }
    }
    // 🔥 最终兜底：仍未命中任何枚举时映射为「盟友」，杜绝 UI 下拉显示空白/错误
    return '盟友'
  }
  // 🔥 2026-09-02 修复（Bug G）：关系字段空值兜底推导
  // 🔥 2026-09-02 二轮修复（图8 · 实锤空值根因）：后端 relationships 步下发的字段为
  //   {from,to,type,description,impactOnPlot,keyEvents,emotionChange,strength,developmentStage}。
  //   旧版归一化 ① 把 keyEvents/emotionChange/strength 直接丢弃；② 无 intensity 数字来源恒为 5；
  //   ③ 无 boundPlotNode 来源且 _deriveRelationshipField 无该分支 → 恒空；
  //   ④ developmentStage 为自由文本时命中率低、退化成「建立」。以下逐项补齐。
  // ── 文本强度 strength（刻骨铭心/深厚/…）→ 1-10 数值
  var _mapStrengthToIntensity = function (_s: string, _t: string): number {
    var _x = String(_s || '')
    if (/刻骨|铭心|至死|生死|血海|不共戴天|势不两立/.test(_x)) return 10
    if (/极深|极强|深厚|稳固|生死与共|莫逆|相守|深爱/.test(_x)) return 8
    if (/较深|较强|紧密|密切|信任|复杂/.test(_x)) return 7
    if (/中等|一般|尚可|平稳/.test(_x)) return 5
    if (/^(浅|淡|疏远|微弱|点头)/.test(_x)) return 3
    if (!_x) {
      if (/仇敌|宿敌|敌对|血海深仇|势不两立/.test(_t)) return 8
      if (/恋人|生死之交|莫逆之交|亲属/.test(_t)) return 9
      return 6
    }
    return 6
  }
  // ── 从 emotionChange 情感链条（陌生→好感→暧昧→确认→深爱→相守）末段判定最终发展阶段
  var _devStageFromEmotion = function (_emo: string): string {
    var _t = String(_emo || '')
    if (!_t) return ''
    var _segs = _t.split(/[→\->>|｜]/).map(function (x: any) { return String(x).trim() }).filter(Boolean)
    var _last = _segs.length ? _segs[_segs.length - 1] : _t
    var _all = _segs.join(' ') + ' ' + _t
    if (/破裂|决裂|断绝|分道|疏远/.test(_last)) return '破裂'
    if (/反目|为敌|敌对|兵戎|交恶/.test(_last)) return '敌对'
    if (/相守|稳定|牢固|坚不可摧|不离不弃|生死相许|同心|相知/.test(_last)) return '稳定'
    if (/转折|转变|剧变|翻转|考验|波折/.test(_last)) return '转折'
    if (/深爱|深|浓|挚|真|确认|升温|信赖/.test(_last)) return '深化'
    if (/好感|暧昧|了解|认识|相处|熟悉/.test(_last)) return '建立'
    if (/陌生|初遇|初识|相识|初见/.test(_last)) return '初识'
    if (/破裂|决裂|断绝/.test(_all)) return '破裂'
    if (/反目|敌对|交恶/.test(_all)) return '敌对'
    if (/稳定|相守/.test(_all)) return '稳定'
    if (/深化|加深/.test(_all)) return '深化'
    return ''
  }
  // ── 绑定剧情节点兜底：keyEvents 取末段（或末两段），其次 impactOnPlot/description 首句
  var _deriveBoundPlotNode = function (_ke: string, _impact: string, _desc: string): string {
    var _src = String(_ke || '').trim()
    if (_src) {
      var _segs = _src.split(/[→\->>|｜]/).map(function (x: any) { return String(x).trim() }).filter(Boolean)
      if (_segs.length > 1) {
        var _tail = _segs[_segs.length - 2] + '→' + _segs[_segs.length - 1]
        return _tail.length > 48 ? _tail.substring(0, 48) : _tail
      }
      if (_segs.length === 1) return _segs[0].length > 40 ? _segs[0].substring(0, 40) : _segs[0]
      return _src.length > 40 ? _src.substring(0, 40) : _src
    }
    var _imp = String(_impact || _desc || '').split(/[。.！!？?\n]/)[0] || ''
    return _imp.length > 40 ? _imp.substring(0, 40) : _imp
  }
  function _deriveRelationshipField(field: string, _relType: string, _desc: string, _intensity: number): string {
    if (!_desc) return ''
    var _d = _desc
    if (field === 'circle') {
      // 🔥 2026-09-02 修复（图8）：推导值必须命中 UI 枚举（核心圈层/主力圈层/外围圈层/宿命圈层）
      var _dt = _d + ' ' + _relType
      if (/宿敌|世仇|宿命|死敌|血海深仇|势不两立/.test(_dt)) return '宿命圈层'
      if (/敌对|仇敌|仇人|敌国|敌将|反贼/.test(_dt)) return '宿命圈层'
      if (/主角|核心|挚友|知己|亲随|心腹|皇后|夫妻|恋人|莫逆/.test(_dt)) return '核心圈层'
      if (/血亲|父子|母子|兄弟|兄妹|姐妹|家族|宗族/.test(_d)) return '核心圈层'
      if (/盟友|战友|同袍|同僚|上下级|将军|统帅|师徒|君臣|主仆|朋友/.test(_dt)) return '主力圈层'
      return '外围圈层'
    }
    if (field === 'conflictType') {
      // 🔥 2026-09-02 修复（图8）：推导值必须命中 UI 枚举（固定矛盾/动态矛盾/隐性矛盾/无矛盾）
      if (/暗藏|暗中|表面|隐忍|潜伏|心怀|暗流|提防/.test(_d)) return '隐性矛盾'
      if (/信任危机|猜忌|怀疑|误解|误会|分歧|摇摆|试探/.test(_d)) return '动态矛盾'
      if (/背叛|血仇|仇恨|恩怨|争夺|夺嫡|权位|敌对|冲突|矛盾|对立|旧怨|嫌隙|利益/.test(_d)) return '固定矛盾'
      return '动态矛盾'
    }
    if (field === 'developmentStage') {
      // 🔥 2026-09-02 修复（图8）：发展阶段兜底推导（初识/建立/深化/转折/稳定/破裂/敌对）
      if (/初识|初遇|相识|初见|新识/.test(_d)) return '初识'
      if (/破裂|决裂|疏远|断绝|分道/.test(_d)) return '破裂'
      if (/反目|为敌|敌对|兵戎|交恶/.test(_d)) return '敌对'
      if (/转折|转变|剧变|翻转|变化/.test(_d)) return '转折'
      if (/深化|加深|升温|愈加|愈发|更加|日益/.test(_d)) return '深化'
      if (/稳定|牢固|坚不可摧|深厚|坚实/.test(_d)) return '稳定'
      return '建立'
    }
    if (field === 'triggerCondition') {
      // 取描述首句（不超过40字）🔥 2026-09-02：超长句在标点处截断，不拦腰切
      var _first = _d.split(/[。.！!？?\n]/)[0] || _d.substring(0, 40)
      if (_first.length > 40) {
        var _cut = _first.substring(0, 40)
        for (var _ti = _cut.length - 1; _ti >= 24; _ti--) {
          if (/[，、；]/.test(_cut[_ti])) { _cut = _cut.substring(0, _ti); break }
        }
        _first = _cut
      }
      return _first
    }
    if (field === 'asymmetry') {
      // 根据强度推一个默认方向
      if (_intensity >= 8) return '双方均高度在意此关系'
      if (_intensity >= 5) return '一方主动，一方回应'
      return '一方主导，另一方保持距离'
    }
    return ''
  }
  var normalizedRels = rawArr.map(function(r: any) {
    if (!r || typeof r !== 'object') return null
    var _relType = _mapRelType(r.relationshipType || r.relationship || r.relation || r.type || '')
    var from = r.personA || r.from || r.source || r.characterA || ''
    var to = r.personB || r.to || r.target || r.characterB || ''
    if (_roleLabelPattern.test(from)) from = ''
    if (_roleLabelPattern.test(to)) to = ''
    if (!from || !to || !_relType) return null
    var _desc = normalizeToString(r.description || r.desc || r.detail || r.development || '')
    var _impactVal = normalizeToString(r.impactOnPlot || r.impact || r.plotImpact || '')
    var _keyEventsVal = normalizeToString(r.keyEvents || r.keyMoments || '')
    var _emotionVal = normalizeToString(r.emotionChange || r.evolutionCurve || '')
    var _strengthVal = normalizeToString(r.strength || r.intensityText || r.level || '')
    // 🔥 2026-09-02 二轮修复（图8）：后端下发的是文本 strength，不是数字 intensity
    var _intensityNum = typeof r.intensity === 'number' ? r.intensity : (parseInt(r.intensity) || 0)
    if (!_intensityNum || _intensityNum < 1 || _intensityNum > 10) {
      _intensityNum = _mapStrengthToIntensity(_strengthVal, _relType)
    }
    var _circleVal = normalizeToString(r.circle || r.layer || '')
    var _conflictVal = normalizeToString(r.conflictType || r.conflict || '')
    var _triggerVal = normalizeToString(r.triggerCondition || r.trigger || '')
    var _asymmetryVal = normalizeToString(r.asymmetry || r.emotionDiff || '')
    // 🔥 2026-09-02 修复（Bug G）：空字段从 description 兜底推导
    if (!_circleVal) _circleVal = _deriveRelationshipField('circle', _relType, _desc, _intensityNum)
    if (!_conflictVal) _conflictVal = _deriveRelationshipField('conflictType', _relType, _desc, _intensityNum)
    if (!_triggerVal) _triggerVal = _deriveRelationshipField('triggerCondition', _relType, _desc, _intensityNum)
    // 🔥 2026-09-02 二轮修复（图8）：描述为空时，用 keyEvents 首节点兜底触发条件
    if (!_triggerVal && _keyEventsVal) {
      var _keSegs0 = _keyEventsVal.split(/[→\->>|｜]/).map(function (x: any) { return String(x).trim() }).filter(Boolean)
      if (_keSegs0.length) {
        var _t0 = _keSegs0[0]
        _triggerVal = (_t0.length > 40 ? _t0.substring(0, 40) : _t0) + '——此节点触发两人关系的正式建立'
      }
    }
    if (!_triggerVal) _triggerVal = '两人因' + (_relType || '此') + '关系在关键事件中被推到同一处境，关系由此展开'
    if (!_asymmetryVal) _asymmetryVal = _deriveRelationshipField('asymmetry', _relType, _desc, _intensityNum)
    // 🔥 2026-09-02 二轮修复（图8）：终极防线——任何枚举字段都不得为空，否则 UI 显示「未设定」
    if (!_circleVal) _circleVal = '外围圈层'
    if (!_conflictVal) _conflictVal = '动态矛盾'
    if (!_asymmetryVal) _asymmetryVal = _intensityNum >= 8 ? '双方均高度在意此关系' : (_intensityNum >= 5 ? '一方主动，一方回应' : '一方主导，另一方保持距离')
    // 🔥 2026-09-02 二轮修复（图8）：发展阶段必须命中 UI 枚举（初识/建立/深化/转折/稳定/破裂/敌对），
    //   LLM 自由文本或缺失时从描述推导，仍不中则默认「建立」
    var _DEV_CANON = ['初识', '建立', '深化', '转折', '稳定', '破裂', '敌对']
    var _devVal = normalizeToString(r.developmentStage || r.stage || '')
    if (_DEV_CANON.indexOf(_devVal) === -1) {
      // 🔥 2026-09-02 二轮修复（图8）：developmentStage 常为自由文本（「从相识到相守的完整情感线」），
      //   优先用 emotionChange 情感链末段判定，其次 description 正则，绝不退化为空。
      var _devFromEmotion = _devStageFromEmotion(_emotionVal)
      var _devDerived = _deriveRelationshipField('developmentStage', _relType, _desc, _intensityNum)
      _devVal = _devFromEmotion || _devDerived || (_devVal ? _devVal : '建立')
    }
    // 🔥 2026-09-02 二轮修复（图8）：绑定剧情节点兜底（后端不下发该字段）
    var _boundVal = normalizeToString(r.boundPlotNode || r.plotNode || '')
    if (!_boundVal) _boundVal = _deriveBoundPlotNode(_keyEventsVal, _impactVal, _desc)
    return {
      id: r.id || ('rel-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
      from: from,
      to: to,
      personA: from,
      personB: to,
      relationship: _relType,
      relationshipType: _relType,
      type: _relType,
      description: _desc,
      impactOnPlot: _impactVal,
      keyEvents: _keyEventsVal,
      emotionChange: _emotionVal,
      strength: _strengthVal,
      circle: _circleVal,
      conflictType: _conflictVal,
      intensity: _intensityNum,
      developmentStage: _devVal,
      triggerCondition: _triggerVal,
      asymmetry: _asymmetryVal,
      boundPlotNode: _boundVal,
      evolutionCurve: normalizeToString(r.evolutionCurve || _emotionVal || ''),
      keyMoments: normalizeToString(r.keyMoments || _keyEventsVal || ''),
      deepConflict: normalizeToString(r.deepConflict || ''),
      plotInfluence: normalizeToString(r.plotInfluence || _impactVal || ''),
    }
  })
  normalizedRels = normalizedRels.filter(function(r) { return r != null })
  console.log('[normalizeRelationshipsData] after filter, count:', normalizedRels.length, ', first item:', JSON.stringify(normalizedRels[0]))
  return { relationships: normalizedRels }
}

// 🔥 2026-09-05：势力设定「绝不空值」客户端兜底。当规范化后势力数组仍为空时，
//   依据题材用确定性模板生成 ≥8 个阵营完整、名称非空的势力，保证旧草稿/生成失败的势力环节始终有内容。
function buildFactionFallback(ctx: any): any[] {
  var _proto = (ctx && (ctx.protagonistName || ctx.protagonist)) || '主角'
  var _genre = String((ctx && ctx.genre) || '').toLowerCase()
  var _isHist = /历史|架空|两宋元明|明清|明朝|南明|明末|宋元|唐|汉|三国|秦汉|隋唐|五代|清|民国|权谋|朝堂|官场/.test(_genre) || /朝代|朝廷|帝国|王朝|争霸|权谋|官场/.test(String((ctx && (ctx.era || ctx.keywords)) || ''))
  var _template: any[]
  if (_isHist) {
    _template = [
      { name: '朝廷中枢', leader: _proto, camp: '己方', type: '朝廷/官府', description: '以' + _proto + '为核心的朝廷中枢，掌控朝政大权与正统名分，内部派系林立、新旧之争不断，是主角施展抱负的根本依托。', goal: '巩固皇权，推进新政，对抗外敌与内患', strength: '掌控朝政与军队，但财政吃紧、派系掣肘', territory: '京城与核心州府', philosophy: '正统优先，稳中求变' },
      { name: '外敌势力', leader: '外族枭雄', camp: '敌方', type: '游牧/外敌', description: '雄踞一方的强敌，兵强马壮、屡次南侵，是全书最大的外部威胁，与主角展开长期拉锯。', goal: '南下吞并，终结主角所在王朝', strength: '骑兵精锐，善野战，占据战略要地', territory: '边境外域', philosophy: '以战养战，恃强凌弱' },
      { name: '藩镇/权臣集团', leader: '权臣', camp: '敌方', type: '藩镇/权臣', description: '手握重兵或把持朝政的地方实力派，表面臣服实则心怀异志，处处掣肘主角，是内部主要对手。', goal: '扩张自身权力，架空或取代皇权', strength: '兵权在手，党羽众多，与朝堂盘根错节', territory: '地方重镇', philosophy: '权柄至上' },
      { name: '清流/改革派', leader: '改革领袖', camp: '友方', type: '朝堂派系', description: '与主角志同道合的清流文臣，主张变法图强，是主角推行新政的中坚力量与可靠盟友。', goal: '辅佐主角推行新政，清除积弊', strength: '清望卓著，掌握舆论与言路', territory: '朝堂', philosophy: '以正直清流匡扶社稷' },
      { name: '地方士绅/商帮', leader: '商帮领袖', camp: '中立', type: '士绅/商会', description: '盘踞地方的大族与商帮，掌控钱粮与民间力量，谁的胜算大便倾向谁，是主角争取的中间力量。', goal: '保全家族利益，寻求利益最大化', strength: '财力雄厚，人脉遍布，掌握地方实权', territory: '江南各处', philosophy: '趋利避害，左右逢源' },
      { name: '边军将领', leader: '边关主帅', camp: '友方', type: '边军', description: '戍守边关的武将集团，重兵在握，既是本朝的屏障，也因功高望重而成为朝局举足轻重的力量。', goal: '保境安民，凭军功立足朝堂', strength: '边防精锐，实战经验丰富', territory: '边关重镇', philosophy: '将在外君命有所不受' },
      { name: '宗室藩邸', leader: '宗室亲王', camp: '中立', type: '宗室', description: '坐镇藩地的宗室亲王，各有私心，伺机而动，牵一发而动全身，是朝堂上最难缠的隐秘对手。', goal: '扩张封地影响，觊觎更多的权力', strength: '名分尊崇，封地富庶，党羽私下串联', territory: '封藩之地', philosophy: '静待时机，图谋大位' },
      { name: '绿林/民间义军', leader: '义军首领', camp: '中立', type: '民间势力', description: '揭竿而起的民间力量，鱼龙混杂，时而是隐患，时而又能成为主角的臂助。', goal: '自救求存，推翻苛政', strength: '士气高昂，熟悉地形，深得民心', territory: '流寇山区', philosophy: '官逼民反' },
    ]
  } else {
    _template = [
      { name: '主角阵营', leader: _proto, camp: '己方', type: '主角势力', description: _proto + '所属的核心阵营，是全书主视角所在，见证' + _proto + '从弱小到强大的全过程。', goal: '立足世界，对抗强敌', strength: '以' + _proto + '为核心，潜力无限' },
      { name: '敌对势力', leader: '宿敌', camp: '敌方', type: '敌对势力', description: '与主角阵营势同水火的对立势力，实力雄厚，屡次打压主角，是全书主要矛盾来源。', goal: '压制并消灭主角阵营', strength: '实力强大，底蕴深厚' },
      { name: '盟友势力', leader: '盟友领袖', camp: '友方', type: '同盟势力', description: '与主角阵营目标一致、守望相助的盟友，在关键时刻提供支援。', goal: '共同对抗强敌', strength: '与主角优势互补' },
      { name: '中立势力', leader: '中立领袖', camp: '中立', type: '中立势力', description: '保持中立的第三方力量，观望局势，待价而沽，是主角可以争取的对象。', goal: '保全自身，择机而动', strength: '资源独特，地位超然' },
      { name: '神秘势力', leader: '神秘人', camp: '中立', type: '神秘势力', description: '来历成谜的隐藏势力，暗中观察一切，掌握着不为人知的秘密。', goal: '自身图谋成谜', strength: '神秘莫测' },
      { name: '商会/情报组织', leader: '商会会长', camp: '中立', type: '商业势力', description: '遍及天下的商号与情报网络，消息灵通，左右逢源，是各方势力争夺的中间力量。', goal: '逐利与掌控信息', strength: '财源广进，消息灵通' },
      { name: '古老世家', leader: '世家家主', camp: '中立', type: '世家', description: '传承千年的古老世家，底蕴深厚，在幕后操控着许多关键事件。', goal: '维系家族荣光与影响力', strength: '传承深厚，人脉深远' },
      { name: '散修势力', leader: '散修强者', camp: '中立', type: '散修组织', description: '游离于正规体系之外的散修力量，各自修行，抱团取暖，亦正亦邪。', goal: '在乱世中保住自身的机缘', strength: '行者无疆，机变百出' },
    ]
  }
  return _template
}

function normalizeFactionsData(data: any, ctx?: any): any {
  // 🔥 阶段4 P2：势力进阶字段透传函数（基于本作前序设定做立体化设计）
  var _normalizeFacFields = function(f: any) {
    var _camp = normalizeToString(f.camp || f.type || f.alignment || '')
    var _name = normalizeToString(f.name)
    // 🔥 2026-09-02 修复（图6/7）：描述兜底源扩展（desc/intro/summary/relationshipWith 均可作为来源）
    var _description = normalizeToString(f.description || f.desc || f.intro || f.summary || '')
    var _allies = Array.isArray(f.allies) ? f.allies.map(normalizeToString).filter(Boolean) : []
    var _enemies = Array.isArray(f.enemies) ? f.enemies.map(normalizeToString).filter(Boolean) : []
    // 🔥 2026-09-02 修复（图6/7）：盟友/敌方势力多来源解析——
    //   LLM 可能输出字符串形式的 allyForces/enemyForces/relationshipWith/foreignRelations，
    //   按中英文标点切分为数组，杜绝「友方势力（逗号分隔）」整栏空值
    var _splitFactionNames = function (_v: any): string[] {
      if (Array.isArray(_v)) return _v.map(normalizeToString).filter(Boolean)
      var _s = normalizeToString(_v)
      if (!_s) return []
      // 长句（>30字）多为描述性文本而非名单，不切分
      if (_s.length > 30) return []
      return _s.split(/[,，、/／;；|｜]+/)
        .map(function (x: string) { return x.replace(/^(包括|有|主要为|主要是|以及|还有|和)\s*/, '').trim() })
        .filter(function (x: string) {
          // 过滤垃圾片段：过短、过长、或含关系动词的描述性短语
          if (!x || x.length < 2 || x.length > 16) return false
          if (/结盟|交恶|敌对|交好|同盟|对抗|冲突|合作|关系|态度|友好/.test(x)) return false
          return true
        })
    }
    if (_allies.length === 0) {
      _allies = _splitFactionNames(f.allyForces || f.friendlyForces || f.alliedForces)
      if (_allies.length === 0) _allies = _splitFactionNames(f.relationshipWith)
      if (_allies.length === 0) _allies = _splitFactionNames(f.foreignRelations || f.relations)
    }
    if (_enemies.length === 0) {
      _enemies = _splitFactionNames(f.enemyForces || f.hostileForces || f.rivalForces)
    }
    // 🔥 2026-09-02 修复（Bug F）：描述兜底——从姓名+阵营+领袖+领地+理念推导
    if (!_description && _name) {
      var _descParts: string[] = []
      if (_camp) _descParts.push('属于' + _camp + '阵营')
      var _leader = normalizeToString(f.leader)
      if (_leader) _descParts.push('由' + _leader + '统领')
      var _territory = normalizeToString(f.territory)
      if (_territory) _descParts.push('盘踞' + _territory)
      var _philosophy = normalizeToString(f.philosophy)
      // 🔥 2026-09-06 修复（#129）：原为 substring(0,30) 硬截断，导致理念只剩半句
      if (_philosophy) _descParts.push('秉持"' + _philosophy + '"的理念')
      if (_descParts.length > 0) _description = _name + '：' + _descParts.join('，') + '。'
    }
    // 🔥 2026-09-02 修复（图7）：描述仍为空时，用与主角关系/历史恩怨等描述性文本兜底
    if (!_description && _name) {
      var _relWithTxt = normalizeToString(f.relationshipWith || f.relationToProtagonist)
      var _histTxt = normalizeToString(f.historyGrudges)
      // 🔥 2026-09-06 修复（#129）：原为 substring(0,80) + '……'，UI 上就是"截取内容"。
      //   描述兜底一律用完整原文，不再截断也不再加省略号。
      if (_relWithTxt && _relWithTxt.length >= 8) _description = _name + '：' + _relWithTxt
      else if (_histTxt && _histTxt.length >= 8) _description = _name + '：' + _histTxt
      // 🔥 第五轮复测：硬描述兜底（不再"暂无详细描述"占位，多源拼接给一个看得过去的故事）
      //   复现实锤：截图 7「孙可望集团」描述为空、仅占位文案「暂无详细描述，可点击重新生成补充。」
      //   根因 = 无 allies、无 relationshipWith、无 historyGrudges 时第三条兜底分支触发。
      //   修复：从 strength/leader/territory/goal 多源拼一段描述，承诺"硬故事"而非占位。
      else {
        var _fallbackParts: string[] = []
        var _str = normalizeToString(f.strength)
        if (_str) _fallbackParts.push('实力' + _str)
        var _ldr = normalizeToString(f.leader || '')
        var _ter = normalizeToString(f.territory || '')
        if (_ldr && _ter) _fallbackParts.push('由' + _ldr + '统领，盘踞' + _ter)
        else if (_ldr) _fallbackParts.push('由' + _ldr + '统领')
        else if (_ter) _fallbackParts.push('盘踞' + _ter)
        var _gl = normalizeToString(f.goal || '')
        // 🔥 2026-09-06 修复（#129）：以下三处原为 substring(0,20/20/15)，拼接出的描述全是半截词
        if (_gl) _fallbackParts.push('其志在' + _gl)
        var _phil = normalizeToString(f.philosophy || '')
        if (_phil) _fallbackParts.push('秉持"' + _phil + '"的理念')
        var _histG = normalizeToString(f.historyGrudges || '')
        if (_histG) _fallbackParts.push('与' + _histG)
        if (_camp) _fallbackParts.unshift('属' + _camp + '阵营')
        if (_fallbackParts.length === 0) {
          _description = _name + '是本作品' + (_camp || '重要') + '势力之一，与主线故事深度交织，参与多次重要剧情推进。可在编辑面板补充其历史、行事风格与核心人物等细节。'
        } else {
          _description = _name + '：' + _fallbackParts.join('，') + '。'
        }
      }
    }
    // 🔥 2026-09-02 修复（Bug E）：盟友/敌人兜底——从关系字段推导
    if (_allies.length === 0 && _enemies.length === 0) {
      var _relToP = normalizeToString(f.relationToProtagonist)
      var _histG = normalizeToString(f.historyGrudges)
      if (_relToP && /盟友|友好|同盟|结盟|亲善/.test(_relToP)) {
        // 关系字段说盟友，但 allies 为空——给一个默认空值，不强行造数据
      }
      if (_histG) {
        // 从历史恩怨里尝试抽取盟友/敌人名（简单启发：抓"X vs Y"模式）
        var _vsMatch = _histG.match(/([^，。\s]{2,8})(?:\s*vs\.?\s*|\s*与\s+|\s*对\s+|\s*敌对\s*)([^，。\s]{2,8})/)
        if (_vsMatch) {
          _enemies = [_vsMatch[2]]
        }
      }
    }
    // 🔥 2026-09-06 势力「绝不空值」：对理念/资源/招牌人物/文化/旗帜/恩怨/关系/隐藏目的/实力梯度等
    //   可编辑深度字段做确定性兜底（从本势力已有素材 + 阵营属性推导，杜绝空槽），同时保证与当前
    //   「架空历史·系统流」主题一致，绝不外溢出修仙等跨题材表述。
    var _leaderV = normalizeToString(f.leader)
    var _territoryV = normalizeToString(f.territory)
    var _goalV = normalizeToString(f.goal)
    var _strengthV = normalizeToString(f.strength)
    var _campIsMing = /明|永历|朝廷|忠臣|主角|义军|南明|大明/.test(_camp + _name)
    var _campIsEnemy = /清|满清|后金|鞑子|降清|吴三桂|孔有德|尚可喜|耿仲明|多尔衮/.test(_camp + _name)
    // 🔥 #178b 去永历化：阵营侧名不再写死永历朝廷/满清（原泛词「朝廷/主角」即可误命中任意题材势力）
    var _side = _campIsEnemy ? '敌方' : (_campIsMing ? '正统阵营' : '中立方')
    var _enemySideName = _campIsEnemy ? '正统王朝与勤王义师' : '敌对势力与依附诸镇'
    var _allySideName = _campIsEnemy ? '敌国权贵与归附诸镇' : '正统阵营忠臣义师'
    // 🔥 2026-09-06 势力「领地/成员/内部派系」正史化兜底：按首领名查表（永历·明末清初史料真实性），
    //   杜绝 field 空值（领地/内部派系曾整栏为空），且让各势力领地、成员、派系真正贴合人物设定与史实，而非通用占位。
    var _derivedFac = (function deriveHistoricalDetail(leaderN: string, nameN: string) {
      // 首领名 → [领地, 成员列表, 内部派系列表]
      var _L: Record<string, [string, string[], string[]]> = {
        '朱由榔': ['两广与云贵（肇庆、桂林、梧州一线）', ['瞿式耜', '何腾蛟', '堵胤锡', '李定国', '张煌言'], ['拥立派（力主监国称帝）', '还跸派（主张坚守桂林）', '主战派（力主北伐）']],
        '钱谦益': ['江南·南京（文教渊薮）', ['钱谦益', '冒襄', '侯方域'], ['清流主战派', '降清自保派']],
        '沈万三': ['江南·苏州、松江（商业都会）', ['沈万三', '江南盐商', '漕帮商首'], ['官商联姻派', '纯利派']],
        '李定国': ['云贵·滇黔边地（大西军根基）', ['李定国', '白文选', '刘文秀', '艾能奇'], ['西营老将派', '归明新锐派']],
        '多尔衮': ['辽东·盛京与北地（山海关内外）', ['多尔衮', '多铎', '阿济格', '豪格', '范文程', '洪承畴'], ['满洲贵族派', '明朝降臣派']],
        '吴三桂': ['滇黔·云南贵州（西平王封地）', ['吴三桂', '吴应熊', '高得捷', '夏国相'], ['追随旧部派', '拥清新附派']],
        '陈近南': ['闽粤·福建广东沿海与帮会山堂', ['陈近南', '各分堂堂主', '各地舵主'], ['红花堂', '青木堂', '木人堂']],
        '张煌言': ['浙东·舟山、宁波沿海（海陆并举）', ['张煌言', '浙东义军', '舟山水师'], ['沿海义师派', '潜潜朝局派']],
        '郑芝龙': ['闽海·厦金、台澎（海上霸主）', ['郑芝龙', '郑成功', '郑鸿逵', '郑彩'], ['海上贸易派', '陆上扩张派']],
        '林丹汗': ['漠南·蒙古草原（归化一带）', ['林丹汗', '额哲', '各部落台吉'], ['亲明派', '附清派']],
      }
      if (leaderN && _L[leaderN]) return _L[leaderN]
      if (nameN && _L[nameN]) return _L[nameN]
      return null
    })(_leaderV, _name)
    if (_territoryV) { /* 保留已有领地 */ }
    else if (_derivedFac) { _territoryV = _derivedFac[0] }
    else if (_campIsEnemy) { _territoryV = '辽东与北地（关外旗地、山海关一带）' }
    else if (_campIsMing) { _territoryV = '两广云贵（残明辖地）' }
    else { _territoryV = '江淮或边地（等因素择地而居）' }
    // —— 势力理念/宗旨 ——
    var _philosophy = normalizeToString(f.philosophy)
    if (!_philosophy) {
      var _philSeeds = [normalizeToString(f.values), normalizeToString(f.belief), _goalV]
      for (var _pk = 0; _pk < _philSeeds.length; _pk++) {
        if (_philSeeds[_pk] && _philSeeds[_pk].length >= 4) { _philosophy = _philSeeds[_pk]; break }
      }
    }
    if (!_philosophy) {
      _philosophy = _campIsEnemy ? '以雷霆之势鲸吞海内、削平诸藩，尽收天下之兵权于一身'
        : (_campIsMing ? '兴复明祚、收拾山河，保境安民以图中兴'
        : '于乱世之中自保图存、观局待变，待时而动')
    }
    // —— 旗帜/标识 ——
    var _symbol = normalizeToString(f.symbol)
    if (!_symbol) {
      _symbol = _campIsEnemy ? '猎猎白旗与九龙吐火' : (_campIsMing ? '朱明日月旗' : '青底山岳旗')
    }
    // —— 势力文化/风气 ——
    var _culture = normalizeToString(f.culture)
    if (!_culture) {
      _culture = _campIsEnemy ? '尚武严苛、以军功论赏，上下尊卑森然' : (_campIsMing ? '文武相济、重气节轻生死，士人风骨犹存' : '务实求存、广纳四方之才')
    }
    // —— 核心资源/经济基础 ——
    var _coreResources = Array.isArray(f.coreResources) ? f.coreResources.map(normalizeToString).filter(Boolean) : []
    if (_coreResources.length === 0 && _territoryV) _coreResources = [_territoryV + '之钱粮赋税', '兵马甲械']
    if (_coreResources.length === 0) _coreResources = _campIsEnemy ? ['八旗铁骑与火器辎重', '满蒙汉八旗之军马'] : ['境内钱粮赋税', '忠义之士与兵马甲械']
    // —— 招牌人物/战力天花板 ——
    var _flagshipFigures = Array.isArray(f.flagshipFigures) ? f.flagshipFigures.map(normalizeToString).filter(Boolean) : []
    if (_flagshipFigures.length === 0) {
      var _memArr = Array.isArray(f.members) ? f.members.map(normalizeToString).filter(Boolean) : (_derivedFac ? _derivedFac[1] : [])
      var _figSrc = (_leaderV ? [_leaderV + '（首领）'] : []).concat(_memArr.filter(function(m: string) { return m !== _leaderV }))
      _flagshipFigures = _figSrc.length ? _figSrc : ([_name + '之主事者（统帅）'])
    }
    // —— 历史恩怨 ——
    var _historyGrudges = normalizeToString(f.historyGrudges)
    if (!_historyGrudges) {
      _historyGrudges = (_enemies.length ? '与之生死相敌，历数与' + _enemies[0] + '之战，积怨甚深。' : '')
        + (_campIsMing ? '' : '')
      if (!_historyGrudges) _historyGrudges = _campIsEnemy ? '曾数度兴兵南下，与明室多次会战，屠戮之仇不共戴天。' : '在乱世中与各方势力时敌时友，恩怨随大势消长。'
    }
    // —— 与主角关系演变 ——
    var _relationToP = normalizeToString(f.relationToProtagonist || f.relationshipWithProtagonist)
    if (!_relationToP) {
      _relationToP = _campIsEnemy ? '与主角从初期的正面交锋，到后期阴谋相斗、分庭抗礼，为全书最强阻力。' : (_campIsMing ? '与主角同为中兴股肱，初期观望试探，后期倾力相扶、共襄大业。' : '与主角互有往来，依主角之成败而倚迁离合，是各方角力的关键变量。')
    }
    // —— 隐藏目的 ——
    var _hiddenAgenda = normalizeToString(f.hiddenAgenda)
    if (!_hiddenAgenda) {
      _hiddenAgenda = _campIsEnemy ? '明面上扩张疆土，暗地里实欲借刀杀人、剪除主角羽翼，独吞天下。' : (_campIsMing ? '表面随主角中兴，暗藏分权自固之心，图在中兴大业中攫取更多权柄。' : '表面保持中立，暗地却在观望两强胜负，谋取最大渔利。')
    }
    // —— 实力梯度/底牌/核心冲突/发展轨迹 ——
    // 🔥 2026-09-06 修复：powerRank 必须对齐前端下拉合法值（传说/超级/一流/二流/三流 + 势力后缀）
    var _RANK_VALUES: any = { '传说势力': '传说势力', '超级势力': '超级势力', '一流势力': '一流势力', '二流势力': '二流势力', '三流势力': '三流势力' }
    var _powerRank = normalizeToString(f.powerRank)
    if (_powerRank) {
      var _prMatch = /^(传说|超级|一流|二流|三流)/.exec(_powerRank)
      _powerRank = _prMatch ? (_prMatch[1] + '势力') : (_RANK_VALUES[_powerRank] || '')
    }
    if (!_powerRank) {
      var _prTxt = String(_strengthV || '') + String(f.description || '')
      if (/顶级|传说|霸主|神朝|帝国|底蕴深厚/.test(_prTxt)) _powerRank = '传说势力'
      else if (/超级|顶尖|最强|精锐|鼎盛/.test(_prTxt)) _powerRank = '超级势力'
      else if (/一流|强势|上层|精良|先进/.test(_prTxt)) _powerRank = '一流势力'
      else if (/三流|微弱|弱小/.test(_prTxt)) _powerRank = '三流势力'
      else _powerRank = _campIsEnemy ? '超级势力' : (_campIsMing ? '超级势力' : '二流势力')
    }
    // 🔥 2026-09-06 修复：strengthTier 必须对齐前端下拉合法值（SSS/SS/S/A/B/C/D），描述文本 → 由实力级别派生
    var _TIER_FROM_RANK: any = { '传说势力': 'SSS', '超级势力': 'SS', '一流势力': 'S', '二流势力': 'A', '三流势力': 'B' }
    var _strengthTier = normalizeToString(f.strengthTier)
    if (_strengthTier) {
      var _stUp = _strengthTier.toUpperCase()
      if (!/^(SSS|SS|S|A|B|C|D)$/.test(_stUp)) {
        _strengthTier = _TIER_FROM_RANK[_powerRank] || (_campIsEnemy ? 'SS' : (_campIsMing ? 'S' : 'A'))
      } else {
        _strengthTier = _stUp
      }
    } else {
      _strengthTier = _TIER_FROM_RANK[_powerRank] || (_campIsEnemy ? 'SS' : (_campIsMing ? 'S' : 'A'))
    }
    var _trumpCard = normalizeToString(f.trumpCard)
    if (!_trumpCard) _trumpCard = _campIsEnemy ? '藏有不为人知的后手' : '握有主角尚未尽知的底牌'
    var _coreConflictFac = normalizeToString(f.coreConflict)
    if (!_coreConflictFac) _coreConflictFac = _side + '内部权位之争，以及对外与' + _enemySideName + '之生死博弈'
    var _devTraj = normalizeToString(f.developmentTrajectory)
    if (!_devTraj) _devTraj = _campIsEnemy ? '由鼎盛而转衰，随主角得势而节节败退' : (_campIsMing ? '由残局而中兴，渐成定鼎之基' : '随风向起伏，最终择主而事')
    // 盟友/敌方最后兜底（保证双栏非空）
    if (_allies.length === 0) _allies = [_allySideName]
    if (_enemies.length === 0) _enemies = [_enemySideName]
    return {
      ...f,
      id: f.id || ('faction-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)),
      name: _name,
      type: _camp,
      camp: _camp,
      description: _description,
      strength: _strengthV,
      leader: _leaderV,
      territory: _territoryV,
      members: (Array.isArray(f.members) && f.members.some(function(m: any) { return normalizeToString(m) }))
        ? f.members.map(normalizeToString)
        : (_derivedFac ? _derivedFac[1] : (_flagshipFigures.length ? _flagshipFigures : [])),
      goal: _goalV,
      // 🔥 阶段4 P2：势力进阶字段透传（12个字段）
      philosophy: _philosophy,
      internalFactions: (Array.isArray(f.internalFactions) && f.internalFactions.some(function(im: any) { return normalizeToString(im) }))
        ? f.internalFactions.map(normalizeToString).filter(Boolean)
        // 🔥 2026-09-06 修复（#129）：原为 substring(0,12)+'派系'，内部派系名被砍成半截
        : (_derivedFac ? _derivedFac[2] : (_philosophy ? [_philosophy + '派系'] : [])),
      coreResources: _coreResources,
      allies: _allies,
      enemies: _enemies,
      historyGrudges: _historyGrudges,
      hiddenAgenda: _hiddenAgenda,
      powerRank: _powerRank,
      flagshipFigures: _flagshipFigures,
      culture: _culture,
      relationToProtagonist: _relationToP,
      symbol: _symbol,
      // 🔥 保留原有字段（fate/relationshipWithProtagonist）
      fate: normalizeToString(f.fate || ''),
      relationshipWithProtagonist: normalizeToString(f.relationshipWithProtagonist || ''),
      // 🔥 势力深度字段（实力梯度/底牌/核心冲突/发展轨迹）
      strengthTier: _strengthTier,
      trumpCard: _trumpCard,
      coreConflict: _coreConflictFac,
      developmentTrajectory: _devTraj,
    }
  }
  if (Array.isArray(data)) {
    console.log('[normalizeFactionsData] Treating as array, length:', data.length)
    var _arrNorm = data.map(function (f: any) { return _normalizeFacFields(f) })
    // 🔥 2026-09-05：数组分支同样「绝不空值」
    if (_arrNorm.filter(function (f: any) { return f && f.name && f.name.length >= 2 }).length === 0) {
      _arrNorm = buildFactionFallback(ctx || {}).map(function (f: any) { return _normalizeFacFields(f) })
    }
    return {
      factions: _arrNorm,
    }
  }

  // Try alternative paths
  var altFactions = [
    ...(data.protagonistFaction ? [{
      ...data.protagonistFaction,
      id: data.protagonistFaction.id || 'protagonist-faction',
      type: data.protagonistFaction.type || data.protagonistFaction.camp || 'protagonist',
    }] : []),
    ...(data.enemyFactions || []),
    ...(data.neutralFactions || []),
    ...(data.otherFactions || []),
    ...(data.factions || []),
  ]

  console.log('[normalizeFactionsData] altFactions length:', altFactions?.length)
  var factionsArray: any[] = []
  if (Array.isArray(altFactions) && altFactions.length > 0) {
    factionsArray = altFactions
  } else if (typeof data === 'object' && !Array.isArray(data)) {
    var keys = Object.keys(data)
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(data[keys[i]])) {
        console.log('[normalizeFactionsData] Found array in key:', keys[i], 'length:', data[keys[i]].length)
        factionsArray = data[keys[i]]
        break
      }
    }
  }

  console.log('[normalizeFactionsData] factionsArray length:', factionsArray.length)
  var _normFactions = factionsArray.map(function (f: any) { return _normalizeFacFields(f) })
  // 🔥 2026-09-05：势力「绝不空值」——规范化后仍为空或全部名称非法时，用题材模板兜底 ≥8 个
  var _validCount = _normFactions.filter(function (f: any) { return f && f.name && f.name.length >= 2 }).length
  if (_validCount === 0) {
    console.log('[normalizeFactionsData] 🔥 无有效势力，启用客户端题材模板兜底')
    _normFactions = buildFactionFallback(ctx || {}).map(function (f: any) { return _normalizeFacFields(f) })
  }
  return {
    ...data,
    factions: _normFactions,
  }
}

// ============ 确定性剧情派生（确保 synopsis/outline/keyPlots 打开草稿即非空、贴题） ============
// 依据已有 idea/worldbuilding/powerSystem/characters/factions 上下文，为本作派生完整、非空、贴题的
// 简介/大纲/关键剧情节点兜底，杜绝"数据为空，请点击上方按钮重新生成"。
function buildStoryContext(ctx: any): any {
  var idea = (ctx && ctx.idea) || {}
  var wb = (ctx && ctx.worldbuilding) || {}
  var ps = (ctx && ctx.powerSystem) || {}
  var ch = (ctx && ctx.characters) || {}
  var pn = String(idea.protagonistName || (ch.protagonist && ch.protagonist.name) || ctx.protagonistName || '主角').trim()
  var sysName = String(
    (ps.protagonistAbility && ps.protagonistAbility.name) || ps.cheatName || idea.systemName || '系统'
  ).trim()
  var cheatText = normalizeToString(ps.cheat || ps.goldenFinger || ps.goldenCheat)
  var era = normalizeToString(wb.era || wb.age || idea.setting)
  var coreConflict = normalizeToString(idea.coreConflict || idea.coreIdea)
  var goalText = normalizeToString((ch.protagonist && (ch.protagonist.goal || ch.protagonist.coreMotivation)) || idea.summary)
  var genreStr = String(idea.genre || ctx.genre || '')
  var _isHistoryAny = /朝代|朝廷|帝国|王朝|都督|巡抚|总督|将军|皇帝|陛下|九五|龙椅|永历|崇祯|弘光|隆武|绍武|南明|明末|满清|清朝|大清|中兴|复国|北伐|两粤|岭南|扬州|山海关/
  var _isMiddleware = /历史|架空|权谋|明末|南明|大明|中兴|复国|争霸|乱世|穿越|系统|签到|王朝|皇帝|权臣|朝堂/
  var isHistory = _isHistoryAny.test(era + coreConflict + genreStr + normalizeToString(wb.history))
    || _isMiddleware.test(String(genreStr))
  var isCultivation = /修仙|修真|仙侠|洪荒|封神|炼气|筑基|金丹|元婴|化神|渡劫|飞升|灵根|丹田/.test(genreStr + era + normalizeToString(wb.powerSystem))
  return {
    pn: pn || '主角', sysName: sysName || '系统', cheatText: cheatText,
    era: era, coreConflict: coreConflict, goalText: goalText,
    wb: wb, ps: ps, ch: ch, idea: idea,
    isHistory: isHistory, isCultivation: isCultivation,
  }
}

// 将主角目标/简介文本中的"第X阶段：..."、"X：..."阶段切分出来；切不出则回退题目模板
function extractGoalStages(c: any): { name: string; desc: string }[] {
  var out: { name: string; desc: string }[] = []
  var g = c.goalText || ''
  var segs: string[] = []
  if (/阶段[\u4e00-\u9fa5ａ-ｚA-Z0-9()（）]*[:：]/.test(g)) segs = g.split(/(?=阶段[\u4e00-\u9fa5ａ-ｚA-Z0-9()（）]*[:：])/).filter(Boolean)
  else if (/(第[一二三四五六七八九十\d]+|卷一|卷[A-Z一-十\d]+).{0,4}[:：]/.test(g)) segs = g.split(/(?=(?:第[一二三四五六七八九十\d]+|卷一|卷[A-Z一-十\d]+).{0,4}[:：])/).filter(Boolean)
  else if (c.isHistory) segs = []
  if (segs.length === 0) return out
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i].replace(/^[；;\s]+/, '').trim()
    if (!s) continue
    var parts = s.split(/\s*[:：]\s*/)
    var name = String(parts.shift() || '').replace(/(^\d+(\.\d+)?[-–—])/, '').trim().slice(0, 24)
    var desc = parts.join('：').trim()
    if (!name) name = '阶段' + (i + 1)
    if (!desc) desc = name
    if (out.length >= 7) break
    out.push({ name: name, desc: desc })
  }
  return out
}
function historyStageTemplate(c: any): { name: string; desc: string }[] {
  // 🔥 #178 中性化：原模板写死《永历中兴》明末背景（明清鼎革/扬州十日/湘桂粤滇/签到），任何历史题材
  //   字段缺失时都会被灌入 → 改为贴合 c.era/c.pn/c.sysName 的朝代无关通用阶段
  var _era178 = c.era || '王朝将倾的乱世'
  return [
    { name: '临危受命·立足根基', desc: c.pn + '于' + _era178 + '的至暗时刻觉醒' + (c.sysName || '神秘金手指') + '，在风雨飘摇中建立根基，迈出逆转命运的第一步。' },
    { name: '整肃内政·聚拢人心', desc: '铲除把持朝政的权奸党争，收拢财权兵权，重建中枢权威，为图存图强蓄势。' },
    { name: '练兵图强·首战立威', desc: '凭借金手指之利编练新军、革新战法，于内外强敌的夹击中首战告捷，威望初立。' },
    { name: '主动出击·克复失地', desc: '转守为攻，连挫强敌劲旅，收复沦陷的故土重镇，拉开反击序幕。' },
    { name: '一统山河·再造新局', desc: '扫清残敌、定鼎立制，确立全新秩序，海内归心，开创一代盛世。' },
  ]
}
function deriveSynopsis(c: any): any {
  // 🔥 #178 中性化：原兜底写死「魂穿明末/末代藩王/山河签到系统/降清/大明」，任何题材命中都会被污染
  var _era178 = c.era || '王朝将倾的乱世'
  var shortIntro = c.coreConflict || (c.pn + '身处' + _era178 + '，凭' + (c.sysName || '神秘金手指') + '与过人胆识，于绝境之中崛起，一步步改写既定的命运。')
  var longIntro = [
    c.era,
    c.coreConflict,
    c.pn + '身负' + (c.sysName || '神秘金手指') + '，于危局中步步为营，聚拢人心与班底，在权谋与征伐的漩涡中逆流而上。',
    '从孤立无援到执掌全局，他在权谋纷争与金戈铁马间砥砺前行，终将倾颓的局势重铸为全新盛世。'
  ].filter(Boolean).join('。') + '。'
  return {
    shortIntro: shortIntro,
    oneLineIntro: shortIntro,
    longIntro: longIntro,
    fullIntro: longIntro,
    coreSellingPoints: [
      '反套路开局：主角于乱世绝境中强势崛起，金手指+谋略双重加持',
      '权谋与铁血并重：朝堂博弈背后发刀，沙场争锋高燃不断',
      '步步为营的成长线：从微末到执掌全局，每一步都有因果与代价',
      '逆袭爽点拉满：从危局残局到定鼎乾坤、再造新局',
    ],
    sellingPoints: [],
    keywords: ['架空历史', '权谋', '逆袭', '成长', '争霸', '权谋智斗'],
    tag: ['历史', '权谋', '争霸'],
    tags: ['历史', '权谋', '争霸'],
    openingHook: _era178 + '，一缕不甘平庸的意志在绝境中觉醒——' + (c.sysName || '神秘金手指') + '骤然降临，粮秣兵源、谋略先机纷至沓来，逆袭之志从这一刻点燃。',
    suspenseSetup: [(c.sysName || '金手指') + '的真正来历成谜，是天命所归还是另有黑手？', '朝中权奸与各方暗桩步步紧逼，谁才是真正的掘墓人？', '既定的衰亡宿命能否被改写，天意与人力孰重？'],
    coreGoldenQuote: '绝境从来不是终点——我走得越远，脚下的每一步，都是命运被改写的证明。',
    goldenQuote: '绝境从来不是终点——我走得越远，脚下的每一步，都是命运被改写的证明。',
    fanqieVersion: longIntro,
    qidianVersion: longIntro,
    targetReaderProfile: '喜欢历史架空、乱世争霸与权谋智斗的读者；偏好主角依靠智识与金手指逐步逆转逆势的爽文受众；对' + (c.pn || '主角') + '式草根逆袭崛起史感兴趣的网文读者。',
  }
}
function deriveOutline(c: any): any {
  var stages = extractGoalStages(c)
  if (stages.length === 0) stages = historyStageTemplate(c)
  var mainPlot = stages.map(function (s) { return s.name + '：' + s.desc })
  // 🔥 #178 中性化：原 histLadder 为明清官职专名（县丞知县/州府道台…），改为朝代无关成长阶梯
  var histLadder = ['微末之身', '崭露头角', '初掌一隅', '独当一面', '位居要冲', '执掌一方', '权倾朝野', '定策中枢', '股肱重臣', '名震天下', '定鼎乾坤', '开创新局']
  var stageObjs = stages.map(function (s, i) { return {
    name: s.name,
    summary: s.desc,
    mainEvents: [s.name + '·核心转折'],
    shuangPoints: [s.name + '·关键爽点'],
    powerLevel: histLadder[Math.min(i, histLadder.length - 1)],
  } })
  var keyEvents = [
    { name: '觉醒落子', position: stages[0].name || '第一阶段', impact: c.pn + '觉醒' + (c.sysName || '金手指') + '，于乱世中锚定立足之基与初始班底' },
    { name: '整肃朝纲', position: '第二阶段', impact: '扳倒权奸、清扫党争，夺回中枢实权' },
    { name: '练兵立威', position: '第二阶段', impact: '凭金手指之利编练新军，首战扭转败局' },
    { name: '平定内患', position: '第三阶段', impact: '肃清割据势力与内部暗流，稳固钱粮根基' },
    { name: '主动出击', position: '第四阶段', impact: '连挫强敌劲旅，收复沦陷失地' },
    { name: '再造新局', position: '第四阶段', impact: '定鼎立制、万邦来朝，开创一统新局' },
  ]
  return {
    storyOrigin: c.era || (c.pn + '身处乱世漩涡，于王朝将倾之际谋定后动'),
    mainPlot: mainPlot,
    ending: c.pn + '克竟全功，扫清内忧外患、定鼎天下，再造一代中兴，海内重归一统。',
    stages: stageObjs,
    keyEvents: keyEvents,
    worldBuilding: {
      setting: normalizeToString((c.wb && (c.wb.backgroundSetting || c.wb.setting || c.wb.coreSettings)) || c.era || ''),
      powerSystem: c.sysName || '',
    },
    narrativeLines: [
      { name: '崛起主线', type: '主线', description: c.pn + '从乱世立足到扫除外患、重整山河的完整历程', keyNodes: stages.slice(0, 5).map(function (s) { return s.name }) },
      { name: '朝堂权谋线', type: '主线', description: '清洗投机派系与党争内耗，重建中枢权威，权衡各方势力', keyNodes: ['铲除权奸', '整肃朝纲', '推行新政', '集权中枢'] },
      { name: '军事改革线', type: '副线', description: '编练新军、革新战法，打造嫡系武装', keyNodes: ['创建新军', '初战立威', '攻坚野战', '决战破敌'] },
      { name: '情牵家国线', type: '副线', description: '主角与女主在乱世中相知相守、共担家国之重', keyNodes: ['患难相识', '并肩抗压', '生死考验', '携手终成'] },
    ],
    foreshadowingMap: [
      { id: '主角来历之秘', content: '其超前识见令身边人暗自疑窦 → 关键节点先见之明部分显露，成为凝聚人心契机', plantedChapter: '第1-2卷', recoveredChapter: '中期卷', importance: 5 },
      { id: '内部暗流', content: '议和之声与重臣暧昧书信若隐若现 → 出卖军机之谋败露，触发清洗内奸高潮', plantedChapter: '第1卷', recoveredChapter: '第3-5卷', importance: 5 },
      { id: '新军雏形', content: '主角暗中编练的新式部队早期不被看好 → 国运危殆时成为翻盘利刃', plantedChapter: '第2卷', recoveredChapter: '反攻阶段', importance: 5 },
      { id: '敌国内隙', content: '敌方阵营权力交接与内部分歧暗流涌动 → 决战之际内乱爆发，提供战略窗口', plantedChapter: '第4卷', recoveredChapter: '结局卷', importance: 3 },
    ],
    protagonistGrowthCurve: stages.map(function (s, i) { return {
      stage: s.name,
      powerLevel: histLadder[Math.min(i, histLadder.length - 1)],
      growthPoint: s.desc,
      psychologicalChange: i === 0 ? '确立中兴之志，渐悟权责' : (i <= 2 ? '深知制度与人心重于兵戈，格局转向天下经略' : '敢担兴亡之重，功成不忘创业之艰'),
    } }),
    antagonistGrowthCurve: [
      { stage: '虎视之势', antagonist: '强敌', growthPoint: '趁主角立足未稳多次进犯，占尽先机', powerLevel: histLadder[5], threatLevel: '高' },
      { stage: '困兽之斗', antagonist: '强敌', growthPoint: '在主角反攻下节节败退，孤注一掷', powerLevel: histLadder[7], threatLevel: '高' },
      { stage: '败亡收束', antagonist: '强敌', growthPoint: '内乱外患交织，终被彻底击破', powerLevel: histLadder[3], threatLevel: '中' },
    ],
    conflictLayers: [
      { layer: '外部存亡', conflict: '强敌兵锋直指存亡，步步进逼危局残局', stakes: '国祚存续、天下归属' },
      { layer: '朝堂内斗', conflict: '权奸党争与投机派系从中作梗，掣肘图强大业', stakes: '王权稳固、新政推行' },
      { layer: '理念之争', conflict: '守成与变法的路线博弈，新锐与旧贵短兵相接', stakes: '复兴道路之抉择' },
    ],
    keyArtifacts: [
      { name: c.sysName || '神秘金手指', type: '金手指', origin: '横空出世，来历成谜', function: '为主角提供立足乱世、逆转局势的根本依托，随成长不断解锁新能力', owner: c.pn, importance: 5 },
    ],
  }
}
function deriveKeyPlots(c: any): any {
  var stages = extractGoalStages(c)
  if (stages.length === 0) stages = historyStageTemplate(c)
  // 🔥 #178 中性化：原 histHooks 写死明末事件（扬州十日/克复故宫定鼎中兴）
  var histHooks = ['绝境觉醒逆转危局', '整肃朝纲扳倒权奸', '编练新军首战告捷', '连挫强敌收复失地', '定鼎立制再造新局', '海内归心开创盛世']
  var keyPlots = stages.map(function (s, i) { return {
    title: s.name,
    volume: i + 1,
    summary: s.desc,
    shuangPoints: [s.name + '·核心爽点'],
  } })
  var turningPoints = keyPlots.slice(0, 6).map(function (kp, i) { return {
    name: histHooks[i] || kp.title,
    description: kp.summary,
    volume: kp.volume,
  } })
  var volumes = stages.map(function (s, i) { return {
    volume: i + 1,
    title: s.name,
    summary: s.desc,
  } })
  return {
    coreConflict: c.coreConflict || (c.pn + '凭' + (c.sysName || '神秘金手指') + '于重劫之中绝地逆袭、重整山河'),
    volumes: volumes,
    keyPlots: keyPlots,
    turningPoints: turningPoints,
    climax: c.pn + '在决定命运走向的关键决战中，彻底击溃最强之敌，奠定一统之基。',
  }
}

// normalizeSynopsisData
function normalizeSynopsisData(data: any, ctx?: any): any {
  if (!data) data = {}
  // 🔥 2026-09-05：若简介整体为空，则由既有上下文确定性派生完整贴题内容，避免"请点击上方按钮重新生成"空态
  var _isEmptySyn = !normalizeToString(data.shortIntro || data.oneLineIntro || data.briefIntro || data.brief || data.intro || data.hook || data.tagline)
    && !normalizeToString(data.longIntro || data.fullIntro || data.synopsis || data.description || data.content)
  if (_isEmptySyn && ctx) {
    data = deriveSynopsis(buildStoryContext(ctx))
  }
  var shortIntro = normalizeToString(
    data.shortIntro || data.oneLineIntro || data.briefIntro || data.brief || data.intro || data.hook || data.tagline || ''
  )
  if (shortIntro.includes('???') || shortIntro.includes('[PLACEHOLDER]')) shortIntro = ''
  var longIntro = normalizeToString(data.longIntro || data.fullIntro || data.synopsis || data.description || data.content || '')
  if (!shortIntro && longIntro) {
    var firstSentence = longIntro.split(/[。.!！?？\n]/)[0]
    if (firstSentence && firstSentence.length < 100) shortIntro = firstSentence
  }
  var tag = Array.isArray(data.tag) ? data.tag.map(normalizeToString).filter(Boolean) : (Array.isArray(data.tags) ? data.tags.map(normalizeToString).filter(Boolean) : [])
  var coreSellingPoints = Array.isArray(data.coreSellingPoints) ? data.coreSellingPoints.map(normalizeToString).filter(Boolean) : (Array.isArray(data.sellingPoints) ? data.sellingPoints.map(normalizeToString).filter(Boolean) : (Array.isArray(data.highlights) ? data.highlights.map(normalizeToString).filter(Boolean) : []))
  var keywords = Array.isArray(data.keywords) ? data.keywords.map(normalizeToString).filter(Boolean) : []
  var suspenseSetup = Array.isArray(data.suspenseSetup) ? data.suspenseSetup.map(normalizeToString).filter(Boolean) : []
  var coreGoldenQuote = normalizeToString(data.coreGoldenQuote || data.goldenQuote || data.slogan || data.tagline || '')
  // 🔥 2026-09-08 #163 金句回退（交接包 P2）：synopsis 自身无金句时，回退 idea.coreGoldenQuote。
  //   此前 StepSynopsis 显示层只有 data.coreGoldenQuote 兜底，而 API 新生成的 synopsis 不含该字段
  //   → 金句空白触发"必填"红色警告，只能靠数据层脚本（F9）兜底。三字段在此统一。
  var _ideaQuote = (ctx && ctx.idea && normalizeToString(ctx.idea.coreGoldenQuote)) || ''
  var coreGoldenSentence = normalizeToString(data.coreGoldenSentence || data.coreGoldenQuote || data.goldenQuote || data.slogan || _ideaQuote || '')
  var coreGoldenQuoteFinal = coreGoldenQuote || coreGoldenSentence
  var openingHook = normalizeToString(data.openingHook || data.openingSuspense || '')
  var fanqieVersion = normalizeToString(data.fanqieVersion || data.tomatoVersion || '')
  var qidianVersion = normalizeToString(data.qidianVersion || data.qdVersion || '')
  var targetReaderProfile = normalizeToString(data.targetReaderProfile || data.readerProfile || '')
  return {
    ...data,
    shortIntro,
    oneLineIntro: shortIntro,
    longIntro,
    fullIntro: longIntro,
    tag,
    tags: tag.length > 0 ? tag : (coreSellingPoints.length > 0 ? ['历史', '系统流'] : []),
    coreSellingPoints,
    sellingPoints: coreSellingPoints,
    keywords,
    openingHook,
    suspenseSetup,
    coreGoldenQuote: coreGoldenQuoteFinal,
    goldenQuote: coreGoldenQuoteFinal,
    coreGoldenSentence: coreGoldenSentence,
    fanqieVersion,
    qidianVersion,
    targetReaderProfile,
  }
}

// normalizeOutlineData
function normalizeOutlineData(data: any, ctx?: any): any {
  if (!data) {
    // 🔥 2026-09-05：data 为空且带上下文时，确定性派生完整贴题大纲；否则返回可渲染的空结构
    if (ctx) return deriveOutline(buildStoryContext(ctx))
    return {
      storyOrigin: '',
      mainPlot: [],
      ending: '',
      stages: [],
      keyEvents: [],
      worldBuilding: { setting: '', powerSystem: '' },
    }
  }
  // 🔥 2026-09-05：data 存在但关键字段整体为空（storyOrigin/mainPlot/stages 皆空）时同样触发上下文派生
  if (ctx && !(normalizeToString(data.storyOrigin).length > 5)
      && !(Array.isArray(data.mainPlot) && data.mainPlot.length > 0)
      && !(Array.isArray(data.stages) && data.stages.length > 0)) {
    data = deriveOutline(buildStoryContext(ctx))
  }
  var mainPlot: string[] = Array.isArray(data.mainPlot) ? data.mainPlot.map(normalizeToString) : []
  var stages: any[] = Array.isArray(data.stages) ? data.stages.map(function (stage: any) { return ({
    ...stage,
    name: normalizeToString(stage.name),
    summary: normalizeToString(stage.summary),
    mainEvents: Array.isArray(stage.mainEvents) ? stage.mainEvents.map(normalizeToString) : [],
    shuangPoints: Array.isArray(stage.shuangPoints) ? stage.shuangPoints.map(normalizeToString) : [],
    powerLevel: normalizeToString(stage.powerLevel),
  })}) : []
  // mainPlot 有内容但 stages 为空时，从 mainPlot 拆分生成 stages
  if (stages.length === 0 && mainPlot.length > 0) {
    stages = mainPlot.map(function(plot: string, idx: number) {
      var parts = plot.split(/[→—\-]|阶段\d+[:：]/).filter(Boolean)
      var name = parts[0]?.trim().slice(0, 30) || ('阶段' + (idx + 1))
      return {
        name: name,
        summary: plot.length > 20 ? plot.slice(0, 120) : plot,
        mainEvents: [plot.slice(0, 80)],
        shuangPoints: [],
        powerLevel: '',
      }
    })
  }
  // stages 为空时，返回空数组
  if (stages.length === 0) {
    stages = []
  }
  // 🔥 深度字段 schema 桥接：把后端/LLM 的别名字段映射到前端渲染用的规范字段（图十/十一空值根因）
  var _impToNum = function (v: any): number {
    if (typeof v === 'number' && !isNaN(v)) return v
    var s = normalizeToString(v).toLowerCase()
    if (/高|high|核心|major|重要/.test(s)) return 5
    if (/低|low|次要|minor/.test(s)) return 1
    if (/中|medium|mid/.test(s)) return 3
    var n = parseInt(s, 10)
    return isNaN(n) ? 3 : n
  }
  var _arr = function (x: any): any[] { return Array.isArray(x) ? x : [] }
  var narrativeLines = _arr(data.narrativeLines).map(function (it: any) {
    if (typeof it === 'string') return { name: it, type: '主线', description: '', keyNodes: [] }
    return {
      name: normalizeToString(it.name) || normalizeToString(it.title) || '',
      type: normalizeToString(it.type) || '主线',
      description: normalizeToString(it.description) || normalizeToString(it.desc) || '',
      keyNodes: Array.isArray(it.keyNodes) ? it.keyNodes.map(normalizeToString) : (Array.isArray(it.nodes) ? it.nodes.map(normalizeToString) : []),
    }
  })
  var foreshadowingMap = _arr(data.foreshadowingMap).map(function (it: any, i: number) {
    if (typeof it === 'string') return { id: '伏笔' + (i + 1), content: it, plantedChapter: '', recoveredChapter: '', importance: 3 }
    var _content = normalizeToString(it.content)
    if (!_content) {
      var _setup = normalizeToString(it.setup), _payoff = normalizeToString(it.payoff)
      _content = [_setup, _payoff].filter(Boolean).join(' → ') || normalizeToString(it.description) || normalizeToString(it.detail) || ''
    }
    return {
      id: normalizeToString(it.id) || normalizeToString(it.name) || ('伏笔' + (i + 1)),
      content: _content,
      plantedChapter: normalizeToString(it.plantedChapter) || normalizeToString(it.foreshadowedIn) || normalizeToString(it.plantedAt) || '',
      recoveredChapter: normalizeToString(it.recoveredChapter) || normalizeToString(it.resolvedIn) || normalizeToString(it.recoveredAt) || '',
      importance: _impToNum(it.importance),
    }
  })
  var protagonistGrowthCurve = _arr(data.protagonistGrowthCurve).map(function (it: any) {
    if (typeof it === 'string') return { stage: it, powerLevel: '', growthPoint: '', psychologicalChange: '' }
    var _gp = normalizeToString(it.growthPoint) || normalizeToString(it.keyEvent) || normalizeToString(it.mainEvent) || normalizeToString(it.event) || ''
    var _range = normalizeToString(it.chapterRange)
    if (_range && _gp.indexOf(_range) === -1) _gp = _range + '：' + _gp
    return {
      stage: normalizeToString(it.stage) || normalizeToString(it.name) || '',
      powerLevel: normalizeToString(it.powerLevel) || '',
      growthPoint: _gp,
      psychologicalChange: normalizeToString(it.psychologicalChange) || normalizeToString(it.mentality) || normalizeToString(it.change) || '',
    }
  })
  var conflictLayers = _arr(data.conflictLayers).map(function (it: any) {
    if (typeof it === 'string') return { layer: '', conflict: it, stakes: '' }
    return {
      layer: normalizeToString(it.layer) || normalizeToString(it.level) || normalizeToString(it.name) || '',
      conflict: normalizeToString(it.conflict) || normalizeToString(it.description) || '',
      stakes: normalizeToString(it.stakes) || normalizeToString(it.impact) || '',
    }
  })
  var antagonistGrowthCurve = _arr(data.antagonistGrowthCurve).map(function (it: any) {
    if (typeof it === 'string') return { stage: it, antagonist: '', growthPoint: '', powerLevel: '', threatLevel: '' }
    return {
      stage: normalizeToString(it.stage) || normalizeToString(it.name) || '',
      antagonist: normalizeToString(it.antagonist) || normalizeToString(it.name) || '',
      growthPoint: normalizeToString(it.growthPoint) || normalizeToString(it.keyEvent) || normalizeToString(it.description) || '',
      powerLevel: normalizeToString(it.powerLevel) || '',
      threatLevel: normalizeToString(it.threatLevel) || normalizeToString(it.threat) || '',
    }
  })
  var keyArtifacts = _arr(data.keyArtifacts).map(function (it: any, i: number) {
    if (typeof it === 'string') return { name: it, type: '', origin: '', function: '', owner: '', importance: 3 }
    return {
      name: normalizeToString(it.name) || normalizeToString(it.title) || ('道具' + (i + 1)),
      type: normalizeToString(it.type) || '',
      origin: normalizeToString(it.origin) || normalizeToString(it.source) || '',
      function: normalizeToString(it.function) || normalizeToString(it.effect) || normalizeToString(it.desc) || '',
      owner: normalizeToString(it.owner) || normalizeToString(it.bearer) || '',
      importance: _impToNum(it.importance),
    }
  })
  return {
    ...data,
    narrativeLines,
    foreshadowingMap,
    protagonistGrowthCurve,
    conflictLayers,
    antagonistGrowthCurve,
    keyArtifacts,
    storyOrigin: normalizeToString(data.storyOrigin) || '',
    mainPlot,
    ending: normalizeToString(data.ending) || '',
    worldBuilding: data.worldBuilding && typeof data.worldBuilding === 'object' 
      ? {
          // 🔥 2026-09-05：清洗 背景设定(力量体系整块) 与 力量体系(金手指/体系名/体系类型包裹)
          setting: cleanSettingPowerSystemBlock(data.worldBuilding.setting) || '',
          powerSystem: cleanPowerSystemText(data.worldBuilding.powerSystem) || '',
        }
      : { setting: '', powerSystem: '' },
    stages: stages.map(function(stage: any, idx: number) {
      return {
        ...stage,
        name: normalizeToString(stage.name) || ('第' + (idx + 1) + '阶段'),
        summary: normalizeToString(stage.summary) || '',
        powerLevel: normalizeToString(stage.powerLevel) || '',
        mainEvents: Array.isArray(stage.mainEvents) && stage.mainEvents.length > 0 ? stage.mainEvents : [],
        shuangPoints: Array.isArray(stage.shuangPoints) && stage.shuangPoints.length > 0 ? stage.shuangPoints : [],
      }
    }),
    keyEvents: Array.isArray(data.keyEvents) && data.keyEvents.length > 0 
      ? data.keyEvents.map(function(ev: any, evIdx: number) {
          if (typeof ev === 'string' && ev.trim()) {
            return { name: ev, position: '', impact: '' }
          }
          if (typeof ev === 'object' && ev !== null) {
            return {
              name: normalizeToString(ev.name) || normalizeToString(ev.title) || '',
              position: normalizeToString(ev.position) || normalizeToString(ev.stage) || '',
              impact: normalizeToString(ev.impact) || normalizeToString(ev.description) || '',
            }
          }
          return { name: '', position: '', impact: '' }
        }) 
      : [],
  }
}

// normalizeChaptersData
function normalizeChaptersData(data: any): any {
  if (!data) return { chapterCount: 0, volumes: [], chapters: [] }

  var normalizeVolume = function (vol: any) {
    if (!vol) return vol
    return {
      ...vol,
      name: normalizeToString(vol.name),
      summary: normalizeToString(vol.summary),
      coreObjective: normalizeToString(vol.coreObjective),
    }
  }

  var chapterIdCounter = 0
  var cleanChapterTitle = function(title: string): string {
    if (!title) return ''
    // 🔥 Bug2修复：彻底清洗重复的"第X章"前缀
    var cleaned = title.trim()
    // 去除所有"第X章"前缀（包括重复的、中文数字的）
    cleaned = cleaned.replace(/第\d+章\s*/g, '')
    cleaned = cleaned.replace(/第[一二三四五六七八九十百千\d]+章\s*/g, '')
    // 去除重复的纯数字前缀
    cleaned = cleaned.replace(/^\d+\s*/, '')
    // 如果标题为空，给个默认值
    if (!cleaned.trim()) cleaned = ''
    return cleaned.trim()
  }
  var cleanChapterSummary = function(summary: string): string {
    if (!summary) return ''
    var s = summary.replace(/^[\d\s.、。，,;:：\-]+/g, '').replace(/[\[\]【】]/g, '')
    return s.trim()
  }
  var normalizeChapter = function (ch: any, index?: number) {
    if (!ch) return ch
    var uniqueId = ch.id || `ch-v${ch.volume || 1}-c${ch.chapterNumber || (index ?? 0) + 1}-${Date.now()}-${++chapterIdCounter}`
    return {
      ...ch,
      id: uniqueId,
      title: cleanChapterTitle(ch.title),
      summary: cleanChapterSummary(ch.summary),
      shuangPoints: Array.isArray(ch.shuangPoints) ? ch.shuangPoints.map(normalizeToString) : [],
      hook: normalizeToString(ch.hook),
      wordCount: typeof ch.wordCount === 'number' ? ch.wordCount : (parseInt(ch.wordCount) || 3000),
      volume: typeof ch.volume === 'number' ? ch.volume : (parseInt(ch.volume) || 1),
      chapterNumber: typeof ch.chapterNumber === 'number' ? ch.chapterNumber : (parseInt(ch.chapterNumber) || (index !== undefined ? index + 1 : 1)),
      status: normalizeToString(ch.status) || 'planned',
    }
  }

  return {
    chapterCount: (data.chapters && Array.isArray(data.chapters) ? data.chapters.length : 0)
      || (data.volumes ? data.volumes.reduce(function(sum: number, v: any) { return sum + ((v.chapters && Array.isArray(v.chapters)) ? v.chapters.length : 0); }, 0) : 0)
      || data.chapterCount || 0,
    volumes: Array.isArray(data.volumes) ? data.volumes.map(normalizeVolume) : [],
    chapters: Array.isArray(data.chapters) ? data.chapters.map(normalizeChapter) : [],
    totalWordCount: data.totalWordCount || (data.chapters && Array.isArray(data.chapters) ? data.chapters.reduce(function(sum: number, ch: any) { return sum + (typeof ch.wordCount === 'number' ? ch.wordCount : (parseInt(ch.wordCount) || 3000)); }, 0) : 0),
  }
}

function normalizeKeyPlotsData(data: any, ctx?: any): any {
  if (!data) return { keyPlots: [], volumes: [], coreConflict: '', turningPoints: [], climax: '', ending: '' }
  var _kpSourceIsEmpty = !(Array.isArray(data.keyPlots) && data.keyPlots.length > 0)
    && !(Array.isArray(data.volumes) && data.volumes.length > 0)
    && !(Array.isArray(data.turningPoints) && data.turningPoints.length > 0)
    && !normalizeToString(data.coreConflict)
  if (_kpSourceIsEmpty && ctx) {
    data = deriveKeyPlots(buildStoryContext(ctx))
  }

  // 归一化 keyPlots 数组字段名
  var rawKeyPlots: any[] = Array.isArray(data.keyPlots) ? data.keyPlots : []
  var keyPlots: any[] = rawKeyPlots.map(function(kp: any, idx: number) {
    if (!kp || typeof kp !== 'object') return { title: '节点' + (idx + 1), summary: '', volume: 1, importance: 'medium', shuangPoints: [] }
    return {
      title: normalizeToString(kp.title || kp.plotName || kp.name || ('剧情节点' + (idx + 1))),
      summary: normalizeToString(kp.summary || kp.plotSummary || kp.description || kp.content || ''),
      volume: typeof kp.volume === 'number' ? kp.volume : (parseInt(kp.volume) || parseInt(kp.chapterRange?.match(/\d+/)?.[0]) || Math.ceil((idx + 1) / 3)),
      importance: normalizeToString(kp.importance || kp.level || 'medium'),
      shuangPoints: Array.isArray(kp.shuangPoints) ? kp.shuangPoints.map(normalizeToString)
        : (Array.isArray(kp.coolPoint) ? kp.coolPoint : (kp.coolPoint ? [String(kp.coolPoint)] : [])),
    }
  })

  // 卷数据：同时接受 volumes / volumePlan / chapters.volumes 三种字段
  var rawVolumes: any[] = Array.isArray(data.volumes) ? data.volumes :
    (Array.isArray(data.volumePlan) ? data.volumePlan :
    (Array.isArray((data as any).chapters?.volumes) ? (data as any).chapters.volumes : []))
  // 对每一卷补齐缺失字段（name/summary/coreObjective）
  var volumes: any[] = rawVolumes.map(function(v: any, idx: number) {
    var obj: any = { ...(v || {}) }
    obj.order = obj.order ?? (idx + 1)
    obj.name = normalizeToString(obj.name || obj.volumeName || obj.title || ('第' + (idx + 1) + '卷'))
    obj.summary = normalizeToString(obj.summary || obj.overview || obj.description || '')
    var _origSummary = obj.summary
    // 🔥 彻底移除标签式拼接：不用"核心目标：开篇：高潮："这种模板结构
    // 当summary过短时，从各字段提取内容融合成自然段落，而非简单标签拼接
    // 🔥 修复重复bug：先检查已有内容，避免重复拼接相同剧情
    var _openingText = obj.openingNode?.event ? String(obj.openingNode.event).trim().replace(/^[，。！？、；：]+/, '') : ''
    var _climaxText = obj.climaxNode?.event ? String(obj.climaxNode.event).trim().replace(/^[，。！？、；：]+/, '') : ''
    var _objText = obj.summary
    function _textAlreadyContains(source: string, target: string): boolean {
      if (!target || target.length < 6) return true
      var key = target.slice(0, Math.min(10, target.length))
      return source.indexOf(key) !== -1
    }
    if (obj.summary.length < 40) {
      var _parts: string[] = []
      if (obj.summary && obj.summary.length > 5) {
        _parts.push(obj.summary.replace(/[。！？]+$/, ''))
      }
      if (obj.coreObjective && String(obj.coreObjective).length > 5) {
        var _coText = String(obj.coreObjective).trim()
        if (!_textAlreadyContains(_objText, _coText)) {
          _parts.push(_coText)
        }
      }
      if (_openingText && _openingText.length > 5) {
        if (!_textAlreadyContains(_objText, _openingText)) {
          _parts.push('故事从' + _openingText)
        }
      }
      if (_climaxText && _climaxText.length > 5) {
        if (!_textAlreadyContains(_objText, _climaxText)) {
          _parts.push('最终迎来' + _climaxText)
        }
      }
      if (Array.isArray(obj.keyEvents) && obj.keyEvents.length > 0) {
        var _ke = obj.keyEvents.slice(0, 2).map(function(e: any) { return String(e || '').trim() }).filter(function(s: string) { return s.length > 3 })
        if (_ke.length > 0) {
          var _keJoined = _ke.join('、')
          if (!_textAlreadyContains(_objText, _keJoined)) {
            _parts.push('期间经历' + _keJoined)
          }
        }
      }
      if (_parts.length > 0) {
        obj.summary = _parts.join('，') + '。'
      }
    }
    // 卷摘要字数下限 120 字——不用套话兜底，用具体剧情内容扩展
    if (obj.summary.length < 120) {
      var _fillerParts: string[] = []
      if (obj.coreObjective && String(obj.coreObjective).length > 10 && obj.summary.indexOf(String(obj.coreObjective).slice(0, 10)) === -1) {
        _fillerParts.push(String(obj.coreObjective).trim())
      }
      if (_openingText && _openingText.length > 10) {
        if (obj.summary.indexOf(_openingText.slice(0, 8)) === -1 && obj.summary.indexOf('故事从') === -1) {
          _fillerParts.push('故事从' + _openingText + '徐徐展开')
        }
      }
      if (_climaxText && _climaxText.length > 10) {
        if (obj.summary.indexOf(_climaxText.slice(0, 8)) === -1 && obj.summary.indexOf('最终') === -1) {
          _fillerParts.push('最终走向' + _climaxText + '的高潮')
        }
      }
      if (_fillerParts.length > 0) {
        obj.summary = obj.summary.replace(/[。！？]+$/, '') + _fillerParts.join('，') + '。'
      }
      // 如果还是不够，从keyEvents里再取
      if (obj.summary.length < 100 && Array.isArray(obj.keyEvents) && obj.keyEvents.length > 2) {
        var _moreKe = obj.keyEvents.slice(2, 4).map(function(e: any) { return String(e || '').trim() }).filter(function(s: string) { return s.length > 3 })
        if (_moreKe.length > 0) {
          var _moreText = _moreKe.join('、')
          if (obj.summary.indexOf(_moreText.slice(0, 6)) === -1) {
            obj.summary = obj.summary.replace(/[。！？]+$/, '') + '途中还将' + _moreText + '。'
          }
        }
      }
    }
    if (typeof obj.summary === 'string' && obj.summary.length > 180) {
      var cutoff = obj.summary.substring(0, 178)
      var lastPunc = Math.max(cutoff.lastIndexOf('。'), cutoff.lastIndexOf('！'), cutoff.lastIndexOf('？'))
      obj.summary = lastPunc > 120 ? cutoff.substring(0, lastPunc + 1) : cutoff + '。'
    }
    obj.coreObjective = normalizeToString(obj.coreObjective || obj.objective || obj.summary.slice(0, 60))
    if (!obj.keyEvents || !Array.isArray(obj.keyEvents)) obj.keyEvents = []
    return obj
  })
  var coreConflict = normalizeToString(data.coreConflict || data.mainConflict || data.conflict || '')
  var climax = normalizeToString(data.climax || data.highPoint || data.climaxEvent || '')
  var ending = normalizeToString(data.ending || data.end || data.finale || '')
  var turningPoints: any[] = Array.isArray(data.turningPoints) ? data.turningPoints :
    (Array.isArray(data.turning_points) ? data.turning_points : [])

  // 从 keyPlots 补齐 coreConflict / climax / ending / turningPoints
  if (keyPlots.length > 0) {
    if (!coreConflict || coreConflict.length < 10) coreConflict = keyPlots[0].summary?.slice(0, 150) || coreConflict
    if (!climax || climax.length < 10) climax = keyPlots[Math.max(0, keyPlots.length - 2)]?.summary?.slice(0, 150) || climax
    if (!ending || ending.length < 10) ending = keyPlots[keyPlots.length - 1]?.summary?.slice(0, 150) || ending
    if (turningPoints.length === 0) {
      keyPlots.forEach(function(kp: any, i: number) {
        if (i > 0 && i < keyPlots.length - 1 && (kp.importance === 'high' || kp.importance === 'medium')) {
          turningPoints.push({
            name: kp.title,
            description: kp.summary,
            position: '第' + kp.volume + '卷',
            impact: (kp.shuangPoints || []).join('、'),
          })
        }
      })
    }
    // 无 volumes 时从 keyPlots 按卷聚合
    if (volumes.length === 0) {
      var volMap: Record<number, any> = {}
      keyPlots.forEach(function(kp: any) {
        var vn = kp.volume || 1
        if (!volMap[vn]) {
          volMap[vn] = { name: '第' + vn + '卷', coreObjective: '', openingNode: { event: '' }, climaxNode: { event: '' }, endHook: { content: '' }, keyEvents: [] as string[] }
        }
        volMap[vn].keyEvents.push(kp.title)
        if (!volMap[vn].openingNode?.event) volMap[vn].openingNode = { event: kp.summary }
        if (kp.importance === 'high') volMap[vn].climaxNode = { event: kp.summary }
        volMap[vn].endHook = { content: (kp.summary || '').slice(0, 80) }
        volMap[vn].coreObjective = ''
      })
      volumes = Object.keys(volMap).sort(function(a, b) { return Number(a) - Number(b) }).map(function(k) { return volMap[Number(k)] })
    }
  }

  if (!coreConflict) coreConflict = ''
  if (!climax) climax = ''
  if (!ending) ending = ''

  return {
    ...data,
    keyPlots,
    volumes,
    coreConflict,
    climax,
    ending,
    turningPoints,
  }
}

function createDefaultChar(role: string): any {
  return {
    id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: '',
    role,
    age: 25,
    gender: '',
    appearance: '',
    personality: '',
    background: '',
    motivation: '',
    growthArc: '',
    classicLines: [''],
    identity: '',
    coreMotivation: '',
    skills: [],
    relationships: [],
    keyPlotPoints: [],
    hiddenTraits: '',
    weaknesses: '',
    attributes: {
      strength: 50,
      intelligence: 50,
      command: 50,
      politics: 50,
      charm: 50,
    },
  }
}

// ============================================================================
// 🔥🔥🔥 2026-09-11 严重 bug 修复：书架↔向导草稿箱双向同步 + 删除同步
//   根因：书架草稿箱读服务端 /api/novels(status==='drafting')，向导草稿箱只读
//        localStorage['tuzhong-drafts-index']，两套数据源互不相通；删除互不通知。
//   方案：服务端为唯一权威源；localStorage 仅补充「服务端尚未建单」的临时草稿；
//        删除统一走 deleteDraftShared()（服务端删除 + 本地清理 + 事件广播），
//        同页自定义事件 + 跨标签 storage 事件，两侧即时同步。供 page.tsx 复用。
// ============================================================================
export interface DraftEntry {
  id: string
  title: string
  lastStep: string
  updatedAt: number
  genre?: string
  coverUrl?: string
  wordCount?: number
  lastModified?: string
  fromServer?: boolean
}

export const DRAFTS_INDEX_KEY = 'tuzhong-drafts-index'
export const DRAFTS_SERVER_IDS_KEY = 'tuzhong-drafts-server-ids'
export const ACTIVE_NOVEL_ID_KEY = 'tuzhong-active-novel-id'
export const PENDING_OPEN_DRAFT_KEY = 'tuzhong-pending-open-draft'
export const DRAFTS_CHANGED_EVENT = 'tuzhong-drafts-changed'
const DRAFTS_MAX = 30
const DRAFT_LOCAL_KEY_PREFIXES = [
  'tuzhong-draft-data-',
  'tuzhong-draft-step-',
  'tuzhong-draft-theme-',
  'tuzhong-draft-chapters-',
  'tuzhong-draft-chapter-idx-',
  'tuzhong-draft-volume-',
]

/** 读取本地草稿索引（容错，永不抛错） */
export function readLocalDraftsIndex(): DraftEntry[] {
  try {
    const raw = localStorage.getItem(DRAFTS_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((d: any) => d && d.id) : []
  } catch { return [] }
}

function writeLocalDraftsIndex(list: DraftEntry[]) {
  try { localStorage.setItem(DRAFTS_INDEX_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

function readServerDraftIds(): string[] {
  try {
    const raw = localStorage.getItem(DRAFTS_SERVER_IDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((x: any) => String(x)) : []
  } catch { return [] }
}

function writeServerDraftIds(ids: string[]) {
  try { localStorage.setItem(DRAFTS_SERVER_IDS_KEY, JSON.stringify(Array.from(new Set(ids.filter(Boolean))))) } catch { /* ignore */ }
}

/** 仅保留「进行中」草稿（lastStep 存在且非 complete） */
export function filterInProgressDrafts(list: DraftEntry[]): DraftEntry[] {
  return (list || []).filter((d) => d && d.id && d.lastStep && d.lastStep !== 'complete')
}

/** 拉取服务端草稿列表（status==='drafting'）；失败返回 [] */
export async function fetchServerDrafts(): Promise<any[]> {
  try {
    const token = localStorage.getItem('token') || ''
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = 'Bearer ' + token
    const r = await fetch('/tuzhong-wenshu/api/novels', { headers })
    if (!r || !r.ok) return []
    const j = await r.json()
    if (!j || !Array.isArray(j.data)) return []
    return j.data.filter((n: any) => n && n.id && String(n.status) === 'drafting')
  } catch { return [] }
}

function serverDraftToEntry(n: any, local?: DraftEntry): DraftEntry {
  const ts = Date.parse(String(n.lastModified || n.updatedAt || ''))
  return {
    id: String(n.id),
    title: (local && local.title) || n.title || '（未命名草稿）',
    // 服务端不携带 lastStep（由向导本地记录），故优先本地、缺省 'idea'
    lastStep: (local && local.lastStep) || 'idea',
    updatedAt: (local && local.updatedAt) || (isNaN(ts) ? Date.now() : ts),
    genre: (local && local.genre) || n.genre || '',
    coverUrl: (local && local.coverUrl) || n.coverUrl || n.cover || '',
    wordCount: Number(n.wordCount || 0),
    lastModified: String(n.lastModified || ''),
    fromServer: true,
  }
}

/**
 * 服务端 ∪ 本地，按 id 去重（同 id 以服务端为准）；并剪除「服务端曾存在、现已被删」的条目。
 * knownServerIds = 上一次对账时服务端存在的 id 集合，用于识别服务端侧删除。
 */
export function buildDraftUnion(serverDrafts: any[], localIndex: DraftEntry[], knownServerIds: string[]): DraftEntry[] {
  const serverList = Array.isArray(serverDrafts) ? serverDrafts.filter((n) => n && n.id) : []
  const serverIds = new Set(serverList.map((n) => String(n.id)))
  const known = new Set((knownServerIds || []).map(String))
  // 本地项：服务端已删（曾存在 now 不存在）→ 剪除；其余保留（含服务端尚未建单的临时草稿）
  const localKept = (localIndex || []).filter((d) => {
    const id = String(d && d.id)
    if (!id) return false
    if (known.has(id) && !serverIds.has(id)) return false
    return true
  })
  const byId = new Map<string, DraftEntry>()
  localKept.forEach((d) => byId.set(String(d.id), Object.assign({}, d, { fromServer: serverIds.has(String(d.id)) })))
  serverList.forEach((n) => {
    const id = String(n.id)
    byId.set(id, serverDraftToEntry(n, byId.get(id)))
  })
  const list = Array.from(byId.values())
  list.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
  return list.slice(0, DRAFTS_MAX)
}

/**
 * 与服务端对账：剪除已删 → 并集去重 → 写回本地索引 & 服务端 id 集合 → 返回「进行中」列表。
 * 服务端列表为空时同样执行（用于收敛两侧 id 集合），失败时回退本地索引。
 */
export function reconcileDraftsWithServer(serverDrafts: any[]): DraftEntry[] {
  try {
    const local = readLocalDraftsIndex()
    const known = readServerDraftIds()
    const union = buildDraftUnion(serverDrafts, local, known)
    writeLocalDraftsIndex(union)
    writeServerDraftIds((Array.isArray(serverDrafts) ? serverDrafts : []).map((n) => String(n && n.id)).filter(Boolean))
    return filterInProgressDrafts(union)
  } catch {
    return filterInProgressDrafts(readLocalDraftsIndex())
  }
}

/** 广播草稿变更（同页跨组件即时同步；跨标签页由 storage 事件覆盖） */
export function notifyDraftsChanged(detail?: { deletedId?: string; wasActive?: boolean }) {
  try { window.dispatchEvent(new CustomEvent(DRAFTS_CHANGED_EVENT, { detail: detail || {} })) } catch { /* ignore */ }
}

/**
 * 统一删除草稿：服务端删除 + 本地索引/副本清理 + 悬挂 active 清理 + 事件广播。
 * 书架与向导两侧必须调用同一个本函数，禁止各写一套。
 */
export async function deleteDraftShared(draftId: string, _title?: string): Promise<{ ok: boolean; serverDeleted: boolean }> {
  if (!draftId) return { ok: false, serverDeleted: false }
  let serverDeleted = false
  try {
    const token = localStorage.getItem('token') || ''
    const res = await fetch('/tuzhong-wenshu/api/novels?id=' + encodeURIComponent(draftId), {
      method: 'DELETE',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
    serverDeleted = !!res && res.ok
  } catch { serverDeleted = false }

  // ① 本地 per-draft 副本
  try { for (const p of DRAFT_LOCAL_KEY_PREFIXES) localStorage.removeItem(p + draftId) } catch { /* ignore */ }
  // ② 本地索引
  writeLocalDraftsIndex(readLocalDraftsIndex().filter((d) => String(d.id) !== String(draftId)))
  // ③ 服务端 id 集合
  writeServerDraftIds(readServerDraftIds().filter((id) => String(id) !== String(draftId)))
  // ④ 悬挂引用：被删的正是当前 active → 清 key
  let wasActive = false
  try {
    if ((localStorage.getItem(ACTIVE_NOVEL_ID_KEY) || '') === draftId) {
      wasActive = true
      localStorage.removeItem(ACTIVE_NOVEL_ID_KEY)
    }
    if ((localStorage.getItem(PENDING_OPEN_DRAFT_KEY) || '') === draftId) localStorage.removeItem(PENDING_OPEN_DRAFT_KEY)
  } catch { /* ignore */ }
  // ⑤ 广播
  notifyDraftsChanged({ deletedId: draftId, wasActive })
  return { ok: true, serverDeleted }
}

interface AIGenerateWizardProps {
  onClose?: () => void
  onComplete?: (data: {
    title: string
    description: string
    genre: string
    chapters: Array<{ id: string; title: string; content: string; wordCount: number; status: string }>
    volumes?: Array<{ id?: string; name?: string; summary?: string; coreObjective?: string; order?: number; chapters?: any[] }>
  }, generatedData?: GeneratedData) => void
  initialGenre: string
  isCreating?: boolean
  embedded?: boolean
}

type Step = 'input' | 'idea' | 'synopsis' | 'outline' | 'worldbuilding' | 'characters' | 'relationships' | 'factions' | 'powerSystem' | 'chapters' | 'keyPlots' | 'content' | 'generating' | 'checklist' | 'cover' | 'finalCheck' | 'complete'

export interface GeneratedData {
  // 🔥 修订计数器（运行时注入的额外字段，由分步保存/回返恢复逻辑维护）
  _charsRev?: number
  _secRev?: Record<string, number>
  idea?: {
    title: string
    tagline: string
    sellingPoints: string[]
    targetAudience: string
    coreConflict: string
    keywords: string[]
    [key: string]: any
  }
  synopsis?: {
    shortIntro: string
    fullIntro: string
    tags: string[]
    sellingPoints: string[]
    [key: string]: any
  }
  outline?: {
    storyOrigin: string
    stages: Array<{
      name: string
      summary: string
      mainEvents: string[]
      shuangPoints: string[]
      powerLevel: string
    }>
    ending: string
    mainPlot: string[]
    worldBuilding: {
      era: string
      setting: string
      powerSystem: string
      factions: string[]
      [key: string]: any
    }
    keyEvents: Array<{ name: string; position: string; impact: string }>
    [key: string]: any
  }
  worldbuilding?: {
    era: string
    geography: string
    history: string
    rules: string[]
    socialStructure: string
    technology: string
    powerSystem: string
    [key: string]: any
  }
  chapters?: {
    volumes: Array<{
      name: string
      summary: string
      coreObjective: string
      chapters: Array<{
        id: string
        title: string
        summary: string
        shuangPoints: string[]
        hook: string
        volume: number
        chapterNumber: number
        wordCount: number
        status: string
      }>
      [key: string]: any
    }>
    chapters: Array<{
      id: string
      title: string
      summary: string
      shuangPoints: string[]
      hook: string
      volume: number
      chapterNumber: number
      wordCount: number
      status: string
    }>
    chapterCount: number
    totalWordCount: number
    generatedContent?: Array<{
      id: string
      title: string
      content: string
      wordCount: number
      status: string
    }>
    titleCharCount?: number
    volumeTitleLengths?: number[]
    [key: string]: any
  }
  characters?: {
    protagonist: any
    femaleLead: any
    antagonist: any
    supporting: any[]
    _harem?: any
  }
  relationships?: {
    relationships: Array<{
      from: string
      to: string
      type: string
      initialRelation: string
      development: string
      keyEvents: string
      emotionChange: string
      finalRelation: string
      description: string
      [key: string]: any
    }>
  }
  factions?: {
    factions: Array<{
      name: string
      type: string
      strength: string
      leader: string
      description: string
      territory: string
      [key: string]: any
    }>
    [key: string]: any
  }
  powerSystem?: {
    protagonistAbility: any
    worldPowerSystem: any
    [key: string]: any
  }
  keyPlots?: {
    coreConflict: string
    turningPoints: Array<{ name: string; position: string; description: string; impact: string }>
    climax: string
    ending: string
    volumes?: Array<{
      name: string
      summary: string
      keyEvents: string[]
      shuangPoints: string[]
      coreObjective?: string
      openingNode?: { event?: string }
      climaxNode?: { event?: string }
      [key: string]: any
    }>
    [key: string]: any
  }
  cover?: any
  coverUrl?: string
  // 🔥 万能仿写·拆书结果
  bookAnalysis?: {
    analysis: any
    mapping: Record<string, string>
    bookName: string
    bookGenre: string
    totalChapters: number
    avgChapterWords: number
    promptTemplate?: string
  }
}

export default function AIGenerateWizard({ onClose, onComplete, initialGenre, isCreating, embedded }: AIGenerateWizardProps) {
  var __TEST_MODE__ = false
  var [step, setStep] = useState<Step>('input')
  // 🔥 2026-11-05 刷新保持向导步骤：step 写入 localStorage，刷新/重开后回到原步骤（数据由快照+后端同步恢复）
  var _WIZARD_STEPS = ['input','idea','synopsis','outline','worldbuilding','characters','relationships','factions','powerSystem','chapters','keyPlots','content','generating','checklist','cover','finalCheck','complete']
  useEffect(function() {
    try {
      if (typeof window === 'undefined') return
      var _saved = localStorage.getItem('tuzhong-wizard-step')
      if (_saved && _WIZARD_STEPS.indexOf(_saved) >= 0) {
        setStep(_saved as Step)
        console.log('[WizardStep] 已恢复步骤:', _saved)
      }
    } catch (_se) {}
  }, [])
  useEffect(function() {
    try { if (typeof window !== 'undefined') localStorage.setItem('tuzhong-wizard-step', step) } catch (_se2) {}
  }, [step])
  var [keywords, setKeywords] = useState('')
  var [detailedDesignInput, setDetailedDesignInput] = useState('')
  var [userBookTitle, setUserBookTitle] = useState('')
  var [genre, setGenre] = useState(initialGenre)
  // 🔥 2026-09-06 输入主题恢复修复：keywords/genre 的 ref 镜像，
  //   用于异步（如从服务端回填 genre）前判断当前值，避免覆盖用户已填内容
  var genreRef = useRef(genre)
  var keywordsRef = useRef(keywords)
  useEffect(function () { genreRef.current = genre }, [genre])
  useEffect(function () { keywordsRef.current = keywords }, [keywords])
  // 🔥 主角设定：性别、姓名、年龄、身份背景（基于AI小说全类型人物角色名字自动生成设计规则）
  var [protagonistName, setProtagonistName] = useState('')
  var [protagonistGender, setProtagonistGender] = useState('')
  var [protagonistAge, setProtagonistAge] = useState('')
  var [protagonistIdentity, setProtagonistIdentity] = useState('')
  var [isLoading, setIsLoading] = useState(false)
  var [regeneratingField, setRegeneratingField] = useState<string | null>(null)
  var [progress, setProgress] = useState(0)
  var [generatedData, setGeneratedData] = useState<GeneratedData>({})
  var [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  var [generatedChapters, setGeneratedChapters] = useState<Array<{ id: string; title: string; content: string; wordCount: number; status: string }>>([])
  var generatedChaptersRef = useRef<Array<{ id: string; title: string; content: string; wordCount: number; status: string }>>([])
  var generatedDataRef = useRef<GeneratedData>({})
  var [regeneratePrompt, setRegeneratePrompt] = useState('')
  var [globalError, setGlobalErrorState] = useState('')
  var [appendGraphInput, setAppendGraphInput] = useState('')
  var [llmConfig, setLlmConfig] = useState<{ provider: string; apiKey: string; baseUrl: string; model: string } | null>(null)
  var [showModelSelector, setShowModelSelector] = useState(false)
  var [availableModels, setAvailableModels] = useState<any[]>([])
  var [manualModel, setManualModel] = useState(false)
  var [isCompleting, setIsCompleting] = useState(false)
  var [volumeConfig, setVolumeConfig] = useState({ volumeCount: 5, chaptersPerVolume: 60 })
  var [userModifiedVolumeConfig, setUserModifiedVolumeConfig] = useState(false)
  // 🔥 卷数跟随关键剧情节点：keyPlots 就绪且用户未手动改过卷数时，自动按其实际卷数对齐（修复硬编码 5卷×60章）
  useEffect(function () {
    if (userModifiedVolumeConfig) return
    var _kp = (generatedData && (generatedData as any).keyPlots) || {}
    var _vols = Array.isArray(_kp.volumes) ? _kp.volumes : []
    if (_vols.length > 0) {
      setVolumeConfig(function (prev: { volumeCount: number; chaptersPerVolume: number }) {
        if (prev.volumeCount === _vols.length) return prev
        console.log('[Chapters] 🔥 卷数自动对齐分卷剧情结构:', prev.volumeCount, '→', _vols.length)
        return { volumeCount: _vols.length, chaptersPerVolume: prev.chaptersPerVolume || 60 }
      })
    }
  }, [generatedData, userModifiedVolumeConfig])
  var [chapterLoadingProgress, setChapterLoadingProgress] = useState('')
  var [isGeneratingCharacters, setIsGeneratingCharacters] = useState(false)
  var [charGenProgress, setCharGenProgress] = useState({ current: 0, total: 12 })
  // 🔥 第14轮：角色分批进度（4 批 × 5 人 = 20 人），用显示化进度卡让用户明确知道「首批已出 / 还有 N 批在路上」
  var [charBatchUi, setCharBatchUi] = useState<{ phase: 'idle'|'core'|'supplement'|'done', completed: number, total: number, targetBatch: number, currentBatch: number }>({ phase: 'idle', completed: 0, total: 20, targetBatch: 4, currentBatch: 0 })
  // 🔥🔥🔥 2026-09-02 修复图二（草稿箱·断点续创作）：
  //   ① 用 tuzhong-drafts-index 数组追踪所有进行中的作品（不止当前 active）
  //   ② 步骤变化 / 生成成功即把当前 active 写回索引（更新 lastStep/updatedAt/title）
  //   ③ 点击「📋 草稿箱」按钮打开列表，点开某条即恢复其 generatedData + step + 主题输入
  var [draftsIndex, setDraftsIndex] = useState<Array<{ id: string; title: string; lastStep: string; updatedAt: number; genre?: string; coverUrl?: string }>>([])
  var [showDraftBox, setShowDraftBox] = useState(false)
  var [draftBoxMsg, setDraftBoxMsg] = useState('')
  // 🔥 2026-09-07（#147）主题变更守卫的可见横幅（渲染在 wizard 主体，非草稿箱 Modal 内——Modal 已关闭时用户也能看到清空提示）
  var [themeGuardMsg, setThemeGuardMsg] = useState('')
  // 草稿箱恢复用：标记是否正在从草稿箱点击进入某个旧草稿（防止 mount 阶段误清空）
  var draftRestoreInProgressRef = useRef(false)
  // 🔥 2026-09-01 第13轮：角色分批生成的定时器句柄，重新生成 / 组件卸载时统一清理，避免幽灵批次串数据
  var charBatchTimersRef = useRef<any[]>([])
  var clearCharBatchTimers = function () {
    try {
      var _list = charBatchTimersRef.current || []
      for (var _ti = 0; _ti < _list.length; _ti++) { clearTimeout(_list[_ti]); clearInterval(_list[_ti]) }
    } catch (_ce) { /* 清理异常忽略 */ }
    charBatchTimersRef.current = []
  }
  // 🔥 每启动一轮分批生成自增：重新生成时让上一轮在途批次自动作废，防止旧角色串进新结果
  var charBatchEpochRef = useRef<number>(0)
  // 🔥 2026-09-01 第17轮：人物阵容模式（决定角色分批配额与主要人物设定环节输出的人设构成）
  //   single=单女主 / dual=双女主 / harem=后宫·多女主。三套均为 15 名、3 批 × 5 人。
  var [charRomanceMode, setCharRomanceMode] = useState<'single' | 'dual' | 'harem'>('single')
  var [imitateMode, setImitateMode] = useState(false)
  var [imitateSearch, setImitateSearch] = useState('')
  var [imitateData, setImitateData] = useState<any>(null)
  var imitateDataRef = useRef<any>(null)
  // 🔥 2026-11-06：异步回调（openDraft 服务端同步）读取最新搜索词的 ref
  var imitateSearchRef = useRef('')
  useEffect(function () { imitateSearchRef.current = imitateSearch }, [imitateSearch])
  // 🔥 三种创作方式：'normal'(普通) | 'imitate'(仿写) | 'fanfiction'(同人文) | 'custom'(自己设计)
  var [creationMode, setCreationMode] = useState<'normal' | 'imitate' | 'fanfiction' | 'custom'>('normal')
  var [appendRoleInput, setAppendRoleInput] = useState('')
  var abortCtrlRef = useRef<AbortController | null>(null)
  var genDebounceRef = useRef(0)
  var saveDebounceRef = useRef(0)
  // 🔥 #224：自动保存的「上一帧快照」，用于区分「真实内容变更」与「仅 rev 采纳」。
  //   服务端每次接受写入都会把 _secRev/_charsRev 加一（nextRev = max(srv,inc)+1），
  //   旧实现把新 rev setState 回 generatedData 又会触发下面的自动保存 effect →
  //   保存 → 采纳新 rev → 再保存 → 无限自激（实测静置 141s 仍每 2.7s 一次 POST，
  //   每次整库 9.8MB 落盘）。rev 采纳是 Object.assign({}, prev, {_charsRev,_secRev})，
  //   其余键保持同一引用，故用「浅引用比较」即可零成本识别 rev-only 变更并跳过保存。
  var lastGenSnapshotRef = useRef<any>(null)
  var chapterGenLockRef = useRef(false)  // 🔥 章节生成互斥锁，防止重复API调用
  var chapterConfigGenLockRef = useRef(false)  // 🔥🔥🔥 章节配置生成独立锁，防止componentGenerateChaptersFromConfig被重复调用

  // 🔥 2026-11-06 复测根因：_buildPersistedIdea 会被 beforeunload/防抖定时器以「首帧闭包」调用，
  //   直接读 state 永远拿到初始值（creationMode='normal'、imitate 为空）→ 服务端 idea 丢失仿写状态。
  //   与 genreRef 同模式，为 creationMode / bookAnalysisResult 建立实时 ref。
  var creationModeRef = useRef(creationMode)
  useEffect(function () { creationModeRef.current = creationMode }, [creationMode])
  var bookAnalysisResultRef = useRef<any>(null)

  // 🔥 2026-11-06：idea 落服务端时必须携带「输入主题」环节的交互状态（作品类型多选 / 创作模式 / 仿写原作品）。
  //   此前 genre/creationMode/imitate 只存浏览器 localStorage 快照，服务端 idea 里根本没有这些字段，
  //   换设备或清缓存后打开草稿就会出现：仿写作品显示为空、作品类型只剩小说记录里的单个旧值（图1/图2 的根因）。
  var _buildPersistedIdea = function (baseIdea: any) {
    var _idea = Object.assign({}, baseIdea || {})
    var _g = String(genreRef.current || '').trim()
    if (_g) _idea.genre = _g
    // 🔥 2026-11-06 复测发现：beforeunload/防抖等回调捕获的是首帧闭包，
    //   直接读 state（creationMode/imitateSearch/bookAnalysisResult）会拿到旧值 'normal'/空，
    //   导致服务端 idea.creationMode/imitate 丢失。全部改读 ref（与 genreRef 同一模式）。
    var _cm = creationModeRef.current
    _idea.creationMode = _cm
    if (_cm === 'imitate' || _cm === 'fanfiction') {
      var _im = imitateDataRef.current || null
      var _title = String(imitateSearchRef.current || (_im && _im.title) || '').trim()
      if (_title || _im || bookAnalysisResultRef.current) {
        _idea.imitate = { title: _title, analysis: _im || null, bookAnalysis: bookAnalysisResultRef.current || null }
      }
    }
    return _idea
  }

  var saveSettings = async function(data: any) {
    try {
      var novelId = localStorage.getItem('tuzhong-active-novel-id') || 'temp'
      if (!novelId || novelId === 'temp') return
      var _resp = await fetch('/tuzhong-wenshu/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          type: 'batch',
          // 🔥 #199 人物版本号回带：服务端据此拒绝旧快照整体回写
          _charsRev: (data && Number(data._charsRev)) || 0,
          // 🔥 #201 全环节版本号回带
          _secRev: (data && data._secRev && typeof data._secRev === 'object') ? data._secRev : {},
          worldbuilding: data.worldbuilding || {},
          powerSystem: data.powerSystem || {},
          characters: data.characters || {},
          factions: data.factions || {},
          relationships: data.relationships || {},
          keyPlots: data.keyPlots || {},
          idea: _buildPersistedIdea(data.idea),
          synopsis: data.synopsis || {},
          outline: data.outline || {},
        }),
      })
      // 🔥 #199/#201：保存成功后采纳服务端最新版本号；落后环节被拒收时定向回拉权威数据
      try {
        var _j = await _resp.json()
        var _revChanged = false
        if (_j && _j.data && _j.data._charsRev != null) {
          var _nv = Number(_j.data._charsRev) || 0
          if ((Number(generatedDataRef.current && generatedDataRef.current._charsRev) || 0) !== _nv) {
            _revChanged = true
            generatedDataRef.current = Object.assign({}, generatedDataRef.current, { _charsRev: _nv })
          }
        }
        if (_j && _j.data && _j.data._secRev && typeof _j.data._secRev === 'object') {
          var _curSecRev = (generatedDataRef.current && generatedDataRef.current._secRev) || {}
          if (JSON.stringify(_curSecRev) !== JSON.stringify(_j.data._secRev)) {
            _revChanged = true
            generatedDataRef.current = Object.assign({}, generatedDataRef.current, { _secRev: _j.data._secRev })
          }
        }
        if (_revChanged) {
          var _finalRef = generatedDataRef.current
          setGeneratedData(function (prev: any) { return Object.assign({}, prev, { _charsRev: _finalRef._charsRev, _secRev: _finalRef._secRev }) })
          try { localStorage.setItem('tuzhong-generated-data', JSON.stringify(generatedDataRef.current)) } catch (_le) {}
        }
        var _staleList: string[] = []
        if (_j && _j.staleCharacters) _staleList.push('characters')
        if (_j && Array.isArray(_j.staleSections)) _staleList = _staleList.concat(_j.staleSections)
        if (_staleList.length > 0) {
          console.warn('[Settings] #199/#201 落后环节被拒收，定向回拉:', _staleList.join(','))
          resyncSections(novelId, _staleList)
        }
      } catch (_je) {}
      console.log('[Settings] Saved successfully')
    } catch (e) {
      console.warn('[WARN] Failed to save settings')
    }
  }

  var debouncedSave = useCallback(function(data: any) {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current)
    }
    saveDebounceRef.current = window.setTimeout(async function() {
      await saveSettings(data)
    }, 2000)
  }, [])

  // 🔥 修复3：角色页 characters 变更后立即落盘（不等 2s 防抖 / 不依赖步骤切换触发 persistDraftProgress）。
  //   背景：StepCharacters「一键校正徽章与定位」onChange 只写 React state，用户停留角色页时
  //   syncDraftFromServer 的服务端权威整体覆盖会把旧 title 打回。
  //   实现：同步把 corrected characters 合入 generatedDataRef（不受 React 批处理时序影响），
  //   记录校正时间戳（保护窗口依据），再走既有 saveSettings —— 上送回带最新 _charsRev/_secRev，
  //   被服务端 #199/#201 拒收时自动走既有 resyncSections 定向回拉流程，不破坏版本守卫语义。
  var persistCharactersChange = function (updated: any) {
    try {
      var _cur: any = generatedDataRef.current || {}
      generatedDataRef.current = Object.assign({}, _cur, { characters: updated })
      charCorrectedAtRef.current = Date.now()
      // 节流：5s 内多次变更只立即落盘一次，其余由既有 2s 防抖保存兜底
      var _now = Date.now()
      if (_now - _lastCharsPersistAtRef.current < 5000) return
      _lastCharsPersistAtRef.current = _now
      void saveSettings(generatedDataRef.current)
    } catch (_e) { console.warn('[StepCharacters onChange] characters 立即落盘失败:', _e) }
  }

  // 🔥 Bug修复：保持 generatedDataRef 始终与 generatedData 同步，解决 React 闭包陷阱
  useEffect(function () {
    generatedDataRef.current = generatedData
  }, [generatedData])

  // 🔥 草稿箱重开主题恢复关键修复：标志位，确保"先恢复、后写 localStorage"，避免 mount 时空状态把已存的快照覆盖
  var themeInputRestoredRef = useRef(false)

  // 🔥 问题1修复：持久化"输入主题"环节状态，草稿重开不再为空
  useEffect(function () {
    // 【关键】恢复未完成时禁止写入；否则首次 mount 会用空状态覆盖已存的 tuzhong-theme-input
    if (!themeInputRestoredRef.current) return
    try {
      localStorage.setItem('tuzhong-theme-input', JSON.stringify({
        keywords: keywords, genre: genre, detailedDesignInput: detailedDesignInput,
        protagonistName: protagonistName, userBookTitle: userBookTitle,
        protagonistGender: protagonistGender, protagonistAge: protagonistAge,
        protagonistIdentity: protagonistIdentity, creationMode: creationMode
      }))
    } catch (_e) { /* ignore */ }
  }, [keywords, genre, detailedDesignInput, protagonistName, userBookTitle, protagonistGender, protagonistAge, protagonistIdentity, creationMode])

  // 🔥 保持 imitateDataRef 始终与 imitateData 同步，解决 React 闭包陷阱
  useEffect(function () {
    imitateDataRef.current = imitateData
  }, [imitateData])

  // 🔥 问题4修复：页面加载时从 localStorage 恢复步骤状态和生成数据，避免修复bug后回退到主页
  useEffect(function() {
    queueMicrotask(function() {
      try {
        var savedStep = localStorage.getItem('tuzhong-current-step')
        var steps: Step[] = ['input', 'idea', 'synopsis', 'outline', 'worldbuilding', 'powerSystem', 'characters', 'relationships', 'factions', 'keyPlots', 'chapters', 'content', 'generating', 'complete']
        if (savedStep && steps.indexOf(savedStep as Step) !== -1 && savedStep !== 'input') {
          setStep(savedStep as Step)
        }
        var savedData = localStorage.getItem('tuzhong-generated-data')
        if (savedData) {
          var parsed = JSON.parse(savedData)
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            // 🔥 2026-09-03 任务②：从 localStorage 主题快照读 detailedDesignInput，作为徽章 title 覆盖源
            var _restoreDesignInput = ''
            try {
              var _thRaw = localStorage.getItem('tuzhong-theme-input')
              if (_thRaw) {
                var _th2 = JSON.parse(_thRaw)
                if (_th2 && _th2.detailedDesignInput) _restoreDesignInput = _th2.detailedDesignInput
              }
              if (!_restoreDesignInput && parsed.idea && parsed.idea.userDesign) _restoreDesignInput = parsed.idea.userDesign
            } catch (_ee) { /* ignore */ }
            // 🔥 2026-09-02 第六轮补强：恢复历史草稿时重新归一化 characters/factions/relationships，
            //   使 contradiction 截断修复、势力多源描述兜底、关系枚举修复对旧数据同样生效（无需重新生成）。
            try {
              // 🔥 2026-09-05：构建上下文，供简介/大纲/关键剧情等环节在为空时确定性派生贴题内容
              var _rctx: any = {
                idea: parsed.idea, worldbuilding: parsed.worldbuilding,
                powerSystem: parsed.powerSystem, characters: parsed.characters,
                factions: parsed.factions, genre: (parsed.idea && parsed.idea.genre) || '',
                protagonistName: (parsed.idea && parsed.idea.protagonistName) || (parsed.characters && parsed.characters.protagonist && parsed.characters.protagonist.name) || '',
              }
              if (parsed.characters) parsed.characters = normalizeCharactersData(parsed.characters, _restoreDesignInput)
              parsed.factions = normalizeFactionsData(parsed.factions || {}, {
                protagonistName: (parsed.idea?.protagonistName) || (parsed.characters?.protagonist?.name) || '',
                genre: parsed.idea?.genre || (parsed.keywords && parsed.keywords.jointGenre) || '',
                era: parsed.worldbuilding?.era || '',
                keywords: Array.isArray(parsed.idea?.keywords) ? parsed.idea.keywords.join('、') : '',
              } as any)
              if (parsed.relationships) parsed.relationships = normalizeRelationshipsData(parsed.relationships)
              // 🔥 2026-09-05：简介/大纲/关键剧情节点 —— 为空时由上下文派生，杜绝"请点击上方按钮重新生成"
              if ((parsed.synopsis && typeof parsed.synopsis === 'object') || parsed.synopsis !== undefined) parsed.synopsis = normalizeSynopsisData(parsed.synopsis, _rctx)
              if (parsed.outline) parsed.outline = normalizeOutlineData(parsed.outline, _rctx)
              if (parsed.keyPlots) parsed.keyPlots = normalizeKeyPlotsData(parsed.keyPlots, _rctx)
              if (parsed.worldbuilding) parsed.worldbuilding = normalizeWorldbuildingData(parsed.worldbuilding)
            } catch (_e) { console.warn('[Restore] 草稿重归一化失败:', _e) }
            setGeneratedData(parsed)
          }
          // 🔥 问题1修复：恢复"输入主题"环节状态（优先用专门的theme-input快照，回退到idea派生）
          try {
            var _themeRaw = localStorage.getItem('tuzhong-theme-input')
            if (_themeRaw) {
              var _th = JSON.parse(_themeRaw)
              if (_th) {
                // 🔥 2026-09-06 输入主题恢复修复：keywords/genre 快照为空时，从 generatedData.idea 回填
                var _resolvedInput = resolveInputFromIdea((parsed && parsed.idea) || null, _th.keywords, _th.genre)
                if (_resolvedInput.keywords) setKeywords(_resolvedInput.keywords)
                if (_resolvedInput.genre) setGenre(_resolvedInput.genre)
                // 🔥 #217 快照可能比服务端 idea.userDesign 旧/截断 → reconcile 补全
                setDetailedDesignInput(function (prev: string) {
                  var _snapDesign = typeof _th.detailedDesignInput === 'string' ? _th.detailedDesignInput : ''
                  var _serverDesign = ((parsed && parsed.idea && parsed.idea.userDesign) || '') as string
                  return _reconcileDesignInput(_snapDesign, _serverDesign)
                })
                if (_th.protagonistName) setProtagonistName(_th.protagonistName)
                if (_th.userBookTitle) setUserBookTitle(_th.userBookTitle)
                if (_th.protagonistGender) setProtagonistGender(_th.protagonistGender)
                if (_th.protagonistAge) setProtagonistAge(_th.protagonistAge)
                if (_th.protagonistIdentity) setProtagonistIdentity(_th.protagonistIdentity)
                // 🔥 修复2：服务端 idea.userSpecifiedIdentity 非空即为权威值，覆盖浏览器旧快照
                //   （快照可能是旧口径，如「程序员雨田诺」；服务端已是修正后的「史学青年」口径）
                var _srvIdentity = (parsed && parsed.idea && (parsed.idea as any).userSpecifiedIdentity) || ''
                if (_srvIdentity) setProtagonistIdentity(String(_srvIdentity))
                if (_th.creationMode) setCreationMode(_th.creationMode)
                // 🔥 2026-09-06 输入主题类型回填：从服务端作品记录补齐 genre
                backfillGenreFromServer(localStorage.getItem('tuzhong-active-novel-id') || '')
              }
            } else if (parsed && parsed.idea) {
              var _id = parsed.idea
              var _resolvedInput2 = resolveInputFromIdea(_id, '', (_id as any).genre || '')
              if (_resolvedInput2.genre) setGenre(_resolvedInput2.genre)
              if (_resolvedInput2.keywords) setKeywords(_resolvedInput2.keywords)
              if (_id.userDesign) setDetailedDesignInput(_id.userDesign)
              if (_id.protagonistName) setProtagonistName(_id.protagonistName)
              if (_id.title) setUserBookTitle(_id.title)
              if (_id.userSpecifiedGender) setProtagonistGender(_id.userSpecifiedGender)
              if (_id.userSpecifiedAge) setProtagonistAge(String(_id.userSpecifiedAge))
              if (_id.userSpecifiedIdentity) setProtagonistIdentity(_id.userSpecifiedIdentity)
              // 🔥 #226 缺陷1修复：草稿恢复时补回 creationMode。
              //   此前该回退分支（tuzhong-theme-input 快照缺失）从不恢复 creationMode，而 useState 初值为 'normal'，
              //   于是「自己设计」卡片不高亮、无 ✓，但详细设定输入区却有内容（用户报的 bug）。
              //   优先级：服务端 idea.creationMode（权威值）> 语义推断（userDesign 非空 → 'custom'，否则 'normal'）。
              var _restoreCM = ''
              if (typeof (_id as any).creationMode === 'string' && (_id as any).creationMode) {
                _restoreCM = (_id as any).creationMode
              } else if (typeof _id.userDesign === 'string' && _id.userDesign.trim()) {
                _restoreCM = 'custom'
              } else {
                _restoreCM = 'normal'
              }
              if (_restoreCM === 'imitate' || _restoreCM === 'fanfiction' || _restoreCM === 'custom' || _restoreCM === 'normal') {
                setCreationMode(_restoreCM as 'normal' | 'imitate' | 'fanfiction' | 'custom')
                // 与卡片点击行为保持一致：仿写/同人文联动 imitateMode（供 buildImitatePayload 判定）
                setImitateMode(_restoreCM === 'imitate' || _restoreCM === 'fanfiction')
              }
              backfillGenreFromServer(localStorage.getItem('tuzhong-active-novel-id') || '')
            }
          } catch (_te) { /* ignore */ }
        }
        var savedVolConfig = localStorage.getItem('tuzhong-volume-config')
        if (savedVolConfig) {
          var parsedVol = JSON.parse(savedVolConfig)
          // 🔥 修复：忽略旧的 3卷100章 默认配置与 testMode 残留的 1卷3章，强制走正常计算
          if (parsedVol && parsedVol.volumeCount && parsedVol.chaptersPerVolume && !(parsedVol.volumeCount === 3 && parsedVol.chaptersPerVolume === 100) && !(parsedVol.volumeCount === 1 && parsedVol.chaptersPerVolume === 3)) {
            setVolumeConfig(parsedVol)
            setUserModifiedVolumeConfig(true)
          } else {
            // 清除旧的默认配置
            localStorage.removeItem('tuzhong-volume-config')
          }
        }
        var savedChapters = localStorage.getItem('tuzhong-generated-chapters')
        if (savedChapters) {
          var parsedChs = JSON.parse(savedChapters)
          if (Array.isArray(parsedChs) && parsedChs.length > 0) {
            setGeneratedChapters(parsedChs)
            generatedChaptersRef.current = parsedChs
          }
        }
        var savedChapterIdx = localStorage.getItem('tuzhong-current-chapter-idx')
        if (savedChapterIdx) {
          var idx = parseInt(savedChapterIdx, 10)
          if (!isNaN(idx) && idx >= 0) {
            setCurrentChapterIndex(idx)
          }
        }
      } catch (e) {
        console.warn('[Restore] Failed to restore state from localStorage:', e)
      }
      // 🔥 修复：状态恢复后强制重置isLoading，防止卡在true导致按钮禁用
      setIsLoading(false)
      setRegeneratingField(null)
      // 🔥 主题输入恢复完成后再放行持久化 effect（避免 mount 时空状态覆盖已存快照）
      themeInputRestoredRef.current = true
    })
  }, [])

  // 🔥🔥🔥 2026-09-02 修复图二·草稿箱断点续创作：
  // 🔥 2026-09-07（#144）草稿服务器优先同步：草稿箱/挂载恢复此前只读 localStorage，
  //   用户换浏览器/清缓存/服务端数据已修复重生成时，本地旧数据会"原问题显示"（用户实测反馈）。
  //   所有生成步骤都会 persistDraftProgress 落盘到服务端 settings → 服务端为权威数据源。
  //   打开草稿/挂载恢复后异步拉取服务端数据：有有效 idea 时整体覆盖本地 generatedData 并写回 localStorage。
  // 🔥 修复3：角色页「一键校正徽章与定位」/手动编辑角色后，本地 characters 的最新修改时间戳。
  //   syncDraftFromServer 回包合并时若处于 5 分钟保护窗口内，保留本地 characters 不被服务端旧数据覆盖。
  var charCorrectedAtRef = useRef<number>(0)
  // 🔥 修复3：立即落盘节流（5s 内只发一次全量 batch，密集编辑交给既有 2s 防抖兜底）
  var _lastCharsPersistAtRef = useRef<number>(0)

  var syncDraftFromServer = function (novelId: string) {
    if (!novelId || String(novelId).indexOf('draft-') === 0) return
    try {
      var _token = localStorage.getItem('token') || ''
      var _headers: Record<string, string> = {}
      if (_token) _headers['Authorization'] = 'Bearer ' + _token
      fetch('/tuzhong-wenshu/api/settings?novelId=' + encodeURIComponent(novelId), { headers: _headers })
        .then(function (r) { return r && r.ok ? r.json() : null })
        .then(function (j) {
          if (!j || !j.success || !j.data) return
          var _s: any = j.data
          // 服务端无有效生成数据（没有 idea）则不同步，避免空数据覆盖本地
          if (!_s.idea || typeof _s.idea !== 'object') return
          var _serverData: any = {}
          var _keys = ['idea', 'worldbuilding', 'powerSystem', 'characters', 'factions', 'relationships', 'keyPlots', 'synopsis', 'outline', 'chapters']
          for (var _i = 0; _i < _keys.length; _i++) {
            var _k = _keys[_i]
            if (_s[_k] && typeof _s[_k] === 'object') _serverData[_k] = _s[_k]
          }
          // 🔥 #199 服务端人物版本号随快照下发，保存时回带（落后回写会被服务端拒收）
          _serverData._charsRev = Number(_s._charsRev) || 0
          // 🔥 #201 全环节版本号随快照下发
          _serverData._secRev = (_s._secRev && typeof _s._secRev === 'object') ? _s._secRev : {}
          // 🔥 2026-09-08 #161 封面恢复：服务端快照 cover.coverUrl 映射回 generatedData.coverUrl。
          //   缺失后果：草稿重开后封面步解锁门（hasStepData('cover')=!!coverUrl）失败被弹回，
          //   且草稿索引写入 coverUrl=undefined → 书架封面缩略图丢失。
          if (_s.cover && typeof _s.cover === 'object' && _s.cover.coverUrl) _serverData.coverUrl = _s.cover.coverUrl
          if (!_serverData.idea) return
          try {
            var _designInput = ''
            try { var _t = JSON.parse(localStorage.getItem('tuzhong-draft-theme-' + novelId) || 'null'); if (_t && _t.detailedDesignInput) _designInput = _t.detailedDesignInput } catch (_e2) {}
            if (_serverData.characters) _serverData.characters = normalizeCharactersData(_serverData.characters, _designInput)
            if (_serverData.factions) _serverData.factions = normalizeFactionsData(_serverData.factions, {
              protagonistName: (_serverData.idea && _serverData.idea.protagonistName) || (_serverData.characters && _serverData.characters.protagonist && _serverData.characters.protagonist.name) || '',
              genre: (_serverData.idea && _serverData.idea.genre) || '',
              era: (_serverData.worldbuilding && _serverData.worldbuilding.era) || '',
              keywords: Array.isArray(_serverData.idea && _serverData.idea.keywords) ? _serverData.idea.keywords.join('、') : '',
            } as any)
            if (_serverData.relationships) _serverData.relationships = normalizeRelationshipsData(_serverData.relationships)
          } catch (_ne) { console.warn('[DraftSync] #144 服务端草稿重归一化失败:', _ne) }
          // 🔥 修复3：角色页刚编辑/校正过徽章（5 分钟保护窗口内）→ 保留本地 characters，
          //   防止在途的服务端权威整体覆盖把已校正的 title/定位打回旧值（仅 characters 环节受保护）。
          if (_serverData.characters && charCorrectedAtRef.current > 0 && (Date.now() - charCorrectedAtRef.current) < 5 * 60 * 1000) {
            var _localChars = generatedDataRef.current && generatedDataRef.current.characters
            if (_localChars && typeof _localChars === 'object') {
              _serverData.characters = _localChars
              console.log('[DraftSync] 修复3 校正保护窗口内：保留本地 characters，不被服务端覆盖:', novelId)
            }
          }
          // 写回 localStorage（下次打开离线也能拿到新数据）
          try { localStorage.setItem('tuzhong-draft-data-' + novelId, JSON.stringify(_serverData)) } catch (_e3) {}
          // 仅当是该草稿仍为活跃草稿时热替换当前会话状态
          if ((localStorage.getItem('tuzhong-active-novel-id') || '') === novelId) {
            setGeneratedData(_serverData)
            generatedDataRef.current = _serverData
            try { localStorage.setItem('tuzhong-generated-data', JSON.stringify(_serverData)) } catch (_e4) {}
            // 卷章框架以服务端 chapters.volumes / keyPlots.volumes 设计卷数对齐
            try {
              var _sv = _serverData.chapters && Array.isArray(_serverData.chapters.volumes) ? _serverData.chapters.volumes.length : 0
              var _kv = _serverData.keyPlots && Array.isArray(_serverData.keyPlots.volumes) ? _serverData.keyPlots.volumes.length : 0
              var _dv = _sv > 0 ? _sv : _kv
              if (_dv > 0) setVolumeConfig(function (prev: any) { return { volumeCount: _dv, chaptersPerVolume: (prev && prev.chaptersPerVolume) || 60 } })
            } catch (_e5) {}
            // 🔥 #217 输入主题字段随服务端权威数据补全（reconcile 只增不删，绝不缩短用户本地编辑）
            var _serverDesign = (_serverData.idea && typeof _serverData.idea.userDesign === 'string') ? _serverData.idea.userDesign : ''
            if (_serverDesign) {
              setDetailedDesignInput(function (prev: string) { return _reconcileDesignInput(prev, _serverDesign) })
              try {
                var _thKey = 'tuzhong-draft-theme-' + novelId
                var _thObj: any = {}
                try { _thObj = JSON.parse(localStorage.getItem(_thKey) || '{}') || {} } catch (_e6) { _thObj = {} }
                if (_reconcileDesignInput(_thObj.detailedDesignInput || '', _serverDesign) === _serverDesign && _thObj.detailedDesignInput !== _serverDesign) {
                  _thObj.detailedDesignInput = _serverDesign
                  localStorage.setItem(_thKey, JSON.stringify(_thObj))
                }
              } catch (_e7) { /* ignore */ }
            }
            // 🔥 修复2：服务端 idea.userSpecifiedIdentity 非空即为权威值 → 覆盖本地身份口径，
            //   并回写 per-draft 主题快照，避免下次打开又恢复旧身份。
            var _syncSrvIdentity = (_serverData.idea && (_serverData.idea as any).userSpecifiedIdentity) || ''
            if (_syncSrvIdentity) {
              setProtagonistIdentity(String(_syncSrvIdentity))
              try {
                var _thKey2 = 'tuzhong-draft-theme-' + novelId
                var _thObj2: any = {}
                try { _thObj2 = JSON.parse(localStorage.getItem(_thKey2) || '{}') || {} } catch (_e10) { _thObj2 = {} }
                if (_thObj2.protagonistIdentity !== String(_syncSrvIdentity)) {
                  _thObj2.protagonistIdentity = String(_syncSrvIdentity)
                  localStorage.setItem(_thKey2, JSON.stringify(_thObj2))
                }
              } catch (_e9) { /* ignore */ }
            }
            // 关键词为空时从服务端 idea.userKeywords/keywords 回填（resolveInputFromIdea 已有该逻辑，复用）
            var _rinput = resolveInputFromIdea(_serverData.idea, '', '')
            setKeywords(function (prev: string) { return (prev && prev.trim()) ? prev : _rinput.keywords })
            if (!String(genreRef.current || '').trim() && _rinput.genre) setGenre(_rinput.genre)
            console.log('[DraftSync] #144 已从服务端同步草稿数据:', novelId)
          }
        })
        .catch(function (_e) { console.warn('[DraftSync] #144 服务端同步失败:', _e) })
    } catch (_e) { /* ignore */ }
  }

  // 🔥 Bug1 修复（草稿箱两套数据源互不相通）：以服务端 /tuzhong-wenshu/api/novels（status==='drafting'）为唯一权威源，
  //   把服务端草稿按 id 并集去重合并进本地 draftsIndex，使「书架草稿箱」与「向导内草稿箱」同源；
  //   结果写回 localStorage['tuzhong-drafts-index']，刷新后仍在。请求失败静默降级（保留本地索引），绝不抛错/阻断渲染。
  // 🔥 Bug1 修复：以服务端为权威源对账草稿列表（含剪除服务端已删项、并集去重、跨端同步）。
  //   注意：即便服务端返回 0 条也必须执行（用于收敛两侧 id 集合、剔除本地残留）。
  var mergeServerDraftsIntoIndex = function () {
    try {
      fetchServerDrafts().then(function (list) {
        var _reconciled = reconcileDraftsWithServer(list)
        setDraftsIndex(_reconciled)
      }).catch(function (_e) { console.warn('[DraftBox] 服务端草稿对账失败（保留本地索引）:', _e) })
    } catch (_e) { /* 静默降级，绝不阻断渲染 */ }
  }

  // 🔥 #199/#201 定向回拉：保存时某些环节被判「落后回写」拒收后，只从服务端拉取被拒环节覆盖本地
  //   （服务端赢策略）。不做整体 setGeneratedData 替换——保住本地其他环节未被拒的新编辑。
  var resyncSections = function (novelId: string, sections: string[]) {
    if (!novelId || String(novelId).indexOf('draft-') === 0 || !sections || !sections.length) return
    try {
      var _token2 = localStorage.getItem('token') || ''
      var _headers2: Record<string, string> = {}
      if (_token2) _headers2['Authorization'] = 'Bearer ' + _token2
      fetch('/tuzhong-wenshu/api/settings?novelId=' + encodeURIComponent(novelId), { headers: _headers2 })
        .then(function (r) { return r && r.ok ? r.json() : null })
        .then(function (j) {
          if (!j || !j.success || !j.data) return
          var _s: any = j.data
          setGeneratedData(function (prev: any) {
            var _upd: any = Object.assign({}, prev)
            for (var _i = 0; _i < sections.length; _i++) {
              var _k = sections[_i]
              if (_s[_k] !== undefined) _upd[_k] = _s[_k]
            }
            if (_s._secRev && typeof _s._secRev === 'object') _upd._secRev = _s._secRev
            if (_s._charsRev != null) _upd._charsRev = Number(_s._charsRev) || 0
            try {
              if (_upd.characters && typeof _upd.characters === 'object') {
                var _designInput = ''
                try { var _t = JSON.parse(localStorage.getItem('tuzhong-draft-theme-' + novelId) || 'null'); if (_t && _t.detailedDesignInput) _designInput = _t.detailedDesignInput } catch (_e2) {}
                _upd.characters = normalizeCharactersData(_upd.characters, _designInput)
              }
            } catch (_ne) { /* 归一化失败不阻塞回拉 */ }
            generatedDataRef.current = _upd
            try { localStorage.setItem('tuzhong-generated-data', JSON.stringify(_upd)) } catch (_e3) {}
            try { localStorage.setItem('tuzhong-draft-data-' + novelId, JSON.stringify(_upd)) } catch (_e4) {}
            return _upd
          })
          console.log('[Settings] #199/#201 已定向回拉被拒环节:', sections.join(','))
        })
        .catch(function (_e) { console.warn('[Settings] #199/#201 定向回拉失败:', _e) })
    } catch (_e) { /* ignore */ }
  }

  //   ① 挂载时从 tuzhong-drafts-index 读取所有进行中的草稿，渲染草稿箱列表
  //   ② 当步骤变化 / 关键数据变化时，把当前 active 草稿同步写回索引（更新 lastStep/updatedAt/title）
  //   ③ 当 idea 步骤首次生成成功 → 自动给当前 active 分配/创建一个持久化草稿 id 并加入索引
  //   ④ 从草稿箱点击打开旧草稿 → 重新设置 active id、加载 generatedData + step + 主题输入
  useEffect(function () {
    try {
      var saved = localStorage.getItem('tuzhong-drafts-index')
      if (saved) {
        var parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // 过滤掉已完成(complete)/封面的，仅保留进行中的
          var inProgress = parsed.filter(function (d: any) { return d && d.id && d.lastStep && d.lastStep !== 'complete' })
          setDraftsIndex(inProgress)
        }
      }
      // 🔥 #144 挂载恢复后异步拉取服务端最新草稿数据（换浏览器/清缓存/服务端已修复时本地旧数据自动更新）
      var _mountActiveId = localStorage.getItem('tuzhong-active-novel-id') || ''
      if (_mountActiveId) syncDraftFromServer(_mountActiveId)
      // 🔥 Bug1 修复：挂载后以服务端为权威源合并草稿箱列表（换浏览器/清缓存后书架有草稿则向导同样可见）
      mergeServerDraftsIntoIndex()
      // 🔥 2026-09-11：书架草稿箱点「继续创作」时写入的待打开草稿 → 向导挂载后立即恢复
      try {
        var _pendingOpen = localStorage.getItem(PENDING_OPEN_DRAFT_KEY) || ''
        if (_pendingOpen) {
          localStorage.removeItem(PENDING_OPEN_DRAFT_KEY)
          var _plist = filterInProgressDrafts(readLocalDraftsIndex())
          var _pentry = _plist.filter(function (d: any) { return String(d.id) === String(_pendingOpen) })[0]
          window.setTimeout(function () {
            openDraft(_pentry || { id: _pendingOpen, title: '（未命名草稿）', lastStep: 'idea' })
          }, 0)
        }
      } catch (_e2) { /* ignore */ }
    } catch (_e) { /* ignore */ }
  }, [])

  // 草稿箱删除「当前正在编辑」的草稿后，把向导复位到「新建」状态，避免留下指向已删 id 的悬挂引用
  var resetWizardToNew = function () {
    try {
      draftRestoreInProgressRef.current = false
      setGeneratedData({})
      generatedDataRef.current = {}
      setGeneratedChapters([])
      generatedChaptersRef.current = []
      setCurrentChapterIndex(0)
      try { localStorage.removeItem('tuzhong-generated-data') } catch (_e0) { /* ignore */ }
      try { localStorage.setItem('tuzhong-current-step', 'input') } catch (_e1) { /* ignore */ }
      setStep('input')
      setDraftBoxMsg('该草稿已删除，已回到「新建创作」。')
      window.setTimeout(function () { setDraftBoxMsg('') }, 2500)
    } catch (_e) { console.warn('[DraftBox] 复位到新建失败:', _e) }
  }

  // 🔥 2026-09-11 严重 bug 修复：书架↔向导草稿箱「删除/变更」双向同步
  //   同页：自定义事件 tuzhong-drafts-changed；跨标签页：storage 事件（草稿索引 / active id 变化）
  useEffect(function () {
    var refreshFromLocal = function () {
      try { setDraftsIndex(filterInProgressDrafts(readLocalDraftsIndex())) } catch (_e0) { /* ignore */ }
    }
    var onDraftsChanged = function (e: any) {
      var detail = (e && e.detail) || {}
      refreshFromLocal()
      mergeServerDraftsIntoIndex()
      if (detail && detail.wasActive) resetWizardToNew()
    }
    var onStorage = function (e: any) {
      try {
        if (!e || !e.key) return
        if (e.key === DRAFTS_INDEX_KEY || e.key === ACTIVE_NOVEL_ID_KEY) {
          refreshFromLocal()
          mergeServerDraftsIntoIndex()
        }
      } catch (_e1) { /* ignore */ }
    }
    window.addEventListener(DRAFTS_CHANGED_EVENT, onDraftsChanged)
    window.addEventListener('storage', onStorage)
    return function () {
      window.removeEventListener(DRAFTS_CHANGED_EVENT, onDraftsChanged)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // 步骤变化 / 数据更新时同步草稿索引
  useEffect(function () {
    if (!themeInputRestoredRef.current) return
    if (!step || step === 'input') return
    if (draftRestoreInProgressRef.current) return  // 正在恢复旧草稿时不写索引（防止把别人的数据当成"当前"覆盖）
    try {
      var activeId = localStorage.getItem('tuzhong-active-novel-id') || ''
      if (!activeId) return
      var index: any[] = []
      try { index = JSON.parse(localStorage.getItem('tuzhong-drafts-index') || '[]') } catch (_e) { index = [] }
      var _gd: any = generatedData || {}
      var _ideaTitle: string = String((_gd.idea && _gd.idea.title) || '').trim()
      var _userTitle: string = String(userBookTitle || '').trim()
      var _title: string = _ideaTitle || _userTitle || ('未命名草稿 · ' + (genre ? genre.split(',')[0] : ''))
      var _entry: any = {
        id: activeId,
        title: _title,
        lastStep: step,
        updatedAt: Date.now(),
        genre: genre,
        coverUrl: _gd.coverUrl,
      }
      var _existingIdx = -1
      for (var _ei = 0; _ei < index.length; _ei++) { if (index[_ei] && index[_ei].id === activeId) { _existingIdx = _ei; break } }
      if (_existingIdx >= 0) index[_existingIdx] = _entry
      else index.unshift(_entry)
      // 限制索引最多保留 30 条
      if (index.length > 30) index = index.slice(0, 30)
      localStorage.setItem('tuzhong-drafts-index', JSON.stringify(index))
      setDraftsIndex(index.filter(function (d: any) { return d && d.id && d.lastStep && d.lastStep !== 'complete' }))
    } catch (_e) { /* ignore */ }
  }, [step, userBookTitle, genre, generatedData])

  // 🔥 2026-09-06 输入主题恢复修复：当快照中 keywords/genre 缺失时，
  //   从已持久化的 generatedData.idea（userKeywords / genre）回填，
  //   避免草稿重开「输入主题」环节关键词/类型显示为空、需要重新选择。
  var resolveInputFromIdea = function (idea: any, snapshotKw: string, snapshotGe: string): { keywords: string; genre: string } {
    var k = snapshotKw || ''
    var g = snapshotGe || ''
    if (!String(k).trim() && idea) {
      var uk = idea.userKeywords
      if (Array.isArray(uk)) k = (uk as string[]).filter(Boolean).join('、')
      else if (typeof uk === 'string') k = uk.trim()
      else if (Array.isArray(idea.keywords)) k = (idea.keywords as any[]).filter(Boolean).join('、')
      else if (idea.keywords && typeof idea.keywords === 'string') k = (idea.keywords as string).trim()
    }
    // 🔥 修复1：genre 为逗号拼接多选串 —— 快照与服务端 idea.genre 都非空时取「类型数多者胜」
    //   （相等取快照），修复服务端单值/旧值导致多选回显只剩 1 个的问题。
    if (idea && idea.genre) {
      var _ig = String(idea.genre).trim()
      var _sg = String(g).trim()
      if (_ig && _sg) {
        var _snapCount = _sg.split(',').filter(function (s: string) { return !!s.trim() }).length
        var _ideaCount = _ig.split(',').filter(function (s: string) { return !!s.trim() }).length
        if (_ideaCount > _snapCount) g = _ig
      } else if (_ig) {
        g = _ig
      }
    }
    return { keywords: k, genre: g }
  }

  // 🔥 #217 输入主题完整显示修复：本地快照可能比服务端 idea.userDesign 旧/截断
  //   （换设备、清缓存、粘贴中途被防抖快照保存）。以「更完整者」为准：
  //   服务端更长或本地为空 → 采用服务端补全；本地更长（用户后续手动补写）→ 保留本地。
  var _reconcileDesignInput = function (localVal: string, serverVal: string): string {
    var _l = typeof localVal === 'string' ? localVal : ''
    var _s = typeof serverVal === 'string' ? serverVal : ''
    if (!_s.trim()) return _l
    if (!_l.trim()) return _s
    return _s.length > _l.length ? _s : _l
  }

  // 🔥 2026-09-06 输入主题类型回填：快照与 idea 均无 genre 时，从服务端作品记录回填
  //   （旧作品的 genre 只存在于服务端 books/novels 数据，本地 idea 无 genre 字段）。
  // 🔥 修复1：服务端 genre 与当前 genre 求并集（逗号分隔去重），仅当并集比当前多时才更新 ——
  //   服务端返回完整多选串时补齐本地缺失类型，且不再因「当前非空」直接跳过回填。
  var backfillGenreFromServer = function (novelId: string) {
    if (!novelId) return
    try {
      // 🔥 2026-11-06：补 Authorization 头——此前只带 cookie，服务端按 userId 过滤时 401/查不到，
      //   genre 回填静默失败（作品类型恢复缺数据的根因之一）
      var _bgHeaders: Record<string, string> = {}
      try { var _bgTok = localStorage.getItem('token') || ''; if (_bgTok) _bgHeaders['Authorization'] = 'Bearer ' + _bgTok } catch (_hge) {}
      fetch('/tuzhong-wenshu/api/novels?id=' + encodeURIComponent(novelId), {
        credentials: 'same-origin',
        headers: _bgHeaders
      }).then(function (r) { return r.json() }).then(function (j) {
        var g = j && j.data && j.data.genre
        if (!g) return
        var _srv = String(g).trim()
        if (!_srv) return
        var _cur = String(genreRef.current || '').trim()
        if (!_cur) { setGenre(_srv); return }
        var _seen: Record<string, boolean> = {}
        var _parts: string[] = []
        var _addParts = function (raw: string) {
          var _arr = raw.split(',')
          for (var _ai = 0; _ai < _arr.length; _ai++) {
            var _t = String(_arr[_ai] || '').trim()
            if (_t && !_seen[_t]) { _seen[_t] = true; _parts.push(_t) }
          }
        }
        _addParts(_cur)
        _addParts(_srv)
        var _curCount = _cur.split(',').filter(function (s: string) { return !!s.trim() }).length
        if (_parts.length > _curCount) setGenre(_parts.join(','))
      }).catch(function () {})
    } catch (_e) { /* ignore */ }
  }

  // 点开草稿 → 恢复
  var openDraft = function (draft: any) {
    if (!draft || !draft.id) return
    try {
      draftRestoreInProgressRef.current = true
      setShowDraftBox(false)
      // 1) 把 active 切到目标草稿
      localStorage.setItem('tuzhong-active-novel-id', draft.id)
      // 2) 加载对应草稿的数据 / 步骤 / 主题
      var _dataKey = 'tuzhong-draft-data-' + draft.id
      var _stepKey = 'tuzhong-draft-step-' + draft.id
      var _themeKey = 'tuzhong-draft-theme-' + draft.id
      var _chaptersKey = 'tuzhong-draft-chapters-' + draft.id
      var _chapterIdxKey = 'tuzhong-draft-chapter-idx-' + draft.id
      var _volKey = 'tuzhong-draft-volume-' + draft.id
      var _loadedData: any = null
      try { var _raw = localStorage.getItem(_dataKey); if (_raw) _loadedData = JSON.parse(_raw) } catch (_e) { _loadedData = null }
      var _loadedStep = localStorage.getItem(_stepKey) || draft.lastStep || 'idea'
      var _loadedTheme: any = null
      try { var _traw = localStorage.getItem(_themeKey); if (_traw) _loadedTheme = JSON.parse(_traw) } catch (_e) { _loadedTheme = null }
      // 🔥 2026-09-03 任务②：从草稿主题快照恢复 detailedDesignInput，作为徽章 title 的最高优先级映射源
      var _loadedDesignInput = _loadedTheme && _loadedTheme.detailedDesignInput ? _loadedTheme.detailedDesignInput : ''
      if (_loadedData) {
        // 🔥 2026-09-02 第六轮补强：从草稿箱打开历史草稿同样先重归一化（与挂载恢复一致），
        //   保证旧草稿中的截断字段 / 空势力描述 / 空关系枚举在打开瞬间即被修复。
        try {
          // 🔥 2026-09-05：构建设计上下文，供简介/大纲/关键剧情环节为空时确定性派生贴题内容
          var _lctx: any = {
            idea: _loadedData.idea, worldbuilding: _loadedData.worldbuilding,
            powerSystem: _loadedData.powerSystem, characters: _loadedData.characters,
            factions: _loadedData.factions, genre: (_loadedData.idea && _loadedData.idea.genre) || '',
            protagonistName: (_loadedData.idea && _loadedData.idea.protagonistName) || (_loadedData.characters && _loadedData.characters.protagonist && _loadedData.characters.protagonist.name) || '',
          }
          if (_loadedData.characters) _loadedData.characters = normalizeCharactersData(_loadedData.characters, _loadedDesignInput)
          _loadedData.factions = normalizeFactionsData(_loadedData.factions || {}, {
            protagonistName: (_loadedData.idea?.protagonistName) || (_loadedData.characters?.protagonist?.name) || '',
            genre: _loadedData.idea?.genre || (_loadedData.keywords && _loadedData.keywords.jointGenre) || '',
            era: _loadedData.worldbuilding?.era || '',
            keywords: Array.isArray(_loadedData.idea?.keywords) ? _loadedData.idea.keywords.join('、') : '',
          } as any)
          if (_loadedData.relationships) _loadedData.relationships = normalizeRelationshipsData(_loadedData.relationships)
          // 🔥 2026-09-05：草稿恢复时同步清洗 大纲-背景设定(力量体系整块) 与 力量体系(金手指/体系名/体系类型)
          if (_loadedData.outline) _loadedData.outline = normalizeOutlineData(_loadedData.outline, _lctx)
          if (_loadedData.synopsis) _loadedData.synopsis = normalizeSynopsisData(_loadedData.synopsis, _lctx)
          if (_loadedData.keyPlots) _loadedData.keyPlots = normalizeKeyPlotsData(_loadedData.keyPlots, _lctx)
          if (_loadedData.worldbuilding) _loadedData.worldbuilding = normalizeWorldbuildingData(_loadedData.worldbuilding)
        } catch (_e) { console.warn('[DraftBox] 草稿重归一化失败:', _e) }
        setGeneratedData(_loadedData)
        generatedDataRef.current = _loadedData
        // 同步到全局键（兼容性）
        try { localStorage.setItem('tuzhong-generated-data', JSON.stringify(_loadedData)) } catch (_e) {}
        // 🔥 2026-11-05 openDraft 金手指同步：草稿数据（localStorage）的金手指可能是旧版——
        //   异步拉服务端 settings 的 powerSystem，若服务端为「中兴币」新版而草稿为旧版 → 以服务端覆盖
        ;(function (_draftNovelId: string) {
          try {
            if (!_draftNovelId || _draftNovelId === 'temp') return
            var _odHeaders: Record<string, string> = {}
            try { var _odTok = localStorage.getItem('token') || ''; if (_odTok) _odHeaders['Authorization'] = 'Bearer ' + _odTok } catch (_ohe) {}
            fetch('/tuzhong-wenshu/api/settings?novelId=' + encodeURIComponent(_draftNovelId), { credentials: 'same-origin', headers: _odHeaders })
              .then(function (r) { return r.ok ? r.json() : null })
              .then(function (j) {
                // 🔥 2026-11-06：服务端 idea 恢复（仿写原作品 + 作品类型多选）——
                //   本地快照缺失/过期时以服务端 idea.imitate / idea.genre 为准补齐（图1/图2 根因修复）。
                var _srvIdea = j && j.data && j.data.idea
                if (_srvIdea) {
                  var _srvIm = _srvIdea.imitate || _srvIdea.imitateData
                  if (_srvIm) {
                    try {
                      var _odIm = typeof _srvIm === 'string' ? JSON.parse(_srvIm) : _srvIm
                      var _odImTitle = String((_odIm && _odIm.title) || '').trim()
                      if (_odImTitle && !String(imitateSearchRef.current || '').trim()) {
                        setImitateMode(true)
                        setImitateSearch(_odImTitle)
                        if (!imitateDataRef.current && (_odIm.analysis || _odIm.title)) setImitateData(_odIm.analysis || _odIm)
                        if (!bookAnalysisResult && _odIm.bookAnalysis) setBookAnalysisResult(_odIm.bookAnalysis)
                        try { localStorage.setItem('tuzhong-imitate-data', JSON.stringify(_odIm)) } catch (_oie) {}
                        console.log('[openDraft] 已从服务端恢复仿写原作品:', _odImTitle)
                      }
                    } catch (_odImE) {}
                  }
                  var _srvGenreStr = String(_srvIdea.genre || '').trim()
                  if (_srvGenreStr) {
                    var _odCur = String(genreRef.current || '').trim()
                    var _odSeen: Record<string, boolean> = {}
                    var _odParts: string[] = []
                    var _odAdd = function (raw: string) {
                      raw.split(',').forEach(function (s) { var t = String(s || '').trim(); if (t && !_odSeen[t]) { _odSeen[t] = true; _odParts.push(t) } })
                    }
                    _odAdd(_srvGenreStr)
                    _odAdd(_odCur)
                    if (_odParts.length > (_odCur ? _odCur.split(',').filter(function (s: string) { return !!s.trim() }).length : 0)) {
                      setGenre(_odParts.join(','))
                      console.log('[openDraft] 服务端 idea.genre 更完整 → 合并回填作品类型')
                    }
                  }
                }
                var _srvPS = j && j.data && j.data.powerSystem
                if (!_srvPS || typeof _srvPS !== 'object') return
                var _srvPA = _srvPS.protagonistAbility
                if (!_srvPA) return
                var _srvDesc = String(_srvPA.description || '')
                var _curDesc = String((generatedDataRef.current.powerSystem && generatedDataRef.current.powerSystem.protagonistAbility && generatedDataRef.current.powerSystem.protagonistAbility.description) || '')
                if (_srvDesc.indexOf('中兴币') >= 0 && _curDesc.indexOf('中兴币') === -1) {
                  console.log('[openDraft 金手指同步] 草稿金手指为旧版 → 应用服务端最新版（中兴币设定）')
                  var _next = Object.assign({}, generatedDataRef.current, { powerSystem: _srvPS })
                  generatedDataRef.current = _next
                  setGeneratedData(_next)
                  try { localStorage.setItem('tuzhong-generated-data', JSON.stringify(_next)) } catch (_e2) {}
                  try { localStorage.setItem(_dataKey, JSON.stringify(_next)) } catch (_e3) {}
                }
              })
              .catch(function () {})
          } catch (_odE) {}
        })((draft && (draft.novelId || draft.id)) || (typeof localStorage !== 'undefined' ? (localStorage.getItem('tuzhong-active-novel-id') || '') : ''))
      }
      try {
        var _rawCh = localStorage.getItem(_chaptersKey)
        if (_rawCh) { var _chs = JSON.parse(_rawCh); if (Array.isArray(_chs)) { setGeneratedChapters(_chs); generatedChaptersRef.current = _chs } }
      } catch (_e) {}
      try { var _rawCi = localStorage.getItem(_chapterIdxKey); if (_rawCi) { var _ci = parseInt(_rawCi, 10); if (!isNaN(_ci) && _ci >= 0) setCurrentChapterIndex(_ci) } } catch (_e) {}
      try { var _rawVol = localStorage.getItem(_volKey); if (_rawVol) { var _vc = JSON.parse(_rawVol); if (_vc && _vc.volumeCount) {
        // 🔥 2026-09-06：草稿恢复时以“设计卷数”为准对齐卷配置，避免旧配置（如5卷×60章）覆盖设计卷数（10卷）。
        //   设计卷数优先级：草稿数据内卷章框架 > 关键剧情节点分卷结构 > 已生成章节框架。
        var _dataVols = _loadedData && _loadedData.chapters && Array.isArray(_loadedData.chapters.volumes) ? _loadedData.chapters.volumes.length : 0
        var _kpVols = _loadedData && _loadedData.keyPlots && Array.isArray(_loadedData.keyPlots.volumes) ? _loadedData.keyPlots.volumes.length : 0
        var _genVols = Array.isArray(generatedChaptersRef.current) ? generatedChaptersRef.current.length : 0
        var _designVols = _dataVols > 0 ? _dataVols : (_kpVols > 0 ? _kpVols : _genVols)
        if (_designVols > 0 && _vc.volumeCount !== _designVols) {
          // 配置与设计卷数不一致 → 以设计卷数为准对齐，且不标记为“用户手动修改”，让设计卷数真正生效
          setVolumeConfig({ volumeCount: _designVols, chaptersPerVolume: _vc.chaptersPerVolume || 60 })
          setUserModifiedVolumeConfig(false)
        } else {
          setVolumeConfig(_vc); setUserModifiedVolumeConfig(true)
        }
      } } } catch (_e) {}
      if (_loadedTheme) {
        // 🔥 2026-09-06 输入主题恢复修复：keywords/genre 快照为空时，从 generatedData.idea 回填
        var _resolvedInput = resolveInputFromIdea((_loadedData && _loadedData.idea) || null, _loadedTheme.keywords, _loadedTheme.genre)
        if (_resolvedInput.keywords) setKeywords(_resolvedInput.keywords)
        if (_resolvedInput.genre) setGenre(_resolvedInput.genre)
        // 🔥 #217 快照可能比服务端 idea.userDesign 旧/截断 → reconcile 补全
        var _designFromData = ((_loadedData && _loadedData.idea && (_loadedData.idea as any).userDesign) || '') as string
        var _mergedDesign = _reconcileDesignInput(_loadedTheme.detailedDesignInput || '', _designFromData)
        if (_mergedDesign) setDetailedDesignInput(_mergedDesign)
        if (_loadedTheme.protagonistName) setProtagonistName(_loadedTheme.protagonistName)
        if (_loadedTheme.userBookTitle) setUserBookTitle(_loadedTheme.userBookTitle)
        if (_loadedTheme.protagonistGender) setProtagonistGender(_loadedTheme.protagonistGender)
        if (_loadedTheme.protagonistAge) setProtagonistAge(_loadedTheme.protagonistAge)
        if (_loadedTheme.protagonistIdentity) setProtagonistIdentity(_loadedTheme.protagonistIdentity)
        // 🔥 修复2：服务端 idea.userSpecifiedIdentity 非空即为权威值，覆盖本地旧快照
        var _openSrvIdentity = (_loadedData && _loadedData.idea && (_loadedData.idea as any).userSpecifiedIdentity) || ''
        if (_openSrvIdentity) setProtagonistIdentity(String(_openSrvIdentity))
        if (_loadedTheme.creationMode) setCreationMode(_loadedTheme.creationMode)
      } else if (_loadedData && _loadedData.idea) {
        var _resolvedInput2 = resolveInputFromIdea(_loadedData.idea, '', (_loadedData.idea as any).genre || '')
        if (_resolvedInput2.keywords) setKeywords(_resolvedInput2.keywords)
        // 🔥 #217 快照缺失时也必须恢复详细设定（此前该分支完全没恢复 detailedDesignInput）
        if ((_loadedData.idea as any).userDesign) setDetailedDesignInput(String((_loadedData.idea as any).userDesign))
        // 🔥 #226 缺陷1修复：草稿箱打开路径同样补回 creationMode（与 mount 恢复分支同一根因）
        var _odIdea = _loadedData.idea as any
        var _odCM = (typeof _odIdea.creationMode === 'string' && _odIdea.creationMode)
          ? _odIdea.creationMode
          : (String(_odIdea.userDesign || '').trim() ? 'custom' : 'normal')
        if (_odCM === 'imitate' || _odCM === 'fanfiction' || _odCM === 'custom' || _odCM === 'normal') {
          setCreationMode(_odCM as 'normal' | 'imitate' | 'fanfiction' | 'custom')
          setImitateMode(_odCM === 'imitate' || _odCM === 'fanfiction')
        }
      }
      // 🔥 2026-09-06 输入主题类型回填：快照/idea 均无 genre 时，从服务端作品记录补齐
      backfillGenreFromServer(draft.id)
      // 🔥 2026-11-06：恢复仿写原作品（搜索词/拆书数据/拆书概览）。
      //   优先本地主题快照，其次草稿数据里的 idea.imitate；都没有时由上方异步服务端同步兜底。
      //   修「打开草稿后输入主题环节仿写作品显示为空」（图1）。
      var _odThemeIm = _loadedTheme && (_loadedTheme.imitateSearch || _loadedTheme.imitateData || _loadedTheme.bookAnalysisResult) ? _loadedTheme : null
      var _odIdeaIm = _loadedData && _loadedData.idea && ((_loadedData.idea as any).imitate || (_loadedData.idea as any).imitateData)
      if (_odThemeIm) {
        setImitateMode(true)
        setImitateSearch(String(_odThemeIm.imitateSearch || (_odThemeIm.imitateData && _odThemeIm.imitateData.title) || ''))
        if (_odThemeIm.imitateData) setImitateData(_odThemeIm.imitateData)
        if (_odThemeIm.bookAnalysisResult) setBookAnalysisResult(_odThemeIm.bookAnalysisResult)
      } else if (_odIdeaIm) {
        try {
          var _odImObj = typeof _odIdeaIm === 'string' ? JSON.parse(_odIdeaIm) : _odIdeaIm
          var _odImTitle = String((_odImObj && _odImObj.title) || '').trim()
          if (_odImTitle) {
            setImitateMode(true)
            setImitateSearch(_odImTitle)
            if (_odImObj.analysis || _odImObj.title) setImitateData(_odImObj.analysis || _odImObj)
            if (_odImObj.bookAnalysis) setBookAnalysisResult(_odImObj.bookAnalysis)
          }
        } catch (_odie) {}
      }
      // 跳到草稿中断的步骤
      var _restoreStep = _loadedStep as Step
      // 🔥 2026-09-06 草稿恢复：中断于「分卷章节划分」且未生成过卷章框架时，
      //   依据「关键剧情节点」动态重建 卷数/卷标题/卷摘要（修复从草稿箱进入时内容为硬编码/空卷 的问题）。
      if (_restoreStep === 'chapters' && _loadedData && _loadedData.keyPlots
          && (!_loadedData.chapters || !Array.isArray((_loadedData.chapters as any).volumes) || (Array.isArray((_loadedData.chapters as any).volumes) && (_loadedData.chapters as any).volumes.length === 0))) {
        setUserModifiedVolumeConfig(false)
        console.log('[DraftBox] 🔥 恢复到 chapters 环节且卷章框架未生成 → 基于关键剧情节点重建卷/章框架')
        window.setTimeout(function () { handleInitChaptersFrame() }, 0)
      }
      setStep(_restoreStep as Step)
      try { localStorage.setItem('tuzhong-current-step', _loadedStep) } catch (_e) {}
      setDraftBoxMsg('已恢复到《' + (draft.title || '未命名草稿') + '》的「' + _loadedStep + '」步骤，继续往下创作即可。')
      // 🔥 #144 打开草稿后异步拉取服务端最新数据（服务端为权威源，本地旧数据自动被修复后的数据覆盖）
      syncDraftFromServer(draft.id)
      // 短暂消息提示后清空
      window.setTimeout(function () { setDraftBoxMsg(''); draftRestoreInProgressRef.current = false }, 1500)
  } catch (_e) {
      console.warn('[DraftBox] 打开草稿失败:', _e)
      draftRestoreInProgressRef.current = false
    }
  }

  // 删除草稿（含数据）：统一走 deleteDraftShared（服务端删除 + 本地清理 + 事件广播），
  //   书架与向导共用同一实现；列表刷新与「复位到新建」由上面的 tuzhong-drafts-changed 监听器统一处理。
  var deleteDraft = function (draft: any) {
    if (!draft || !draft.id) return
    if (!window.confirm('确定删除草稿《' + (draft.title || '未命名') + '》？此操作不可撤销。')) return
    void deleteDraftShared(draft.id, draft.title)
  }

  // 当前 active 草稿同步保存为"按草稿id分隔的"副本，确保多草稿隔离
  useEffect(function () {
    if (!themeInputRestoredRef.current) return
    if (!step || step === 'input') return
    try {
      var activeId = localStorage.getItem('tuzhong-active-novel-id') || ''
      if (!activeId) return
      // per-draft 副本（用于草稿箱恢复）
      localStorage.setItem('tuzhong-draft-data-' + activeId, JSON.stringify(generatedData || {}))
      localStorage.setItem('tuzhong-draft-step-' + activeId, step)
      // 主题输入快照
      localStorage.setItem('tuzhong-draft-theme-' + activeId, JSON.stringify({
        keywords: keywords, genre: genre, detailedDesignInput: detailedDesignInput,
        protagonistName: protagonistName, userBookTitle: userBookTitle,
        protagonistGender: protagonistGender, protagonistAge: protagonistAge,
        protagonistIdentity: protagonistIdentity, creationMode: creationMode,
        // 🔥 2026-11-06：仿写原作品状态入快照——此前只存全局 tuzhong-imitate-data（跨草稿污染），
        //   打开草稿时不读，导致「仿写作品显示为空」
        imitateSearch: imitateSearch, imitateData: imitateData || null, bookAnalysisResult: bookAnalysisResult || null,
      }))
      if (Array.isArray(generatedChapters) && generatedChapters.length > 0) {
        localStorage.setItem('tuzhong-draft-chapters-' + activeId, JSON.stringify(generatedChapters))
        localStorage.setItem('tuzhong-draft-chapter-idx-' + activeId, String(currentChapterIndex || 0))
      }
      if (volumeConfig && userModifiedVolumeConfig) {
        localStorage.setItem('tuzhong-draft-volume-' + activeId, JSON.stringify(volumeConfig))
      }
    } catch (_e) { /* ignore */ }
  }, [step, generatedData, generatedChapters, currentChapterIndex, keywords, genre, detailedDesignInput, protagonistName, userBookTitle, protagonistGender, protagonistAge, protagonistIdentity, creationMode, volumeConfig, userModifiedVolumeConfig, imitateSearch, imitateData, bookAnalysisResult])

  // 给当前 active 草稿补一个持久化 id（首次生成 idea 时），确保刷新后还能定位
  // 🔥 2026-09-03 #120：原条件要求 gd.idea.title 存在才分配 id，导致「idea 之前就中断」的作品
  //    连本地草稿索引都进不去。放宽为：有书名/关键词/主题输入即分配，保证任意环节中断都能留痕。
  useEffect(function () {
    if (!themeInputRestoredRef.current) return
    try {
      var cur = localStorage.getItem('tuzhong-active-novel-id') || ''
      var gd: any = generatedData || {}
      var _themeText: string = String((keywords || '') + (detailedDesignInput || '')).trim()
      var _hasTitle = Boolean((gd && gd.idea && gd.idea.title) || String(userBookTitle || '').trim())
      // 🔥 2026-09-03 #125R2：draft- 遗留（上次服务端创建失败/中断）时也允许重试服务端建草稿
      if ((!cur || cur === 'temp' || cur.indexOf('draft-') === 0) && (_hasTitle || _themeText.length > 0)) {
        var _newId = 'draft-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
        localStorage.setItem('tuzhong-active-novel-id', _newId)
        console.log('[DraftBox] 自动分配草稿id:', _newId)
        // 🔥 2026-09-03 #125：自动分配 id 瞬间就 fire-and-forget 触发 ensureDraftNovel，
        //   让服务端 novels.json 立刻拿到 status='drafting' 入册，不再依赖「一键生成」按钮按下。
        //   关闭浏览器/拔电源前只要这一步发出去，作品就能进草稿箱。
        try {
          var _prom = ensureDraftNovel()
          if (_prom && typeof (_prom as any).catch === 'function') { (_prom as any).catch(function () {}) }
        } catch (_e) { /* fire-and-forget 静默 */ }
      }
    } catch (_e) {}
  }, [generatedData, userBookTitle, keywords, detailedDesignInput])

  // 🔥 2026-09-03 #125：浏览器关闭/刷新前的兜底
  //   关闭瞬间所有 await 异步都会被打断，所以这里只能同步把状态写到 localStorage（已有 300ms 防抖）和
  //   用 sendBeacon 替代 fetch 异步冲一次服务端（避免浏览器中断请求）。
  //   即使 sendBeacon 也失败，下次重新打开页面时 mount 阶段的"自动分配 id + ensureDraftNovel"会兜底。
  useEffect(function () {
    var _handler = function () {
      try {
        // 强制写一次最新状态（不等 300ms 防抖）
        var _curId = localStorage.getItem('tuzhong-active-novel-id') || ''
        if (_curId && _curId !== 'temp' && _curId.length > 8) {
          localStorage.setItem('tuzhong-draft-data-' + _curId, JSON.stringify(generatedDataRef.current || {}))
          if (step && step !== 'input') localStorage.setItem('tuzhong-draft-step-' + _curId, step)
          // 🔥 用 sendBeacon 替代 fetch：浏览器关闭瞬间会保证投递完成。
          try {
            var _token = localStorage.getItem('token') || ''
            var _authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
            if (_token) _authHeaders['Authorization'] = 'Bearer ' + _token
            var _body: any = {
              novelId: _curId,
              type: 'batch',
              // 🔥 #199 人物版本号回带（keepalive 兜底保存同样受服务端落后拒收保护）
              _charsRev: (generatedDataRef.current && Number(generatedDataRef.current._charsRev)) || 0,
              // 🔥 #201 全环节版本号回带
              _secRev: (generatedDataRef.current && generatedDataRef.current._secRev && typeof generatedDataRef.current._secRev === 'object') ? generatedDataRef.current._secRev : {},
              worldbuilding: (generatedDataRef.current && generatedDataRef.current.worldbuilding) || {},
              powerSystem: (generatedDataRef.current && generatedDataRef.current.powerSystem) || {},
              characters: (generatedDataRef.current && generatedDataRef.current.characters) || {},
              factions: (generatedDataRef.current && generatedDataRef.current.factions) || {},
              relationships: (generatedDataRef.current && generatedDataRef.current.relationships) || {},
              keyPlots: (generatedDataRef.current && generatedDataRef.current.keyPlots) || {},
              // 🔥 2026-11-06：卸载兜底保存同样携带输入主题环节交互状态（genre/creationMode/imitate）
              idea: _buildPersistedIdea(generatedDataRef.current && generatedDataRef.current.idea),
              synopsis: (generatedDataRef.current && generatedDataRef.current.synopsis) || {},
              outline: (generatedDataRef.current && generatedDataRef.current.outline) || {},
              chapters: (generatedDataRef.current && generatedDataRef.current.chapters) || {},
              lastStep: step || '',
            }
            // 🔥 2026-09-08 #162：sendBeacon 无法携带 Authorization 头 →
            //   ① settings 落盘改为 keepalive fetch（页面卸载后仍可存活，且带鉴权头）；
            //   ② novels 记录同步原为 POST（ novels POST 忽略 body.id 永远新建！）→ 匿名身份首次真建了一本
            //      userId='anonymous' 的垃圾书、此后每次 402。改为 PUT（按 id 更新，归属校验）。
            try {
              fetch('/tuzhong-wenshu/api/settings', { method: 'POST', headers: _authHeaders, body: JSON.stringify(_body), keepalive: true }).catch(function () {})
            } catch (_sbe) { /* 失败靠 mount 阶段兜底 */ }
            try {
              // 🔥 2026-10-16 书架/草稿箱口径修复：卸载时绝不能把作品状态无条件降级为 'drafting'——
              //   生成完成的作品在收尾处已 PUT status:'writing'，随后 window.location 跳转触发本 handler，
              //   旧的 status:'drafting' 会把刚完成的作品重新打回草稿箱（书架消失、草稿箱残留）。
              //   作品创建时本就以 'drafting' 落库（见 ensureDraftNovel / ContentGen），此处无需再改状态，仅同步标题。
              fetch('/tuzhong-wenshu/api/novels', { method: 'PUT', headers: _authHeaders, body: JSON.stringify({
                id: _curId,
                title: ((generatedDataRef.current && generatedDataRef.current.idea && generatedDataRef.current.idea.title) || userBookTitle || '未命名作品'),
              }), keepalive: true }).catch(function () {})
            } catch (_snbe) { /* noop */ }
          } catch (_b2) { /* ignore */ }
        }
      } catch (_e) { /* ignore */ }
    }
    window.addEventListener('beforeunload', _handler)
    window.addEventListener('pagehide', _handler)
    return function () {
      window.removeEventListener('beforeunload', _handler)
      window.removeEventListener('pagehide', _handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🔥 问题4修复：步骤变化时保存到 localStorage
  useEffect(function() {
    try {
      if (step && step !== 'input') {
        localStorage.setItem('tuzhong-current-step', step)
      }
    } catch (e) {
      console.warn('[Save] Failed to save step to localStorage:', e)
    }
    // 🔥 修复：步骤切换后强制重置isLoading，防止卡住true导致按钮禁用
    var resetTimer = window.setTimeout(function() {
      setIsLoading(false)
      setRegeneratingField(null)
    }, 100)
    return function() { window.clearTimeout(resetTimer) }
  }, [step])

  // 🔥 问题4修复：生成数据变化时保存到 localStorage（节流）
  // 🔥 性能优化：节流从1000ms降低到300ms，减少热重载/页面关闭时数据丢失风险
  useEffect(function() {
    if (Object.keys(generatedData).length === 0) return
    var timer = window.setTimeout(function() {
      try {
        localStorage.setItem('tuzhong-generated-data', JSON.stringify(generatedData))
      } catch (e) {
        console.warn('[Save] Failed to save generatedData to localStorage:', e)
      }
    }, 300)
    return function() { clearTimeout(timer) }
  }, [generatedData])

  // 🔥 问题4修复：卷配置变化时保存到 localStorage
  useEffect(function() {
    try {
      localStorage.setItem('tuzhong-volume-config', JSON.stringify(volumeConfig))
    } catch (e) {}
  }, [volumeConfig])

  // 🔥 问题4修复：已生成章节变化时保存到 localStorage
  useEffect(function() {
    if (generatedChapters.length === 0) return
    var timer = window.setTimeout(function() {
      try {
        localStorage.setItem('tuzhong-generated-chapters', JSON.stringify(generatedChapters))
        localStorage.setItem('tuzhong-current-chapter-idx', String(currentChapterIndex))
      } catch (e) {}
    }, 1000)
    return function() { clearTimeout(timer) }
  }, [generatedChapters, currentChapterIndex])
  // 🔥 自动保存：当步骤数据变化时，延迟2秒自动保存到服务器
  useEffect(function () {
    var _gd: any = generatedData || {}
    var _prev: any = lastGenSnapshotRef.current
    var _prevKeys = _prev ? Object.keys(_prev) : []
    var _curKeys = Object.keys(_gd)
    // 🔥 #224 自激循环修复：若本次变更「只是服务端 rev 被采纳」（除 _charsRev/_secRev 外所有键引用未变），
    //   则跳过保存——否则会形成 保存→rev+1→采纳→再保存 的无限循环（每次重写整库 9.8MB，实测停不下来）。
    var _revOnly = !!_prev && _prevKeys.length === _curKeys.length && _prevKeys.every(function (k) {
      if (k === '_charsRev' || k === '_secRev') return true
      return _prev[k] === _gd[k]
    })
    lastGenSnapshotRef.current = _gd
    if (_revOnly) return
    if (_curKeys.length > 0) {
      debouncedSave(_gd)
    }
  }, [generatedData, debouncedSave])
  // ---- end

  function getStepLlmConfig(stepName: string): any {
    // 🔥 2026-08-21：手动模式才使用用户选择的模型；否则返回 null，由后端按环节自动选择最佳模型
    if (manualModel && llmConfig && llmConfig.model && llmConfig.apiKey) {
      return {
        provider: llmConfig.provider,
        apiKey: llmConfig.apiKey,
        baseUrl: (llmConfig.baseUrl || '').replace(/[`'"]/g, '').trim(),
        model: llmConfig.model,
        _manual: true,
      }
    }
    return null
  }


  function checkGenDebounce(): boolean {
    var now = Date.now()
    if (now - genDebounceRef.current < 500) return false
    genDebounceRef.current = now
    return true
  }


  var buildImitatePayload = function() {
    var genreStr = genre || 'Xianxia'
    var im = imitateDataRef.current
    var archNames: string[] = []
    if (im && im.characterArchetypes) {
      var archs = typeof im.characterArchetypes === 'string'
        ? JSON.parse(im.characterArchetypes)
        : im.characterArchetypes
      archNames = (Array.isArray(archs) ? archs : (archs?.names || archs?.roles || []))
        .map((a: any) => typeof a === 'string' ? a : (a.name || a.role || ''))
        .filter(Boolean)
    }
    var imChars: any[] = []
    if (im && im.characters) {
      if (Array.isArray(im.characters)) {
        imChars = im.characters
      } else if (typeof im.characters === 'object') {
        imChars = Object.keys(im.characters).map(function(k) { return { role: k, desc: (im.characters as any)[k] } })
      }
    }
    return {
      title: im?.title || '',
      author: im?.author || '',
      synopsis: im?.synopsis || '',
      genre: im?.genre || genreStr,
      bookGenre: im?.bookGenre || '',
      style: im?.style || '',
      writingStyle: im?.writingStyle || im?.style || '',
      characterArchetypes: archNames,
      // 🔥 新增：9维度深度结构化骨架
      baseStyle: im?.baseStyle || null,            // 基础文风&爆款参数
      worldFramework: im?.worldFramework || null,    // 多层级世界观框架
      powerSystem: im?.powerSystem || null,          // 力量体系分层模型
      goldenFinger: im?.goldenFinger || null,        // 金手指标准化成长模型
      characters: imChars.length > 0 ? imChars : (im?.characters || null),  // 人物功能定位模型
      factions: im?.factions || null,                // 势力博弈结构
      sixStageOutline: im?.sixStageOutline || null,  // 全书六阶段主线叙事大纲
      keyPlotNodes: im?.keyPlotNodes || null,        // 关键剧情节点模板
      chapterConstraints: im?.chapterConstraints || null,  // 章节摘要约束
      keywords: Array.isArray(im?.keywords) ? im.keywords : (Array.isArray(im?.tags) ? im.tags : []),
      tags: Array.isArray(im?.tags) ? im.tags : (Array.isArray(im?.keywords) ? im.keywords : []),
      sellingPoints: Array.isArray(im?.sellingPoints) ? im.sellingPoints : [],
      worldBuilding: im?.worldBuilding || im?.worldFramework?.spaceHierarchy || '',
      totalChapters: im?.totalChapters || null,
      totalWords: im?.totalWords || '',
      imitateMode: imitateMode,
      bookAnalysis: im?.bookAnalysis || null,
      // 🔥 章节级仿写骨架（黄金三章/单章循环/节奏/伏笔/爽点/禁止复制清单）
      chapterBlueprint: (generatedDataRef.current?.bookAnalysis as any)?.chapterBlueprint
        || (generatedData?.bookAnalysis as any)?.chapterBlueprint
        || null,
    }
  }

  function getActiveStyle(): any {
    if (typeof window === 'undefined') return null
    try {
      var saved = localStorage.getItem('tuzhong-active-style-data')
      if (saved) return JSON.parse(saved)
    } catch (e) {}
    return null
  }

  function getBestsellerPrefs(): any {
    if (typeof window === 'undefined') return null
    try {
      var saved = localStorage.getItem('tuzhong-bestseller-prefs')
      if (saved) return JSON.parse(saved)
    } catch (e) {}
    try {
      var prefsSaved = localStorage.getItem('tuzhong-preferences')
      if (prefsSaved) {
        var p = JSON.parse(prefsSaved)
        return {
          shuangDensityMode: p.shuangDensityMode,
          faceSlapStyle: p.faceSlapStyle,
          rhythmIntensity: p.rhythmIntensity,
          targetPlatform: p.targetPlatform,
          mcPersonality: p.mcPersonality,
        }
      }
    } catch (e) {}
    return null
  }

  var [imitateResult, setImitateResult] = useState<any>(null)
  var [imitateLoading, setImitateLoading] = useState(false)
  var [imitateEditing, setImitateEditing] = useState<string | null>(null)
  var [imitateSearchPhase, setImitateSearchPhase] = useState<'idle' | 'searching' | 'ai-analyzing' | 'done'>('idle')

  // 🔥 万能仿写·手动导入拆书结果
  var [bookAnalysisMode, setBookAnalysisMode] = useState(false)
  var [bookAnalysisJson, setBookAnalysisJson] = useState('')
  var [bookAnalysisResult, setBookAnalysisResult] = useState<any>(null)
  var [bookAnalysisLoading, setBookAnalysisLoading] = useState(false)
  useEffect(function () { bookAnalysisResultRef.current = bookAnalysisResult }, [bookAnalysisResult])

  // 🔥 第二期·自动拆书
  var [autoBookName, setAutoBookName] = useState('')
  var [autoBookLoading, setAutoBookLoading] = useState(false)
  // 🔥 第二期·一键串行生成
  var [autoGenRunning, setAutoGenRunning] = useState(false)
  var [autoGenProgress, setAutoGenProgress] = useState({ current: 0, total: 11, step: '' })
  var [autoGenLog, setAutoGenLog] = useState<string[]>([])

  // 🔥 安全重置：组件mount时清除可能残留的autoGenRunning状态（防止浏览器刷新/中断后按钮永久禁用）
  useEffect(function() {
    _autoGenInProgress = false
    queueMicrotask(function() { setAutoGenRunning(false) })
  }, [])

  // 🔥 第三期·调度中心 & 真实进度
  var genCancelRef = useRef(false)
  var genPauseRef = useRef(false)
  // 🔥 2026-09-30 性能优化·当前正在生成的章节实时状态（供 UI 心跳显示「正在生成第 X 章·已用 X 秒」）
  var genCurrentChapterRef = useRef<{ index: number; startedAt: number; retry: number } | null>(null)
  var genHeartbeatRef = useRef<number | null>(null)
  var genPauseResolveRef = useRef<(() => void) | null>(null)
  var stepNavRef = useRef<HTMLDivElement | null>(null)
  var [genStatus, setGenStatus] = useState<'idle' | 'running' | 'paused' | 'done' | 'cancelled'>('idle')
  var [genConcurrency, setGenConcurrency] = useState(2)
  var [genStats, setGenStats] = useState({
    startTime: 0,
    totalWords: 0,
    completedChapters: 0,
    failedChapters: 0,
    totalChapters: 0,
    elapsedMs: 0,
    etaMs: 0,
    throughput: 0, // words per minute
    chapterTimings: [] as Array<{ chapter: number; durationMs: number; words: number }>,
  })
  var [genFailedList, setGenFailedList] = useState<Array<{ index: number; chapter: any; error: string }>>([])

  // 🔥 逐章生成正文·右上角控制面板（字数 / 风格 / 新角色）：
  //   提升到向导共享 state，发起本章正文生成时随请求体传入 /api/ai-generate（step: 'content'）。
  //   《永历中兴》目标字数区间 2500-4000，默认 3000（绍宋级口径）。
  // 🔥 2026-10-25 T2：默认字数口径改为 2000（区间 1800-2200，跟随用户设定；反修复旧 2500 写死）
  var [genTargetWordCount, setGenTargetWordCount] = useState<number>(2000)
  var [genStyle, setGenStyle] = useState<string>('正剧')
  var [genNewCharacters, setGenNewCharacters] = useState<string>('')
  // 🔥 2026-11-05 批量生成上限：一次性生成 N 章（1-20），0=全部。避免全本长跑中模型漂移导致质量问题；配合断点续生成=分批体验
  var [genBatchLimit, setGenBatchLimit] = useState<number>(parseInt(typeof localStorage !== 'undefined' ? (localStorage.getItem('tuzhong-batch-limit') || '0') : '0', 10) || 0)
  var handleGenBatchLimitChange = function (v: number) {
    setGenBatchLimit(v)
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('tuzhong-batch-limit', String(v)) } catch (_e) {}
  }

  // 🔥 控制面板统一更新入口（由 StepGenerating 内调用）：把字数自动夹在 2500-4000 合法区间（绍宋级口径）
  var handleGenConfigChange = function (patch: { targetWordCount?: number; style?: string; newCharacters?: string }) {
    if (patch.targetWordCount !== undefined && !isNaN(patch.targetWordCount as number)) {
      // 🔥 2026-10-26 T9：夹取范围与 UI 滑块一致（1500-4000）——原 2500 下限会把滑块设的 2000/1800 顶回 2500
      setGenTargetWordCount(Math.min(4000, Math.max(1500, Math.round(patch.targetWordCount as number))))
    }
    if (patch.style !== undefined) setGenStyle(patch.style as string)
    if (patch.newCharacters !== undefined) setGenNewCharacters(patch.newCharacters as string)
  }

  // 🔥 Bug修复（编辑丢失）：StepGenerating 里手动编辑章节正文后回写父级状态，
  //   同时更新 generatedChapters 与 generatedData.chapters.generatedContent 两份数据，后续保存流程可将其持久化
  var handleChapterContentEdit = function (chapterId: string, content: string) {
    setGeneratedChapters(function (prev: any[]) {
      return (prev || []).map(function (c: any) {
        if (String(c && c.id) === String(chapterId)) {
          // 🔥 T9：前端字数口径与数据层统一为去空白（含标点）字符数（原为 CJK+字母数字）
          return Object.assign({}, c, { content: content, wordCount: content.replace(/\s/g, '').length, status: c.status === 'generating' ? 'generating' : (c.status || 'completed') })
        }
        return c
      })
    })
    setGeneratedData(function (prev: any) {
      var chaptersObj = (prev && prev.chapters) || {}
      var gc = chaptersObj.generatedContent
      var nextGc = Array.isArray(gc)
        ? gc.map(function (c: any) { return String(c && c.id) === String(chapterId) ? Object.assign({}, c, { content: content, wordCount: content.replace(/\s/g, '').length }) : c })
        : gc
      return Object.assign({}, prev, { chapters: Object.assign({}, chaptersObj, { generatedContent: nextGc }) })
    })
  }

  // 🔥 第四期·爆款终检
  var [finalCheckResult, setFinalCheckResult] = useState<any>(null)
  var [finalCheckLoading, setFinalCheckLoading] = useState(false)
  var [polishLoading, setPolishLoading] = useState(false)
  // 🔥 #226Q：一键修复全部（全链路）的进度 / 结果状态，回传给 StepFinalCheck→StepChecklistPanel 纯展示
  var [repairState, setRepairState] = useState<RepairState | null>(null)

  // 🔥 每步实际使用模型展示
  var [stepModels, setStepModels] = useState<Record<string, { model: string; provider?: string }>>({})

  // 🔥 2026-09-06 任务1：草稿箱「继续创作」重开时，从 localStorage 恢复各环节实际调用的大模型，避免导图模型为空
  useEffect(function() {
    try {
      if (typeof window === 'undefined') return
      var aid = (typeof localStorage !== 'undefined' ? (localStorage.getItem('tuzhong-active-novel-id') || 'global') : 'global')
      var raw = localStorage.getItem('tuzhong-step-models-' + aid)
      if (raw) {
        var parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          setStepModels(parsed as Record<string, { model: string; provider?: string }>)
          console.log('[StepModels] 已恢复各环节模型记录:', Object.keys(parsed).length + ' 个环节')
        }
      }
    } catch (e) { /* ignore */ }
  }, [])

  // 🔥 2026-11-05 仿写搜索词恢复：向导重挂载（返回输入环节/刷新）后，搜索框从本地缓存的仿写数据恢复书名
  useEffect(function() {
    try {
      if (typeof window === 'undefined') return
      if (String(imitateSearch || '').trim()) return
      var raw = localStorage.getItem('tuzhong-imitate-data')
      if (!raw) return
      var parsed = JSON.parse(raw)
      var t = String((parsed && parsed.title) || '').trim()
      if (t) {
        setImitateSearch(t)
        if (!imitateMode) setImitateMode(true)
        console.log('[Imitate] 已从本地恢复搜索词:', t)
      }
    } catch (_e) {}
  }, [])

  // 🔥 2026-11-05 后端 powerSystem 同步：向导挂载时强制用服务端金手指覆盖本地快照（快照旧值不再挡新设定）
  useEffect(function() {
    try {
      if (typeof window === 'undefined') return
      var aid = (typeof localStorage !== 'undefined' ? (localStorage.getItem('tuzhong-active-novel-id') || '') : '')
      if (!aid || aid === 'temp') return
      var _hdrs = { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
      fetch('/tuzhong-wenshu/api/settings?novelId=' + encodeURIComponent(aid), { headers: _hdrs })
        .then(function (r) { return r.ok ? r.json() : null })
        .then(function (j) {
          // 🔥 后端仿写数据恢复：服务端 idea.imitate 存在且本地无仿写数据 → 恢复仿写模式+搜索词（修「搜索框内容消失」）
          // 🔥 2026-11-06 修复：原代码引用未定义的 `_s`（本作用域变量是 j.data），ReferenceError 被 .catch 吞掉，
          //   导致整个「服务端 powerSystem/仿写恢复」effect 静默失效（打开草稿后仿写原作品显示为空的根因之一）。
          //   同时把仿写恢复提到 powerSystem 守卫之前：无金手指的草稿同样需要恢复仿写数据。
          var _srvIdea = j && j.data && j.data.idea
          var _srvIm = _srvIdea && (_srvIdea.imitate || _srvIdea.imitateData)
          if (_srvIm) {
            try {
              var _imObj = typeof _srvIm === 'string' ? JSON.parse(_srvIm) : _srvIm
              var _imTitle = String((_imObj && _imObj.title) || '').trim()
              if (_imTitle) {
                setImitateMode(true)
                setImitateSearch(function (prev: string) { return prev && prev.trim() ? prev : _imTitle })
                if (!imitateDataRef.current && (_imObj.analysis || _imObj.title)) { setImitateData(_imObj.analysis || _imObj) }
                // 🔥 2026-11-06：拆书结果概览（bookAnalysisResult）也一并恢复，修「打开草稿后仿写作品显示为空」
                if (!bookAnalysisResult && _imObj.bookAnalysis) { setBookAnalysisResult(_imObj.bookAnalysis) }
                localStorage.setItem('tuzhong-imitate-data', JSON.stringify(_imObj))
                console.log('[Imitate] 已从服务端恢复仿写数据:', _imTitle)
              }
            } catch (_imE) {}
          }
          // 仅当本地快照的金手指与服务端不同步时覆盖（服务端赢）
          var _ps = j && j.data && j.data.powerSystem
          if (!_ps || typeof _ps !== 'object') return
          var _pa = _ps.protagonistAbility
          if (!_pa || !String(_pa.name || '').trim()) return
          setGeneratedData(function (prev) {
            var _local = prev && prev.powerSystem && prev.powerSystem.protagonistAbility
            var _localDesc = _local ? String(_local.description || '') : ''
            var _srvDesc = String(_pa.description || '')
            if (_localDesc === _srvDesc) return prev
            console.log('[PowerSync] 后端金手指与本地快照不同步 → 以服务端为准（', String(_pa.name||''), '）')
            generatedDataRef.current = Object.assign({}, generatedDataRef.current, { powerSystem: _ps })
            return Object.assign({}, prev, { powerSystem: _ps })
          })
        })
        .catch(function () {})
    } catch (_psE) {}
  }, [])

  // Initialize LLM config on mount
  useEffect(function() {
    var loadedConfig: any = null

  // Fetch models from API
  var fetchModelsFromApi = async function() {
    try {
      var token = localStorage.getItem('token') || ''
      var res = await fetch('/tuzhong-wenshu/api/settings/models', {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      })
      var data = await res.json()
      var apiModels = (data.data || data.models || data || [])
      if (apiModels && apiModels.length > 0) {
        // 🔥 去重：按 provider + model 组合去重，仅保留 status 为 default 的或第一个
        var seen = new Map<string, any>()
        var deduped: any[] = []
        for (var i = 0; i < apiModels.length; i++) {
          var m = apiModels[i]
          var key = (m.provider || '') + '|' + (m.model || '')
          if (!seen.has(key)) {
            seen.set(key, m)
            deduped.push(m)
          } else if (m.status === 'default' && seen.get(key).status !== 'default') {
            deduped[deduped.indexOf(seen.get(key))] = m
            seen.set(key, m)
          }
        }
        localStorage.setItem('tuzhong-ai-models', JSON.stringify(deduped))
        setAvailableModels(deduped)
        console.log('[AI Models] Saved ' + deduped.length + ' models (deduped from ' + apiModels.length + ') to localStorage')
        // 🔥 2026-08-21：不再自动选择默认模型；默认使用智能推荐，由后端按环节自动选择最佳模型
      }
    } catch (err) {
      console.log('[AI Models] API fetch error:', err)
    }
  }
  // Call the fetch function
  fetchModelsFromApi()

  // 🔥 优先级：1. 用户上次选择的模型（tuzhong-llm-config） → 2. localStorage缓存的defaultModel → 3. 内置硅基流动默认配置
  var savedLlmConfig = localStorage.getItem('tuzhong-llm-config')
  if (savedLlmConfig) {
    try {
      loadedConfig = JSON.parse(savedLlmConfig)
      if (loadedConfig && loadedConfig.provider) {
        loadedConfig.provider = (loadedConfig.provider || '').replace(/\s*\([^)]*\)\s*/g, '').trim()
      }
      console.log('[LLM Config] 优先加载用户上次选择的模型:', loadedConfig.provider, loadedConfig.model)
    } catch (e) {
      console.error('[LLM Config] Failed to parse stored user config')
    }
  }

  // 只有用户没选过时，才用 defaultModel
  if (!loadedConfig) {
    var savedModels = localStorage.getItem('tuzhong-ai-models')
    if (savedModels) {
      try {
        var models = JSON.parse(savedModels)
        console.log('[AI Models] Loaded ' + models.length + ' models from localStorage')
        var defaultModel = models.find(function (m: any) { return m.status === 'default' }) || 
                          models.find(function (m: any) { return m.status === 'active' }) ||
                          models[0]
        
        if (defaultModel && defaultModel.apiKey) {
          loadedConfig = {
            provider: (defaultModel.provider || '').replace(/\s*\([^)]*\)\s*/g, '').trim(),
            apiKey: defaultModel.apiKey,
            baseUrl: (defaultModel.baseUrl || '').replace(/[`'"]/g, '').trim(),
            model: defaultModel.model,
          }
          console.log('[LLM Config] 使用localStorage默认模型:', loadedConfig.provider, loadedConfig.model)
        }
      } catch (e) {
        console.error('[LLM Config] Failed to parse cached models')
      }
    }
  }

  // 出于安全考虑，不再提供内置默认 API Key；用户必须前往个人设置-AI模型中导入或手动添加
  if (!loadedConfig || !loadedConfig.apiKey) {
    console.warn('[LLM Config] 未配置有效模型，请前往个人设置-AI模型中一键导入或手动添加')
  }

    var savedImitate = localStorage.getItem('tuzhong-imitate-data')
    var _loadedImitateData: any = null
    if (savedImitate) {
      try {
        _loadedImitateData = JSON.parse(savedImitate)
        console.log('[Imitate] Loaded imitate data:', _loadedImitateData.title)
      } catch {}
    }

    // 🔥 关键修复：将读取到的配置应用到 state
    // 使用 microtask 避免 useEffect 中同步 setState 触发 React Compiler 警告
    queueMicrotask(function() {
      if (_loadedImitateData) {
        setImitateData(_loadedImitateData)
        setImitateMode(true)
        imitateDataRef.current = _loadedImitateData
      }
      if (loadedConfig && loadedConfig.model && loadedConfig.apiKey) {
        setLlmConfig(loadedConfig)
        // t2(2026-11-07)：去掉显式指定，恒定智能推荐——默认模型仅作凭据来源
        console.log('[LLM Config] 默认模型仅作凭据来源，保持智能推荐模式（每环节按 _STEP_MODEL_MAP 自动选模型）')
      }
    })
  }, [])

  useEffect(function() {
    if (stepNavRef.current && embedded) {
      var btn = stepNavRef.current.querySelector('button[data-step-key="' + step + '"]') as HTMLElement
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [step, embedded])

  var suspenseFallback = (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
    </div>
  )

  var genres = [
    // ===== 起点/番茄·一级主频道 =====
    '玄幻', '奇幻', '武侠', '仙侠', '都市', '现实',
    '历史', '军事', '科幻', '悬疑', '灵异', '末世',
    '轻小说', '短篇', '游戏', '体育', '同人文',

    // ===== 二级细分题材（热度排序） =====
    // 东方玄幻/高武大类
    '东方玄幻', '高武世界', '王朝争霸', '异世大陆', '诸天万界',
    // 西幻/魔法斗气大类（盘龙风格）
    '西幻', '西式奇幻', '魔法斗气', '龙血战士', '魔法师', '骑士', '神格',
    // 仙侠大类
    '古典仙侠', '修真文明', '现代修真', '神话修真', '洪荒', '封神',
    // 历史大类
    '架空历史', '秦汉三国', '两晋隋唐', '五代十国', '两宋元明', '清史民国',
    '历史传记', '历史考据流',
    // 都市大类
    '都市重生', '都市异能', '都市修仙', '商战职场', '娱乐圈文', '校园', '都市生活',
    // 系统/无限/穿越/重生大类
    '穿越', '重生', '系统流', '签到流', '无限流', '任务流', '面板流', '诸天流',
    // 女频/言情大类
    '古代言情', '现代言情', '幻想言情', '纯爱', '单女主', '双女主',
    // 科幻大类
    '星际文明', '古武机甲', '未来世界', '时空穿梭', '进化变异', '赛博朋克', '末世求生',
    // 军事/战争大类
    '战争幻想', '谍战特工', '军旅生涯', '国战',
    // 悬疑/灵异大类
    '悬疑推理', '灵异鬼怪', '探险生存', '克苏鲁',
    // 游戏大类
    '游戏异界', '虚拟网游', '电子竞技', '游戏系统',
    // 同人/二次元大类
    '动漫同人', '影视同人', '小说同人', '综漫同人',
    // 其他风格标签
    '后宫', '扮猪吃虎', '废材逆袭', '无敌流', '国运', '争霸',
    '种田', '经商', '盗墓', '蒸汽朋克', '暗黑', '治愈',
    // 二次元
    '原生幻想', '青春日常', '搞笑吐槽', '轻小说',
    // 🔥 2026-08-30 问题3：补全常见细分题材
    '民国', '年代文', '快穿', '玄学', '直播', '美食', '武侠幻想', '东方武侠', '国术',
    '规则怪谈', '无限恐怖', '灵异神怪', '悬疑冒险', '幻想修仙', '都市高武', '星际争霸',
    '玄幻言情', '仙侠言情',
    // ===== 🔥 2026-09-12 #220：按当前各网文平台（起点/番茄/晋江/飞卢/七猫）热门作品补充 =====
    // 朝代/历史细分（番茄/飞卢朝代文热点）
    '三国', '大唐', '大宋', '大明', '大清', '权谋', '枭雄',
    // 玄幻/仙侠细分（起点热门流派）
    '凡人流', '剑修', '长生流', '苟道流', '气运流', '诡异修仙', '武道', '神话',
    // 西幻细分（巫师/领主/学院流）
    '巫师流', '领主流', '学院流', '奥术',
    // 都市热点（番茄/飞卢王牌品类）
    '赘婿', '战神', '神医', '神豪', '鉴宝', '豪门', '总裁', '闪婚', '替嫁', '萌宝', '马甲',
    // 系统/流派玩法（模拟器/词条/反派/群像等新热）
    '模拟器', '词条流', '聊天群', '反派', '群像', '脑洞', '爽文', '热血', '轻松', '沙雕', '打脸', '逆袭',
    // 诡异/惊悚细分
    '诡异复苏', '惊悚', '恐怖游戏', '都市怪谈',
    // 科幻/末世细分
    '机甲', '废土', '丧尸', '天灾流', '第四天灾', '虫族', '太空歌剧',
    // 游戏细分
    '网游', '游戏制作', '沙盒',
    // 御兽/召唤/卡牌（近年热门大类）
    '御兽', '召唤流', '卡牌', '精灵', '宠物',
    // 种田/经营细分（基建热）
    '基建', '经营', '农场',
    // 女频/言情细分（晋江/番茄女频热门标签）
    '宫斗', '宅斗', '团宠', '复仇', '追妻', '先婚后爱', '破镜重圆', '青梅竹马', '替身',
    // 悬疑细分（刑侦/法医/民俗）
    '刑侦', '法医', '民俗',
    // 军事细分
    '抗战', '兵王', '特种兵',
    // 体育细分
    '篮球', '足球',
    // 新媒体热点
    '带货', '短视频',
  ]
  // 去重，确保每个类型只出现一次
  genres = Array.from(new Set(genres))

  var steps = [
    { key: 'input', label: '输入主题', icon: Sparkles },
    { key: 'idea', label: '核心创意', icon: Lightbulb },
    { key: 'worldbuilding', label: '世界观设定', icon: Globe },
    { key: 'powerSystem', label: '金手指设定', icon: Zap },
    { key: 'characters', label: '主要人物设定', icon: Users },
    { key: 'factions', label: '势力设定', icon: Shield },
    { key: 'relationships', label: '人物关系图谱', icon: GitBranch },
    { key: 'synopsis', label: '简介卖点', icon: FileText },
    { key: 'outline', label: '整体故事大纲', icon: FileText },
    { key: 'keyPlots', label: '关键剧情节点', icon: Target },
    { key: 'chapters', label: '分卷章节划分', icon: List },
    { key: 'generating', label: '逐章生成正文', icon: Loader2 },
    { key: 'finalCheck', label: '签约爆款避坑检查', icon: Shield },
    { key: 'cover', label: '制作小说封面', icon: Image },
  ];

  // 🔥 从 localStorage 提取启用的技能（含完整 prompt，支持自定义/编辑后的技能）
  // 存储格式由 skills 页面写入：{ skills: [{id,name,prompt,enabled,isCustom,customPrompt}], globalEnabled }
  var getEnabledSkills = function (): Array<{ id: string; prompt?: string }> {
    if (typeof window === 'undefined') return []
    // 🔥 2026-08-27 #1：白金方法论 + 去AI全局技能 = 全局默认开启集（除非用户在技能库显式关闭对应项），
    //    即便用户有早于 platinum 套件的旧 tuzhong-skills 存档，也自动补齐，保证全流程默认生效。
    var _ensurePlatinum = function (list: Array<{ id: string; prompt?: string }>): Array<{ id: string; prompt?: string }> {
      var out = list.slice()
      var present: Record<string, boolean> = {}
      out.forEach(function (s) { present[String(s.id)] = true })
      var disabled: Record<string, boolean> = {}
      try {
        var _sv = JSON.parse(localStorage.getItem('tuzhong-skills') || 'null')
        if (_sv && Array.isArray(_sv.skills)) _sv.skills.forEach(function (s: any) { if (s && s.enabled === false) disabled[String(s.id)] = true })
      } catch (e) {}
      var _must = [{ id: DE_AI_GLOBAL_SKILL.id, prompt: DE_AI_GLOBAL_SKILL.prompt }].concat(PLATINUM_SKILLS.filter(function (s) { return s.enabled }).map(function (s) { return { id: s.id, prompt: s.prompt } }))
      _must.forEach(function (m) { if (!present[m.id] && !disabled[m.id]) { out.push(m); present[m.id] = true } })
      return out
    }
    try {
      var saved = localStorage.getItem('tuzhong-skills')
      if (saved) {
        var parsed = JSON.parse(saved)
        // 旧格式（数组）兼容：直接返回 id 数组
        if (Array.isArray(parsed)) return _ensurePlatinum(parsed.filter(Boolean).map(function (x) { return typeof x === 'string' ? { id: x } : x }))
        // 新格式（对象 { skills, globalEnabled }）
        if (parsed && Array.isArray(parsed.skills)) {
          if (parsed.globalEnabled === false) return []
          return _ensurePlatinum(parsed.skills
            .filter(function (s: any) { return s && s.enabled !== false })
            .map(function (s: any) {
              // 使用编辑后的自定义 prompt，否则用技能默认 prompt；custom 技能用 customPrompt
              var prompt = s.customPrompt || s.prompt || ''
              return { id: String(s.id || ''), prompt: prompt ? String(prompt) : undefined }
            })
            .filter(function (s: any) { return s.id }))
        }
      }
    } catch (e) {}
    // 无存档（用户从未打开过 SKILL 技能库）→ 兜底注入去AI全局技能 + 整套白金方法论，保证全局默认生效
    if (!saved) return [{ id: DE_AI_GLOBAL_SKILL.id, prompt: DE_AI_GLOBAL_SKILL.prompt }].concat(PLATINUM_SKILLS.filter(function (s) { return s.enabled }).map(function (s) { return { id: s.id, prompt: s.prompt } }))
    return []
  }

  var PLACEHOLDER_DICT = ['N/A', 'n/a', 'null', 'unknown', 'undefined', '', '...', '???', '###', '[PLACEHOLDER]']
  function isPlaceholderStr(val: any): boolean {
    if (typeof val !== 'string') return false
    var t = val.trim()
    if (t.length === 0) return true
    for (var _pi = 0; _pi < PLACEHOLDER_DICT.length; _pi++) {
      var pv = PLACEHOLDER_DICT[_pi]
      if (t === pv) return true
      // Only check startsWith for multi-character placeholders to avoid false-positives
      if (pv.length >= 2 && t.indexOf(pv) === 0) return true
    }
    var ch = t.match(/[\u4e00-\u9fff]/g)
    if (!ch || ch.length === 0) {
      if (t.length <= 3) return true
      if (/^[a-zA-Z0-9\s_]+$/.test(t) && t.length < 20) return true
    }
    return false
  }
  function isEmptyResult(data: any, step: string): boolean {
    if (!data) return true
    // 各步骤按关键字段判断，避免 object 里部分空字段误判为全空
    if (step === 'keyPlots') {
      var kp = Array.isArray(data.keyPlots) ? data.keyPlots : []
      var vols = Array.isArray(data.volumes) ? data.volumes : []
      var tps = Array.isArray(data.turningPoints) ? data.turningPoints : []
      return kp.length === 0 && vols.length === 0 && tps.length === 0
        && !(data.coreConflict && String(data.coreConflict).length > 10)
    }
    if (step === 'outline') {
      return !(data.storyOrigin && String(data.storyOrigin).length > 5)
        && !(Array.isArray(data.mainPlot) && data.mainPlot.length > 0)
        && !(Array.isArray(data.stages) && data.stages.length > 0)
    }
    if (step === 'worldbuilding') {
      return !(data.era && String(data.era).length > 5) && !(data.geography && String(data.geography).length > 5)
    }
    if (step === 'factions') {
      return !(Array.isArray(data.factions) && data.factions.length > 0)
    }
    if (step === 'characters') {
      return !(data.protagonist && data.protagonist.name && String(data.protagonist.name).length > 0)
    }
    if (step === 'powerSystem') {
      var pa = data.protagonistAbility || {}
      var wp = data.worldPowerSystem || {}
      return !(pa.name || pa.type || (Array.isArray(pa.abilities) && pa.abilities.length > 0))
        && !(wp.name || wp.type || (Array.isArray(wp.levels) && wp.levels.length > 0))
    }
    if (typeof data === 'object') {
      var keys = Object.keys(data)
      if (keys.length === 0) return true
      var allEmpty = keys.every(function(k) {
        var val = data[k]
        if (val === null || val === undefined) return true
        if (typeof val === 'string' && isPlaceholderStr(val)) return true
        if (Array.isArray(val) && val.length === 0) return true
        if (typeof val === 'string' && val.trim() === '') return true
        return false
      })
      return allEmpty
    }
    if (typeof data === 'string' && data.trim() === '') return true
    return false
  }

  // 模型显示名映射：将 provider/model 路径转换为友好名称
  function getModelDisplayName(config: any): string {
    if (!config || !config.model) return '选择模型'
    var modelName = config.model
    var providerName = config.provider || ''
    // 从 availableModels 中查找匹配的 name
    var matched = availableModels.find(function (m: any) {
      return m.model === modelName && (m.provider === providerName || m.name)
    })
    if (matched && matched.name) return matched.name
    // 否则用简写
    var shortName = modelName.replace(/^Qwen\//, '').replace(/^THUDM\//, '').replace(/^tencent\//, '').replace(/^Kwai-Kolors\//, '')
    return providerName + ': ' + shortName
  }

  // 🔥 2026-08-31 与后端 route.ts _STEP_MODEL_MAP 同步：映射值精确等于 models.json 的 model 字段。
  //   推荐模型不再显示付费的 DeepSeek（deepseek-v4-flash 已从推荐位移除，仅在 bookAnalysis 后台主调用），
  //   统一推荐免费/默认大模型（智谱 glm 系列 / OpenRouter minimax :free / 硅基流动 GLM-4-9B）。
  // 🔥 2026-09-01 与后端 route.ts _STEP_MODEL_MAP 同步：所有环节统一 glm-4-flash（提速，单步 ~5.6s）
  // ⚠️⚠️⚠️ 三表机制（2026-09-02）：本表仅用于【前端展示"智能推荐模型"标签】，
  //   真实调用的唯一权威表是 route.ts 的 _STEP_MODEL_MAP + _STEP_MODEL_POOL 候选池
  //   （_pickStepModelId 动态选优：跳过健康表冷却中/无有效 Key 的模型，22 款全平台自由切换）。
  //   改推荐模型时三表必须同步：route.ts _STEP_MODEL_MAP ↔ 本表 ↔ lib/step-model-config.ts QUALITY_FIRST/COST_FIRST。
  const _STEP_MODEL_MAP_FRONTEND: Record<string, string> = {
    // 🔥 2026-09-02 限流热切换：智谱 glm-4.7-flash 晚高峰 429 → 4 个质量敏感环节切 minimax-m3:free
    //   （OpenRouter 实测 200 + 流派精神保留 + 主角名零漂移），与后端权威表 _STEP_MODEL_MAP 同步
    'idea': 'minimax/minimax-m3:free',
    'worldbuilding': 'minimax/minimax-m3:free',
    'powerSystem': 'minimax/minimax-m3:free',
    // 🔥 2026-09-04：characters 后端权威表已切 deepseek-v4-flash（8K 输出防截断 + 强指令遵从），前端推荐标签同步
    'characters': 'deepseek-ai/DeepSeek-V4-Flash',
    'factions': 'glm-4-flash',
    'relationships': 'glm-4-flash',
    'outline': 'glm-4-flash',
    'chapters': 'glm-4-flash',
    'synopsis': 'glm-4-flash',
    'keyPlots': 'glm-4-flash',
    // 🔥 2026-10-17 同步后端：正文环节首选豆包网页版逆向网关（doubao）
    'content': 'doubao',
    'autoDesignProtagonist': 'glm-4-flash',
    'generateName': 'glm-4-flash',
  }

  function getRecommendedModelForStep(stepName: string): any {
    const modelId = _STEP_MODEL_MAP_FRONTEND[stepName] || _STEP_MODEL_MAP_FRONTEND['content']
    return availableModels.find(function (m: any) { return m && m.model === modelId }) || availableModels[0] || null
  }

  function getRecommendedModelDisplayName(): string {
    // 🔥 封面为图片流水线（绘画提示词 Qwen/Qwen2.5-7B-Instruct → 绘图 Kwai-Kolors/Kolors），
    //    不走文本 LLM 下拉，故单独返回封面专属推荐，避免误显示正文模型。
    if (step === 'cover') {
      return '智能推荐：Kwai-Kolors/Kolors（绘画提示词 Qwen/Qwen2.5-7B-Instruct）'
    }
    // 🔥 2026-08-30 任务1：把向导实际使用的环节 key（input/generating/finalCheck）归一到映射表里存在的 key，
    //    否则这些环节会落到 content 兜底、错误显示付费的 deepseek-v4-flash。
    var _stepKey = step || 'content'
    if (_stepKey === 'input') _stepKey = 'idea'
    else if (_stepKey === 'generating') _stepKey = 'content'
    else if (_stepKey === 'finalCheck') _stepKey = 'content'
    const rec = getRecommendedModelForStep(_stepKey)
    var _disp = ''
    if (rec && rec.name) _disp = rec.name
    else if (rec && rec.model) _disp = rec.model.replace(/^.*\//, '')
    else _disp = '智能推荐模型'
    // 🔥 只有 deepseek-v4-flash 是付费模型，其余（智谱 glm / 硅基流动 / 商汤 / OpenRouter :free）均免费
    var _isPaid = !!(rec && /deepseek/i.test(rec.model || ''))
    return '智能推荐：' + _disp + '（' + (_isPaid ? '付费' : '免费') + '）'
  }

  // 🔥 2026-09-08 模型显示统一（#164，三处同源：向导头部下拉 / 步骤条标签 / 顶栏徽章）
  //   原则：手动模式→每环节真实调用的都是手动模型，三处全部显示它；
  //   自动模式→优先显示本环节「实际调用记录」（后端 _meta.usedModel），无记录才回退智能推荐标签。
  function getCurrentStepModelInfo(): { model: string; provider: string; isActual: boolean } {
    if (manualModel && llmConfig && llmConfig.model) {
      return { model: String(llmConfig.model), provider: String(llmConfig.provider || ''), isActual: true }
    }
    var _k = step || 'content'
    if (_k === 'input') _k = 'idea'
    else if (_k === 'generating' || _k === 'finalCheck') _k = 'content'
    var rec = stepModels[_k]
    if (rec && rec.model) return { model: rec.model, provider: rec.provider || '', isActual: true }
    return { model: '', provider: '', isActual: false }
  }

  // 向导头部下拉文案：手动模型 > 本环节实际调用 > 智能推荐
  function getHeaderModelText(): string {
    if (manualModel && llmConfig && llmConfig.model) return getModelDisplayName(llmConfig)
    var _info = getCurrentStepModelInfo()
    if (_info.model) return '本环节实际调用：' + _info.model.replace(/^.*\//, '')
    return getRecommendedModelDisplayName()
  }

  // 🔥 顶栏徽章与当前环节同步：不再显示「最近一次完成调用的模型」（滞后），而是当前环节真实（或即将）调用的模型
  useEffect(function () {
    var _info = getCurrentStepModelInfo()
    if (_info.model) {
      setActiveModel({ usedModel: _info.model.replace(/^.*\//, ''), usedProvider: _info.provider })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, manualModel, llmConfig, stepModels])

  // 记录每步实际使用模型（同时刷新全局 Header 展示）
  function recordStepModel(meta: any) {
    if (!meta || !meta.usedModel) return
    setActiveModel(meta)
    var stepKey = step || 'unknown'
    setStepModels(function (prev) {
      var next = { ...prev, [stepKey]: { model: meta.usedModel, provider: meta.usedProvider || '' } }
      // 🔥 2026-09-06 任务1：持久化每步实际使用模型，草稿箱「继续创作」重开时导图仍能显示各环节调用的大模型
      persistStepModels(next)
      return next
    })
  }

  // 🔥 2026-09-06 任务1：把每步实际使用模型写入 localStorage（按当前作品隔离），供重开 Draft 后恢复
  function persistStepModels(map: Record<string, { model: string; provider?: string }>) {
    try {
      if (typeof window === 'undefined') return
      var aid = (typeof localStorage !== 'undefined' ? (localStorage.getItem('tuzhong-active-novel-id') || 'global') : 'global')
      localStorage.setItem('tuzhong-step-models-' + aid, JSON.stringify(map))
    } catch (e) { /* ignore */ }
  }

  // 🔥 2026-09-06 任务1：返回某环节在导图上显示的模型标签。
  //    优先用实际调用记录；草稿重开/旧草稿缺失记录时，回退到该环节当前智能推荐的模型，保证导图每环节始终显示大模型。
  function getStepModelLabel(stepKey: string): string {
    // 🔥 2026-09-08 #164：手动模式下每环节真实调用的都是手动模型，导图标签全部同步显示它
    if (manualModel && llmConfig && llmConfig.model) return String(llmConfig.model).replace(/^.*\//, '')
    var rec = stepModels[stepKey]
    if (rec && rec.model) return rec.model.replace(/^.*\//, '')
    // 关键环节（input/generating/finalCheck）归一题，与 getRecommendedModelDisplayName 保持一致
    var _k = stepKey || 'content'
    if (_k === 'input') _k = 'idea'
    else if (_k === 'generating') _k = 'content'
    else if (_k === 'finalCheck') _k = 'content'
    var m = getRecommendedModelForStep(_k)
    if (m && (m.name || m.model)) return (m.name || m.model || '').replace(/^.*\//, '')
    return ''
  }

  // 🔥 主角取名：调用AI根据题材和关键词生成主角姓名
  var [nameLoading, setNameLoading] = useState(false)
  var handleGenerateProtagonistName = async function() {
    if (nameLoading) return
    setNameLoading(true)
    try {
      var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
      var requestData = {
        step: 'generateName',
        input: keywords,
        keywords: keywordsArray,
        genre,
        novelId: 'temp',
        llmConfig: getStepLlmConfig('idea'),
        previousData: {
          // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
          detailedDesignInput: detailedDesignInput,
          keywords: keywordsArray,
          protagonistSettings: {
            name: '',
            gender: protagonistGender,
            age: protagonistAge.trim(),
            identity: protagonistIdentity.trim(),
          },
        },
      }
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (json.success !== false && json.data?.name) {
          setProtagonistName(json.data.name)
          console.log('[取名] AI生成主角姓名:', json.data.name)
        } else {
          showErrorAlert(json, '取名失败，请重试')
        }
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, '取名失败')
      }
    } catch (e) {
      console.error('[取名] 异常:', e)
      showErrorAlert(null, '取名异常，请重试')
    } finally {
      setNameLoading(false)
    }
  }

  // 🔥 自动设计主角：根据作品类型+关键词一键生成完整主角设定
  var [protagonistDesignLoading, setProtagonistDesignLoading] = useState(false)
  var handleAutoDesignProtagonist = async function() {
    if (protagonistDesignLoading) return
    if (!genre.trim()) {
      showErrorAlert(null, '请先选择作品类型')
      return
    }
    if (!keywords.trim()) {
      showErrorAlert(null, '请先输入关键词/主题')
      return
    }
    setProtagonistDesignLoading(true)
    try {
      var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'autoDesignProtagonist',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
            detailedDesignInput: detailedDesignInput,
            keywords: keywordsArray,
            genre: genre,
            protagonistSettings: {
              name: protagonistName,
              gender: protagonistGender,
              age: protagonistAge.trim(),
              identity: protagonistIdentity.trim(),
            },
            imitate: buildImitatePayload(),
            bookAnalysis: generatedData.bookAnalysis,
          },
          llmConfig: getStepLlmConfig('characters'),
          enabledSkills: getEnabledSkills(),
          activeStyle: getActiveStyle(),
          bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (json.success !== false && json.data) {
          var pd = json.data
          // 填充主角字段
          // 🔥 2026-11-05 修复：用户已填字段不被覆盖（AI 只补空缺字段；已填字段保留用户设定）
          if (pd.name && !protagonistName.trim()) setProtagonistName(String(pd.name))
          if (pd.gender && !protagonistGender.trim()) setProtagonistGender(String(pd.gender))
          if (pd.age && !protagonistAge.trim()) setProtagonistAge(String(pd.age))
          if (pd.identity && !protagonistIdentity.trim()) setProtagonistIdentity(String(pd.identity))
          // 同时存储到 generatedData.characters，供后续步骤使用
          var protoChar: any = {
            id: 'char-protagonist-' + Date.now(),
            name: String(protagonistName.trim() || pd.name || ''),
            role: '主角',
            rolePosition: '主角',
            gender: String(pd.gender || protagonistGender || ''),
            age: pd.age ? (typeof pd.age === 'number' ? pd.age : parseInt(String(pd.age)) || 20) : (protagonistAge ? parseInt(protagonistAge) || 20 : 20),
            identity: String(protagonistIdentity.trim() || pd.identity || ''),
            appearance: String(pd.appearance || ''),
            personality: String(pd.personality || ''),
            background: String(pd.background || ''),
            motivation: String(pd.motivation || ''),
            coreMotivation: String(pd.coreMotivation || pd.motivation || ''),
            skills: Array.isArray(pd.skills) ? pd.skills : (pd.skills ? [String(pd.skills)] : []),
            coreSkills: Array.isArray(pd.skills) ? pd.skills : (pd.skills ? [String(pd.skills)] : []),
            growthArc: String(pd.growthArc || ''),
            hiddenTraits: String(pd.hiddenTraits || ''),
            weaknesses: String(pd.weaknesses || ''),
            faction: String(pd.faction || ''),
            goal: String(pd.goal || ''),
            stats: pd.stats || { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 },
            attributes: pd.stats || { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 },
          }
          setGeneratedData(function(prev) {
            var next: any = { ...prev }
            if (!next.characters) {
              next.characters = {
                protagonist: protoChar,
                femaleLead: null,
                antagonist: null,
                supporting: [],
                _harem: null,
              }
            } else {
              next.characters = {
                ...next.characters,
                protagonist: protoChar,
              }
            }
            // 同步 idea.protagonistName
            if (protoChar.name && next.idea) {
              next.idea = { ...next.idea, protagonistName: protoChar.name }
            }
            generatedDataRef.current = next
            return next
          })
          saveStepSnapshot('characters', { protagonist: protoChar, femaleLead: null, antagonist: null, supporting: [] })
          console.log('[自动设计主角] 完成:', protoChar.name)
        } else {
          showErrorAlert(json, '主角设计失败，请重试')
        }
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, '主角设计失败')
      }
    } catch (e) {
      console.error('[自动设计主角] 异常:', e)
      showErrorAlert(null, '主角设计异常，请重试')
    } finally {
      setProtagonistDesignLoading(false)
    }
  }

  // 🔥 P0修复：自动检测"仿写XXX"关键词并触发拆书，确保 bookAnalysis 在生成 idea 前就绪
  // 解决核心根因：用户输入"仿写庆余年"但未点拆书按钮，导致 generatedData.bookAnalysis 为 null，
  // 后续所有环节的 previousData.bookAnalysis 为空，LLM 无法参考目标作品设定
  var ensureBookAnalysisForImitate = async function(rawKeywords: string): Promise<boolean> {
    // 🔥 修复：优先使用 ref 检查，避免 React 状态异步更新导致读到旧值
    // 检查1：generatedData.bookAnalysis（来自搜索拆书或自动拆书）
    var _currentBA = generatedDataRef.current?.bookAnalysis
    // 检查2：bookAnalysisResult（来自手动导入拆书结果）
    var _currentBAResult = bookAnalysisResult
    
    if (_currentBA && _currentBA.bookName) {
      console.log('[ensureBookAnalysisForImitate] bookAnalysis已存在(来自generatedData)，跳过自动拆书')
      return true
    }
    if (_currentBAResult && _currentBAResult.bookName) {
      console.log('[ensureBookAnalysisForImitate] bookAnalysisResult已存在(来自手动导入)，同步到generatedData')
      // 同步到 generatedData 和 ref，确保后续环节使用
      generatedDataRef.current = { ...generatedDataRef.current, bookAnalysis: _currentBAResult }
      setGeneratedData(function (prev) { return { ...prev, bookAnalysis: _currentBAResult } })
      return true
    }
    // 检测"仿写XXX"或"XXX仿写"格式
    var imitateMatch = rawKeywords.match(/仿写\s*([^\s，,、]+)/) || rawKeywords.match(/([^\s，,、]+)\s*仿写/)
    var bookName = ''
    if (imitateMatch) {
      bookName = imitateMatch[1].trim()
      // 去除可能的标点
      bookName = bookName.replace(/[《》""''\-_]/g, '')
    } else if (imitateMode && imitateSearch && imitateSearch.trim().length >= 2) {
      // 🔥 P0 修复：仿写模式已开启且搜索框有书名时，也触发自动拆书
      // 解决用户点击"庆余年"快捷按钮后直接点"开始生成"的情况
      // 此时 keywords 可能不包含"仿写"二字，但 imitateMode=true 且 imitateSearch="庆余年"
      bookName = imitateSearch.trim().replace(/[《》""''\-_]/g, '')
      console.log('[ensureBookAnalysisForImitate] 仿写模式已开启，从 imitateSearch 获取书名:', bookName)
    } else if (imitateData && (imitateData as any).title && (imitateData as any).title.length >= 2) {
      // 🔥 P0 修复：imitateData 已有数据（来自 handleImitateSearch），但 bookAnalysis 未设置
      // 从 imitateData.title 提取书名触发拆书
      bookName = String((imitateData as any).title).trim().replace(/[《》""''\-_]/g, '')
      console.log('[ensureBookAnalysisForImitate] 从 imitateData.title 获取书名:', bookName)
    }

    if (!bookName || bookName.length < 2) return true // 非仿写模式，不拦截

    console.log('[ensureBookAnalysisForImitate] 检测到仿写关键词，自动拆书:', bookName)
    try {
      var res = await fetch('/tuzhong-wenshu/api/auto-book-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookName: bookName,
          llmConfig: getStepLlmConfig('idea'),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (json.data) {
          setBookAnalysisResult(json.data)
          setBookAnalysisMode(true)
          setGeneratedData(function (prev) { return { ...prev, bookAnalysis: json.data } })
          // 同步更新 ref，确保本次 handleGenerateIdea 调用能读到
          generatedDataRef.current = { ...generatedDataRef.current, bookAnalysis: json.data }

          // 🔥 P0修复：同步设置 imitateData，让 buildImitatePayload() 返回真实内容
          // 这样后端的仿写增强 prompt（imitateContext）和题材检测（detectGenre）才能正确生效
          // 不设置的话，previousData.imitate 是空对象，isImitate=true 但 imitateData 所有字段为空
          var _baAnalysis = json.data.analysis || {}
          var _syncedImitate = {
            title: _baAnalysis.bookName || bookName,
            author: _baAnalysis.author || '',
            synopsis: _baAnalysis.synopsis || _baAnalysis.summary || '',
            genre: _baAnalysis.bookGenre || '',
            bookGenre: _baAnalysis.bookGenre || '',
            style: _baAnalysis.writingStyle || '',
            writingStyle: _baAnalysis.writingStyle || '',
            worldBuilding: _baAnalysis.worldviewFramework ? JSON.stringify(_baAnalysis.worldviewFramework) : '',
            powerSystem: _baAnalysis.powerSystemModel ? JSON.stringify(_baAnalysis.powerSystemModel) : '',
            keywords: Array.isArray(_baAnalysis.keywords) ? _baAnalysis.keywords : (_baAnalysis.tags || []),
            tags: Array.isArray(_baAnalysis.tags) ? _baAnalysis.tags : (_baAnalysis.keywords || []),
            sellingPoints: Array.isArray(_baAnalysis.sellingPoints) ? _baAnalysis.sellingPoints : [],
            characters: _baAnalysis.characterArchetypes ? [_baAnalysis.characterArchetypes] : [],
            totalChapters: _baAnalysis.totalChapters || null,
            totalWords: _baAnalysis.totalWords || '',
            bookAnalysis: json.data,
          }
          setImitateData(_syncedImitate)
          setImitateMode(true)
          imitateDataRef.current = _syncedImitate // 同步 ref，避免闭包陷阱
          try {
            localStorage.setItem('tuzhong-imitate-data', JSON.stringify(_syncedImitate))
            localStorage.setItem('tuzhong-book-analysis', JSON.stringify(json.data))
          } catch (e) {}

          console.log('[ensureBookAnalysisForImitate] 拆书完成:', json.data.bookName, 'genre:', _baAnalysis.bookGenre, 'mapping keys:', Object.keys(json.data.mapping || {}).join(', '))
          return true
        }
      } else {
        console.warn('[ensureBookAnalysisForImitate] 拆书API返回非200:', res.status)
      }
    } catch (err) {
      console.error('[ensureBookAnalysisForImitate] 拆书异常:', err)
    }
    // 拆书失败不拦截流程，但提示用户
    showErrorAlert(null, '仿写模式自动拆书失败，将以普通模式生成（建议手动点"拆书"按钮获取目标作品设定）')
    return false
  }

  var handleGenerateIdea = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // 🔥 2026-09-07（#147）主题变更守卫：用户在输入主题修改关键词/类型/详细设定/主角设定后，
    //   旧主题的下游数据（idea~chapters）若残留，会通过 previousData 锚定 LLM 造成"改了主题重新生成还是旧内容"。
    //   检测到主题快照变化 → 确定性清空全部下游数据 + 本地缓存，强制全链路按新主题重新生成（0漂移保证）。
    try {
      var _curTheme = JSON.stringify({ k: keywords, g: genre, d: detailedDesignInput, p: protagonistName, pg: protagonistGender, pa: protagonistAge, pi: protagonistIdentity, cm: creationMode })
      var _snapRaw = localStorage.getItem('tuzhong-last-idea-theme')
      if (_snapRaw && _snapRaw !== _curTheme) {
        var _gd: any = generatedDataRef.current || {}
        var _hadDownstream = !!( _gd.idea || _gd.worldbuilding || _gd.powerSystem || _gd.characters || _gd.factions || _gd.relationships || _gd.synopsis || _gd.outline || _gd.keyPlots || _gd.chapters )
        if (_hadDownstream) {
          generatedDataRef.current = {}
          setGeneratedData({})
          setGeneratedChapters([]); generatedChaptersRef.current = []
          setCurrentChapterIndex(0)
          setUserModifiedVolumeConfig(false)
          try {
            localStorage.removeItem('tuzhong-generated-data')
            localStorage.removeItem('tuzhong-generated-chapters')
            localStorage.removeItem('tuzhong-volume-config')
            localStorage.removeItem('tuzhong-current-chapter-idx')
          } catch (_le) {}
          setDraftBoxMsg('🔥 检测到主题/设定已修改，旧环节数据已清空，全链路将按新主题重新生成（保证0漂移）。')
          setThemeGuardMsg('🔥 检测到主题/设定已修改，旧环节数据已清空，全链路将按新主题重新生成（保证0漂移）。')
          window.setTimeout(function () { setDraftBoxMsg('') }, 4000)
          window.setTimeout(function () { setThemeGuardMsg('') }, 8000)
          console.log('[ThemeGuard] #147 主题变更 → 已清空全部下游数据与本地缓存')
        }
      }
      localStorage.setItem('tuzhong-last-idea-theme', _curTheme)
    } catch (_tgErr) { console.warn('[ThemeGuard] #147 守卫异常(不阻塞):', _tgErr) }
    // [FIXED]
    setIsLoading(true)
    try {
      var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)

      // 🔥 P0修复：仿写模式下先自动拆书，确保 bookAnalysis 就绪后再生成 idea
      await ensureBookAnalysisForImitate(keywords)

      // 🔥 三种创作方式：同人文模式下使用 imitateSearch 作为原作品来源
      var _fanfictionBookData: any = null
      var _isFanfictionMode = creationMode === 'fanfiction'
      // 兼容旧逻辑：关键词包含"XX同人"也触发同人文模式
      var _fanMatch = keywords.match(/([^\s，,、]+)同人/)
      // 修复 v4 TS18047：增加空值保护
      if (_isFanfictionMode || _fanMatch) {
        var _fanfictionSource = _isFanfictionMode ? (imitateSearch || '').trim() : (_fanMatch ? _fanMatch[1] : '')
        if (_fanfictionSource && _fanfictionSource.length >= 2) {
          try {
            var _bookRes = await fetch('/tuzhong-wenshu/api/book-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookName: _fanfictionSource }),
            })
            if (_bookRes.ok) {
              var _bookJson = await _bookRes.json()
              if (_bookJson.success && _bookJson.data) {
                _fanfictionBookData = _bookJson.data
              }
            }
          } catch (e) {
          }
        }
      }
      var requestData = {
        step: 'idea',
        input: keywords,
        keywords: keywordsArray,
        genre,
        novelId: 'temp',
        llmConfig: getStepLlmConfig('idea'),
        enabledSkills: getEnabledSkills(),
        activeStyle: getActiveStyle(),
        bestsellerPrefs: getBestsellerPrefs(),
        previousData: {
          keywords: keywordsArray,
          imitate: buildImitatePayload(),
          bookAnalysis: generatedDataRef.current.bookAnalysis,
          detailedDesignInput: detailedDesignInput,
          creationMode: creationMode,
          fanfictionBookData: _fanfictionBookData,
          // 🔥 主角设定（性别、姓名、年龄、身份背景）：用户在输入主题环节指定，由AI按全类型命名规则补全
          protagonistSettings: {
            name: protagonistName.trim(),
            gender: protagonistGender,
            age: protagonistAge.trim(),
            identity: protagonistIdentity.trim(),
          },
        },
      }
      console.log('[handleGenerateIdea] LLM config:', JSON.stringify(requestData.llmConfig).substring(0, 200))
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        console.log('[handleGenerateIdea] Response keys:', json.data ? Object.keys(json.data) : 'null')
        console.log('[handleGenerateIdea] json.data.title:', json.data?.title)
        console.log('[handleGenerateIdea] json.data type:', typeof json.data)
        if (!json.data || (typeof json.data === 'object' && Object.keys(json.data).length === 0)) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        var normalizedIdea = normalizeIdeaData(json.data)
        if (isEmptyResult(normalizedIdea, 'idea')) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        // 🔥 2026-08-27 #1：用户指定书名则严格采用，覆盖 AI 生成的书名
        if (userBookTitle && userBookTitle.trim()) {
          console.log('[idea] 采用用户书名《' + userBookTitle.trim() + '》覆盖 AI 生成《' + (normalizedIdea.title || '') + '》')
          normalizedIdea.title = userBookTitle.trim()
        } else if (detailedDesignInput && detailedDesignInput.trim()) {
          // 🔥 2026-08-30 问题5：书名框留空但「详细设定」里明显写了书名时，优先取用用户设计的书名，而非 AI 另起
          var _titleFromDesign = ''
          var _mBook = detailedDesignInput.match(/《([^》]{2,30})》/)
          var _mTag = detailedDesignInput.match(/【书名】\s*([^\n，,。]{2,30})/)
          var _mColon = detailedDesignInput.match(/(?:^|\n)\s*书名[:：]\s*([^\n，,。]{2,30})/)
          if (_mTag) _titleFromDesign = _mTag[1].trim()
          else if (_mColon) _titleFromDesign = _mColon[1].trim()
          else if (_mBook) _titleFromDesign = _mBook[1].trim()
          if (_titleFromDesign) {
            console.log('[idea] 从详细设定提取书名《' + _titleFromDesign + '》覆盖 AI 生成《' + (normalizedIdea.title || '') + '》')
            normalizedIdea.title = _titleFromDesign
          }
        }
        // 🔥 永久保存用户原始关键词，不依赖React state，不被任何后续操作覆盖
        normalizedIdea.userKeywords = keywordsArray
        normalizedIdea.userInput = keywords
        // 🔥 2026-08-30：把用户「详细设定 + 主角设定」随 idea 传播到所有后续环节，修复前后设定漂移（程序员/特种兵/历史学家乱改）
        normalizedIdea.userDesign = detailedDesignInput || ''
        normalizedIdea.protagonistName = (protagonistName || '').trim()
        normalizedIdea.protagonistGender = protagonistGender || ''
        normalizedIdea.protagonistIdentity = (protagonistIdentity || '').trim()
        // 🔥 #226 缺陷1修复：创作方式并入 idea 一并持久化（服务端落库）。
        //   此前仅同人文模式才写 creationMode，'custom'/'normal' 落库缺失 → 草稿重开无权威值可恢复。
        //   此处无条件写入，使后续新作品有权威 creationMode。
        normalizedIdea.creationMode = creationMode
        // 🔥 保存同人文模式标记，供后续步骤使用
        var _fanMatch2 = keywords.match(/([^\s，,、]+)同人/)
        // 修复 v4 TS18047：增加空值保护
        if (_isFanfictionMode || _fanMatch2) {
          normalizedIdea.fanfictionSource = _isFanfictionMode ? (imitateSearch || '').trim() : (_fanMatch2 ? _fanMatch2[1] : '')
          normalizedIdea.fanfictionBookData = _fanfictionBookData
          normalizedIdea.creationMode = creationMode
        }
        console.log('[handleGenerateIdea] Saved user keywords:', keywordsArray)
        console.log('[handleGenerateIdea] Normalized:', normalizedIdea.title)
        setGeneratedData(function (prev) { return { ...prev, idea: normalizedIdea } })
        saveStepSnapshot('idea', normalizedIdea)
        setStep('idea')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, 'AI generation failed')
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('[handleGenerateIdea] Error:', err)
      showErrorAlert(err, 'AI generation error')
    } finally {
      setIsLoading(false)
    }
  }

  var handleGenerateSynopsis = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // [FIXED]
    setIsLoading(true)
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    try {
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'synopsis',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
            detailedDesignInput: detailedDesignInput,
            idea: generatedData.idea,
            worldbuilding: generatedData.worldbuilding,
            powerSystem: generatedData.powerSystem,
            characters: generatedData.characters,
            factions: generatedData.factions,
            relationships: generatedData.relationships,
            outline: generatedData.outline,
            keyPlots: generatedData.keyPlots,
            chapters: generatedData.chapters,
            keywords: keywordsArray,
            imitate: buildImitatePayload(),
            bookAnalysis: generatedDataRef.current.bookAnalysis,
          },
          llmConfig: getStepLlmConfig('synopsis'),
          enabledSkills: getEnabledSkills(),
        activeStyle: getActiveStyle(),
        bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (!json.data || (typeof json.data === 'object' && Object.keys(json.data).length === 0)) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        var normalizedSynopsis = normalizeSynopsisData(json.data)
        if (isEmptyResult(normalizedSynopsis, 'synopsis')) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        setGeneratedData(function (prev) { return { ...prev, synopsis: normalizedSynopsis } })
        saveStepSnapshot('synopsis', normalizedSynopsis)
        setStep('synopsis')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, 'AI generation failed')
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('[handleGenerateSynopsis] Error:', err)
      showErrorAlert(err, 'AI generation error')
    } finally {
      setIsLoading(false)
    }
  }

  var handleGenerateOutline = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // [FIXED]
    setIsLoading(true)
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    try {
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'outline',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
            detailedDesignInput: detailedDesignInput,
            idea: generatedData.idea || undefined,
            synopsis: generatedData.synopsis,
            worldbuilding: generatedData.worldbuilding,
            powerSystem: generatedData.powerSystem,
            characters: generatedData.characters,
            factions: generatedData.factions,
            relationships: generatedData.relationships,
            keywords: keywordsArray,
            imitate: buildImitatePayload(),
            bookAnalysis: generatedData.bookAnalysis,
          },
          llmConfig: getStepLlmConfig('outline'),
          enabledSkills: getEnabledSkills(),
        activeStyle: getActiveStyle(),
        bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (!json.data || (typeof json.data === 'object' && Object.keys(json.data).length === 0)) {
          // 🔥 Bug3修复：API返回空数据时使用默认兜底数据，不再弹错误提示
          console.log('[handleGenerateOutline] API returned empty data, using fallback outline')
          var fallbackOutline = normalizeOutlineData(null)
          setGeneratedData(function (prev) { return { ...prev, outline: fallbackOutline } })
          saveStepSnapshot('outline', fallbackOutline)
          setStep('outline')
          setIsLoading(false)
          return
        }
        var normalizedOutline = normalizeOutlineData(json.data)
        // 🔥 题材判定（前端轻量）：历史/权谋类禁用修仙模板兜底
        var _owHay = String(genre || '') + ' ' + keywordsArray.join(' ') + ' ' + String(keywords || '')
        var isHistory = /历史|架空|两宋|元明|明清|大唐|盛唐|汉末|三国|权谋|朝堂|宫廷|宫斗|王爷|皇帝|朕|争霸|中兴|复国|抗清|抗日|民国|战国|春秋|秦皇|汉武|大明|大宋|大唐/.test(_owHay)
        var _histPowerLadder = ['白身微末', '县丞知县', '州府道台', '方面大员', '部堂重臣', '中枢辅臣', '封疆军权', '秉国太阿', '定策元勋', '公侯之尊', '亲王之贵', '九五之尊']
        var _cultPowerLadder = ['凡人/起步','炼气/入门','筑基/小成','金丹/中坚','元婴/强者','化神/巅峰','合体/至强','大乘/超然','渡劫/封神','飞升/超越']
        // 🔥 最终防线：确保所有字段都已填充，为每个stage补充缺失字段
        if (normalizedOutline.stages && Array.isArray(normalizedOutline.stages)) {
          for (var _si = 0; _si < normalizedOutline.stages.length; _si++) {
            var _st = normalizedOutline.stages[_si]
            var _idx = _si
            if (!_st.name || _st.name.length < 2) _st.name = '第' + (_idx + 1) + '阶段'
            if (!_st.powerLevel || _st.powerLevel.length < 2) _st.powerLevel = (isHistory ? _histPowerLadder : _cultPowerLadder)[Math.min(_idx, (isHistory ? _histPowerLadder : _cultPowerLadder).length - 1)]
            if (!_st.summary || _st.summary.length < 10) _st.summary = '主角在' + _st.name + '中经历关键成长与冲突，实力和眼界都得到显著提升'
            if (!Array.isArray(_st.mainEvents) || _st.mainEvents.length === 0) _st.mainEvents = [_st.name + '·核心转折']
            if (!Array.isArray(_st.shuangPoints) || _st.shuangPoints.length === 0) _st.shuangPoints = [_st.name + '·高潮爽点']
          }
        }
        if (!normalizedOutline.storyOrigin || normalizedOutline.storyOrigin.length < 10) {
          normalizedOutline.storyOrigin = isHistory ? '王朝倾覆、四方云动之际，主角身陷乱世棋局，于夹缝中谋定而后动' : '一个充满未知与奇遇的玄幻世界，主角在此踏上成长之路'
        }
        if (!normalizedOutline.ending || normalizedOutline.ending.length < 10) {
          normalizedOutline.ending = isHistory ? '主角扫清内忧外患，重整乾坤，登上权力之巅，开创一代中兴新局' : '主角历经千难万险，最终达成目标，在世间留下不朽传奇'
        }
        if (!Array.isArray(normalizedOutline.keyEvents) || normalizedOutline.keyEvents.length === 0) {
          normalizedOutline.keyEvents = isHistory ? [
            { name: '临危受命入局', position: '第一阶段', impact: '主角于乱世中抓住机遇，获得立足之资与初始班底' },
            { name: '整肃内部夺权', position: '第二阶段', impact: '清除掣肘的权奸派系，初步掌握实权' },
            { name: '编练新军立威', position: '第二阶段', impact: '打造嫡系武装，首战告捷扭转被动局面' },
            { name: '平定内乱拓基', position: '第三阶段', impact: '肃清地方割据，稳固地盘与钱粮根基' },
            { name: '挥师决战强敌', position: '第四阶段', impact: '与主要敌对势力战略决战，克复失地' },
            { name: '定鼎开创中兴', position: '第四阶段', impact: '扫清残敌、登临大宝，确立中兴新规' },
          ] : [
            { name: '获得核心机缘', position: '第一阶段', impact: '主角获得改变命运的契机，为后续成长奠定基础' },
            { name: '与重要伙伴相遇', position: '第一阶段', impact: '结识关键伙伴，为后续剧情发展提供助力' },
            { name: '遭遇首个危机', position: '第二阶段', impact: '首次面临真正的威胁，主角被迫快速成长' },
            { name: '揭开重要秘密', position: '第三阶段', impact: '发现世界隐藏的真相，改变对世界的认知' },
            { name: '与反派正面冲突', position: '第四阶段', impact: '与最终反派展开决战，决定世界命运' },
            { name: '达成最终目标', position: '第四阶段', impact: '完成使命，成为传奇人物' },
          ]
        }
        // 🔥 图九/十/十一修复：LLM 未返回时也补齐多线叙事/伏笔映射/成长曲线，避免渲染空值
        var _pn = (json.data && json.data.protagonistName) || ''
        if (!Array.isArray(normalizedOutline.narrativeLines) || normalizedOutline.narrativeLines.length < 3) {
          normalizedOutline.narrativeLines = isHistory ? [
            { name: '复国中兴主线', type: '主线', description: _pn + '从乱世立足到驱逐外虏、再造社稷的完整历程', keyNodes: ['临危受命', '掌握实权', '整军北伐', '光复中兴'] },
            { name: '朝堂权谋线', type: '主线', description: '清洗投降派与党争内耗，重建中枢权威，权衡各方势力', keyNodes: ['铲除权奸', '整肃朝纲', '推行新政', '集权中枢'] },
            { name: '军事改革线', type: '副线', description: '编练新军、革新火器战法，打造嫡系武装', keyNodes: ['创建新军', '初战立威', '攻坚野战', '决战破敌'] },
            { name: '情感牵绊线', type: '副线', description: '主角与女主在乱世中相知相守、共担家国之重', keyNodes: ['患难相识', '并肩抗压', '生死考验', '携手中兴'] },
          ] : [
            { name: '主角成长主线', type: '主线', description: _pn + '从获得机缘到登顶巅峰的完整成长历程', keyNodes: ['觉醒', '历练', '突破', '巅峰决战'] },
            { name: '反派对抗线', type: '主线', description: '主角与反派势力从试探到全面对抗的过程', keyNodes: ['初次冲突', '矛盾升级', '全面开战', '最终对决'] },
            { name: '情感线', type: '副线', description: '主角与女主从相识到相守的感情发展', keyNodes: ['初遇', '共患难', '误会分离', '相守'] },
            { name: '世界揭秘线', type: '暗线', description: '世界真相与核心秘密的逐步揭开', keyNodes: ['发现异常', '获得线索', '真相大白'] },
          ]
        }
        if (!Array.isArray(normalizedOutline.foreshadowingMap) || normalizedOutline.foreshadowingMap.length < 3) {
          normalizedOutline.foreshadowingMap = isHistory ? [
            { id: '主角的真实来历', content: '主角远超常人的见识令身边人暗自疑窦 → 关键节点其先见之明部分显露，成为凝聚人心的契机', plantedChapter: '第1-2卷', recoveredChapter: '中期卷', importance: 5 },
            { id: '朝中降清暗桩', content: '议和之声与个别重臣的暧昧书信若隐若现 → 出卖军机之谋败露，触发清洗投降派的高潮', plantedChapter: '第1卷', recoveredChapter: '第3-4卷', importance: 5 },
            { id: '新军之雏形', content: '主角于微末中暗中编练的新式部队早期不被看好 → 国运危殆之际成为翻盘利刃，奠定北伐根基', plantedChapter: '第2卷', recoveredChapter: '北伐阶段', importance: 5 },
            { id: '敌国内部之隙', content: '敌方阵营权力交接与内部矛盾暗流涌动 → 决战之际内乱爆发，提供战略窗口', plantedChapter: '第4卷', recoveredChapter: '结局卷', importance: 3 },
          ] : [
            { id: '金手指来历之谜', content: '主角意外获得的机缘来源神秘 → 中后期揭秘其真实来历', plantedChapter: '第1卷', recoveredChapter: '倒数第2卷', importance: 5 },
            { id: '主角身世之谜', content: '主角出身看似平凡实则暗藏隐情 → 身世揭晓，牵动核心秘密', plantedChapter: '第1卷', recoveredChapter: '第4卷', importance: 5 },
            { id: '反派真实目的', content: '反派行动背后隐藏不为人知的目的 → 终极计划曝光', plantedChapter: '第2卷', recoveredChapter: '最终卷', importance: 5 },
          ]
        }
        if (!Array.isArray(normalizedOutline.protagonistGrowthCurve) || normalizedOutline.protagonistGrowthCurve.length < 3) {
          normalizedOutline.protagonistGrowthCurve = isHistory ? [
            { stage: '立足求存', powerLevel: _histPowerLadder[1], growthPoint: '第1-2卷：' + _pn + '于残局中站稳脚跟，化解迫在眉睫之危', psychologicalChange: '确立中兴之志，渐悟权责' },
            { stage: '集权整纲', powerLevel: _histPowerLadder[4], growthPoint: '第3-4卷：铲除权奸、整肃党争，收拢财权兵权', psychologicalChange: '深知制度与人心重于兵戈' },
            { stage: '练兵图强', powerLevel: _histPowerLadder[6], growthPoint: '第5-6卷：编练新军、屯田积粮，初战立威', psychologicalChange: '格局转向天下经略' },
            { stage: '挥师北伐', powerLevel: _histPowerLadder[9], growthPoint: '第7-8卷：主动出击、克复失地，战略决战', psychologicalChange: '敢担兴亡之重' },
            { stage: '再造一统', powerLevel: _histPowerLadder[11], growthPoint: '第9-10卷：还于旧都，确立中兴新规', psychologicalChange: '功成不忘创业之艰' },
          ] : [
            { stage: '觉醒期', powerLevel: _cultPowerLadder[1], growthPoint: '第1-20章：' + _pn + '获得机缘，觉醒力量，解决最初危机', psychologicalChange: '从迷茫到坚定' },
            { stage: '成长期', powerLevel: _cultPowerLadder[3], growthPoint: '第21-50章：外出历练，结识伙伴，遭遇强敌并突破', psychologicalChange: '建立自信，承担责任' },
            { stage: '崛起期', powerLevel: _cultPowerLadder[6], growthPoint: '第51-85章：绝境突破，建立势力，正面碰撞反派', psychologicalChange: '格局扩大，转向大义' },
            { stage: '巅峰期', powerLevel: _cultPowerLadder[9], growthPoint: '第86-100章：最终决战，登顶巅峰', psychologicalChange: '心境与实力双重圆满' },
          ]
        }
        if (isEmptyResult(normalizedOutline, 'outline')) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        setGeneratedData(function (prev) { return { ...prev, outline: normalizedOutline } })
        saveStepSnapshot('outline', normalizedOutline)
        setStep('outline')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        console.log('[handleGenerateOutline] API failed, using fallback data')
        var _fallbackOutline = normalizeOutlineData(null)
        setGeneratedData(function (prev) { return { ...prev, outline: _fallbackOutline } })
        saveStepSnapshot('outline', _fallbackOutline)
        setStep('outline')
        showErrorAlert(errJson, 'AI生成失败，已使用默认大纲数据')
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('[handleGenerateOutline] Error:', err)
      console.log('[handleGenerateOutline] Exception caught, using fallback data')
      var _fallbackOutline2 = normalizeOutlineData(null)
      setGeneratedData(function (prev) { return { ...prev, outline: _fallbackOutline2 } })
      saveStepSnapshot('outline', _fallbackOutline2)
      setStep('outline')
      showErrorAlert(err, 'AI生成异常，已使用默认大纲数据')
    } finally {
      setIsLoading(false)
    }
  }

  var handleGenerateWorldbuilding = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // [FIXED]
    setIsLoading(true)
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    try {
      console.log('[handleGenerateWorldbuilding] Starting, keywords:', keywords, ', genre:', genre)
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'worldbuilding',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            idea: generatedData.idea || undefined,
            keywords: keywordsArray,
            imitate: buildImitatePayload(),
            bookAnalysis: generatedData.bookAnalysis,
            detailedDesignInput: detailedDesignInput,
            powerSystem: generatedData.powerSystem || undefined,
          },
          llmConfig: getStepLlmConfig('worldbuilding'),
          enabledSkills: getEnabledSkills(),
        activeStyle: getActiveStyle(),
        bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      console.log('[handleGenerateWorldbuilding] Response status:', res.status)
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        console.log('[handleGenerateWorldbuilding] Response:', JSON.stringify(json).substring(0, 200))
        if (!json.data || (typeof json.data === 'object' && Object.keys(json.data).length === 0)) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        var normalized = normalizeWorldbuildingData(json.data)
        if (isEmptyResult(normalized, 'worldbuilding')) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        console.log('[handleGenerateWorldbuilding] Normalized')
        // 🔥 修复问题2：AI自动设计的新力量体系回写设定中心
        // 业务逻辑：如果世界观设定-力量体系是AI自动设计（非设定中心取值），且设定中心没有该体系，则回写到设定中心
        // 确保世界观设定-力量体系、金手指设定-世界力量体系、设定中心-金手指/体系类型三者同步
        if (normalized.powerSystem && typeof normalized.powerSystem === 'string' && !normalized.powerSystemType) {
          var _psText = normalized.powerSystem
          // 尝试从 powerSystem 文本中提取体系名
          var _extractedSysName = ''
          var _nameMatch = _psText.match(/【体系名称】\s*([^\n【】]+)/)
          if (_nameMatch && _nameMatch[1]) {
            _extractedSysName = _nameMatch[1].trim()
          } else {
            var _sysMatch = _psText.match(/([\u4e00-\u9fff]{2,8})(?:修炼体系|力量体系|体系|功法体系)/)
            if (_sysMatch && _sysMatch[1]) {
              _extractedSysName = _sysMatch[1] + '体系'
            }
          }
          // 🔥 清理被整句描述污染的体系名称："南明军政体系以皇权为核心" → "南明军政体系"
          if (_extractedSysName) {
            _extractedSysName = _extractedSysName.replace(/\s*[，,、].*$/, '').replace(/(以|为|是)[^体]*/, '').trim()
            if (_extractedSysName.length > 12) _extractedSysName = _extractedSysName.substring(0, 12)
          }
          if (_extractedSysName && _extractedSysName.length >= 2) {
            fetch('/tuzhong-wenshu/api/settings/types', { method: 'GET' })
              .then(function(r) { return r.json() })
              .then(function(d) {
                if (!d || !d.success) return
                var existing = (d.data.systemTypes || []) as any[]
                var found = existing.find(function(t: any) { return t.name === _extractedSysName })
                if (!found) {
                  var _autoCategory = (/历史|军事|权谋|朝堂|军政|皇权/.test(genre + ' ' + _extractedSysName + ' ' + keywords)) ? '朝堂江湖/历史权谋'
                    : (/科幻|星际|基因|机甲|进化/.test(genre + ' ' + _extractedSysName)) ? '星际科幻'
                    : (/魔法|斗气|西幻/.test(genre + ' ' + _extractedSysName)) ? '西方奇幻'
                    : (/洪荒|封神|巫|神话/.test(genre + ' ' + _extractedSysName)) ? '洪荒/神话'
                    : '东方玄幻'
                  var _newSysItem: any = {
                    name: _extractedSysName,
                    category: _autoCategory,
                    description: '由AI世界观生成流程自动添加的' + _extractedSysName,
                    order: 999,
                    realmSystem: _genSystemRealmSystem(_extractedSysName, genre, keywords),
                    cultivationMethod: _genSystemCultivationMethod(_extractedSysName, genre, keywords),
                    restraintRelation: _genSystemRestraintRelation(_extractedSysName, genre, keywords),
                  }
                  var _realmMatch = _psText.match(/【境界划分】\s*([^\n【】]+)/)
                  if (_realmMatch && _realmMatch[1] && _realmMatch[1].includes('→')) {
                    _newSysItem.realmSystem = _realmMatch[1].trim()
                  }
                  var _cultMatch = _psText.match(/【修炼方式】\s*([^\n【】]+)/)
                  if (_cultMatch && _cultMatch[1] && _cultMatch[1].length > 5) {
                    _newSysItem.cultivationMethod = _cultMatch[1].trim()
                  }
                  var _restMatch = _psText.match(/【克制关系】\s*([^\n【】]+)/)
                  if (_restMatch && _restMatch[1] && _restMatch[1].length > 5) {
                    _newSysItem.restraintRelation = _restMatch[1].trim()
                  }
                  fetch('/tuzhong-wenshu/api/settings/types', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'system', item: _newSysItem }),
                  }).then(function() {
                    console.log('[handleGenerateWorldbuilding] 回写新体系到设定中心: ' + _extractedSysName)
                  }).catch(function(e: any) { console.warn('[handleGenerateWorldbuilding] 回写新体系失败:', e) })
                } else if (!found.realmSystem || !found.cultivationMethod || !found.restraintRelation) {
                  var _updSysItem: any = { id: found.id, name: _extractedSysName }
                  var _needSysUpdate = false
                  if (!found.realmSystem) { _updSysItem.realmSystem = _genSystemRealmSystem(_extractedSysName, genre, keywords); _needSysUpdate = true }
                  if (!found.cultivationMethod) { _updSysItem.cultivationMethod = _genSystemCultivationMethod(_extractedSysName, genre, keywords); _needSysUpdate = true }
                  if (!found.restraintRelation) { _updSysItem.restraintRelation = _genSystemRestraintRelation(_extractedSysName, genre, keywords); _needSysUpdate = true }
                  if (_needSysUpdate) {
                    fetch('/tuzhong-wenshu/api/settings/types', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'system', item: _updSysItem }),
                    }).catch(function(e: any) { console.warn('[handleGenerateWorldbuilding] 补充体系字段失败:', e) })
                  }
                }
              })
              .catch(function(e: any) { console.warn('[handleGenerateWorldbuilding] 查询体系失败:', e) })
          }
        }
        setGeneratedData(function (prev) { return { ...prev, worldbuilding: normalized } })
        saveStepSnapshot('worldbuilding', normalized)
        setStep('worldbuilding')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, 'AI generation failed')
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('[handleGenerateWorldbuilding] Error:', err)
      showErrorAlert(err, 'AI generation error')
    } finally {
      setIsLoading(false)
    }
  }

  // 🔥 初始化章节框架（不调用AI生成内容，仅创建空的卷章结构供用户配置）
  var handleInitChaptersFrame = function() {
    try {
      var _latestData = generatedDataRef.current
      var keyPlotsVolumes = _latestData.keyPlots?.volumes || []
      var outlineStages = _latestData.outline?.stages || []
      var keyPlots = _latestData.keyPlots?.keyPlots || []

      // 🔥 图十三修复：testMode 免粘——仅 build 标志或 URL 显式 ?testMode=true 才生效；顺手清除历史残留，避免被误锁 1卷3章
      var _testUrlMode = (typeof window !== 'undefined') && window.location.search.includes('testMode=true')
      if (typeof window !== 'undefined' && window.localStorage && !_testUrlMode && window.localStorage.getItem('testMode') === 'true') {
        window.localStorage.removeItem('testMode')
        console.log('[Chapters] 检测到残留 localStorage.testMode，已清除（testMode 改为仅 URL 显式生效·免粘）')
      }
      var _isTestMode = __TEST_MODE__ || _testUrlMode

      var volumeCount = 5
      var chaptersPerVolume = 60

      if (_isTestMode) {
        volumeCount = 1
        chaptersPerVolume = 3
        console.log('[InitChaptersFrame] 测试模式: 1卷3章，快速验证流程')
      } else if (userModifiedVolumeConfig && volumeConfig.volumeCount > 0 && volumeConfig.chaptersPerVolume > 0 && !(volumeConfig.volumeCount === 1 && volumeConfig.chaptersPerVolume === 3)) {
        volumeCount = volumeConfig.volumeCount
        chaptersPerVolume = volumeConfig.chaptersPerVolume
        console.log('[InitChaptersFrame] 用户已手动修改卷数配置，使用用户设置:', { volumeCount, chaptersPerVolume })
      } else {
        // 🔥 分卷章节划分修复：卷数以「分卷剧情结构」keyPlots.volumes 的实际卷数为准，不再强制扩到10卷
        // 只有完全没有分卷结构时才回退到大纲阶段的阶段数
        if (Array.isArray(keyPlotsVolumes) && keyPlotsVolumes.length > 0) {
          volumeCount = keyPlotsVolumes.length
          console.log('[InitChaptersFrame] 以分卷剧情结构卷数为准:', volumeCount, '总卷数(volumes.length):', keyPlotsVolumes.length)
        } else if (outlineStages.length > 0) {
          volumeCount = outlineStages.length
          console.log('[InitChaptersFrame] 无分卷结构，回退到大纲阶段数:', volumeCount)
        } else {
          var kpCountForInit = Array.isArray(keyPlots) ? keyPlots.length : 0
          if (kpCountForInit >= 30) {
            volumeCount = 10
          } else if (kpCountForInit >= 10) {
            volumeCount = 8
          } else if (kpCountForInit >= 3) {
            volumeCount = 5
          } else {
            volumeCount = 3
          }
          console.log('[InitChaptersFrame] 基于keyPlots数量推断卷数:', volumeCount, 'kpCount:', kpCountForInit)
        }
        chaptersPerVolume = volumeConfig.chaptersPerVolume || 60

        var kpCountForInit2 = Array.isArray(keyPlots) ? keyPlots.length : 0
        if (kpCountForInit2 > 0 && volumeCount > 0) {
          var avgKpPerVolumeForInit = kpCountForInit2 / volumeCount
          chaptersPerVolume = Math.max(20, Math.min(60, Math.round(avgKpPerVolumeForInit * 10)))
          console.log('[InitChaptersFrame] 基于关键剧情密度计算每卷章节数:', chaptersPerVolume, 'avgKpPerVolume:', avgKpPerVolumeForInit.toFixed(1))
        } else {
          chaptersPerVolume = 60
        }
        // 🔥 硬约束：总数>=300章（卷数变少时每卷章节数相应调大）
        if (volumeCount > 0 && volumeCount * chaptersPerVolume < 300) {
          chaptersPerVolume = Math.ceil(300 / volumeCount)
          console.log('[InitChaptersFrame] 总章节数不足300，每卷章节数调大为:', chaptersPerVolume, '总计:', volumeCount * chaptersPerVolume)
        }
        if (volumeCount > 0 && volumeCount * chaptersPerVolume > 600) {
          chaptersPerVolume = Math.max(25, Math.round(600 / volumeCount))
          console.log('[InitChaptersFrame] 总章节数超600，每卷章节数缩减为:', chaptersPerVolume, '总计:', volumeCount * chaptersPerVolume)
        }
      }

      setVolumeConfig({ volumeCount: volumeCount, chaptersPerVolume: chaptersPerVolume })

      var cnNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十']

      // 🔥🔥🔥 问题6修复：当用户修改卷数后，重新分配keyPlots到新卷中
      // 如果keyPlotsVolumes长度与volumeCount不一致，将keyPlots节点均匀分配到新卷
      var _allKpNodes = _latestData.keyPlots?.keyPlots || []
      var _redistributedVolumes: any[] = []

      // 🔥🔥🔥 问题7修复：从节点内容生成4字+4字卷名
      var _padKwToFour = function(kw: string, sourceText: string, volIdx: number): string {
        if (!kw) return ''
        var s = String(kw).trim().replace(/[，。！？、：；""''（）\s]/g, '')
        if (s.length >= 4) return s.slice(0, 4)
        if (s.length < 2) return ''
        // 2字→4字扩展映射
        var _map: Record<string, string[]> = {
          '觉醒': ['觉醒之力', '觉醒时刻', '觉醒蜕变'],
          '突破': ['突破极限', '突破瓶颈', '突破桎梏'],
          '崛起': ['强势崛起', '势力崛起', '王者崛起'],
          '出征': ['出征四方', '出征远方', '出征疆场'],
          '探索': ['探索秘境', '探索真相', '探索未知'],
          '决战': ['终极决战', '巅峰决战', '生死决战'],
          '传承': ['传承远古', '传承之力', '传承觉醒'],
          '秘境': ['秘境探幽', '秘境寻宝', '秘境历险'],
          '复仇': ['复仇之路', '复仇血战', '复仇天罚'],
          '归来': ['王者归来', '强势归来', '凯旋归来'],
          '重生': ['重生归来', '重生之路', '重生涅槃'],
          '蜕变': ['蜕变重生', '蜕变升华', '蜕变之路'],
          '守护': ['守护家园', '守护苍生', '守护族人'],
          '联盟': ['联盟共抗', '联盟立约', '多方联盟'],
          '背叛': ['背叛危机', '遭遇背叛', '背叛反击'],
        }
        if (_map[s]) {
          var cands = _map[s]
          return cands[volIdx % cands.length]
        }
        // 通用扩展
        var suffixes = ['之路', '风云', '时刻', '篇章']
        return s + suffixes[volIdx % suffixes.length]
      }

      // 🔥🔥🔥 问题7修复：从节点列表生成4字+4字卷名
      var _makeVolNameFromNodes = function(nodes: any[], volIdx: number): string {
        if (!nodes || nodes.length === 0) return ''
        var firstNode = nodes[0]
        var lastNode = nodes[nodes.length - 1]
        var climaxNode = nodes.find(function(n: any, i: number) { return n.importance === 'high' && i !== 0 }) || lastNode

        // 提取第一部分（高潮节点）
        var _firstPart = ''
        if (climaxNode && climaxNode.title) {
          _firstPart = String(climaxNode.title).replace(/^第.+章\s*/, '').replace(/[，。！？、：；""''（）\s]/g, '').slice(0, 4)
        }
        if (!_firstPart && climaxNode && climaxNode.summary) {
          // 从summary提取关键词
          var _sumWords = ['觉醒', '突破', '崛起', '出征', '探索', '决战', '传承', '秘境', '复仇', '归来', '重生', '蜕变', '守护', '联盟', '背叛', '大战', '激战', '对决', '交锋', '争霸']
          for (var _sw = 0; _sw < _sumWords.length; _sw++) {
            if (String(climaxNode.summary).indexOf(_sumWords[_sw]) >= 0) {
              _firstPart = _sumWords[_sw]
              break
            }
          }
        }

        // 提取第二部分（结尾节点）
        var _secondPart = ''
        if (lastNode && lastNode.title && lastNode !== climaxNode) {
          _secondPart = String(lastNode.title).replace(/^第.+章\s*/, '').replace(/[，。！？、：；""''（）\s]/g, '').slice(0, 4)
        }
        if (!_secondPart && lastNode && lastNode.summary) {
          var _sumWords2 = ['觉醒', '突破', '崛起', '出征', '探索', '决战', '传承', '秘境', '复仇', '归来', '重生', '蜕变', '守护', '联盟', '背叛', '大战', '激战', '对决', '交锋', '争霸']
          for (var _sw2 = 0; _sw2 < _sumWords2.length; _sw2++) {
            if (String(lastNode.summary).indexOf(_sumWords2[_sw2]) >= 0 && _sumWords2[_sw2] !== _firstPart) {
              _secondPart = _sumWords2[_sw2]
              break
            }
          }
        }

        // 扩展为4字
        var _fp4 = _firstPart ? _padKwToFour(_firstPart, climaxNode?.summary || '', volIdx) : ''
        var _sp4 = _secondPart ? _padKwToFour(_secondPart, lastNode?.summary || '', volIdx + 1) : ''

        // 如果两部分相同或某部分为空，使用通用词
        if (_fp4 === _sp4 || !_sp4) {
          var _genericWords = ['崭露头角', '势力初成', '机缘降临', '强者云集', '波澜再起', '浴火重生', '共赴危难', '定鼎乾坤', '威震四方', '风云际会']
          _sp4 = _genericWords[volIdx % _genericWords.length]
        }
        if (!_fp4) {
          var _genericFirst = ['初入江湖', '初露锋芒', '初入仙途', '初涉风云', '初入朝堂', '初入职场', '初入星际']
          _fp4 = _genericFirst[volIdx % _genericFirst.length]
        }

        return _fp4 + '，' + _sp4
      }

      if (keyPlotsVolumes.length > 0 && keyPlotsVolumes.length !== volumeCount) {
        console.log('[InitChaptersFrame] 🔥 卷数配置与keyPlots不一致(' + keyPlotsVolumes.length + '→' + volumeCount + ')，重新分配keyPlots')
        // 将所有keyPlots节点按volume均匀分配到新卷数中
        var _nodesPerVol = Math.ceil(_allKpNodes.length / volumeCount)
        for (var _rvIdx = 0; _rvIdx < volumeCount; _rvIdx++) {
          var _rvStart = _rvIdx * _nodesPerVol
          var _rvEnd = Math.min(_rvStart + _nodesPerVol, _allKpNodes.length)
          var _rvNodes = _allKpNodes.slice(_rvStart, _rvEnd)
          // 🔥🔥🔥 问题7修复：生成4字+4字格式卷名
          var _rvNameSuffix = _makeVolNameFromNodes(_rvNodes, _rvIdx)
          var _rvName = '第' + (((_rvIdx + 1) >= 1 && (_rvIdx + 1) <= 20) ? cnNums[_rvIdx] : String(_rvIdx + 1)) + '卷·' + (_rvNameSuffix || '崭露头角')
          var _rvSummary = ''
          var _rvObjective = ''
          if (_rvNodes.length > 0) {
            var _firstNode = _rvNodes[0]
            // 🔥🔥🔥 问题7修复：生成更完整的卷摘要（组合首尾节点摘要）
            var _rvSummaries = _rvNodes.map(function(n: any) { return n.summary || '' }).filter(function(s: string) { return s.length > 5 })
            if (_rvSummaries.length > 0) {
              // 取首节点摘要作为开端，尾节点摘要作为结尾
              var _openSum = _rvSummaries[0]
              var _endSum = _rvSummaries.length > 1 ? _rvSummaries[_rvSummaries.length - 1] : ''
              _rvSummary = _openSum + (_endSum && _endSum !== _openSum ? '；' + _endSum : '')
              if (_rvSummary.length > 200) _rvSummary = _rvSummary.substring(0, 200)
            }
            // 🔥🔥🔥 问题7修复：生成更完整的卷核心目标
            if (_firstNode.summary) {
              _rvObjective = String(_firstNode.summary).slice(0, 100)
            }
          }
          // 🔥 分卷章节划分修复：重排时保留/沿用原「分卷剧情结构」每卷已设计的 name/coreObjective/openingNode/climaxNode/endHook/keyEvents，不丢弃重造
          var _designed = keyPlotsVolumes[_rvIdx] || null
          var _designedName = _designed && _designed.name ? String(_designed.name).trim() : ''
          var _designedObjective = _designed && _designed.coreObjective ? String(_designed.coreObjective).trim() : ''
          var _designedSummary = _designed ? synthVolumeSummaryFromDesign(_designed) : ''
          var _designedKeyEvents = (_designed && Array.isArray(_designed.keyEvents) && _designed.keyEvents.length > 0) ? _designed.keyEvents : _rvNodes.map(function(n: any) { return n.title || '' }).filter(Boolean)
          _redistributedVolumes.push({
            name: _designedName || _rvName,
            summary: _designedSummary || _rvSummary,
            coreObjective: _designedObjective || _rvObjective,
            openingNode: (_designed && _designed.openingNode) ? _designed.openingNode : null,
            climaxNode: (_designed && _designed.climaxNode) ? _designed.climaxNode : null,
            endHook: (_designed && _designed.endHook) ? _designed.endHook : null,
            keyEvents: _designedKeyEvents,
            _nodes: _rvNodes
          })
        }
        keyPlotsVolumes = _redistributedVolumes
        console.log('[InitChaptersFrame] 🔥 keyPlots重新分配完成: ' + _redistributedVolumes.length + '卷，卷名示例: ' + (_redistributedVolumes[0]?.name || ''))
      }

      var allVolumes: any[] = []
      for (var volNum = 1; volNum <= volumeCount; volNum++) {
        var volCn = (volNum >= 1 && volNum <= 20) ? cnNums[volNum - 1] : String(volNum)
        var vkp = keyPlotsVolumes[volNum - 1]
        var chapters: any[] = []
        for (var chNum = 1; chNum <= chaptersPerVolume; chNum++) {
          var chapterNum = (volNum - 1) * chaptersPerVolume + chNum
          chapters.push({
            id: 'ch-v' + volNum + '-c' + chapterNum + '-' + Date.now() + '-' + chNum,
            title: '第' + chapterNum + '章',
            summary: '',
            shuangPoints: [],
            hook: '',
            volume: volNum,
            chapterNumber: chapterNum,
            wordCount: 3000,
            status: 'pending'
          })
        }
        allVolumes.push({
          volumeNumber: volNum,
          name: vkp?.name || ('第' + volCn + '卷'),
          // 🔥 分卷章节划分修复：卷摘要优先按「分卷剧情结构」合成（coreObjective+开端+高潮+卷末钩子，去重），不再仅读 vkp.summary（可能缺失）
          // 🔥 #180b：vkp.summary 本身完整（≥100 字且无「。；」杂讯）时优先直读，synth 只作缺失/过短兜底
          summary: vkp ? ((String(vkp.summary || '').length >= 100 && !/。；/.test(String(vkp.summary))) ? String(vkp.summary) : (synthVolumeSummaryFromDesign(vkp) || vkp.summary || '')) : '',
          coreObjective: vkp?.coreObjective || (vkp ? synthVolumeSummaryFromDesign(vkp) : ''),
          chapterCount: chaptersPerVolume,
          chapters: chapters,
          keyPlots: vkp ? [vkp] : []
        })
      }

      // 🔥 Bug修复：统一数据形状 - 必须包含 chapters 扁平数组、chapterCount、totalWordCount
      // 否则 handleStartGenerating 的 _latestData.chapters.chapters 检查会失败（chapters=false）
      var _flatChapters = allVolumes.flatMap(function(v: any) { return v.chapters; })
      var newChaptersData = {
        volumes: allVolumes,
        chapters: _flatChapters,
        chapterCount: _flatChapters.length,
        totalChapters: volumeCount * chaptersPerVolume,
        totalWordCount: allVolumes.reduce(function(sum: number, v: any) { return sum + v.chapters.length * 3000; }, 0)
      }
      // 🔥🔥🔥 关键修复：先同步更新ref，确保调用方能立即读到最新数据（不依赖setGeneratedData的回调时机）
      generatedDataRef.current = { ...generatedDataRef.current, chapters: newChaptersData }
      setGeneratedData(function(prev) {
        var updated = { ...prev, chapters: newChaptersData }
        generatedDataRef.current = updated
        return updated
      })
      // 🔥 同步写入 localStorage，防止热重载丢失
      try {
        localStorage.setItem('tuzhong-generated-data', JSON.stringify({ ...generatedDataRef.current, chapters: newChaptersData }))
      } catch (e) { console.warn('[InitChaptersFrame] localStorage写入失败:', e) }
      console.log('[InitChaptersFrame] 章节框架初始化完成:', { volumeCount, chaptersPerVolume, totalChapters: volumeCount * chaptersPerVolume, flatChaptersCount: _flatChapters.length })
      setStep('chapters')
    } catch (err) {
      console.error('[handleInitChaptersFrame] Error:', err)
      setStep('chapters')
    }
  }

  var handleGenerateChapters = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    setIsLoading(true)
    var CHAPTER_BATCH_SIZE = 5  // 🔥 每批5章，避免LLM输出过长导致JSON截断

    try {
      // 🔥 Bug修复：使用 generatedDataRef.current 获取最新数据，避免 React 闭包陷阱
      var _latestData = generatedDataRef.current
      if (!_latestData.synopsis) {
        console.log('[Chapters] 前置数据缺失，自动生成故事梗概...')
        genDebounceRef.current = 0 // 重置debounce，确保可以立即调用
        await handleGenerateSynopsis()
        setIsLoading(true) // handleGenerateSynopsis在finally中设为了false，恢复
        var synopsisFromCache = getCurrentStepSnapshot('synopsis')
        if (synopsisFromCache) {
          setGeneratedData(function (prev) {
            var updated = { ...prev, synopsis: synopsisFromCache }
            generatedDataRef.current = updated
            return updated
          })
        }
      }
      _latestData = generatedDataRef.current
      if (!_latestData.outline) {
        console.log('[Chapters] 前置数据缺失，自动生成详细大纲...')
        genDebounceRef.current = 0
        await handleGenerateOutline()
        setIsLoading(true) // handleGenerateOutline在finally中设为了false，恢复
        var outlineFromCache = getCurrentStepSnapshot('outline')
        if (outlineFromCache) {
          setGeneratedData(function (prev) {
            var updated = { ...prev, outline: outlineFromCache }
            generatedDataRef.current = updated
            return updated
          })
        }
      }
      _latestData = generatedDataRef.current
      if (!_latestData.keyPlots) {
        console.log('[Chapters] 前置数据缺失，自动生成关键剧情节点...')
        genDebounceRef.current = 0
        await handleGenerateKeyPlots()
        setIsLoading(true)
        var keyPlotsFromCache = getCurrentStepSnapshot('keyPlots')
        if (keyPlotsFromCache) {
          setGeneratedData(function (prev) {
            var updated = { ...prev, keyPlots: keyPlotsFromCache }
            generatedDataRef.current = updated
            return updated
          })
        }
      }
      _latestData = generatedDataRef.current

      var keyPlotsVolumes = _latestData.keyPlots?.volumes || []
      var outlineStages = _latestData.outline?.stages || []
      var keyPlots = _latestData.keyPlots?.keyPlots || []

      // 🔥 测试模式检测必须放在最前面，优先级最高（覆盖任何用户配置）
      // 🔥 图十三修复：testMode 免粘——仅 build 标志或 URL 显式 ?testMode=true 才生效；顺手清除历史残留，避免被误锁 1卷3章
      var _testUrlMode = (typeof window !== 'undefined') && window.location.search.includes('testMode=true')
      if (typeof window !== 'undefined' && window.localStorage && !_testUrlMode && window.localStorage.getItem('testMode') === 'true') {
        window.localStorage.removeItem('testMode')
        console.log('[Chapters] 检测到残留 localStorage.testMode，已清除（testMode 改为仅 URL 显式生效·免粘）')
      }
      var _isTestMode = __TEST_MODE__ || _testUrlMode
      console.log('[Chapters] DEBUG: __TEST_MODE__=' + __TEST_MODE__ + ', _isTestMode=' + _isTestMode + ', localStorage.testMode=' + (typeof window !== 'undefined' ? window.localStorage.getItem('testMode') : 'N/A') + ', urlIncludes=' + (typeof window !== 'undefined' ? window.location.search.includes('testMode=true') : 'N/A'))

      var volumeCount = 5
      var chaptersPerVolume = 60

      if (_isTestMode) {
        volumeCount = 1
        chaptersPerVolume = 3
        console.log('[Chapters] 测试模式: 1卷3章，快速验证流程')
      } else if (userModifiedVolumeConfig && volumeConfig.volumeCount > 0 && volumeConfig.chaptersPerVolume > 0 && !(volumeConfig.volumeCount === 1 && volumeConfig.chaptersPerVolume === 3)) {
        volumeCount = volumeConfig.volumeCount
        chaptersPerVolume = volumeConfig.chaptersPerVolume
        console.log('[Chapters] 用户已手动修改卷数配置，使用用户设置:', { volumeCount, chaptersPerVolume })
      } else {
        // 🔥 分卷章节划分修复：卷数以「分卷剧情结构」keyPlots.volumes 的实际卷数为准，不再强制扩到10卷
        // 只有完全没有分卷结构时才回退到大纲阶段的阶段数
        if (keyPlotsVolumes.length > 0) {
          volumeCount = keyPlotsVolumes.length
          console.log('[Chapters] 以分卷剧情结构卷数为准:', volumeCount, '总卷数(volumes.length):', keyPlotsVolumes.length)
        } else if (outlineStages.length > 0) {
          volumeCount = outlineStages.length
          console.log('[Chapters] 无分卷结构，回退到大纲阶段数:', volumeCount)
        } else {
          var kpCount = Array.isArray(keyPlots) ? keyPlots.length : 0
          if (kpCount >= 30) {
            volumeCount = 10
          } else if (kpCount >= 10) {
            volumeCount = 8
          } else if (kpCount >= 3) {
            volumeCount = 5
          } else {
            volumeCount = 3
          }
          console.log('[Chapters] 基于keyPlots数量推断卷数:', volumeCount, 'kpCount:', kpCount)
        }
        chaptersPerVolume = volumeConfig.chaptersPerVolume || 60

        var kpCount2 = Array.isArray(keyPlots) ? keyPlots.length : 0
        if (kpCount2 > 0 && volumeCount > 0) {
          var avgKpPerVolume = kpCount2 / volumeCount
          chaptersPerVolume = Math.max(20, Math.min(60, Math.round(avgKpPerVolume * 10)))
          console.log('[Chapters] 基于关键剧情密度计算每卷章节数:', chaptersPerVolume, 'avgKpPerVolume:', avgKpPerVolume.toFixed(1))
        } else {
          chaptersPerVolume = 60
        }
        // 🔥 硬约束：总数>=300章（卷数变少时每卷章节数相应调大）
        if (volumeCount > 0 && volumeCount * chaptersPerVolume < 300) {
          chaptersPerVolume = Math.ceil(300 / volumeCount)
          console.log('[Chapters] 总章节数不足300，每卷章节数调大为:', chaptersPerVolume, '总计:', volumeCount * chaptersPerVolume)
        }
        if (volumeCount > 0 && volumeCount * chaptersPerVolume > 600) {
          chaptersPerVolume = Math.max(25, Math.round(600 / volumeCount))
          console.log('[Chapters] 总章节数超600，每卷章节数缩减为:', chaptersPerVolume, '总计:', volumeCount * chaptersPerVolume)
        }
      }

      setVolumeConfig({ volumeCount: volumeCount, chaptersPerVolume: chaptersPerVolume })
      
      // 🔥 保存实际计算值，避免闭包引用过期的 state
      var _actualVolumeConfig = { volumeCount: volumeCount, chaptersPerVolume: chaptersPerVolume }
      console.log('[Chapters] Final config:', { volumeCount, chaptersPerVolume, totalChapters: volumeCount * chaptersPerVolume, userModified: userModifiedVolumeConfig, keyPlotsVolumes: keyPlotsVolumes.length, outlineStages: outlineStages.length, keyPlots: keyPlots.length })

      var getVolumeNameFallback = function (v: number): string {
        var vkp = keyPlotsVolumes[v - 1]
        var idea = generatedData.idea
        // 🔥🔥🔥 优先使用 keyPlots.volumes 中的 name 字段（关键剧情节点分卷剧情结构的卷标题）
        if (vkp?.name && vkp.name.trim().length >= 2) {
          return vkp.name.trim()
        }
        // 🔥 从关键剧情节点中提取核心事件作为卷名
        if (vkp?.coreObjective && vkp.coreObjective.length > 4) {
          var extracted = vkp.coreObjective.replace(/[，。！？、；：\s]/g, '').slice(0, 12)
          if (extracted.length >= 4) return extracted
        }
        if (vkp?.openingNode?.event && vkp.openingNode.event.length > 4) {
          var opExtracted = vkp.openingNode.event.replace(/[，。！？、；：\s]/g, '').slice(0, 12)
          if (opExtracted.length >= 4) return opExtracted
        }
        // 🔥 从大纲阶段中提取阶段名
        var stageName = outlineStages[v - 1]?.name
        if (stageName && stageName.length >= 2) return stageName
        // 🔥 从核心冲突提取
        var title = idea?.title || ''
        var coreConflict = idea?.coreConflict || ''
        if (coreConflict && coreConflict.length > 4) {
          var conflictSnippet = coreConflict.replace(/[，。！？、；：\s]/g, '').slice(0, 8)
          if (conflictSnippet.length >= 2) return conflictSnippet
        }
        return ''
      }

      var getVolumeSummaryFallback = function (v: number): string {
        var vkp = keyPlotsVolumes[v - 1]
        // 🔥 分卷章节划分修复：卷摘要优先按「分卷剧情结构」合成（coreObjective+开端+高潮+卷末钩子，去重），不再只读 vkp.summary（可能缺失/与分卷剧情结构不符）
        // 🔥 #180b：vkp.summary 本身完整（≥100 字且无「。；」杂讯）时优先直读
        if (vkp) {
          if (String(vkp.summary || '').length >= 100 && !/。；/.test(String(vkp.summary))) return String(vkp.summary)
          var _synthSummary = synthVolumeSummaryFromDesign(vkp)
          if (_synthSummary) return _synthSummary
          if (vkp.summary) return vkp.summary
        }
        return ''
      }

      var getChapterSummaryPlaceholder = function (v: number, chNum: number, chaptersPerVol: number): string {
        // 🔥 修复：占位符返回空字符串，避免同卷同阶段所有章节显示相同的keyPlots内容
        // 实际章节摘要由executeChapterGeneration调用API生成，占位符仅用于UI显示"等待AI生成..."
        return ''
      }

      var allVolumes: any[] = []
      for (var volNum = 1; volNum <= volumeCount; volNum++) {
        var vkp = keyPlotsVolumes[volNum - 1]
        var chapters: any[] = []
        for (var chNum = 1; chNum <= chaptersPerVolume; chNum++) {
          var chapterNum = (volNum - 1) * chaptersPerVolume + chNum
          chapters.push({
            id: 'ch-v' + volNum + '-c' + chapterNum + '-' + Date.now() + '-' + chNum,
            title: '第' + chapterNum + '章',
            summary: getChapterSummaryPlaceholder(volNum, chNum, chaptersPerVolume),
            shuangPoints: [],
            hook: '',
            volume: volNum,
            chapterNumber: chapterNum,
            wordCount: 3000,
            status: 'pending'
          })
        }
        allVolumes.push({
          number: volNum,
          name: getVolumeNameFallback(volNum),
          summary: getVolumeSummaryFallback(volNum),
          coreObjective: vkp?.coreObjective || getVolumeSummaryFallback(volNum),
          keyEvents: vkp?.keyEvents || [],
          openingNode: vkp?.openingNode || null,
          climaxNode: vkp?.climaxNode || null,
          chapters: chapters
        })
      }

      var initialResult = {
        volumes: allVolumes.slice(),
        chapters: allVolumes.flatMap(function (v: any) { return v.chapters; }),
        chapterCount: allVolumes.reduce(function (sum: number, v: any) { return sum + v.chapters.length; }, 0),
        totalWordCount: allVolumes.reduce(function (sum: number, v: any) { return sum + v.chapters.length * 3000; }, 0),
      }
      setGeneratedData(function (prev) {
        var updated = { ...prev, chapters: initialResult }
        generatedDataRef.current = updated
        return updated
      })
      saveStepSnapshot('chapters', initialResult)
      // 🔥 关键：同步更新本地变量 _latestData，确保后续executeChapterGeneration能读到最新数据
      _latestData = generatedDataRef.current
      setStep('chapters')
      // 🔥 修复：handleGenerateChapters只负责创建卷框架，不递归调用executeChapterGeneration
      // executeChapterGeneration会在调用handleGenerateChapters后继续执行章节内容生成
    } catch (err) {
      console.error('[handleGenerateChapters] Error:', err)
      showErrorAlert(err, 'AI generation error')
    } finally {
      setIsLoading(false)
    }
  }

  var executeChapterGeneration = async function() {
    // 🔥🔥🔥 修复：双重锁（ref + window）防止并发执行
    var _winLock = _getChapterGenLock()
    if (chapterGenLockRef.current || _winLock) {
      console.log('[executeChapterGeneration] 🔥 已有章节生成任务在执行中，跳过本次调用 (ref=' + chapterGenLockRef.current + ', win=' + _winLock + ')')
      return
    }
    chapterGenLockRef.current = true
    _setChapterGenLock(true)
    // Debounce guard
    if (!checkGenDebounce()) {
      chapterGenLockRef.current = false
      _setChapterGenLock(false)
      return
    }
    setIsLoading(true)
    var CHAPTER_BATCH_SIZE = 5

    try {
      var _latestData = generatedDataRef.current
      var allVolumes = _latestData.chapters?.volumes || []
      if (allVolumes.length === 0) {
        console.warn('[executeChapterGeneration] No volumes found, calling handleGenerateChapters first')
        await handleGenerateChapters()
        _latestData = generatedDataRef.current
        allVolumes = _latestData.chapters?.volumes || []
        if (allVolumes.length === 0) {
          showErrorAlert(null, '未找到卷数据，请先配置卷数')
          setIsLoading(false)
          return
        }
      }

      // 🔥 修复：从实际数据派生卷配置，避免React state闭包陷阱
      var volumeCount = allVolumes.length
      var chaptersPerVolume = volumeCount > 0 ? (allVolumes[0].chapters?.length || 0) : 0
      // 🔥🔥🔥 Bug修复：传递每卷统一标题字数配置，确保跨批次标题字数一致
      // 从generatedData.chapters.titleCharCount或localStorage中读取持久化的标题字数
      var _persistedTitleCharCount = _latestData.chapters?.titleCharCount
      var _persistedVolTitleLengths = _latestData.chapters?.volumeTitleLengths || []
      var _actualVolumeConfig: any = { volumeCount: volumeCount, chaptersPerVolume: chaptersPerVolume }
      if (typeof _persistedTitleCharCount === 'number' && _persistedTitleCharCount >= 4 && _persistedTitleCharCount <= 6) {
        _actualVolumeConfig.titleCharCount = _persistedTitleCharCount
      }
      if (Array.isArray(_persistedVolTitleLengths) && _persistedVolTitleLengths.length > 0) {
        _actualVolumeConfig.volumeTitleLengths = _persistedVolTitleLengths
      }
      console.log('[executeChapterGeneration] Using volumes from data:', { volumeCount, chaptersPerVolume, titleCharCount: _persistedTitleCharCount, volumeTitleLengths: _persistedVolTitleLengths })

      var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
      var MAX_BATCH_RETRIES = 2
      var existingChapters: any[] = []

      var generateChaptersFromConfig = async function(v: number, batchStart: number, batchEnd: number) {
        var batchRetry = 0
        var _batchApplied = false // 🔥🔥🔥 P0修复：标记本次批次是否真正应用成功
        while (batchRetry < MAX_BATCH_RETRIES) {
          var _chapAbortCtrl = new AbortController()
          var _chapTimeoutId = setTimeout(function() { _chapAbortCtrl.abort() }, 300000)
          var res: Response
          try {
            res = await fetch('/tuzhong-wenshu/api/ai-generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: _chapAbortCtrl.signal,
              body: JSON.stringify({
                step: 'chapters',
                input: keywords,
                keywords: keywordsArray,
                genre,
                novelId: 'temp',
                previousData: {
                  // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
                  detailedDesignInput: detailedDesignInput,
                  idea: _latestData.idea || undefined,
                  synopsis: _latestData.synopsis,
                  outline: _latestData.outline,
                  worldbuilding: _latestData.worldbuilding,
                  powerSystem: _latestData.powerSystem,
                  characters: _latestData.characters,
                  factions: _latestData.factions,
                  relationships: _latestData.relationships,
                  keyPlots: _latestData.keyPlots,
                  volumeKeyPlot: _latestData.keyPlots?.volumes?.[v - 1] || null,
                  keywords: keywordsArray,
                  volumeConfig: _actualVolumeConfig,
                  targetVolume: v,
                  chapterBatchStart: batchStart,
                  chapterBatchEnd: batchEnd,
                  existingChapters,
                  imitate: buildImitatePayload(),
                  bookAnalysis: _latestData.bookAnalysis,
                },
                llmConfig: getStepLlmConfig('chapters'),
              }),
            })
          } catch (_fetchErr: any) {
            clearTimeout(_chapTimeoutId)
            console.warn('[Chapters] fetch error (batchRetry ' + batchRetry + '): ' + (_fetchErr?.name || '') + ' ' + (_fetchErr?.message || ''))
            batchRetry++
            if (batchRetry >= MAX_BATCH_RETRIES) {
              throw new Error('章节生成请求失败：' + (_fetchErr?.message || '网络中断'))
            }
            await new Promise(function(r) { setTimeout(r, 2000 * batchRetry) })
            continue
          }
          clearTimeout(_chapTimeoutId)
          if (res.ok) {
            var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
            var returnedChapters = Array.isArray(json.data?.chapters) ? json.data.chapters : (Array.isArray(json.data) ? json.data : [])
            console.log('[Chapters] API response for vol ' + v + ' batch ' + batchStart + '-' + batchEnd + ':', { chapterCount: Array.isArray(returnedChapters) ? returnedChapters.length : 'not_array', hasVolumeName: !!json.data?.volumeName, hasVolumeSummary: !!json.data?.volumeSummary })
            
            if (json.data?.volumeName && allVolumes[v - 1]) {
              allVolumes[v - 1].name = json.data.volumeName
            }
            if (json.data?.volumeCoreObjective && allVolumes[v - 1]) {
              allVolumes[v - 1].coreObjective = json.data.volumeCoreObjective
            }
            if (json.data?.volumeSummary && allVolumes[v - 1]) {
              // 🔥 2026-09-06 修复（#130）：卷摘要必须优先沿用「分卷剧情结构」里已设计好的摘要。
              //    后端 chapters 步会用自己的通用模板重造一份 volumeSummary，若无条件覆盖，
              //    UI 上看到的就变成"主角在本卷围绕…展开"这类空话，而不是已设计好的卷摘要。
              //    改为：结构摘要缺失或过短(<30字)时，才用后端摘要补位。
              var _curVolSum = String(allVolumes[v - 1].summary || '').trim()
              var _newVolSum = String(json.data.volumeSummary || '').trim()
              if (!_curVolSum || _curVolSum.length < 30) {
                allVolumes[v - 1].summary = _newVolSum || _curVolSum
              }
            }
            // 🔥🔥🔥 Bug修复：持久化后端返回的统一标题字数，供后续批次使用
            var _retTitleCharCount = json.data?.batchInfo?.titleCharCount || json.data?.batchInfo?.unifiedTitleLen
            if (typeof _retTitleCharCount === 'number' && _retTitleCharCount >= 4 && _retTitleCharCount <= 6) {
              // 更新_actualVolumeConfig供后续批次使用
              _actualVolumeConfig.titleCharCount = _retTitleCharCount
              // 更新volumeTitleLengths数组
              if (!Array.isArray(_actualVolumeConfig.volumeTitleLengths)) {
                _actualVolumeConfig.volumeTitleLengths = []
              }
              _actualVolumeConfig.volumeTitleLengths[v - 1] = _retTitleCharCount
              // 持久化到generatedData中（会被localStorage自动保存）
              setGeneratedData(function(prev: any) {
                var _updatedVolTitleLens = prev.chapters?.volumeTitleLengths || []
                _updatedVolTitleLens[v - 1] = _retTitleCharCount
                var _updated = { ...prev, chapters: { ...prev.chapters, titleCharCount: _retTitleCharCount, volumeTitleLengths: _updatedVolTitleLens } }
                generatedDataRef.current = _updated
                return _updated
              })
              console.log('[Chapters] 持久化卷' + v + '统一标题字数: ' + _retTitleCharCount + '字')
            }

            if (!Array.isArray(returnedChapters) || returnedChapters.length === 0) {
              batchRetry++
              console.warn('[Chapters] Volume ' + v + ' batch ' + batchStart + '-' + batchEnd + ' empty, retry ' + batchRetry + '/' + MAX_BATCH_RETRIES)
              if (batchRetry < MAX_BATCH_RETRIES) {
                await new Promise(function (resolve) { setTimeout(resolve, 2000 * (batchRetry + 1)) })
                continue
              }
              console.warn('[Chapters] Volume ' + v + ' batch ' + batchStart + '-' + batchEnd + ' empty after ' + MAX_BATCH_RETRIES + ' retries')
              // 🔥🔥🔥 P0修复：生成结果为空不能再静默return，必须抛错，否则外层把失败批次误记为"已完成"
              throw new Error('[Chapters] 卷' + v + '批次' + batchStart + '-' + batchEnd + '章生成为空（重试已耗尽）')
            }

            var chaptersInVolume = allVolumes[v - 1].chapters.length
            var appliedCount = 0
            // 🔥 P0修复：检测"剧情N"等模板化占位标题，标记需要重新生成
            var _placeholderCount = 0
            for (var ri = 0; ri < returnedChapters.length; ri++) {
              var ch = returnedChapters[ri]
              var localIdx = -1
              // 🔥 2026-09-06 修复（#130）：后端历史版本只输出 `number`，这里却只认 `chapterNumber`，
              //    导致该值恒为 undefined → 回落到按 batchStart 推算 → 第 2 卷起 localIdx 恒为负 →
              //    整卷章节被跳过、标题摘要永久停在占位值。改为两个字段名都认。
              var _chNo = 0
              if (typeof ch.chapterNumber === 'number' && ch.chapterNumber > 0) _chNo = ch.chapterNumber
              else if (typeof ch.number === 'number' && ch.number > 0) _chNo = ch.number
              if (_chNo > 0) {
                localIdx = _chNo - 1 - (v - 1) * chaptersInVolume
              }
              if (localIdx < 0 || localIdx >= chaptersInVolume) {
                localIdx = batchStart - 1 - (v - 1) * chaptersInVolume + ri
              }
              if (localIdx >= 0 && localIdx < chaptersInVolume) {
                var cleanTitle = ch.title || ''
                var globalNum = (v - 1) * chaptersInVolume + localIdx + 1
                // 🔥 P0修复：检测"剧情N""章节N"等模板化占位标题
                var _isPlaceholderTitle = /^剧情\d+$/.test(cleanTitle) || /^章节\d+$/.test(cleanTitle) || /^待生成$/.test(cleanTitle) || /^关键剧情$/.test(cleanTitle) || /^剧情发展$/.test(cleanTitle)
                if (_isPlaceholderTitle) {
                  _placeholderCount++
                  console.warn('[Chapters] 检测到模板化占位标题: "' + cleanTitle + '"，第' + globalNum + '章，将重新生成')
                  // 标记为需要重新生成，不应用此标题
                  continue
                }
                var fullTitle = cleanTitle ? '第' + globalNum + '章 ' + cleanTitle : '第' + globalNum + '章'

                // 🔥 2026-09-06 修复（#130）：原先只挑 5 个字段赋值，后端已补全的
                //    phase/writingGoal/foreshadowing/turningPoint/characterGrowth/sceneSetting/
                //    informationGap/estimatedWords 等深度字段被整体丢弃 → UI 深度字段全空。
                //   改为先整体浅合并后端章节对象，再覆盖需要本地规范化的字段。
                allVolumes[v - 1].chapters[localIdx] = {
                  ...allVolumes[v - 1].chapters[localIdx],
                  ...ch,
                  chapterNumber: globalNum,
                  number: globalNum,
                  title: fullTitle,
                  summary: ch.summary || allVolumes[v - 1].chapters[localIdx].summary || '',
                  shuangPoints: ch.shuangPoints || [],
                  hook: ch.hook || '',
                  status: (ch.summary || allVolumes[v - 1].chapters[localIdx].summary) ? 'planned' : 'pending'
                }
                appliedCount++
              }
            }
            // 🔥 P0修复：如果超过一半的标题是占位标题，触发重试
            if (_placeholderCount > 0 && _placeholderCount >= Math.ceil(returnedChapters.length / 2)) {
              console.warn('[Chapters] 卷' + v + '批次' + batchStart + '-' + batchEnd + '有' + _placeholderCount + '个占位标题，触发重试')
              batchRetry++
              if (batchRetry < MAX_BATCH_RETRIES) {
                await new Promise(function (resolve) { setTimeout(resolve, 2000 * (batchRetry + 1)) })
                continue
              }
            }
            console.log('[Chapters] Applied ' + appliedCount + '/' + returnedChapters.length + ' chapters to vol ' + v)
            var _updatedChapters = { volumes: allVolumes.slice(), chapters: allVolumes.flatMap(function (v: any) { return v.chapters }), chapterCount: allVolumes.reduce(function (s: number, v: any) { return s + v.chapters.length }, 0), totalWordCount: allVolumes.reduce(function (s: number, v: any) { return s + v.chapters.length * 3000 }, 0) }
            setGeneratedData(function (prev) {
              var updated = { ...prev, chapters: _updatedChapters }
              generatedDataRef.current = updated
              return updated
            })
            // 🔥🔥🔥 Bug修复：从.slice(-100)扩大到.slice(-200)，让LLM能看到更多前章摘要进行去重
            existingChapters = allVolumes.flatMap(function (vol: any) { return vol.chapters.filter(function (c: any) { return c.summary && c.summary.trim().length > 5 }) }).slice(-200)
            _batchApplied = true // 🔥🔥🔥 该批次已成功应用
            return
          } else {
            batchRetry++
            console.warn('[Chapters] Volume ' + v + ' batch ' + batchStart + '-' + batchEnd + ' HTTP ' + res.status + ', retry ' + batchRetry + '/' + MAX_BATCH_RETRIES)
            if (batchRetry < MAX_BATCH_RETRIES) {
              await new Promise(function (resolve) { setTimeout(resolve, 2000 * (batchRetry + 1)) })
              continue
            }
          }
        }
        // 🔥🔥🔥 P0修复：while重试耗尽后仍未被标记成功，必须抛错，杜绝"HTTP失败仍被误记为已完成"
        if (!_batchApplied) {
          throw new Error('[Chapters] 卷' + v + '批次' + batchStart + '-' + batchEnd + '章生成失败（HTTP/内容异常，重试已耗尽）')
        }
      }

      var totalChapters = allVolumes.reduce(function (sum: number, v: any) { return sum + v.chapters.length; }, 0)
      var completedChapters = 0
      setChapterLoadingProgress('')
      
      for (var v = 1; v <= volumeCount; v++) {
        var volChapters = allVolumes[v - 1].chapters
        var volName = allVolumes[v - 1].name || ('第' + v + '卷')
        for (var batch = 0; batch < volChapters.length; batch += CHAPTER_BATCH_SIZE) {
          var batchEnd = Math.min(batch + CHAPTER_BATCH_SIZE, volChapters.length)
          var globalBatchStart = (v - 1) * chaptersPerVolume + batch + 1
          var globalBatchEnd = (v - 1) * chaptersPerVolume + batchEnd
          var chaptersInBatch = batchEnd - batch
          // 🔥🔥🔥 Bug修复：增量生成——跳过本批次所有章节都已有summary的批次
          var _batchChapters = volChapters.slice(batch, batchEnd)
          var _allHaveSummary = _batchChapters.every(function(c: any) { return c.summary && c.summary.trim().length >= 5 && c.status !== 'pending'; })
          if (_allHaveSummary) {
            console.log('[Chapters] 跳过卷' + v + '批次' + globalBatchStart + '-' + globalBatchEnd + '（已有摘要，增量跳过）')
            completedChapters += chaptersInBatch
            continue
          }
          try {
            setChapterLoadingProgress('正在生成 ' + volName + ' 第' + globalBatchStart + '-' + globalBatchEnd + '章（总进度 ' + Math.max(0, Math.min(100, Math.round((completedChapters / Math.max(1, totalChapters)) * 100))) + '%）')
            await generateChaptersFromConfig(v, globalBatchStart, globalBatchEnd)
            completedChapters += chaptersInBatch
            setChapterLoadingProgress('已完成 ' + volName + ' 第' + globalBatchStart + '-' + globalBatchEnd + '章（总进度 ' + Math.max(0, Math.min(100, Math.round((completedChapters / Math.max(1, totalChapters)) * 100))) + '%）')
          } catch (e) {
            // 🔥🔥🔥 P0修复：失败批次不再递增 completedChapters，保留待补漏状态，杜绝"进度虚假"
            setChapterLoadingProgress('生成失败 ' + volName + ' 第' + globalBatchStart + '-' + globalBatchEnd + '章（将自动补漏重试）')
            console.error('[Chapters] Volume ' + v + ' batch ' + globalBatchStart + '-' + globalBatchEnd + ' failed:', e)
          }
        }
      }

      // 🔥🔥🔥 P0修复：结束前校验，未生成摘要的章节循环补漏重试，杜绝"进度100%但章节缺失/占位标题"
      var _countPending = function() {
        return allVolumes.reduce(function (s: number, _pv: any) { return s + _pv.chapters.filter(function (c: any) { return !c.summary || c.summary.trim().length < 5 || c.status === 'pending' }).length }, 0)
      }
      var _pendingAtEnd = _countPending()
      var _fillRound = 0
      while (_pendingAtEnd > 0 && _fillRound < 3) {
        _fillRound++
        setChapterLoadingProgress('补漏第 ' + _fillRound + ' 轮：仍有 ' + _pendingAtEnd + ' 章未生成摘要，正在自动重试')
        for (var _fv = 1; _fv <= volumeCount; _fv++) {
          var _fvCh = allVolumes[_fv - 1].chapters
          var _fvCount = _fvCh.length
          for (var _fb = 0; _fb < _fvCount; _fb += CHAPTER_BATCH_SIZE) {
            var _fbe = Math.min(_fb + CHAPTER_BATCH_SIZE, _fvCount)
            if (_fvCh.slice(_fb, _fbe).every(function (c: any) { return c.summary && c.summary.trim().length >= 5 && c.status !== 'pending' })) continue
            try {
              await generateChaptersFromConfig(_fv, (_fv - 1) * chaptersPerVolume + _fb + 1, (_fv - 1) * chaptersPerVolume + _fbe)
            } catch (_fillErr: any) {
              console.error('[Chapters] 补漏失败 卷' + _fv + '批次' + (_fb + 1) + '-' + _fbe + ':', _fillErr)
            }
          }
        }
        _pendingAtEnd = _countPending()
      }
      var _finalPending = _countPending()
      setChapterLoadingProgress(_finalPending > 0
        ? '章节生成未全部完成：仍有 ' + _finalPending + ' 章缺失，请点击重新生成'
        : '章节生成全部完成！共 ' + volumeCount + ' 卷 ' + totalChapters + ' 章')

      var chaptersSnapshot = { volumes: allVolumes.slice(), chapters: allVolumes.flatMap(function (v: any) { return v.chapters }), chapterCount: allVolumes.reduce(function (s: number, v: any) { return s + v.chapters.length }, 0), totalWordCount: allVolumes.reduce(function (s: number, v: any) { return s + v.chapters.length * 3000 }, 0) }
      setGeneratedData(function (prev) {
        var updated = { ...prev, chapters: chaptersSnapshot }
        generatedDataRef.current = updated
        return updated
      })
      saveStepSnapshot('chapters', chaptersSnapshot)
    } catch (err) {
      console.error('[executeChapterGeneration] Error:', err)
      showErrorAlert(err, 'AI generation error')
    } finally {
      chapterGenLockRef.current = false
      _setChapterGenLock(false)
      setIsLoading(false)
    }
  }

  var createCharacterSkeletons = function() {
    // 🔥 角色人数配置：根据用户要求同步
    // 后宫，多女主：主角1 + 女主4 + 反派4 + 配角6名（目标15名）
    // 单女主：主角1 + 女主1 + 女配1 + 朋友2 + 反派4 + 配角6名（目标15名）
    var antagonistRoles = ['反派1', '反派2', '反派3', '反派4']
    var supportingRoles = ['配角1', '配角2', '配角3', '配角4', '配角5', '配角6']
    var buildFullChar = function(name: string, role: string, identity: string, age: number, gender: string,
      appearance: string, personality: string, background: string,
      motivation: string, coreMotivation: string, skills: string[],
      weaknesses: string, growthArc: string,
      attributes: any, hiddenTraits: string, flaw: string) {
      return {
        id: 'skeleton-' + role + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        name, role, identity, age, gender,
        appearance, personality, background,
        motivation, coreMotivation,
        skills: skills,
        weaknesses, growthArc, attributes,
        title: '', faction: '', hiddenTraits: '', flaw
      }
    }

    var protagonistData = buildFullChar(
      '', 'protagonist', '', 25, '',
      '', '', '', '', '', [], '', '',
      { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 },
      '', ''
    )

    var femaleLeadData = buildFullChar(
      '', 'femaleLead', '', 22, '', '', '', '', '', '', [], '', '',
      { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 },
      '', ''
    )

    var antagSkeletons = antagonistRoles.map(function(r) {
      return buildFullChar('', r, '', 0, '',
        '', '', '', '', '', [], '', '',
        { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 }, '', '')
    })

    var suppSkeletons = supportingRoles.map(function(r) {
      return buildFullChar('', r, '', 0, '',
        '', '', '', '', '', [], '', '',
        { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 }, '', '')
    })

    return {
      protagonist: protagonistData,
      femaleLead: femaleLeadData,
      antagonist: antagSkeletons.length > 0 ? antagSkeletons[0] : null,
      antagonists: antagSkeletons,
      supporting: suppSkeletons.concat(antagSkeletons.length > 1 ? antagSkeletons.slice(1) : []),
    }
  }

  // ============================================================================
  // 🔥 2026-09-01 第13轮：角色「分批快出」生成 + 第17轮：人物阵容预设
  //   🔥 2026-11-06 用户反馈（图四）改造：首批只出 3 个核心角色（男主/女主/反派），尽快可见；
  //   其余 12 人「逐个生成」——每批 1 人、顺序生成，每落地一个立即显示，直到全部生成完毕
  //   （不再"攒齐一批一次性显示"）。
  //   ③ 「自己设计 · 详细设定输入区」原文直传角色步（此前该字段从未传入，人物设定无法同步）
  //   ④ 三套阵容预设（单女主/双女主/后宫·多女主），均由 charRomanceMode 驱动，每套 15 名，
  //      第 1 批必含主角（主角名全流程同步依赖）。
  // ============================================================================
  var CHAR_ROSTER_PRESETS: Record<string, { label: string; plan: string[][] }> = {
    // 单女主：主角1 + 女主1 + 女配2 + 朋友2 + 反派4 + 配角5 = 15
    single: {
      label: '单女主',
      plan: [
        ['主角', '女主', '反派'],   // 第1批：核心三角（男主/女主/反派，尽快可见）
        ['反派'], ['反派'], ['反派'],
        ['配角'], ['配角'], ['配角'], ['配角'], ['配角'],
        ['女配'], ['女配'], ['朋友'], ['朋友'],
      ],
    },
    // 双女主：主角1 + 女主2 + 女配1 + 朋友2 + 反派5 + 配角4 = 15
    dual: {
      label: '双女主',
      plan: [
        ['主角', '女主', '反派'],   // 第1批：核心三角
        ['女主'], ['反派'], ['反派'], ['反派'], ['反派'],
        ['配角'], ['配角'], ['配角'], ['配角'],
        ['女配'], ['朋友'], ['朋友'],
      ],
    },
    // 后宫·多女主：主角1 + 女主4 + 反派4 + 配角6 = 15
    harem: {
      label: '后宫·多女主',
      plan: [
        ['主角', '女主', '反派'],   // 第1批：核心三角
        ['女主'], ['女主'], ['女主'],
        ['反派'], ['反派'], ['反派'],
        ['配角'], ['配角'], ['配角'], ['配角'], ['配角'], ['配角'],
      ],
    },
  }
  var CHAR_BATCH_PLAN: string[][] = (CHAR_ROSTER_PRESETS[charRomanceMode] || CHAR_ROSTER_PRESETS.single).plan
  // 🔥 第17轮：动态总数（用于进度 UI），三套均为 15 名
  var CHAR_BATCH_TOTAL = CHAR_BATCH_PLAN.reduce(function (_s, _b) { return _s + _b.length }, 0)

  var _collectExistingCharNames = function (chars: any): string[] {
    var out: string[] = []
    var push = function (c: any) { var n = String((c && c.name) || '').trim(); if (n) out.push(n) }
    if (!chars) return out
    push(chars.protagonist); push(chars.femaleLead); push(chars.antagonist)
    if (Array.isArray(chars.femaleLeads)) chars.femaleLeads.forEach(push)
    if (Array.isArray(chars.antagonists)) chars.antagonists.forEach(push)
    if (Array.isArray(chars.supporting)) chars.supporting.forEach(push)
    return out
  }
  // 🔥 2026-09-10：按【真实已生成角色数】统计（仅计数有实质姓名的角色），
  //   用于替代原“假心跳/固定 11/12”的进度显示——真实输出多少就显示多少。
  var _realCharCount = function (chars: any): number {
    if (!chars) return 0
    var n = 0
    var _hasName = function (c: any) { return !!(c && String(c.name || '').trim()) }
    if (_hasName(chars.protagonist)) n++
    if (Array.isArray(chars.femaleLeads)) n += chars.femaleLeads.filter(_hasName).length
    else if (_hasName(chars.femaleLead)) n++
    if (Array.isArray(chars.antagonists)) n += chars.antagonists.filter(_hasName).length
    else if (_hasName(chars.antagonist)) n++
    if (Array.isArray(chars.supporting)) n += chars.supporting.filter(_hasName).length
    return n
  }
  // 🔥 2026-09-10：按真实已生成角色数刷新两组进度 UI（charGenProgress + 分批进度横幅）。
  var _refreshCharCountUI = function () {
    var _gd: any = generatedDataRef.current || {}
    var _cnt = _realCharCount(_gd.characters)
    setCharGenProgress({ current: Math.min(_cnt, CHAR_BATCH_TOTAL), total: CHAR_BATCH_TOTAL })
    setCharBatchUi(function (s: any) { return s.phase === 'idle' ? s : { ...s, completed: Math.min(_cnt, s.total) } })
  }

  // 🔥 2026-11-06（图五修复）：角色生成「中断续生成」基础设施
  //   · pending 标记按草稿 id 隔离：分批生成启动时写入，角色齐备后清除；
  //     页面刷新/跳转后若标记仍在且角色未齐 → 挂载 effect 自动续生成缺失角色。
  var _charPendingKey = function () { return 'tuzhong-char-gen-pending-' + (localStorage.getItem('tuzhong-active-novel-id') || 'default') }
  var _setCharGenPending = function () { try { localStorage.setItem(_charPendingKey(), String(Date.now())) } catch (_e) {} }
  var _clearCharGenPending = function () { try { localStorage.removeItem(_charPendingKey()) } catch (_e) {} }
  var charBatchRunningRef = useRef(false)
  // 现有角色按槽位归类计数（女配/朋友/配角按 role 字段细分，供 resume 计划对比）
  var _tallyCharRoles = function (chars: any): Record<string, number> {
    var t: Record<string, number> = {}
    var bump = function (c: any) {
      if (!c || !String(c.name || '').trim()) return
      var s = String(c.rolePosition || c.role || '')
      var key = /主角|protagonist/i.test(s) ? '主角'
        : /女主|femaleLead/i.test(s) ? '女主'
        : /反派|antagonist|villain/i.test(s) ? '反派'
        : /女配/i.test(s) ? '女配'
        : /朋友|伙伴/i.test(s) ? '朋友'
        : '配角'
      t[key] = (t[key] || 0) + 1
    }
    if (!chars) return t
    bump(chars.protagonist)
    if (Array.isArray(chars.femaleLeads)) chars.femaleLeads.forEach(bump)
    else bump(chars.femaleLead)
    if (Array.isArray(chars.antagonists)) chars.antagonists.forEach(bump)
    else bump(chars.antagonist)
    if (Array.isArray(chars.supporting)) chars.supporting.forEach(bump)
    return t
  }
  // resume 计划：对比 CHAR_BATCH_PLAN 需求与现有角色，缺失核心（主角/女主/反派）合并为首批，其余逐个成批
  var _buildCharPlanForResume = function (chars: any): string[][] {
    var required: Record<string, number> = {}
    CHAR_BATCH_PLAN.forEach(function (b) { b.forEach(function (r) { required[r] = (required[r] || 0) + 1 }) })
    var have = _tallyCharRoles(chars)
    var miss: Record<string, number> = {}
    Object.keys(required).forEach(function (r) { var m = (required[r] || 0) - (have[r] || 0); if (m > 0) miss[r] = m })
    var plan: string[][] = []
    var _core: string[] = []
    if ((miss['主角'] || 0) > 0) { _core.push('主角'); miss['主角']-- }
    if ((miss['女主'] || 0) > 0) { _core.push('女主'); miss['女主']-- }
    if ((miss['反派'] || 0) > 0) { _core.push('反派'); miss['反派']-- }
    if (_core.length) plan.push(_core)
    Object.keys(miss).forEach(function (r) { for (var i = 0; i < miss[r]; i++) plan.push([r]) })
    return plan
  }

  var handleGenerateCharactersBatched = async function (passedPowerSystem?: any, userAppendHints?: string, opts?: { resume?: boolean; force?: boolean }) {
    var _resumeMode = !!(opts && opts.resume)
    // 🔥 2026-11-07 修复（线上「重新生成」点击无反应）：force=true 表示用户显式点击「重新生成」，
    //   必须跳过下方「已存在完整精确角色数据则跳过」的自动守卫，否则已有角色的书永远静默不生成。
    var _forceMode = !!(opts && opts.force)
    if (passedPowerSystem && (passedPowerSystem.nativeEvent || passedPowerSystem._reactName || passedPowerSystem.target)) {
      passedPowerSystem = undefined
    }
    clearCharBatchTimers()
    // 🔥 本轮批次令牌：重新生成时上一轮在途批次自动作废，避免旧角色串进新结果
    var batchEpoch = ++charBatchEpochRef.current
    charBatchRunningRef.current = true
    // 🔥🔥 [直接写入·精确角色守卫] 服务器/运行中已含完整精确角色（主角+配角齐全）→ 跳过 AI 分批自动生成，
    //    直接保留现有数据并在前端展示，避免自动生成把用户亲自写入的历史角色清空覆盖。
    var _curCharsForGuard = (generatedDataRef.current && (generatedDataRef.current as any).characters) || {}
    var _curPGuard = _curCharsForGuard.protagonist
    var _curPNameGuard = (_curPGuard && String(_curPGuard.name || '').trim()) || ''
    var _curSupGuard = (Array.isArray(_curCharsForGuard.supporting) ? _curCharsForGuard.supporting : []).filter(Boolean)
    var _curAntiGuard = (_curCharsForGuard.antagonist && String(_curCharsForGuard.antagonist.name || '').trim()) || ''
    if (!_resumeMode && !_forceMode && _curPNameGuard && _curPNameGuard !== '主角' && _curPNameGuard !== '待定' && _curSupGuard.length >= 2) {
      console.log('[handleGenerateCharactersBatched] 已存在完整精确角色数据，跳过自动生成：proto=', _curPNameGuard,
        '抗=', _curAntiGuard, '配=', _curSupGuard.length)
      _clearCharGenPending()
      setIsGeneratingCharacters(false)
      setIsLoading(false)
      charBatchRunningRef.current = false
      return
    }
    // 🔥 2026-11-06：续生成模式按缺失槽位构建计划；已齐备则直接收尾
    var _plan: string[][] = _resumeMode ? _buildCharPlanForResume(_curCharsForGuard) : CHAR_BATCH_PLAN
    if (_resumeMode && _plan.length === 0) {
      console.log('[charBatch] resume：角色已齐备，无需续生成')
      _clearCharGenPending()
      setIsGeneratingCharacters(false)
      setIsLoading(false)
      charBatchRunningRef.current = false
      return
    }
    // 🔥 修复：设置生成中标志，让StepCharacters显示加载状态而非空卡片
    setIsGeneratingCharacters(true)
    // 🔥 2026-09-02 修复（问题④⑤）：「主要人物设定」立即跳转（≤5秒显形），先显示进度骨架，
    //   首批5角色落地后自然填充、后续批次流式补齐，彻底消除「跳转慢 + 报错弹窗」。
    setStep('characters')
    var currentPowerSystem = passedPowerSystem || (generatedDataRef.current || ({} as any)).powerSystem
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    // 🔥 第14轮：把用户在「追加角色」框里写的偏好（含外加角色名单）一并塞给后端。
    //   仅在 phase=core 用作引导提示词，phase=supplement 时不再传，避免和合并语义冲突。
    var _userHintStr = (typeof userAppendHints === 'string' && userAppendHints.trim()) ? userAppendHints.trim() : ''
    var _bootCoreHintOnce = ''  // 只在第1批注入，避免后续补充批次被反复追加
    console.log('[handleGenerateCharactersBatched] 启动分批生成，powerSystem:', passedPowerSystem ? 'passed' : (currentPowerSystem ? 'from ref' : 'none'),
      ', 详细设定长度=', (typeof detailedDesignInput === 'string' ? detailedDesignInput.length : 0),
      ', 用户追加提示长度=', _userHintStr.length)

    // 🔥 2026-11-06：续生成模式保留已有角色，只补缺失槽位
    if (!_resumeMode) {
      var emptyChars: any = { protagonist: null, femaleLead: null, antagonist: null, supporting: [] }
      saveStepSnapshot('characters', emptyChars)
      setGeneratedData(function (prev: any) { return { ...prev, characters: emptyChars } })
      if (generatedDataRef.current) {
        generatedDataRef.current = { ...(generatedDataRef.current as any), characters: emptyChars } as any
      }
    }

    // ---- 单批请求：向后端声明本轮配额 / 名额 / 已有角色（后端据此压 token 并禁用补齐式兜底）----
    // 🔥 2026-09-02 修复图一（角色跳转报错彻底修复）：
    //   · 第一批（首批 5 人）硬阈值提到 120 秒（原 75s 太紧），给复杂主题（多流派+朝代+角色）足够的 LLM 思考时间
    //   · 补充批（后续 5 人）维持 75 秒/批，触发批次失败立即跑下一批，不串行阻塞
    //   · 首批失败时自动重试 1 次（180 秒宽松阈值），双发失败再弹"后续批次努力中"软提示
    //   · 不再使用"请检查网络或重试"这种令人误以为全局失败的措辞
    var fetchCharBatch = async function (needs: string[], existing: string[], phase: 'core' | 'supplement', abortMsOverride?: number): Promise<any> {
      if (charBatchEpochRef.current !== batchEpoch) { console.log('[charBatch] 轮次已作废，跳过 ' + phase + ' 批次'); return null }
      var abortCtrl = new AbortController()
      var abortMs = abortMsOverride || 600000
      var to = setTimeout(function () { abortCtrl.abort() }, abortMs)
      charBatchTimersRef.current.push(to)
      try {
        var gd: any = generatedDataRef.current || {}
if (phase === 'core' && _userHintStr) {
        // 只在第1批注入一次；_userHintStr 是用户「追加角色」框里的内容，作为软偏好传给 LLM
        _bootCoreHintOnce = _userHintStr
        // 用完即清，避免后续批次重复
        _userHintStr = ''
      }
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          step: 'characters',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            idea: gd.idea || undefined,
            synopsis: gd.synopsis,
            outline: gd.outline,
            worldbuilding: gd.worldbuilding,
            powerSystem: currentPowerSystem,
            factions: gd.factions,
            relationships: gd.relationships,
            keywords: keywordsArray,
            imitate: buildImitatePayload(),
            // 🔥 第14轮：首批携带用户追加偏好，让 LLM 把用户钦定的角色纳入本批生成；
            //   补充批留空，避免和已有角色合并时被反复追加
            appendRoleInput: _bootCoreHintOnce,
            existingCharacters: existing,
            characters: gd.characters,
            bookAnalysis: gd.bookAnalysis,
            // 🔥 第13轮关键修复：「自己设计·详细设定输入区」原文直传角色步。
            //   此前 characters 步的 previousData 根本没有这个字段，导致后端
            //   「用户已设计人物必须原样纳入」铁律永远拿不到数据 → 人物设定无法同步到后续环节。
            detailedDesignInput: detailedDesignInput,
            // 🔥 2026-09-02 修复图三：主角设定（姓名/年龄/身份）必须传入角色步 previousData，
            //   否则后端 enforceStageConsistency 收不到 protagonistSettings.age → 主角年龄全流程无法统一。
            protagonistSettings: {
              name: (protagonistName || '').trim(),
              gender: protagonistGender,
              age: (protagonistAge || '').trim(),
              identity: (protagonistIdentity || '').trim(),
            },
          },
          llmConfig: getStepLlmConfig('characters'),
          enabledSkills: getEnabledSkills(),
          activeStyle: getActiveStyle(),
          bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
        if (!res.ok) {
          var ej = await res.json().catch(function () { return {} })
          // 🔥 2026-09-02 修复（问题④）：首批 HTTP 出错不再弹阻塞式错误弹窗，交由下方「自动重试一次 + 软提示」逻辑处理，
          //   保证「跳转主要人物设定」永远成功、页面先显形，再后台流式补齐角色，杜绝"弹窗报错"。
          if (phase === 'core') console.warn('[charBatch] 首批 HTTP ' + res.status + '，交给自动重试/软提示处理')
          else console.warn('[charBatch] 补充批次返回 HTTP ' + res.status + '，跳过本批')
          return null
        }
        var json = await res.json()
        if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        var normalized = normalizeCharactersData(json.data, detailedDesignInput)
        if (isEmptyResult(normalized, 'characters')) {
          console.warn('[charBatch] ' + phase + ' 批次返回空结果，跳过')
          return null
        }
        return normalized
      } catch (e: any) {
        var isAbort = !!(e && e.name === 'AbortError')
        console.warn('[charBatch] ' + phase + ' 批次' + (isAbort ? '超时(' + abortMs + 'ms)' : '异常') + ':', e && e.message)
        return null
      } finally {
        clearTimeout(to)
      }
    }

    // ---- 把单批结果合并进 generatedData：按姓名去重 + 按 rolePosition 归类 ----
    var applyCharBatch = function (batchData: any): any {
      if (charBatchEpochRef.current !== batchEpoch) { console.log('[charBatch] 轮次已作废，丢弃本批合并结果'); return null }
      var prevGd: any = generatedDataRef.current || {}
      var cur: any = prevGd.characters || {}
      var incArr: any[] = []
      if (Array.isArray(batchData && batchData.characters)) {
        incArr = batchData.characters
      } else if (batchData) {
        if (batchData.protagonist) incArr.push(batchData.protagonist)
        if (batchData.femaleLead) incArr.push(batchData.femaleLead)
        if (Array.isArray(batchData.femaleLeads)) incArr = incArr.concat(batchData.femaleLeads)
        if (batchData.antagonist) incArr.push(batchData.antagonist)
        if (Array.isArray(batchData.antagonists)) incArr = incArr.concat(batchData.antagonists)
        if (Array.isArray(batchData.supporting)) incArr = incArr.concat(batchData.supporting)
      }
      var merged: any = {
        protagonist: cur.protagonist || null,
        femaleLead: cur.femaleLead || null,
        femaleLeads: (Array.isArray(cur.femaleLeads) ? cur.femaleLeads : (cur.femaleLead ? [cur.femaleLead] : [])).slice(),
        antagonist: cur.antagonist || null,
        antagonists: (Array.isArray(cur.antagonists) ? cur.antagonists : (cur.antagonist ? [cur.antagonist] : [])).slice(),
        supporting: (Array.isArray(cur.supporting) ? cur.supporting : []).slice(),
        _harem: cur._harem || null,
      }
      var seen: any = {}
      var markSeen = function (c: any) { var n = String((c && c.name) || '').trim(); if (n) seen[n] = 1 }
      markSeen(merged.protagonist); markSeen(merged.femaleLead); markSeen(merged.antagonist)
      merged.femaleLeads.forEach(markSeen); merged.antagonists.forEach(markSeen); merged.supporting.forEach(markSeen)

      var added = 0
      // 🔥 2026-09-02 修复（图1/3/4 女主空值+单女主出多女主）：
      //   ① 空名且无实质内容的角色对象一律丢弃（此前 LLM 返回 rolePosition=女主 但全字段的空对象，
      //      会被照常并入 → 界面出现「女主/女主2/女主3」整卡空值）；
      //   ② 女主数量按 charRomanceMode 硬封顶（single=1 / dual=2 / harem=4），超额女主降级为「女配」，
      //      杜绝单女主模式出现多女主/后宫假象。
      var _flCap = charRomanceMode === 'dual' ? 2 : (charRomanceMode === 'harem' ? 4 : 1)
      var _hasRealContent = function (c: any): boolean {
        if (!c) return false
        var _flds = ['identity', 'appearance', 'personality', 'background', 'motivation', 'coreMotivation']
        for (var _i = 0; _i < _flds.length; _i++) {
          var _v = String(c[_flds[_i]] || '').trim()
          if (_v.length >= 4) return true
        }
        return false
      }
      for (var i = 0; i < incArr.length; i++) {
        var c = incArr[i]
        if (!c) continue
        var cn = String(c.name || '').trim()
        // ① 空名角色：无名称即无展示价值，直接丢弃（不再并入产生空卡）
        if (!cn) { console.log('[charBatch] 跳过空名/空内容角色对象'); continue }
        if (seen[cn]) { console.log('[charBatch] 跳过重复角色: ' + cn); continue }
        if (cn) seen[cn] = 1
        var rp = String(c.rolePosition || c.role || '')
        if (/主角|protagonist/i.test(rp)) {
          if (!merged.protagonist) merged.protagonist = c
          else merged.supporting.push(c)
        } else if (/女主|femaleLead/i.test(rp)) {
          // ② 女主硬封顶：已达模式上限 → 降级女配（保留数据，不再冒充女主）
          var _flCount = (merged.femaleLead ? 1 : 0) + Math.max(0, merged.femaleLeads.length - (merged.femaleLead ? 1 : 0))
          var _curFlTotal = merged.femaleLeads.length
          if (_curFlTotal >= _flCap || (!merged.femaleLead && _curFlTotal >= _flCap)) {
            console.log('[charBatch] 女主已达模式上限(' + charRomanceMode + '=' + _flCap + ')，降级为女配: ' + cn)
            c.role = '女配'
            if (!/主角|protagonist/i.test(rp)) merged.supporting.push(c)
            added++
            continue
          }
          if (!merged.femaleLead) {
            merged.femaleLead = c
            if (merged.femaleLeads.indexOf(c) === -1) merged.femaleLeads.push(c)
          } else {
            // 🔥 2026-09-01 第18轮显示修复：第2+位女主（双女主/后宫模式）在保留进 femaleLeads（关系图谱用）的同时，
            //   必须同步落入 supporting——「主要人物设定」界面只渲染 femaleLead + supporting，
            //   否则 女主2/女主3/女主4 生成成功但界面不可见（此前后宫模式只显示 1 位女主的根因）。
            if (merged.femaleLeads.indexOf(c) === -1) merged.femaleLeads.push(c)
            if (merged.supporting.indexOf(c) === -1) {
              if (!/^女主\d+$/.test(String(c.role || ''))) c.role = '女主' + merged.femaleLeads.length
              merged.supporting.push(c)
            }
          }
        } else if (/反派|antagonist|villain/i.test(rp)) {
          if (!merged.antagonist) merged.antagonist = c
          if (merged.antagonists.indexOf(c) === -1) merged.antagonists.push(c)
        } else {
          merged.supporting.push(c)
        }
        added++
      }

      var nextGd: any = { ...prevGd, characters: merged }
      // 🔥 主角名字全流程同步：人物设定落地后，全流程替换所有相关字段
      var protoName = String((merged.protagonist && merged.protagonist.name) || '').trim()
      if (protoName && protoName.length >= 2 && nextGd.idea) {
        var oldProtoName = String(nextGd.idea.protagonistName || '').trim()
        if (protoName !== oldProtoName) {
          var newIdea: any = { ...nextGd.idea, protagonistName: protoName }
          if (oldProtoName && typeof newIdea.tagline === 'string') newIdea.tagline = newIdea.tagline.split(oldProtoName).join(protoName)
          if (oldProtoName && typeof newIdea.hook === 'string') newIdea.hook = newIdea.hook.split(oldProtoName).join(protoName)
          nextGd.idea = newIdea
          if (oldProtoName && nextGd.synopsis && typeof nextGd.synopsis === 'object') {
            var ns: any = { ...nextGd.synopsis }
            var synKeys = ['shortIntro', 'oneLineIntro', 'fullIntro', 'synopsis']
            for (var sk = 0; sk < synKeys.length; sk++) {
              var k = synKeys[sk]
              if (typeof ns[k] === 'string') ns[k] = ns[k].split(oldProtoName).join(protoName)
            }
            if (Array.isArray(ns.sellingPoints)) {
              ns.sellingPoints = ns.sellingPoints.map(function (sp: any) { return typeof sp === 'string' ? sp.split(oldProtoName).join(protoName) : sp })
            }
            if (typeof ns.coreSellingPoint === 'string') ns.coreSellingPoint = ns.coreSellingPoint.split(oldProtoName).join(protoName)
            nextGd.synopsis = ns
          }
          console.log('[charBatch] 全流程同步主角名字:', oldProtoName, '→', protoName)
        }
      }
      generatedDataRef.current = nextGd
      setGeneratedData(nextGd)
      saveStepSnapshot('characters', merged)
      console.log('[charBatch] 合并完成：本批新增 ' + added + ' 名，支持角色累计 ' + merged.supporting.length + ' 名')
      return merged
    }

    setIsLoading(true)
    var _initCompleted = _resumeMode ? _realCharCount(_curCharsForGuard) : 0
    setCharGenProgress({ current: _initCompleted, total: CHAR_BATCH_TOTAL })
    // 🔥 第14轮：批次元数据 UI，让用户看到「第 1 批已出 / 还有 N 批在排队」
    setCharBatchUi({ phase: 'core', completed: _initCompleted, total: CHAR_BATCH_TOTAL, targetBatch: _plan.length, currentBatch: 1 })
    // 🔥 2026-11-06：写入续生成 pending 标记（页面刷新/跳转后由挂载 effect 自动补全）
    _setCharGenPending()
    // 🔥 2026-09-10：心跳改为“按真实已生成角色数刷新”，不再假递增一个 11/12 的假进度。
    var heartbeat = setInterval(function () {
      _refreshCharCountUI()
    }, 4000)
    charBatchTimersRef.current.push(heartbeat)

    try {
      // 🔥 2026-11-07 推倒重做：单请求全量生成。后端三段式（S1名册蓝图→S2整卡展开→S3确定性终检）
      //   一次返回 ≥15 人完整名册；旧「首批+逐批补充+补救轮」编排是身份池串味与占位垃圾的源头，全部废弃。
      var _allNeeds: string[] = []
      for (var _pli = 0; _pli < _plan.length; _pli++) {
        for (var _pji = 0; _pji < _plan[_pli].length; _pji++) {
          if (_allNeeds.indexOf(_plan[_pli][_pji]) === -1) _allNeeds.push(_plan[_pli][_pji])
        }
      }
      var _firstExisting = _resumeMode ? _collectExistingCharNames(_curCharsForGuard) : []
      var _firstPhase = _resumeMode ? 'supplement' : 'core'
      var _single = await fetchCharBatch(_allNeeds, _firstExisting, _firstPhase, 900000)
      if (!_single) {
        console.warn('[charBatch] 单次全量生成失败/超时，自动重试 1 次')
        _single = await fetchCharBatch(_allNeeds, _firstExisting, _firstPhase, 900000)
      }
      if (!_single) {
        showErrorAlert(null, '主要人物设定生成失败：模型多次重试未返回有效名册（后端已禁用硬编码兜底）。请点击「重新生成」，或在模型设置切换更强的模型后重试。')
      } else {
        applyCharBatch(_single)
        _refreshCharCountUI()
        setStep('characters')
      }
      setIsLoading(false)
      setIsGeneratingCharacters(false)

      // 🔥 2026-11-07 推倒重做：逐批循环与补救 while 已删除（单请求一次出全量名册）
      // 🔥 所有批次完成：UI 收尾回 idle（让 banner 3 秒后自动消失，给最后一帧让人看清楚）
      setCharBatchUi(function (s: any) { return { ...s, phase: 'done', completed: s.total } })
      setTimeout(function () { setCharBatchUi({ phase: 'idle', completed: 0, total: CHAR_BATCH_TOTAL, targetBatch: _plan.length, currentBatch: 0 }) }, 3000)
      console.log('[handleGenerateCharactersBatched] 全部分批完成')
      // 🔥 2026-11-06：角色已齐备则清除续生成 pending 标记（避免下次打开草稿误触发）
      var _gdDone: any = generatedDataRef.current || {}
      if (_realCharCount(_gdDone.characters) >= 15) _clearCharGenPending()
    } catch (err: any) {
      console.error('[handleGenerateCharactersBatched] Error:', err)
      var _bAbort = err && (err.name === 'AbortError') || /abort|超时|timeout/i.test(String(err?.message || ''))
      if (_bAbort) {
        showErrorAlert(null, '批次调度异常，重新打开草稿将自动续生成缺失角色，也可点击重新生成')
      } else {
        showErrorAlert(err, '角色批次调度失败，请重试')
      }
    } finally {
      clearInterval(heartbeat)
      clearCharBatchTimers()
      setIsLoading(false)
      setIsGeneratingCharacters(false)
      charBatchRunningRef.current = false
      console.log('[handleGenerateCharactersBatched] 完成，isGeneratingCharacters=false')
    }
  }

  // 🔥 2026-11-06（图五修复）：页面刷新/跳转后自动续生成——
  //   挂载后若处于「主要人物设定」步、pending 标记存在、角色未齐且当前无生成任务在跑，
  //   则自动以 resume 模式续生成缺失角色（不清空已有角色，只补缺失槽位）。
  var charAutoResumeRef = useRef(false)
  useEffect(function () {
    if (charAutoResumeRef.current) return
    if (step !== 'characters') return
    if (isGeneratingCharacters || charBatchRunningRef.current) return
    var _pending = ''
    try { _pending = localStorage.getItem(_charPendingKey()) || '' } catch (_e) {}
    if (!_pending) return
    var _gd: any = generatedDataRef.current || {}
    var _cnt = _realCharCount(_gd.characters)
    if (_cnt >= 15) { _clearCharGenPending(); return }
    charAutoResumeRef.current = true
    console.log('[charAutoResume] 检测到角色生成中断（' + _cnt + '/' + CHAR_BATCH_TOTAL + '），自动续生成')
    var _t = setTimeout(function () { void handleGenerateCharactersBatched(undefined, '', { resume: true }) }, 2000)
    return function () { clearTimeout(_t) }
  }, [step, isGeneratingCharacters])

  var handleGenerateCharacters = async function (passedPowerSystem?: any, opts?: { force?: boolean }) {
    // Guard: React onClick passes synthetic event as first arg, not power system data
    if (passedPowerSystem && (passedPowerSystem.nativeEvent || passedPowerSystem._reactName || passedPowerSystem.target)) {
      passedPowerSystem = undefined
    }
    // Debounce guard
    if (!checkGenDebounce()) return
    // 🔥 2026-09-01 第15轮：永远走「分批快出」路径（首批 5 人~30s 体感目标 / 75s 硬阈值 → 每 30s 补 5 → 2 分钟补全 20 人）。
    //   · 每批独立 abortMs=75s，maxTokens 7500，确保 5 人字段（40-60字/字段）一次性写满不被截断
    //   · 单批失败不阻塞后续批次（核心批失败仅给出错误提示，补充批失败静默续跑）
    //   · appendRoleInput 作为 _userAppendHints 一并注入后端 prompt（让 LLM 知道补充偏好），
    //     但发起请求仍走 batched 分批协议，避免再走老慢路径。
    var _userAppendHints = precleanRoleTableInput(appendRoleInput)
    // 立即清空 appendRoleInput，避免批次内存里残留
    if (_userAppendHints) setAppendRoleInput('')
    return await handleGenerateCharactersBatched(passedPowerSystem, _userAppendHints, opts)
  }
  var handleGenerateRelationships = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // 🔥 P0修复：使用 generatedDataRef.current 获取最新数据，避免 React 闭包陷阱
    // 之前直接用 generatedData 闭包变量，可能导致 characters 数据未及时同步，关系图谱生成失败
    var _relLatestData = generatedDataRef.current
    if (!_relLatestData || !_relLatestData.characters) {
      // 尝试从 step-snapshot-cache 读取
      var _cachedChars = getCurrentStepSnapshot('characters' as any)
      if (_cachedChars) {
        console.log('[handleGenerateRelationships] 从 snapshot 恢复 characters 数据')
        _relLatestData = { ..._relLatestData, characters: _cachedChars }
        generatedDataRef.current = _relLatestData
      }
    }
    if (!_relLatestData || !_relLatestData.characters) {
      showErrorAlert(null, '请先生成人物设定，再生成人物关系图谱')
      setIsLoading(false)
      return
    }
    saveStepSnapshot('relationships', _relLatestData.relationships)

    setIsLoading(true)
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    try {
      var cleanedAppendInput = precleanRoleTableInput(appendGraphInput)

      // 🔥 P0修复：添加超时保护，避免 fetch 永久卡住（流程一25秒无数据的根因之一）
      var _relAbortCtrl = new AbortController()
      var _relTimeout = setTimeout(function() {
        _relAbortCtrl.abort()
        console.warn('[handleGenerateRelationships] 客户端超时(300秒)，中止请求')
      }, 300000)

      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: _relAbortCtrl.signal,
        body: JSON.stringify({
          step: 'relationships',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
            detailedDesignInput: detailedDesignInput,
            idea: _relLatestData.idea || undefined,
            characters: _relLatestData.characters,
            keywords: keywordsArray,
            imitate: buildImitatePayload(),
            appendGraphInput: cleanedAppendInput,
            bookAnalysis: _relLatestData.bookAnalysis,
          },
          llmConfig: getStepLlmConfig('relationships'),
          enabledSkills: getEnabledSkills(),
          activeStyle: getActiveStyle(),
          bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      clearTimeout(_relTimeout)
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        var newRelData = normalizeRelationshipsData(json.data)
        setGeneratedData(function (prev) { return { ...prev, relationships: newRelData } })
        generatedDataRef.current = { ...generatedDataRef.current, relationships: newRelData }
        saveStepSnapshot('relationships', newRelData)
        setAppendGraphInput('')
        setStep('relationships')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, 'AI generation failed')
        setIsLoading(false)
        return
      }
    } catch (err: any) {
      console.error('[handleGenerateRelationships] Error:', err)
      if (err?.name === 'AbortError') {
        showErrorAlert(null, '人物关系图谱生成超时（180秒），请检查网络或重试')
      } else {
        showErrorAlert(err, 'AI generation error')
      }
    } finally {
      setIsLoading(false)
    }
  }

  var handleGenerateFactions = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // [FIXED]
    setIsLoading(true)
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    try {
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'factions',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
            detailedDesignInput: detailedDesignInput,
            idea: generatedData.idea,
            synopsis: generatedData.synopsis,
            outline: generatedData.outline,
            worldbuilding: generatedData.worldbuilding,
            chapters: generatedData.chapters,
            characters: generatedData.characters,
            relationships: generatedData.relationships,
            keywords: keywordsArray,
            imitate: buildImitatePayload(),
            bookAnalysis: generatedData.bookAnalysis,
          },
          llmConfig: getStepLlmConfig('factions'),
          enabledSkills: getEnabledSkills(),
        activeStyle: getActiveStyle(),
        bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (!json.data || (typeof json.data === 'object' && Object.keys(json.data).length === 0)) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        var normalizedFactions = normalizeFactionsData(json.data)
        if (isEmptyResult(normalizedFactions, 'factions')) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        console.log('[handleGenerateFactions] Factions count:', normalizedFactions.factions?.length, 'Raw json.data:', JSON.stringify(json.data).substring(0, 300))
        setGeneratedData(function (prev) { return { ...prev, factions: normalizedFactions } })
        saveStepSnapshot('factions', normalizedFactions)
        setStep('factions')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, 'AI generation failed')
        setIsLoading(false)
        throw new Error('Factions generation failed with status ' + res.status) // 🔥 抛出，让auto-generate感知失败
      }
    } catch (err) {
      console.error('[handleGenerateFactions] Error:', err)
      showErrorAlert(err, 'AI generation error')
      throw err // 🔥 重新抛出，让auto-generate感知失败
    } finally {
      setIsLoading(false)
    }
  }

  var handleGeneratePowerSystem = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // [FIXED]
    setIsLoading(true)
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    try {
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'powerSystem',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
            detailedDesignInput: detailedDesignInput,
            idea: generatedData.idea || undefined,
            synopsis: generatedData.synopsis,
            outline: generatedData.outline,
            worldbuilding: generatedData.worldbuilding,
            chapters: generatedData.chapters,
            characters: generatedData.characters,
            relationships: generatedData.relationships,
            factions: generatedData.factions,
            keywords: keywordsArray,
            imitate: buildImitatePayload(),
            bookAnalysis: generatedData.bookAnalysis,
          },
          llmConfig: getStepLlmConfig('powerSystem'),
          enabledSkills: getEnabledSkills(),
          activeStyle: getActiveStyle(),
          bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (!json.data || (typeof json.data === 'object' && Object.keys(json.data).length === 0)) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        var normalized = normalizePowerSystemData(json.data)
        // 🔥 Bug1+双金手指修复：强制同步金手指名称与灵感创作systemName，支持多金手指
        var _ideaSystemName = (generatedData.idea as any)?.systemName || ''
        var _ideaTagline = (generatedData.idea as any)?.tagline || ''
        var _ideaSysNameClean = (_ideaSystemName || '').trim()
        var _taglineText = (typeof _ideaTagline === 'string' ? _ideaTagline : '')

        var _extractAbilitiesFromText = function(text: string): string[] {
          if (!text) return []
          var names: string[] = []
          var patterns = [
            /觉醒[''""]?([^'""]{2,10}?)[''""]?\s*(?:与|和|、)\s*[''"]?([^'""]{2,10}?)[''"]?双金手指/,
            /觉醒[''"]?([^'""]{2,8})[''"]?(?:系统|戒指|血脉|神器|空间|天赋)/g,
            /[''""]([^'""]{2,8}?系统)[''""]?\s*(?:与|和|、)\s*[''"]?([^'""]{2,8}?(?:戒|戒指|血脉|神器))[''"]?/,
            /(?:金手指|金手指为|系统是)[':：]?\s*[''"]?([^'""]{2,10})[''"']?/g,
          ]
          var foundSet = new Set<string>()
          var fullText = text
          var m1 = fullText.match(/觉醒[''"]?([^'""]{2,10}?)[''"]?\s*(?:与|和|、)\s*[''"]?([^'""]{2,10}?)[''"]?双金手指/)
          if (m1) {
            if (m1[1] && !foundSet.has(m1[1])) { names.push(m1[1]); foundSet.add(m1[1]) }
            if (m1[2] && !foundSet.has(m1[2])) { names.push(m1[2]); foundSet.add(m1[2]) }
          }
          if (names.length === 0) {
            var m2 = fullText.match(/[''""]([^'""]{2,8}?系统)[''""]?\s*(?:与|和|、)\s*[''"]?([^'""]{2,8}?(?:戒|戒指|血脉|神器|剑|鼎|塔|珠))[''"']?/)
            if (m2) {
              if (m2[1] && !foundSet.has(m2[1])) { names.push(m2[1]); foundSet.add(m2[1]) }
              if (m2[2] && !foundSet.has(m2[2])) { names.push(m2[2]); foundSet.add(m2[2]) }
            }
          }
          if (names.length === 0) {
            var sysParts = splitGoldenFingerNames(_ideaSysNameClean)
            if (sysParts.length >= 2) {
              sysParts.forEach(function(p) { if (!foundSet.has(p)) { names.push(p); foundSet.add(p) } })
            }
          }
          if (names.length === 0 && _ideaSysNameClean && _ideaSysNameClean !== '无') {
            names.push(_ideaSysNameClean.replace(/系统$|空间$|面板$/g, '').trim())
          }
          return names.filter(function(n) { return n && n.length >= 2 && n.length <= 10 })
        }

        var _detectedNames: string[] = []
        if (_ideaSysNameClean && _ideaSysNameClean !== '无' && _ideaSysNameClean !== '无金手指') {
          var sysParts = splitGoldenFingerNames(_ideaSysNameClean)
          if (sysParts.length > 0) _detectedNames = sysParts
        }

        if (_detectedNames.length > 0) {
          var syncedAbilities: any[] = []
          _detectedNames.forEach(function(gfName, idx) {
            var existing = normalized.protagonistAbilities[idx] || (idx === 0 ? normalized.protagonistAbility : null)
            var ab = normalizeAbilityObject(existing || {})
            ab.name = gfName.trim()
            // 🔥 只在该能力类型为空时才推断填充，保留后端已纠正的类型（如 知识记忆），不再无条件覆盖成神器类
            if (!ab.type) ab.type = inferAbilityTypeFromName(gfName) || '知识记忆'
            if (!ab.description) ab.description = ''
            if (!Array.isArray(ab.abilities)) ab.abilities = []
            if (!Array.isArray(ab.limitations)) ab.limitations = []
            if (!ab.evolution) ab.evolution = ''
            syncedAbilities.push(ab)
          })
          if (syncedAbilities.length > 0) {
            normalized.protagonistAbility = { ...syncedAbilities[0] }
            normalized.protagonistAbilities = syncedAbilities
            console.log('[handleGeneratePowerSystem] 金手指严格同步完成（灵感设定' + _detectedNames.length + '个）:', normalized.protagonistAbilities.map(function(a: any) { return a.name + '(' + a.type + ')' }).join(', '))
          }
        } else if (_ideaSysNameClean && _ideaSysNameClean !== '无' && _ideaSysNameClean !== '无金手指' && normalized.protagonistAbility) {
          var _coreName = _ideaSysNameClean.trim()
          if (_coreName.length >= 2) {
            var _currentName = normalized.protagonistAbility.name || ''
            var _coreType = normalized.protagonistAbility.type || inferAbilityTypeFromName(_coreName) || '知识记忆'
            if (_currentName !== _coreName) {
              console.log('[handleGeneratePowerSystem] 前端兜底同步金手指名称: "' + _currentName + '" → "' + _coreName + '"')
              normalized.protagonistAbility.name = _coreName
              normalized.protagonistAbility.type = _coreType
              if (normalized.protagonistAbilities.length > 0) {
                normalized.protagonistAbilities[0] = { ...normalized.protagonistAbilities[0], name: _coreName, type: _coreType }
              }
            }
          }
        } else if (!_ideaSysNameClean || _ideaSysNameClean === '无' || _ideaSysNameClean === '无金手指') {
          if (!normalized.protagonistAbility.name) {
            var _genreForAuto = genre || ''
            var _kwForAuto = keywords || ''
            if (_genreForAuto.indexOf('历史') !== -1 || _kwForAuto.indexOf('历史') !== -1 || _kwForAuto.indexOf('南明') !== -1 || _kwForAuto.indexOf('明末') !== -1 || _kwForAuto.indexOf('穿越') !== -1) {
              normalized.protagonistAbility = {
                name: '历史先知',
                type: '先知类',
                description: '拥有现代历史知识和技术，能预知历史走向并利用现代知识改变世界',
                abilities: ['历史预知', '技术革新', '权谋分析'],
                limitations: ['知识有时代局限', '改变历史有风险'],
                evolution: '初入乱世→知识立足→权谋立足→影响格局→改写命运'
              }
            } else if (_genreForAuto.indexOf('都市') !== -1 || _genreForAuto.indexOf('现代') !== -1) {
              normalized.protagonistAbility = {
                name: '知识传承',
                type: '知识类',
                description: '拥有超越常人的知识储备和学习能力，在现代社会中游刃有余',
                abilities: ['过目不忘', '快速学习', '知识应用'],
                limitations: ['知识需要实践', '并非全能'],
                evolution: '初露锋芒→小试牛刀→崭露头角→行业精英→领域权威'
              }
            } else if (_genreForAuto.indexOf('科幻') !== -1 || _genreForAuto.indexOf('星际') !== -1) {
              normalized.protagonistAbility = {
                name: '基因进化',
                type: '基因进化流',
                description: '基因锁开启后获得超人类能力，逐步进化超越凡人',
                abilities: ['力量强化', '感知增强', '进化适应'],
                limitations: ['进化有风险', '能量消耗'],
                evolution: '一阶基因→二阶基因→三阶基因→四阶基因→五阶基因→超人'
              }
            } else {
              normalized.protagonistAbility = {
                name: '天命传承',
                type: '功法类',
                description: '获得古老传承，踏上修炼之路，逐步揭开世界奥秘',
                abilities: ['基础修炼', '武技精通', '秘法觉醒'],
                limitations: ['修炼需资源', '进阶有瓶颈'],
                evolution: '初窥门径→登堂入室→融会贯通→炉火纯青→出神入化'
              }
            }
            normalized.protagonistAbilities = [normalized.protagonistAbility]
          }
        }
        if (isEmptyResult(normalized, 'powerSystem')) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }

        // 🔥🔥🔥 修复问题1+2：金手指类型与世界力量体系类型同步
        // 1. 确保金手指类型与灵感创作一致（已在上方同步名称时推断类型）
        // 2. 从 worldbuilding.powerSystem（世界观设定-力量体系文本）同步到金手指的 worldPowerSystem
        //    ⚠️ 2026-09-01 修复：原代码误读 worldbuilding.worldPowerSystem（该字段不存在），导致同步从未生效。
        if (!normalized.worldPowerSystem) normalized.worldPowerSystem = {}
        var _wbData = generatedData.worldbuilding as any
        if (_wbData && _wbData.powerSystem) {
          var _wbPsText = typeof _wbData.powerSystem === 'string' ? _wbData.powerSystem : ''
          var _wbName = (_wbPsText.match(/【体系名称】([^\n]*)/) || [])[1] || ''
          var _wbType = (_wbPsText.match(/【体系类型】([^\n]*)/) || [])[1] || ''
          var _wbDesc = (_wbPsText.match(/【体系描述】([^\n]*)/) || [])[1] || ''
          // 境界划分：抽取 文『…』/武『…』 中的等级名（兼容 rank→文『…』｜武『…』 与 文『…』→武『…』）
          var _wbLevels: string[] = []
          var _realmBlock = (_wbPsText.match(/【境界划分】([\s\S]*?)(?=【|$)/) || [])[1] || ''
          if (_realmBlock) {
            _realmBlock.split(/\n+/).forEach(function (line: string) {
              var _civ = (line.match(/文[『「【]([^』】]+)[』」】]/) || [])[1] || ''
              var _mil = (line.match(/武[『「【]([^』】]+)[』」】]/) || [])[1] || ''
              if (_civ) _wbLevels.push(_civ.trim())
              if (_mil) _wbLevels.push(_mil.trim())
            })
          }
          // 金手指 worldPowerSystem 为空字段时，从世界观力量体系补齐（含带朝代前缀的 type）
          if (!normalized.worldPowerSystem.name && _wbName) normalized.worldPowerSystem.name = _wbName.trim()
          if (!normalized.worldPowerSystem.type && _wbType) normalized.worldPowerSystem.type = _wbType.trim()
          if (!normalized.worldPowerSystem.description && _wbDesc) normalized.worldPowerSystem.description = _wbDesc.trim()
          // 🔥 2026-09-01 修复：金手指世界力量体系的境界/等级必须【严格同步】世界观力量体系。
          //    原逻辑仅在 LLM 未返回等级时才补齐，导致 glm-4-flash 在 powerSystem 步自行生成的
          //    通用等级("入门级/初级/…")覆盖掉世界观的正确等级。改为：只要世界观力量体系有等级，
          //    一律以世界观为准（auto-gen 场景下同步是预期行为；手动编辑请走金手指步自身的输入）。
          if (_wbLevels.length > 0) normalized.worldPowerSystem.levels = _wbLevels
        }
        // 3. 确保worldPowerSystem.type不为空（从name推断）
        if (!normalized.worldPowerSystem.type && normalized.worldPowerSystem.name) {
          normalized.worldPowerSystem.type = inferSystemTypeFromName(normalized.worldPowerSystem.name) || ''
        }
        // 4. 如果type仍为空，从genre/keywords推断
        if (!normalized.worldPowerSystem.type) {
          var _genreForSysType = genre || ''
          var _kwForSysType = keywords || ''
          if (/修仙|仙侠|修真|炼气|筑基|金丹/.test(_genreForSysType + _kwForSysType)) normalized.worldPowerSystem.type = '修仙体系'
          else if (/武道|武学|炼体|武侠/.test(_genreForSysType + _kwForSysType)) normalized.worldPowerSystem.type = '武道体系'
          else if (/魔法|斗气|西幻|奇幻/.test(_genreForSysType + _kwForSysType)) normalized.worldPowerSystem.type = '魔法体系'
          else if (/科技|星际|机甲|基因/.test(_genreForSysType + _kwForSysType)) normalized.worldPowerSystem.type = '科技体系'
          else if (/洪荒|巫族|封神/.test(_genreForSysType + _kwForSysType)) normalized.worldPowerSystem.type = '洪荒体系'
          else if (/历史|权谋|朝堂|江湖/.test(_genreForSysType + _kwForSysType)) normalized.worldPowerSystem.type = '历史权谋体系'
          else normalized.worldPowerSystem.type = '修仙体系'
        }
        // 5. 确保protagonistAbility.type不为空（从name推断）
        if (!normalized.protagonistAbility.type && normalized.protagonistAbility.name) {
          normalized.protagonistAbility.type = inferAbilityTypeFromName(normalized.protagonistAbility.name) || '系统类'
        }
        if (!normalized.protagonistAbility.type) {
          normalized.protagonistAbility.type = '系统类'
        }
        // 同步protagonistAbilities中的type
        if (normalized.protagonistAbilities && normalized.protagonistAbilities.length > 0) {
          normalized.protagonistAbilities = normalized.protagonistAbilities.map(function(ab: any) {
            if (!ab.type && ab.name) {
              ab.type = inferAbilityTypeFromName(ab.name) || '系统类'
            }
            if (!ab.type) ab.type = '系统类'
            return ab
          })
        }
        // 6. 异步同步类型到设定中心（如果不存在则新增，并丰富补充所有字段内容）
        var _syncTypeToSettings = function(typeName: string, typeCategory: 'ability' | 'system') {
          if (!typeName || typeName.length < 2) return
          fetch('/tuzhong-wenshu/api/settings/types', { method: 'GET' }).then(function(r) { return r.json() }).then(function(d) {
            if (!d || !d.success) return
            var existing = typeCategory === 'ability' ? (d.data.abilityTypes || []) : (d.data.systemTypes || [])
            var found = existing.find(function(t: any) { return t.name === typeName })
            if (!found) {
              // 类型不存在，自动新增并丰富补充所有字段内容
              var _newItem: any = { name: typeName, order: 999 }
              if (typeCategory === 'ability') {
                // 金手指类型：补充 coreFunction/triggerCondition/limitations/growthPath
                _newItem.category = '系统类'
                _newItem.description = '由AI生成流程自动添加的' + typeName + '金手指'
                _newItem.coreFunction = _genAbilityCoreFunction(typeName, genre, keywords)
                _newItem.triggerCondition = _genAbilityTriggerCondition(typeName, genre, keywords)
                _newItem.limitations = _genAbilityLimitations(typeName, genre, keywords)
                _newItem.growthPath = _genAbilityGrowthPath(typeName, genre, keywords)
              } else {
                // 体系类型：补充 realmSystem/cultivationMethod/restraintRelation
                _newItem.category = '东方玄幻'
                _newItem.description = '由AI生成流程自动添加的' + typeName
                _newItem.realmSystem = _genSystemRealmSystem(typeName, genre, keywords)
                _newItem.cultivationMethod = _genSystemCultivationMethod(typeName, genre, keywords)
                _newItem.restraintRelation = _genSystemRestraintRelation(typeName, genre, keywords)
              }
              fetch('/tuzhong-wenshu/api/settings/types', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: typeCategory, item: _newItem }),
              }).catch(function(e: any) { console.warn('[syncTypeToSettings] 新增类型失败:', e) })
            } else if (typeCategory === 'system' && (!found.realmSystem || !found.cultivationMethod || !found.restraintRelation)) {
              // 体系类型已存在但字段不完整，补充缺失字段
              var _updItem: any = { id: found.id, name: typeName }
              var _needUpdate = false
              if (!found.realmSystem) { _updItem.realmSystem = _genSystemRealmSystem(typeName, genre, keywords); _needUpdate = true }
              if (!found.cultivationMethod) { _updItem.cultivationMethod = _genSystemCultivationMethod(typeName, genre, keywords); _needUpdate = true }
              if (!found.restraintRelation) { _updItem.restraintRelation = _genSystemRestraintRelation(typeName, genre, keywords); _needUpdate = true }
              if (_needUpdate) {
                fetch('/tuzhong-wenshu/api/settings/types', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: typeCategory, item: _updItem }),
                }).catch(function(e: any) { console.warn('[syncTypeToSettings] 补充体系字段失败:', e) })
              }
            } else if (typeCategory === 'ability' && (!found.coreFunction || !found.triggerCondition || !found.limitations || !found.growthPath)) {
              // 金手指类型已存在但字段不完整，补充缺失字段
              var _updAbilItem: any = { id: found.id, name: typeName }
              var _needAbilUpdate = false
              if (!found.coreFunction) { _updAbilItem.coreFunction = _genAbilityCoreFunction(typeName, genre, keywords); _needAbilUpdate = true }
              if (!found.triggerCondition) { _updAbilItem.triggerCondition = _genAbilityTriggerCondition(typeName, genre, keywords); _needAbilUpdate = true }
              if (!found.limitations) { _updAbilItem.limitations = _genAbilityLimitations(typeName, genre, keywords); _needAbilUpdate = true }
              if (!found.growthPath) { _updAbilItem.growthPath = _genAbilityGrowthPath(typeName, genre, keywords); _needAbilUpdate = true }
              if (_needAbilUpdate) {
                fetch('/tuzhong-wenshu/api/settings/types', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: typeCategory, item: _updAbilItem }),
                }).catch(function(e: any) { console.warn('[syncTypeToSettings] 补充金手指字段失败:', e) })
              }
            }
          }).catch(function(e: any) { console.warn('[syncTypeToSettings] 查询类型失败:', e) })
        }
        if (normalized.protagonistAbility.type) {
          _syncTypeToSettings(normalized.protagonistAbility.type, 'ability')
        }
        if (normalized.worldPowerSystem.type) {
          _syncTypeToSettings(normalized.worldPowerSystem.type, 'system')
        }

        setGeneratedData(function (prev) { return { ...prev, powerSystem: normalized } })
        saveStepSnapshot('powerSystem', normalized)
        setStep('powerSystem')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, 'AI generation failed')
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('[handleGeneratePowerSystem] Error:', err)
      showErrorAlert(err, 'AI generation error')
    } finally {
      setIsLoading(false)
    }
  }

  var handleGenerateKeyPlots = async function() {
    // Debounce guard
    if (!checkGenDebounce()) return
    // [FIXED]
    setIsLoading(true)
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    try {
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'keyPlots',
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
            detailedDesignInput: detailedDesignInput,
            idea: generatedData.idea,
            synopsis: generatedData.synopsis,
            outline: generatedData.outline,
            worldbuilding: generatedData.worldbuilding,
            chapters: generatedData.chapters,
            characters: generatedData.characters,
            relationships: generatedData.relationships,
            factions: generatedData.factions,
            powerSystem: generatedData.powerSystem,
            keywords: keywordsArray,
            volumeConfig,
            imitate: buildImitatePayload(),
            bookAnalysis: generatedData.bookAnalysis,
          },
          llmConfig: getStepLlmConfig('keyPlots'),
          enabledSkills: getEnabledSkills(),
        activeStyle: getActiveStyle(),
        bestsellerPrefs: getBestsellerPrefs(),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (!json.data || (typeof json.data === 'object' && Object.keys(json.data).length === 0)) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        var normalizedKP = normalizeKeyPlotsData(json.data)
        if (isEmptyResult(normalizedKP, 'keyPlots')) {
          showErrorAlert(null, 'AI generated empty result, please try again')
          setIsLoading(false)
          return
        }
        setGeneratedData(function (prev) { return { ...prev, keyPlots: normalizedKP } })
        saveStepSnapshot('keyPlots', normalizedKP)
        setStep('keyPlots')
      } else {
        var errJson = await res.json().catch(function () { return {} })
        showErrorAlert(errJson, 'AI generation failed')
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('[handleGenerateKeyPlots] Error:', err)
      showErrorAlert(err, 'AI generation error')
    } finally {
      setIsLoading(false)
    }
  }

  // 🔥 第三期·增强版逐章生成：自动重试+并行批处理+真实进度
  var handleStartGenerating = async function(autoMode?: boolean) {
    var contentLlmConfig = getStepLlmConfig('content')
    console.log('[ContentGen] Using model: ' + (contentLlmConfig?.model || 'default'))
    // 🔥 Bug修复：使用 generatedDataRef.current 获取最新数据，避免 React 闭包陷阱
    var _latestData = generatedDataRef.current
    setIsLoading(true)
    // 🔥 P2.12.2 修复：流程二（autoMode）不切换 step，避免干扰 handleAutoGenerateAll 的步骤指示器
    if (!autoMode) setStep('generating')
    // Reset scheduling state
    genCancelRef.current = false
    genPauseRef.current = false
    genPauseResolveRef.current = null
    setGenStatus('running')
    setGenFailedList([])

    var MAX_RETRIES = 3
    // 🔥 2026-09-30 性能优化：重试退避从 1.5s base 降到 0.6s base（1.5s/3s/6s → 0.6s/1.2s/2.4s）
    //   总重试等待最坏从 10.5s 缩到 4.2s，且免费模型限流恢复通常在 1-2s 内，短退避成功率更高
    var RETRY_BASE_DELAY = 600

    try {
      // 🔥 前置数据检查与自动补全：确保生成正文前所有必要数据存在
      _latestData = generatedDataRef.current
      // 🔥 Bug修复：如果 chapters.volumes 存在但 chapters.chapters 扁平数组缺失，自动补全
      if (_latestData.chapters && _latestData.chapters.volumes && _latestData.chapters.volumes.length > 0 && (!_latestData.chapters.chapters || _latestData.chapters.chapters.length === 0)) {
        var _flatChsPre = _latestData.chapters.volumes.flatMap(function(v: any) { return v.chapters || []; })
        var _preFixedChData = {
          ..._latestData.chapters,
          chapters: _flatChsPre,
          chapterCount: _flatChsPre.length,
          totalWordCount: _latestData.chapters.volumes.reduce(function(sum: number, v: any) { return sum + (v.chapters || []).length * 3000; }, 0)
        }
        setGeneratedData(function(prev) {
          var updated = { ...prev, chapters: _preFixedChData }
          generatedDataRef.current = updated
          return updated
        })
        _latestData = generatedDataRef.current
        console.log('[ContentGen] chapters扁平数组已自动补全:', { flatCount: _flatChsPre.length })
      }
      var needsIdea = !_latestData.idea
      var needsChapters = !_latestData.chapters || !_latestData.chapters.chapters || _latestData.chapters.chapters.length === 0
      var needsSynopsis = !_latestData.synopsis
      var needsOutline = !_latestData.outline
      var needsKeyPlots = !_latestData.keyPlots

      console.log('[ContentGen] Pre-check: idea=' + (!needsIdea) + ', chapters=' + (!needsChapters) + ', synopsis=' + (!needsSynopsis) + ', outline=' + (!needsOutline) + ', keyPlots=' + (!needsKeyPlots))

      if (needsIdea) {
        console.log('[ContentGen] Missing idea data, generating...')
        genDebounceRef.current = 0
        await handleGenerateIdea()
        _latestData = generatedDataRef.current
      }
      if (needsChapters) {
        // 先确保大纲、关键剧情节点存在
        if (needsOutline || !generatedDataRef.current.outline) {
          console.log('[ContentGen] Missing outline data, generating...')
          genDebounceRef.current = 0
          await handleGenerateOutline()
        }
        if (needsKeyPlots || !generatedDataRef.current.keyPlots) {
          console.log('[ContentGen] Missing keyPlots data, generating...')
          genDebounceRef.current = 0
          await handleGenerateKeyPlots()
        }
        console.log('[ContentGen] Missing chapter planning data, generating...')
        genDebounceRef.current = 0
        await executeChapterGeneration()
        setIsLoading(true)
        _latestData = generatedDataRef.current
      }
      if (needsSynopsis) {
        console.log('[ContentGen] Missing synopsis data, generating...')
        genDebounceRef.current = 0
        await handleGenerateSynopsis()
        _latestData = generatedDataRef.current
      }

      // 再次检查章节数据
      _latestData = generatedDataRef.current
      var allChapters = _latestData.chapters?.chapters || []
      // 🔥 2026-11-05 批量上限：一次性生成 N 章（1-20），0=全部。切片在断点续跑过滤之前——每次点生成都只跑前 N 个未完成章
      var _batchLimit = parseInt(typeof localStorage !== 'undefined' ? (localStorage.getItem('tuzhong-batch-limit') || '0') : '0', 10) || 0
      if (_batchLimit > 0 && allChapters.length > _batchLimit) {
        allChapters = allChapters.slice(0, _batchLimit)
        console.log('[ContentGen] 批量上限：本次只生成前 ' + _batchLimit + ' 章（共 ' + (_latestData.chapters?.chapters || []).length + ' 章规划）')
      }
      var totalChapters = allChapters.length

      if (totalChapters === 0) {
        console.error('[ContentGen] No chapters to generate. Please generate chapter planning first.')
        showErrorAlert(null, '没有章节规划数据，请先完成章节规划步骤。')
        setGenStatus('idle')
        setIsLoading(false)
        return
      }

      // 🔥 2026-08-27 #3 草稿箱/断点续生成：先建草稿小说(进度落库)，再跳过已写章节续跑
      var _totalPlanned = totalChapters
      try {
        var _draftId = localStorage.getItem('tuzhong-active-novel-id')
        if (!_draftId || _draftId === 'temp') {
          var _dIdea = _latestData.idea || {}, _dSyn = _latestData.synopsis || {}
          var _draftRes = await fetch('/tuzhong-wenshu/api/novels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
            body: JSON.stringify({
              title: _dIdea.title || '未命名作品',
              genre: genre || _dIdea.genre || '历史',
              description: _dSyn.longIntro || _dSyn.fullIntro || _dSyn.shortIntro || '',
              status: 'drafting',
              chapters: [],
              volumes: _latestData.chapters?.volumes || [],
              worldbuilding: _latestData.worldbuilding, powerSystem: _latestData.powerSystem,
              characters: _latestData.characters, factions: _latestData.factions,
              relationships: _latestData.relationships, outline: _latestData.outline,
              keyPlots: _latestData.keyPlots, idea: _latestData.idea, synopsis: _latestData.synopsis,
            }),
          })
          if (_draftRes.ok) {
            var _dj = await _draftRes.json()
            _draftId = _dj && _dj.data && _dj.data.id
            if (_draftId) { localStorage.setItem('tuzhong-active-novel-id', _draftId); console.log('[ContentGen] #3 草稿小说已创建:', _draftId) }
          }
        }
        // 加载已写章节，跳过续跑
        if (_draftId && _draftId !== 'temp') {
          var _existRes = await fetch('/tuzhong-wenshu/api/chapters?novelId=' + _draftId)
          if (_existRes.ok) {
            var _existJson = await _existRes.json()
            var _exist = _existJson.data || _existJson || []
            var _doneNums: Record<number, boolean> = {}
            ;(Array.isArray(_exist) ? _exist : []).forEach(function (ec: any) { if (ec && ec.hasContent === 1 && ec.chapterNumber) _doneNums[ec.chapterNumber] = true })
            var _doneCount = Object.keys(_doneNums).length
            if (_doneCount > 0) {
              allChapters = allChapters.filter(function (ch: any) { return !_doneNums[ch.chapterNumber || (ch.number || 0)] })
              console.log('[ContentGen] #3 断点续生成：已完成 ' + _doneCount + ' 章，剩余 ' + allChapters.length + ' 章继续')
            }
          }
        }
      } catch (_draftErr) { console.warn('[ContentGen] #3 草稿/续跑初始化失败（不影响生成）:', _draftErr) }

      totalChapters = allChapters.length
      if (totalChapters === 0 && _totalPlanned > 0) {
        console.log('[ContentGen] #3 所有章节已完成，无需续写'); setGenStatus('done'); setIsLoading(false); return
      }
      var startTime = Date.now()
      setGenStats({
        startTime: startTime,
        totalWords: 0,
        completedChapters: 0,
        failedChapters: 0,
        totalChapters: totalChapters,
        elapsedMs: 0,
        etaMs: 0,
        throughput: 0,
        chapterTimings: [],
      })

      var prevChaptersSummary = allChapters.slice(0, 3).map(function(ch: any) {
        return '第' + ch.chapterNumber + '章: ' + (ch.title || '') + ' - ' + (ch.summary || '').substring(0, 60)
      }).join('\n')

      var genChapters: any[] = []
      var prevChapterEnding = '（新章开始）'
      var completedCount = 0
      var failedCount = 0
      var totalWords = 0
      var failedList: Array<{ index: number; chapter: any; error: string }> = []
      var timings: Array<{ chapter: number; durationMs: number; words: number }> = []

      // 🔥 修复Bug3：改为顺序生成章节（并发=1），避免上下文竞态条件，保证章节连贯，降低内存压力
      // 原因：下一章需要上一章结尾作为上下文，并发会导致章节顺序混乱、剧情不连贯，且高并发容易导致浏览器内存崩溃
      var concurrency = 1
      // 🔥 2026-09-17 #226O 修复：改为严格逐章顺序生成（批大小=1）。
      //   原因：① 用户明确要求"每章逐章生成、保证逻辑衔接严谨"——并行批内各章共用同一份 prevChapterEnding
      //       会导致章间互不衔接；② 串行把并发 API 请求从 5 降到 1，大幅降低免费模型限流(429)概率，
      //       从根上减少正文生成失败（此前 105/142 失败主要源于限流）。每章生成后立即落库，断点续生成/暂停恢复也基于此。
      var CONTENT_BATCH_SIZE = 1
      var chapterQueue = allChapters.map(function(ch: any, i: number) { return { chapter: ch, index: i } })

      // 按章节号排序，确保顺序生成
      chapterQueue.sort(function(a: any, b: any) {
        return (a.chapter.chapterNumber || a.index) - (b.chapter.chapterNumber || b.index)
      })

      var processChapter = async function(item: { chapter: any; index: number }): Promise<void> {
        var chapter = item.chapter
        var i = item.index

        // Check cancel/pause
        if (genCancelRef.current) {
          console.log('[ContentGen] Cancelled at chapter ' + (i + 1))
          return
        }

        var chStartTime = Date.now()
        var retry = 0
        var success = false
        // 🔥 2026-09-30 性能优化·当前章实时状态（供 UI 心跳显示「正在生成第 X 章·已用 X 秒」）
        genCurrentChapterRef.current = { index: i + 1, startedAt: chStartTime, retry: 0 }

        while (retry <= MAX_RETRIES && !success) {
          // Check cancel during retry
          if (genCancelRef.current) return

          try {
            // 🔥 2026-09-30 性能优化·把本章重试次数同步到 ref，让心跳 UI 能显示「重试 X/3」
            if (genCurrentChapterRef.current) genCurrentChapterRef.current.retry = retry
            if (retry > 0) {
              var delay = RETRY_BASE_DELAY * Math.pow(2, retry - 1)
              console.log('[ContentGen] Retry ' + retry + '/' + MAX_RETRIES + ' for chapter ' + (i + 1) + ', delay ' + delay + 'ms')
              await new Promise(function(r) { return setTimeout(r, delay) })
            }

            var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                step: 'content',
                input: { title: chapter.title, summary: chapter.summary, genre },
                genre,
                novelId: 'temp',
                // 🔥 逐章生成正文·右上角控制面板：把字数 / 风格 / 新角色随本章请求传入后端提示词
                targetWordCount: genTargetWordCount,
                style: genStyle,
                newCharacters: genNewCharacters,
                previousData: {
                  // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
                  detailedDesignInput: detailedDesignInput,
                  idea: _latestData.idea,
                  characters: _latestData.characters,
                  outline: _latestData.outline,
                  keyPlots: _latestData.keyPlots,
                  chapters: _latestData.chapters,
                  worldbuilding: _latestData.worldbuilding,
                  powerSystem: _latestData.powerSystem,
                  synopsis: _latestData.synopsis,
                  imitate: buildImitatePayload(),
                  prevChaptersSummary,
                  chapterNumber: chapter.chapterNumber || (i + 1),
                  chapterTitle: chapter.title,
                  corePlot: chapter.summary || '',
                  shuangPoints: (chapter.shuangPoints || []).join(', '),
                  prevEnding: prevChapterEnding,
                  bookAnalysis: _latestData.bookAnalysis,
                },
                enabledSkills: getEnabledSkills(),
                activeStyle: getActiveStyle(),
                bestsellerPrefs: getBestsellerPrefs(),
                llmConfig: contentLlmConfig,
              }),
            })

            if (res.ok) {
              var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
              var content = typeof json.data === 'string' ? json.data : (json.data?.chapterContent || json.data?.content || '')
              if (typeof content === 'string') {
                content = content
                  .replace(/<ret>/gi, '\n')
                  .replace(/<\/ret>/gi, '\n')
                  .replace(/<end>/gi, '')
                  .replace(/`[^`]+`/g, '')
                  .replace(/\*\*([^*]+)\*\*/g, '$1')
                  .replace(/\*([^*]+)\*/g, '$1')
                  .replace(/^#{1,6}\s/gm, '')
                  .replace(/^>\s/gm, '')
                  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                  .trim()
              }
              // 🔥 精确统计汉字数量
              var countZhChars = function(s: string): number {
                if (!s) return 0
                var m = s.match(/[\u4e00-\u9fa5]/g)
                return m ? m.length : 0
              }
              var zhWordCount = countZhChars(content)
              // 🔥 T9：口径统一为去空白（含标点）字符数
              var wordCount = content.replace(/\s/g, '').length
              // 🔥 修复标题重复bug：清理title中已有的"第X章"前缀，避免显示"第1章第1章"
              var cleanTitle = (chapter.title || '').trim()
                .replace(/^(?:第[0-9〇零一二三四五六七八九十百千]+章[\s·、：:_\-]?)*/g, '').trim()
              var globalNum = chapter.chapterNumber || (i + 1)
              // 🔥 2026-08-27 修复(#5)：从卷大纲继承"描述性标题 + 卷归属"，避免阅读页"0章"与"第1章 第1章"
              var _volNum = chapter.volume
              var _volIdx = chapter.volumeIndex
              var _volsArr = (_latestData.chapters && Array.isArray(_latestData.chapters.volumes)) ? _latestData.chapters.volumes : []
              if ((_volNum === undefined || _volIdx === undefined || !cleanTitle)) {
                for (var _vi = 0; _vi < _volsArr.length; _vi++) {
                  var _vv = _volsArr[_vi]
                  var _vc = (_vv.chapters || []).find(function(xc: any) { return xc.id === chapter.id || xc.chapterNumber === globalNum || xc.title === chapter.title; })
                  if (_vc) {
                    if (_volNum === undefined) _volNum = _vv.order || (_vi + 1)
                    if (_volIdx === undefined) _volIdx = _vi
                    if (!cleanTitle) {
                      cleanTitle = String(_vc.title || '').trim()
                        .replace(/^第\d+章\s*/, '')
                        .replace(/^第[一二三四五六七八九十百千]+章\s*/, '')
                    }
                    break
                  }
                }
              }
              var fullTitle = cleanTitle ? '第' + globalNum + '章 ' + cleanTitle : '第' + globalNum + '章'

              // 🔥 与后端对齐的字数口径（2026-10-16 绍宋级口径统一）：后端正文目标 2500-4000 汉字（默认 3000）、硬截断上限 4000 字总长、
              //   质量门最低 2500 字（≈2900 字总长，见 route.ts _targetMinWords / 硬截断）。前端接受 content.length >= 2900
              //   （已含标点，≈2500 汉字下限），避免与后端口径不一致导致每章被强制 3 次重生成
              //   （4×API 负载→触发限流 429→大量 HTTP/网络失败）。
              //   后端在模型全失败时返回失败占位符「本章内容生成失败…」，必须识别为失败而非误判"已完成"——
              //   此前占位符因长度>100 被当成正文"已完成"静默入库，是失败率被低估、成品掺假的根因之一。
              // 🔥 2026-10-15 绍宋级口径：总长下限 2900（≈2500汉字），与后端 _targetMinWords 对齐，
              //   避免两端口径不一致导致每章被强制重生成（4×API 负载→限流 429→大量失败）。
              var _isFailPlaceholder = content.indexOf('本章内容生成失败') >= 0
              var _tooShort = !content || content.length < 2900
              if (_isFailPlaceholder || _tooShort) {
                if (retry < MAX_RETRIES) {
                  retry++
                  console.log('[ContentGen] Chapter ' + (i + 1) + (_isFailPlaceholder ? ' 后端返回失败占位符' : ' 字数不足(汉字' + zhWordCount + '/总长' + content.length + ')') + '，重试 ' + retry + '/' + MAX_RETRIES)
                  continue
                }
                // 已用尽重试：记为真实失败，进入 failedList，绝不把占位符/空内容误标为"已完成"
                console.warn('[ContentGen] Chapter ' + (i + 1) + ' 最终仍' + (_isFailPlaceholder ? '为失败占位符' : '字数不足(汉字' + zhWordCount + '/总长' + content.length + ')') + '，标记为失败')
                genChapters.push({
                  id: chapter.id || String(Date.now() + i),
                  title: fullTitle,
                  chapterNumber: globalNum,
                  volume: _volNum !== undefined ? _volNum : chapter.volume,
                  volumeIndex: _volIdx !== undefined ? _volIdx : chapter.volumeIndex,
                  content: '',
                  wordCount: 0,
                  status: 'draft',
                })
                success = false
                failedCount++
                failedList.push({ index: i, chapter: chapter, error: _isFailPlaceholder ? '后端生成失败占位符' : '字数不足/空内容(汉字' + zhWordCount + '/总长' + content.length + ')' })
              } else {
                genChapters.push({
                  id: chapter.id || String(Date.now() + i),
                  title: fullTitle,
                  content: content,
                  wordCount: wordCount,
                  chapterNumber: globalNum,
                  volume: _volNum !== undefined ? _volNum : chapter.volume,
                  volumeIndex: _volIdx !== undefined ? _volIdx : chapter.volumeIndex,
                  status: 'completed',
                })
                success = true
                completedCount++
                totalWords += wordCount
              }
              // 🔥 仅当本章成功才用其结尾续接下一章；失败/占位符章绝不污染上下文（下一章沿用上一章真实结尾）
              if (success && content && content.length > 50) {
                prevChapterEnding = content.substring(Math.max(0, content.length - 200))
              }
            } else {
              // HTTP error
              if (retry < MAX_RETRIES) {
                retry++
                console.log('[ContentGen] Chapter ' + (i + 1) + ' HTTP error, retrying ' + retry + '/' + MAX_RETRIES)
                continue
              }
              // Max retries exhausted
              genChapters.push({
                id: chapter.id || String(Date.now() + i),
                title: chapter.title || '第' + (chapter.chapterNumber || (i + 1)) + '章',
                chapterNumber: chapter.chapterNumber || (i + 1),
                content: '',
                wordCount: 0,
                status: 'draft',
              })
              failedCount++
              failedList.push({ index: i, chapter: chapter, error: 'HTTP failed after ' + MAX_RETRIES + ' retries' })
            }
          } catch (err: any) {
            console.error('[ContentGen] Chapter ' + (i + 1) + ' error:', err?.message || err)
            if (retry < MAX_RETRIES) {
              retry++
              continue
            }
            genChapters.push({
              id: chapter.id || String(Date.now() + i),
              title: chapter.title || '第' + (chapter.chapterNumber || (i + 1)) + '章',
              chapterNumber: chapter.chapterNumber || (i + 1),
              content: '',
              wordCount: 0,
              status: 'draft',
            })
            failedCount++
            failedList.push({ index: i, chapter: chapter, error: String(err?.message || err) })
          }
        }

        var chDuration = Date.now() - chStartTime
        timings.push({ chapter: i + 1, durationMs: chDuration, words: success ? genChapters[genChapters.length - 1]?.wordCount || 0 : 0 })

        // 🔥 修复：进度统计每章更新（轻量），章节列表（含正文）每2章更新一次，平衡实时性和性能
        // 避免360章每次都全量设置大文本content导致React渲染崩溃
        var elapsed = Date.now() - startTime
        var avgTimePerChapter = elapsed / Math.max(1, completedCount + failedCount)
        var remainingChapters = Math.max(0, totalChapters - (completedCount + failedCount))
        var etaMs = avgTimePerChapter * remainingChapters
        var throughput = elapsed > 0 ? Math.round((totalWords / elapsed) * 60000) : 0

        // 🔥 每章都更新进度条和统计（轻量数据，不包含正文，不卡顿）
        setGenStats({
          startTime: startTime,
          totalWords: totalWords,
          completedChapters: completedCount,
          failedChapters: failedCount,
          totalChapters: totalChapters,
          elapsedMs: elapsed,
          etaMs: etaMs,
          throughput: throughput,
          chapterTimings: [...timings],
        })
        setGenFailedList([...failedList])
        var pct = Math.max(0, Math.min(100, Math.round(((completedCount + failedCount) / Math.max(1, totalChapters)) * 100)))
        setProgress(pct)

        // 🔥 章节列表（含正文）每2章更新一次，或最后一章强制更新
        var shouldUpdateChapters = (completedCount + failedCount) % 2 === 0 || (completedCount + failedCount) >= totalChapters
        if (shouldUpdateChapters) {
          generatedChaptersRef.current = [...genChapters]
          setGeneratedChapters([...genChapters])
          setGeneratedData(function (prev) {
            return {
              ...prev,
              chapters: {
                ...prev.chapters,
                generatedContent: [...genChapters],
              } as any,
            }
          })
        }
      }

      // 🔥 2026-09-30 性能优化·心跳定时器：每 1.5s 刷新「统计面板 + 进度条 + 当前章耗时」，
      //   解决用户看到"生成中一直不动"的体感卡死问题。仅刷新统计类字段，不动章节列表，无渲染卡顿。
      if (genHeartbeatRef.current) { clearInterval(genHeartbeatRef.current); genHeartbeatRef.current = null }
      genHeartbeatRef.current = setInterval(function () {
        if (genCancelRef.current) return
        var _elapsedNow = Date.now() - startTime
        var _doneNow = completedCount + failedCount
        var _avgNow = _elapsedNow / Math.max(1, _doneNow)
        var _remainNow = Math.max(0, totalChapters - _doneNow)
        var _etaNow = _avgNow * _remainNow
        var _tpNow = _elapsedNow > 0 ? Math.round((totalWords / _elapsedNow) * 60000) : 0
        var _pctNow = Math.max(0, Math.min(100, Math.round((_doneNow / Math.max(1, totalChapters)) * 100)))
        // 当前章已用秒数（用于 UI 显示「正在生成第 X 章·已用 X 秒」）
        var _curSec = genCurrentChapterRef.current ? Math.round((Date.now() - genCurrentChapterRef.current.startedAt) / 1000) : 0
        setGenStats({
          startTime: startTime,
          totalWords: totalWords,
          completedChapters: completedCount,
          failedChapters: failedCount,
          totalChapters: totalChapters,
          elapsedMs: _elapsedNow,
          etaMs: _etaNow,
          throughput: _tpNow,
          chapterTimings: timings,
          currentChapter: genCurrentChapterRef.current ? { ...genCurrentChapterRef.current, elapsedSec: _curSec } : null,
        } as any)
        setProgress(_pctNow)
      }, 1500)

      // 🔥 P2.12.1 修复：批量生成（5章/批），批内顺序生成保证连贯，批间串行，每批完成后保存
      // 批内顺序生成：下一章使用上一章结尾作为上下文，保证剧情连贯
      // 批间串行：每批完成后保存到后端，避免数据丢失
      var _batchIdx = 0
      for (var qi = 0; qi < chapterQueue.length; qi += CONTENT_BATCH_SIZE) {
        if (genCancelRef.current) break
        // Handle pause
        if (genPauseRef.current) {
          setGenStatus('paused')
          await new Promise<void>(function(resolve) {
            genPauseResolveRef.current = resolve
          })
          setGenStatus('running')
        }
        var _batchEnd = Math.min(qi + CONTENT_BATCH_SIZE, chapterQueue.length)
        var _batchNum = ++_batchIdx
        console.log('[ContentGen] 批次' + _batchNum + ' 开始：第' + (qi + 1) + '-' + _batchEnd + '章（共' + (_batchEnd - qi) + '章）')
        if (autoMode) {
          setAutoGenLog(function (prev) { return [...prev, '⏳ 正文批次' + _batchNum + ' 生成中（第' + (qi + 1) + '-' + _batchEnd + '章）...'] })
        }
        // 🔥 2026-09-17 #226O：CONTENT_BATCH_SIZE=1 → 批内即为单章，真正"逐章顺序生成"。
        //   每章用上一章真实结尾(prevChapterEnding)续接，保证章间逻辑衔接；每章生成后立即落库，降低丢失风险。
        var _batchItems = chapterQueue.slice(qi, _batchEnd)
        await Promise.all(_batchItems.map(function (it: any) { return processChapter(it) }))
        // 每批完成后保存到后端，避免数据丢失
        try {
          var _batchNovelId = localStorage.getItem('tuzhong-active-novel-id') || 'temp'
          var _batchChsToSave = genChapters.filter(function (gc: any) { return gc && gc.content && gc.content.length > 100 })
          if (_batchChsToSave.length > 0) {
            await fetch('/tuzhong-wenshu/api/chapters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novelId: _batchNovelId, chapters: _batchChsToSave }) })
          }
        } catch (_batchSaveErr) { console.warn('[ContentGen] 批次' + _batchNum + ' 保存失败:', _batchSaveErr) }
        console.log('[ContentGen] 批次' + _batchNum + ' 完成：已完成' + completedCount + '章，失败' + failedCount + '章')
        if (autoMode) {
          setAutoGenLog(function (prev) {
            var next = [...prev]
            next[next.length - 1] = '✅ 正文批次' + _batchNum + ' 完成（第' + (qi + 1) + '-' + _batchEnd + '章，累计' + completedCount + '章）'
            return next
          })
        }
      }

      // Handle cancellation
      if (genCancelRef.current) {
        setGenStatus('cancelled')
        console.log('[ContentGen] Generation cancelled. Completed: ' + completedCount + ', Failed: ' + failedCount)
        // Save what we have
        try {
          var novelId = localStorage.getItem('tuzhong-active-novel-id') || 'temp'
          var chsToSave = genChapters.filter(function (gc: any) { return gc && gc.content && gc.content.length > 100 })
          if (chsToSave.length > 0) {
            await fetch('/tuzhong-wenshu/api/chapters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novelId, chapters: chsToSave }) })
          }
        } catch (e) { console.error('[ContentGen] Failed to save chapters:', e) }
        // 🔥 取消时也强制同步已生成章节
        generatedChaptersRef.current = [...genChapters]
        setGeneratedChapters([...genChapters])
        setGeneratedData(function (prev) { return { ...prev, chapters: { ...prev.chapters, generatedContent: [...genChapters] } as any } })
        setIsLoading(false)
        return
      }

      // Save completed chapters
      try {
        var novelId2 = localStorage.getItem('tuzhong-active-novel-id') || 'temp'
        var chsToSave2 = genChapters.filter(function (gc: any) { return gc && gc.content && gc.content.length > 100 })
        if (chsToSave2.length > 0) {
          await fetch('/tuzhong-wenshu/api/chapters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novelId: novelId2, chapters: chsToSave2 }) })
        }
      } catch (e) { console.error('[ContentGen] Failed to save chapters:', e) }

      setGenStatus('done')
      // 🔥 生成完成后强制同步最终章节列表，确保所有内容都显示
      generatedChaptersRef.current = [...genChapters]
      setGeneratedChapters([...genChapters])
      setGeneratedData(function (prev) { return { ...prev, chapters: { ...prev.chapters, generatedContent: [...genChapters] } as any } })
      // 🔥 P2.12.2 修复：流程二（autoMode）不切换 step，由 handleAutoGenerateAll 统一控制
      if (!autoMode) setStep('finalCheck')
    } catch (err) {
      console.error('[handleStartGenerating] Error:', err)
      showErrorAlert(err, 'AI generation error')
      setGenStatus('idle')
    } finally {
      // 🔥 2026-09-30 性能优化·清理心跳定时器与当前章引用，避免内存泄漏与取消后的僵尸刷新
      if (genHeartbeatRef.current) { clearInterval(genHeartbeatRef.current); genHeartbeatRef.current = null }
      genCurrentChapterRef.current = null
      setIsLoading(false)
    }
  }

  // 🔥 第三期·暂停/继续/取消控制
  var handlePauseGen = function() {
    genPauseRef.current = true
    setGenStatus('paused')
    console.log('[Scheduler] Generation paused')
  }

  var handleResumeGen = function() {
    genPauseRef.current = false
    if (genPauseResolveRef.current) {
      genPauseResolveRef.current()
      genPauseResolveRef.current = null
    }
    setGenStatus('running')
    console.log('[Scheduler] Generation resumed')
  }

  var handleCancelGen = function() {
    genCancelRef.current = true
    genPauseRef.current = false
    if (genPauseResolveRef.current) {
      genPauseResolveRef.current()
      genPauseResolveRef.current = null
    }
    console.log('[Scheduler] Generation cancelled')
  }

  // 🔥 第三期·重试失败章节
  var handleRetryFailed = async function() {
    if (genFailedList.length === 0 || genStatus === 'running') return
    setGenStatus('running')
    genCancelRef.current = false
    genPauseRef.current = false
    
    var contentLlmConfig = getStepLlmConfig('content')
    // 🔥 Bug修复：使用 generatedDataRef.current 获取最新数据
    var _retryLatestData = generatedDataRef.current
    var allChapters = _retryLatestData.chapters?.chapters || []
    var genChapters = [...(_retryLatestData.chapters?.generatedContent || [])]
    var prevChapterEnding = '（新章开始）'
    var prevChaptersSummary = allChapters.slice(0, 3).map(function(ch: any) {
      return '第' + ch.chapterNumber + '章: ' + (ch.title || '') + ' - ' + (ch.summary || '').substring(0, 60)
    }).join('\n')

    var startTime = Date.now()
    var totalWords = genChapters.reduce(function(s: number, c: any) { return s + (c.wordCount || 0) }, 0)
    var completedCount = genChapters.filter(function(c: any) { return c.status === 'completed' }).length
    var failedCount = genFailedList.length
    var newFailedList: Array<{ index: number; chapter: any; error: string }> = []

    for (var fi = 0; fi < genFailedList.length; fi++) {
      if (genCancelRef.current) break
      var f = genFailedList[fi]
      var chapter = f.chapter
      var i = f.index

      var chStartTime = Date.now()
      var retry = 0
      var success = false
      var MAX_RETRIES = 3

      while (retry <= MAX_RETRIES && !success) {
        if (genCancelRef.current) break
        try {
          if (retry > 0) {
            await new Promise(function(r) { return setTimeout(r, 1500 * Math.pow(2, retry - 1)) })
          }
          var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              step: 'content',
              input: { title: chapter.title, summary: chapter.summary, genre },
              genre,
              novelId: 'temp',
              previousData: {
                // 🔥 2026-09-01 第13轮：「自己设计·详细设定输入区」原文直传，确保用户设定同步到本环节
                detailedDesignInput: detailedDesignInput,
                idea: _retryLatestData.idea,
                characters: _retryLatestData.characters,
                outline: _retryLatestData.outline,
                keyPlots: _retryLatestData.keyPlots,
                chapters: _retryLatestData.chapters,
                imitate: buildImitatePayload(),
                prevChaptersSummary,
                chapterNumber: chapter.chapterNumber || (i + 1),
                chapterTitle: chapter.title,
                corePlot: chapter.summary || '',
                shuangPoints: (chapter.shuangPoints || []).join(', '),
                prevEnding: prevChapterEnding,
                bookAnalysis: _retryLatestData.bookAnalysis,
              },
              enabledSkills: getEnabledSkills(),
              llmConfig: contentLlmConfig,
            }),
          })
          if (res.ok) {
            var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
            var content = typeof json.data === 'string' ? json.data : (json.data?.chapterContent || json.data?.content || '')
            if (typeof content === 'string') {
              content = content.replace(/`[^`]+`/g, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/^#{1,6}\s/gm, '').replace(/^>\s/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
            }
            if (content && content.length > 100) {
              var existingIdx = genChapters.findIndex(function(c: any) { return c.chapterNumber === (chapter.chapterNumber || (i + 1)) })
              var fixedCh = {
                id: chapter.id || String(Date.now() + i),
                title: chapter.title || '第' + (chapter.chapterNumber || (i + 1)) + '章',
                content: content,
                wordCount: content.length,
                chapterNumber: chapter.chapterNumber || (i + 1),
                status: 'completed',
              }
              if (existingIdx >= 0) {
                genChapters[existingIdx] = fixedCh
              } else {
                genChapters.push(fixedCh)
              }
              success = true
              completedCount++
              totalWords += content.length
              failedCount--
              if (typeof content === 'string' && content.length > 50) {
                prevChapterEnding = content.substring(Math.max(0, content.length - 200))
              }
            }
          }
        } catch (err) {}
        if (!success) retry++
      }

      if (!success) {
        newFailedList.push(f)
      }

      // Update progress
      setGeneratedChapters([...genChapters])
      setGeneratedData(function (prev) { return { ...prev, chapters: { ...prev.chapters, generatedContent: [...genChapters] } as any } })
      setGenStats({
        startTime: startTime,
        totalWords: totalWords,
        completedChapters: completedCount,
        failedChapters: newFailedList.length,
        totalChapters: genStats.totalChapters,
        elapsedMs: Date.now() - startTime,
        etaMs: 0,
        throughput: 0,
        chapterTimings: [],
      })
      setGenFailedList([...newFailedList])
    }

    setGenStatus('done')
  }

  // 🔥 第四期·爆款终检
  var handleFinalCheck = async function() {
    setFinalCheckLoading(true)
    setFinalCheckResult(null)
    setStep('finalCheck')
    try {
      var allContent = (generatedData.chapters?.generatedContent || [])
        .filter(function(c: any) { return c && c.content })
        .map(function(c: any) { return c.content })
        .join('\n\n')
      if (!allContent || allContent.length < 100) {
        // 如果没有章节内容，尝试用概要数据
        allContent = [
          generatedData.idea?.title || '',
          generatedData.synopsis?.synopsis || '',
          generatedData.outline?.mainPlot || '',
          generatedData.worldbuilding?.description || '',
        ].filter(Boolean).join('\n\n')
      }
      if (!allContent || allContent.length < 100) {
        showErrorAlert(null, '请先生成至少一章内容后再进行终检')
        return
      }

      var novelInfo = {
        title: generatedData.idea?.title || '',
        genre: genre || '',
        synopsis: generatedData.synopsis?.synopsis || '',
        chapterCount: generatedData.chapters?.chapters?.length || 0,
        mainCharacter: (generatedData.characters as any)?.protagonist?.name || '',
      }
      var platformConfigs = [
        { key: 'tomato', name: '番茄小说', icon: '🍅', aiStandard: 'AI率 < 5%', color: 'red', enabled: true },
        { key: 'zhuque', name: '朱雀AI检测平台', icon: '🔴', aiStandard: 'AI率 < 5%', color: 'rose', enabled: true },
        { key: 'qimao', name: '七猫小说', icon: '🐱', aiStandard: 'AI率 < 8%', color: 'orange', enabled: true },
        { key: 'qidian', name: '起点中文网', icon: '📖', aiStandard: 'AI率 < 10%', color: 'blue', enabled: true },
        { key: 'jinjiang', name: '晋江文学城', icon: '🌸', aiStandard: 'AI率 < 8%', color: 'pink', enabled: true },
        { key: 'feilu', name: '飞卢小说', icon: '🦁', aiStandard: 'AI率 < 10%', color: 'yellow', enabled: true },
        { key: 'zongheng', name: '纵横中文网', icon: '⚔️', aiStandard: 'AI率 < 12%', color: 'cyan', enabled: true },
        { key: 'yuedong', name: '阅动文化', icon: '📚', aiStandard: 'AI率 < 10%', color: 'green', enabled: true },
      ]
      try {
        var stored = localStorage.getItem('tuzhong_detect_platforms')
        if (stored) { var parsed = JSON.parse(stored); if (Array.isArray(parsed) && parsed.length > 0) platformConfigs = parsed }
      } catch (e) {}

      var res = await fetch('/tuzhong-wenshu/api/ai/final-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: allContent.substring(0, 12000),
          llmConfig: getStepLlmConfig('idea'),
          novelInfo,
          platformConfigs,
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (json.data) {
          setFinalCheckResult(json.data)
          console.log('[FinalCheck] Complete:', json.data.finalVerdict?.summary)
        }
      } else {
        var errText = ''
        try { var errJson = await res.json(); errText = errJson.error || JSON.stringify(errJson) } catch (e) { errText = 'HTTP ' + res.status }
        showErrorAlert(null, '终检失败: ' + errText)
      }
    } catch (err) {
      console.error('[FinalCheck] Error:', err)
      showErrorAlert(err, '终检异常')
    } finally {
      setFinalCheckLoading(false)
    }
  }

  // 🔥 第四期·一键润色（#226Q 安全化）
  //   铁律：正文是全书最贵资产。禁止任何「首章整段覆盖」写法（旧实现曾对 genChapters 的下标 0 全量赋值）；
  //   应用目标为「当前选中章」且应用前必须同源校验，长度差异 > 50% 拒绝（防串章覆盖）。
  var handlePolish = async function() {
    if (!finalCheckResult?.polish?.polishedText) {
      showErrorAlert(null, '没有可用的润色结果')
      return
    }
    var polishedText = finalCheckResult.polish.polishedText
    var _baseData: any = generatedDataRef.current || generatedData || {}
    var genChapters = (_baseData && _baseData.chapters && _baseData.chapters.generatedContent) || []
    // 无正文 → 不得凭空创建章节
    if (!Array.isArray(genChapters) || genChapters.length === 0) {
      showErrorAlert(null, '尚无正文，润色结果未应用')
      return
    }
    setPolishLoading(true)
    try {
      // 应用目标 = 当前选中章（越界时回退第 1 章，但绝不越界新建数组外元素）
      var _idx = Number(currentChapterIndex)
      if (!(_idx >= 0 && _idx < genChapters.length)) _idx = 0
      var _target: any = genChapters[_idx] || {}
      var _orig = typeof _target.content === 'string' ? _target.content : ''
      if (!_orig) {
        showErrorAlert(null, '当前选中章尚无正文，润色结果未应用')
        return
      }
      // 同源校验：润色文本与当前章原文长度差异 > 50% 视为串章，拒绝覆盖
      var _lenDiff = Math.abs(polishedText.length - _orig.length) / Math.max(1, _orig.length)
      if (_lenDiff > 0.5) {
        showErrorAlert(null, '润色文本与当前章正文长度差异过大（' + Math.round(_lenDiff * 100) + '%），已拒绝覆盖以免串章')
        return
      }
      // 只替换当前选中章的 content，其余章节原样保留
      var _nextGC = genChapters.map(function (c: any, i: number) {
        if (i !== _idx) return c
        return { ...c, content: polishedText, wordCount: polishedText.length }
      })
      var _nextData: any = Object.assign({}, _baseData, {
        chapters: Object.assign({}, _baseData.chapters || {}, { generatedContent: _nextGC }),
      })
      generatedDataRef.current = _nextData
      setGeneratedData(_nextData)
      setGeneratedChapters([..._nextGC] as any)
      // 复用既有落盘链路（含 chapters 元数据），不新建写路径
      try { await persistDraftProgress() } catch (_pe) { console.warn('[Polish] 落盘失败:', _pe) }
      // 更新终检结果（result.polish 展示区 UI 保持不变）
      setFinalCheckResult(function(prev: any) {
        return {
          ...prev,
          finalVerdict: {
            ...prev.finalVerdict,
            aiRate: prev.polish?.afterAiRate || prev.finalVerdict.aiRate,
            summary: '✅ 润色完成！AI率已从 ' + prev.polish?.beforeAiRate + '% 降至 ' + prev.polish?.afterAiRate + '%',
          },
        }
      })
      console.log('[Polish] Applied polished text to chapter #' + (_idx + 1) + ', new AI rate:', finalCheckResult?.polish?.afterAiRate)
    } catch (err) {
      console.error('[Polish] Error:', err)
      showErrorAlert(err, '润色应用失败')
    } finally {
      setPolishLoading(false)
    }
  }

  // 🔥 #226Q·全链路「一键修复全部」（分批 + 断点续跑 + 超时保护 + 进度回传）
  //   契约见 _recon/SPEC_226Q_repair_all.md §1.5/§2/§3：
  //   A 类走 mode='deterministic'（零 LLM），B 类按 batchSize=20 循环 mode='llm'；每批独立请求 + 落盘。
  var REPAIR_ALL_ENDPOINT = '/tuzhong-wenshu/api/ai/repair-all'
  var REPAIR_BATCH_SIZE = 20

  /** 展平 runPitfallCheck 的未通过项（passed === false）为请求 items 形状。 */
  var _collectFailedPitfall = function (res: any): Array<{ id: string; group: string; path: string; title: string; detail: string }> {
    var out: Array<{ id: string; group: string; path: string; title: string; detail: string }> = []
    var _groups = (res && Array.isArray(res.groups)) ? res.groups : []
    _groups.forEach(function (g: any) {
      var _items = (g && Array.isArray(g.items)) ? g.items : []
      _items.forEach(function (it: any) {
        if (it && it.passed === false) {
          out.push({
            id: String(it.id),
            group: String((g && g.key) || ''),
            path: String(it.path || ''),
            title: String(it.title || ''),
            detail: String(it.detail || ''),
          })
        }
      })
    })
    return out
  }

  // context 由共享模块 buildRepairContext 构造（端到端一致的「裁剪子集」：
  //   只保留 A/B 类修复所需最小字段，剔除正文与重量级深度字段，严禁回传整包 ~1.4MB）。

  /** 发一批修复请求（单批 ≤ REPAIR_BATCH_SIZE 条），返回服务端 patches / failed。 */
  var _postRepairBatch = async function (mode: 'deterministic' | 'llm', items: any[], token: string): Promise<{ patches: any[]; failed: Array<{ id: string; reason: string }> }> {
    var _headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) _headers['Authorization'] = 'Bearer ' + token
    var _resp = await fetch(REPAIR_ALL_ENDPOINT, {
      method: 'POST',
      headers: _headers,
      body: JSON.stringify({
        mode: mode,
        items: (items || []).map(function (it: any) {
          return { id: it.id, group: it.group, path: it.path, title: it.title, detail: it.detail }
        }),
        context: buildRepairContext(generatedDataRef.current || generatedData || {}, { slim: true, items: items || [] }),
      }),
    })
    if (!_resp.ok) {
      var _et = ''
      try {
        var _ej = await _resp.json()
        _et = (_ej && (_ej.error || _ej.message)) || JSON.stringify(_ej)
      } catch (_e) { _et = 'HTTP ' + _resp.status }
      throw new Error('HTTP ' + _resp.status + ' ' + _et)
    }
    var _j = await _resp.json()
    var _d = (_j && _j.data) || {}
    return {
      patches: Array.isArray(_d.patches) ? _d.patches : [],
      failed: Array.isArray(_d.failed) ? _d.failed : [],
    }
  }

  /** 把一批 patches 应用到 generatedData 的深拷贝，逐批 setGeneratedData 并复用既有落盘链路。 */
  var _applyRepairPatches = async function (patches: any[]): Promise<void> {
    if (!Array.isArray(patches) || patches.length === 0) return
    var _cur: any = generatedDataRef.current || generatedData || {}
    // applyPatches 内部深拷贝，不修改入参（禁止就地改 ref）
    var _next: any = applyPatches(_cur, patches)
    generatedDataRef.current = _next
    setGeneratedData(_next)
    var _touchesProse = patches.some(function (p: any) { return String((p && p.path) || '').indexOf('generatedContent') !== -1 })
    if (_touchesProse) {
      try {
        var _gc = _next && _next.chapters && _next.chapters.generatedContent
        if (Array.isArray(_gc)) setGeneratedChapters([..._gc] as any)
      } catch (_e) {}
    }
    // 复用既有 saveSettings/autosave 链路（persistDraftProgress 走同一 settings batch，含 chapters 元数据）
    try { await persistDraftProgress() } catch (_pe) { console.warn('[RepairAll] 落盘失败:', _pe) }
  }

  var handleRepairAll = async function () {
    if (repairState && repairState.running) return
    try {
      var _data: any = generatedDataRef.current || generatedData || {}
      // 1) 先跑一次判定，取未通过项
      var _pre = runPitfallCheck(_data)
      var _failedPre = _collectFailedPitfall(_pre)

      // 2) 0 项 → 置「全部通过，无需修复」并直接 return，不发任何请求
      if (_failedPre.length === 0) {
        setRepairState({ running: false, done: 0, total: 0, failed: 0, phase: 'done', message: '全部通过，无需修复' })
        return
      }

      // 3) 分级：A 类 deterministic（纯客户端直算，零网络）/ B 类 llm（走服务端）
      var _plan = buildRepairPlan(_data)
      var _allAuto = (_plan && Array.isArray(_plan.auto)) ? _plan.auto : []
      var _allLlm = (_plan && Array.isArray(_plan.llm)) ? _plan.llm : []

      // 🔥 #226Q ⑤ 正文类项预判：正文体由 /api/chapters 自管、不经 settings batch，且 context 不携带正文
      //   → 一律不发请求，直接归入 failures（reason 明确提示去正文页处理），并在结果里单独计数。
      var _isProseItem = function (it: any) { return String((it && it.path) || '').indexOf('generatedContent') !== -1 }
      var _proseItems = _allAuto.filter(_isProseItem).concat(_allLlm.filter(_isProseItem))
      var _auto = _allAuto.filter(function (it: any) { return !_isProseItem(it) })
      var _llm = _allLlm.filter(function (it: any) { return !_isProseItem(it) })
      var _proseCount = _proseItems.length
      var _total = _auto.length + _llm.length + _proseCount

      var _titleById: Record<string, string> = {}
      _allAuto.concat(_allLlm).forEach(function (it: any) { if (it && it.id) _titleById[String(it.id)] = String(it.title || it.id) })
      _failedPre.forEach(function (it) { if (it.id && !_titleById[it.id]) _titleById[it.id] = it.title || it.id })

      var _failures: Array<{ id: string; title: string; reason: string }> = []
      var _addFailures = function (list: Array<{ id: string; reason: string }>) {
        ;(list || []).forEach(function (f: any) {
          if (!f || !f.id) return
          _failures.push({ id: String(f.id), title: _titleById[String(f.id)] || String(f.id), reason: String(f.reason || '未知原因') })
        })
      }
      // 正文类项直接落 failures（不发请求）
      _proseItems.forEach(function (it: any) {
        _failures.push({ id: String(it.id), title: _titleById[String(it.id)] || String(it.id), reason: '正文需到正文页处理' })
      })

      // 兜底：buildRepairPlan 覆盖全部未通过项；若未分级则作为失败项明确列出，杜绝静默吞掉
      if (_total === 0) {
        var _pf = runPitfallCheck(_data)
        var _pfx = (_pf.summary && typeof _pf.summary.failed === 'number') ? _pf.summary.failed : _failedPre.length
        _failedPre.forEach(function (it) { _failures.push({ id: it.id, title: it.title || it.id, reason: 'no-repair-plan' }) })
        setRepairState({ running: false, done: 0, total: 0, failed: _failures.length, phase: 'done', message: '修复完成：未通过 ' + _pfx + ' → ' + _pfx + '（无可用的自动修复方案）', failures: _failures.slice() })
        return
      }

      var _token = localStorage.getItem('token') || ''
      var _done = 0
      var _progress = function (phase: 'deterministic' | 'llm') {
        setRepairState({ running: true, done: _done, total: _total, failed: _failures.length, phase: phase, message: '正在修复 ' + _done + '/' + _total + '…', failures: _failures.slice() })
      }

      setRepairState({ running: true, done: 0, total: _total, failed: _failures.length, phase: 'checking', message: '正在修复 0/' + _total + '…', failures: _failures.slice() })

      // 4) A 类：确定性修复 —— 纯客户端本地直算（零网络 / 零 LLM），杜绝公网回传 context
      var _autoRes: any = { patches: [], failed: [] }
      try {
        _autoRes = applyDeterministicRepairs(_data, _auto)
        if (_autoRes && Array.isArray(_autoRes.patches) && _autoRes.patches.length) await _applyRepairPatches(_autoRes.patches)
        _addFailures((_autoRes && Array.isArray(_autoRes.failed)) ? _autoRes.failed : [])
      } catch (_aErr) {
        console.warn('[RepairAll] A 类本地直算异常:', _aErr)
        _addFailures(_auto.map(function (it: any) { return { id: it.id, reason: 'client-deterministic-error' } }))
      }
      // 硬校验：A 类每一项都必须被 patches 或 failed 覆盖；缺口以 client-plan-gap 明列，杜绝静默吞掉
      try {
        var _coveredIds: Record<string, boolean> = {}
        ;((_autoRes && _autoRes.patches) || []).forEach(function (p: any) { if (p && p.id) _coveredIds[String(p.id)] = true })
        ;((_autoRes && _autoRes.failed) || []).forEach(function (f: any) { if (f && f.id) _coveredIds[String(f.id)] = true })
        _auto.forEach(function (it: any) {
          if (it && it.id && !_coveredIds[String(it.id)]) {
            _failures.push({ id: String(it.id), title: _titleById[String(it.id)] || String(it.id), reason: 'client-plan-gap' })
          }
        })
      } catch (_gapErr) { console.warn('[RepairAll] A 类覆盖校验异常:', _gapErr) }
      _done += _auto.length
      _progress('deterministic')

      // 5) B 类：LLM 修复，按 20 条分批循环；基准由 _postRepairBatch/_applyRepairPatches 内部
      //    重新读取 generatedDataRef.current（A 类已落盘，避免用陈旧快照叠加）
      for (var _li = 0; _li < _llm.length; _li += REPAIR_BATCH_SIZE) {
        var _lBatch = _llm.slice(_li, _li + REPAIR_BATCH_SIZE)
        try {
          var _lRes = await _postRepairBatch('llm', _lBatch, _token)
          await _applyRepairPatches(_lRes.patches)
          _addFailures(_lRes.failed)
        } catch (_lErr) {
          console.warn('[RepairAll] LLM 批次失败:', _lErr)
          _addFailures(_lBatch.map(function (it: any) { return { id: it.id, reason: 'batch-request-failed' } }))
        }
        _done += _lBatch.length
        _progress('llm')
      }

      // 🔥 #226Q 收口：正文类项已计入 _total，但未纳入 _done 累加 → 进度条永不达 100%。
      //    此处补上，使 _done 在结束时恒等于 _total（失败项已在 _failures 单独呈现）。
      _done += _proseCount

      // 6) 全部结束后重新判定，报告「修复前 X 项未通过 → 修复后 Y 项未通过」
      var _post = runPitfallCheck(generatedDataRef.current || _data)
      var _x = (_pre.summary && typeof _pre.summary.failed === 'number') ? _pre.summary.failed : _failedPre.length
      var _y = (_post.summary && typeof _post.summary.failed === 'number') ? _post.summary.failed : 0
      setRepairState({
        running: false,
        done: _total,
        total: _total,
        failed: _failures.length,
        phase: 'done',
        message: '修复完成：未通过 ' + _x + ' → ' + _y + (_failures.length > 0
          ? '（' + _failures.length + ' 项未能自动修复' + (_proseCount > 0 ? '，其中 ' + _proseCount + ' 项为正文类需到正文页处理' : '') + '）'
          : ''),
        failures: _failures.slice(),
      })
      console.log('[RepairAll] 完成：修复前 ' + _x + ' 项未通过 → 修复后 ' + _y + ' 项未通过；失败 ' + _failures.length + ' 项（含正文类 ' + _proseCount + ' 项）')
    } catch (err) {
      console.error('[RepairAll] Error:', err)
      setRepairState(function (prev: RepairState | null) {
        return {
          running: false,
          done: prev ? (prev.done || 0) : 0,
          total: prev ? (prev.total || 0) : 0,
          failed: prev ? (prev.failed || 0) : 0,
          phase: 'error',
          message: '一键修复失败：' + ((err && (err as any).message) || String(err)),
          failures: prev && prev.failures ? prev.failures : [],
        }
      })
      showErrorAlert(err, '一键修复失败')
    }
  }

  var stepOrder: Record<string, number> = {
    'input': 0, 'idea': 1, 'worldbuilding': 2, 'powerSystem': 3,
    'characters': 4, 'factions': 5, 'relationships': 6, 'synopsis': 7,
    'outline': 8, 'keyPlots': 9, 'chapters': 10, 'generating': 11,
    'finalCheck': 13, 'cover': 14, 'complete': 15,
  }
  var stepKeysByOrder = ['input', 'idea', 'worldbuilding', 'powerSystem', 'characters', 'factions', 'relationships', 'synopsis', 'outline', 'keyPlots', 'chapters', 'generating', 'finalCheck', 'cover', 'complete']
  var stepToGeneratedDataKey: Record<string, string> = {
    'idea': 'idea', 'worldbuilding': 'worldbuilding', 'powerSystem': 'powerSystem',
    'characters': 'characters', 'factions': 'factions', 'relationships': 'relationships',
    'outline': 'outline', 'keyPlots': 'keyPlots', 'chapters': 'chapters', 'synopsis': 'synopsis'
  }

  var handleNextStep = async function() {
    switch (step) {
      case 'input': handleGenerateIdea(); break;
      case 'idea': handleGenerateWorldbuilding(); break;
      case 'worldbuilding': handleGeneratePowerSystem(); break;
      case 'powerSystem': {
        var powerCheck = validateAndFixPowerSystem(generatedData.powerSystem)
        if ((powerCheck as any).wasFixed) {
          setGeneratedData(function (prev) { return { ...prev, powerSystem: powerCheck.cleanedData } })
        }
        // 🔥 修复：立即设置loading状态，防止跳转时长时间无反应
        setIsLoading(true)
        setIsGeneratingCharacters(true)
        setCharGenProgress({ current: 0, total: CHAR_BATCH_TOTAL })
        handleGenerateCharacters(powerCheck.cleanedData)
        break
      }
      case 'characters': handleGenerateFactions(); break
      case 'factions': handleGenerateRelationships(); break
      case 'relationships': handleGenerateSynopsis(); break
      case 'synopsis': handleGenerateOutline(); break
      case 'outline': handleGenerateKeyPlots(); break
      case 'keyPlots': handleInitChaptersFrame(); break
      case 'chapters': {
        // 🔥 Bug修复：进入generating前检查章节数据完整性，防止 chapters=false 触发重新生成300章
        var _chCheck = generatedDataRef.current.chapters
        if (_chCheck && _chCheck.volumes && _chCheck.volumes.length > 0 && (!_chCheck.chapters || _chCheck.chapters.length === 0)) {
          // chapters 扁平数组缺失但 volumes 存在 → 补全数据形状
          var _flatChsForFix = _chCheck.volumes.flatMap(function(v: any) { return v.chapters || []; })
          var _fixedChData = {
            ..._chCheck,
            chapters: _flatChsForFix,
            chapterCount: _flatChsForFix.length,
            totalWordCount: _chCheck.volumes.reduce(function(sum: number, v: any) { return sum + (v.chapters || []).length * 3000; }, 0)
          }
          setGeneratedData(function(prev) {
            var updated = { ...prev, chapters: _fixedChData }
            generatedDataRef.current = updated
            return updated
          })
          console.log('[handleNextStep] chapters数据形状已补全:', { flatCount: _flatChsForFix.length })
        }
        setStep('generating')
        // 🔥 效率优化v2：减少步骤跳转延迟从500ms到100ms
        setTimeout(function() { handleStartGenerating() }, 100)
        break
      }
      case 'generating': setIsLoading(false); setStep('finalCheck'); break
      case 'finalCheck': setStep('cover'); break
      case 'cover': setStep('complete'); break
    }
  }

  var handleRegenerate = async function (stepName: string, fieldName?: string) {
    console.log('[handleRegenerate] called with step:', stepName, 'field:', fieldName, 'isLoading:', isLoading)
    // Debounce guard
    if (!checkGenDebounce()) { console.log('[handleRegenerate] blocked by debounce'); return }
    // [FIXED]
    if (stepName === 'chapters' && !fieldName) {
      setRegeneratingField(stepName)
      genDebounceRef.current = 0 // 重置debounce，确保handleGenerateChapters可以执行
      await handleGenerateChapters()
      setRegeneratingField(null)
      return
    }

    // [FIXED]
    setIsLoading(true)
    setRegeneratingField(stepName + (fieldName || ''))
    var keywordsArray = keywords.split(/[,，、\s]+/).filter(Boolean)
    // 🔥 Bug3修复：添加超时保护，防止isLoading永久卡住
    // 🔥 修复：超时从60秒提升到300秒，匹配后端maxDuration=300和LLM长任务调用需求
    var _regTimeout = setTimeout(function() {
      console.warn('[handleRegenerate] Timeout guard triggered for step:', stepName)
      setIsLoading(false)
      setRegeneratingField(null)
    }, 300000) // 300秒超时（5分钟）
    try {
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: stepName,
          field: fieldName || undefined,
          input: keywords,
          keywords: keywordsArray,
          genre,
          novelId: 'temp',
          previousData: {
            idea: generatedDataRef.current.idea || undefined,
            synopsis: generatedDataRef.current.synopsis,
            outline: generatedDataRef.current.outline,
            worldbuilding: generatedDataRef.current.worldbuilding,
            powerSystem: generatedDataRef.current.powerSystem,
            characters: generatedDataRef.current.characters,
            factions: generatedDataRef.current.factions,
            relationships: generatedDataRef.current.relationships,
            keyPlots: generatedDataRef.current.keyPlots,
            chapters: generatedDataRef.current.chapters,
            keywords: keywordsArray,
            volumeConfig: (stepName === 'chapters' || stepName === 'keyPlots') ? volumeConfig : undefined,
            imitate: buildImitatePayload(),
            bookAnalysis: generatedDataRef.current.bookAnalysis,
            detailedDesignInput: detailedDesignInput,
            fanfictionBookData: generatedDataRef.current.idea?.fanfictionBookData || undefined,
            protagonistSettings: {
              name: protagonistName.trim(),
              gender: protagonistGender,
              age: protagonistAge.trim(),
              identity: protagonistIdentity.trim(),
            },
          },
          llmConfig: getStepLlmConfig(stepName),
          enabledSkills: getEnabledSkills(),
          activeStyle: getActiveStyle(),
          bestsellerPrefs: getBestsellerPrefs(),
          regeneratePrompt: regeneratePrompt || '',
          // 🔒 字段级重生成：携带当前步骤全量快照，服务端据此逐字冻结其余字段
          frozen: fieldName ? JSON.parse(JSON.stringify((generatedDataRef.current as any)[stepName] || {})) : undefined,
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)

        if (fieldName) {
          // 🔒 字段级硬校验：服务端未返回目标字段、或返回空值时，绝不覆盖已有数据，防止整步漂移
          var _rawFieldValue = (json && json.data && typeof json.data === 'object') ? json.data[fieldName] : undefined
          var _isFieldValueEmpty = _rawFieldValue === undefined || _rawFieldValue === null
            || (typeof _rawFieldValue === 'string' && _rawFieldValue.trim() === '')
            || (Array.isArray(_rawFieldValue) && _rawFieldValue.length === 0)
            || (typeof _rawFieldValue === 'object' && !Array.isArray(_rawFieldValue) && Object.keys(_rawFieldValue).length === 0)
          if (_isFieldValueEmpty) {
            console.warn('[handleRegenerate] 字段级返回为空，已保留原值:', stepName, fieldName, json)
            showErrorAlert(json && (json.error || json.success === false) ? json : null, '字段重新生成未返回有效内容，已保留原值（防止设定漂移）')
            return
          }
          var fieldValue = _rawFieldValue
          if (stepName === 'worldbuilding' && ['era', 'geography', 'history', 'powerSystem', 'socialStructure', 'technology'].includes(fieldName)) {
            fieldValue = cleanPlaceholders(normalizeToString(fieldValue))
          }
          setGeneratedData(function (prev) { return ({
            ...prev,
            [stepName]: {
              ...(prev as any)[stepName],
              [fieldName]: fieldValue,
            },
          })})
        } else {
          if (stepName === 'worldbuilding' && json.data) {
            setGeneratedData(function (prev) { return ({ ...prev, worldbuilding: normalizeWorldbuildingData(json.data) })})
          } else if (stepName === 'characters' && json.data) {
            setGeneratedData(function (prev) { return ({ ...prev, characters: normalizeCharactersData(json.data, detailedDesignInput) })})
          } else if (stepName === 'factions' && json.data) {
            var normalizedF = normalizeFactionsData(json.data)
            setGeneratedData(function (prev) { return ({ ...prev, factions: normalizedF })})
            saveStepSnapshot('factions', normalizedF)
          } else if (stepName === 'relationships' && json.data) {
            var normalizedR = normalizeRelationshipsData(json.data)
            setGeneratedData(function (prev) { return ({ ...prev, relationships: normalizedR })})
            saveStepSnapshot('relationships', normalizedR)
          } else if (stepName === 'synopsis' && json.data) {
            setGeneratedData(function (prev) { return ({ ...prev, synopsis: normalizeSynopsisData(json.data) })})
          } else if (stepName === 'outline') {
            console.log('[handleRegenerate] outline step, json.data:', json.data ? 'exists' : 'null/empty')
            var _normOutline = normalizeOutlineData(json.data || null)
            // 🔥 Bug3修复：即使json.data为空，normalizeOutlineData也会返回有效的默认数据
            // 🔥 最终防线：确保所有字段都已填充
            var _genreLower = (genre || '').toLowerCase()
            var _isWesternOutline = /西幻|西方|魔法|斗气|盘龙|魔幻|奇幻|中世纪|骑士|精灵|矮人/.test(_genreLower)
            var _isHonghuangOutline = /洪荒|封神|巫族|上古|神话|阐教|截教|巫颂/.test(_genreLower)
            if (_normOutline.stages && Array.isArray(_normOutline.stages)) {
              for (var _si2 = 0; _si2 < _normOutline.stages.length; _si2++) {
                var _st2 = _normOutline.stages[_si2]
                if (!_st2.name || _st2.name.length < 2) _st2.name = '等待AI生成'
                if (!_st2.powerLevel || _st2.powerLevel.length < 2) _st2.powerLevel = '等待AI生成'
                if (!_st2.summary || _st2.summary.length < 10) _st2.summary = '等待AI生成'
                if (!Array.isArray(_st2.mainEvents) || _st2.mainEvents.length === 0) _st2.mainEvents = ['等待AI生成']
                if (!Array.isArray(_st2.shuangPoints) || _st2.shuangPoints.length === 0) _st2.shuangPoints = ['等待AI生成']
              }
            }
            if (!_normOutline.storyOrigin || _normOutline.storyOrigin.length < 10) _normOutline.storyOrigin = '等待AI生成'
            if (!_normOutline.ending || _normOutline.ending.length < 10) _normOutline.ending = '等待AI生成'
            if (!Array.isArray(_normOutline.keyEvents) || _normOutline.keyEvents.length === 0) {
              if (_isWesternOutline) {
                _normOutline.keyEvents = [
                  { name: '获得神秘传承', position: '第一阶段', impact: '主角获得改变命运的魔法传承' },
                  { name: '进入魔法学院', position: '第一阶段', impact: '结识重要伙伴与导师' },
                  { name: '首次遭遇危机', position: '第二阶段', impact: '面临黑暗势力的首次威胁' },
                  { name: '揭开龙族秘密', position: '第三阶段', impact: '发现大陆隐藏的古老真相' },
                  { name: '与反派最终对决', position: '第四阶段', impact: '与黑暗主宰展开生死决战' },
                  { name: '登上魔法巅峰', position: '第四阶段', impact: '成为传奇法神，守护大陆和平' }
                ]
              } else if (_isHonghuangOutline) {
                // 🔥 已删除：洪荒题材fallback中的"觉醒祖巫血脉/遭遇巫妖大战/揭开鸿钧秘密/证道成圣"等具体剧情节点
                // 这些硬编码剧情会污染仿写其它洪荒小说，改为通用占位（实际keyEvents由LLM生成）
                _normOutline.keyEvents = [
                  { name: '获得核心机缘', position: '第一阶段', impact: '主角获得改变命运的契机' },
                  { name: '与重要伙伴相遇', position: '第一阶段', impact: '结识关键伙伴' },
                  { name: '遭遇首个危机', position: '第二阶段', impact: '首次面临真正的威胁' },
                  { name: '揭开重要秘密', position: '第三阶段', impact: '发现世界隐藏的真相' },
                  { name: '与反派正面冲突', position: '第四阶段', impact: '与最终反派展开决战' },
                  { name: '达成最终目标', position: '第四阶段', impact: '完成使命，成为传奇人物' }
                ]
              } else {
                _normOutline.keyEvents = [{ name: '获得核心机缘', position: '第一阶段', impact: '主角获得改变命运的契机' }, { name: '与重要伙伴相遇', position: '第一阶段', impact: '结识关键伙伴' }, { name: '遭遇首个危机', position: '第二阶段', impact: '首次面临真正的威胁' }, { name: '揭开重要秘密', position: '第三阶段', impact: '发现世界隐藏的真相' }, { name: '与反派正面冲突', position: '第四阶段', impact: '与最终反派展开决战' }, { name: '达成最终目标', position: '第四阶段', impact: '完成使命，成为传奇人物' }]
              }
            }
            setGeneratedData(function (prev) { return ({ ...prev, outline: _normOutline })})
            saveStepSnapshot('outline', _normOutline)
          } else if (stepName === 'keyPlots' && json.data) {
            setGeneratedData(function (prev) { return ({ ...prev, keyPlots: normalizeKeyPlotsData(json.data) })})
            saveStepSnapshot('keyPlots', normalizeKeyPlotsData(json.data))
          } else if (stepName === 'powerSystem' && json.data) {
            var normalizedPS = normalizePowerSystemData(json.data)
            var _ideaSysName2 = (generatedDataRef.current.idea as any)?.systemName || ''
            var _ideaTagline2 = (generatedDataRef.current.idea as any)?.tagline || ''
            var _ideaSysNameClean2 = (_ideaSysName2 || '').trim()
            
            var _regenPrompt2 = regeneratePrompt || ''
            var _hasGoldenFingerNameChange = _regenPrompt2.indexOf('系统') !== -1 || _regenPrompt2.indexOf('签到') !== -1 || _regenPrompt2.indexOf('金手指名称') !== -1 || _regenPrompt2.indexOf('能力名称') !== -1 || _regenPrompt2.indexOf('修改金手指') !== -1 || _regenPrompt2.indexOf('更换金手指') !== -1
            
            if (!_hasGoldenFingerNameChange) {
              var _detectedNames2: string[] = []
              if (_ideaSysNameClean2 && _ideaSysNameClean2 !== '无' && _ideaSysNameClean2 !== '无金手指') {
                var sysParts2 = splitGoldenFingerNames(_ideaSysNameClean2)
                if (sysParts2.length > 0) _detectedNames2 = sysParts2
              }
              if (_detectedNames2.length > 0) {
                var syncedAbs2: any[] = []
                _detectedNames2.forEach(function(gfName, idx) {
                  var existing = normalizedPS.protagonistAbilities[idx] || (idx === 0 ? normalizedPS.protagonistAbility : null)
                  var ab = normalizeAbilityObject(existing || {})
                  ab.name = gfName.trim()
                  if (!ab.type) ab.type = inferAbilityTypeFromName(gfName) || '知识记忆'
                  if (!ab.description) ab.description = ''
                  if (!Array.isArray(ab.abilities)) ab.abilities = []
                  if (!Array.isArray(ab.limitations)) ab.limitations = []
                  if (!ab.evolution) ab.evolution = ''
                  syncedAbs2.push(ab)
                })
                if (syncedAbs2.length > 0) {
                  normalizedPS.protagonistAbility = { ...syncedAbs2[0] }
                  normalizedPS.protagonistAbilities = syncedAbs2
                  console.log('[handleRegenerate] 金手指严格同步完成（灵感设定' + _detectedNames2.length + '个）:', normalizedPS.protagonistAbilities.map(function(a: any) { return a.name + '(' + a.type + ')' }).join(', '))
                }
              } else if (_ideaSysNameClean2 && _ideaSysNameClean2 !== '无' && _ideaSysNameClean2 !== '无金手指' && normalizedPS.protagonistAbility) {
                var _coreName2 = _ideaSysNameClean2.trim()
                if (_coreName2.length >= 2) {
                  var _currentName2 = normalizedPS.protagonistAbility.name || ''
                  var _coreType2 = normalizedPS.protagonistAbility.type || inferAbilityTypeFromName(_coreName2) || '知识记忆'
                  if (_currentName2 !== _coreName2) {
                    console.log('[handleRegenerate] 前端兜底同步金手指名称: "' + _currentName2 + '" → "' + _coreName2 + '"')
                    normalizedPS.protagonistAbility.name = _coreName2
                    normalizedPS.protagonistAbility.type = _coreType2
                    if (normalizedPS.protagonistAbilities.length > 0) {
                      normalizedPS.protagonistAbilities[0] = { ...normalizedPS.protagonistAbilities[0], name: _coreName2, type: _coreType2 }
                    }
                  }
                }
              }
            } else {
              console.log('[handleRegenerate] 用户在重新生成提示中指定了金手指名称修改要求（如"签到系统"），跳过强制同步，使用AI生成的结果')
            }
            
            if (!normalizedPS.protagonistAbility.name || (!_hasGoldenFingerNameChange && (!_ideaSysNameClean2 || _ideaSysNameClean2 === '无' || _ideaSysNameClean2 === '无金手指'))) {
              if (!normalizedPS.protagonistAbility.name) {
                var _genreForAuto2 = genre || ''
                var _kwForAuto2 = keywords || ''
                if (_genreForAuto2.indexOf('历史') !== -1 || _kwForAuto2.indexOf('历史') !== -1 || _kwForAuto2.indexOf('南明') !== -1 || _kwForAuto2.indexOf('明末') !== -1 || _kwForAuto2.indexOf('穿越') !== -1) {
                  normalizedPS.protagonistAbility = {
                    name: '历史先知',
                    type: '先知类',
                    description: '拥有现代历史知识和技术，能预知历史走向并利用现代知识改变世界',
                    abilities: ['历史预知', '技术革新', '权谋分析'],
                    limitations: ['知识有时代局限', '改变历史有风险'],
                    evolution: '初入乱世→知识立足→权谋立足→影响格局→改写命运'
                  }
                } else if (_genreForAuto2.indexOf('都市') !== -1 || _genreForAuto2.indexOf('现代') !== -1) {
                  normalizedPS.protagonistAbility = {
                    name: '知识传承',
                    type: '知识类',
                    description: '拥有超越常人的知识储备和学习能力，在现代社会中游刃有余',
                    abilities: ['过目不忘', '快速学习', '知识应用'],
                    limitations: ['知识需要实践', '并非全能'],
                    evolution: '初露锋芒→小试牛刀→崭露头角→行业精英→领域权威'
                  }
                } else if (_genreForAuto2.indexOf('科幻') !== -1 || _genreForAuto2.indexOf('星际') !== -1) {
                  normalizedPS.protagonistAbility = {
                    name: '基因进化',
                    type: '基因进化流',
                    description: '基因锁开启后获得超人类能力，逐步进化超越凡人',
                    abilities: ['力量强化', '感知增强', '进化适应'],
                    limitations: ['进化有风险', '能量消耗'],
                    evolution: '一阶基因→二阶基因→三阶基因→四阶基因→五阶基因→超人'
                  }
                } else {
                  normalizedPS.protagonistAbility = {
                    name: '天命传承',
                    type: '功法类',
                    description: '获得古老传承，踏上修炼之路，逐步揭开世界奥秘',
                    abilities: ['基础修炼', '武技精通', '秘法觉醒'],
                    limitations: ['修炼需资源', '进阶有瓶颈'],
                    evolution: '初窥门径→登堂入室→融会贯通→炉火纯青→出神入化'
                  }
                }
                normalizedPS.protagonistAbilities = [normalizedPS.protagonistAbility]
              }
            }
            setGeneratedData(function (prev) { return ({ ...prev, powerSystem: normalizedPS })})
            saveStepSnapshot('powerSystem', normalizedPS)
          } else if (stepName === 'chapters' && json.data) {
            setGeneratedData(function (prev) { return ({ ...prev, chapters: normalizeChaptersData(json.data) })})
          } else if (stepName === 'idea' && json.data) {
            var normalizedIdea = normalizeIdeaData(json.data)
            normalizedIdea.userKeywords = keywordsArray
            normalizedIdea.userInput = keywords
            var _fanMatch2 = keywords.match(/([^\s，,、]+)同人/)
            if (!_fanMatch2 && regeneratePrompt) {
              _fanMatch2 = regeneratePrompt.match(/([^\s，,、]+)同人/)
            }
            if (_fanMatch2) {
              normalizedIdea.fanfictionSource = _fanMatch2[1]
              normalizedIdea.fanfictionBookData = generatedDataRef.current.idea?.fanfictionBookData || null
            }
            setGeneratedData(function (prev) { return ({ ...prev, idea: normalizedIdea })})
            saveStepSnapshot('idea', normalizedIdea)
          } else {
            setGeneratedData(function (prev) { return ({ ...prev, [stepName]: json.data })})
          }
        }
        setRegeneratePrompt('')
      } else {
        var err = await res.json().catch(function() { return {} })
        console.error('[handleRegenerate] API error for step:', stepName, err)
        // 🔥 Bug3修复：对于outline步骤，API失败时使用默认兜底数据
        if (stepName === 'outline') {
          console.log('[handleRegenerate] Outline API failed, using fallback data')
          var _fallbackOutline = normalizeOutlineData(null)
          setGeneratedData(function (prev) { return ({ ...prev, outline: _fallbackOutline })})
          saveStepSnapshot('outline', _fallbackOutline)
        } else {
          showErrorAlert(err, 'AI generation error')
        }
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('[handleRegenerate] Error:', err)
      // 🔥 Bug3修复：对于outline步骤，异常时也使用默认兜底数据
      if (stepName === 'outline') {
        console.log('[handleRegenerate] Outline exception caught, using fallback data')
        var _fallbackOutline3 = normalizeOutlineData(null)
        setGeneratedData(function (prev) { return ({ ...prev, outline: _fallbackOutline3 })})
        saveStepSnapshot('outline', _fallbackOutline3)
      } else {
        showErrorAlert(err, 'AI generation error')
      }
    } finally {
      clearTimeout(_regTimeout)
      setIsLoading(false)
      setRegeneratingField(null)
    }
  }

  // 🔥 QA-8 卷摘要叙事重组（前端版）：四字段清洗→去重→短句并入→连接词按卷号轮换，杜绝「。；」乱标点与「灭族满清。」式碎句
  var _wizardCleanSumPart = function(raw: any): string {
    var s = String(raw == null ? '' : raw).trim()
    s = s.replace(/^[。；;，,、！？\s·]+/, '').replace(/[。；;，,、！？\s·]+$/, '')
    s = s.replace(/[；;]/g, '，').replace(/\s+/g, '')
    return s
  }
  var _wizardComposeVolSummary = function(kp: any, volNum: number): string {
    if (!kp) return ''
    var _rawParts: string[] = []
    if (kp.coreObjective) _rawParts.push(String(kp.coreObjective))
    if (kp.openingNode && kp.openingNode.event) _rawParts.push(String(kp.openingNode.event))
    if (kp.climaxNode && kp.climaxNode.event) _rawParts.push(String(kp.climaxNode.event))
    if (kp.endHook && kp.endHook.content) _rawParts.push(String(kp.endHook.content))
    var _kept: string[] = []
    for (var _pi = 0; _pi < _rawParts.length; _pi++) {
      var p = _wizardCleanSumPart(_rawParts[_pi])
      if (p.length < 4) continue
      var _isDupP = false
      for (var _qi = 0; _qi < _kept.length; _qi++) {
        var q = _kept[_qi]
        if (q.indexOf(p) !== -1 || p.indexOf(q) !== -1) { _isDupP = true; break }
        var _shared = 0
        for (var _gi = 0; _gi <= p.length - 4; _gi++) {
          if (q.indexOf(p.substring(_gi, _gi + 4)) !== -1) { _shared++; _gi += 3 }
        }
        if (p.length >= 8 && _shared >= Math.max(2, Math.floor((p.length - 4) / 3))) { _isDupP = true; break }
      }
      if (!_isDupP) _kept.push(p)
    }
    if (_kept.length === 0) return ''
    var _merged: string[] = []
    for (var _mi = 0; _mi < _kept.length; _mi++) {
      if (_kept[_mi].length < 10 && _merged.length > 0) _merged[_merged.length - 1] += '，' + _kept[_mi]
      else _merged.push(_kept[_mi])
    }
    if (_merged.length > 1 && _merged[0].length < 10) {
      _merged[1] = '为' + _merged[0] + '，' + _merged[1]
      _merged.shift()
    }
    var _ocIdx = (volNum - 1) % 3
    var _openConns = ['本卷开篇，', '卷首，', '一开卷，']
    var _climaxConns = ['随着局势推进，', '中段，', '剧情走向深处，']
    var _hookConns = ['卷末，', '至卷终，', '收卷之际，']
    var _out = _merged[0]
    if (_merged.length > 1) _out += '。' + _openConns[_ocIdx] + _merged[1]
    if (_merged.length > 2) _out += '。' + _climaxConns[_ocIdx] + _merged[2]
    if (_merged.length > 3) _out += '。' + _hookConns[_ocIdx] + _merged[3]
    for (var _ei = 4; _ei < _merged.length; _ei++) _out += '。' + _merged[_ei]
    return _out + '。'
  }

  var handleVolumeConfigChange = function(field: 'volumeCount' | 'chaptersPerVolume', value: number) {
    var newValue = Math.max(1, Math.min(field === 'volumeCount' ? 20 : 200, value))
    var newConfig = { ...volumeConfig, [field]: newValue }
    setVolumeConfig(newConfig)
    setUserModifiedVolumeConfig(true)

    if (!generatedData.chapters?.volumes) return

    var currentVolumes = [...generatedData.chapters.volumes]
    var needsUpdate = false
    var adjustedVolumes = [...currentVolumes]

    if (field === 'volumeCount') {
      if (newValue > currentVolumes.length) {
        // 🔥 修复：新增卷必须基于关键剧情节点生成卷标题和卷摘要，不能使用占位符
        var keyPlotsVolumes = generatedDataRef.current.keyPlots?.volumes || []
        var outlineStages = generatedDataRef.current.outline?.stages || []
        for (var v = currentVolumes.length + 1; v <= newValue; v++) {
          var vkp = keyPlotsVolumes[v - 1]
          // 🔥 优先使用关键剧情节点的卷名
          var newVolName = ''
          if (vkp?.name && String(vkp.name).trim().length >= 2) {
            newVolName = String(vkp.name).trim()
          } else if (vkp?.coreObjective && String(vkp.coreObjective).length > 4) {
            var extracted = String(vkp.coreObjective).replace(/[，。！？、；：\s]/g, '').slice(0, 8)
            if (extracted.length >= 4) newVolName = extracted
          } else if (outlineStages[v - 1]?.name && String(outlineStages[v - 1].name).length >= 2) {
            newVolName = String(outlineStages[v - 1].name)
          }
          if (!newVolName) {
            var cnNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十']
            var volCn = (v >= 1 && v <= 20) ? cnNums[v - 1] : String(v)
            newVolName = '第' + volCn + '卷'
          }
          // 🔥 优先使用关键剧情节点的卷摘要（四段式结构）
          var newVolSummary = ''
          if (vkp?.summary && String(vkp.summary).length > 20) {
            newVolSummary = String(vkp.summary)
          } else {
            // 🔥 QA-8：基于核心目标+开篇节点+高潮节点+卷末钩子叙事重组（清洗+去重+短句并入+连接词）
            newVolSummary = _wizardComposeVolSummary(vkp, v)
          }
          adjustedVolumes.push({
            name: newVolName,
            summary: newVolSummary,
            coreObjective: vkp?.coreObjective || '',
            keyEvents: vkp?.keyEvents || [],
            openingNode: vkp?.openingNode || null,
            climaxNode: vkp?.climaxNode || null,
            chapters: Array.from({ length: newConfig.chaptersPerVolume }, function (_ignore, i) {
              var chapterNum = (v - 1) * newConfig.chaptersPerVolume + i + 1
              return {
                id: 'ch-v' + v + '-c' + chapterNum + '-' + Date.now() + '-' + i,
                title: '第' + chapterNum + '章',
                summary: '',
                shuangPoints: [],
                hook: '',
                volume: v,
                chapterNumber: chapterNum,
                wordCount: 3000,
                status: 'pending'
              }
            })
          })
        }
        needsUpdate = true
      } else if (newValue < currentVolumes.length) {
        adjustedVolumes.splice(newValue)
        needsUpdate = true
      }
    }

    if (field === 'chaptersPerVolume') {
      adjustedVolumes.forEach(function (vol, vIndex) {
        var volNum = vIndex + 1
        var chapters = [...(vol.chapters || [])]
        if (newValue > chapters.length) {
          for (var i = chapters.length; i < newValue; i++) {
            var chapterNum = (volNum - 1) * newValue + i + 1
            chapters.push({
              id: 'ch-v' + volNum + '-c' + chapterNum + '-' + Date.now() + '-' + i,
              title: '第' + chapterNum + '章',
              summary: '',
              shuangPoints: [],
              hook: '',
              volume: volNum,
              chapterNumber: chapterNum,
              wordCount: 3000,
              status: 'pending',
            })
          }
        } else if (newValue < chapters.length) {
          // 🔥🔥🔥 Bug修复：减少章节数时不重置保留章节的title，只删除多余章节并重算chapterNumber
          // 根因：原逻辑ch.title='第'+chapterNum+'章'会清空AI生成的好标题
          chapters = chapters.slice(0, newValue)
          chapters.forEach(function(ch, idx) {
            var chapterNum = (volNum - 1) * newValue + idx + 1
            ch.chapterNumber = chapterNum
            // 🔥 只更新chapterNumber，保留title（如果title已有AI生成的核心标题）
            // 仅当title是空的或只是"第X章"格式时才重置
            var _existingTitleCore = (ch.title || '').replace(/^第\d+章\s*/, '').trim()
            if (!_existingTitleCore || _existingTitleCore.length < 2) {
              ch.title = '第' + chapterNum + '章'
            } else {
              // 保留核心标题，只更新章节号前缀
              ch.title = '第' + chapterNum + '章 ' + _existingTitleCore
            }
            // 🔥 标记为需要重新检查（但不强制重新生成）
            if (ch.status === 'completed' || ch.status === 'planned') {
              // 保留已有状态，不重置为pending
            }
          })
        }
        adjustedVolumes[vIndex].chapters = chapters
        needsUpdate = true
      })
    }

    if (needsUpdate) {
      var updatedChapters = {
        volumes: adjustedVolumes,
        chapters: adjustedVolumes.flatMap(function (v: any) { return v.chapters; }),
        chapterCount: adjustedVolumes.reduce(function (sum: number, v: any) { return sum + v.chapters.length; }, 0),
        totalWordCount: adjustedVolumes.reduce(function (sum: number, v: any) { return sum + v.chapters.length * 3000; }, 0),
      }
      setGeneratedData(function (prev) { return { ...prev, chapters: updatedChapters } })
    }
  }

  // 检查每个环节是否已生成数据（用于流程环节图的状态判断）
  function hasStepData(stepKey: string): boolean {
    switch (stepKey) {
      case 'input': return true
      case 'idea': return !!generatedData.idea
      case 'worldbuilding': return !!generatedData.worldbuilding
      case 'powerSystem': return !!generatedData.powerSystem
      case 'characters': return !!generatedData.characters
      case 'factions': return !!generatedData.factions
      case 'relationships': return !!generatedData.relationships
      case 'synopsis': return !!generatedData.synopsis
      case 'outline': return !!generatedData.outline
      case 'keyPlots': return !!generatedData.keyPlots
      case 'chapters': return !!generatedData.chapters
      case 'generating': return generatedChapters.length > 0
      case 'finalCheck': return generatedChapters.length > 0
      case 'cover': return !!generatedData.coverUrl
      default: return false
    }
  }

  function getCurrentStepLabel(): string {
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].key === step) return steps[i].label
    }
    return 'AI 小说自动创作向导'
  }
  function getNextStepLabel(): string {
    switch (step) {
      case 'input': return '开始生成'
      case 'idea': return '生成世界观'
      case 'worldbuilding': return '设定金手指'
      case 'powerSystem': return '设定人物'
      case 'characters': return '设定势力'
      case 'factions': return '生成关系图谱'
      case 'relationships': return '生成简介'
      case 'synopsis': return '生成大纲'
      case 'outline': return '设计剧情节点'
      case 'keyPlots': return '划分章节'
      case 'chapters': return '开始写正文'
      case 'generating': return '爆款终检'
      case 'finalCheck': return '制作封面'
      case 'cover': return '完成'
    default: return '下一步'
  }
  }

  // 🔥 2026-09-01 第17轮：人物阵容模式选择器（单女主/双女主/后宫·多女主）。
  //   驱动「主要人物设定」环节分批生成的人设构成（CHAR_ROSTER_PRESETS）与 UI 配额。
  //   同时显示在 金手指 步（点「设定人物」前选好）与 主要人物设定 步（可切换后「重新生成全部」）。
  var ROSTER_COMPOSITION: Record<string, string> = {
    single: '主角1 · 女主1 · 女配2 · 朋友2 · 反派4 · 配角5（共15）',
    dual: '主角1 · 女主2 · 女配1 · 朋友2 · 反派5 · 配角4（共15）',
    harem: '主角1 · 女主4 · 反派4 · 配角6（共15）',
  }
  var renderRosterSelector = function () {
    var modes: { key: 'single' | 'dual' | 'harem'; label: string }[] = [
      { key: 'single', label: '单女主' },
      { key: 'dual', label: '双女主' },
      { key: 'harem', label: '后宫·多女主' },
    ]
    return (
      <div style={{ marginBottom: 16, padding: '12px 14px', border: '1px solid #e7e5e4', borderRadius: 10, background: '#fafaf9' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#57534e', marginBottom: 8 }}>
          人物阵容模式（决定「主要人物设定」输出的人设构成，共 15 名 / 3 批 × 5 人）
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {modes.map(function (m) {
            var active = charRomanceMode === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={function () { setCharRomanceMode(m.key) }}
                style={{
                  flex: '1 1 200px',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: active ? '1.5px solid #d97706' : '1px solid #d6d3d1',
                  background: active ? '#fffbeb' : '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#b45309' : '#44403c' }}>
                  {m.label}{active ? ' ✓' : ''}
                </div>
                <div style={{ fontSize: 11.5, color: '#78716c', marginTop: 3, lineHeight: 1.4 }}>
                  {ROSTER_COMPOSITION[m.key]}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function RegenButton({ step, field, label }: { step: string; field?: string; label: string }) {
    var fieldKey = step + (field || '')
    var isThisRegenerating = regeneratingField === fieldKey
    return (
      <button
        onClick={function () { console.log('[RegenButton] clicked:', step, field, 'isThisRegenerating:', isThisRegenerating); handleRegenerate(step, field) }}
        disabled={isThisRegenerating}
        title={`重新生成 ${label}`}
        className="text-sm px-3 py-1 rounded bg-stone-500 text-white hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isThisRegenerating ? '重新生成中...' : '重新生成'}
      </button>
    )
  }

  // 🔒 字段级重新生成入口条：仅替换目标字段，其余字段由服务端按 frozen 快照逐字保留
  function FieldRegenBar({ step, fields }: { step: string; fields: Array<{ key: string; label: string }> }) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
        <span className="text-xs font-medium text-stone-500">字段级重新生成（仅替换该字段，其余设定逐字保留）：</span>
        {fields.map(function (f) {
          return (
            <span key={f.key} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
              <span>{f.label}</span>
              <RegenButton step={step} field={f.key} label={f.label} />
            </span>
          )
        })}
      </div>
    )
  }

  var handleImitateSearch = async function() {
    if (!imitateSearch.trim() || imitateLoading) return
    setImitateLoading(true)
    setImitateSearchPhase('searching')
    setImitateResult(null)
    try {
      var res = await fetch('/tuzhong-wenshu/api/book-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookName: imitateSearch.trim(),
          llmConfig: getStepLlmConfig('idea'),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (json.success && json.data) {
          var apiResult = json.data
          // 确保章节数字段两套值都填充（chapterCount 用于前端展示，totalChapters 用于内部）
          var _cc = apiResult.chapterCount || apiResult.totalChapters || 0
          if (typeof _cc === 'string') _cc = Number(_cc.replace('章', '')) || 0
          apiResult.chapterCount = _cc
          apiResult.totalChapters = _cc
          // 同时确保字数字段也有值
          var _wc = apiResult.wordCount || apiResult.totalWords || ''
          apiResult.wordCount = _wc
          apiResult.totalWords = _wc
          // 确保状态字段也有值
          var _st = apiResult.status || ''
          apiResult.status = _st
          apiResult.bookStatus = _st
          setImitateResult(apiResult)
          setImitateData(apiResult)
          imitateDataRef.current = apiResult
          setImitateMode(true)
          setImitateSearchPhase('done')
          try {
            localStorage.setItem('tuzhong-imitate-data', JSON.stringify(apiResult))
            console.log('[Imitate] Saved to localStorage:', apiResult.title)
          } catch (e) { console.warn('[Imitate] localStorage save failed:', e) }

          // 🔥 P0 修复：搜索拆书后同步调用 auto-book-analysis 获取完整拆书分析
          // 解决核心根因：handleImitateSearch 只调用 /api/book-search 获取基础数据，
          // 没有调用 /api/auto-book-analysis 获取 LLM 深度拆解结果（worldviewFramework/powerSystemModel 等）
          // 导致 generatedData.bookAnalysis 为 null，后续 handleGenerateIdea 的 previousData.bookAnalysis 为空
          // LLM 无法参考目标作品的设定，生成内容偏离主题
          try {
            console.log('[ImitateSearch] 同步触发 auto-book-analysis 深度拆解:', apiResult.title)
            var _baRes = await fetch('/tuzhong-wenshu/api/auto-book-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookName: apiResult.title || imitateSearch.trim(),
                llmConfig: getStepLlmConfig('idea'),
              }),
            })
            if (_baRes.ok) {
              var _baJson = await _baRes.json()
              if (_baJson.data) {
                // 设置到 generatedData.bookAnalysis，供后续所有环节的 previousData 使用
                setGeneratedData(function (prev) { return { ...prev, bookAnalysis: _baJson.data } })
                // 同步 ref，避免 React 闭包陷阱
                generatedDataRef.current = { ...generatedDataRef.current, bookAnalysis: _baJson.data }
                setBookAnalysisResult(_baJson.data)
                setBookAnalysisMode(true)
                try {
                  localStorage.setItem('tuzhong-book-analysis', JSON.stringify(_baJson.data))
                } catch (e) {}
                console.log('[ImitateSearch] auto-book-analysis 完成:', _baJson.data.bookName, 'genre:', _baJson.data.bookGenre, 'mapping keys:', Object.keys(_baJson.data.mapping || {}).join(', '))
              }
            } else {
              console.warn('[ImitateSearch] auto-book-analysis 返回非200:', _baRes.status)
            }
          } catch (_baErr) {
            console.warn('[ImitateSearch] auto-book-analysis 异常（不影响主流程）:', _baErr instanceof Error ? _baErr.message : String(_baErr))
          }
          // 🔥 2026-11-05 修复：仿写拆书後 genre 合并而非覆盖（用户多选的类型标签不被冲掉）
          if (apiResult.genre) {
            var _srvGenre = String(apiResult.genre || '').trim()
            var _curGenre = String(genreRef.current || '').trim()
            if (_srvGenre && !_curGenre) { setGenre(_srvGenre) }
            else if (_srvGenre) {
              var _gSeen: Record<string, boolean> = {}
              var _gMerged: string[] = []
              String(_curGenre).split(',').forEach(function (s: string) { var t = s.trim(); if (t && !_gSeen[t]) { _gSeen[t] = true; _gMerged.push(t) } })
              String(_srvGenre).split(',').forEach(function (s: string) { var t = s.trim(); if (t && !_gSeen[t]) { _gSeen[t] = true; _gMerged.push(t) } })
              setGenre(_gMerged.join(','))
            }
          }
          if (apiResult.tags && Array.isArray(apiResult.tags) && apiResult.tags.length > 0) {
            var existingKeywords = keywords.split(/[,，、\s]+/).filter(Boolean)
            var imitatedTags = apiResult.tags.filter(function(t: string) { return t && t.trim() })
            var seen = new Set()
            var merged: string[] = []
            existingKeywords.forEach(function(k: string) { if (!seen.has(k)) { seen.add(k); merged.push(k) } })
            imitatedTags.forEach(function(t: string) { if (!seen.has(t)) { seen.add(t); merged.push(t) } })
            // 🔥🔥🔥 修复：仿写搜索后关键词必须经过语义去重，不能只做Set去重
            var _semanticWords = /^(争霸|巫道|蛮荒|部族|修行|觉醒|进化|战斗|冒险|修炼|杀伐|崛起|纪元|高燃|热血|洪荒|巫族|妖族|人族|万族|异族|凶兽|疆域|无敌|传承|决战)$/
            var _deduped: string[] = []
            var _usedCores: string[] = []
            merged.forEach(function(k: string) {
              var core = k.replace(/^(上古|太古|远古|热血|杀伐|高燃|宏大|极致|层层|大规模|重振|各大)/, '').trim()
              if (core.length < 2) core = k
              var isDup = false
              for (var i = 0; i < _usedCores.length; i++) {
                var existing = _usedCores[i]
                if (core === existing) { isDup = true; break }
                if (core.length >= 2 && existing.length >= 2) {
                  if (core.indexOf(existing) !== -1 || existing.indexOf(core) !== -1) { isDup = true; break }
                }
                if (core.length >= 2 && existing.length >= 2) {
                  for (var j = 0; j <= core.length - 2; j++) {
                    var sub = core.substring(j, j + 2)
                    if (sub.length === 2 && existing.indexOf(sub) !== -1 && _semanticWords.test(sub)) {
                      isDup = true; break
                    }
                  }
                  if (isDup) break
                }
              }
              if (!isDup) { _deduped.push(k); _usedCores.push(core) }
            })
            console.log('[ImitateSearch] 关键词语义去重: ' + merged.length + ' → ' + _deduped.length, { before: merged, after: _deduped })
            setKeywords(_deduped.join(', '))
          }
        } else if (json.error) {
          setImitateSearchPhase('idle')
          showErrorAlert(json, '拆书失败')
        }
      } else {
        var errText = ''
        try { var errJson = await res.json(); errText = errJson.error || errJson.message || JSON.stringify(errJson) } catch (e) { errText = 'HTTP ' + res.status }
        console.error('[ImitateSearch] API error:', res.status, errText)
        setImitateSearchPhase('idle')
        showErrorAlert(null, '拆书搜索失败: ' + errText)
      }
    } catch (err) {
      console.error('[ImitateSearch] Error:', err)
      setImitateSearchPhase('idle')
      showErrorAlert(err, '拆书搜索异常')
    } finally {
      setImitateLoading(false)
    }
  }

  // 🔥 万能仿写·手动导入拆书结果
  var handleImportBookAnalysis = async function() {
    if (!bookAnalysisJson.trim() || bookAnalysisLoading) return
    setBookAnalysisLoading(true)
    setBookAnalysisResult(null)
    try {
      var res = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'bookAnalysis',
          input: '',
          keywords: [],
          genre: genre || '玄幻',
          novelId: 'temp',
          llmConfig: getStepLlmConfig('idea'),
          bookAnalysisJson: bookAnalysisJson.trim(),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (json.data) {
          setBookAnalysisResult(json.data)
          // 🔥 将拆书结果保存到 generatedData 中，供后续步骤的 previousData 使用
          setGeneratedData(function (prev) { return { ...prev, bookAnalysis: json.data } })
          // 保存到 localStorage 以便刷新后恢复
          try {
            localStorage.setItem('tuzhong-book-analysis', JSON.stringify(json.data))
          } catch (e) {}
          console.log('[BookAnalysis] Imported:', json.data.bookName, 'mapping keys:', Object.keys(json.data.mapping || {}).join(', '))
        } else if (json.error) {
          showErrorAlert(json, '拆书导入失败')
        }
      } else {
        var errText = ''
        try { var errJson = await res.json(); errText = errJson.error || errJson.message || JSON.stringify(errJson) } catch (e) { errText = 'HTTP ' + res.status }
        console.error('[BookAnalysis] API error:', res.status, errText)
        showErrorAlert(null, '拆书导入失败: ' + errText)
      }
    } catch (err) {
      console.error('[BookAnalysis] Error:', err)
      showErrorAlert(err, '拆书导入异常')
    } finally {
      setBookAnalysisLoading(false)
    }
  }

  // 🔥 第二期·自动拆书：输入书名 → 搜索 → LLM拆解 → 自动填入JSON
  var handleAutoBookAnalysis = async function() {
    if (!autoBookName.trim() || autoBookLoading) return
    setAutoBookLoading(true)
    setBookAnalysisResult(null)
    setBookAnalysisJson('')
    try {
      var res = await fetch('/tuzhong-wenshu/api/auto-book-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookName: autoBookName.trim(),
          llmConfig: getStepLlmConfig('idea'),
        }),
      })
      if (res.ok) {
        var json = await res.json(); if (json && json._meta && json._meta.usedModel) recordStepModel(json._meta)
        if (json.data) {
          // 自动填入JSON到文本框
          setBookAnalysisJson(JSON.stringify(json.data.analysis, null, 2))
          // 同时设置结果
          setBookAnalysisResult(json.data)
          setBookAnalysisMode(true)
          setGeneratedData(function (prev) { return { ...prev, bookAnalysis: json.data } })
          try {
            localStorage.setItem('tuzhong-book-analysis', JSON.stringify(json.data))
          } catch (e) {}
          console.log('[AutoBookAnalysis] Success:', json.data.bookName, 'mapping:', Object.keys(json.data.mapping || {}).join(', '))
        } else if (json.error) {
          showErrorAlert(null, '自动拆书失败: ' + json.error)
        }
      } else {
        var errText = ''
        try { var errJson = await res.json(); errText = errJson.error || errJson.message || JSON.stringify(errJson) } catch (e) { errText = 'HTTP ' + res.status }
        showErrorAlert(null, '自动拆书失败: ' + errText)
      }
    } catch (err) {
      console.error('[AutoBookAnalysis] Error:', err)
      showErrorAlert(err, '自动拆书异常')
    } finally {
      setAutoBookLoading(false)
    }
  }

  // 🔥 第二期·一键串行生成：从世界观到分卷章节划分，自动跑完前11个环节
  // 🔥🔥🔥 2026-09-03 #120：「AI 全自动生成中断的作品没进草稿箱」根因修复
  //   原缺陷：服务端草稿(status='drafting')只在「逐章生成正文」前才 POST /api/novels 创建，
  //   若流程在 idea / 世界观 / 人物 / 大纲 任一环节中断(报错/超时/关闭页面)，服务端根本没有记录，
  //   书架「草稿箱」(筛选 status==='drafting') 自然是空的。
  //   修复：① 全自动生成「启动瞬间」即建草稿；② 每完成一步落盘进度；③ 失败/中断兜底再落盘一次。
  // 🔥 2026-09-03 #125R3：草稿创建幂等锁——同一会话连续多次触发（填书名+关键词快速连续 / effect 双跑）时，
  //   并发 inflight 复用同一个 Promise，避免对同一 draft-xxx 占位重复 POST 产生多条重复草稿（实测 2 条）。
  // 🔥 2026-09-03 #125R4：锁从组件内 IIFE 闭包提升到模块级 _draftCreateInflight——
  //   组件函数体内的闭包变量随每次渲染重建，锁无法跨渲染共享，R3 线上仍复现重复建草稿。此修复后锁真正全局唯一。
  var ensureDraftNovel = async function (): Promise<string> {
    if (_draftCreateInflight) return _draftCreateInflight
    _draftCreateInflight = (async function () {
      try {
        var _token = localStorage.getItem('token') || ''
        var _headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (_token) _headers['Authorization'] = 'Bearer ' + _token
        var _curId = localStorage.getItem('tuzhong-active-novel-id') || ''
        // 🔥🔥🔥 2026-09-03 #125R2：仅当已是【服务端真实 id】时短路返回。
        //   此前 draft-<ts>-<r> 本地占位 id（L2940 分配）长度>8 也会短路 → 服务端草稿永不创建，
        //   中断作品永远进不了书架草稿箱（用户实锤缺陷 #1 的根因）。
        var _isRealId = !!(_curId && _curId !== 'temp' && String(_curId).indexOf('draft-') !== 0 && String(_curId).length > 8)
        // 🔥🔥🔥 2026-09-10 #120R：真实 id 短路前做一次「书架自愈」——校验该 id 是否确实属于
        //   当前登录用户；若孤儿/错属（数据在 settings.json 但 novels.json 记录缺失或 userId 不匹配，
        //   草稿箱列表过滤后永远看不到，用户实锤缺陷 #2 的根因），则 PUT 重绑定到当前用户。
        //   每会话每个 id 仅校验一次；刷新页面缓存清零可重试。
        if (_isRealId && _selfHealCheckedId !== _curId) {
          _selfHealCheckedId = _curId
          try {
            var _myUid = (function () {
              try {
                var _t0 = localStorage.getItem('token') || ''
                if (!_t0) return ''
                return (JSON.parse(atob(_t0.split('.')[1])) || {}).userId || ''
              } catch (_e0) { return '' }
            })()
            var _lr = await fetch('/tuzhong-wenshu/api/novels', { headers: _headers })
            var _lj = await _lr.json().catch(function () { return {} })
            var _inList = (_lj.data || []).some(function (_b: any) { return String(_b && _b.id) === _curId })
            if (!_inList && _myUid) {
              // 孤儿/错属 → 重绑定 userId（PUT 允许 admin 修改任意作品，普通用户仅能改自己的）
              var _ur = await fetch('/tuzhong-wenshu/api/novels', {
                method: 'PUT',
                headers: _headers,
                body: JSON.stringify({ id: _curId, userId: _myUid, status: 'drafting' }),
              })
              if (_ur.ok) {
                console.log('[Draft] #120R 自愈重绑定孤儿作品', _curId, '->', _myUid)
              } else {
                console.warn('[Draft] #120R 自愈重绑定失败', _curId, 'uid=' + _myUid, _ur.status)
              }
            }
          } catch (_he) { console.warn('[Draft] #120R 自愈校验异常:', _he) }
        }
        if (_isRealId) return _curId
        var _d: any = generatedDataRef.current || {}
        var _idea: any = _d.idea || {}
        var _syn: any = _d.synopsis || {}
        var _title = String(_idea.title || userBookTitle || '').trim() || '未命名作品'
        var _res = await fetch('/tuzhong-wenshu/api/novels', {
          method: 'POST',
          headers: _headers,
          body: JSON.stringify({
            title: _title,
            genre: genre || _idea.genre || '历史',
            description: _syn.longIntro || _syn.fullIntro || _syn.shortIntro || '',
            status: 'drafting',
            chapters: [],
            volumes: (_d.chapters && _d.chapters.volumes) || [],
          }),
        })
        if (_res.ok) {
          var _j = await _res.json().catch(function () { return {} })
          var _newId = _j && _j.data && _j.data.id
          if (_newId) {
            localStorage.setItem('tuzhong-active-novel-id', _newId)
            console.log('[Draft] #120 草稿小说已创建:', _newId)
            return _newId
          }
        } else {
          var _err = await _res.json().catch(function () { return {} })
          console.warn('[Draft] #120 草稿创建失败:', _err && _err.error)
        }
      } catch (_e) { console.warn('[Draft] #120 ensureDraftNovel 异常:', _e) }
      return ''
    })().finally(function () { _draftCreateInflight = null })
    return _draftCreateInflight
  }

  // 把当前进度落盘到服务端：novel 记录(标题/简介/状态) + settings(全部生成数据，供草稿箱「继续创作」恢复)
  var persistDraftProgress = async function (opts?: { status?: string }): Promise<void> {
    try {
      var _id = localStorage.getItem('tuzhong-active-novel-id') || ''
      // 🔥 2026-09-03 #125R2：draft- 前缀本地占位同样需要换服务端 id（否则后续 PUT 全部 404 落空）
      if (!_id || _id === 'temp' || String(_id).indexOf('draft-') === 0 || String(_id).length <= 8) {
        _id = await ensureDraftNovel()
      }
      if (!_id) return
      var _d: any = generatedDataRef.current || {}
      // 🔥 2026-09-08 #160 空数据回写防护：wizard 空挂载（localStorage 被清/恢复未完成/服务端被覆盖）
      //   时 generatedData 各环节全空，若照常 POST batch 会把服务端已有数据整体冲掉（实测曾把《永历中兴》
      //   idea 清成 {}）。这里先检测是否有任一环节存在有效内容，全空则只更新 novel 状态、不落 settings。
      var _stepKeys = ['idea', 'synopsis', 'characters', 'factions', 'relationships', 'keyPlots', 'outline', 'chapters', 'worldbuilding', 'powerSystem']
      var _hasAnyData = false
      for (var _si = 0; _si < _stepKeys.length; _si++) {
        var _sv = _d[_stepKeys[_si]]
        if (!_sv || typeof _sv !== 'object') continue
        var _subKeys = Object.keys(_sv)
        for (var _sj = 0; _sj < _subKeys.length; _sj++) {
          var _vv = _sv[_subKeys[_sj]]
          if (Array.isArray(_vv) ? _vv.length > 0 : (typeof _vv === 'string' ? !!String(_vv).trim() : !!_vv)) { _hasAnyData = true; break }
        }
        if (_hasAnyData) break
      }
      var _syn: any = _d.synopsis || {}
      var _token = localStorage.getItem('token') || ''
      var _headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (_token) _headers['Authorization'] = 'Bearer ' + _token
      if (!_hasAnyData) {
        // 仅更新 novel 记录状态，不写 settings（防止空数据覆盖服务端权威数据）
        try {
          await fetch('/tuzhong-wenshu/api/novels', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: _token ? 'Bearer ' + _token : '' },
            body: JSON.stringify({ id: _id, status: (opts && opts.status) ? opts.status : 'drafting' }),
          })
        } catch (_e0) {}
        console.warn('[Draft] #160 空数据防护：跳过 settings 落盘（避免覆盖服务端已有生成数据）', _id)
        return
      }
      var _novelBody: any = {
        id: _id,
        status: (opts && opts.status) ? opts.status : 'drafting',
      }
      // 🔥 2026-11-06：同步最新作品类型（多选逗号串）到小说记录。
      //   此前 genre 只在 ensureDraftNovel 创建时写一次，之后用户改选类型不会落库，
      //   导致 backfillGenreFromServer 回填的是创建瞬间的旧值（图2「作品类型没恢复对」根因之一）。
      var _gNow = String(genreRef.current || '').trim()
      if (_gNow) _novelBody.genre = _gNow
      var _t = String((_d.idea && _d.idea.title) || userBookTitle || '').trim()
      if (_t) _novelBody.title = _t
      var _desc = _syn.longIntro || _syn.fullIntro || _syn.shortIntro || ''
      if (_desc) _novelBody.description = _desc
      await fetch('/tuzhong-wenshu/api/novels', {
        method: 'PUT',
        headers: _headers,
        body: JSON.stringify(_novelBody),
      }).catch(function () {})
      await fetch('/tuzhong-wenshu/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: _id,
          type: 'batch',
          // 🔥 #199 人物版本号回带：服务端据此拒绝旧快照整体回写
          _charsRev: Number(_d._charsRev) || 0,
          // 🔥 #201 全环节版本号回带
          _secRev: (_d._secRev && typeof _d._secRev === 'object') ? _d._secRev : {},
          worldbuilding: _d.worldbuilding || {}, powerSystem: _d.powerSystem || {},
          characters: _d.characters || {}, factions: _d.factions || {},
          relationships: _d.relationships || {}, keyPlots: _d.keyPlots || {},
          idea: _buildPersistedIdea(_d.idea), synopsis: _d.synopsis || {}, outline: _d.outline || {},
          chapters: _d.chapters || {},
          // 🔥 2026-09-03 #120：记录中断时所处环节，草稿箱「继续创作」可直接回到该步骤（而非一律跳到章节）
          lastStep: step || '',
        }),
      }).catch(function () {})
      console.log('[Draft] #120 进度已落盘:', _id)
    } catch (_e) { console.warn('[Draft] #120 persistDraftProgress 异常:', _e) }
  }

  var handleAutoGenerateAll = async function() {
    if (autoGenRunning || isLoading) return
    if (!keywords.trim() && !bookAnalysisResult) {
      showErrorAlert(null, '请先输入故事主题关键词，或导入拆书结果')
      return
    }
    setAutoGenRunning(true)
    _autoGenInProgress = true // 🔥 设置模块级标志，阻止 showErrorAlert 弹阻塞式 alert
    setAutoGenLog([])

    // 🔥 2026-09-03 #120：启动瞬间即建服务端草稿(status='drafting')，
    //    保证后续任意环节中断（报错/超时/用户关闭页面）该作品都会出现在书架「草稿箱」中。
    try { await ensureDraftNovel() } catch (_dErr) { console.warn('[Draft] #120 启动建草稿失败:', _dErr) }

    // 定义11个生成步骤（按顺序），名称与流程图标签保持一致
    // 🔥 P2.12.2/P2.14.2 修复：恢复"逐章生成正文"步骤，流程二不再跳过正文生成
    // 🔥 P2.12.1 修复：正文生成支持批量生成（5章/批），批内顺序生成保证连贯，批间串行
    // 用户明确要求"生成时间较长也可以等待，不要跳过"
    // 🔥 效率优化v2：减少非必要的React状态更新，合并进度/日志更新，减少渲染次数
    var steps: Array<{ step: Step; name: string; handler: () => Promise<any>; critical: boolean; timeout?: number }> = [
      // 🔥 2026-08-22 修复超时：后端 callLLMWithFallback 非正文步允许 240s，
      //    此前前端只给 120-180s，导致慢环节在"后端即将成功"时被前端提前 abort 报"调用失败"。
      //    统一放宽到 300s（正文独立长任务走 timeout:0 由后端流式控制）。
      // 🔥 2026-08-27 修复：重步骤（分批多次 LLM 调用）在免费模型限流下真实耗时可超 5 分钟，
      //    原统一 300s 会在"后端即将成功"时把整条自动流打断（实测 keyPlots 300s 超时→全流程中断，
      //    但后端其实跑完并把数据写回了 localStorage）。自托管 next start 不强制 maxDuration，
      //    故只需放宽前端等待预算：keyPlots 900s，worldbuilding/characters/outline/chapters 600s。
      { step: 'idea', name: '灵感创作', handler: handleGenerateIdea, critical: true, timeout: 300000 },
      { step: 'worldbuilding', name: '世界观设定', handler: handleGenerateWorldbuilding, critical: true, timeout: 600000 },
      { step: 'powerSystem', name: '金手指设定', handler: handleGeneratePowerSystem, critical: false, timeout: 300000 },
      // 注：characters 后端为 S1 名册多轮 + S2 分块并发展开，实测 6–11 分钟，故与后端 maxDuration=900s 对齐。
      { step: 'characters', name: '主要人物设定', handler: handleGenerateCharacters, critical: true, timeout: 900000 },
      { step: 'factions', name: '势力设定', handler: handleGenerateFactions, critical: false, timeout: 300000 },
      { step: 'relationships', name: '人物关系图谱', handler: handleGenerateRelationships, critical: false, timeout: 300000 },
      { step: 'synopsis', name: '简介卖点', handler: handleGenerateSynopsis, critical: true, timeout: 300000 },
      { step: 'outline', name: '整体故事大纲', handler: handleGenerateOutline, critical: true, timeout: 1140000 },
      { step: 'keyPlots', name: '关键剧情节点', handler: handleGenerateKeyPlots, critical: true, timeout: 900000 },
      { step: 'chapters', name: '分卷章节划分', handler: handleGenerateChapters, critical: true, timeout: 600000 },
      // 🔥 P2.12.2 修复：流程二不再跳过正文生成，调用 handleStartGenerating(true)（autoMode=true 不切换 step）
      { step: 'generating', name: '逐章生成正文', handler: function() { return handleStartGenerating(true) }, critical: false, timeout: 0 },
    ]

    var failed = false
    for (var i = 0; i < steps.length; i++) {
      if (failed) break
      var s = steps[i]
      genDebounceRef.current = 0

      // 🔥 2026-08-27 修复：为所有规划步骤增加自动重试（最多2次），应对免费模型偶发空结果/瞬时限流/网络抖动；
      //    正文生成步（generating）自管分批，保持单次。仅关键步骤在重试仍失败时中断整条流，非关键步骤失败则继续。
      var _maxAttempts = s.step === 'generating' ? 1 : 2
      var _stepOk = false
      for (var _attempt = 1; _attempt <= _maxAttempts && !_stepOk; _attempt++) {
        try {
          // 🔥 效率优化v2：合并进度和日志更新为单次setState调用
          // 同时更新步骤指示器，减少React渲染次数
          var _logMsg = (_attempt === 1 ? '⏳ ' : '🔄 ') + s.name + (_attempt === 1 ? ' 生成中...' : ' 重试中（第' + _attempt + '/' + _maxAttempts + '次）...')
          var _newStep = s.step !== 'generating' ? s.step : undefined
          // 单次setState更新进度+日志，避免多次渲染
          setAutoGenProgress({ current: i + 1, total: steps.length, step: s.name })
          setAutoGenLog(function (prev) { return [...prev, _logMsg] })
          if (_newStep) {
            try { setStep(_newStep as Step) } catch (_e) { /* 忽略 */ }
          }

          // 🔥 效率优化v2：使用步骤级配置的超时，不再统一600秒
          var _stepTimeout = s.timeout ?? (s.step === 'generating' ? 0 : 180000)
          var _stepPromise = Promise.resolve(s.handler())
          if (_stepTimeout > 0) {
            await Promise.race([
              _stepPromise,
              new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error('步骤「' + s.name + '」超时')) }, _stepTimeout)
              })
            ])
          } else {
            await _stepPromise
          }

          // 步骤完成：从缓存读取数据并同步到ref
          if (s.step !== 'input' && s.step !== 'generating' && s.step !== 'cover' && s.step !== 'complete' && s.step !== 'finalCheck') {
            var cachedData = getCurrentStepSnapshot(s.step as any)
            if (cachedData) {
              var _updatedData = { ...generatedDataRef.current, [s.step]: cachedData }
              generatedDataRef.current = _updatedData
              // 仅更新一次state，配合日志更新
              setGeneratedData(_updatedData)
            }
            // 🔥 2026-08-27 修复（BUG-005/006）：免费模型偶发返回"空结果"（characters 全空串、relationships 空对象），
            //    各 handleGenerateXxx 检测到空只 showErrorAlert(自动流中被抑制)后 return，不抛异常 → 被当作成功带病进入后续环节。
            //    这里统一在循环内判定：规划步若结果为空则抛异常，交由重试逻辑再跑一次。
            if (isEmptyResult(cachedData, s.step)) {
              throw new Error('步骤「' + s.name + '」返回空结果（模型输出为空，将重试）')
            }
          }

          // 🔥 效率优化v2：成功时合并日志更新，同时减少延迟到100ms
          setAutoGenLog(function (prev) {
            var next = [...prev]
            next[next.length - 1] = '✅ ' + s.name + ' 完成'
            return next
          })
          _stepOk = true
          // 🔥 2026-09-03 #120：每完成一步即把进度落盘（novel 状态 + settings 全量数据），
          //    中断后可从书架「草稿箱」点击该作品直接续创作。
          try { await persistDraftProgress() } catch (_pErr) { console.warn('[Draft] #120 步骤落盘失败:', _pErr) }
          // 步骤间极短延迟，给API一点喘息时间但不影响体验
          if (s.step !== 'generating') {
            await new Promise(function (r) { return setTimeout(r, 100) })
          }
        } catch (err) {
          console.error('[AutoGen] attempt ' + _attempt + '/' + _maxAttempts + ' failed at step:', s.name, err)
          var _willRetry = _attempt < _maxAttempts
          setAutoGenLog(function (prev) {
            var next = [...prev]
            next[next.length - 1] = '❌ ' + s.name + ' 失败' + (_willRetry ? '（准备重试）' : '')
            return next
          })
          if (_willRetry) {
            // 重试前短暂等待，让限流窗口恢复
            await new Promise(function (r) { return setTimeout(r, 3000) })
          } else if (s.critical) {
            failed = true
            showErrorAlert(err, '自动生成在「' + s.name + '」环节失败（已重试' + _maxAttempts + '次）')
            // 🔥 2026-09-03 #120：关键步骤失败中断前，先把已完成进度落盘进草稿箱
            try { await persistDraftProgress() } catch (_pErr) { console.warn('[Draft] #120 失败落盘异常:', _pErr) }
          } else {
            console.warn('[AutoGen] 非关键步骤「' + s.name + '」失败，继续后续步骤')
            try { await persistDraftProgress() } catch (_pErr) { /* 落盘失败不影响后续步骤 */ }
            // 非关键步骤失败也短暂延迟后继续
            await new Promise(function (r) { return setTimeout(r, 100) })
          }
        }
      }
    }

    if (!failed) {
      setAutoGenLog(function (prev) { return [...prev, '🎉 全部11个环节生成完成（含逐章生成正文）！'] })
      // 🔥 BUG修复：自动生成流程完成后自动调用封面生成API，避免封面背景不显示
      try {
        setAutoGenLog(function (prev) { return [...prev, '⏳ 制作小说封面 生成中...'] })
        var _coverLatestData = generatedDataRef.current
        var _coverIdea: any = _coverLatestData?.idea || {}
        var _coverSynopsis: any = _coverLatestData?.synopsis || {}
        var _coverWb: any = _coverLatestData?.worldbuilding || {}
        var _coverChars: any = _coverLatestData?.characters || {}
        var _coverPs: any = _coverLatestData?.powerSystem || {}
        var _coverGenre = genre || ''
        var _coverTitle = _coverIdea.title || '未命名小说'
        var _coverAuthor = localStorage.getItem('tuzhong-author-name') || '佚名'
        var _coverEra = _coverWb.era || ''
        var _coverProtagonist = _coverChars.protagonist?.name || ''
        var _coverOneLine = _coverSynopsis.oneLineIntro || _coverIdea.hook || ''
        // 🔥 修复：移除硬编码题材→风格/配色映射，改为基于本作前序设定动态构建封面描述
        // 从前序设定中提取核心视觉要素，让后端 LLM 基于这些要素动态推导配色与风格
        var _coverParts: string[] = []
        _coverParts.push('Chinese web novel cover art')
        // 题材仅作背景信息，不绑定固定风格
        if (_coverGenre) _coverParts.push('genre: ' + _coverGenre)
        // 时代背景（来自 worldbuilding.era）
        if (_coverEra) _coverParts.push('era setting: ' + _coverEra)
        // 主角信息（来自 characters.protagonist）
        if (_coverProtagonist) _coverParts.push('featuring protagonist "' + _coverProtagonist + '"')
        // 主角外貌特征（来自 characters.protagonist.appearance/signatureItem）
        var _protAppe = _coverChars.protagonist?.appearance || ''
        var _protSig = _coverChars.protagonist?.signatureItem || _coverChars.protagonist?.signature || ''
        if (_protAppe) _coverParts.push('protagonist appearance: ' + _protAppe)
        if (_protSig) _coverParts.push('signature item: ' + _protSig)
        // 世界观地理环境（来自 worldbuilding.geography/location）
        var _wbGeo = _coverWb.geography || _coverWb.location || _coverWb.background || ''
        if (_wbGeo) _coverParts.push('world setting: ' + _wbGeo)
        // 世界观氛围（来自 worldbuilding.atmosphere）
        var _wbAtm = _coverWb.atmosphere || _coverWb.tone || ''
        if (_wbAtm) _coverParts.push('atmosphere: ' + _wbAtm)
        // 力量体系核心元素（来自 powerSystem.coreElement/name）
        var _psCore = _coverPs.coreElement || _coverPs.name || _coverPs.description || ''
        if (_psCore) _coverParts.push('power system element: ' + _psCore)
        // 一句话简介（来自 synopsis.oneLineIntro）
        if (_coverOneLine) _coverParts.push('one-line intro: ' + _coverOneLine)
        // 🔥 2026-08-27 #1 封面规则优化：不强制出现人物，按本作设定与主题风格设计（场景/象征/环境构图优先，人物仅在想服务主题时可选）
        _coverParts.push('cover concept driven by this novel\'s own worldbuilding and theme (genre/era/geography/atmosphere/power-system), overall art style must match the story\'s subject; composition may be a scene or symbolic/environmental focus (e.g. starship, wasteland city, cosmic vista, ancient artifact, cultivation realm) rather than a required character; a central figure is optional and only when it serves the theme')
        _coverParts.push('title "' + _coverTitle + '" in bold Chinese calligraphy, high quality digital painting, cohesive color palette matching the theme, professional book cover design, trending on Tomato Novel platform, dramatic lighting, masterpiece, 8k resolution')
        var _coverPrompt = _coverParts.join(', ')
        // 🔥 修复：将前序设定数据一并传给后端，让 LLM 基于本作前序设定动态推导配色与风格
        var _coverRes = await fetch('/tuzhong-wenshu/api/generate-cover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: _coverPrompt,
            title: _coverTitle,
            author: _coverAuthor,
            genre: _coverGenre,
            width: 600,
            height: 800,
            previousData: {
              idea: _coverIdea,
              synopsis: _coverSynopsis,
              worldbuilding: _coverWb,
              characters: _coverChars,
              powerSystem: _coverPs,
              // 🔥 P1 修复：传递拆书结果，确保封面风格贴合目标作品题材
              bookAnalysis: _coverLatestData?.bookAnalysis,
            },
          }),
        })
        if (_coverRes.ok) {
          var _coverJson = await _coverRes.json()
          if (_coverJson.coverUrl) {
            // 更新generatedData中的coverUrl
            setGeneratedData(function (prev: any) {
              var _updated = { ...prev, coverUrl: _coverJson.coverUrl }
              generatedDataRef.current = _updated
              return _updated
            })
            setAutoGenLog(function (prev) { return [...prev, '✅ 制作小说封面 完成'] })
          } else {
            setAutoGenLog(function (prev) { return [...prev, '⚠️ 制作小说封面 失败：' + (_coverJson.error || '未知错误')] })
          }
        } else {
          setAutoGenLog(function (prev) { return [...prev, '⚠️ 制作小说封面 失败：API返回错误'] })
        }
      } catch (_coverErr: any) {
        console.warn('[AutoGen] 封面自动生成失败:', _coverErr)
        setAutoGenLog(function (prev) { return [...prev, '⚠️ 制作小说封面 失败，可手动重试'] })
      }
      // 🔥 自动跳转到封面制作环节（效率优化：延迟从1000ms减到300ms）
      setTimeout(function() {
        setStep('cover')
      }, 300)
    } else {
      // 🔥 2026-09-03 #120：流程中断时兜底落盘 + 明确告知用户进度已存草稿箱
      try { await persistDraftProgress() } catch (_pErr) { console.warn('[Draft] #120 中断兜底落盘异常:', _pErr) }
      setAutoGenLog(function (prev) { return [...prev, '💾 流程中断：已生成的进度已存入草稿箱，可到作品书架「草稿箱」继续创作'] })
    }
    _autoGenInProgress = false // 🔥 重置标志，恢复正常 alert 行为
    setAutoGenRunning(false)
  }

  var handleStepBack = function() {
    var currentIdx = stepKeysByOrder.indexOf(step)
    if (currentIdx <= 0) return
    // 🔥 Bug修复：返回上一步时重置loading状态，避免一直显示"生成中"
    setIsLoading(false)
    setStep(stepKeysByOrder[currentIdx - 1] as Step)
  }

  var handleComplete = function() {
    try {
      setIsCompleting(true)
      // 🔥 Bug修复：使用 generatedDataRef.current 获取最新数据，避免 React 闭包陷阱
      var _latestData = generatedDataRef.current
      var novelData = {
        title: _latestData.idea?.title || '未命名小说',
        genre,
        keywords,
        idea: _latestData.idea,
        worldbuilding: _latestData.worldbuilding,
        powerSystem: _latestData.powerSystem,
        characters: _latestData.characters,
        factions: _latestData.factions,
        relationships: _latestData.relationships,
        outline: _latestData.outline,
        keyPlots: _latestData.keyPlots,
        chapters: _latestData.chapters,
        synopsis: _latestData.synopsis,
        coverUrl: _latestData.coverUrl,
        createdAt: new Date().toISOString(),
      }

      // If an external onComplete handler is provided, use it (e.g., for server-side API persistence)
      if (onComplete) {
        var genContent = _latestData.chapters?.generatedContent || []
        var chaptersData = genContent.length > 0 ? genContent : (generatedChapters.length > 0 ? generatedChapters : [])
        var volumesData = _latestData.chapters?.volumes || []
        // 🔥 2026-08-27 修复(#6)：简介优先取完整长简介，避免书架只显示一句话 shortIntro
        var _syn = _latestData.synopsis || {}
        var description = _syn.longIntro || _syn.fullIntro || _syn.synopsis || _syn.shortIntro || _syn.oneLineIntro || ''

        // 🔥 2026-08-27 修复(#2)：保存前以 characters.protagonist.name 为唯一权威主角名，回写 idea 并全字段深度替换，确保成品一致
        try {
          var _canonProto = String((_latestData.characters && _latestData.characters.protagonist && _latestData.characters.protagonist.name) || '').trim()
          if (_canonProto.length >= 2) {
            var _oldProto = String((_latestData.idea && _latestData.idea.protagonistName) || '').trim()
            var _reps: string[] = []
            if (_oldProto && _oldProto !== _canonProto && _oldProto.length >= 2) _reps.push(_oldProto)
            var _deepRepl = function (node: any): any {
              if (typeof node === 'string') { var s = node; for (var ri = 0; ri < _reps.length; ri++) s = s.split(_reps[ri]).join(_canonProto); return s }
              if (Array.isArray(node)) return node.map(_deepRepl)
              if (node && typeof node === 'object') { var o: any = {}; for (var k in node) o[k] = _deepRepl(node[k]); return o }
              return node
            }
            if (_reps.length > 0) {
              _latestData = { ..._latestData }
              ;['idea', 'synopsis', 'outline', 'keyPlots', 'chapters'].forEach(function (fk) { if ((_latestData as any)[fk]) (_latestData as any)[fk] = _deepRepl((_latestData as any)[fk]) })
              description = _deepRepl(description)
            }
            if ((_latestData as any).idea) (_latestData as any).idea = { ...(_latestData as any).idea, protagonistName: _canonProto }
            generatedDataRef.current = _latestData
          }
        } catch (_nameErr) { /* never throw */ }

        // 🔥 2026-08-27 #3：若已有草稿小说，则 PUT 更新（补封面/简介），不重复创建
        var _existingDraft = localStorage.getItem('tuzhong-active-novel-id')
        if (_existingDraft && _existingDraft !== 'temp' && String(_existingDraft).length > 8) {
          try {
            fetch('/tuzhong-wenshu/api/novels', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
              body: JSON.stringify({ id: _existingDraft, cover: _latestData.coverUrl || undefined, description: description, status: 'writing' }),
            }).catch(function () {})
          } catch (e) {}
          try {
            if (_latestData.coverUrl) {
              fetch('/tuzhong-wenshu/api/novels/upload-cover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
                body: JSON.stringify({ novelId: _existingDraft, coverUrl: _latestData.coverUrl }),
              }).catch(function () {})
            }
          } catch (e) {}
          window.location.href = '/tuzhong-wenshu/'
          return
        }

        onComplete(
          {
            title: novelData.title,
            description: description,
            genre: genre,
            chapters: chaptersData,
            volumes: volumesData,
          },
          _latestData
        )
        return
      }

      var existingNovels = JSON.parse(localStorage.getItem('tuzhong-novels') || '[]')
      existingNovels.unshift(novelData)
      localStorage.setItem('tuzhong-novels', JSON.stringify(existingNovels))
      localStorage.setItem('tuzhong-active-novel-id', novelData.title)
      // 废弃 /write 写作中心，改为返回书架主页
      window.location.href = '/tuzhong-wenshu/'
    } catch (e) {
      console.error('[Complete] Error:', e)
    } finally {
      setIsCompleting(false)
    }
  }

  var handleRegenerateCharactersAll = async function() {
    if (isGeneratingCharacters) return
    // 🔥 2026-09-01 第17轮：改用分批快出路径，使「重新生成全部」同样尊重当前人物阵容模式（CHAR_ROSTER_PRESETS）。
    //   原 handleRegenerate('characters','all') 走老单次调用，不会把预设 needs 传给后端，无法按单/双/后宫阵容产出。
    // 🔥 2026-11-07 修复（线上「重新生成」点击无反应）：显式重生成必须 force，绕过「已有角色则跳过」守卫
    await handleGenerateCharacters(undefined, { force: true })
  }

  var componentCreateEmptyCharacter = function(roleType: string): any {
    return { name: '', role: roleType, identity: '', age: 0, gender: '', appearance: '', personality: '', background: '', motivation: '', skills: [], weaknesses: '', growthArc: '', hiddenTraits: '', coreMotivation: '', _needsRefine: false }
  }
  var createEmptyCharacter = componentCreateEmptyCharacter

  var componentGenerateChaptersFromConfig = async function() {
    // 🔥🔥🔥 关键修复：双重锁（ref + window），在任何await之前设置，防止重复调用穿透
    var _winLock = typeof window !== 'undefined' && (window as any).__chapterConfigGenLock
    if (chapterConfigGenLockRef.current || _winLock) {
      console.log('[GenerateFromConfig] 🔥 已有章节配置生成任务在执行中，跳过 (ref=' + chapterConfigGenLockRef.current + ', win=' + _winLock + ')')
      return
    }
    chapterConfigGenLockRef.current = true
    if (typeof window !== 'undefined') (window as any).__chapterConfigGenLock = true
    console.log('[GenerateFromConfig] 🔥 已设置章节配置生成锁 (ref + window)')
    try {
    // 🔥 修复：先确保卷框架存在，再生成章节详情
    var _latestData = generatedDataRef.current
    var existingVolumes = _latestData.chapters?.volumes || []
    if (existingVolumes.length === 0) {
      genDebounceRef.current = 0
      await handleGenerateChapters()
      _latestData = generatedDataRef.current
      existingVolumes = _latestData.chapters?.volumes || []
    }
    // 🔥🔥🔥 Bug#11④ 修复（第2-10卷永远 0 章、点多少次「按此配置生成章节」都补不出来）：
    //   根因——卷框架（volumes）存在但后续卷的 chapters 数组为空，而 executeChapterGeneration 的
    //   批次循环 `for (batch = 0; batch < volChapters.length; ...)` 只遍历「已存在的章节」，
    //   空数组 ⇒ 零批次 ⇒ 这些卷永远生成不出章节；且 existingVolumes.length > 0 导致
    //   handleGenerateChapters（唯一会建骨架的地方）不会被调用，形成死锁。
    //   修复：此处按统一配置为「章节数不足」的卷补齐空骨架（只增不删，绝不动已有章节）。
    var _perVol = (volumeConfig && volumeConfig.chaptersPerVolume) || 0
    if (!(_perVol > 0)) {
      _perVol = existingVolumes.reduce(function (m, v) { return Math.max(m, (v && Array.isArray(v.chapters)) ? v.chapters.length : 0) }, 0) || 60
    }
    var _hydrated = false
    existingVolumes.forEach(function (_v, _vi) {
      if (!_v) return
      if (!Array.isArray(_v.chapters)) _v.chapters = []
      if (_v.chapters.length >= _perVol) return
      for (var _ci = _v.chapters.length; _ci < _perVol; _ci++) {
        var _cnum = _vi * _perVol + _ci + 1
        _v.chapters.push({
          id: 'ch-v' + (_vi + 1) + '-c' + _cnum + '-' + Date.now() + '-' + _ci,
          title: '第' + _cnum + '章',
          summary: '',
          shuangPoints: [],
          hook: '',
          volume: _vi + 1,
          chapterNumber: _cnum,
          number: _cnum,
          wordCount: 3000,
          status: 'pending',
        })
      }
      _hydrated = true
    })
    if (_hydrated) {
      var _hydSnap = {
        volumes: existingVolumes.slice(),
        chapters: existingVolumes.flatMap(function (v) { return v.chapters || [] }),
        chapterCount: existingVolumes.reduce(function (s, v) { return s + ((v && v.chapters) ? v.chapters.length : 0) }, 0),
        totalWordCount: existingVolumes.reduce(function (s, v) { return s + ((v && v.chapters) ? v.chapters.length : 0) * 3000 }, 0),
      }
      setGeneratedData(function (prev) { var _u = { ...prev, chapters: _hydSnap }; generatedDataRef.current = _u; return _u })
      _latestData = generatedDataRef.current
      existingVolumes = (_latestData.chapters && _latestData.chapters.volumes) || []
      console.log('[GenerateFromConfig] 🔥 Bug#11④ 已补齐缺失的卷章节骨架（每卷 ' + _perVol + ' 章），现总计 ' + _hydSnap.chapterCount + ' 章')
    }

    // 🔥🔥🔥 问题6修复：如果用户修改了卷数配置，必须重新初始化卷框架（基于keyPlots重新分配）
    // 根因：handleVolumeConfigChange已经调整了volumes数组长度，但卷标题/摘要可能使用占位符
    // 必须重新调用handleInitChaptersFrame，让keyPlots节点均匀分配到新卷中
    if (userModifiedVolumeConfig && existingVolumes.length > 0) {
      console.log('[GenerateFromConfig] 🔥 用户修改了卷数配置(' + existingVolumes.length + '卷→' + volumeConfig.volumeCount + '卷)，重新初始化卷框架以同步keyPlots分配')
      await handleInitChaptersFrame()
      // 重新读取数据
      _latestData = generatedDataRef.current
      existingVolumes = _latestData.chapters?.volumes || []
      // 🔥🔥🔥 重置userModifiedVolumeConfig标志，避免重复初始化
      setUserModifiedVolumeConfig(false)
    }
    // 🔥🔥🔥 Bug修复：检测是否需要增量生成（只生成pending/空summary的章节）
    var _allChs = existingVolumes.flatMap(function(v: any) { return v.chapters || []; })
    var _pendingChs = _allChs.filter(function(c: any) { return c.status === 'pending' || !c.summary || c.summary.trim().length < 5; })
    var _completedChs = _allChs.filter(function(c: any) { return c.status !== 'pending' && c.summary && c.summary.trim().length >= 5; })
    console.log('[GenerateFromConfig] 增量检测: 已完成' + _completedChs.length + '章, 待生成' + _pendingChs.length + '章')
    // 如果有待生成的章节，使用executeChapterGeneration（它会自动跳过已有summary的章节）
    genDebounceRef.current = 0
    await executeChapterGeneration()
    } catch (err) {
      console.error('[GenerateFromConfig] Error:', err)
    } finally {
      chapterConfigGenLockRef.current = false
      if (typeof window !== 'undefined') (window as any).__chapterConfigGenLock = false
      console.log('[GenerateFromConfig] 🔥 已释放章节配置生成锁 (ref + window)')
    }
  }
  var generateChaptersFromConfig = componentGenerateChaptersFromConfig

  var isThisRegenerating = regeneratingField === null

  var containerClass = embedded
    ? "rounded-2xl shadow-xl w-full flex flex-col min-h-[600px] min-w-0 overflow-hidden"
    : "fixed inset-0 bg-black/50 flex items-center justify-center z-50"

  var innerContainerClass = embedded
    ? "rounded-2xl shadow-2xl w-full flex flex-col min-w-0"
    : "rounded-2xl shadow-2xl w-[95vw] h-[90vh] max-w-6xl flex flex-col"

  // 文枢墨韵配色（统一纸张色 + 墨黑 + 朱砂）
  var _wenshuBgStyle = { background: '#faf7f2' } as React.CSSProperties

  return (
    <div className={containerClass}>
      {!embedded && (
        <div className={innerContainerClass}>
          <div className="flex items-center justify-between px-6 py-3 wenshu-top-bar rounded-t-2xl">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold">{getCurrentStepLabel()}</h2>
              {/* 🔥 2026-09-02 修复图二：草稿箱·断点续创作按钮，点击打开草稿箱列出所有进行中的草稿 */}
              <button
                onClick={function () { setDraftsIndex(filterInProgressDrafts(readLocalDraftsIndex())); mergeServerDraftsIntoIndex(); setShowDraftBox(true) }}
                className="text-sm text-white/90 bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg flex items-center gap-1 transition-colors font-semibold"
                title="草稿箱：所有未完成的创作都在这里，点开即可从中断步骤继续往下创作"
              >
                <span>📋</span><span>草稿箱</span>
                {draftsIndex.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(255,255,255,0.25)' }}>{draftsIndex.length}</span>}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={function () { setShowModelSelector(!showModelSelector) }}
                  className="text-sm text-white/90 bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg flex items-center gap-1 transition-colors font-semibold"
                  title={manualModel ? '当前为手动模式，每环节都使用此模型' : '当前为智能推荐模式，每环节自动选择最适合模型'}
                >
                  {getHeaderModelText()}
                  <span className="ml-1">▼</span>
                </button>
                {showModelSelector && availableModels.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-72 rounded-lg shadow-xl overflow-hidden z-50 max-h-60 overflow-y-auto wenshu-card">
                    <button
                      onClick={function () {
                        setManualModel(false)
                        setLlmConfig(null)
                        try { localStorage.removeItem('tuzhong-llm-config') } catch (e) {}
                        setShowModelSelector(false)
                      }}
                      className={'w-full text-left px-3 py-2 text-sm border-b ' + (!manualModel ? 'font-medium' : 'hover:bg-stone-50')}
                      style={!manualModel
                        ? { background: 'rgba(200, 54, 77, 0.08)', color: '#c8364d', borderColor: '#e7e1d8' }
                        : { background: '#ffffff', color: '#3d3d3d', borderColor: '#f0ebe2' }}
                    >
                      <div>🤖 智能推荐（每环节自动选择最佳模型）</div>
                    </button>
                  </div>
                )}
              </div>
              {onClose && (
                <button onClick={onClose} className="text-base font-semibold opacity-90 hover:opacity-100 transition-opacity">✕</button>
              )}
            </div>
          </div>

          {/* 🔥 全流程环节图：两行渲染（前7个创作阶段一行，后7个生成阶段一行） */}
          <div className="wenshu-step-nav select-none step-nav-scroll">
            <div className="flex flex-wrap items-center w-full px-4 py-3">
              {steps.map(function(s, idx) {
                var isCurrent = s.key === step
                var isCompleted = hasStepData(s.key)
                var isPending = !isCurrent && !isCompleted
                var IconComp = s.icon
                var shortLabel = s.key === 'idea' ? '灵感创作' : s.key === 'synopsis' ? '简介卖点' : s.key === 'finalCheck' ? '避坑检查' : s.label
                var btnCls = 'inline-flex flex-col items-center gap-1 transition-all duration-200 px-2 py-1.5 rounded flex-shrink-0 min-w-0 '
                if (isCurrent) {
                  btnCls += 'wenshu-step-current '
                } else if (isCompleted) {
                  btnCls += 'wenshu-step-done hover:bg-stone-100 cursor-pointer font-medium '
                } else {
                  btnCls += 'wenshu-step-btn cursor-default '
                }
                return (
                  <Fragment key={s.key}>
                    <div className="flex items-center flex-1 justify-center min-w-0">
                      <button
                        onClick={function() { if (isCompleted) setStep(s.key as Step) }}
                        disabled={isPending}
                        title={isPending ? '请先完成前置环节' : isCompleted ? '点击查看「' + shortLabel + '」' : '当前环节'}
                        className={btnCls}
                      >
                        <IconComp className="w-5 h-5 flex-shrink-0" />
                        <span className="text-xs whitespace-nowrap leading-none mt-0.5 font-medium">{shortLabel}</span>
                        {getStepModelLabel(s.key) ? (
                          <span className={'text-[9px] leading-none whitespace-nowrap mt-0.5 ' + ((stepModels[s.key] && stepModels[s.key].model) ? 'text-amber-600' : 'text-emerald-600')} title={(stepModels[s.key] && stepModels[s.key].provider ? stepModels[s.key].provider + ' ' : '') + getStepModelLabel(s.key)}>
                            {getStepModelLabel(s.key)}
                          </span>
                        ) : null}
                      </button>
                      {idx < steps.length - 1 && (
                        <ChevronRight className="w-4 h-4 wenshu-step-arrow flex-shrink-0" strokeWidth={1.5} />
                      )}
                    </div>
                    {/* 第7个环节（关系图谱）后强制换行，形成两行 */}
                    {idx === 6 && <div className="w-full basis-full h-0" />}
                  </Fragment>
                )
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {/* 🔥 2026-09-07（#147）主题变更守卫横幅：主体区域常显（草稿箱 Modal 关闭后也能看到） */}
            {themeGuardMsg && (
              <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-300" role="alert">
                {themeGuardMsg}
              </div>
            )}
            {/* 🔥 第二期·一键自动生成进度面板 */}
            {autoGenRunning && (
              <div className="mb-6 bg-gradient-to-r from-stone-50 to-stone-50 rounded-xl p-5 border border-stone-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-stone-900 flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-stone-800" />
                    自动生成中...（{autoGenProgress.current}/{autoGenProgress.total}）
                  </h3>
                  <span className="text-sm font-medium" style={{ color: '#c8364d' }}>
                    当前：{autoGenProgress.step}
                  </span>
                </div>
                {/* 进度条 */}
                <div className="w-full bg-stone-200 rounded-full h-3 mb-3">
                  <div
                    className="bg-gradient-to-r from-stone-400 to-stone-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: Math.round((autoGenProgress.current / autoGenProgress.total) * 100) + '%' }}
                  />
                </div>
                {/* 日志区 */}
                <div className="wenshu-autogen-log rounded-lg p-3 max-h-40 overflow-y-auto">
                  <div className="text-xs font-mono space-y-1">
                    {autoGenLog.map(function (log, i) {
                      return (
                        <div key={i} className={log.includes('✅') ? 'text-green-700' : log.includes('❌') ? 'text-red-700' : log.includes('🎉') ? 'font-bold' : ''} style={log.includes('🎉') ? { color: '#c8364d' } : !log.includes('✅') && !log.includes('❌') ? { color: '#6b6b6b' } : undefined}>
                          {log}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {/* 🔥 第14轮：角色分批进度横幅 — 用户在 powerSystem / characters 步首屏看到「5/20 已出，剩余 3 批每 30s 一组」 */}
            {charBatchUi.phase !== 'idle' && (
              <div className="px-6 pt-4">
                <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm" data-testid="char-batch-progress">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r wenshu-stripe"></div>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      {charBatchUi.phase === 'core' && (
                        <>
                          <div className="text-sm font-medium text-stone-800">⚡ 首批 5 名核心角色生成中</div>
                          <div className="text-xs text-stone-500 mt-0.5">目标 30 秒内可见，硬阈值 44 秒（涵盖跨题材清洗、prompt 拼装）</div>
                        </>
                      )}
                      {charBatchUi.phase === 'supplement' && (
                        <>
                          <div className="text-sm font-medium text-stone-800">✅ 首批 5 人已出 · 补充批 {charBatchUi.currentBatch}/{charBatchUi.targetBatch} 即将跑（已出 {charBatchUi.completed}/{charBatchUi.total}）</div>
                          <div className="text-xs text-stone-500 mt-0.5">每批间隔 30 秒、约 5 人，2 分钟内补全 20 人；期间可正常编辑已显示的角色</div>
                          <div className="w-full bg-stone-200 rounded-full h-1.5 mt-2 overflow-hidden">
                            <div className="bg-gradient-to-r wenshu-stripe h-1.5 rounded-full transition-all duration-500"
                              style={{ width: Math.round((charBatchUi.completed / charBatchUi.total) * 100) + '%' }} />
                          </div>
                        </>
                      )}
                      {charBatchUi.phase === 'done' && (
                        <>
                          <div className="text-sm font-medium text-green-700">🎉 全部 {charBatchUi.total} 名角色已落地</div>
                          <div className="text-xs text-stone-500 mt-0.5">可以开始后续「势力」「关系图谱」等环节</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step === 'input' && (
              <Suspense fallback={suspenseFallback}>
                <StepInputDirect
                  keywords={keywords} setKeywords={setKeywords}
                  detailedDesignInput={detailedDesignInput} setDetailedDesignInput={setDetailedDesignInput}
                  genre={genre} setGenre={setGenre} genres={genres}
                  creationMode={creationMode} setCreationMode={setCreationMode}
                  imitateMode={imitateMode} setImitateMode={setImitateMode}
                  imitateSearch={imitateSearch} setImitateSearch={setImitateSearch}
                  imitateResult={imitateResult} setImitateResult={setImitateResult}
                  imitateLoading={imitateLoading} setImitateLoading={setImitateLoading}
                  imitateEditing={imitateEditing} setImitateEditing={setImitateEditing}
                  imitateSearchPhase={imitateSearchPhase} setImitateSearchPhase={setImitateSearchPhase}
                  imitateData={imitateData} setImitateData={setImitateData}
                  protagonistName={protagonistName} setProtagonistName={setProtagonistName} userBookTitle={userBookTitle} setUserBookTitle={setUserBookTitle}
                  protagonistGender={protagonistGender} setProtagonistGender={setProtagonistGender}
                  protagonistAge={protagonistAge} setProtagonistAge={setProtagonistAge}
                  protagonistIdentity={protagonistIdentity} setProtagonistIdentity={setProtagonistIdentity}
                  nameLoading={nameLoading} onGenerateName={handleGenerateProtagonistName}
                  protagonistDesignLoading={protagonistDesignLoading} onAutoDesignProtagonist={handleAutoDesignProtagonist}
                  bookAnalysisMode={bookAnalysisMode} setBookAnalysisMode={setBookAnalysisMode}
                  bookAnalysisJson={bookAnalysisJson} setBookAnalysisJson={setBookAnalysisJson}
                  bookAnalysisResult={bookAnalysisResult} setBookAnalysisResult={setBookAnalysisResult}
                  bookAnalysisLoading={bookAnalysisLoading} setBookAnalysisLoading={setBookAnalysisLoading}
                  onImportBookAnalysis={handleImportBookAnalysis}
                  autoBookName={autoBookName} setAutoBookName={setAutoBookName}
                  autoBookLoading={autoBookLoading} onAutoBookAnalysis={handleAutoBookAnalysis}
                  onGenerate={handleNextStep}
                  onImitateSearch={handleImitateSearch}
                  isLoading={isLoading}
                />
              </Suspense>
            )}
            {step === 'idea' && (
              <Suspense fallback={suspenseFallback}>
                <StepIdea data={generatedData.idea} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, idea: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="idea" />
              </Suspense>
            )}
            {step === 'worldbuilding' && (
              <Suspense fallback={suspenseFallback}>
                <StepWorldbuilding data={generatedData.worldbuilding} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, worldbuilding: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="worldbuilding" />
              </Suspense>
            )}
            {(step === 'powerSystem' || step === 'characters') && renderRosterSelector()}
            {step === 'powerSystem' && (
              <Suspense fallback={suspenseFallback}>
                <StepPowerSystem data={generatedData.powerSystem} worldbuildingText={typeof (generatedData.worldbuilding?.powerSystem) === 'string' ? (generatedData.worldbuilding.powerSystem as string) : ''} onChange={function (updated) { setGeneratedData(function (prev) { var next = { ...prev, powerSystem: updated }; generatedDataRef.current = next; return next }) }} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="powerSystem" />
              </Suspense>
            )}
            {step === 'characters' && (
              <FieldRegenBar step="characters" fields={[{ key: 'protagonist', label: '主角' }, { key: 'femaleLead', label: '女主' }, { key: 'antagonists', label: '反派' }, { key: 'supporting', label: '配角' }]} />
            )}
            {step === 'characters' && (
              <Suspense fallback={suspenseFallback}>
                <StepCharacters detailedDesignInput={detailedDesignInput} genre={genre} keywords={keywords} data={generatedData.characters} onChange={function (updated) { 
                  setGeneratedData(function (prev) { 
                    var next = { ...prev, characters: updated }
                    // 🔥 主角名字全流程同步：用户修改主角名字时，全流程替换所有相关字段
                    if (updated?.protagonist?.name && next.idea) {
                      var protoName = String(updated.protagonist.name).trim()
                      var oldProtoName = String((prev.idea as any)?.protagonistName || '').trim()
                      if (protoName && protoName.length >= 2 && protoName !== oldProtoName) {
                        // 1. 同步更新idea.protagonistName
                        var newIdea: any = { ...next.idea, protagonistName: protoName }
                        
                        // 2. 替换idea.tagline中的旧主角名字（一句话简介）
                        if (oldProtoName && newIdea.tagline && typeof newIdea.tagline === 'string') {
                          var oldTagline = newIdea.tagline
                          var newTagline = oldTagline.split(oldProtoName).join(protoName)
                          if (newTagline !== oldTagline) {
                            newIdea.tagline = newTagline
                            console.log('[StepCharacters onChange] 同步替换idea.tagline主角名:', oldProtoName, '→', protoName)
                          }
                        }
                        
                        // 3. 替换idea.hook中的旧主角名字
                        if (oldProtoName && newIdea.hook && typeof newIdea.hook === 'string') {
                          var oldHook = newIdea.hook
                          var newHook = oldHook.split(oldProtoName).join(protoName)
                          if (newHook !== oldHook) {
                            newIdea.hook = newHook
                          }
                        }
                        
                        next.idea = newIdea
                        
                        // 4. 替换synopsis中的旧主角名字（简短简介、完整简介、卖点）
                        if (oldProtoName && next.synopsis && typeof next.synopsis === 'object') {
                          var newSynopsis: any = { ...next.synopsis }
                          var synChanged = false
                          
                          // 简短简介
                          if (newSynopsis.shortIntro && typeof newSynopsis.shortIntro === 'string') {
                            var oldSI = newSynopsis.shortIntro
                            var newSI = oldSI.split(oldProtoName).join(protoName)
                            if (newSI !== oldSI) {
                              newSynopsis.shortIntro = newSI
                              synChanged = true
                            }
                          }
                          if (newSynopsis.oneLineIntro && typeof newSynopsis.oneLineIntro === 'string') {
                            var oldOLI = newSynopsis.oneLineIntro
                            var newOLI = oldOLI.split(oldProtoName).join(protoName)
                            if (newOLI !== oldOLI) {
                              newSynopsis.oneLineIntro = newOLI
                              synChanged = true
                            }
                          }
                          // 完整简介
                          if (newSynopsis.fullIntro && typeof newSynopsis.fullIntro === 'string') {
                            var oldFI = newSynopsis.fullIntro
                            var newFI = oldFI.split(oldProtoName).join(protoName)
                            if (newFI !== oldFI) {
                              newSynopsis.fullIntro = newFI
                              synChanged = true
                            }
                          }
                          if (newSynopsis.synopsis && typeof newSynopsis.synopsis === 'string') {
                            var oldSyn = newSynopsis.synopsis
                            var newSyn = oldSyn.split(oldProtoName).join(protoName)
                            if (newSyn !== oldSyn) {
                              newSynopsis.synopsis = newSyn
                              synChanged = true
                            }
                          }
                          // 核心卖点数组
                          if (Array.isArray(newSynopsis.sellingPoints)) {
                            newSynopsis.sellingPoints = newSynopsis.sellingPoints.map(function(sp: string) {
                              if (typeof sp === 'string') {
                                return sp.split(oldProtoName).join(protoName)
                              }
                              return sp
                            })
                            synChanged = true
                          }
                          // coreSellingPoint字符串
                          if (newSynopsis.coreSellingPoint && typeof newSynopsis.coreSellingPoint === 'string') {
                            newSynopsis.coreSellingPoint = newSynopsis.coreSellingPoint.split(oldProtoName).join(protoName)
                            synChanged = true
                          }
                          
                          if (synChanged) {
                            next.synopsis = newSynopsis
                            console.log('[StepCharacters onChange] 同步替换synopsis主角名:', oldProtoName, '→', protoName)
                          }
                        }
                        
                        console.log('[StepCharacters onChange] 全流程同步主角名字:', oldProtoName, '→', protoName)
                      }
                    }
                    generatedDataRef.current = next
                    return next
                  })
                  // 🔥 修复3：characters 变更立即落盘，防止服务端权威覆盖把校正结果打回
                  persistCharactersChange(updated)
                }} onRegenerate={handleRegenerate} onGenerate={handleNextStep} onRegenerateAll={handleRegenerateCharactersAll} isLoading={isLoading} isGenerating={isGeneratingCharacters} genProgress={charGenProgress} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="characters" createEmptyCharacter={createEmptyCharacter} appendRoleInput={appendRoleInput} setAppendRoleInput={setAppendRoleInput} />
              </Suspense>
            )}
            {step === 'factions' && (
              <FieldRegenBar step="factions" fields={[{ key: 'factions', label: '势力列表' }]} />
            )}
            {step === 'factions' && (
              <Suspense fallback={suspenseFallback}>
                <StepFactions genre={genre} keywords={keywords} data={generatedData.factions} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, factions: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="factions" />
              </Suspense>
            )}
            {step === 'relationships' && (
              <FieldRegenBar step="relationships" fields={[{ key: 'relationships', label: '人物关系' }]} />
            )}
            {step === 'relationships' && (
              <Suspense fallback={suspenseFallback}>
                <StepRelationships data={generatedData.relationships} characters={generatedData.characters} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, relationships: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleGenerateRelationships} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="relationships" appendGraphInput={appendGraphInput} setAppendGraphInput={setAppendGraphInput} />
              </Suspense>
            )}
            {step === 'synopsis' && (
              <Suspense fallback={suspenseFallback}>
                <StepSynopsis data={generatedData.synopsis} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, synopsis: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="synopsis" />
              </Suspense>
            )}
            {step === 'outline' && (
              <Suspense fallback={suspenseFallback}>
                <StepOutline data={generatedData.outline} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, outline: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="outline" />
              </Suspense>
            )}
            {step === 'keyPlots' && (
              <FieldRegenBar step="keyPlots" fields={[{ key: 'turningPoints', label: '关键转折点' }, { key: 'climax', label: '高潮' }, { key: 'ending', label: '结局' }]} />
            )}
            {step === 'keyPlots' && (
              <Suspense fallback={suspenseFallback}>
                <StepKeyPlots data={generatedData.keyPlots} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, keyPlots: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="keyPlots" />
              </Suspense>
            )}
            {step === 'chapters' && (
              <Suspense fallback={suspenseFallback}>
                <StepChapters data={generatedData.chapters} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, chapters: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleGenerateChapters} onGenerateFromConfig={generateChaptersFromConfig} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="chapters" volumeConfig={volumeConfig} onVolumeConfigChange={handleVolumeConfigChange} chapterLoadingProgress={chapterLoadingProgress as any} />
              </Suspense>
            )}
            {step === 'generating' && (
              <Suspense fallback={suspenseFallback}>
                <StepGenerating currentChapterIndex={currentChapterIndex} progress={progress} generatedChaptersCount={generatedChapters.filter(function (gc: any) { return gc?.content; }).length || (generatedData.chapters?.generatedContent?.filter(function (gc: any) { return gc?.content; }).length || 0)} generatedChapters={generatedChapters.length > 0 ? generatedChapters : (generatedData.chapters?.generatedContent || [])} totalChapters={generatedData.chapters?.volumes?.flatMap(function (v: any) { return v.chapters || []; }).length || generatedData.chapters?.chapters?.length || 0} volumes={generatedData.chapters?.volumes} genStatus={genStatus} genStats={genStats} genConcurrency={genConcurrency} genFailedList={genFailedList} onPause={handlePauseGen} onResume={handleResumeGen} onCancel={handleCancelGen} onRetryFailed={handleRetryFailed} onStartGen={function() { if (genStatus === 'running' || genStatus === 'paused') return; handleStartGenerating(false) }} genTargetWordCount={genTargetWordCount} genStyle={genStyle} genNewCharacters={genNewCharacters} genBatchLimit={genBatchLimit} onGenBatchLimitChange={handleGenBatchLimitChange} onGenConfigChange={handleGenConfigChange} onChapterContentChange={handleChapterContentEdit} />
              </Suspense>
            )}
            {step === 'finalCheck' && (
              <Suspense fallback={suspenseFallback}>
                <StepFinalCheck result={finalCheckResult} loading={finalCheckLoading} onCheck={handleFinalCheck} onPolish={handlePolish} onRetry={handleFinalCheck} generatedData={generatedData} onRepairAll={handleRepairAll} repairState={repairState ?? undefined} />
              </Suspense>
            )}
            {step === 'cover' && (
              <Suspense fallback={suspenseFallback}>
                <StepCover data={generatedData as any} generatedData={generatedData} onCoverGenerated={function (url: string) { setGeneratedData(function(prev: any) { return { ...prev, coverUrl: url || prev.coverUrl } }); localStorage.setItem('tuzhong-author-name', (document.querySelector('input[placeholder="输入作者名"]') as HTMLInputElement)?.value || '') }} isLoading={isLoading} setIsLoading={setIsLoading} />
              </Suspense>
            )}
            {step === 'complete' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-stone-800 mb-2">小说创作完成！</h2>
                  <p className="text-stone-500">你的小说已成功创建，可在「我的作品」中查看</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t px-8 py-4 flex items-center justify-between bg-white rounded-b-2xl">
            {step !== 'input' && step !== 'complete' && (
              <button onClick={handleStepBack} className="flex items-center space-x-2 px-6 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors text-sm">
                <ChevronLeft className="w-4 h-4" /><span>上一步</span>
              </button>
            )}
            {step === 'input' && <div />}
            {step === 'input' && (
              <div className="flex items-center gap-3">
                <button onClick={handleAutoGenerateAll} disabled={autoGenRunning || (!keywords.trim() && !bookAnalysisResult)} className="flex items-center space-x-2 px-6 py-2 wenshu-btn-primary rounded-lg text-sm">
                  {autoGenRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}<span>一键生成</span>
                </button>
                <button onClick={handleGenerateIdea} disabled={!keywords.trim() || isLoading || autoGenRunning} className="flex items-center space-x-2 px-6 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}<span>开始生成</span>
                </button>
              </div>
            )}
            {step !== 'input' && step !== 'complete' && (
              <div className="flex items-center gap-3">
                {step === 'cover' && (
                  <button onClick={handleFinalCheck} disabled={finalCheckLoading} className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-stone-800 to-stone-700 text-white rounded-lg hover:from-stone-800 hover:to-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                    {finalCheckLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}<span>爆款终检</span>
                  </button>
                )}
                {step === 'finalCheck' ? (
                  <button onClick={handleNextStep} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors text-sm bg-stone-700 text-white hover:bg-stone-700`}>
                    <ChevronRight className="w-4 h-4" /><span>制作封面</span>
                  </button>
                ) : step === 'generating' ? (
                  <button onClick={handleNextStep} disabled={genStatus === 'running'} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm bg-stone-700 text-white hover:bg-stone-700`}>
                    {genStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}<span>爆款终检</span>
                  </button>
                ) : step === 'cover' ? (
                  <button onClick={handleNextStep} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors text-sm bg-stone-700 text-white hover:bg-stone-700`}>
                    <ChevronRight className="w-4 h-4" /><span>完成</span>
                  </button>
                ) : (
                  <button onClick={handleNextStep} disabled={isLoading} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm ${step === 'synopsis' ? 'bg-gradient-to-r from-stone-700 to-stone-800 text-white hover:from-stone-700 hover:to-stone-800' : 'bg-stone-700 text-white hover:bg-stone-700'}`}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}<span>{getNextStepLabel()}</span>
                  </button>
                )}
              </div>
            )}
            {step === 'complete' && (
              <button onClick={handleComplete} disabled={isCompleting || isLoading || isCreating} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors text-sm ${isCompleting || isLoading || isCreating ? 'bg-stone-400 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {isCompleting || isCreating ? (<><Loader2 className="w-4 h-4 animate-spin" /><span>保存中...</span></>) : (<><BookCopy className="w-4 h-4" /><span>创建小说</span></>)}
              </button>
            )}
          </div>
        </div>
      )}

      {embedded && (
        <div className={innerContainerClass}>
          <div className="wenshu-top-bar select-none rounded-t-2xl">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                {onClose && (
                  <button onClick={onClose} className="text-sm font-medium wenshu-model-btn px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    ← <span>返回书架</span>
                  </button>
                )}
                <h2 className="text-sm font-semibold font-serif-wenshu tracking-wide wenshu-model-btn px-3 py-1.5 rounded-lg">{getCurrentStepLabel()}</h2>
                {/* 🔥 2026-09-02 修复图二：草稿箱·断点续创作按钮（embedded 模式） */}
                <button
                  onClick={function () { setDraftsIndex(filterInProgressDrafts(readLocalDraftsIndex())); mergeServerDraftsIntoIndex(); setShowDraftBox(true) }}
                  className="text-sm font-medium wenshu-model-btn px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                  title="草稿箱：所有未完成的创作都在这里，点开即可从中断步骤继续往下创作"
                >
                  <span>📋</span><span>草稿箱</span>
                  {draftsIndex.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(200, 54, 77, 0.15)' }}>{draftsIndex.length}</span>}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button onClick={function () { setShowModelSelector(!showModelSelector) }} className="text-sm text-white/90 bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg flex items-center gap-1 transition-colors font-semibold"
                    title={manualModel ? '当前为手动模式，每环节都使用此模型' : '当前为智能推荐模式，每环节自动选择最适合模型'}>
                    {getHeaderModelText()}<span className="ml-1">▼</span>
                  </button>
                  {showModelSelector && availableModels.length > 0 && (
                    <div className="absolute top-full right-0 mt-1 w-72 rounded-lg shadow-xl overflow-hidden z-50 max-h-60 overflow-y-auto wenshu-card">
                      <button
                        onClick={function () {
                          setManualModel(false)
                          setLlmConfig(null)
                          try { localStorage.removeItem('tuzhong-llm-config') } catch (e) {}
                          setShowModelSelector(false)
                        }}
                        className={'w-full text-left px-3 py-2 text-sm border-b ' + (!manualModel ? 'font-medium' : 'hover:bg-stone-50')}
                        style={!manualModel
                          ? { background: 'rgba(200, 54, 77, 0.08)', color: '#c8364d', borderColor: '#e7e1d8' }
                          : { background: '#ffffff', color: '#3d3d3d', borderColor: '#f0ebe2' }}
                      >
                        <div>🤖 智能推荐（每环节自动选择最佳模型）</div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="step-nav-scroll px-3 pb-2 pt-2 wenshu-step-nav flex flex-col" ref={stepNavRef}>
              {[steps.slice(0, 7), steps.slice(7)].map(function(row, rowIdx) {
                return (
                  <div key={'step-row-' + rowIdx} className="flex flex-1 items-center w-full">
                    {row.map(function(s, idx) {
                      var isCurrent = s.key === step
                      var isCompleted = hasStepData(s.key)
                      var isPending = !isCurrent && !isCompleted
                      var IconComp = s.icon
                      var globalIdx = rowIdx * 7 + idx
                      var shortLabel = s.key === 'idea' ? '灵感创作' : s.key === 'synopsis' ? '简介卖点' : s.key === 'finalCheck' ? '避坑检查' : s.label
                      var btnCls = 'inline-flex flex-col items-center gap-1 transition-all duration-200 px-2 py-1.5 rounded flex-shrink-0 min-w-0 '
                      if (isCurrent) {
                        btnCls += 'wenshu-step-current '
                      } else if (isCompleted) {
                        btnCls += 'wenshu-step-done hover:bg-stone-100 cursor-pointer font-medium '
                      } else {
                        btnCls += 'wenshu-step-btn cursor-default '
                      }
                      return (
                        <div key={s.key} className="flex items-center flex-1 justify-center min-w-0">
                          <button
                            data-step-key={s.key}
                            onClick={function() {
                              if (!isCompleted) return
                              // 🔥 #224 性能修复：全流程节点点击只做「本地跳转」，禁止 await 大体积 settings 保存。
                              //   原实现 await saveSettings(generatedData) 会在跳转前同步等待一次
                              //   POST /api/settings 往返（带 1.45MB 响应，公网实测单次 4~10s），
                              //   导致①点击后长时间无反应、②连点排队后「跳到上一个点过的节点」的错乱、
                              //   ③多次重请求被打断触发 ERR_INCOMPLETE_CHUNKED_ENCODING → 错误页。
                              //   持久化无需在此处兜底：generatedData 变化已有 2s 防抖自动保存（见 auto-save effect），
                              //   字段级修改也各自触发 onChange 落盘，切换步骤不应阻塞在网络上。
                              setStep(s.key as Step)
                            }}
                            disabled={isPending}
                            title={isPending ? '请先完成前置环节' : isCompleted ? '点击查看「' + shortLabel + '」' : '当前环节'}
                            className={btnCls}
                          >
                            <IconComp className="w-5 h-5 flex-shrink-0" />
                            <span className="text-xs whitespace-nowrap leading-none mt-0.5 font-medium">{shortLabel}</span>
                            {getStepModelLabel(s.key) ? (
                              <span className={'text-[9px] leading-none whitespace-nowrap mt-0.5 ' + ((stepModels[s.key] && stepModels[s.key].model) ? 'text-amber-600' : 'text-emerald-600')} title={(stepModels[s.key] && stepModels[s.key].provider ? stepModels[s.key].provider + ' ' : '') + getStepModelLabel(s.key)}>
                                {getStepModelLabel(s.key)}
                              </span>
                            ) : null}
                          </button>
                          {globalIdx < steps.length - 1 && (
                            <ChevronRight className="w-4 h-4 wenshu-step-arrow flex-shrink-0" strokeWidth={1.5} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="p-6 overflow-x-hidden min-w-0">
            {/* 🔥 2026-09-07（#147）主题变更守卫横幅：embedded 树同样常显 */}
            {themeGuardMsg && (
              <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-300" role="alert">
                {themeGuardMsg}
              </div>
            )}
            {step === 'input' && (
              <Suspense fallback={suspenseFallback}>
                <StepInputDirect keywords={keywords} setKeywords={setKeywords} detailedDesignInput={detailedDesignInput} setDetailedDesignInput={setDetailedDesignInput} genre={genre} setGenre={setGenre} genres={genres} creationMode={creationMode} setCreationMode={setCreationMode} imitateMode={imitateMode} setImitateMode={setImitateMode} imitateSearch={imitateSearch} setImitateSearch={setImitateSearch} imitateResult={imitateResult} setImitateResult={setImitateResult} imitateLoading={imitateLoading} setImitateLoading={setImitateLoading} imitateEditing={imitateEditing} setImitateEditing={setImitateEditing} imitateSearchPhase={imitateSearchPhase} setImitateSearchPhase={setImitateSearchPhase} imitateData={imitateData} setImitateData={setImitateData} protagonistName={protagonistName} setProtagonistName={setProtagonistName} userBookTitle={userBookTitle} setUserBookTitle={setUserBookTitle} protagonistGender={protagonistGender} setProtagonistGender={setProtagonistGender} protagonistAge={protagonistAge} setProtagonistAge={setProtagonistAge} protagonistIdentity={protagonistIdentity} setProtagonistIdentity={setProtagonistIdentity} protagonistDesignLoading={protagonistDesignLoading} onAutoDesignProtagonist={handleAutoDesignProtagonist} nameLoading={nameLoading} onGenerateName={handleGenerateProtagonistName} bookAnalysisMode={bookAnalysisMode} setBookAnalysisMode={setBookAnalysisMode} bookAnalysisJson={bookAnalysisJson} setBookAnalysisJson={setBookAnalysisJson} bookAnalysisResult={bookAnalysisResult} setBookAnalysisResult={setBookAnalysisResult} bookAnalysisLoading={bookAnalysisLoading} setBookAnalysisLoading={setBookAnalysisLoading} onImportBookAnalysis={handleImportBookAnalysis} autoBookName={autoBookName} setAutoBookName={setAutoBookName} autoBookLoading={autoBookLoading} onAutoBookAnalysis={handleAutoBookAnalysis} onGenerate={handleNextStep} onImitateSearch={handleImitateSearch} isLoading={isLoading} />
              </Suspense>
            )}
            {step === 'idea' && (<Suspense fallback={suspenseFallback}><StepIdea data={generatedData.idea} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, idea: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="idea" /></Suspense>)}
            {step === 'worldbuilding' && (<Suspense fallback={suspenseFallback}><StepWorldbuilding data={generatedData.worldbuilding} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, worldbuilding: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="worldbuilding" /></Suspense>)}
            {step === 'powerSystem' && (<Suspense fallback={suspenseFallback}><StepPowerSystem data={generatedData.powerSystem} worldbuildingText={typeof (generatedData.worldbuilding?.powerSystem) === 'string' ? (generatedData.worldbuilding.powerSystem as string) : ''} onChange={function (updated) { setGeneratedData(function (prev) { var next = { ...prev, powerSystem: updated }; generatedDataRef.current = next; return next }) }} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="powerSystem" /></Suspense>)}
            {step === 'characters' && (<FieldRegenBar step="characters" fields={[{ key: 'protagonist', label: '主角' }, { key: 'femaleLead', label: '女主' }, { key: 'antagonists', label: '反派' }, { key: 'supporting', label: '配角' }]} />)}
            {step === 'characters' && (<Suspense fallback={suspenseFallback}><StepCharacters detailedDesignInput={detailedDesignInput} genre={genre} keywords={keywords} data={generatedData.characters} showPowerLevel={/修仙|仙侠|洪荒|玄幻|西幻|魔法|科幻|末世|异能|进化|武道/.test((genre || '') + (keywords || ''))} onChange={function (updated) { 
              setGeneratedData(function (prev) { 
                var next = { ...prev, characters: updated }
                if (updated?.protagonist?.name && next.idea) {
                  var protoName = String(updated.protagonist.name).trim()
                  var oldProtoName = String((prev.idea as any)?.protagonistName || '').trim()
                  if (protoName && protoName.length >= 2 && protoName !== oldProtoName) {
                    next.idea = { ...next.idea, protagonistName: protoName }
                  }
                }
                generatedDataRef.current = next
                return next
              })
              // 🔥 修复3：characters 变更立即落盘，防止服务端权威覆盖把校正结果打回
              persistCharactersChange(updated)
            }} onRegenerate={handleRegenerate} onGenerate={handleNextStep} onRegenerateAll={handleRegenerateCharactersAll} isLoading={isLoading} isGenerating={isGeneratingCharacters} genProgress={charGenProgress} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="characters" createEmptyCharacter={createEmptyCharacter} appendRoleInput={appendRoleInput} setAppendRoleInput={setAppendRoleInput} /></Suspense>)}
            {step === 'factions' && (<FieldRegenBar step="factions" fields={[{ key: 'factions', label: '势力列表' }]} />)}
            {step === 'factions' && (<Suspense fallback={suspenseFallback}><StepFactions genre={genre} keywords={keywords} data={generatedData.factions} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, factions: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="factions" /></Suspense>)}
            {step === 'relationships' && (<FieldRegenBar step="relationships" fields={[{ key: 'relationships', label: '人物关系' }]} />)}
            {step === 'relationships' && (<Suspense fallback={suspenseFallback}><StepRelationships data={generatedData.relationships} characters={generatedData.characters} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, relationships: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleGenerateRelationships} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="relationships" appendGraphInput={appendGraphInput} setAppendGraphInput={setAppendGraphInput} /></Suspense>)}
            {step === 'synopsis' && (<Suspense fallback={suspenseFallback}><StepSynopsis data={generatedData.synopsis} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, synopsis: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="synopsis" /></Suspense>)}
            {step === 'outline' && (<Suspense fallback={suspenseFallback}><StepOutline data={generatedData.outline} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, outline: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="outline" /></Suspense>)}
            {step === 'keyPlots' && (<FieldRegenBar step="keyPlots" fields={[{ key: 'turningPoints', label: '关键转折点' }, { key: 'climax', label: '高潮' }, { key: 'ending', label: '结局' }]} />)}
            {step === 'keyPlots' && (<Suspense fallback={suspenseFallback}><StepKeyPlots data={generatedData.keyPlots} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, keyPlots: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleNextStep} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="keyPlots" /></Suspense>)}
            {step === 'chapters' && (<Suspense fallback={suspenseFallback}><StepChapters data={generatedData.chapters} onChange={function (updated) { setGeneratedData(function (prev) { return ({ ...prev, chapters: updated })})}} onRegenerate={handleRegenerate} onGenerate={handleGenerateChapters} onGenerateFromConfig={generateChaptersFromConfig} isLoading={isLoading} regeneratePrompt={regeneratePrompt} setRegeneratePrompt={setRegeneratePrompt} RegenButton={RegenButton} regeneratingField={regeneratingField} stepName="chapters" volumeConfig={volumeConfig} onVolumeConfigChange={handleVolumeConfigChange} chapterLoadingProgress={chapterLoadingProgress as any} /></Suspense>)}
            {step === 'generating' && (<Suspense fallback={suspenseFallback}><StepGenerating currentChapterIndex={currentChapterIndex} progress={progress} generatedChaptersCount={generatedChapters.filter(function (gc: any) { return gc?.content; }).length || (generatedData.chapters?.generatedContent?.filter(function (gc: any) { return gc?.content; }).length || 0)} generatedChapters={generatedChapters.length > 0 ? generatedChapters : (generatedData.chapters?.generatedContent || [])} totalChapters={generatedData.chapters?.volumes?.flatMap(function (v: any) { return v.chapters || []; }).length || generatedData.chapters?.chapters?.length || 0} volumes={generatedData.chapters?.volumes} genStatus={genStatus} genStats={genStats} genConcurrency={genConcurrency} genFailedList={genFailedList} onPause={handlePauseGen} onResume={handleResumeGen} onCancel={handleCancelGen} onRetryFailed={handleRetryFailed} onStartGen={function() { if (genStatus === 'running' || genStatus === 'paused') return; handleStartGenerating(false) }} genTargetWordCount={genTargetWordCount} genStyle={genStyle} genNewCharacters={genNewCharacters} genBatchLimit={genBatchLimit} onGenBatchLimitChange={handleGenBatchLimitChange} onGenConfigChange={handleGenConfigChange} onChapterContentChange={handleChapterContentEdit} /></Suspense>)}
            {step === 'finalCheck' && (<Suspense fallback={suspenseFallback}><StepFinalCheck result={finalCheckResult} loading={finalCheckLoading} onCheck={handleFinalCheck} onPolish={handlePolish} onRetry={handleFinalCheck} generatedData={generatedData} onRepairAll={handleRepairAll} repairState={repairState ?? undefined} /></Suspense>)}
            {step === 'cover' && (<Suspense fallback={suspenseFallback}><StepCover data={generatedData as any} generatedData={generatedData} onCoverGenerated={function (url: string) { setGeneratedData(function(prev: any) { return { ...prev, coverUrl: url || prev.coverUrl } }); localStorage.setItem('tuzhong-author-name', (document.querySelector('input[placeholder="输入作者名"]') as HTMLInputElement)?.value || '') }} isLoading={isLoading} setIsLoading={setIsLoading} /></Suspense>)}
            {step === 'complete' && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-stone-800 mb-2">小说创作完成！</h2>
                  <p className="text-stone-500">你的小说已成功创建，可在「我的作品」中查看</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-stone-100 px-6 py-4 flex items-center justify-between bg-white/70 backdrop-blur-sm rounded-b-2xl">
            {step !== 'input' && step !== 'complete' && (
              <button onClick={handleStepBack} className="flex items-center space-x-2 px-6 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors text-sm">
                <ChevronLeft className="w-4 h-4" /><span>上一步</span>
              </button>
            )}
            {step === 'input' && <div />}
            {step === 'input' && (
              <div className="flex items-center gap-3">
                <button onClick={handleAutoGenerateAll} disabled={autoGenRunning || (!keywords.trim() && !bookAnalysisResult)} className="flex items-center space-x-2 px-6 py-2 wenshu-btn-primary rounded-lg text-sm">
                  {autoGenRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}<span>一键生成</span>
                </button>
                <button onClick={handleGenerateIdea} disabled={!keywords.trim() || isLoading || autoGenRunning} className="flex items-center space-x-2 px-6 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}<span>开始生成</span>
                </button>
              </div>
            )}
            {step !== 'input' && step !== 'complete' && (
              <div className="flex items-center gap-3">
                {step === 'cover' && (
                  <button onClick={handleFinalCheck} disabled={finalCheckLoading} className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-stone-800 to-stone-700 text-white rounded-lg hover:from-stone-800 hover:to-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                    {finalCheckLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}<span>爆款终检</span>
                  </button>
                )}
                {step === 'finalCheck' ? (
                  <button onClick={handleNextStep} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors text-sm bg-stone-700 text-white hover:bg-stone-700`}>
                    <ChevronRight className="w-4 h-4" /><span>制作封面</span>
                  </button>
                ) : step === 'generating' ? (
                  <button onClick={handleNextStep} disabled={genStatus === 'running'} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm bg-stone-700 text-white hover:bg-stone-700`}>
                    {genStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}<span>爆款终检</span>
                  </button>
                ) : step === 'cover' ? (
                  <button onClick={handleNextStep} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors text-sm bg-stone-700 text-white hover:bg-stone-700`}>
                    <ChevronRight className="w-4 h-4" /><span>完成</span>
                  </button>
                ) : (
                  <button onClick={handleNextStep} disabled={isLoading} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm ${step === 'synopsis' ? 'bg-gradient-to-r from-stone-700 to-stone-800 text-white hover:from-stone-700 hover:to-stone-800' : 'bg-stone-700 text-white hover:bg-stone-700'}`}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}<span>{getNextStepLabel()}</span>
                  </button>
                )}
              </div>
            )}
            {step === 'complete' && (
              <button onClick={handleComplete} disabled={isCompleting || isLoading || isCreating} className={`flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors text-sm ${isCompleting || isLoading || isCreating ? 'bg-stone-400 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {isCompleting || isCreating ? (<><Loader2 className="w-4 h-4 animate-spin" /><span>保存中...</span></>) : (<><BookCopy className="w-4 h-4" /><span>创建小说</span></>)}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 📋 草稿箱 Modal */}
      {showDraftBox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={function () { setShowDraftBox(false) }}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-stone-200" onClick={function (e: any) { e.stopPropagation() }}>
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-stone-800">📋 草稿箱</h3>
              <button onClick={function () { setShowDraftBox(false) }} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800" aria-label="关闭">
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
            <div className="px-6 py-4">
              {draftBoxMsg ? (
                <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 ring-1 ring-amber-200">{draftBoxMsg}</div>
              ) : null}
              {draftsIndex.length === 0 ? (
                <div className="py-12 text-center text-stone-400">暂无进行中的草稿</div>
              ) : (
                <ul className="space-y-3">
                  {draftsIndex.map(function (d: any) {
                    var _found: any = steps.find(function (s: any) { return s.key === d.lastStep })
                    var _stepLabel = (_found && _found.label) || d.lastStep || '未知'
                    return (
                      <li key={d.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-stone-800">{d.title || '（未命名草稿）'}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-stone-500">
                            <span className="rounded bg-stone-200 px-2 py-0.5">步骤：{_stepLabel}</span>
                            {d.genre ? <span className="rounded bg-stone-200 px-2 py-0.5">题材：{String(d.genre)}</span> : null}
                            <span className="rounded bg-stone-200 px-2 py-0.5">更新：{d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : '—'}</span>
                          </div>
                        </div>
                        <div className="ml-3 flex shrink-0 items-center gap-2">
                          <button onClick={function () { openDraft(d) }} className="rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800">打开</button>
                          <button onClick={function () { deleteDraft(d) }} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-100" aria-label="删除草稿">🗑</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-stone-200 px-6 py-3 text-xs text-stone-400">
              点开草稿将从对应环节继续创作；草稿已与服务端同步，换浏览器、换设备都能续写，删除也会与书架草稿箱同步。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}