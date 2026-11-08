/**
 * 🔥 2026-10-22 oh-story（zenstory-ai/oh-story-claudecode）AI 味检测 · 移植版
 *
 * 来源：skills/story-deslop/scripts/check-ai-patterns.js（该仓库用真人语料校准过的确定性检测器）
 * 移植范围：blocking 类 6 条（not-is / voice-contrast / negation-parade / reverse-not-is /
 *          trailer-ending / trailer-summary）+ advisory 密度类 8 条。
 *
 * 用途：
 *   ① 引擎 ⑤d「疑似段落定向重写」的目标选择：朱雀口径只给「这段像AI」，本模块能给出
 *      「这段命中了哪种句式（否定翻转/音量反差/否定排比/预告式收尾…）」，模型改写时有的放矢。
 *   ② 终稿复检：命中 blocking 类 → 记入 report，作为「章末收口/定稿」阶段的定点修复依据。
 *
 * 判定口径与原仓库一致：blocking 只收「表面形态确定、真人语料≈0 命中」的模板句；
 * 密度型一律 advisory（只提示，不硬删），避免误杀正常中文。
 */

export type OhSeverity = 'blocking' | 'advisory'

export interface OhFinding {
  /** 规则名（与原仓库 type 对齐） */
  type: string
  severity: OhSeverity
  /** 命中片段 */
  excerpt: string
  /** 段落序号（0 基） */
  para: number
  /** 修复建议（给模型看的） */
  advice: string
}

/** 文末窗口（预告式收尾/章末总结只在窗口内判） */
const TRAILER_WINDOW_CHARS = 600

/** 屏蔽引号内文本（台词里的「不是A，是B」是自然辩解，不算叙述层模板） */
function maskQuoted(text: string): string {
  const pairs: Array<[string, string]> = [['「', '」'], ['『', '』'], ['【', '】'], ['“', '”'], ['‘', '’']]
  let out = text
  for (const [o, c] of pairs) {
    const re = new RegExp(o + '[^' + c + '\\n]*' + c, 'g')
    out = out.replace(re, (m) => ' '.repeat(m.length))
  }
  return out
}

function paras(text: string): string[] {
  return String(text || '').split('\n')
}

/** 找到命中片段所属段落序号 */
function paraIndexOf(text: string, index: number): number {
  let p = 0
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') p++
  return p
}

function push(
  list: OhFinding[],
  type: string,
  severity: OhSeverity,
  re: RegExp,
  masked: string,
  orig: string,
  advice: string,
  limit = 12
) {
  let m: RegExpExecArray | null
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  while ((m = r.exec(masked)) !== null) {
    if (m[0].length < 2) { r.lastIndex++; continue }
    list.push({
      type,
      severity,
      excerpt: orig.slice(m.index, m.index + Math.min(40, m[0].length)).replace(/\s+/g, ' ').trim(),
      para: paraIndexOf(orig, m.index),
      advice,
    })
    if (list.length >= limit) return
  }
}

const ADVICE: Record<string, string> = {
  'not-is-comparison': '删掉否定铺垫，直接写后项；或改成动作/细节呈现',
  'voice-contrast': '删掉音量铺垫，直接写声音落进场子的具体效果',
  'negation-parade': '否定排比改成一句直接陈述，保留最有信息量的那条',
  'reverse-not-is': '改成正面陈述，不要用「是A，不是B」的反序对比',
  'trailer-ending': '章末不要替读者预告下一章，改成具体动作或未解之事',
  'trailer-summary': '章末不要盖章总结，把结果落到具体画面/器物/文书上',
  'em-dash': '破折号改用句号断句',
  'cliche-density-tic': '套词成片出现，逐处换成具体动作或器物',
  'stock-reaction-tic': '身体反应模板成片出现，删掉无功能的那一处',
  'micro-action-tic': '「了一下」类轻量补语过密，合并或删掉',
  'negation-pair-tic': '否定对偶过多，留真正要强调的一处',
  'abstract-summary-tic': '作者总结/上帝视角越位，改成角色当下能看到的东西',
  'metaphor-density-tic': '比喻成片复现，删到必要数量并回到具体画面',
  'reasoning-chain-tic': '替读者推理的解释链过密，把判断落到动作与现场证据',
}

/**
 * 主检测：返回全部命中（段落级定位 + 修复建议）
 */
export function findOhStoryPatterns(text: string): OhFinding[] {
  const orig = String(text || '')
  if (!orig.trim()) return []
  const masked = maskQuoted(orig)
  const out: OhFinding[] = []
  const tailStart = Math.max(0, orig.length - TRAILER_WINDOW_CHARS)
  const tailMasked = masked.slice(tailStart)

  // ---- blocking 类 ----
  // ① 否定后翻转：「不是A，而是B / 不是A。是B / 不是A，Y」
  push(out, 'not-is-comparison', 'blocking',
    /不是(?!是)[^。！？!?\n]{1,20}[，,。]\s*(?:而是|却是|反而是|就是|是)[^。！？!?\n]{1,24}/g,
    masked, orig, ADVICE['not-is-comparison'])
  // ② 音量反差：「声音不大…却…」
  push(out, 'voice-contrast', 'blocking',
    /声音(?:并)?不[大高响亮][^。！？!?\n]{0,16}[却但偏]/g,
    masked, orig, ADVICE['voice-contrast'])
  // ③ 否定排比：「没有X，没有Y，」
  push(out, 'negation-parade', 'blocking',
    /(?:没有[^。！？!?\n，,]{1,12}[，,]){2}/g,
    masked, orig, ADVICE['negation-parade'])
  push(out, 'negation-parade', 'blocking',
    /(?<![沉淹埋出隐湮吞覆漫泯])没(?!有?过?多久)(?:有)?[^。！？!?\n，,]{1,12}[，,]\s*没(?!有?过?多久)(?:有)?[^。！？!?\n，,]{1,16}[，,。.][^。！？!?\n，,]{0,6}只(?:是|会|有)/g,
    masked, orig, ADVICE['negation-parade'])
  // ④ 反序对比：「是A，不是B」
  push(out, 'reverse-not-is', 'blocking',
    /是([^。！？!?\n，,]{1,12})[，,]\s*(?:而)?不是([^。！？!?\n]{1,20})/g,
    masked, orig, ADVICE['reverse-not-is'])
  // ⑤ 预告式收尾（只扫文末窗口）
  push(out, 'trailer-ending', 'blocking',
    /没人知道|谁也不知道|谁也没想到|殊不知|(?:这)?才刚刚开(?:始|头)|正(?:朝着|向着)[^。！？!?\n]{0,24}(?:压|涌|袭|逼)(?:了?过去|了?过来|来)|(?<!正式)拉开(?:序幕|帷幕)|即将(?:开始|来临|降临)/g,
    tailMasked, orig.slice(tailStart), ADVICE['trailer-ending'])
  // ⑥ 章尾状态总结（只扫文末窗口）
  push(out, 'trailer-summary', 'blocking',
    /这一(?:夜|天|刻|战|年|局|役)[，,]?[^。！？!?，,\n]{0,6}(?<!命中)(?<!是)注定[^。！？!?\n]{0,8}[。！]|就这样[，,][^。！？!?，,\n]{0,8}(?:一切|全部)[^。！？!?，,\n]{0,4}(?:结束了|落幕|收场)[。！]|这一切[，,]?[^。！？!?，,\n]{0,6}(?:都)?(?:说明|意味着|结束了)(?!的)(?:(?!什么)[^。！？!?\n]){0,6}[。！]|(?:新的篇章|新的旅程|崭新的篇章|新的人生)[^。！？!?\n]{0,6}(?:开始|拉开|展开)|命运[^。！？!?\n]{0,6}齿轮/g,
    tailMasked, orig.slice(tailStart), ADVICE['trailer-summary'])

  // ---- advisory 密度类 ----
  const zhLen = (orig.match(/[\u4e00-\u9fa5]/g) || []).length
  const kilo = Math.max(1, zhLen / 1000)
  const countOf = (re: RegExp) => {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    return (masked.match(r) || []).length
  }
  // 破折号
  if (countOf(/——|—|--+/g) >= 3) {
    out.push({ type: 'em-dash', severity: 'advisory', excerpt: '破折号×' + countOf(/——|—|--+/g), para: -1, advice: ADVICE['em-dash'] })
  }
  // 套词密度
  const clicheRe = /仿佛|犹如|宛若|如同|一丝|一抹|些许|几分|隐约|深吸一口气|缓缓|微微|轻轻|淡淡|眼中闪过|嘴角勾起|眸光微微一闪|指节泛白|目光锐利|眼神锐利|心中涌起一股|心头一震|心中一动|心下了然|心中暗道|心中一凛|不容置疑|不容置喙|不易察觉|显而易见|毫无疑问|不可否认|声音不大[，,]?却带着|语气平静无波|平静无波|声音平直|听不出情绪|不知何时|唾手可得|无声翻涌|难以言说|散发着一股|冰冷的光|格外刺眼|深邃而冰冷/g
  const clicheN = countOf(clicheRe)
  if (clicheN >= 8 && clicheN / kilo >= 12) {
    out.push({ type: 'cliche-density-tic', severity: 'advisory', excerpt: '套词×' + clicheN, para: -1, advice: ADVICE['cliche-density-tic'] })
  }
  // 套式身体反应
  const stockRe = /(?:指尖|手指|指节|手背|掌心|拳头|袖口|衣角|裙角|下唇|嘴唇|唇角|嘴角|眉头|眼底|眸光|目光|视线|肩膀|呼吸)[^。！？!?\n]{0,16}(?:轻轻|微微|缓缓|悄然|不自觉|无意识|下意识|攥紧|握紧|收紧|绞紧|泛白|发白|叩|敲|摩挲|抿紧|抿成|移开|垂下|躲开|一颤|颤了?一下|停了?一下|顿了?一下)/g
  const stockN = countOf(stockRe)
  if (stockN >= 4 && stockN / kilo >= 1.5) {
    out.push({ type: 'stock-reaction-tic', severity: 'advisory', excerpt: '套式反应×' + stockN, para: -1, advice: ADVICE['stock-reaction-tic'] })
  }
  // 微动作复读
  const microN = countOf(/了(?:[一两三几半])?[下阵圈道声眼口气会]/g)
  if (microN >= 5 && microN / kilo >= 6) {
    out.push({ type: 'micro-action-tic', severity: 'advisory', excerpt: '轻量补语×' + microN, para: -1, advice: ADVICE['micro-action-tic'] })
  }
  // 否定对偶
  const negPairN = countOf(/(?:没有|没|不)[^，。！？；,!?\n]{1,10}[，,；]\s*[^，。！？；,!?\n]{0,6}?也(?:没有|没|不)/g)
  if (negPairN >= 3) {
    out.push({ type: 'negation-pair-tic', severity: 'advisory', excerpt: '否定对偶×' + negPairN, para: -1, advice: ADVICE['negation-pair-tic'] })
  }
  // 抽象总结复读
  const absN = countOf(/这一刻[，,]?[^\n。！？!?]{0,24}(?:终于|才)(?:明白|意识到)|从这一刻开始|(?:命运|宿命)[^\n。！？!?]{0,28}(?:齿轮|棋局|獠牙|改写|推向|安排)|早已[^\n。！？!?]{0,8}(?:布好|安排好)[^\n。！？!?]{0,8}(?:棋局|局)|前所未有的(?:决意|清醒|勇气|力量|恐惧|平静|信念)|(?:反击|复仇|战争|较量|故事|命运)[^\n。！？!?]{0,12}才刚刚开始|(?:新的开始|全新的开始)/g)
  if (absN >= 3 && absN / kilo >= 4) {
    out.push({ type: 'abstract-summary-tic', severity: 'advisory', excerpt: '抽象总结×' + absN, para: -1, advice: ADVICE['abstract-summary-tic'] })
  }
  // 比喻密度
  const metN = countOf(/好像|像是|仿佛|宛如|如同|犹如|像/g)
  if (metN >= 7 && metN / kilo >= 3) {
    out.push({ type: 'metaphor-density-tic', severity: 'advisory', excerpt: '比喻×' + metN, para: -1, advice: ADVICE['metaphor-density-tic'] })
  }
  // 解释链密度
  const reasonN = countOf(/(?<![不没未无])(?:他|她|我)?(?:知道|明白|意识到|清楚|判断|确认|分析)|这意味着|也就是说|换句话说|真正的问题(?:在于)?|问题在于|关键在于|在这种情况下|按照这个逻辑|只有这样|想到这里/g)
  if (reasonN >= 8 && reasonN / kilo >= 18) {
    out.push({ type: 'reasoning-chain-tic', severity: 'advisory', excerpt: '解释链×' + reasonN, para: -1, advice: ADVICE['reasoning-chain-tic'] })
  }

  return out
}

/** 按段落聚合（供 ⑤d 定向改写用）：段号 → 该段命中的问题描述 */
export function ohIssuesByPara(findings: OhFinding[]): Map<number, string[]> {
  const m = new Map<number, string[]>()
  for (const f of findings) {
    if (f.para < 0) continue
    const arr = m.get(f.para) || []
    const label = (f.type + '：' + f.advice)
    if (arr.indexOf(label) < 0) arr.push(label)
    m.set(f.para, arr)
  }
  return m
}

/** 汇总成一句话（写进修复指令/审计结论） */
export function ohSummary(findings: OhFinding[]): string {
  if (!findings.length) return ''
  const cnt = new Map<string, number>()
  for (const f of findings) cnt.set(f.type, (cnt.get(f.type) || 0) + 1)
  return Array.from(cnt.entries()).map(([k, v]) => k + '×' + v).join('、')
}
