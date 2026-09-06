import { chromium } from "playwright";
import path from "path";
const ROOT = "D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro";
const SHOT = "D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro\\";
const ctx = await chromium.launchPersistentContext(path.join(ROOT, "edge-profile-verify"), { channel: "msedge", headless: false, viewport:{width:1500,height:2400} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("http://localhost:3001/tuzhong-wenshu", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} });
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(()=>{});
await page.waitForTimeout(2000);
const cont = page.getByText('继续生成', { exact: true }).first();
if (await cont.count()) { await cont.click({ timeout: 8000 }).catch(()=>{}); await page.waitForTimeout(4000); }

// ===== Issue 2: 主要人物设定 - 进阶设定 tab =====
await page.locator('button:has-text("主要人物设定")').first().click().catch(()=>{});
await page.waitForTimeout(1800);
// 点击第一个角色的「进阶设定」标签
const advTab = page.locator('button:has-text("进阶设定")').first();
if (await advTab.count()) { await advTab.click().catch(()=>{}); await page.waitForTimeout(1500); }
await page.screenshot({ path: SHOT + "issue2_adv.png" }).catch(()=>{});

// 提取进阶设定区域所有可见 label 与值（textcontent 简版）
const i2 = await page.evaluate(() => {
  const advTabEl = Array.from(document.querySelectorAll('button')).find(b=>(b.textContent||'').trim()==='进阶设定');
  // 找标签所在卡片容器
  let card = advTabEl; for(let i=0;i<8&&card;i++){card=card.parentElement; if(card&&card.offsetParent!==null && (card.textContent||'').length>150 && (card.textContent||'').indexOf('对外关系')+card.textContent.indexOf('进阶')>-50) break;}
  return { found: !!advTabEl, cardText: card ? (card.textContent||'').replace(/\s+/g,' ').slice(0,1500) : 'none' };
});
console.log("=== Issue2 进阶设定 ===");
console.log(JSON.stringify(i2, null, 2));

await ctx.close().catch(()=>{}); process.exit(0);