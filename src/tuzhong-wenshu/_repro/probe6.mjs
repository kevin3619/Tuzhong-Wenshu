import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), { channel: 'msedge', headless: true })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)
const out = await page.evaluate(() => {
  const theme = JSON.parse(localStorage.getItem('tuzhong-draft-theme-d2010e15-03a4-4197-aca5-f572af6e9d94') || '{}')
  const d = theme.detailedDesignInput || ''
  // 提取"角色"小节里的女性角色定义块（名字 + 身份标记）
  const femaleBlocks = []
  const lines = d.split('\n')
  // 找名字像女性的条目
  const femNames = ['王皇后','桂王妃','皇后','阿珍','侍女','大小姐','小姐','沈','艳','婉','芸','柳','苏','明','嫣','小娘','娘亲','妻子','夫人']
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (/\|(\s*)([^|]{2,8}?)(\s*)\|.*(皇后|王妃|妻子|夫人|侍女|女儿|姐姐|母亲|妹妹)/.test(lines[i])) {
      hits.push(lines[i].trim())
    }
  }
  // 反向昵称判定的一些特征
  return {
    femaleLikeLines: hits.slice(0, 40),
    has王皇后: d.includes('王皇后'),
    has皇后: d.includes('皇后'),
    has侍女: d.includes('侍女'),
    has阿珍: d.includes('阿珍'),
  }
})
fs.writeFileSync(path.join(ROOT, 'fl_probe2.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await ctx.close().catch(() => {}); process.exit(0)