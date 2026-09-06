import { NextRequest, NextResponse } from 'next/server'
import { processWxOauthCallback, stampWxScanFlag } from '@/lib/wechat'

// 微信开放平台OAuth回调接口
// 微信用户扫码确认后，微信服务器重定向到此接口
// 修复：回调在 iframe 中执行（内嵌二维码模式），需返回 HTML 页面通过 window.top.location 跳出 iframe
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const authCode = searchParams.get('code')
  const tokenKey = searchParams.get('state')

  // 缺少参数：返回错误页
  if (!authCode || !tokenKey) {
    return buildRedirectHtml('/login?error=' + encodeURIComponent('授权已取消'))
  }

  try {
    // 标记已扫码
    await stampWxScanFlag(tokenKey)
    console.log('[微信回调] 已标记扫码状态, tokenKey=' + tokenKey)

    const callbackResult = await processWxOauthCallback(authCode, tokenKey)

    if (callbackResult.runCheckTag) {
      console.log('[微信回调] OAuth处理成功, tokenKey=' + tokenKey)
      // 构建跳转URL：父窗口（登录页）通过 wechat_token 参数完成登录
      const params = new URLSearchParams()
      params.set('wechat_token', callbackResult.jwtToken!)
      params.set('wechat_state', tokenKey)
      return buildRedirectHtml('/login?' + params.toString(), true, callbackResult.wxNickname || '')
    }

    // OAuth失败：跳转回登录页并显示错误
    console.error('[微信回调] OAuth处理失败:', callbackResult.promptMsg)
    return buildRedirectHtml('/login?error=' + encodeURIComponent(callbackResult.promptMsg || '微信登录失败，请重试'), false)
  } catch (_err) {
    console.error('[微信回调] 服务器异常:', _err)
    return buildRedirectHtml('/login?error=' + encodeURIComponent('微信登录失败，请重试'), false)
  }
}

// 构建HTML页面：通过 window.top.location 跳出 iframe，重定向父窗口
// success=true 显示成功提示，success=false 显示错误提示
function buildRedirectHtml(targetPath: string, success: boolean = false, nickname: string = ''): NextResponse {
  const fullPath = targetPath.startsWith('/') ? '/tuzhong-wenshu' + targetPath : targetPath
  const icon = success ? '✓' : '✗'
  const iconColor = success ? '#07C160' : '#F53F3F'
  const message = success ? '微信登录成功' + (nickname ? '，欢迎 ' + nickname : '') + '，正在跳转...' : '微信登录失败，请关闭重试'

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信登录</title>' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa;}' +
    '.card{text-align:center;padding:40px;}' +
    '.icon{width:64px;height:64px;border-radius:50%;background:' + iconColor + ';color:#fff;font-size:32px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;}' +
    '.msg{font-size:16px;color:#4e5969;margin:0;}' +
    '</style></head><body>' +
    '<div class="card">' +
    '<div class="icon">' + icon + '</div>' +
    '<p class="msg">' + message + '</p>' +
    '</div>' +
    '<script>' +
    'try{' +
    'window.top.location.href=' + JSON.stringify(fullPath) + ';' +
    '}catch(e){' +
    'try{window.location.href=' + JSON.stringify(fullPath) + ';}catch(e2){}' +
    '}' +
    '</script>' +
    '</body></html>'

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
