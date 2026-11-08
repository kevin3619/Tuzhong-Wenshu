import { NextResponse } from 'next/server'
import { getRequestActor } from '@/lib/permissions'
import { runZhuqueProxy } from '@/lib/ai/zhuque-proxy'

// 🔥 朱雀官方 AIGC 检测通道（腾讯 EdgeOne Makers 内置模型 @makers/zhuque-text）
// 文档：https://cloud.tencent.com/document/product/1552/137539
// 接口：POST https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify
// 认证：Authorization: Bearer <Makers API Key>（EdgeOne 控制台 → Makers → Models → API Key 创建，每月免费 50 万 token）
// 返回：labels_ratio{"0":人工占比,"1":AI占比,"2":疑似AI占比}、softmax_confidence、segment_labels[]
// 本路由与站内「自研估测」完全分开：官方判定以 labels_ratio["2"]（疑似AI占比）为准。
//
// 🔥 2026-10-26：朱雀 Key 从「系统级 env」改造为「用户自填」模式：
//   ① 用户在「个人设置 → 朱雀官方检测通道」用密码框填写 Key，保存到账号偏好（并在本浏览器留存一份）；
//   ② 检测请求由前端把 Key 随 body.apiKey 传入后端（优先级最高）；前端未传时回读账号偏好中保存的 Key；
//   ③ 不再读取服务端环境变量 ZHUQUE_MAKERS_KEY（系统级 Key 已下线）；
//   ④ 无 Key 时不报错：默认走「站内AI检测（朱雀口径本地代理）」，并提示可在设置中填入朱雀 Key 启用官方检测。

const ZHUQUE_API = 'https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify'
const ZHUQUE_SUSPECT_TARGET = 5 // 目标：疑似AI占比 ≤ 5%

type PrefStore = Record<string, { data: Record<string, unknown>; updatedAt: number }>

function readStore(): PrefStore {
  try {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const dirCandidates = [
      path.join(process.cwd(), '.tuzhong-data'),
      path.join(process.cwd(), 'src', 'tuzhong-wenshu', '.tuzhong-data'),
      path.join(process.cwd(), '..', '.tuzhong-data'),
    ]
    for (const dir of dirCandidates) {
      const file = path.join(dir, 'user-preferences.json')
      if (!fs.existsSync(file)) continue
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch (_e) { /* ignore */ }
  return {}
}

// 🔥 2026-10-26：Key 解析顺序（用户自填模式）：
//   ① 前端随请求传入的 body.apiKey（用户在设置页填写、保存在本浏览器，检测时随请求传给后端）；
//   ② 账号偏好（user-preferences.json）里保存的 zhuqueApiKey。
//   刻意不读 process.env.ZHUQUE_MAKERS_KEY：系统级 Key 模式已下线（不存服务端 env）。
function resolveKey(userId: string, bodyKey: string): string {
  const fromBody = String(bodyKey || '').trim()
  if (fromBody) return fromBody
  const rec = readStore()[userId]
  const fromPref = rec && rec.data ? String((rec.data as Record<string, unknown>).zhuqueApiKey || '').trim() : ''
  return fromPref
}

export async function POST(request: Request) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    let body: any = null
    try { body = await request.json() } catch { body = null }
    const text = body && typeof body.text === 'string' ? body.text : ''
    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: '正文太短（至少50字）' }, { status: 400 })
    }
    const apiKeyFromFrontend = body && typeof body.apiKey === 'string' ? body.apiKey : ''

    const key = resolveKey(actor.userId, apiKeyFromFrontend)
    if (!key) {
      // 🔥 没有官方 Key 时默认走「站内AI检测（朱雀口径本地代理）」：按朱雀公开的四维判定
      //   （困惑度/语义连贯/词汇分布/结构特征）逐块判定叙述说明段 vs 现场动作段，
      //   给出疑似AI占比与待改段落清单。口径与官方一致但结果为估计值。不报错，仅提示可填 Key 升级官方通道。
      const proxy = runZhuqueProxy(text, { threshold: 2.0 })
      return NextResponse.json({
        data: {
          source: 'zhuque-proxy',
          isOfficialZhuque: false,
          model: '站内AI检测·朱雀口径本地代理（困惑度/连贯/词汇分布/结构特征 四维）',
          humanRatio: proxy.humanRatio,
          aiRatio: proxy.aiRatio,
          suspectedRatio: proxy.suspectedRatio,
          softmaxConfidence: null,
          targetSuspectedRatio: proxy.targetSuspectedRatio,
          pass: proxy.pass,
          overallHumanScore: proxy.overallHumanScore,
          dimensions: proxy.dimensions,
          segments: proxy.segments,
          note: proxy.note + '（未配置朱雀 Key，已默认使用站内AI检测、不报错；可在设置中填入朱雀Key启用官方检测）',
        },
      })
    }

    const started = Date.now()
    const upstream = await fetch(ZHUQUE_API, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, is_merge: false }),
    })
    const raw = await upstream.text()
    let json: any = null
    try { json = JSON.parse(raw) } catch { /* 非 JSON */ }

    if (!upstream.ok || !json || json.error) {
      return NextResponse.json({
        error: '朱雀官方接口返回异常：' + String((json && json.error && (json.error.message || json.error)) || ('HTTP ' + upstream.status)).slice(0, 300),
      }, { status: 502 })
    }

    const labelsRatio = json.labels_ratio || {}
    const human = Number(labelsRatio['0'] || 0)
    const ai = Number(labelsRatio['1'] || 0)
    const suspected = Number(labelsRatio['2'] || 0)
    const segmentLabels = Array.isArray(json.segment_labels) ? json.segment_labels : []

    return NextResponse.json({
      data: {
        source: 'zhuque-official',
        isOfficialZhuque: true,
        model: '@makers/zhuque-text',
        humanRatio: Math.round(human * 1000) / 10,
        aiRatio: Math.round(ai * 1000) / 10,
        suspectedRatio: Math.round(suspected * 1000) / 10,
        softmaxConfidence: json.softmax_confidence !== undefined ? json.softmax_confidence : null,
        ratioConfidence: json.ratio_confidence !== undefined ? json.ratio_confidence : null,
        targetSuspectedRatio: ZHUQUE_SUSPECT_TARGET,
        pass: suspected * 100 <= ZHUQUE_SUSPECT_TARGET,
        segments: segmentLabels.map((s: any) => ({
          label: s.label,
          labelName: s.label === 0 ? '人工' : (s.label === 1 ? 'AI' : '疑似AI'),
          confidence: s.conf,
          length: String(s.text || '').length,
          head: String(s.text || '').slice(0, 40),
          text: s.text,
        })),
        usage: json.usage || null,
        elapsedMs: Date.now() - started,
        msg: json.msg || '',
      },
    })
  } catch (e) {
    console.error('[zhuque-detect] 失败:', e)
    return NextResponse.json({ error: '朱雀官方检测失败：' + String(e && (e as Error).message ? (e as Error).message : e) }, { status: 500 })
  }
}
