// 在 SQLite 所有表中搜索"永历"，确定草稿存储位置
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const { execSync } = require('child_process')
const db = 'prisma/tuzhong.db'

function tableColumns(name) {
  const out = execSync(`sqlite3 ${db} "PRAGMA table_info(${name});"`, { encoding: 'utf8' })
  return out.trim().split('\n').map((l) => { const c = l.split('|'); return c[1] }).filter(Boolean)
}

// 需要 Prisma client 访问不了 raw，用 schema 已知表名
const tables = ['novels', 'chapters', 'volumes', 'world_settings', 'character_relationships', 'characters', 'users', 'payments', 'ai_model_configs', 'writing_styles', 'reference_works', 'system_config', 'feedbacks', 'foreshadowings', 'tomato_reports']
for (const t of tables) {
  try {
    let cols = tableColumns(t)
    if (!cols.length) continue
    // 找文本列
    const findSql = cols.map((c) => `CAST(${c} AS TEXT) LIKE '%永历%'`).join(' OR ')
    const cnt = execSync(`sqlite3 ${db} "SELECT count(*) FROM ${t} WHERE ${findSql};"`, { encoding: 'utf8' }).trim()
    if (Number(cnt) > 0) console.log('FOUND 永历 in', t, 'count=', cnt, 'cols=', cols.join(','))
  } catch (e) { /* skip */ }
}