/**
 * 保存用户确认的书籍数据 API
 * 
 * 功能：
 * 1. 接收用户确认的正确书籍数据
 * 2. 保存到持久化存储中
 * 3. 下次搜索时优先返回已确认的数据
 */

import { NextRequest, NextResponse } from 'next/server'
import { saveConfirmedBook, getConfirmedBook } from '@/lib/book-sources/confirmed-storage'
import { getRequestActor } from '@/lib/permissions'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    // 🔥 修复（P1 全局库投毒）：这里写入的是**所有用户共享**的确认书目库，
    //   book-search 会以 confidence=100 优先回灌、auto-book-analysis 又把这些字段
    //   直接拼进「铁律数据」提示词。旧实现不校验登录、不限长度、不限频
    //   → 任何登录用户都能往全站搜索结果和其它用户的生成提示词里注入任意文本。
    const actor = await getRequestActor(req)
    if (!actor.userId) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 })
    }
    const rl = checkRateLimit('confirm-book:' + actor.userId, 20, 10 * 60 * 1000, 10 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: '操作过于频繁，请稍后再试' }, { status: 429 })
    }
    const rawBody = await req.json()
    const body: Record<string, unknown> = (rawBody && typeof rawBody === 'object') ? (rawBody as Record<string, unknown>) : {}
    const bounded = (v: unknown, max: number): string =>
      (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '')
    
    const {
      title,
      author,
      genre,
      status,
      totalWords,
      totalChapters,
      protagonistName,
      protagonistDescription,
      femaleLeadName,
      femaleLeadDescription,
      synopsis,
      tags,
      confirmedBy,
    } = body as Record<string, any>
    
    if (!title || !String(title).trim()) {
      return NextResponse.json({
        success: false,
        error: '书名不能为空',
      }, { status: 400 })
    }
    
    const result = saveConfirmedBook({
      title: String(title).trim().slice(0, 60),
      author: author || '',
      genre: genre || '',
      status: status || '',
      totalWords: totalWords || '',
      totalChapters: Number(totalChapters) || 0,
      protagonistName: protagonistName || '',
      protagonistDescription: protagonistDescription || '',
      femaleLeadName: femaleLeadName || '',
      femaleLeadDescription: femaleLeadDescription || '',
      synopsis: synopsis || '',
      tags: tags || [],
      confirmedAt: new Date().toISOString(),
      // 记录真实归属，便于事后追溯（不再统一写 'user'）
      confirmedBy: typeof confirmedBy === 'string' && confirmedBy ? bounded(confirmedBy, 80) : (actor.isAdmin ? 'admin:' + actor.userId : actor.userId),
    })
    
    if (result) {
      console.log(`[confirm-book] 已保存确认数据: ${title}`)
      return NextResponse.json({
        success: true,
        message: '数据已保存',
      })
    } else {
      return NextResponse.json({
        success: false,
        error: '保存失败',
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('[confirm-book] 错误:', error)
    return NextResponse.json({
      success: false,
      error: '保存失败，请稍后重试',
    }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const title = searchParams.get('title')
    
    if (!title || !title.trim()) {
      return NextResponse.json({
        success: false,
        error: '请提供书名',
      }, { status: 400 })
    }
    
    const confirmed = getConfirmedBook(title)
    
    if (confirmed) {
      return NextResponse.json({
        success: true,
        data: confirmed,
        isConfirmed: true,
      })
    } else {
      return NextResponse.json({
        success: true,
        data: null,
        isConfirmed: false,
      })
    }
    
  } catch (error) {
    console.error('[confirm-book GET] 错误:', error)
    return NextResponse.json({
      success: false,
      error: '查询失败',
    }, { status: 500 })
  }
}
