const path = '/www/wwwroot/tuzhong-wenshu/node_modules'
const { PrismaClient } = require(path + '/@prisma/client')
const bcrypt = require(path + '/bcryptjs')
const prisma = new PrismaClient()
;(async () => {
  const hash = await bcrypt.hash('leiyang0', 12)
  const u = await prisma.user.update({
    where: { username: 'kevin' },
    data: { password: hash },
    select: { id: true, username: true },
  })
  console.log('RESET_OK:', JSON.stringify(u))
  // 验证
  const again = await bcrypt.compare('leiyang0', hash)
  console.log('VERIFY_leiyang0:', again)
  await prisma.$disconnect()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })