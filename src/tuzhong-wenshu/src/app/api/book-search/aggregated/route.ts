import { NextResponse } from 'next/server'
import { searchAggregated } from '@/lib/book-sources/aggregated-search'

/**
 * GET /api/book-search/aggregated?keyword=xxx&limit=20
 * 聚合搜索引擎书源（移植 owllook / howie6879 架构：通用搜索引擎聚合 + 规则解析）
 * 目的：绕过番茄官方 API 的 invalid client 与起点榜单页 202 反爬。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const keyword = String(searchParams.get('keyword') || searchParams.get('q') || '').trim()
    const limit = Math.min(30, Math.max(1, Number(searchParams.get('limit') || 20)))
    if (!keyword) return NextResponse.json({ error: '缺少 keyword 参数' }, { status: 400 })
    const results = await searchAggregated(keyword, limit)
    return NextResponse.json({ data: results, count: results.length, keyword, source: 'aggregated-search' })
  } catch (e: any) {
    return NextResponse.json({ error: '搜索失败：' + String(e?.message || e) }, { status: 500 })
  }
}
