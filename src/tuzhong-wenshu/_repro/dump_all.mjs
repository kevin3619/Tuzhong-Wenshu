import { chromium } from "playwright";
import path from "path";
const ROOT = "D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro";
const DRAFT = "d2010e15-03a4-4197-aca5-f572af6e9d94";
const ctx = await chromium.launchPersistentContext(path.join(ROOT, "edge-profile-verify"), { channel: "msedge", headless: false, viewport:{width:1500,height:950} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("http://localhost:3001/tuzhong-wenshu", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
const out = await page.evaluate((id) => {
  const d = JSON.parse(localStorage.getItem("tuzhong-draft-data-"+id) || "{}");
  const sm = (v, max=800) => { if(v==null) return ""; const s = typeof v==="string"?v:JSON.stringify(v); return s.length>max?s.slice(0,max)+"...":s; };
  const out = {};
  // factions
  const fac = d.factions || {};
  out.factions_isObj = typeof fac;
  out.factions_keys = Object.keys(fac);
  const fl = Array.isArray(fac.factions)?fac.factions:[];
  out.factions_len = fl.length;
  out.faction_first = fl[0];
  out.faction_fields = fl.length? Object.keys(fl[0]) : [];
  out.factions_emptyFieldsCount = fl.reduce((acc,f)=>{ Object.keys(f).forEach(k=>{ const v=f[k]; if(v==null||(typeof v==="string"&&!v.trim())||(Array.isArray(v)&&v.length===0)) acc.push(f.name+"."+k); }); return acc; }, []);
  // chapters
  out.chapters_keys = Object.keys(d.chapters||{});
  const ch = d.chapters||{};
  out.chapters = { volumes: Array.isArray(ch.volumes)?ch.volumes.length:undefined, chapters: Array.isArray(ch.chapters)?ch.chapters.length:undefined };
  if (Array.isArray(ch.volumes)) out.chapters.volumesFirst = ch.volumes[0];
  if (Array.isArray(ch.chapters)) out.chapters.chaptersFirst = ch.chapters[0];
  // keyPlots volumes
  const kp = d.keyPlots||{};
  out.keyPlots_keys = Object.keys(kp);
  out.keyPlots_volumes = Array.isArray(kp.volumes)?kp.volumes.slice(0,3):kp.volumes;
  // stepModels persistence
  out.stepModels_storage = localStorage.getItem("tuzhong-step-models");
  const smk = "tuzhong-step-models";
  try { out.stepModels_parse = JSON.parse(localStorage.getItem(smk)||"null"); } catch(e){ out.stepModels_parse = "ERR:"+e.message; }
  // all draft data keys
  out.draft_all_keys = Object.keys(d);
  return out;
}, DRAFT);
console.log(JSON.stringify(out, null, 2));
await ctx.close().catch(()=>{}); process.exit(0);