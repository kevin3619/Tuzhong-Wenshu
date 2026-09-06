// 查询数据库中《永历中兴》角色性格模板占用
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const n = await p.novel.findFirst({ where: { title: { contains: '永历' } } })
  if (!n) { console.log('NO_NOVEL'); await p.$disconnect(); return }
  console.log('ID', n.id, 'TITLE', n.title)
  const c = n.characters
  const all = []
  if (c && c.protagonist) all.push(['主角', c.protagonist])
  if (c && c.femaleLead) all.push(['女主', c.femaleLead])
  if (c && Array.isArray(c.antagonists)) c.antagonists.forEach((x) => all.push(['反派', x]))
  if (c && Array.isArray(c.supporting)) c.supporting.forEach((x) => all.push(['配角', x]))
  let hits = []
  all.forEach(([t, x]) => {
    if (x && x.name) {
      const ps = String(x.personality || '')
      if (/性格鲜明|独特原则|多面性的性格/.test(ps) && ps.length < 80) {
        hits.push(t + ':' + x.name + '=' + ps.slice(0, 50))
      }
    }
  })
  console.log('TOTAL', all.length, 'TPL_HITS', hits.length)
  hits.forEach((h) => console.log(h))
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })