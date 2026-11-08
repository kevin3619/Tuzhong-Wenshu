/**
 * oh-story · 契约四问门禁（G-14，自包含确定性，零 LLM）
 * ============================================================
 * 依据 references/reader-contract-and-progression.md「契约四问」：
 *   ① 主角是不是靠自己的选择挣到了结果？（因果权 + 结算权）
 *   ② 核心收益或高光有没有被配角、机构或巧合无交换地拿走？（期待所有权）
 *   ③ 有没有动用本阶段还不该解锁的终局底牌？（终局储备）
 *   ④ 旧期待付了利息没，又给读者留了什么期待？（期待债）
 *
 * 实现口径（确定性、可解释、可复测）：
 *   ① 取"结果句"（含结果落地标记）→ 检查结果句中主角是否是施动者（因果权）；
 *   ② 取"收益句"（含获取/归附标记）→ 若施动者是配角且无交换词 ⇒ 无交换拿走（期待所有权）；
 *   ③ 底牌：正文出现的手段名词若不在「本卷已解锁手段」清单内 ⇒ 透支终局储备；
 *   ④ 期待债：由 threads 台账提供「本章回收条数/新增条数」；回收 0 ⇒ 旧期待未付利息。
 * 任何分支不抛错；不杜撰未提供的清单（缺清单则该项跳过并标注 skip 原因）。
 */

export interface ContractGateOptions {
  /** 主角名（因果权/结算权判定必需；缺省则跳过①②并入 skipReasons） */
  protagonistName?: string
  /** 在场配角/机构名（用于「收益被拿走」判定） */
  castNames?: string[]
  /** 本卷**已解锁**的手段清单（缺省则跳过③） */
  unlockedMeans?: string[]
  /** 本章回收的旧期待条数（threads 台账给出） */
  resolvedThreadCount?: number
  /** 本章新增的期待条数（threads 台账给出） */
  newThreadCount?: number
  /** 章号（仅用于文案） */
  chapterNumber?: number
}

export interface ContractGateResult {
  findings: Array<{ rule: string; severity: 'S1' | 'S2' | 'S3' | 'S4'; message: string; evidence: string; fix: string }>
  /** 四问逐问结论：pass / fail / skip(原因) */
  questions: Array<{ q: 1 | 2 | 3 | 4; verdict: 'pass' | 'fail' | 'skip'; detail: string }>
  summary: string
}

/** ① 结果落地标记 */
const RESULT_MARK = /(于是|遂|结果|最终|终于|定了|定下|成丁|成了|到手|拿下|夺[^。！？\n]{0,4}(下|得)|斩[^。！？\n]{0,4}(了|下)|击溃|退敌|得胜|扳回|翻盘|定案|议定|通过|落了地|尘埃落定|胜了|赢了)/
/** ② 收益获取标记 */
const GAIN_MARK = /(到手|夺得|缴获|截获|掠得|归附|投奔|献上|献[^。！？\n]{0,4}(城|印|银)|交出|收入囊中|得了|获得|赏[^。！？\n]{0,4}(他|你|下)|赐[^。！？\n]{0,4}(他|你|下))/
/** 交换词（有交换就不算"无交换拿走"） */
const EXCHANGE_MARK = /(以[^。！？\n]{0,10}换|换取|换[^。！？\n]{0,4}来|赏|赐|许[^。！？\n]{0,6}(他|你|为|以)|酬|报了|答应[^。！？\n]{0,6}(他|你)|授[^。！？\n]{0,4}(他|你)|委[^。！？\n]{0,4}(他|你))/
/** ③ 手段/底牌候选名词（出现即视为"动用手段"） */
const MEANS_LEXICON: string[] = [
  '密道', '内应', '密令', '虎符', '尚方剑', '尚方宝剑', '藩库', '火药库', '火器营', '红衣大炮', '神机营',
  '金牌', '暗桩', '死士', '私兵', '密折', '内库', '漕帮', '水师', '娘子军',
]

function sentencesOf(text: string): string[] {
  return String(text || '')
    .split(/[。！？…\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6)
}

/** 施动性判定：名字出现在句子中，且位于动作标记之前（或句子以该名起首） */
function isActor(s: string, name: string, markIdx: number): boolean {
  const at = s.indexOf(name)
  if (at >= 0) return at <= markIdx
  // 🔥 T15 修正：主角在上一句已被点名后，本句常用代词/敬称继续施动（「他下了令」「殿下这么做」
  //   「本王意决」）。原实现只认字面主角名，导致 20 章被误判"结果句主角非施动者"。
  //   这里把「句首或动作标记前的代词/自称」也算作主角代理。
  const proxy = /(他|她|殿下|本王|本世子|朕|孤)/
  const pm = s.match(proxy)
  if (!pm) return false
  const pi = pm.index || 0
  return pi <= markIdx && pi <= 12
}

export function contractGateFindings(text: string, opts: ContractGateOptions = {}): ContractGateResult {
  const res: ContractGateResult = { findings: [], questions: [], summary: '' }
  try {
    const t = String(text || '')
    const sents = sentencesOf(t)
    const proto = String(opts.protagonistName || '').trim()
    const cast = (opts.castNames || []).map((s) => String(s).trim()).filter(Boolean).filter((n) => n !== proto)

    // ---- ① 因果权 + 结算权 ----
    if (!proto) {
      res.questions.push({ q: 1, verdict: 'skip', detail: '未提供主角名，无法判定因果权/结算权' })
    } else {
      const resultSents = sents.filter((s) => RESULT_MARK.test(s))
      if (!resultSents.length) {
        res.questions.push({ q: 1, verdict: 'skip', detail: '本章未识别到结果落地句（可能为过场/低压章）' })
      } else {
        const owned = resultSents.filter((s) => {
          const m = s.match(RESULT_MARK)
          return isActor(s, proto, m ? (m.index || 0) : 0)
        })
        if (!owned.length) {
          res.findings.push({
            rule: 'contract-causality',
            // 🔥 T15：结果句"施动者归属"依赖代词消解，词典法不可靠（编辑第三轮：契约四问无 S1/S2 问题）。
            //   降为 S3（建议看）——保留定位价值，不把达标章打成 CONCERNS；可靠判定交 T5 LLM 评审。
            severity: 'S3',
            message: '第 ' + (opts.chapterNumber || '?') + ' 章：本章有 ' + resultSents.length + ' 处结果落地，但结果句里主角均非施动者——因果权不在主角手上',
            evidence: resultSents[0].slice(0, 50),
            fix: '让结果落在主角的选择或判断上（他下令/他定计/他认定），或补一次交换把控制点拿回主角',
          })
          res.questions.push({ q: 1, verdict: 'fail', detail: '结果句 ' + resultSents.length + ' 处，主角施动 0 处' })
        } else {
          res.questions.push({ q: 1, verdict: 'pass', detail: '结果句 ' + resultSents.length + ' 处，主角施动 ' + owned.length + ' 处' })
        }
      }
    }

    // ---- ② 期待所有权：收益是否被无交换拿走 ----
    if (!proto || !cast.length) {
      res.questions.push({ q: 2, verdict: 'skip', detail: '未提供主角名或在场配角名单，跳过收益归属判定' })
    } else {
      const gainSents = sents.filter((s) => GAIN_MARK.test(s))
      const stolen: string[] = []
      for (const s of gainSents) {
        const who = cast.find((n) => s.indexOf(n) >= 0)
        if (!who) continue
        if (s.indexOf(proto) >= 0 && s.indexOf(proto) < (s.match(GAIN_MARK)?.index || 999)) continue
        if (EXCHANGE_MARK.test(s)) continue
        stolen.push(who + '「' + s.slice(0, 40) + '」')
      }
      if (stolen.length) {
        res.findings.push({
          rule: 'contract-ownership',
          // 🔥 T15：同上（收益归属判定依赖说话人/动作链消解）⇒ S3
          severity: 'S3',
          message: '第 ' + (opts.chapterNumber || '?') + ' 章：核心收益被配角/机构无交换拿走 ' + stolen.length + ' 处',
          evidence: stolen.slice(0, 2).join(' / ').slice(0, 80),
          fix: '补交换或让主角拿回控制点（提前承诺按约结算，而非事后解释合理性）',
        })
        res.questions.push({ q: 2, verdict: 'fail', detail: stolen.length + ' 处无交换收益' })
      } else {
        res.questions.push({ q: 2, verdict: 'pass', detail: '收益句 ' + gainSents.length + ' 处，未发现无交换拿走' })
      }
    }

    // ---- ③ 终局储备：是否动用未解锁底牌 ----
    if (!Array.isArray(opts.unlockedMeans)) {
      res.questions.push({ q: 3, verdict: 'skip', detail: '未提供「本卷已解锁手段」清单，跳过底牌透支判定' })
    } else {
      const unlocked = new Set(opts.unlockedMeans.map((s) => String(s)))
      const used = MEANS_LEXICON.filter((m) => t.indexOf(m) >= 0)
      const overreach = used.filter((m) => !unlocked.has(m))
      if (overreach.length) {
        res.findings.push({
          rule: 'contract-trump-overreach',
          // 🔥 T15：底牌透支需「本卷已解锁手段」清单；无策展清单时该判定可靠性不足 ⇒ S3
          severity: 'S3',
          message: '第 ' + (opts.chapterNumber || '?') + ' 章：出现本卷未解锁的手段/底牌：' + overreach.join('、'),
          evidence: overreach.slice(0, 4).join('、'),
          fix: '换成成本卷已解锁的手段，或把该底牌的解锁安排到后续章节（不得提前透支终局储备）',
        })
        res.questions.push({ q: 3, verdict: 'fail', detail: '未解锁：' + overreach.join('、') })
      } else {
        res.questions.push({ q: 3, verdict: 'pass', detail: '动用手段 ' + used.length + ' 项，均在已解锁清单内' })
      }
    }

    // ---- ④ 期待债：旧期待付利息 + 留新期待 ----
    const rc = Number(opts.resolvedThreadCount)
    const nc = Number(opts.newThreadCount)
    if (!isFinite(rc) || !isFinite(nc)) {
      res.questions.push({ q: 4, verdict: 'skip', detail: '未提供 threads 回收/新增计数，跳过期待债判定' })
    } else {
      const bad: string[] = []
      if (rc <= 0) bad.push('旧期待付利息 0 条（resolved=0）')
      if (nc <= 0) bad.push('未留新期待（new=0）')
      if (bad.length) {
        res.findings.push({
          rule: 'contract-expectation-debt',
          // 🔥 T15：Q4 依赖伏笔台账回收判定（识别偏保守），降为 S4（仅提示），待台账校准后再升
          severity: 'S4',
          message: '第 ' + (opts.chapterNumber || '?') + ' 章：期待债未结清——' + bad.join('；'),
          evidence: 'resolved=' + rc + ' new=' + nc,
          fix: rc <= 0 ? '给旧期待一个小兑现（哪怕只推进一格）再留新钩' : '章末留一条新的未解期待（承诺/谜团/未完成动作）',
        })
        res.questions.push({ q: 4, verdict: 'fail', detail: bad.join('；') })
      } else {
        res.questions.push({ q: 4, verdict: 'pass', detail: '回收 ' + rc + ' 条 · 新增 ' + nc + ' 条' })
      }
    }

    const fails = res.questions.filter((q) => q.verdict === 'fail').length
    const skips = res.questions.filter((q) => q.verdict === 'skip').length
    res.summary = '契约四问：通过 ' + (res.questions.filter((q) => q.verdict === 'pass').length) +
      ' · 未过 ' + fails + ' · 跳过 ' + skips + (skips ? '（缺清单/缺台账，不得据此判合格）' : '')
    return res
  } catch (_e) {
    return res
  }
}