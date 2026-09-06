// 查永历(NID)的Character记录中，有多少命中模板占位性格/动机
const path = '/www/wwwroot/tuzhong-wenshu/node_modules'
const { PrismaClient } = require(path + '/@prisma/client')
const prisma = new PrismaClient()
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
;(async () => {
  const chars = await prisma.character.findMany({
    where: { novelId: NID },
    select: { id: true, name: true, rolePosition: true, personality: true, motivation: true, goal: true, job: true, powerLevel: true }
  })
  console.log('CHAR_COUNT=', chars.length)
  const tpl = ['性格鲜明','为人处世有其独特原则','多面性的性格','有着自己的坚持和信念','在故事中展现出','形象独特','关键角色','重要人物','神秘人物']
  let tplHits = 0
  for (const c of chars) {
    let fields = [c.personality, c.motivation, c.goal].map(v => v || '')
    const hit = fields.some(f => tpl.some(t => f.includes(t)))
    if (hit) {
      tplHits++
      console.log('TPL_HIT name=', c.name, '| role=', c.rolePosition, '| personality=', (c.personality||'').slice(0,40), '| motivation=', (c.motivation||'').slice(0,40))
    }
  }
  console.log('TPL_HITS=', tplHits, '/', chars.length)
  // 列出所有角色名字与 key 字段是否空
  for (const c of chars) {
    const empty = { p:!(c.personality&&c.personality.trim()), m:!(c.motivation&&c.motivation.trim()), g:!(c.goal&&c.goal.trim()), job:!(c.job&&c.job.trim()), pw:!(c.powerLevel&&c.powerLevel.trim()) }
    console.log('  name=', c.name, 'role=', c.rolePosition, JSON.stringify(empty))
  }
  await prisma.$disconnect()
})().catch(e => { console.error('FATAL', e); process.exit(1) })