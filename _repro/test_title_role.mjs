// 徽章/角色定位规范化单元测试
// 逻辑已抽到 src/lib/character-normalize.ts（与生成环节、/api/characters/normalize 三方共用），
// 直接 import 保证测试与实现零漂移
import { normalizeCharacter } from '../src/tuzhong-wenshu/src/lib/character-normalize.ts'

// 用户自设详细设定输入（含"——头衔"格式，供 titleFromDesign 使用）
const _udR2 = '【史可法】永历阵营（主角阵营）·忠臣文官——兵部尚书\n【瞿式耜】永历阵营（主角阵营）·支撑危局——广西巡抚加兵部尚书衔\n【朱聿键】绍武阵营·争位——绍武帝\n'

const separate = function (c, isProtag, isFL) {
  normalizeCharacter(c, { isProtagonist: !!isProtag, isFemaleLead: !!isFL, designText: _udR2 })
}

// 截图中的真实字段（LLM 产出 + 前端同步后的状态）
const cases = [
  {
    label: '史可法（主角阵营忠臣，背景顺带提到弘光朝）',
    char: {
      name: '史可法', title: '兵部尚书', role: '竞争对手', rolePosition: '竞争对手',
      camp: '永历阵营（主角阵营）',
      identity: '永历阵营（主角阵营）·忠臣文官，南明东林党核心、弘光朝兵部尚书，1645年扬州孤城守御者，原殉国结局被主角改写后成为朱由榔麾下重臣，掌兵部并协理江北军务。',
      background: '弘光朝兵部尚书，扬州殉国历史人物。'
    },
    expectRole: '忠臣文官'
  },
  {
    label: '瞿式耜（主角阵营忠臣，徽章被写成职能词"支撑危局"）',
    char: {
      name: '瞿式耜', title: '支撑危局', role: '竞争对手', rolePosition: '竞争对手',
      camp: '永历阵营（主角阵营）',
      identity: '永历阵营（主角阵营）·忠臣文官，广西巡抚加兵部尚书衔，署理桂林军政大权。永历朝廷在两广的支柱重臣，以桂林一城为据点支撑抗清大局。',
      background: '支撑危局。'
    },
    expectRole: '忠臣文官', expectTitle: ['广西巡抚']
  },
  {
    label: '朱聿键（绍武帝，确属皇位竞争者，徽章被写成特征词"短命"）',
    char: {
      name: '朱聿键', title: '短命', role: '竞争对手', rolePosition: '竞争对手',
      camp: '绍武阵营',
      identity: '绍武帝（唐王之弟）；短命皇帝、内斗代表、被清军攻破后自缢',
      background: '与永历争正统。'
    },
    expectRole: '竞争对手'
  },
  {
    label: '李定国（主角阵营武将）',
    char: {
      name: '李定国', title: '晋王', role: '竞争对手', rolePosition: '竞争对手',
      camp: '永历阵营（主角阵营）',
      identity: '永历阵营（主角阵营）·忠臣武将，大西军出身，封晋王，两蹙名王，抗清主力统帅。',
      background: '西南抗清支柱。'
    },
    expectRole: '忠臣武将'
  },
  {
    label: '多尔衮（清廷反派）',
    char: {
      name: '多尔衮', title: '摄政王', role: '反派', rolePosition: '反派',
      camp: '清廷阵营',
      identity: '清廷摄政王，率清军南下灭明，主角争夺天下的生死宿敌。',
      background: '引清兵入关。'
    },
    expectRole: '反派'
  },
  {
    label: '马吉翔（内廷权阉近侍，主角阵营）',
    char: {
      name: '马吉翔', title: '', role: '亲随', rolePosition: '亲随',
      camp: '永历阵营（主角阵营）',
      identity: '永历阵营（主角阵营）·太监，司礼监秉笔，内廷传旨，依附皇权搅动朝局。',
      background: '内廷宦官。'
    },
    expectRole: '亲随', expectTitle: '太监'
  },
  // ↓↓↓ 生产端到端实测暴露的三类问题（LLM 风格字段：无阵营标注 / 幻觉头衔 / 变节者）
  {
    label: '何腾蛟（LLM 幻觉头衔"江湖术士"，用户钦定总督）',
    char: {
      name: '何腾蛟', title: '江湖术士', role: '盟友', rolePosition: '盟友', camp: '',
      identity: '南明湖广总督，拥立朱由榔称帝，节制诸镇抵御清军于湖南前线。',
      background: '湖广抗清支柱。'
    },
    expectRole: '忠臣文官', expectTitle: ['总督','湖广总督','南明湖广总督']
  },
  {
    label: '李定国（无阵营标注，仅"封晋王/抗清主力统帅"）',
    char: {
      name: '李定国', title: '晋王', role: '盟友', rolePosition: '盟友', camp: '',
      identity: '大西军出身，封晋王，两蹙名王，西南抗清主力统帅。',
      background: '西南抗清支柱。'
    },
    expectRole: '忠臣武将', expectTitle: '晋王'
  },
  {
    label: '史可法（身份首段即含"弘光朝兵部尚书"，无阵营标注）',
    char: {
      name: '史可法', title: '兵部尚书', role: '竞争对手', rolePosition: '竞争对手', camp: '',
      identity: '南明东林党核心、弘光朝兵部尚书，扬州孤城守御者，殉国名臣。',
      background: '1645年扬州殉国。'
    },
    expectRole: '忠臣文官', expectTitle: '兵部尚书'
  },
  {
    label: '洪承畴（变节者优先判反派，虽含"大学士"头衔）',
    char: {
      name: '洪承畴', title: '大学士', role: '反派', rolePosition: '反派', camp: '清廷',
      identity: '明朝降臣，仕清后任大学士，为清军前驱招抚江南。',
      background: '松锦之战被俘后降清。'
    },
    expectRole: '反派', expectTitle: ['大学士','文渊阁大学士','东阁大学士','南明文官降臣','明朝降臣','清军大学士']
  },
  {
    label: '多尔衮（敌营统帅，徽章不得吞"宿敌——"前缀）',
    char: {
      name: '多尔衮', title: '宿敌——摄政王', role: '反派', rolePosition: '反派', camp: '反派',
      identity: '清廷摄政王，率清军南下灭明，主角争夺天下的生死宿敌。',
      background: '引清兵入关。'
    },
    expectRole: '反派', expectTitle: ['摄政王','清廷摄政王']
  },
  {
    label: '昭仁太后（封号含"后"字，不得被连词切分误伤）',
    char: {
      name: '昭仁太后', title: '皇太后', role: '配角', rolePosition: '配角', camp: '永历阵营（主角阵营）',
      identity: '永历阵营（主角阵营）·皇太后，后宫之主，朱由榔之母。',
      background: '后宫宗主。'
    },
    expectRole: '长辈', expectTitle: ['皇太后']
  },
  // ↓↓↓ 生产第三轮 E2E 暴露：LLM 给真实历史人物套通用模板身份，官职/忠诚词只剩在背景里
  {
    label: '史可法（身份被写成"说书艺人"，忠诚词在背景）',
    char: {
      name: '史可法', title: '兵部尚书', role: '盟友', rolePosition: '盟友', camp: '',
      identity: '说书艺人，游历四方见多识广，是主角重要的情报收集者。',
      background: '弘光朝旧臣，扬州守御者，被主角改写结局后成为麾下重臣。'
    },
    expectRole: ['忠臣','亲随']
  },
  {
    label: '李定国（身份被写成"盐商巨贾"，官职词在背景）',
    char: {
      name: '李定国', title: '晋王', role: '盟友', rolePosition: '盟友', camp: '',
      identity: '盐商巨贾，掌控一方盐业命脉，提供源源不断的军饷。',
      background: '大西军出身，两蹙名王，西南抗清主力统帅。'
    },
    expectRole: '忠臣武将'
  },
  {
    label: '史可法（用户名单已给出权威定位，须覆盖推断）',
    char: {
      name: '史可法', title: '兵部尚书', role: '忠臣文官', rolePosition: '忠臣文官', _rosterRole: '忠臣文官', camp: '永历阵营（主角阵营）',
      identity: '永历阵营（主角阵营）·忠臣文官，南明东林党核心、弘光朝兵部尚书。',
      background: '扬州守御者，殉国名臣。'
    },
    expectRole: '忠臣文官'
  },
  // ↓↓↓ 生产第四轮 E2E 暴露：世界观套话污染文武细分 + 名单原始职能词未规范化
  {
    label: '李定国（背景含套话"社会结构为文官集团、武勋集团…"）',
    char: {
      name: '李定国', title: '晋王', role: '忠臣文官', rolePosition: '忠臣文官', camp: '永历阵营（主角阵营）',
      identity: '大西军晋王·永昌之战胜利者',
      background: '社会结构为文官集团、武勋集团、宦官集团三方博弈。军事经历：永历三年参与「永昌之战」，击败清军左良玉部，收复云南。'
    },
    expectRole: '忠臣武将'
  },
  {
    label: '瞿式耜（名单解析器给出原始词"文官"，须规范为忠臣文官）',
    char: {
      name: '瞿式耜', title: '广西巡抚', role: '文官', rolePosition: '文官', _rosterRole: '文官', camp: '朋友',
      identity: '永历阵营（主角阵营）·支撑危局——广西巡抚加兵部尚书衔，署理桂林军政大权，永历朝廷在两广的支柱重臣。',
      background: '支撑危局。'
    },
    expectRole: '忠臣文官'
  },
  {
    label: '朱聿键（名单原始词"宗室"，绍武争位者→竞争对手）',
    char: {
      name: '朱聿键', title: '绍武帝', role: '宗室', rolePosition: '宗室', _rosterRole: '宗室', camp: '反派',
      identity: '绍武阵营·争位——绍武帝，唐王之弟，与永历争夺正统，内斗代表。',
      background: '被清军攻破后自缢。'
    },
    expectRole: '竞争对手'
  },
  {
    label: '多尔衮（名单原始词"宿敌—"含破折号，须清洗）',
    char: {
      name: '多尔衮', title: '摄政王', role: '宿敌—', rolePosition: '宿敌—', _rosterRole: '宿敌—', camp: '反派',
      identity: '清廷阵营·宿敌——摄政王，率清军南下灭明，主角争夺天下的生死大敌。',
      background: '引清兵入关。'
    },
    expectRole: '竞争对手'
  },
  {
    label: '洪承畴（名单"文官"但属清营敌对，须换算为反派）',
    char: {
      name: '洪承畴', title: '大学士', role: '文官', rolePosition: '文官', _rosterRole: '文官', camp: '清军阵营（敌对）',
      identity: '清军大学士·南明文官降臣',
      background: '松锦之战被俘后降清，为清军前驱招抚江南。'
    },
    expectRole: '反派'
  },
]

