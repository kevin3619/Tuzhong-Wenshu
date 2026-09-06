'use client'

import { useState, useEffect } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Crown, Check, Loader2, Clock, QrCode, RefreshCw } from 'lucide-react'
import Link from 'next/link'

interface PayRecItem {
  id: string
  orderNo: string
  amount: number
  planType: string
  channel: string
  status: number
  createdAt: string
  auditTime: string | null
}

// 🔥 修复问题3：VIP套餐统一权益列表，仅有效期和价格不同，用对比表突出差异
const VIP_SHARED_FEATURES = [
  '解锁多部作品创建',
  '无限生成章节',
  'AI智能润色',
  '封面生成',
  '签约检测',
  '优先客服',
]

const VIP_PLAN_POOL = [
  {
    type: 'month' as const,
    name: '月度会员',
    days: 30,
    price: 79.9,
    original: 79.9,
    desc: '30天有效期',
    color: 'ink',
    popular: false,
    features: VIP_SHARED_FEATURES,
  },
  {
    type: 'quarter' as const,
    name: '季度会员',
    days: 90,
    price: 219,
    original: 239.7,
    desc: '90天有效期 · 9折优惠',
    color: 'vermilion',
    popular: true,
    features: VIP_SHARED_FEATURES,
  },
  {
    type: 'year' as const,
    name: '年度会员',
    days: 365,
    price: 799,
    original: 958.8,
    desc: '365天有效期 · 约67折',
    color: 'bronze',
    popular: false,
    features: VIP_SHARED_FEATURES,
  },
  {
    type: 'lifetime' as const,
    name: '终身会员',
    days: 9999,
    price: 2199,
    original: 2599,
    desc: '永久有效 · 约85折 · 一次付费终身使用',
    color: 'jade',
    popular: false,
    isLifetime: true,
    features: [...VIP_SHARED_FEATURES, '专属终身纪念徽章', '后续所有新功能优先体验'],
  },
]

type PayStep = 'select' | 'wechat_qr'

export default function VipPage() {
  const _pickedPlanType = useState<string>('quarter')
  const pickedPlanType = _pickedPlanType[0]
  const setPickedPlanType = _pickedPlanType[1]
  const _activeStep = useState<PayStep>('select')
  const activeStep = _activeStep[0]
  const setActiveStep = _activeStep[1]
  const _submitProcessFlag = useState(false)
  const submitProcessFlag = _submitProcessFlag[0]
  const setSubmitProcessFlag = _submitProcessFlag[1]
  const _notifyMsg = useState('')
  const notifyMsg = _notifyMsg[0]
  const setNotifyMsg = _notifyMsg[1]
  const _payRecGroup = useState<PayRecItem[]>([])
  const payRecGroup = _payRecGroup[0]
  const setPayRecGroup = _payRecGroup[1]
  const _planPriceList = useState(VIP_PLAN_POOL)
  const planPriceList = _planPriceList[0]
  const setPlanPriceList = _planPriceList[1]

  const _wechatQrCodeUrl = useState('')
  const wechatQrCodeUrl = _wechatQrCodeUrl[0]
  const setWechatQrCodeUrl = _wechatQrCodeUrl[1]
  const _wechatPayOrderNo = useState('')
  const wechatPayOrderNo = _wechatPayOrderNo[0]
  const setWechatPayOrderNo = _wechatPayOrderNo[1]
  const _wechatPollInterval = useState<NodeJS.Timeout | null>(null)
  const wechatPollInterval = _wechatPollInterval[0]
  const setWechatPollInterval = _wechatPollInterval[1]

  // 订单倒计时
  const _orderExpireAt = useState<string>('')
  const orderExpireAt = _orderExpireAt[0]
  const setOrderExpireAt = _orderExpireAt[1]
  const _orderCountdown = useState(0)
  const orderCountdown = _orderCountdown[0]
  const setOrderCountdown = _orderCountdown[1]
  const _orderCountdownTimer = useState<ReturnType<typeof setInterval> | null>(null)
  const orderCountdownTimer = _orderCountdownTimer[0]
  const setOrderCountdownTimer = _orderCountdownTimer[1]

  useEffect(function () {
    pullSysConfig()
    pullPayRecords()
    return function () {
      if (wechatPollInterval) clearInterval(wechatPollInterval)
      if (orderCountdownTimer) clearInterval(orderCountdownTimer)
    }
  }, [])

  // 订单倒计时定时器
  useEffect(function () {
    if (!orderExpireAt) {
      setOrderCountdown(0)
      return
    }
    function updateCountdown() {
      const remain = Math.floor((new Date(orderExpireAt).getTime() - Date.now()) / 1000)
      if (remain <= 0) {
        setOrderCountdown(0)
        if (orderCountdownTimer) clearInterval(orderCountdownTimer)
      } else {
        setOrderCountdown(remain)
      }
    }
    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    setOrderCountdownTimer(timer)
    return function () { clearInterval(timer) }
  }, [orderExpireAt])

  function pullSysConfig() {
    fetch('/tuzhong-wenshu/api/config/public')
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.code !== 200) return
        const cfg = respBody.data || {}
        const newPlans = VIP_PLAN_POOL.map(function (p) {
          const priceKey = p.type === 'month' ? 'monthly_price' : p.type === 'quarter' ? 'quarterly_price' : p.type === 'year' ? 'yearly_price' : 'lifetime_price'
          const priceVal = parseFloat(cfg[priceKey] || '')
          if (!isNaN(priceVal) && priceVal > 0) {
            const orig = p.type === 'quarter' ? priceVal / 0.9 : p.type === 'year' ? priceVal / 0.67 : p.type === 'lifetime' ? priceVal / 0.84 : priceVal
            return { ...p, price: priceVal, original: Math.round(orig * 100) / 100 }
          }
          return p
        })
        setPlanPriceList(newPlans)
      })
      .catch(function () {})
  }

  function pullPayRecords() {
    const token = localStorage.getItem('token')
    fetch('/tuzhong-wenshu/api/payments', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.code === 200) setPayRecGroup(respBody.data)
      })
      .catch(function () {})
  }

  function getPickedPlan() {
    for (let i = 0; i < planPriceList.length; i++) {
      if (planPriceList[i].type === pickedPlanType) return planPriceList[i]
    }
    return planPriceList[0]
  }

  // 微信支付：生成二维码
  function launchWechatPay() {
    setSubmitProcessFlag(true)
    setNotifyMsg('')
    const token = localStorage.getItem('token')
    fetch('/tuzhong-wenshu/api/wechat/pay/qrcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ planType: pickedPlanType }),
    })
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.code === 200) {
          setWechatQrCodeUrl(respBody.data.codeUrl)
          setWechatPayOrderNo(respBody.data.orderNo)
          setOrderExpireAt(respBody.data.expireAt || '')
          setActiveStep('wechat_qr')
          beginOrderPolling(respBody.data.orderNo)
        } else {
          setNotifyMsg(respBody.message || '生成二维码失败')
        }
      })
      .catch(function () { setNotifyMsg('网络错误') })
      .finally(function () { setSubmitProcessFlag(false) })
  }

  // 轮询订单状态
  function beginOrderPolling(orderNo: string) {
    const timer = setInterval(function () {
      checkOrderStatus(orderNo)
    }, 3000)
    setWechatPollInterval(timer)
  }

  function checkOrderStatus(orderNo: string) {
    const token = localStorage.getItem('token')
    fetch('/tuzhong-wenshu/api/wechat/pay/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ orderNo: orderNo }),
    })
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.code !== 200) return
        if (respBody.data.status === 1) {
          if (wechatPollInterval) clearInterval(wechatPollInterval)
          setOrderExpireAt('')
          setNotifyMsg('支付成功！VIP会员已自动开通，页面将在3秒后刷新...')
          setTimeout(function () { window.location.reload() }, 3000)
        } else if (respBody.data.expired || respBody.data.status === 2) {
          if (wechatPollInterval) clearInterval(wechatPollInterval)
          setOrderExpireAt('')
          setNotifyMsg('订单已过期，请重新发起支付')
          setActiveStep('select')
          pullPayRecords()
        }
      })
      .catch(function () {})
  }

  function cancelPayFlow() {
    if (wechatPollInterval) clearInterval(wechatPollInterval)
    setOrderExpireAt('')
    setActiveStep('select')
    setNotifyMsg('')
  }

  function getPayStatusLabel(status: number) {
    if (status === 0) return { text: '待支付', color: 'text-amber-700 bg-amber-50' }
    if (status === 1) return { text: '支付成功', color: 'text-[var(--jade)] bg-[rgba(107,142,123,0.12)]' }
    if (status === 2) return { text: '已失效', color: 'text-stone-600 bg-stone-100' }
    return { text: '未知', color: 'text-stone-600 bg-stone-100' }
  }

  function getNotifyMsgClass() {
    const baseClass = 'mt-3 text-sm '
    if (notifyMsg.indexOf('成功') >= 0) {
      return baseClass + 'text-[var(--jade)]'
    }
    if (notifyMsg.indexOf('过期') >= 0) {
      return baseClass + 'text-[var(--vermilion)]'
    }
    return baseClass + 'text-amber-700'
  }

  function getPlanLabel(type: string) {
    if (type === 'month') return '月度会员'
    if (type === 'quarter') return '季度会员'
    if (type === 'year') return '年度会员'
    if (type === 'lifetime') return '终身会员'
    return type
  }

  function getDiscountTag(planItem: { price: number, original: number }) {
    if (planItem.price >= planItem.original) return null
    const savePercent = Math.round((1 - planItem.price / planItem.original) * 100)
    if (savePercent <= 0) return null
    return '省' + savePercent + '%'
  }

  const plan = getPickedPlan()

  return (
    <div className="min-h-screen bg-stone-50">
      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* 标题区 */}
        <div className="text-center mb-10">
          <Crown className="w-16 h-16 text-amber-600 mx-auto mb-4" />
          <h1 className="text-3xl font-serif-wenshu text-stone-900">开通VIP会员</h1>
          <p className="text-stone-600 mt-3 max-w-2xl mx-auto leading-relaxed">
            免费用户可创建并完整生成第1本作品；从第2本起需开通任意一档VIP会员方可继续生成
          </p>
        </div>

        {/* 套餐选择 */}
        {activeStep === 'select' && (
          <div className="animate-ink-fade">
            {/* 统一权益列表在顶部展示 */}
            <div className="wenshu-card overflow-hidden mb-8">
              <div className="wenshu-stripe h-1.5 w-full" />
              <div className="p-6">
                <h3 className="text-base font-serif-wenshu text-stone-900 mb-1">VIP会员专属权益</h3>
                <p className="text-xs text-stone-500 mb-4">所有套餐享受相同权益，仅有效期和价格不同</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {VIP_SHARED_FEATURES.map(function (f) {
                    return (
                      <div key={f} className="flex items-center gap-2 text-sm text-stone-700">
                        <Check className="w-4 h-4 text-[var(--vermilion)] flex-shrink-0" />
                        <span>{f}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 三档套餐价格对比卡片 - 突出有效期和价格差异 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 items-stretch">
              {planPriceList.map(function (planItem) {
                const isPicked = pickedPlanType === planItem.type
                const discountTag = getDiscountTag(planItem)
                let cardClass = 'wenshu-card overflow-hidden text-left relative flex flex-col transition-all '
                if (planItem.popular) {
                  cardClass += ' md:scale-[1.04] md:z-10 '
                }
                let borderColor = 'var(--border-ink)'
                if (isPicked) {
                  borderColor = 'var(--vermilion)'
                } else if (planItem.popular) {
                  borderColor = 'var(--vermilion-soft)'
                }
                return (
                  <button
                    key={planItem.type}
                    onClick={function () { setPickedPlanType(planItem.type) }}
                    className={cardClass}
                    style={{ borderWidth: '2px', borderColor: borderColor }}
                  >
                    <div className="wenshu-stripe h-1.5 w-full" />
                    {planItem.popular && (
                      <span className="wenshu-stamp absolute top-3 right-3 z-10">推荐</span>
                    )}
                    <div className="p-6 flex flex-col flex-1">
                      <h3 className="text-lg font-serif-wenshu text-stone-900 mb-1">{planItem.name}</h3>
                      <div className="flex items-center gap-1.5 mb-4">
                        <Clock className="w-4 h-4 text-stone-500" />
                        {planItem.type === 'lifetime' ? (
                          <>
                            <span className="text-2xl font-bold text-emerald-700">永久</span>
                            <span className="text-sm text-stone-500">有效 · 终身畅玩</span>
                          </>
                        ) : (
                          <>
                            <span className="text-2xl font-bold text-stone-900">{planItem.days}</span>
                            <span className="text-sm text-stone-500">天有效期</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-3xl font-bold text-stone-900">{'¥' + planItem.price}</span>
                        {planItem.price < planItem.original && (
                          <span className="text-sm text-stone-400 line-through">{'¥' + planItem.original}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-5 min-h-[22px]">
                        {discountTag && (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-[var(--vermilion)] bg-[rgba(200,54,77,0.08)] border border-[var(--vermilion-soft)] rounded">
                            {discountTag}
                          </span>
                        )}
                        {planItem.type === 'lifetime' && (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
                            一次付费 · 永久使用
                          </span>
                        )}
                      </div>
                      {planItem.type === 'lifetime' ? (
                        <div className="mb-4 text-center bg-gradient-to-r from-emerald-50 to-amber-50 rounded-lg py-2 border border-emerald-100">
                          <span className="text-emerald-700 text-sm font-bold">♾️ 永久会员 · 永不过期</span>
                        </div>
                      ) : (
                        <div className="mb-4 text-center bg-stone-50 rounded-lg py-2">
                          <span className="text-xs text-stone-500">日均仅需 </span>
                          <span className="text-lg font-bold text-[var(--vermilion)]">{'¥' + (planItem.price / planItem.days).toFixed(2)}</span>
                          <span className="text-xs text-stone-500">/天</span>
                        </div>
                      )}
                      <div className="mt-auto pt-4 border-t border-stone-100">
                        {isPicked ? (
                          <span className="flex items-center justify-center gap-1 text-sm font-medium text-[var(--vermilion)]">
                            <Check className="w-4 h-4" />
                            已选择
                          </span>
                        ) : (
                          <span className="flex items-center justify-center text-sm text-stone-400">
                            点击选择
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* 微信支付按钮 */}
            <div className="wenshu-card overflow-hidden mb-8">
              <div className="wenshu-stripe h-1.5 w-full" />
              <div className="p-5">
                <h3 className="text-base font-serif-wenshu text-stone-900 mb-4">选择支付方式</h3>
                <button
                  onClick={launchWechatPay}
                  disabled={submitProcessFlag}
                  className="flex items-center justify-center gap-3 h-[40px] px-6 bg-[#07C160] text-white rounded-[8px] text-sm font-medium hover:bg-[#06a854] transition-colors disabled:opacity-50"
                >
                  {submitProcessFlag && <Loader2 className="w-4 h-4 animate-spin" />}
                  {!submitProcessFlag && <QrCode className="w-4 h-4" />}
                  {'微信支付 · ¥' + plan.price}
                </button>
                {notifyMsg && (
                  <p className={getNotifyMsgClass()}>
                    {notifyMsg}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 微信支付：显示动态二维码 */}
        {activeStep === 'wechat_qr' && wechatQrCodeUrl && (
          <div className="wenshu-card overflow-hidden mb-8 text-center animate-ink-fade">
            <div className="wenshu-stripe h-1.5 w-full" />
            <div className="p-6">
              <h3 className="text-base font-serif-wenshu text-stone-900 mb-4">微信扫码支付</h3>
              <div className="bg-stone-50 rounded-[8px] inline-block p-4 mb-3">
                <QRCodeCanvas value={wechatQrCodeUrl} size={200} />
              </div>
              <p className="text-sm text-stone-600 mb-2">{'订单号：' + wechatPayOrderNo}</p>
              <p className="text-sm text-stone-600 mb-2">{'金额：¥' + plan.price + ' · ' + getPlanLabel(pickedPlanType)}</p>
              {orderCountdown > 0 && (
                <p className="text-sm text-[var(--vermilion)] mb-4">
                  {'请在 ' + Math.floor(orderCountdown / 60) + ':' + (orderCountdown % 60).toString().padStart(2, '0') + ' 内完成支付，超时订单将自动取消'}
                </p>
              )}
              {orderCountdown === 0 && orderExpireAt && (
                <p className="text-sm text-stone-500 mb-4">订单已过期，请重新发起支付</p>
              )}
              <div className="flex items-center justify-center gap-2 text-sm text-[var(--vermilion)] mb-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>等待扫码支付... 正在自动查询订单状态</span>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={cancelPayFlow}
                  className="wenshu-btn-secondary px-4 h-[36px] rounded-[6px] text-sm"
                >
                  取消返回
                </button>
                <button
                  onClick={function () { checkOrderStatus(wechatPayOrderNo) }}
                  className="wenshu-btn-primary flex items-center gap-1 px-4 h-[36px] rounded-[6px] text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  手动刷新
                </button>
              </div>
              {notifyMsg && (
                <p className={getNotifyMsgClass()}>
                  {notifyMsg}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 历史订单列表 */}
        {payRecGroup.length > 0 && (
          <div className="wenshu-card overflow-hidden">
            <div className="wenshu-stripe h-1.5 w-full" />
            <div className="px-5 py-4 border-b border-stone-200">
              <h3 className="font-serif-wenshu text-stone-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                我的订单
              </h3>
            </div>
            <div className="divide-y divide-stone-100">
              {payRecGroup.map(function (item) {
                const status = getPayStatusLabel(item.status)
                return (
                  <div key={item.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {getPlanLabel(item.planType) + ' · 微信支付'}
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        {'订单号: ' + item.orderNo + ' · ¥' + item.amount + ' · ' + new Date(item.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <span className={'px-3 py-1 rounded-full text-xs font-medium ' + status.color}>
                      {status.text}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
