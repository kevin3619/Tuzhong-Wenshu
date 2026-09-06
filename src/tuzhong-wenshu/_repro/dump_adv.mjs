import { chromium } from "playwright";
import path from "path";
const ROOT = "D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro";
const ctx = await chromium.launchPersistentContext(path.join(ROOT, "edge-profile-verify"), { channel: "msedge", headless: false, viewport:{width:1400,height:900} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("http://localhost:3001/tuzhong-wenshu", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
const DRAFT = "d2010e15-03a4-4197-aca5-f572af6e9d94";
const res = await page.evaluate((id) => {
  const d = JSON.parse(localStorage.getItem("tuzhong-draft-data-"+id) || "{}");
  const ch = d.characters || {};
  const ADV = ["aliases","birthplace","realmLevel","coreMotivation","skills","weapons","techniques","hiddenTraits","weaknesses","experience","relationships","network"];
  const snap = (c) => {
    if (!c) return null;
    const o = { name: c.name, identity: c.identity, title: c.title, role: c.role, job: c.job };
    ADV.forEach(k => {
      const v = c[k];
      o[k] = v==null ? "" : (Array.isArray(v) ? (v.length+"项:"+v.slice(0,3).join("/")) : String(v).slice(0,60));
    });
    return o;
  };
  const arr = [];
  ["protagonist","femaleLead"].forEach(k=>{ if(ch[k]) arr.push(snap(ch[k])); });
  (ch.supporting||[]).forEach(c=>arr.push(snap(c)));
  (ch.antagonists||[]).forEach(c=>arr.push(snap(c)));
  return arr;
}, DRAFT);
console.log(JSON.stringify(res, null, 1));
await ctx.close().catch(()=>{}); process.exit(0);