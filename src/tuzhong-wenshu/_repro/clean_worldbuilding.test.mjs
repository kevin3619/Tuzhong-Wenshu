// 单元测试：世界观设定字段清洗（Issue 2 / Issue 3）
// 目标：① 背景设定(coreSettings) 中移除"力量体系"整块；② 力量体系(powerSystem) 中移除金手指段与 体系名称/体系类型 重复包裹

// 与 ai-generate-wizard.tsx normalizeWorldbuildingData 中待加入的逻辑保持一致

// ---- 力量体系字段清洗 ----
function cleanPowerSystem(s) {
  let t = String(s || '')
  if (!t.trim()) return t
  // 移除"金手指：xxx；"整段（金手指/签到/系统绑定属于金手指步骤的独立字段）
  t = t.replace(/金手指[：:][^；;\n}，,、/—]*[；;]?/g, '')
  // 移除独立的【体系名称】xxx； / 【体系类型】xxx； 包裹（结构信息应进入结构化 name/type，而非留在文本里重复）
  t = t.replace(/(?:^|[\n；;])\s*【体系名称】[^；;\n]*[；;]?\s*/g, '')
  t = t.replace(/(?:^|[\n；;])\s*【体系类型】[^；;\n]*[；;]?\s*/g, '')
  // 清理可能残留的孤立方括号包裹或多余分号
  t = t.replace(/[；;]\s*[；;]+/g, '；').trim()
  return t
}

// ---- 背景设定字段清洗：移除力量体系整块 ----
function cleanSetting(s) {
  let t = String(s || '')
  if (!t.trim()) return t
  var topReStr = '(?:时代背景|地理格局|历史脉络|社会结构|世界规则|核心设定|背景设定|总体设定|文明|科技|文化|经济|力量体系|世界观)'
  var out = t
  for (;;) {
    var startRe = /(?:^|[｜\n；。])\s*(?:力量体系[：:]?\s*|【力量体系】\s*|【体系名称】\s*)/g
    var m = startRe.exec(out)
    if (!m) break
    var startIdx = m.index
    var nextTag = new RegExp('[｜\\n；。]\\s*(' + topReStr + ')\\s*[：:]', 'g')
    nextTag.lastIndex = startIdx + m[0].length
    var next = nextTag.exec(out)
    var endIdx = next ? next.index : out.length
    var removed = out.slice(startIdx, endIdx)
    if (!removed.length) break
    out = out.slice(0, startIdx) + out.slice(endIdx)
  }
  out = out.replace(/[\n]+(?=[\n｜])/g, '').replace(/[\n]+\s*[\n]+/g, '\n').replace(/[｜\n；。]\s*$/, '').trim()
  return out
}

// ---- 测试用例 ----
const settingInput = `力量体系：【体系名称】明朝朝堂权力体系
【体系类型】明朝朝堂权力体系
【体系描述】明代以皇权-内阁-六部-都督为核心的文官武职双轨体系
【境界划分】未入流→文『典史·将仕郎』｜武『什长·勇武副尉』
从九品→文『主簿·登仕佐郎』｜武『旗尉·信武副尉』
正八品→文『县丞·修职郎』｜武『总旗·宣义副郎』
正七品→文『知县·承直郎』｜武『守备·忠武校尉』
从六品→文『通判·承务郎』｜武『千户·武德佐骑尉』
正五品→文『知州·奉议大夫』｜武『指挥佥事·武德将军』
从四品→文『知府·朝列大夫』｜武『指挥同知·宣武将军』
正四品→文『道员·中宪大夫』｜武『指挥使·昭勇将军』
从三品→文『按察使·嘉议大夫』｜武『参将·昭毅将军』
从二品→文『六部侍郎·资政大夫』｜武『副将·骠骑将军』
正二品→文『六部尚书·资善大夫』｜武『总兵·龙虎将军』
从一品→文『都御史·荣禄大夫』｜武『左都督·柱国』
正一品→文『内阁大学士·特进光禄大夫』｜武『左右都督·上柱国（爵至公侯）』
皇帝→文『九五之尊』｜武『天下兵马大元帅』
【方式】科举取士、军功擢升、门荫世袭三路并进；文官凭政绩与党援迁转，武将由卫所世职与边功晋阶
【克制关系】皇权总揽，内阁票拟与司礼监批红相互制衡；文官节制武将（以文驭武），武将掌兵而受兵部与五军都督府牵制。`

