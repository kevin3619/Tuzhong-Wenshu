const { execSync } = require('child_process')
const base = 'd:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\src'
const { spawnSync } = require('child_process')
const r = spawnSync('rg', ['-l', 'ai-generate-wizard', base, '-g', '*.tsx'], { encoding: 'utf8' })
console.log('--- files importing ai-generate-wizard ---')
console.log(r.stdout)
console.log(r.stderr)