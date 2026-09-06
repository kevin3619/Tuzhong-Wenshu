const bcrypt = require('bcryptjs')
const { PrismaClient } = require('../node_modules/@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const now = new Date().toISOString()
  const kevinHash = await bcrypt.hash('kevin123', 10)
  const userHash = await bcrypt.hash('user123', 10)
  const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()

  const kevin = await prisma.user.upsert({
    where: { username: 'kevin' },
    update: {
      password: kevinHash,
      nickname: 'Kevin',
      // 🔥 修复：不再默认分配邮箱，用户可自行维护
      email: null,
      isAdmin: true,
      subscriptionTier: 'lifetime',
      subscriptionStartedAt: now,
      subscriptionExpiresAt: '2099-12-31T23:59:59.999Z',
      status: 1,
      updatedAt: now,
    },
    create: {
      username: 'kevin',
      password: kevinHash,
      nickname: 'Kevin',
      // 🔥 修复：不再默认分配邮箱，用户可自行维护
      email: null,
      isAdmin: true,
      subscriptionTier: 'lifetime',
      subscriptionStartedAt: now,
      subscriptionExpiresAt: '2099-12-31T23:59:59.999Z',
      status: 1,
      createdAt: now,
      updatedAt: now,
    },
  })

  // 注意：不再把任何 wx_ 用户自动设为管理员。管理员固定为 kevin 账号（见上方 upsert），
  // 微信登录会在回调中把 kevin 账号与微信 openid 绑定（见 src/lib/wechat.ts）。

  const demo = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {
      password: userHash,
      nickname: '普通用户',
      // 🔥 修复：不再默认分配邮箱，用户可自行维护
      email: null,
      isAdmin: false,
      subscriptionTier: 'yearly',
      subscriptionStartedAt: now,
      subscriptionExpiresAt: future,
      status: 1,
      updatedAt: now,
    },
    create: {
      username: 'demo',
      password: userHash,
      nickname: '普通用户',
      // 🔥 修复：不再默认分配邮箱，用户可自行维护
      email: null,
      isAdmin: false,
      subscriptionTier: 'yearly',
      subscriptionStartedAt: now,
      subscriptionExpiresAt: future,
      status: 1,
      createdAt: now,
      updatedAt: now,
    },
  })

  // 也给 demo 用户在数据库里放 2 本小说，保证双重数据源都能被读到
  await prisma.novel.deleteMany({ where: { userId: demo.id } })
  await prisma.novel.createMany({
    data: [
      {
        userId: demo.id,
        title: '测试DB小说1',
        description: '保存在数据库的测试小说1',
        genre: '玄幻',
        status: 'writing',
        currentWordCount: 3000,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: demo.id,
        title: '测试DB小说2',
        description: '保存在数据库的测试小说2',
        genre: '都市',
        status: 'completed',
        currentWordCount: 20000,
        createdAt: now,
        updatedAt: now,
      },
    ],
  })

  console.log('seeded:', { kevin: !!kevin.id, demo: !!demo.id })
}

main()
  .catch(e => { console.error('SEED ERR:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
