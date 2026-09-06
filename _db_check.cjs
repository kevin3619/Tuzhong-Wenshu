const path = '/www/wwwroot/tuzhong-wenshu/node_modules'
const { PrismaClient } = require(path + '/@prisma/client')
const bcrypt = require(path + '/bcryptjs')
const prisma = new PrismaClient()
;(async () => {
  const users = await prisma.user.findMany({ select: { id: true, username: true, status: true, password: true } })
  console.log('USER_COUNT:', users.length)
  for (const u of users) {
    console.log('USER:', JSON.stringify({ username: u.username, status: u.status, passPrefix: (u.password || '').slice(0, 7) }))
    for (const pw of ['leiyang0', 'leiyang*0', 'kevin123', 'kevin']) {
      let ok = false
      try { ok = await bcrypt.compare(pw, u.password) } catch (e) { console.log('CMP_ERR', pw, e.message) }
      console.log(`  pw="${pw}" match=${ok}`)
    }
  }
  await prisma.$disconnect()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })