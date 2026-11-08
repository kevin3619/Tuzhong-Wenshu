import { NextRequest, NextResponse } from 'next/server'
import { readResetToken } from '@/lib/password-reset'

// GET /api/auth/reset-password/validate-token?token=xxx
// 🔥 修复：前端 forgot-password 页一直在请求这个地址，但该路由此前并不存在
//   （校验逻辑写在 reset-password/request 的 GET 里），导致带 token 的链接永远校验失败，
//   重置表单压根不渲染 —— 找回密码功能整体不可用。
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    if (!token) {
      return NextResponse.json({ code: 400, message: '缺少token参数' }, { status: 400 })
    }
    const store = await readResetToken(token)
    if (!store) {
      return NextResponse.json({ code: 400, message: '重置链接无效或已过期' }, { status: 400 })
    }
    // 只回「有效」，不把 userId 等内部标识暴露给页面
    return NextResponse.json({ code: 200, message: '重置链接有效', data: { valid: true } })
  } catch (error) {
    console.error('token验证失败:', error)
    return NextResponse.json({ code: 500, message: '服务器错误' }, { status: 500 })
  }
}
