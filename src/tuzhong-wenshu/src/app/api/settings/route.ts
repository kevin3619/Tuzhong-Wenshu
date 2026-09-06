import { NextResponse, NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { isAdminOnlyNovel, getRequestActor, loadNovelMetaOrNull } from '@/lib/permissions'

const dataDir = path.join(process.cwd(), '.tuzhong-data')

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const settingsFile = path.join(dataDir, 'settings.json')

// 读取设定数据
function readSettings() {
  if (!fs.existsSync(settingsFile)) {
    return {}
  }
  try {
    const data = fs.readFileSync(settingsFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

// 写入设定数据
function writeSettings(data: Record<string, unknown>) {
  fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2), 'utf-8')
}

async function checkNovelAccess(request: Request | NextRequest, novelId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const actor = await getRequestActor(request)
  if (actor.isAdmin) return { ok: true }
  if (isAdminOnlyNovel(String(novelId))) return { ok: false, status: 403, error: '无权访问此作品设定' }
  const meta = loadNovelMetaOrNull(String(novelId))
  if (!meta) return { ok: false, status: 404, error: '作品不存在' }
  if (!actor.userId) return { ok: false, status: 401, error: '请先登录' }
  if (meta.userId && String(meta.userId) !== String(actor.userId)) return { ok: false, status: 403, error: '无权访问此作品设定' }
  return { ok: true }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')

  const allSettings = readSettings()

  if (novelId) {
    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
    }
    // 返回特定作品的设定
    const data = allSettings[novelId] || {}

    // 🔥🔥 先保留世界设定对象快照 {worldMap,powerSystem,...}，避免后续被转换为数组后丢失
    const snapshotWSO: Record<string, any> =
      (!Array.isArray(data.worldSettings) && data.worldSettings && typeof data.worldSettings === 'object')
        ? JSON.parse(JSON.stringify(data.worldSettings)) : {}

    // 自动从AI生成数据派生 worldSettings（如果用户未手动添加，或者是旧对象格式 {worldMap,powerSystem...} 未转换为数组格式）
    const isWSPopulatedArray = Array.isArray(data.worldSettings) && data.worldSettings.length > 0
    if (!isWSPopulatedArray) {
      const derivedWS: Record<string, unknown>[] = []
      const _today = new Date().toISOString().split('T')[0]
      if (data.worldbuilding) {
        const wb = data.worldbuilding
        if (wb.era) derivedWS.push({ id: 'wb-era', name: '时代背景', category: '历史', description: wb.era, createdAt: _today, novelId })
        if (wb.geography) derivedWS.push({ id: 'wb-geo', name: '地理环境', category: '地理', description: wb.geography, createdAt: _today, novelId })
        if (wb.history) derivedWS.push({ id: 'wb-his', name: '历史背景', category: '历史', description: wb.history, createdAt: _today, novelId })
        if (wb.powerSystem) derivedWS.push({ id: 'wb-ps', name: '力量体系', category: '力量体系', description: wb.powerSystem, createdAt: _today, novelId })
        if (wb.socialStructure) derivedWS.push({ id: 'wb-ss', name: '社会结构', category: '规则设定', description: wb.socialStructure, createdAt: _today, novelId })
        if (wb.technology) derivedWS.push({ id: 'wb-tech', name: '科技工艺', category: '物品道具', description: wb.technology, createdAt: _today, novelId })
        if (wb.culturalFeatures) derivedWS.push({ id: 'wb-cul', name: '文化风俗', category: '历史', description: wb.culturalFeatures, createdAt: _today, novelId })
        if (wb.secretHistory) derivedWS.push({ id: 'wb-secret', name: '隐秘历史', category: '历史', description: wb.secretHistory, createdAt: _today, novelId })
        if (wb.coreSettings) derivedWS.push({ id: 'wb-core', name: '核心设定', category: '规则设定', description: wb.coreSettings, createdAt: _today, novelId })
        if (wb.rules) derivedWS.push({ id: 'wb-rules-main', name: '世界规则', category: '规则设定', description: typeof wb.rules === 'string' ? wb.rules : (Array.isArray(wb.rules) ? wb.rules.join('；') : ''), createdAt: _today, novelId })
        if (Array.isArray(wb.rules)) wb.rules.forEach(function(rule: string, i: number) {
          if (i > 0) derivedWS.push({ id: 'wb-rule-' + i, name: '规则' + (i + 1), category: '规则设定', description: rule, createdAt: _today, novelId })
        })
      }
      if (data.powerSystem) {
        const wps = data.powerSystem
        if (wps.worldPowerSystem) {
          derivedWS.push({ id: 'ps-main', name: wps.worldPowerSystem.name || '世界力量体系', category: '力量体系', description: wps.worldPowerSystem.description || JSON.stringify(wps.worldPowerSystem), createdAt: _today, novelId })
        }
        // 主角能力/金手指作为物品道具或力量体系
        if (wps.protagonistAbility || wps.protagonistAbilities) {
          const _abList = wps.protagonistAbilities || (wps.protagonistAbility ? [wps.protagonistAbility] : [])
          if (Array.isArray(_abList)) _abList.forEach(function(ab, i: number) {
            if (!ab || typeof ab !== 'object') return
            const _abName = ab.name || ('主角能力' + (i + 1))
            const _abDesc = ab.description || ab.effect || ''
            let _abCat = '力量体系'
            // 戒指/剑/刀/鼎/塔/珠/镜/符/印 等实物归物品道具
            if (/戒|剑|刀|鼎|塔|珠|镜|符|印|枪|弓|甲|衣|盘|书|卷|壶|钟/.test(_abName)) _abCat = '物品道具'
            derivedWS.push({ id: 'ps-ab-' + i, name: _abName, category: _abCat, description: _abDesc, createdAt: _today, novelId })
          })
        }
      }
      if (data.factions && Array.isArray(data.factions.factions)) {
        data.factions.factions.forEach(function(f: any, i: number) {
          derivedWS.push({ id: 'fac-' + i, name: f.name, category: '组织势力', description: f.description || (f.leader ? '首领：' + f.leader : ''), createdAt: _today, novelId })
        })
      }
      // 🔥 种族生物：从人物/主角背景/技能/世界观/势力中提取种族、魔兽、血脉信息
      const _creatureSet: Record<string, string> = {}
      function addCreature(name: string, desc: string) {
        if (!name || name.length < 2) return
        if (!_creatureSet[name]) _creatureSet[name] = desc || name
      }
      if (data.characters) {
        const _chars = data.characters
        let _allCharList: Record<string, unknown>[] = []
        if (_chars.protagonist) _allCharList.push(_chars.protagonist)
        if (Array.isArray(_chars.femaleLeads)) _allCharList = _allCharList.concat(_chars.femaleLeads)
        if (_chars.femaleLead) _allCharList.push(_chars.femaleLead)
        if (Array.isArray(_chars.antagonists)) _allCharList = _allCharList.concat(_chars.antagonists)
        if (_chars.antagonist) _allCharList.push(_chars.antagonist)
        if (Array.isArray(_chars.supporting)) _allCharList = _allCharList.concat(_chars.supporting)
        _allCharList.forEach(function(c) {
          if (!c) return
          const _cText = [c.identity, c.background, c.appearance, c.personality, c.skills ? (c.skills as string[]).join('；') : ''].filter(Boolean).join('|')
          // 提取种族/生命形态：兼顾奇幻与科幻（星际/基因进化）
          const _raceMatches = _cText.match(/(机械族|硅基生命|碳基生命|虫族|星兽|异兽|基因兽|智慧种族|外星文明|机械神教|AI生命|能量生命|龙血战士|终极战士|魔法师|骑士|圣域强者|精灵|矮人|龙族|兽人|魔族|神族|血族|妖精|魔兽|神兽|圣兽|巨龙|亡灵|巫妖|天使|恶魔|半神|巨人|泰坦)/g)
          if (_raceMatches) _raceMatches.forEach(function(r: string) { addCreature(r, '作品中出现的种族/生命形态：' + r) })
        })
      }
      // 从worldbuilding补充种族
      if (data.worldbuilding) {
        const _wbRaceField = data.worldbuilding.raceSystem || data.worldbuilding.races || data.worldbuilding.species || ''
        const _wbText = [data.worldbuilding.era, data.worldbuilding.geography, data.worldbuilding.history, data.worldbuilding.powerSystem, data.worldbuilding.culturalFeatures, data.worldbuilding.secretHistory, data.worldbuilding.coreSettings, (typeof _wbRaceField === 'string' ? _wbRaceField : JSON.stringify(_wbRaceField))].filter(Boolean).join('|')
        const _wbRaceMatches = _wbText.match(/(机械族|硅基生命|硅基文明|碳基生命|虫族|星兽|异兽|基因兽|智慧种族|智慧文明|外星文明|外星种族|神秘文明|星际文明|机械神教|AI生命|能量生命|异族|龙血战士|精灵|矮人|龙族|兽人|魔族|神族|血族|妖精|魔兽|神兽|圣兽|巨龙|亡灵|巫妖|恶魔|天使|人鱼|海族|巨人|泰坦|半身人|侏儒)/g)
        if (_wbRaceMatches) _wbRaceMatches.forEach(function(r: string) { addCreature(r, '世界观中记载的种族/生命形态：' + r) })
      }
      // 从 factions 补充（外星势力常含种族属性）
      if (data.factions && Array.isArray(data.factions.factions)) {
        data.factions.factions.forEach(function(f: any) {
          if (!f || !f.name) return
          const _ft = [f.name, f.type, f.description].filter(Boolean).join('|')
          const _fr = _ft.match(/(机械族|硅基生命|碳基生命|虫族|星兽|异兽|基因兽|智慧种族|外星文明|机械神教|AI生命|能量生命|魔族|神族|血族|龙族|兽人)/g)
          if (_fr) _fr.forEach(function(r: string) { addCreature(r, (f.description || ('势力【' + f.name + '】关联的种族/生命形态')) .slice(0, 120)) })
        })
      }
      Object.keys(_creatureSet).forEach(function(cName, i) {
        derivedWS.push({ id: 'race-' + i, name: cName, category: '种族生物', description: _creatureSet[cName], createdAt: _today, novelId })
      })
      // 🔥🔥 追加：从世界设定对象格式 {worldMap, powerSystem, cultivationMethods...} 也转成数组条目
      if (!Array.isArray(data.worldSettings) && data.worldSettings && typeof data.worldSettings === 'object') {
        const wso: Record<string, any> = data.worldSettings as any
        // worldMap -> 地理
        if (typeof wso.worldMap === 'string' && wso.worldMap.length > 5) {
          derivedWS.push({ id: 'wsobj-worldMap', name: '世界地图/架构', category: '地理', description: wso.worldMap, createdAt: _today, novelId })
        }
        // powerSystem (worldSettings对象下) -> 力量体系
        if (typeof wso.powerSystem === 'string' && wso.powerSystem.length > 5) {
          derivedWS.push({ id: 'wsobj-powerSystem', name: '力量修炼体系', category: '力量体系', description: wso.powerSystem, createdAt: _today, novelId })
        }
        if (typeof wso.cultivationMethods === 'string' && wso.cultivationMethods.length > 5) {
          derivedWS.push({ id: 'wsobj-cultivationMethods', name: '修炼功法品阶', category: '力量体系', description: wso.cultivationMethods, createdAt: _today, novelId })
        }
        if (typeof wso.forcesFactions === 'string' && wso.forcesFactions.length > 5) {
          derivedWS.push({ id: 'wsobj-forcesFactions', name: '势力组织总览', category: '组织势力', description: wso.forcesFactions, createdAt: _today, novelId })
        }
        if (typeof wso.geographyRegions === 'string' && wso.geographyRegions.length > 5) {
          derivedWS.push({ id: 'wsobj-geographyRegions', name: '地理区域划分', category: '地理', description: wso.geographyRegions, createdAt: _today, novelId })
        }
        if (typeof wso.historicalEvents === 'string' && wso.historicalEvents.length > 5) {
          derivedWS.push({ id: 'wsobj-historicalEvents', name: '世界重大历史', category: '历史', description: wso.historicalEvents, createdAt: _today, novelId })
        }
      }
      data.worldSettings = derivedWS
    }

    // 自动从keyPlots/outline派生 timelineEvents（如果用户未手动添加）
    if (!data.timelineEvents || data.timelineEvents.length === 0) {
      const derivedTL: Record<string, unknown>[] = []
      let chapterCounter = 0
      // 🔥🔥 新增：从 plotOutline (stage1~stage4) 派生 timelineEvents（数据迁移产生的字段）
      if (data.plotOutline && typeof data.plotOutline === 'object' && !data.keyPlots?.volumes?.length && !data.outline?.stages?.length) {
        const stageKeys = ['stage1', 'stage2', 'stage3', 'stage4'].filter(function (sk) { return !!data.plotOutline[sk] })
        const DEFAULT_WC = ['15万', '40万', '80万', '100万']
        stageKeys.forEach(function (sk, si) {
          const stg: any = data.plotOutline[sk]
          if (!stg) return
          const sTitle = stg.title || ('第' + (si + 1) + '阶段')
          const sSummary = stg.summary || ''
          const keyEvents: string[] = Array.isArray(stg.keyEvents) ? stg.keyEvents : []
          const wcStr = (stg.expectedWordCount || DEFAULT_WC[si] || '20万').toString()
          const wcMatch = wcStr.match(/(\d+)/)
          // 粗略估算：1万字约3章
          let volChapters = wcMatch ? Math.max(Math.round(parseInt(wcMatch[1]) / 3), 5) : 15
          derivedTL.push({
            id: 'po-vol-' + si,
            chapter: chapterCounter + 1,
            title: sTitle,
            description: sSummary,
            isMainline: true,
          })
          if (keyEvents.length > 0) {
            keyEvents.forEach(function (evt: string, ei: number) {
              derivedTL.push({
                id: 'po-' + si + '-' + ei,
                chapter: chapterCounter + Math.ceil((ei + 1) * volChapters / (keyEvents.length + 1)),
                title: sTitle + '·事件' + (ei + 1),
                description: evt,
                isMainline: true,
              })
            })
          }
          chapterCounter += volChapters
        })
      }
      if (data.keyPlots) {
        const kp = data.keyPlots
        var _stripVolPrefix = function (nm: string) { return String(nm || '').replace(/^第[一二三四五六七八九十百千零\d]+卷[·:：\s]*/, '').trim() }
        var _nodeChapter = function (n: any): number { var m = String(n && n.chapterRange || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : 0 }
        // 预计算每卷最小章号 + 全局最大章号
        var _volMinChap: Record<number, number> = {}
        var _maxChap = 0
        if (Array.isArray(kp.keyPlots)) {
          kp.keyPlots.forEach(function (n: any) {
            var ch = _nodeChapter(n); var vn = n.volume || 1
            if (ch > 0) { if (_volMinChap[vn] == null || ch < _volMinChap[vn]) _volMinChap[vn] = ch; if (ch > _maxChap) _maxChap = ch }
          })
        }
        if (_maxChap === 0) _maxChap = 30
        // 卷头：去重复前缀，章号取该卷首个节点章号（无节点则按卷序估算）
        if (Array.isArray(kp.volumes)) {
          kp.volumes.forEach(function (v: any, vi: number) {
            if (v.summary || v.name) {
              var _vch = _volMinChap[vi + 1] || Math.max(1, Math.round((vi) * _maxChap / Math.max(kp.volumes.length, 1)) + 1)
              derivedTL.push({
                id: 'kp-vol-' + vi,
                chapter: _vch,
                title: '第' + (vi + 1) + '卷·' + (_stripVolPrefix(v.name || v.title) || ('卷' + (vi + 1))),
                description: v.summary || '',
                isMainline: true,
                isVolumeHeader: true,
              })
            }
          })
        }
        // 事件：用真实关键剧情节点标题 + 节点章号
        if (Array.isArray(kp.keyPlots)) {
          kp.keyPlots.forEach(function (n: any, ni: number) {
            if (!n) return
            var _ntitle = _stripVolPrefix(n.title || '') || ('节点' + (ni + 1))
            var _nch = _nodeChapter(n) || (ni + 1)
            derivedTL.push({ id: 'kp-node-' + ni, chapter: _nch, volume: n.volume || 1, title: _ntitle, description: String(n.summary || n.impact || '').slice(0, 200), isMainline: true })
          })
        }
        if (kp.climax) { derivedTL.push({ id: 'kp-climax', chapter: _maxChap, title: '故事高潮', description: String(kp.climax).slice(0, 200), isMainline: true }) }
        if (kp.ending) { derivedTL.push({ id: 'kp-ending', chapter: _maxChap + 1, title: '结局', description: String(kp.ending).slice(0, 200), isMainline: true }) }
        if (Array.isArray(kp.turningPoints)) {
          kp.turningPoints.forEach(function (tp: any, i: number) {
            const _tpDesc = typeof tp === 'string' ? tp : (tp.description || tp.impact || tp.event || '')
            const _tpName = (typeof tp === 'string') ? String(tp).slice(0, 12) : (tp.name || String(_tpDesc).split(/[，。；]/)[0].slice(0, 12) || ('转折' + (i + 1)))
            derivedTL.push({ id: 'kp-tp-' + i, chapter: Math.max(1, Math.round((i + 1) * _maxChap / (kp.turningPoints.length + 1))), title: _tpName, description: String(_tpDesc).slice(0, 200), isMainline: false })
          })
        }
      }
      // 补充 outline 的 keyEvents（兼容 mainEvent 字符串 和 mainEvents 数组）
      if (data.outline && Array.isArray(data.outline.stages)) {
        data.outline.stages.forEach(function(stg: any, si: number) {
          if (!stg) return
          const stageTitle = stg.name || ('阶段' + (si + 1))
          const stageCh = Math.ceil((si + 1) * Math.max(chapterCounter, 60) / (data.outline.stages.length + 1))
          // 单事件字符串
          if (stg.mainEvent) {
            derivedTL.push({
              id: 'ol-stg-' + si,
              chapter: stageCh,
              title: stageTitle,
              description: stg.mainEvent + (stg.shuangPoint ? '（爽点：' + stg.shuangPoint + '）' : ''),
              isMainline: true,
            })
          }
          // 多事件数组
          if (Array.isArray(stg.mainEvents) && stg.mainEvents.length > 0) {
            stg.mainEvents.forEach(function(evt: string, ei: number) {
              if (!evt || typeof evt !== 'string') return
              derivedTL.push({
                id: 'ol-stg-' + si + '-' + ei,
                chapter: Math.max(1, Math.ceil(stageCh - 30 + (ei + 1) * 60 / (stg.mainEvents.length + 1))),
                title: stageTitle + '·事件' + (ei + 1),
                description: evt + (Array.isArray(stg.shuangPoints) && stg.shuangPoints[ei] ? '（爽点：' + stg.shuangPoints[ei] + '）' : ''),
                isMainline: true,
              })
            })
          }
        })
      }
      data.timelineEvents = derivedTL
    }

    // 自动从keyPlots/outline/idea/factions/relationships 派生 foreshadowings（如果用户未手动添加）
    if (!data.foreshadowings || data.foreshadowings.length === 0) {
      const derivedFS: Record<string, unknown>[] = []
      let _fsCounter = 0
      // 已写章数（用于判定伏笔是否已回收）
      let _writtenChapters = 0
      try {
        if (data.chapters && Array.isArray(data.chapters.generatedContent)) _writtenChapters = data.chapters.generatedContent.filter(function (c: any) { return c && c.content && c.content.length > 50 }).length
        else if (data.chapters && Array.isArray(data.chapters.chapters)) _writtenChapters = data.chapters.chapters.length
      } catch (e) {}
      try {
        if (_writtenChapters === 0) {
          const fs2 = require('fs')
          const path2 = require('path')
          const _chFile = path2.join(process.cwd(), '.tuzhong-data', 'chapters', String(novelId) + '.json')
          if (fs2.existsSync(_chFile)) {
            const _chData = JSON.parse(fs2.readFileSync(_chFile, 'utf-8'))
            const _arr = Array.isArray(_chData) ? _chData : (_chData && _chData.chapters) || []
            _writtenChapters = _arr.filter(function (c: any) { return c && c.content && c.content.length > 50 }).length
          }
        }
      } catch (e) {}
      const _pushFs = function(name: string, content: string, type: string, planted: number, recover: number, importance: number) {
        if (content && content.length > 3) {
          _fsCounter++
          derivedFS.push({
            id: 'fs-' + _fsCounter,
            name: name,
            content: content,
            type: type,
            plantedChapter: planted,
            plannedRecoveryChapter: recover,
            status: (recover > 0 && recover <= _writtenChapters) ? 'recovered' : 'active',
            importance: importance,
          })
        }
      }
      // 🔥 2026-08-27 去模板化：伏笔名/内容只用小说原文短语，不加"势力·/阶段·/关系·/伏笔N"等归类前缀与【】包裹
      var _clause = function (t: string, max: number): string {
        var s = String(t || '').trim().split(/[。！？；，,、]/)[0].trim()
        if (!s) s = String(t || '').trim()
        return s.slice(0, max || 16)
      }
      // 关键剧情转折点
      if (data.keyPlots && Array.isArray(data.keyPlots.turningPoints)) {
        data.keyPlots.turningPoints.forEach(function(tp: any, i: number) {
          const _tpDesc = typeof tp === 'string' ? tp : (tp.event || tp.description || tp.impact || tp.name || '')
          const _tpName = (typeof tp === 'string') ? _clause(tp, 16) : (tp.name || _clause(_tpDesc, 16))
          if (_tpDesc && _tpDesc.length > 3) {
            _pushFs(_tpName, String(_tpDesc).slice(0, 200), i % 3 === 0 ? '主线' : (i % 3 === 1 ? '身份' : '金手指'),
              Math.ceil((i + 1) * 10 / (data.keyPlots.turningPoints.length + 1)),
              Math.ceil((i + 1) * 30 / (data.keyPlots.turningPoints.length + 1)) + 10, 5 - (i % 3))
          }
        })
      }
      // 分卷钩子/核心冲突
      if (data.keyPlots && Array.isArray(data.keyPlots.volumes)) {
        data.keyPlots.volumes.forEach(function(v: any, vi: number) {
          if (v.hook && v.hook.length > 5) {
            _pushFs(_clause(v.hook, 16), String(v.hook).slice(0, 200), '卷末钩子', 1 + vi * 20, (vi + 1) * 20, 4)
          }
          if (v.coreConflict && v.coreConflict.length > 5 && vi === 0) {
            _pushFs(_clause(v.coreConflict, 16), String(v.coreConflict).slice(0, 200), '主线', 1, 50, 5)
          }
        })
      }
      // outline 阶段
      if (data.outline && Array.isArray(data.outline.stages)) {
        data.outline.stages.forEach(function(st: any, i: number) {
          const _stName = st.name || st.stageName || ('第' + (i + 1) + '阶段')
          const _stSummary = st.summary || st.mainEvent || ''
          if (_stSummary && _stSummary.length > 5) {
            _pushFs(String(_stName).slice(0, 16), String(_stSummary).slice(0, 200), '主线',
              1 + i * Math.floor(300 / Math.max(data.outline.stages.length, 1)), 1 + (i + 1) * Math.floor(300 / Math.max(data.outline.stages.length, 1)), 5)
          }
        })
      }
      // 势力
      if (data.factions && Array.isArray(data.factions.factions)) {
        data.factions.factions.slice(0, 8).forEach(function(f: any, i: number) {
          if (!f || !f.name) return
          const _desc = (typeof f.description === 'string' ? f.description : (f.goal || ''))
          const _rel = f.relationToProtagonist || f.attitude || ''
          if (_desc || _rel) {
            _pushFs(String(f.name).slice(0, 16), (String(_desc || '') + (_rel ? ('。与主角：' + _rel) : '')).slice(0, 200), '势力',
              1 + i * 30, 1 + i * 30 + 60, 4)
          }
        })
      }
      // 主角身世
      if (data.characters && data.characters.protagonist) {
        const _protag = data.characters.protagonist
        if (_protag.background && _protag.background.length > 20) {
          _pushFs('主角身世', String(_protag.background).slice(0, 200), '身份', 1, 80, 4)
        }
      }
      if (data.characters && Array.isArray(data.characters.antagonists)) {
        data.characters.antagonists.slice(0, 4).forEach(function(an: any, i: number) {
          if (!an || !an.name) return
          const _threat = an.threat || an.motive || an.background || ''
          if (_threat) { _pushFs(String(an.name).slice(0, 16), String(_threat).slice(0, 200), '反派', 5 + i * 20, 50 + i * 30, 4) }
        })
      }
      if (data.characters && Array.isArray(data.characters.supporting)) {
        data.characters.supporting.slice(0, 6).forEach(function(sp: any, i: number) {
          if (!sp || !sp.name) return
          const _arc = sp.arc || sp.experience || sp.background || ''
          if (_arc) { _pushFs(String(sp.name).slice(0, 16), String(_arc).slice(0, 200), '人物', 10 + i * 25, 70 + i * 25, 3) }
        })
      }
      // 关系反转
      if (data.relationships && Array.isArray(data.relationships.relationships)) {
        data.relationships.relationships.slice(0, 8).forEach(function(r: any, i: number) {
          if (!r) return
          const _desc = r.description || r.dynamics || ''
          const _from = r.from || r.character1 || ''
          const _to = r.to || r.character2 || ''
          if (_desc && _from && _to) {
            _pushFs((_from + '与' + _to).slice(0, 16), String(_desc).slice(0, 200), '关系', 8 + i * 20, 60 + i * 20, 4)
          }
        })
      }
      // 从idea核心卖点/冲突提取
      if (data.idea && data.idea.coreConflict && data.idea.coreConflict.length > 5) {
        _pushFs(_clause(data.idea.coreConflict, 16), String(data.idea.coreConflict).slice(0, 200), '主线', 1, 100, 5)
      }
      data.foreshadowings = derivedFS
    }

    // 🔥 2026-08-27 #3：人物关系为空时，从 characters 派生完整关系（主角↔女主/反派/配角/导师），供图谱渲染
    try {
      const _relEmpty = !data.relationships || (typeof data.relationships === 'object' && Object.keys(data.relationships).length === 0) || (data.relationships && Array.isArray(data.relationships.relationships) && data.relationships.relationships.length === 0)
      if (_relEmpty && data.characters) {
        const c = data.characters
        const proto = c.protagonist && c.protagonist.name ? c.protagonist.name : ''
        const nodesMap: Record<string, any> = {}
        const rels: any[] = []
        const addNode = function (name: string, role: string) { if (name && !nodesMap[name]) nodesMap[name] = { id: name, name: name, role: role || '' } }
        const addRel = function (from: string, to: string, relation: string, desc: string) { if (from && to && from !== to) rels.push({ from: from, to: to, relation: relation || '关联', description: String(desc || '').slice(0, 120) }) }
        addNode(proto, '主角')
        const _fls = Array.isArray(c.femaleLeads) ? c.femaleLeads : (c.femaleLead ? [c.femaleLead] : [])
        _fls.forEach(function (f: any) { if (f && f.name) { addNode(f.name, f.role || '女主'); addRel(proto, f.name, f.relationship || '恋人/女主', f.identity || f.background) } })
        const _ants = Array.isArray(c.antagonists) ? c.antagonists : (c.antagonist ? [c.antagonist] : [])
        _ants.forEach(function (a: any) { if (a && a.name) { addNode(a.name, a.role || '反派'); addRel(proto, a.name, a.relationship || '敌对', a.motive || a.identity || a.background) } })
        ;(Array.isArray(c.supporting) ? c.supporting : []).forEach(function (s: any) { if (s && s.name) { addNode(s.name, s.role || s.identity || '配角'); addRel(proto, s.name, s.relationship || '同伴', s.identity || s.background) } })
        ;(Array.isArray(c.masters) ? c.masters : (c.mentor ? [c.mentor] : [])).forEach(function (m: any) { if (m && m.name) { addNode(m.name, m.role || '导师'); addRel(proto, m.name, m.relationship || '师徒', m.identity || m.background) } })
        if (rels.length > 0) data.relationships = { nodes: Object.values(nodesMap), relationships: rels }
      }
    } catch (_relErr) { /* never throw */ }

    // 🔥🔥 将 plotOutline.stages 同步为 outline { storyOrigin, mainPlot }（供前端"大纲"Tab展示）
    if ((!data.outline || typeof data.outline !== 'object' || Object.keys(data.outline).length === 0)
      && data.plotOutline && typeof data.plotOutline === 'object') {
      const storyOriginBuilder: string[] = []
      const mainPlotBuilder: string[] = []
      const stageKeys = ['stage1', 'stage2', 'stage3', 'stage4']
      for (const sk of stageKeys) {
        const stg: any = data.plotOutline[sk]
        if (!stg) continue
        if (stg.summary) storyOriginBuilder.push('【' + (stg.title || sk) + '】' + stg.summary)
        if (Array.isArray(stg.keyEvents)) mainPlotBuilder.push.apply(mainPlotBuilder, stg.keyEvents)
      }
      data.outline = {
        storyOrigin: (data.idea && (data.idea.synopsis || data.idea.coreIdea))
          ? (data.idea.synopsis || data.idea.coreIdea)
          : storyOriginBuilder.join('\n\n'),
        mainPlot: mainPlotBuilder.length > 0 ? mainPlotBuilder : undefined,
      }
    }

    // 🔥🔥 将 style + worldSettings(原对象格式) 同步为 worldbuilding（供前端"AI核心数据"Tab展示）
    // snapshotWSO 已在函数开头（worldSettings 被转换为数组之前）就准备好了
    const hasStyle = data.style && typeof data.style === 'object' && Object.keys(data.style).some(function (k) { return !!(data.style as any)[k] })
    if (Object.keys(snapshotWSO).length > 0 || hasStyle) {
      const wb = data.worldbuilding && typeof data.worldbuilding === 'object' ? data.worldbuilding : {}
      if (snapshotWSO.worldMap && !wb.geography) wb.geography = snapshotWSO.worldMap
      if (snapshotWSO.powerSystem && !wb.powerSystem) wb.powerSystem = snapshotWSO.powerSystem
      if (snapshotWSO.geographyRegions && !wb.geography) wb.geography = (wb.geography ? wb.geography + '\n' : '') + snapshotWSO.geographyRegions
      if (snapshotWSO.historicalEvents && !wb.history) wb.history = snapshotWSO.historicalEvents
      if (snapshotWSO.forcesFactions && !wb.socialStructure) wb.socialStructure = snapshotWSO.forcesFactions
      if (snapshotWSO.cultivationMethods && !wb.powerSystem) wb.powerSystem = snapshotWSO.cultivationMethods
      if ((snapshotWSO.worldMap || snapshotWSO.powerSystem) && !wb.era) {
        wb.era = (data.idea && data.idea.backgroundEra) || snapshotWSO.worldMap?.slice(0, 60) || ''
      }
      if (data.style && typeof data.style === 'object') {
        if (!wb.coreSettings && (data.style.tone || data.style.pacing || data.style.vocabulary)) {
          const parts: string[] = []
          if (data.style.tone) parts.push('整体文风：' + data.style.tone)
          if (data.style.pacing) parts.push('叙事节奏：' + data.style.pacing)
          if (data.style.vocabulary && Array.isArray(data.style.vocabulary)) parts.push('关键词汇：' + data.style.vocabulary.join('、'))
          if (parts.length > 0) wb.coreSettings = parts.join('\n')
        }
        if (!wb.culturalFeatures && Array.isArray(data.style.references)) {
          wb.culturalFeatures = '参考作品风格：' + data.style.references.join('、')
        }
      }
      data.worldbuilding = wb
    }

    // 🔥🔥 将 worldSettings(原对象格式) + style 同步为 keyPlots.volumes（供前端大纲Tab的volumes展示）
    if ((!data.keyPlots || typeof data.keyPlots !== 'object' || !Array.isArray(data.keyPlots.volumes) || data.keyPlots.volumes.length === 0)
      && data.plotOutline && typeof data.plotOutline === 'object') {
      const volumes: any[] = []
      const turningPoints: any[] = []
      const stageKeys = ['stage1', 'stage2', 'stage3', 'stage4']
      for (const sk of stageKeys) {
        const stg: any = data.plotOutline[sk]
        if (!stg) continue
        const events: string[] = Array.isArray(stg.keyEvents) ? stg.keyEvents : []
        volumes.push({
          name: stg.title || ('第' + (stageKeys.indexOf(sk) + 1) + '卷'),
          title: stg.title,
          summary: stg.summary || '',
          chapterCount: Math.ceil(parseInt((stg.expectedWordCount || '20万').toString().match(/\d+/)?.[0] || '20') / 3),
          keyEvents: events,
          openingNode: events[0] ? { event: events[0] } : undefined,
          coreObjective: events[events.length - 1] || '',
          hook: events[events.length - 1] || '',
        })
        if (events.length >= 2) {
          turningPoints.push(events[Math.floor(events.length / 2)])
        }
      }
      data.keyPlots = Object.assign({}, data.keyPlots || {}, {
        volumes: volumes,
        turningPoints: turningPoints,
        climax: volumes[2]?.summary || '',
        ending: volumes[3]?.summary || '',
      })
    }

    // 🔥 自动将settings中的relationships同步到relationships.json（旧数据兼容）
    try {
      const relFile = path.join(dataDir, 'relationships.json')
      let allRels: Record<string, unknown[]> = {}
      if (fs.existsSync(relFile)) {
        try { allRels = JSON.parse(fs.readFileSync(relFile, 'utf-8')) } catch(e) { allRels = {} }
      }
      let needSyncRels = false
      if (data.relationships && Array.isArray(data.relationships.relationships) && data.relationships.relationships.length > 0) {
        if (!allRels[novelId] || !Array.isArray(allRels[novelId]) || allRels[novelId].length === 0) {
          allRels[novelId] = data.relationships.relationships.map(function(r: any) {
            return {
              id: r.id || Date.now().toString() + Math.random().toString(36).slice(2, 6),
              from: r.from, to: r.to, type: r.type,
              description: r.description || r.initialRelation || '',
              development: r.development || r.impactOnPlot || '',
              keyEvents: r.keyEvents || '',
              emotionChange: r.emotionChange || '',
              createdAt: new Date().toISOString(),
            }
          })
          needSyncRels = true
        }
      }
      if (needSyncRels) {
        fs.writeFileSync(relFile, JSON.stringify(allRels, null, 2), 'utf-8')
      }
    } catch(e) {
      console.error('[settings GET] 同步relationships失败', e)
    }

    // 🔥 持久化派生数据到settings.json，避免下次重复派生
    let needPersistDerived = false
    if (!allSettings[novelId]) {
      allSettings[novelId] = {}
      needPersistDerived = true
    }
    // worldSettings 仅当原本不是 populated array 时，才写回新派生的 array (覆盖旧对象格式)
    const originalIsPopulatedArray = Array.isArray(allSettings[novelId].worldSettings) && allSettings[novelId].worldSettings.length > 0
    if (data.worldSettings && data.worldSettings.length > 0 && !originalIsPopulatedArray) {
      allSettings[novelId].worldSettings = data.worldSettings
      needPersistDerived = true
    }
    const origTimelinePop = Array.isArray(allSettings[novelId].timelineEvents) && allSettings[novelId].timelineEvents.length > 0
    if (data.timelineEvents && data.timelineEvents.length > 0 && !origTimelinePop) {
      allSettings[novelId].timelineEvents = data.timelineEvents
      needPersistDerived = true
    }
    const origFsPop = Array.isArray(allSettings[novelId].foreshadowings) && allSettings[novelId].foreshadowings.length > 0
    if (data.foreshadowings && data.foreshadowings.length > 0 && !origFsPop) {
      allSettings[novelId].foreshadowings = data.foreshadowings
      needPersistDerived = true
    }
    // 🔥🔥 持久化 worldbuilding / outline / keyPlots (从 plotOutline / style / worldSettings 对象派生的)
    if (data.worldbuilding && typeof data.worldbuilding === 'object' && Object.keys(data.worldbuilding).length > 0) {
      const curWb = allSettings[novelId].worldbuilding && typeof allSettings[novelId].worldbuilding === 'object' ? Object.keys(allSettings[novelId].worldbuilding).length : 0
      if (curWb === 0) {
        allSettings[novelId].worldbuilding = data.worldbuilding
        needPersistDerived = true
      }
    }
    if (data.outline && typeof data.outline === 'object' && (data.outline.storyOrigin || data.outline.mainPlot)) {
      const curO = allSettings[novelId].outline
      if (!curO || typeof curO !== 'object' || (!curO.storyOrigin && !Array.isArray(curO.mainPlot))) {
        allSettings[novelId].outline = data.outline
        needPersistDerived = true
      }
    }
    if (data.keyPlots && typeof data.keyPlots === 'object' && Array.isArray(data.keyPlots.volumes) && data.keyPlots.volumes.length > 0) {
      const curKp = allSettings[novelId].keyPlots
      if (!curKp || typeof curKp !== 'object' || !Array.isArray(curKp.volumes) || curKp.volumes.length === 0) {
        allSettings[novelId].keyPlots = data.keyPlots
        needPersistDerived = true
      }
    }
    if (needPersistDerived) {
      try { writeSettings(allSettings) } catch(e) { console.error('[settings GET] 持久化派生数据失败', e) }
    }

    return NextResponse.json({
      success: true,
      data: {
        worldSettings: data.worldSettings || [],
        foreshadowings: data.foreshadowings || [],
        timelineEvents: data.timelineEvents || [],
        worldbuilding: data.worldbuilding || {},
        powerSystem: data.powerSystem || {},
        characters: data.characters || {},
        factions: data.factions || {},
        keyPlots: data.keyPlots || {},
        cover: data.cover || {},
        idea: data.idea || {},
        synopsis: data.synopsis || {},
        outline: data.outline || {},
        relationships: data.relationships || {},
        chapters: data.chapters || {},
      }
    })
  }

  // 返回所有作品的设定（按作品分组，按权限过滤）
  const actor = await getRequestActor(request)
  if (actor.isAdmin) {
    return NextResponse.json({ success: true, data: allSettings })
  }
  const filtered: Record<string, unknown> = {}
  for (const key of Object.keys(allSettings)) {
    if (isAdminOnlyNovel(key)) continue
    const meta = loadNovelMetaOrNull(key)
    if (meta && actor.userId && meta.userId === actor.userId) filtered[key] = allSettings[key]
  }
  return NextResponse.json({ success: true, data: filtered })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { novelId, type, ...settingData } = body

  if (!novelId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  const allSettings = readSettings()
  if (!allSettings[novelId]) {
    allSettings[novelId] = {}
  }

  if (type === 'worldSetting') {
    // 添加单个世界设定项
    if (!allSettings[novelId].worldSettings) {
      allSettings[novelId].worldSettings = []
    }
    const newSetting = {
      id: Date.now().toString(),
      ...settingData,
      createdAt: new Date().toISOString().split('T')[0],
    }
    allSettings[novelId].worldSettings.push(newSetting)
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: newSetting }, { status: 201 })
  } else if (type === 'worldbuilding') {
    // 保存完整的世界观数据
    allSettings[novelId].worldbuilding = settingData
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].worldbuilding })
  } else if (type === 'powerSystem') {
    // 保存力量体系
    allSettings[novelId].powerSystem = settingData
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].powerSystem })
  } else if (type === 'characters') {
    // 保存人物设定
    allSettings[novelId].characters = settingData
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].characters })
  } else if (type === 'factions') {
    // 保存势力设定
    allSettings[novelId].factions = settingData
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].factions })
  } else if (type === 'foreshadowing') {
    // 保存伏笔
    if (!allSettings[novelId].foreshadowings) {
      allSettings[novelId].foreshadowings = []
    }
    const newForeshadowing = {
      id: Date.now().toString(),
      ...settingData,
      status: 'active'
    }
    allSettings[novelId].foreshadowings.push(newForeshadowing)
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: newForeshadowing }, { status: 201 })
  } else if (type === 'timeline') {
    // 保存时间线
    if (!allSettings[novelId].timelineEvents) {
      allSettings[novelId].timelineEvents = []
    }
    const newEvent = {
      id: Date.now().toString(),
      ...settingData
    }
    allSettings[novelId].timelineEvents.push(newEvent)
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: newEvent }, { status: 201 })
  } else if (type === 'batch') {
    // 批量保存所有设定
    Object.assign(allSettings[novelId], settingData)

    // 同步AI生成的人物关系到独立的relationships.json（供/api/characters/relationships读取）
    if (settingData.relationships && Array.isArray(settingData.relationships.relationships)) {
      try {
        const relFile = path.join(dataDir, 'relationships.json')
        let allRels: Record<string, unknown[]> = {}
        if (fs.existsSync(relFile)) {
          allRels = JSON.parse(fs.readFileSync(relFile, 'utf-8'))
        }
        const existingRels = allRels[novelId] || []
        const existingKeys = new Set(existingRels.map(function(r) {
          const rr = r as { from: string; to: string; type: string }
          return rr.from + '|' + rr.to + '|' + rr.type
        }))
        const newRels = settingData.relationships.relationships
          .filter(function(r: any) { return r && r.from && r.to && !existingKeys.has(r.from + '|' + r.to + '|' + r.type) })
          .map(function(r: any) {
            return {
              id: r.id || Date.now().toString() + Math.random().toString(36).slice(2, 6),
              from: r.from, to: r.to, type: r.type,
              description: r.description || r.initialRelation || '',
              development: r.development || '',
              createdAt: new Date().toISOString(),
            }
          })
        allRels[novelId] = existingRels.concat(newRels)
        fs.writeFileSync(relFile, JSON.stringify(allRels, null, 2), 'utf-8')
      } catch (e) {
        console.warn('[settings] Failed to sync relationships:', e)
      }
    }

    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId] })
  } else if (type === 'cover') {
    // 保存封面数据
    allSettings[novelId].cover = {
      coverUrl: settingData.coverUrl || '',
      coverTitle: settingData.coverTitle || '',
      coverAuthor: settingData.coverAuthor || '',
      coverGenre: settingData.coverGenre || '',
      updatedAt: new Date().toISOString(),
    }
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].cover })
  }

  return NextResponse.json({ success: false, error: '无效的类型' }, { status: 400 })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { novelId, settingId, type, ...updateData } = body

  if (!novelId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  const allSettings = readSettings()
  if (!allSettings[novelId]) {
    return NextResponse.json({ success: false, error: '作品不存在' }, { status: 404 })
  }

  if (type === 'worldSetting' && settingId) {
    const index = (allSettings[novelId].worldSettings || []).findIndex((s: any) => s.id === settingId)
    if (index !== -1) {
      allSettings[novelId].worldSettings[index] = { ...allSettings[novelId].worldSettings[index], ...updateData }
      writeSettings(allSettings)
      return NextResponse.json({ success: true, data: allSettings[novelId].worldSettings[index] })
    }
  } else if (type === 'foreshadowing' && settingId) {
    const index = (allSettings[novelId].foreshadowings || []).findIndex((f: any) => f.id === settingId)
    if (index !== -1) {
      allSettings[novelId].foreshadowings[index] = { ...allSettings[novelId].foreshadowings[index], ...updateData }
      writeSettings(allSettings)
      return NextResponse.json({ success: true, data: allSettings[novelId].foreshadowings[index] })
    }
  }

  return NextResponse.json({ success: false, error: '设定不存在' }, { status: 404 })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')
  const settingId = searchParams.get('settingId')
  const type = searchParams.get('type')

  if (!novelId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  const allSettings = readSettings()
  if (!allSettings[novelId]) {
    return NextResponse.json({ success: false, error: '作品不存在' }, { status: 404 })
  }

  if (type === 'worldSetting' && settingId) {
    allSettings[novelId].worldSettings = (allSettings[novelId].worldSettings || []).filter((s: any) => s.id !== settingId)
    writeSettings(allSettings)
    return NextResponse.json({ success: true })
  } else if (type === 'foreshadowing' && settingId) {
    allSettings[novelId].foreshadowings = (allSettings[novelId].foreshadowings || []).filter((f: any) => f.id !== settingId)
    writeSettings(allSettings)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: '无效的请求' }, { status: 400 })
}
