import { chromium } from "playwright";
import path from "path";
const ROOT = "D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro";
const DRAFT_ID = "d2010e15-03a4-4197-aca5-f572af6e9d94";
const ctx = await chromium.launchPersistentContext(path.join(ROOT, "edge-profile-verify"), { channel: "msedge", headless: false, viewport:{width:1500,height:950} });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("http://localhost:3001/tuzhong-wenshu", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
const out = await page.evaluate((id) => {
  const pick = (o, keys) => { const r={}; keys.forEach(k=>{ if(o&&o[k]!=null) r[k]=o[k]; }); return r; };
  const summary = (v, max=400) => { if(v==null||v===undefined) return ""; const s = typeof v==="string"?v:JSON.stringify(v); return s.length>max?s.slice(0,max)+"...":s; };
  const d = JSON.parse(localStorage.getItem("tuzhong-draft-data-"+id) || "{}");
  const idea = d.idea || {};
  const wb = d.worldbuilding || {};
  const ps = d.powerSystem || {};
  const ch = d.characters || {};
  const fac = d.factions || {};
  const syn = d.synopsis || {};
  const outl = d.outline || {};
  const kp = d.keyPlots || {};
  return {
    idea_keys: Object.keys(idea),
    idea: {
      title: idea.title, protagonistName: idea.protagonistName, genre: idea.genre,
      keywords: idea.keywords, coreConflict: summary(idea.coreConflict), storyTheme: summary(idea.storyTheme),
      setting: summary(idea.setting), summary: summary(idea.summary), sellingPoint: summary(idea.sellingPoint),
    },
    wb_keys: Object.keys(wb),
    worldbuilding: {
      era: wb.era||wb.age, geography: summary(wb.geography), history: summary(wb.history),
      backgroundSetting: summary(wb.backgroundSetting||wb.setting)
    },
    ps_keys: Object.keys(ps),
    powerSystem: {
      pa_name: ps.protagonistAbility&&ps.protagonistAbility.name, pa_type: ps.protagonistAbility&&ps.protagonistAbility.type,
      wp_name: ps.worldPowerSystem&&ps.worldPowerSystem.name, wp_type: ps.worldPowerSystem&&ps.worldPowerSystem.type,
    },
    ch_keys: Object.keys(ch),
    characters: {
      protagonistName: ch.protagonist&&ch.protagonist.name,
      protagonistIdentity: ch.protagonist&&ch.protagonist.identity,
      protagonistGoal: summary((ch.protagonist&&(ch.protagonist.goal||ch.protagonist.coreMotivation))),
      femaleLeadName: ch.femaleLead&&ch.femaleLead.name,
      supportingCount: Array.isArray(ch.supporting)?ch.supporting.length:-1,
      supportingNames: Array.isArray(ch.supporting)?ch.supporting.slice(0,8).map(c=>c.name):[],
      antagonistsCount: Array.isArray(ch.antagonists)?ch.antagonists.length:-1,
      antagonistsNames: Array.isArray(ch.antagonists)?ch.antagonists.slice(0,6).map(c=>c.name):[],
    },
    facCount: Array.isArray(fac.factions)?fac.factions.length:-1,
    factionNames: Array.isArray(fac.factions)?fac.factions.slice(0,12).map(f=>f.name):[],
    syn_keys: Object.keys(syn), syn_isEmpty: Object.keys(syn).length===0,
    outline_keys: Object.keys(outl), outline_isEmpty: Object.keys(outl).length===0,
    kp_keys: Object.keys(kp), kp_isEmpty: Object.keys(kp).length===0,
  };
}, DRAFT_ID);
console.log(JSON.stringify(out, null, 2));
await ctx.close().catch(()=>{}); process.exit(0);