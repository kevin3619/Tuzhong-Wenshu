import { chromium } from "playwright";
import path from "path";
const ROOT = "D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro";
const ctx = await chromium.launchPersistentContext(path.join(ROOT, "edge-profile-verify"), { channel: "msedge", headless: false, viewport:{width:1500,height:2200} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("http://localhost:3001/tuzhong-wenshu", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} });
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(()=>console.log('草稿箱 fail'));
await page.waitForTimeout(2000);
const cont = page.getByText('继续生成', { exact: true }).first();
if (await cont.count()) { await cont.click({ timeout: 8000 }).catch(()=>{}); await page.waitForTimeout(4000); }
// 1) 顶部导航按钮 + 是否有模型指示
const navInfo = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent!==null).map(b=>(b.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  return { buttons: buttons.slice(0,120), bodyHasModelText: /智能模型|DeepSeek|模型|大模型/.test(document.body.innerText), modelSnippets: (document.body.innerText.match(/.{0,20}(智能模型|DeepSeek|调用当前模型|大模型).{0,40}/g)||[]).slice(0,20) };
});
console.log("=== 导航按钮 & 模型指示 ===");
console.log(JSON.stringify(navInfo, null, 2));
await page.screenshot({ path: "D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro\\issue1_top.png" }).catch(()=>{});
await ctx.close().catch(()=>{}); process.exit(0);