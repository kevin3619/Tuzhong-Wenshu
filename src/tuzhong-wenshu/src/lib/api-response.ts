/**
 * API 统一响应格式工具（修复 v6 Q6：API 响应格式不统一）
 *
 * 统一格式：{ success: boolean, data?: T, error?: string, code?: number }
 *
 * 使用方式：
 *   return apiSuccess(data)                    // 200 { success: true, data }
 *   return apiError('错误信息', 400)            // 400 { success: false, error: '错误信息' }
 *   return apiError('服务器错误', 500, true)    // 500 生产环境脱敏
 */

import { NextResponse } from 'next/server'

/**
 * 成功响应
 */
export function apiSuccess<T>(data: T, message?: string, status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      code: 200,
      data,
      ...(message ? { message } : {}),
    },
    { status }
  )
}

/**
 * 错误响应
 * @param message 错误消息
 * @param status HTTP 状态码
 * @param isProdSafe 生产环境是否脱敏（true 时生产环境返回通用消息）
 * @param internalError 内部错误详情（仅记录到日志，不返回客户端）
 */
export function apiError(
  message: string,
  status: number = 400,
  isProdSafe: boolean = false,
  internalError?: unknown
) {
  if (internalError) {
    console.error('[apiError]', message, internalError instanceof Error ? internalError.message : String(internalError))
  }

  const isProd = process.env.NODE_ENV === 'production'
  const clientMessage = isProdSafe && isProd ? '服务器内部错误，请稍后重试' : message

  return NextResponse.json(
    {
      success: false,
      code: status,
      error: clientMessage,
      ...(isProdSafe && internalError && !isProd ? { detail: internalError instanceof Error ? internalError.message : String(internalError) } : {}),
    },
    { status }
  )
}

/**
 * 分页成功响应
 */
export function apiSuccessWithPagination<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return NextResponse.json({
    success: true,
    code: 200,
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
