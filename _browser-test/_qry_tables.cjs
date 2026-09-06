// 查询 SQLite 中所有表里哪些含《永历中兴》，并检查 characters 表模板占用
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  // world_settings 表结构探查
  const ws = await p.worldSetting.findMany({ take: 20 })
  console.log('world_settings count(sample)', ws.length)
  ws.forEach((w) => {
    const tid = String(w.title || w.novelId || w.id || '').includes('永历') ? ' <<<永历>>>' : ''
    console.log('WS', w.id, 'novelId=', w.novelId, 'title=', (w.title || '').slice(0, 20), tid)
  })
  // characters 表
  const ch = await p.character.findMany({ take: 5 })
  console.log('characters sample', ch.length)
  ch.forEach((c) => console.log('CH', c.id, 'novelId=', c.novelId, 'name=', (c.name || '').slice(0, 20)))
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })