import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // 创建管理员账号
  const adminPassword = await bcrypt.hash('admin123', 10)
  const existingAdmin = await prisma.user.findFirst({ where: { isAdmin: true } })
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        username: 'admin',
        password: adminPassword,
        nickname: '管理员',
        isAdmin: true,
        status: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    console.log('✅ 管理员账号已创建: admin / admin123')
  } else {
    console.log('ℹ️ 管理员账号已存在')
  }

  // 修复：开发/测试环境中，如果存在微信登录账号（wx_xxx），也将其设为管理员
  const wxKevin = await prisma.user.findFirst({
    where: { username: { startsWith: 'wx_' } },
    orderBy: { createdAt: 'asc' },
  })
  if (wxKevin && !wxKevin.isAdmin) {
    await prisma.user.update({
      where: { id: wxKevin.id },
      data: {
        isAdmin: true,
        nickname: 'Kevin',
        subscriptionTier: 'lifetime',
        subscriptionStartedAt: new Date().toISOString(),
        subscriptionExpiresAt: '2099-12-31T23:59:59.999Z',
        status: 1,
        updatedAt: new Date().toISOString(),
      },
    })
    console.log('✅ 微信登录账号已设为管理员:', wxKevin.username)
  }

  // 创建默认系统配置
  const configs = [
    { key: 'app_name', value: '途中文枢' },
    { key: 'app_version', value: '2.0.0' },
    { key: 'copyright', value: '© 2026 途中文枢' },
    { key: 'monthly_price', value: '79.9' },
    { key: 'quarterly_price', value: '219' },
    { key: 'yearly_price', value: '799' },
    { key: 'default_model', value: 'deepseek' },
    { key: 'default_api_url', value: '' },
    { key: 'default_api_key', value: '' },
    { key: 'wechat_appid', value: 'wxd0648ff37ea1f7ef' },
    { key: 'wechat_appsecret', value: '39ba294dcb6402573650d9a2ab07383c' },
  ]

  for (const config of configs) {
    const existing = await prisma.systemConfig.findFirst({ where: { configKey: config.key } })
    if (!existing) {
      await prisma.systemConfig.create({
        data: {
          configKey: config.key,
          configValue: config.value,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
    }
  }
  console.log('✅ 系统配置已初始化')
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })