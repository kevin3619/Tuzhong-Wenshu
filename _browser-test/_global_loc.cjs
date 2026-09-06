// 全盘定位所有 settings.json 及其中含草稿 id / 朱由崧 的文件
const fs = require('fs')
const path = require('path')
const roots = ['/www/wwwroot/tuzhong-wenshu', '/www/wwwroot', '/root', '/tmp']
const hits = []
function walk(d, depth) {
  if (depth > 5) return
  let entries
  try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
  for (const en of entries) {
    if (en.name === 'node_modules' || en.name === '.next' || en.name === '.git') continue
    const full = path.join(d, en.name)
    if (en.isDirectory()) { walk(full, depth + 1); continue }
    if (en.name === 'settings.json' || en.name === 'novels.json' || en.name.endsWith('.db')) {
      try {
        const buf = fs.readFileSync(full)
        const tag = []
        if (buf.includes('40249ecb')) tag.push('HAS_ID')
        if (buf.includes('朱由崧')) tag.push('HAS_CHAR')
        if (buf.includes('永历')) tag.push('HAS_YONGLI')
        hits.push({ full, size: buf.length, tag: tag.join('+') })
      } catch (e) {}
    }
  }
}
for (const r of roots) walk(r, 0)
hits.forEach((h) => console.log(h.tag || '(none)', h.full, h.size))

// 确认当前 settings route 用的 cwd
const procCwd = fs.readFileSync('/proc/1/cwd', 'utf8').trim().toString() || ''
console.log('PROC_CWD', procCwd)
try { const c = require('child_process').execSync('ls -la /www/wwwroot/tuzhong-wenshu/.tuzhong-data/settings.json').toString(); console.log(c) } catch (e) { console.log('settings.json not at expected', e.message) }