let fail = 0
for (const t of cases) {
  const c = JSON.parse(JSON.stringify(t.char))
  separate(c, false, false)
  const _expRole = Array.isArray(t.expectRole) ? t.expectRole : [t.expectRole]
  const okRole = _expRole.indexOf(c.rolePosition) !== -1
  const _exp = Array.isArray(t.expectTitle) ? t.expectTitle : (t.expectTitle ? [t.expectTitle] : [])
  const okTitle = _exp.length === 0 || _exp.indexOf(c.title) !== -1
  const titleSane = !c.title || (!/[，。、—：:]/.test(c.title) && c.title.length <= 8)
  if (!okRole || !okTitle || !titleSane) fail++
  console.log(`${(!okRole || !okTitle || !titleSane) ? '❌' : '✅'} ${t.label}`)
  console.log(`   定位: ${JSON.stringify(t.char.rolePosition)} → ${c.rolePosition}（期望 ${t.expectRole}）`)
  console.log(`   徽章: ${JSON.stringify(t.char.title)} → ${JSON.stringify(c.title)}（可接受 ${JSON.stringify(_exp)}）${titleSane ? '' : ' ⚠含标点/过长'}`)
}
console.log(fail === 0 ? '\n=== 全部通过：徽章与角色定位均正确 ===' : `\n=== 失败 ${fail} 例 ===`)
process.exit(fail === 0 ? 0 : 1)
