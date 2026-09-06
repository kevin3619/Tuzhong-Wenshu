// 确定性单元测试：复刻 route.ts A2 流派兜底逻辑（2026-09-02 加固版）
// 目的：不依赖 LLM 方差，直接验证「中兴帝王签到面板」→「中兴帝王签到系统」等精确场景。
import assert from 'node:assert'

// --- 复刻： genre 解析 + 流派判定 ---
function makeCtx(genre, keywordsStr = '') {
  const _ideaFlowTags = String(genre).split(',').filter(t => /系统流|签到流|面板流|任务流|无敌流|随身流|聊天群流|聊天群|神豪流|神医流|赘婿流|种田流|穿越流|重生流|末世流|无限流|修炼流|无敌|直播流|电竞流|网游流|美食流|灵气复苏流|鉴宝流|国术流|兽医流|侦探流|悬疑流|盗墓流|规则怪谈流|诡异流|惊悚流|恐怖流|西游流|洪荒流|封神流|武侠流|仙侠流|都市流|乡村流|校园流|官场流|职场流|娱乐圈流|历史流|军事流|科幻流|玄幻流|奇幻流|游戏流|体育流| repetitive/.test(t))
  const _fdIs = (t) => _ideaFlowTags.indexOf(t) !== -1
  return { _fdIs, keywordsStr }
}

// --- 复刻：核心 fallback 函数 ---
function normalizeSystemName(rawSysName, genre, keywordsStr) {
  const { _fdIs } = makeCtx(genre, keywordsStr)
  const result = { systemName: rawSysName }
  var _fdSysName = String(result.systemName || '').trim()
  var _fdPrimaryTag = _fdIs('签到流') ? '签到流'
    : _fdIs('系统流') ? '系统流'
    : _fdIs('任务流') ? '任务流'
    : _fdIs('面板流') ? '面板流'
    : ''
  var _fdNameValid = function (_nm) {
    if (!_fdPrimaryTag) return true
    if (_fdPrimaryTag === '签到流') return (/签到|打卡/.test(_nm)) && (/系统$/.test(_nm))
    if (_fdPrimaryTag === '系统流') return /系统$/.test(_nm)
    if (_fdPrimaryTag === '任务流') return (/任务/.test(_nm)) && (/系统$/.test(_nm))
    return /面板|属性/.test(_nm)
  }
  if (_fdPrimaryTag && !_fdNameValid(_fdSysName)) {
    var _fdEraM = (String(keywordsStr || '')).match(/(大明|明朝|明末|南明|大清|清朝|清末|大宋|宋朝|南宋|大唐|唐朝|大汉|汉朝|大秦|秦朝|大元|元朝|民国)/)
    var _fdEraMap = { '大明': '大明', '明朝': '大明', '明末': '大明', '南明': '大明', '大清': '大清', '清朝': '大清', '清末': '大清', '大宋': '大宋', '宋朝': '大宋', '南宋': '大宋', '大唐': '大唐', '唐朝': '大唐', '大汉': '大汉', '汉朝': '大汉', '大秦': '大秦', '秦朝': '大秦', '大元': '大元', '元朝': '大元', '民国': '民国' }
    var _fdEra = (_fdEraM && _fdEraMap[_fdEraM[1]]) ? _fdEraMap[_fdEraM[1]] : ''
    var _fdBase = (_fdSysName && _fdSysName.length >= 2 && _fdSysName.length <= 10)
      ? _fdSysName.replace(/(系统|签到系统|面板系统|属性面板|面板|签到录|任务系统|任务录|录)$/, '')
      : (_fdEra ? _fdEra + '中兴' : '天命')
    var _fdCoreName = String(_fdBase).replace(/(系统|签到系统|面板系统|属性面板|面板|签到录|任务系统|任务录|录|之|的)$/g, '').slice(0, 10)
    var _fdNewSysName = ''
    if (_fdPrimaryTag === '签到流') {
      _fdNewSysName = (/签到|打卡/.test(_fdCoreName)) ? (_fdCoreName + '系统') : (_fdCoreName + '签到系统')
    } else if (_fdPrimaryTag === '系统流') {
      _fdNewSysName = (/系统/.test(_fdCoreName)) ? _fdCoreName : (_fdCoreName + '系统')
    } else if (_fdPrimaryTag === '任务流') {
      _fdNewSysName = ((/任务/.test(_fdCoreName)) ? _fdCoreName : (_fdCoreName + '任务')) + '系统'
    } else {
      _fdNewSysName = (/面板|属性/.test(_fdCoreName)) ? _fdCoreName : (_fdCoreName + '属性面板')
    }
    result.systemName = _fdNewSysName
  }
  return result.systemName
}

// --- 断言集 ---
const cases = [
  {
    name: '用户精确场景①：中兴帝王签到面板 + 签到流 → 中兴帝王签到系统',
    input: '中兴帝王签到面板', genre: '历史,系统流,签到流,面板流', expect: '中兴帝王签到系统',
    assert: (o) => o === '中兴帝王签到系统' && /签到/.test(o) && /系统$/.test(o) && !/面板$/.test(o),
  },
  {
    name: '用户场景②：中兴帝王签到面板 + 仅系统流 → 中兴帝王签到系统',
    input: '中兴帝王签到面板', genre: '历史,系统流', expect: '中兴帝王签到系统',
    assert: (o) => /系统$/.test(o) && !/面板$/.test(o),
  },
  {
    name: '面板流独存（无系统/签到/任务）：XXX属性面板 保留面板',
    input: '九天属性面板', genre: '历史,面板流', expect: '九天属性面板',
    assert: (o) => /属性面板$/.test(o),
  },
  {
    name: '已合法（签到系统结尾）：原值保留不覆盖',
    input: '无敌签到系统', genre: '系统流,签到流', expect: '无敌签到系统',
    assert: (o) => o === '无敌签到系统',
  },
  {
    name: '已合法（系统结尾）：原值保留',
    input: '小康系统', genre: '系统流', expect: '小康系统',
    assert: (o) => o === '小康系统',
  },
  {
    name: '任务流污染面板：XX任务面板 → XX任务系统',
    input: '封神任务面板', genre: '神话,任务流', expect: '封神任务系统',
    assert: (o) => /任务系统$/.test(o) && !/面板$/.test(o),
  },
]

let pass = 0
for (const c of cases) {
  const out = normalizeSystemName(c.input, c.genre)
  const ok = c.assert(out)
  console.log((ok ? '✅ PASS' : '❌ FAIL') + ' | ' + c.name + ' | out=' + out)
  if (!ok) { console.log('   期望: ' + c.expect); assert.fail(c.name) }
  pass++
}
console.log('\n=== 确定性单元测试 ' + pass + '/' + cases.length + ' 全部 PASS ===')
