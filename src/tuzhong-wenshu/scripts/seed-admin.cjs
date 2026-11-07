const bcrypt = require('bcryptjs')
const { PrismaClient } = require('../node_modules/@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()

  // 🔥 2026-11-07 修复：改为「仅当用户不存在时才创建」。
  //   旧实现用 upsert + update 块：每次部署都会把 kevin 密码重置为 kevin123、
  //   nickname 改回 Kevin、email 清空，并且 deleteMany 掉 demo 名下的真实小说。
  //   现在既有账号一律不动，只在账号缺失时才建默认账号（首次部署/新库仍能开箱可用）。
  let kevin = await prisma.user.findUnique({ where: { username: 'kevin' } })
  if (kevin) {
    console.log('[seed] kevin 已存在，跳过（不重置密码/昵称/邮箱/订阅）')
  } else {
    const kevinHash = await bcrypt.hash('kevin123', 10)
    kevin = await prisma.user.create({
      data: {
        username: 'kevin',
        password: kevinHash,
        nickname: 'Kevin',
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
    console.log('[seed] kevin 已创建（默认密码 kevin123，请尽快修改）')
  }

  // 注意：不再把任何 wx_ 用户自动设为管理员。管理员固定为 kevin 账号（见上方创建），
  // 微信登录会在回调中把 kevin 账号与微信 openid 绑定（见 src/lib/wechat.ts）。

  let demo = await prisma.user.findUnique({ where: { username: 'demo' } })
  const demoIsNew = !demo
  if (demo) {
    console.log('[seed] demo 已存在，跳过（不重置密码/资料/小说）')
  } else {
    const userHash = await bcrypt.hash('user123', 10)
    demo = await prisma.user.create({
      data: {
        username: 'demo',
        password: userHash,
        nickname: '普通用户',
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
    console.log('[seed] demo 已创建（默认密码 user123）')
  }

  // 仅在 demo 新建时才放 2 本示例小说；既有 demo 的数据不再删除/覆盖
  if (demoIsNew) {
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
  }

  console.log('seeded:', { kevin: !!kevin.id, demo: !!demo.id, demoIsNew })
}

main()
  .catch(e => { console.error('SEED ERR:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
