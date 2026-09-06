// 独立验证 normalizeFactionsData 的 powerRank/strengthTier 修复逻辑（模拟真实存储值）
// 真实存储值：powerRank="二流"/"一流"（无势力后缀），strengthTier=描述句子
const powerRankValues = ["二流", "一流", "二流", "二流", "二流", "二流", "二流", "一流", "一流", "一流", "一流", "一流", "一流", "一流"]
const strengthTierValues = [
  "皇权稳固，但实力有限，需整合各方势力。",
  "兵力较强，但内部矛盾重重。",
  "海军实力雄厚，但缺乏陆战经验。",
  "内部矛盾重重，实力衰弱。",
  "实力一般，但有一定的影响力。",
  "实力一般，但有一定的影响力。",
  "皇权稳固，但实力有限，需整合各方势力。",
  "实力强大，装备先进，士气高昂。",
  "政治手腕强硬，有一定的军事力量。",
  "实力强大，装备精良，战术先进。",
  "经济实力雄厚，海上力量强大。",
  "战斗力较强，但规模较小。",
  "地方势力强大，但影响力有限。",
  "神秘力量强大，情报驿路完善。",
]

// ===== 复制自 ai-generate-wizard.tsx 的修复逻辑 =====
function normalizePowerRank(f, campIsEnemy, campIsMing, strengthV) {
  var _RANK_VALUES = { '传说势力': '传说势力', '超级势力': '超级势力', '一流势力': '一流势力', '二流势力': '二流势力', '三流势力': '三流势力' }
  var _powerRank = String(f.powerRank || '').trim()
  if (_powerRank) {
    var _prMatch = /^(传说|超级|一流|二流|三流)/.exec(_powerRank)
    _powerRank = _prMatch ? (_prMatch[1] + '势力') : (_RANK_VALUES[_powerRank] || '')
  }
  if (!_powerRank) {
    var _prTxt = String(strengthV || '') + String(f.description || '')
    if (/顶级|传说|霸主|神朝|帝国|底蕴深厚/.test(_prTxt)) _powerRank = '传说势力'
    else if (/超级|顶尖|最强|精锐|鼎盛/.test(_prTxt)) _powerRank = '超级势力'
    else if (/一流|强势|上层|精良|先进/.test(_prTxt)) _powerRank = '一流势力'
    else if (/三流|微弱|弱小/.test(_prTxt)) _powerRank = '三流势力'
    else _powerRank = campIsEnemy ? '超级势力' : (campIsMing ? '超级势力' : '二流势力')
  }
  return _powerRank
}

function normalizeStrengthTier(f, powerRank, campIsEnemy, campIsMing) {
  var _TIER_FROM_RANK = { '传说势力': 'SSS', '超级势力': 'SS', '一流势力': 'S', '二流势力': 'A', '三流势力': 'B' }
  var _strengthTier = String(f.strengthTier || '').trim()
  if (_strengthTier) {
    var _stUp = _strengthTier.toUpperCase()
    if (!/^(SSS|SS|S|A|B|C|D)$/.test(_stUp)) {
      _strengthTier = _TIER_FROM_RANK[powerRank] || (campIsEnemy ? 'SS' : (campIsMing ? 'S' : 'A'))
    } else {
      _strengthTier = _stUp
    }
  } else {
    _strengthTier = _TIER_FROM_RANK[powerRank] || (campIsEnemy ? 'SS' : (campIsMing ? 'S' : 'A'))
  }
  return _strengthTier
}

// ===== 用真实值测试 =====
const validRanks = ['传说势力', '超级势力', '一流势力', '二流势力', '三流势力']
const validTiers = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D']
let fail = 0
powerRankValues.forEach((pr, i) => {
  const st = strengthTierValues[i]
  const rank = normalizePowerRank({ powerRank: pr, strengthTier: st }, false, true, '')
  const tier = normalizeStrengthTier({ powerRank: pr, strengthTier: st }, rank, false, true)
  const rankOk = validRanks.includes(rank)
  const tierOk = validTiers.includes(tier)
  if (!rankOk || !tierOk) fail++
  console.log((rankOk ? 'OK ' : 'FAIL ') + '#' + i + ' powerRank=' + JSON.stringify(pr) + '→' + rank + ' | strengthTier=' + JSON.stringify(st.slice(0, 12)) + '→' + tier)
})

// 额外：测试空值场景
const eRank = normalizePowerRank({ powerRank: '', strengthTier: '' }, false, true, '')
const eTier = normalizeStrengthTier({ powerRank: '', strengthTier: '' }, eRank, false, true)
console.log((validRanks.includes(eRank) && validTiers.includes(eTier) ? 'OK ' : 'FAIL ') + 'EMPTY powerRank=' + eRank + ' tier=' + eTier)
if (!validRanks.includes(eRank) || !validTiers.includes(eTier)) fail++
console.log('FAIL_COUNT=' + fail)
process.exit(fail > 0 ? 1 : 0)
