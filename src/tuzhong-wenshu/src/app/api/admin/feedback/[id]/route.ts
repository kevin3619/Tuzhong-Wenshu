import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

// 管理员回复/更新反馈状态
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const { reply, status } = body

    const updateData: { updatedAt: string; reply?: string; status?: number } = { updatedAt: new Date().toISOString() }
    if (typeof reply === 'string') updateData.reply = reply.trim()
    if (typeof status === 'number') updateData.status = status

    const updated = await prisma.feedback.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('[admin/feedback PATCH] 错误:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, message: '更新失败' }, { status: 500 })
  }
}

// 管理员删除反馈
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })

  try {
    const { id } = await params
    await prisma.feedback.delete({ where: { id } })
    return NextResponse.json({ success: true, message: '已删除' })
  } catch (error) {
    console.error('[admin/feedback DELETE] 错误:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, message: '删除失败' }, { status: 500 })
  }
}
