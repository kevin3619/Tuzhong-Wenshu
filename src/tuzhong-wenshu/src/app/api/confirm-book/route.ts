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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
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
    } = body
    
    if (!title || !title.trim()) {
      return NextResponse.json({
        success: false,
        error: '书名不能为空',
      }, { status: 400 })
    }
    
    const result = saveConfirmedBook({
      title: title.trim(),
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
      confirmedBy: confirmedBy || 'user',
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
