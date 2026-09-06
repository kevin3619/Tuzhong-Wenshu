/**
 * 大纲「世界观设定」字段清洗
 *
 * 背景（用户实测）：整体故事大纲的世界观设定两个字段被前序环节的结构化数据污染——
 *   ① 背景设定(setting) 里被整块拼进了世界观步骤的结构化力量体系文本
 *      （力量体系：【体系名称】…【境界划分】十几行…【方式】【克制关系】），
 *      力量体系本应只出现在"力量体系"栏，出现在背景设定里属于重复且不可读；
 *   ② 力量体系(powerSystem) 里被拼进了"金手指：大明中兴签到系统"、
 *      "体系名称：明朝朝堂权力体系"、"体系类型：明朝朝堂权力体系"这类标签式碎片
 *      （金手指属于金手指设定环节，体系名/类型属于标签，都不是"力量体系"的内容本身）。
 *
 * 本模块把结构化标记转成可读散文，并剔除上述不该出现的片段。
 */

/** 需要整段剔除的标记（其内容不属于该字段） */
const DROP_MARKERS = ['体系名称', '体系类型', '金手指']

/** 标记 → 可读引导词（保留内容，只去掉【】壳子） */
const MARKER_LABEL: Record<string, string> = {
  体系描述: '',
  境界划分: '等级划分：',
  等级划分: '等级划分：',
  方式: '晋升途径：',
  提升方式: '晋升途径：',
  修炼方式: '晋升途径：',
  克制关系: '制衡关系：',
  社会结构: '社会结构：',
  地理环境: '地理环境：',
  时代背景: '时代背景：',
  历史背景: '历史背景：',
  世界规则: '世界规则：',
}

/** 把 "【体系描述】xxx\n【境界划分】a→b" 这类结构化文本转成可读散文 */
export function destructurePowerText(text: unknown, opts?: { dropRealm?: boolean }): string {
  let s = String(text == null ? '' : text).replace(/\r/g, '')
  if (!s.trim()) return ''
  const parts: string[] = []
  // 按 【标记】 切段
  const re = /【([^】]{1,10})】([\s\S]*?)(?=【|$)/g
  let m: RegExpExecArray | null
  let matched = false
  while ((m = re.exec(s)) !== null) {
    matched = true
    const marker = String(m[1] || '').trim()
    const body = String(m[2] || '').replace(/^[\s：:，、]+/, '').replace(/[\s]+$/, '').trim()
    if (!body) continue
    if (DROP_MARKERS.indexOf(marker) !== -1) continue
    if (opts?.dropRealm && (marker === '境界划分' || marker === '等级划分')) continue
    const label = MARKER_LABEL[marker] !== undefined ? MARKER_LABEL[marker] : (marker + '：')
    parts.push(label + body)
  }
  if (!matched) {
    // 没有【】结构：仅剥掉 "体系名称：/体系类型：/金手指：" 这类标签碎片
    parts.push(s.replace(/(?:体系名称|体系类型|金手指)\s*[：:]\s*[^；;，。\n]{0,30}[；;，。]?/g, ''))
  }
  return parts.join(' ').replace(/\s+/g, ' ').replace(/；\s*；/g, '；').replace(/^[；;，。\s]+/, '').trim()
}

/** 背景设定里不该出现力量体系整块：从 "力量体系：" 起截断到下一个大段落 */
function stripPowerBlock(text: string): string {
  let s = String(text == null ? '' : text)
  // ① "力量体系：…（直到下一个 2 字以上中文标题词或结尾）"
  s = s.replace(/力量体系\s*[：:][\s\S]*/g, '')
  // ② 兜底：残留的【…】结构块一律转写
  if (/【[^】]{1,10}】/.test(s)) s = destructurePowerText(s, { dropRealm: true })
  return s.replace(/[；;，。\s]+$/, '').replace(/[；;]{2,}/g, '；').trim()
}

/** 力量体系栏：剔除金手指/体系名称/体系类型标签碎片，结构化标记转散文 */
function cleanPowerField(text: string): string {
  let s = String(text == null ? '' : text)
  s = s.replace(/(?:金手指|体系名称|体系类型)\s*[：:]\s*[^；;。\n]{1,30}[；;]?/g, '')
  if (/【[^】]{1,10}】/.test(s)) s = destructurePowerText(s)
  return s.replace(/^[；;，。\s]+/, '').replace(/[；;]{2,}/g, '；').replace(/\s{2,}/g, ' ').trim()
}

export interface OutlineWorldCleanReport {
  settingChanged: boolean
  powerChanged: boolean
  settingBefore: string
  settingAfter: string
  powerBefore: string
  powerAfter: string
}

/**
 * 清洗大纲的 worldBuilding（原地修改并返回报告）。
 * 兼容 worldBuilding 为对象（{setting,powerSystem}）或字符串两种历史形态。
 */
export function cleanOutlineWorldBuilding(outline: any): OutlineWorldCleanReport | null {
  if (!outline || typeof outline !== 'object') return null
  const wb = outline.worldBuilding || outline.worldview || outline['世界观设定']
  if (!wb) return null

  // 字符串形态（早期数据）：转成对象再清洗
  if (typeof wb === 'string') {
    const cleaned = stripPowerBlock(wb)
    outline.worldBuilding = { setting: cleaned, powerSystem: '' }
    return {
      settingChanged: cleaned !== wb, powerChanged: false,
      settingBefore: wb, settingAfter: cleaned, powerBefore: '', powerAfter: '',
    }
  }
  if (typeof wb !== 'object') return null

  const settingBefore = String(wb.setting == null ? '' : wb.setting)
  const powerBefore = String(wb.powerSystem == null ? '' : wb.powerSystem)
  const settingAfter = stripPowerBlock(settingBefore)
  const powerAfter = cleanPowerField(powerBefore)
  if (settingAfter !== settingBefore) wb.setting = settingAfter
  if (powerAfter !== powerBefore) wb.powerSystem = powerAfter
  outline.worldBuilding = wb
  return {
    settingChanged: settingAfter !== settingBefore,
    powerChanged: powerAfter !== powerBefore,
    settingBefore, settingAfter, powerBefore, powerAfter,
  }
}

/** 从结构化世界观文本里取出"体系描述"段（用于大纲力量体系栏的兜底内容） */
export function pickSystemDescription(text: unknown): string {
  const s = String(text == null ? '' : text)
  const m = s.match(/【体系描述】([\s\S]*?)(?=\n?【|$)/)
  if (m && m[1] && m[1].trim().length >= 20) return m[1].trim()
  return ''
}