// 多字段混合的设定输入（力量体系块在中间）
const settingMixed = `时代背景：明末清初，山河破碎，南明政权偏安一隅。
地理格局：江南与岭南尚在明廷掌控，北方尽丧于清。
力量体系：【体系名称】明朝朝堂权力体系
【体系类型】明朝朝堂权力体系
【体系描述】明代以皇权-内阁-六部-都督为核心的文官武职双轨体系
【境界划分】从九品→文『主簿』｜武『旗尉』...（略）...
【方式】科举取士、军功擢升、门荫世袭三路并进
【克制关系】皇权总揽，内阁票拟与司礼监批红相互制衡。
历史脉络：永历帝朱由榔流亡西南，联明抗清。`

const powerSystemInput = `金手指：大明中兴签到系统；【体系名称】明朝朝堂权力体系；【体系类型】明朝朝堂权力体系；边界测试`

// 聚合 coreSettings 以「｜」分隔的场景（含力量体系整块）
const settingAggregated = `时代背景：永历元年，南明风雨飘摇。｜地理格局：江南与岭南尚在明廷掌控。｜历史脉络：永历帝朱由榔流亡西南。｜力量体系：【体系名称】明朝朝堂权力体系
【体系类型】明朝朝堂权力体系
【境界划分】未入流→文『书吏』｜武『战兵·马卒』｜社会结构：皇权专制体系下，永历朝廷分为五层。｜世界规则：朱由榔每日仅可签到一次。`

console.log('===== 测试1：背景设定含力量体系整块（仅力量体系）=====')
console.log('结果:', JSON.stringify(cleanSetting(settingInput)))
console.log()
console.log('===== 测试2：背景设定含力量体系整块（混合）=====')
console.log('结果:', JSON.stringify(cleanSetting(settingMixed)))
console.log()
console.log('===== 测试3：力量体系字段清洗 =====')
console.log('结果:', JSON.stringify(cleanPowerSystem(powerSystemInput)))
console.log()
console.log('===== 测试4：｜分隔聚合设定中的力量体系整块 =====')
console.log('结果:', JSON.stringify(cleanSetting(settingAggregated)))

// ---- 新增：题材一致性净化（历史题材清除跨题材通用体系块） ----
function cleanGenresForHistorical(ps, ctx) {
  let t = String(ps || '')
  if (!t.trim()) return t
  const isHist = /明|永历|崇祯|南明|大明|朝廷|朝堂|科举|进士|皇帝|天子|王朝|品阶|都督|巡抚|总督|尚书/.test((ctx||'') + ' ' + t.substring(0,120))
  if (!isHist) return t
  t = t.replace(/(?:，|；|｜|\n)?\s*(?:修仙|修真|仙侠|武道|武修|剑修|剑侠|符道|魔法|斗气|异能|机械|星际|都市|末世|末日|魔修|武魂|血统|洪荒|玄幻)[^（(]{0,20}[（(][^）)]{1,120}[）)]/g, '')
  t = t.replace(/(?:，|；|｜|\n)?\s*[^，；｜\n]*(?:修仙|修真|仙侠|武道|武修|剑修|符道|魔法|斗气|异能|机械|星际|都市|末世|洪荒)[^，；｜\n]{0,40}/g, (m)=> /修仙|修真|仙侠|武道|武修|剑修|符道|魔法|斗气|异能|机械|星际|都市|末世|洪荒/.test(m) && m.length<=80 ? '' : m)
  t = t.replace(/[，；；]+/g,'，').replace(/[，；]\s*$/g,'').replace(/\s*[，；｜]\s*$/,'').trim()
  return t
}
const genreInput = '明朝朝堂权力体系：本体系）修仙体系（练气筑基金丹元婴化神渡劫的修仙体系）武道体系（武者淬体、一剑破万法的剑修仙侠体系）符道体系（以符箓引动天地元气）等级制；都市怪谈，避免出现仙侠/洪荒式神话。'
const genreHistCtx = '永历元年，南明风雨飘摇，永历帝朱由榔流亡西南。'
const genreCultCtx = '中州玄月宗，练气之上筑基金丹，宗门林立。' // 非历史题材，不应清洗
console.log('\n===== 测试5：历史题材清除跨题材通用体系块 =====')
const r5 = cleanGenresForHistorical(genreInput, genreHistCtx)
console.log('清洗后:', JSON.stringify(r5))
console.log('是否残留修仙词:', /修仙|筑基|金丹|元婴|化神|渡劫|剑修|符道|武道/.test(r5) ? '是 ❌' : '否 ✅')
console.log()
console.log('===== 测试6：非历史题材不误伤 =====')
const r6 = cleanGenresForHistorical(genreInput, genreCultCtx)
console.log('清洗后:', JSON.stringify(r6))
console.log('是否保留修仙内容:', /修仙|筑基|金丹/.test(r6) ? '是 ✅(保留)' : '否')