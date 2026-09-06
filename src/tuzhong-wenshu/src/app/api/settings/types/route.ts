import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getRequestActor } from '@/lib/permissions'

// 修复：动态解析数据目录路径，支持 PM2 等不同运行环境
// 同时支持 .tuzhong-data (规范) 与 data (用户习惯命名)
function resolveDataDir(): string {
  const cwd = process.cwd()
  const candidates = [
    path.join(cwd, '.tuzhong-data'),
    path.join(cwd, 'data'),
    path.join(cwd, 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    path.join(cwd, 'src', 'tuzhong-wenshu', 'data'),
    path.join(cwd, '..', '.tuzhong-data'),
    path.join(cwd, '..', 'data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
    '/www/wwwroot/tuzhong-wenshu/data',
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      // continue
    }
  }
  const defaultPath = path.join(cwd, '.tuzhong-data')
  try { if (!fs.existsSync(defaultPath)) fs.mkdirSync(defaultPath, { recursive: true }) } catch { /* ignore */ }
  return defaultPath
}

// 每次调用动态解析，不缓存
function getDataDir(): string { return resolveDataDir() }

function ensureDataFolder() {
  const d = getDataDir()
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true })
  }
}

function getTypesFile(): string { return path.join(getDataDir(), 'setting-types.json') }

interface TypeItem {
  id: string
  name: string
  category: string
  description?: string
  order: number
  // 金手指类型详细字段（与阶段3世界构建-金手指组对齐）
  coreFunction?: string        // 核心功能
  triggerCondition?: string    // 触发条件（原 specificAbilities，重新定义为触发条件）
  limitations?: string         // 限制代价
  growthPath?: string          // 成长路径
  // 兼容字段：旧数据迁移用，新数据不再写入
  specificAbilities?: string
  // 体系类型详细字段（与阶段3世界构建-力量体系组对齐）
  realmSystem?: string         // 境界划分（12级）
  cultivationMethod?: string   // 修炼方式
  restraintRelation?: string   // 克制关系
}

interface TypesData {
  abilityTypes: TypeItem[]
  systemTypes: TypeItem[]
}

const defaultAbilityTypes: TypeItem[] = [
  { id: 'sys', name: '系统类', category: '超凡类', description: '任务/商城/抽奖/签到', order: 1 },
  { id: 'gongfa', name: '功法类', category: '超凡类', description: '绝世功法/秘籍/传承', order: 2 },
  { id: 'shenqi', name: '神器类', category: '超凡类', description: '法宝/神兵/至宝/戒指', order: 3 },
  { id: 'xuemai', name: '血脉类', category: '超凡类', description: '血脉觉醒/血脉返祖', order: 4 },
  { id: 'tianfu', name: '天赋类', category: '超凡类', description: '天生异禀/特殊体质', order: 5 },
  { id: 'yineng', name: '异能类', category: '超凡类', description: '超能力/特异功能', order: 6 },
  { id: 'qiyue', name: '契约类', category: '超凡类', description: '召唤/契约/御兽/式神', order: 7 },
  { id: 'linghun', name: '灵魂类', category: '超凡类', description: '双魂/魂环/灵魂契约', order: 8 },
  { id: 'xianzhi', name: '先知类', category: '知识/智谋类', description: '穿越者知识/前知优势', order: 9 },
  { id: 'zhishi', name: '知识类', category: '知识/智谋类', description: '现代知识/专业技能', order: 10 },
  { id: 'jiyi', name: '记忆类', category: '知识/智谋类', description: '前世记忆/传承记忆', order: 11 },
  { id: 'qiyun', name: '气运类', category: '知识/智谋类', description: '天命所归/气运加身', order: 12 },
  { id: 'zhimou', name: '智谋类', category: '知识/智谋类', description: '纯智谋/权谋/策略驱动', order: 13 },
  { id: 'kongjian', name: '空间类', category: '特殊类', description: '空间戒指/小世界/洞天', order: 14 },
  { id: 'shijian', name: '时间类', category: '特殊类', description: '时间回溯/预知未来', order: 15 },
  { id: 'lunhui', name: '轮回类', category: '特殊类', description: '重生/轮回/涅槃', order: 16 },
  { id: 'tunshi', name: '吞噬类', category: '特殊类', description: '吞噬万物/掠夺能力', order: 17 },
  { id: 'fuzhi', name: '复制类', category: '特殊类', description: '复制/模拟/解析能力', order: 18 },
  { id: 'lingyu', name: '领域类', category: '特殊类', description: '领域展开/法则掌控', order: 19 },
  { id: 'none', name: '无金手指', category: '特殊类', description: '无金手指/纯靠自身', order: 20 },
  { id: 'dandao', name: '丹道类', category: '超凡类', description: '炼丹/丹方/丹药传承', order: 21 },
  { id: 'fuwen', name: '符文类', category: '超凡类', description: '符文/铭文/刻阵', order: 22 },
  { id: 'yinyang', name: '阴阳类', category: '超凡类', description: '阴阳眼/阴阳术/生死之力', order: 23 },
  { id: 'leifa', name: '雷法类', category: '超凡类', description: '雷法/雷霆之力/天罚', order: 24 },
  { id: 'jianshen', name: '剑修类', category: '超凡类', description: '剑心/剑意/剑域', order: 25 },
  { id: 'lianjia', name: '炼家类', category: '知识/智谋类', description: '炼器/炼宝/铸造师', order: 26 },
  { id: 'yishou', name: '医兽类', category: '知识/智谋类', description: '医术/毒术/御兽', order: 27 },
  { id: 'wenxin', name: '文心类', category: '知识/智谋类', description: '诗词杀敌/文道/圣言', order: 28 },
  { id: 'ruxiu', name: '儒修类', category: '知识/智谋类', description: '浩然正气/修身齐家治国平天下', order: 29 },
  { id: 'wangxiang', name: '万象类', category: '特殊类', description: '千变万化/万象包罗', order: 30 },
  { id: 'mengjing', name: '梦境类', category: '特殊类', description: '入梦/梦修/梦中证道', order: 31 },
  { id: 'huanyan', name: '幻眼类', category: '特殊类', description: '幻术/瞳术/写轮眼', order: 32 },
  { id: 'qingyun', name: '气运功德类', category: '特殊类', description: '功德/气运/业力/香火', order: 33 },
  { id: 'yinfa', name: '音法类', category: '特殊类', description: '音波攻击/琴棋书画/音道', order: 34 },
  { id: 'xiuci', name: '词条类', category: '特殊类', description: '词条/天赋树/属性面板', order: 35 },
  // 🔥 BUG-7修复：补充市面常见题材的金手指类型
  // 🔥 BUG-10修复：补充 coreFunction/specificAbilities/limitations/growthPath 详细字段
  { id: 'jijin', name: '基因进化类', category: '超凡类', description: '基因锁/基因突变/生物进化', order: 36,
    coreFunction: '开启基因锁，激活人体沉睡潜能，获得超凡身体素质与生物进化能力',
    triggerCondition: '基因锁一阶开启（身体素质倍增）、基因突变觉醒（特殊生物能力）、基因融合（吸收异种基因）、基因进化（突破生物极限）、基因领域（影响他人基因）',
    limitations: '基因崩溃风险、进化过程剧烈疼痛、需要特殊基因药剂辅助、过度进化可能失去人类形态',
    growthPath: '基因锁开启→基因突变→基因融合→基因进化→基因领域→超凡生命体' },
  { id: 'jixie', name: '机械改造类', category: '超凡类', description: '义体/纳米改造/机械飞升', order: 37,
    coreFunction: '通过机械义体改造、纳米技术强化，将人体与机械融合，实现机械飞升',
    triggerCondition: '义体改造（替换身体部件）、纳米机器人（自我修复与强化）、机械飞升（意识上传）、AI战术核心（战斗辅助）、能量护盾（防御系统）',
    limitations: '改造需消耗大量资源、机械部件需定期维护、过度改造导致人性流失、电磁脉冲克制',
    growthPath: '初级义体→纳米改造→半机械化→全机械飞升→意识上传→机械神明' },
  { id: 'xingji', name: '星际科技类', category: '超凡类', description: '星舰/曲率引擎/空间跳跃', order: 38,
    coreFunction: '掌握超时代的星际科技，能设计制造星舰、操控曲率引擎、进行空间跳跃',
    triggerCondition: '星舰设计与制造、曲率引擎操控、空间跳跃导航、能量护盾部署、反物质武器研发、星际通讯',
    limitations: '科技资源稀缺、星舰建造周期长、曲率跳跃能耗巨大、技术迭代需要海量数据',
    growthPath: '星舰学徒→星舰工程师→星舰设计师→星际科技大师→星舰宗师→星际文明缔造者' },
  { id: 'moshi', name: '末世生存类', category: '知识/智谋类', description: '末世经验/物资储备/生存技能', order: 39,
    coreFunction: '凭借末世生存经验与先知优势，掌握物资储备、避难所建设、丧尸应对等生存技能',
    triggerCondition: '末世走向预知、物资囤积规划、避难所建设、丧尸弱点分析、幸存者管理、变异生物应对',
    limitations: '记忆只覆盖前一世主要事件、信息存在盲区、人性博弈难以预测、身体仍是普通人',
    growthPath: '末世新手→幸存者→据点首领→避难所领袖→区域霸主→末世文明重建者' },
  { id: 'dianji', name: '电竞天赋类', category: '知识/智谋类', description: '反应速度/游戏理解/操作天赋', order: 40,
    coreFunction: '拥有超越常人的反应速度、游戏理解力和操作天赋，在电竞赛场称霸',
    triggerCondition: '极限反应速度、战术大局观、操作微操天赋、对手心理洞察、版本理解力、团队指挥能力',
    limitations: '体力消耗巨大、状态起伏影响发挥、版本更迭需重新适应、手部伤病隐患',
    growthPath: '路人王→青训选手→职业选手→明星选手→世界冠军→电竞传奇' },
  { id: 'yidao', name: '医道天赋类', category: '知识/智谋类', description: '神医/毒术/丹方传承', order: 41,
    coreFunction: '继承神医传承与丹方秘术，精通医术毒术，可救死扶伤亦可杀人无形',
    triggerCondition: '望闻问切诊断、金针渡穴、丹方调配、毒术运用、经脉调理、起死回生之术',
    limitations: '稀有药材稀缺、施救消耗真气精神、某些绝症无能为力、医者不能自医',
    growthPath: '医童→医者→名医→神医→医圣→医道宗师' },
  { id: 'yanjiu', name: '研究创造类', category: '知识/智谋类', description: '科研/发明/技术突破', order: 42,
    coreFunction: '拥有超凡的科研天赋与创造力，能进行发明创造与技术突破',
    triggerCondition: '跨学科知识融合、实验设计洞察、技术瓶颈突破、发明专利产出、科研团队领导、未来科技预判',
    limitations: '科研周期长、实验失败率高、需要巨额资金支持、同行竞争激烈',
    growthPath: '研究助理→独立研究员→首席科学家→学术权威→科技巨头→改变世界的发明家' },
  { id: 'zhanpe', name: '战宠契约类', category: '超凡类', description: '御兽/契约/宠物进化', order: 43,
    coreFunction: '与异兽签订契约，共同战斗成长，战宠可进化变强形成战宠军团',
    triggerCondition: '异兽契约缔结、战宠进化引导、战宠技能开发、兽语沟通、战宠军团指挥、血脉觉醒激发',
    limitations: '契约数量上限、战宠死亡契约者反噬、稀有战宠难寻、进化材料稀缺',
    growthPath: '见习御兽师→御兽师→高级御兽师→御兽大师→御兽宗师→万兽之王' },
  { id: 'shangye', name: '商业天赋类', category: '知识/智谋类', description: '商业嗅觉/投资眼光/经营天赋', order: 44,
    coreFunction: '拥有超凡的商业嗅觉与投资眼光，能在商海中精准布局缔造商业帝国',
    triggerCondition: '市场趋势洞察、投资决策直觉、商业谈判技巧、企业经营战略、人脉资源整合、危机公关能力',
    limitations: '资金链断裂风险、政策变动影响、竞争对手博弈、商业间谍防范',
    growthPath: '创业新手→小老板→企业家→商业大亨→商业巨头→商业帝国缔造者' },
  { id: 'yule', name: '娱乐天赋类', category: '知识/智谋类', description: '演艺/音乐/导演/综艺天赋', order: 45,
    coreFunction: '拥有全能型娱乐天赋，在演艺、音乐、导演、综艺等领域皆可登顶',
    triggerCondition: '演技天赋、音乐创作才华、导演视野、综艺感、粉丝运营、流量密码洞察',
    limitations: '舆论风险巨大、隐私曝光困扰、创作灵感起伏、人设崩塌隐患',
    growthPath: '路人→网红→新人→明星→顶流→娱乐天王/天后' },
  { id: 'tiyu', name: '体育天赋类', category: '特殊类', description: '运动天赋/体能突破/竞技巅峰', order: 46,
    coreFunction: '拥有超越常人的运动天赋与体能潜力，能在体育竞技领域登顶巅峰',
    triggerCondition: '体能突破极限、运动技能速成、比赛心理素质、战术执行能力、伤病快速恢复、竞技状态调控',
    limitations: '年龄巅峰期有限、伤病职业生涯杀手、兴奋剂检测限制、体能天花板',
    growthPath: '业余选手→职业运动员→国家队→世界冠军→体育传奇→体育名人堂' },
  { id: 'tuili', name: '推理洞察类', category: '知识/智谋类', description: '推理/洞察/侧写/心理分析', order: 47,
    coreFunction: '拥有超凡的推理洞察与心理分析能力，能从细微线索还原真相',
    triggerCondition: '现场痕迹分析、犯罪心理侧写、微表情洞察、逻辑推理链条、行为模式预判、谎言识破',
    limitations: '信息不足时推理失效、高智商犯罪难以洞察、心理负担沉重、情感干扰判断',
    growthPath: '推理爱好者→侦探→名侦探→推理大师→心理学权威→真相揭露者' },
  { id: 'hacker', name: '黑客技术类', category: '知识/智谋类', description: '网络入侵/数据破解/信息操控', order: 48,
    coreFunction: '拥有顶尖黑客技术，能进行网络入侵、数据破解、信息操控',
    triggerCondition: '系统漏洞利用、数据加密破解、网络追踪反追踪、信息战操控、AI攻防、量子计算入侵',
    limitations: '反黑客追踪风险、法律边界模糊、顶级防火墙难破、离线系统无法入侵',
    growthPath: '脚本小子→黑客→高级黑客→网络幽灵→黑客大帝→网络之神' },
  { id: 'chongwu', name: '宠物养成类', category: '特殊类', description: '宠物培养/进化/战斗', order: 49,
    coreFunction: '拥有宠物养成天赋，能培养普通宠物进化为强大战宠',
    triggerCondition: '宠物天赋识别、培养方案制定、进化路径引导、宠物技能开发、宠物情感共鸣、宠物军团组建',
    limitations: '培养周期长、稀有进化材料难寻、宠物寿命限制、感情投入巨大',
    growthPath: '宠物爱好者→宠物训练师→宠物大师→宠物宗师→万宠之王→宠物帝国缔造者' },
  // 🔥 BUG-16修复：参考数据源补充主流白金爆款金手指类型
  { id: 'qiandao', name: '签到类', category: '特殊类', description: '每日签到获取功法/资源/血脉', order: 50,
    coreFunction: '通过每日签到系统获取功法、资源、血脉、神器等各类奖励，签到地点不同奖励不同',
    triggerCondition: '每日签到领奖、特殊地点签到获稀有奖励、连续签到加倍、签到万年累积底蕴、签到触发隐藏机缘、签到获取传承',
    limitations: '签到地点受限、签到时间固定、稀有签到点难寻、签到奖励随机性、过度依赖签到会错失主动机缘',
    growthPath: '新手签到→日常签到→特殊地点签到→万年签到→诸天签到→签到成道' },
  { id: 'guaji', name: '挂机类', category: '特殊类', description: '挂机自动修炼/自动战斗', order: 51,
    coreFunction: '挂机即可自动修炼、自动战斗、自动获取资源，离线也在变强',
    triggerCondition: '挂机自动修炼、离线收益、挂机自动战斗、挂机自动探索、挂机自动炼丹/炼器、挂机万年横推',
    limitations: '挂机效率低于主动修炼、挂机可能被干扰、挂机收益有上限、过度挂机导致实战经验不足',
    growthPath: '挂机新手→挂机入门→挂机精通→挂机万年→挂机横推→挂机成道' },
  { id: 'wuxing', name: '悟性类', category: '知识/智谋类', description: '神级悟性/秒悟万法/零瓶颈', order: 52,
    coreFunction: '拥有神级悟性，可秒悟万法、零瓶颈突破、推演功法破绽、领悟天道法则',
    triggerCondition: '秒悟功法、零瓶颈突破、推演功法破绽、领悟天道法则、融合万法、自创神通',
    limitations: '悟性不能替代资源、领悟需要触发契机、过度依赖悟性忽视实战、领悟上限受境界限制',
    growthPath: '凡人悟性→天才悟性→妖孽悟性→神级悟性→天道悟性→无上悟性' },
  { id: 'tuiyan', name: '推演类', category: '知识/智谋类', description: '推演术/推演功法破绽/天道大势', order: 53,
    coreFunction: '通过推演术推演功法破绽、天道大势、敌人弱点、未来走向，掌握先机',
    triggerCondition: '推演功法破绽、推演天道大势、推演敌人弱点、推演未来走向、推演机缘位置、推演因果',
    limitations: '推演消耗精神力、推演有误差、推演被天道屏蔽、推演高境界存在反噬',
    growthPath: '推演入门→推演小成→推演大成→推演化境→推演天道→推演因果' },
  { id: 'moniqi', name: '模拟器类', category: '特殊类', description: '人生模拟/词条模拟成真', order: 54,
    coreFunction: '通过模拟器模拟人生轨迹或词条效果，模拟内容可百分百具象成真',
    triggerCondition: '人生轨迹模拟、词条模拟成真、模拟提取天赋、模拟规避错误、模拟叠加收益、模拟锁定机缘',
    limitations: '模拟次数有限、模拟消耗资源、模拟有随机性、模拟结果需要主动实现',
    growthPath: '模拟新手→模拟入门→模拟精通→模拟大成→模拟化境→模拟成真' },
  { id: 'dihua', name: '迪化反套路类', category: '特殊类', description: '弟子脑补/被动无敌/误解成神', order: 55,
    coreFunction: '自身无修为或普通，但周围人脑补其行为为无上大道，被动无敌',
    triggerCondition: '弟子脑补成大道、被动触发无敌、误解成神、无心之举被奉为圣训、凡人举动被解读为天机、被动收获信仰',
    limitations: '自身实力与认知不匹配、脑补依赖周围人、离开信徒失去加成、真相暴露风险',
    growthPath: '凡人老祖→被脑补成圣→被动无敌→诸天误解→大道假象→诸天至尊' },
  { id: 'tiaoqyu', name: '词条抽取类', category: '特殊类', description: '年度/随机抽取逆天词条', order: 56,
    coreFunction: '定期或随机抽取逆天词条，词条能力百分百生效，可叠加多条词条',
    triggerCondition: '年度词条抽取、词条模拟成真、词条叠加生效、词条升级、词条融合、词条锁定',
    limitations: '抽取周期固定、词条随机性、词条数量上限、词条冲突风险',
    growthPath: '单词条→双词条→多词条→词条融合→词条化境→词条成神' },
  { id: 'kucun', name: '库存空间类', category: '特殊类', description: '无限空间/随心兑换万物', order: 57,
    coreFunction: '拥有无限叠加的库存空间，可随心兑换万物、囤积海量物资',
    triggerCondition: '无限空间存储、随心兑换万物、空间叠加扩容、物资保鲜、空间传送、空间屏障',
    limitations: '空间扩容需资源、兑换消耗积分/气运、空间被入侵风险、空间有上限',
    growthPath: '储物戒→小世界→洞天福地→随身世界→诸天空间→混沌空间' },
  { id: 'zhanshen', name: '战神归来类', category: '知识/智谋类', description: '铁血战神护国/兵王回归', order: 58,
    coreFunction: '铁血战神/兵王退役后回归都市，凭借超强武力与军中人脉护国护家',
    triggerCondition: '超强武力、军中人脉、特种作战技能、情报网络、指挥调度、一呼百应',
    limitations: '身份暴露风险、牵连家人、军方任务优先、江湖仇家追踪',
    growthPath: '退役战神→都市守护→区域霸主→全国战神→无上战神→护国神将' },
  { id: 'tongling', name: '通灵类', category: '特殊类', description: '阴阳眼/镇魂通灵/风水秘术', order: 59,
    coreFunction: '拥有阴阳眼或通灵能力，可看破阴阳、镇魂渡灵、风水秘术',
    triggerCondition: '阴阳眼看破阴阳、镇魂通灵、风水秘术、命理推算、驱煞渡灵、灵异直播',
    limitations: '通灵反噬、阴气侵蚀、灵异危险、阳气消耗、因果纠缠',
    growthPath: '通灵学徒→民间天师→都市渡灵者→风水宗师→玄学尊者→红尘道祖' },
  // 🔥 优化扩展：补充适合宇宙科幻题材的金手指类型（参考《吞噬星空》等白金爆款）
  { id: 'yzmchuancheng', name: '宇宙传承类', category: '特殊类', description: '星际传承/宇宙文明遗产/上古传承', order: 60,
    coreFunction: '获得陨落文明的传承遗产（如星际飞船、文明数据库、上古强者记忆），快速跃迁至宇宙级实力',
    triggerCondition: '文明遗产继承、星际飞船操控、宇宙数据库访问、上古强者记忆传承、文明科技解析、传承试炼突破',
    limitations: '传承激活需达成条件、传承信息量巨大需逐步消化、传承者会被宇宙势力觊觎、传承反噬风险',
    growthPath: '传承激活→初窥传承→融合传承→掌控传承→超越传承→宇宙传承之主' },
  { id: 'jsnianshi', name: '精神念师类', category: '超凡类', description: '精神念力/灵魂力场/念动力操控', order: 61,
    coreFunction: '觉醒强大精神念力，操控念动力、灵魂攻击、精神扫描，可隔空御物、灵魂入侵',
    triggerCondition: '念动力操控、精神扫描、灵魂攻击、记忆读取、精神屏障、灵魂领域、远程操控兵器',
    limitations: '精神力枯竭需休养、灵魂反噬严重、精神攻击对强者效果递减、过度使用导致精神错乱',
    growthPath: '精神力觉醒→初级念师→中级念师→高级念师→念力大师→宇宙念师' },
  { id: 'xingjiwuzhe', name: '星际武者类', category: '超凡类', description: '武道+基因+宇宙能量复合进化', order: 62,
    coreFunction: '融合武道修炼、基因进化与宇宙能量吸收，形成适合宇宙环境的复合战斗体系',
    triggerCondition: '武道招式、基因潜能开发、宇宙能量吸收、肉身横渡宇宙、星辰之力加持、武道领域展开',
    limitations: '修炼资源需求巨大、基因进化有崩溃风险、宇宙能量吸收需适应期、武道突破需实战磨砺',
    growthPath: '武者学徒→行星武者→恒星武者→宇宙武者→域主武者→界主武者' },
  { id: 'yuzhoufaze', name: '宇宙法则类', category: '特殊类', description: '领悟宇宙法则/法则掌控/本源之力', order: 63,
    coreFunction: '领悟并掌控宇宙本源法则（空间、时间、金木水火土、光暗雷等），可操纵宇宙规则',
    triggerCondition: '法则感悟、法则操控、本源之力、法则领域、法则化身、法则创世',
    limitations: '法则领悟需海量时间、法则反噬致命、法则冲突风险、高阶法则被宇宙强者垄断',
    growthPath: '法则感悟→法则初掌→法则精通→法则大成→法则化境→宇宙本源' },
  { id: 'tunyushiyou', name: '吞噬宇宙类', category: '特殊类', description: '吞噬宇宙能量/星体/法则掠夺', order: 64,
    coreFunction: '通过吞噬宇宙能量、星体物质、甚至法则碎片实现无限进化，吞噬越多越强',
    triggerCondition: '宇宙能量吞噬、星体物质吞噬、法则碎片掠夺、能量转化、吞噬领域、吞噬本源',
    limitations: '吞噬有上限需逐步提升、吞噬有害物质反噬、吞噬过快导致能量失控、被吞噬者意识残留风险',
    growthPath: '能量吞噬→物质吞噬→法则吞噬→本源吞噬→宇宙吞噬→吞噬之主' },
  { id: 'wenmingdengji', name: '文明等级类', category: '知识/智谋类', description: '文明跃迁/科技树解锁/文明领袖', order: 65,
    coreFunction: '通过文明等级跃迁解锁科技树，作为文明领袖获得文明加成，带领文明称霸宇宙',
    triggerCondition: '文明跃迁、科技树解锁、文明资源调度、文明领袖加成、文明意志加持、文明传承',
    limitations: '文明跃迁需海量资源、科技树解锁需时间积累、文明内部派系斗争、文明被灭风险',
    growthPath: '文明启蒙→工业文明→星际文明→宇宙文明→超维文明→永恒文明' },
]

const defaultSystemTypes: TypeItem[] = [
  { id: 'chaotang', name: '朝堂权力体系', category: '朝堂江湖/历史权谋', description: '以皇权为核心的朝堂权力斗争体系', order: 1,
    realmSystem: '白身→衙门小吏→九品主簿→七品知县→五品知府→三品大员→二品封疆→一品尚书→内阁学士→首辅大臣→摄政王→太上皇' , cultivationMethod: '通过科举、军功、门荫等途径入仕，积累政绩与人脉，结交党羽，逐步晋升', restraintRelation: '皇权克制一切（皇权至上），被宦官外戚掣肘（内廷制衡），军权克制文官（武力政变）'},
  { id: 'menfa', name: '门阀世家体系', category: '朝堂江湖/历史权谋', description: '世家大族把持政权的门阀政治体系', order: 2,
    realmSystem: '寒门庶族→地方豪强→郡望世族→州郡甲族→四方冠族→海内名门→顶级门阀→与国同戚→门阀领袖→门阀联盟盟主→世家共主→天下第一家' , cultivationMethod: '依托家族势力入仕，通过联姻、结党、把持地方资源扩张门阀影响力', restraintRelation: '门阀联盟克制皇权（联合施压），被寒门崛起克制（科举冲击），被军权颠覆（武力灭门）'},
  { id: 'keju', name: '科举制度体系', category: '朝堂江湖/历史权谋', description: '通过科举选拔官员的官僚体系', order: 3,
    realmSystem: '童生→秀才→举人→贡士→进士→三甲→庶吉士→翰林编修→翰林侍读→翰林学士→翰林掌院→科举大宗师' , cultivationMethod: '寒门学子通过县试、府试、乡试、会试、殿试逐级科举，凭功名入仕', restraintRelation: '科举士子克制门阀（破除门第垄断），被权贵掣肘（科举不公），被军权颠覆（武将乱政）'},
  { id: 'bingfa', name: '兵法谋略体系', category: '朝堂江湖/历史权谋', description: '行军打仗、兵法谋略的战争体系', order: 4,
    realmSystem: '伍长→什长→百夫长→千夫长→校尉→都尉→偏将→上将→大将军→兵马大元帅→兵法宗师→兵圣' , cultivationMethod: '从基层伍长做起，通过战功积累、兵法研习、沙场历练逐步晋升', restraintRelation: '军权克制朝堂（武力政变），被皇权猜忌（杯酒释兵权），被文官掣肘（粮饷制约）'},
  { id: 'jianghu', name: '江湖游侠体系', category: '朝堂江湖/历史权谋', description: '江湖门派、武林高手的武侠体系', order: 5,
    realmSystem: '江湖菜鸟→三流武者→二流武者→一流武者→后天高手→先天高手→宗师→大宗师→武学泰斗→武林神话→武道至尊→武林至尊' , cultivationMethod: '拜入武林门派，从外门弟子做起，通过武学修炼、江湖历练、比武切磋逐步精进', restraintRelation: '江湖势力克制朝堂基层（侠以武犯禁），被朝堂大军克制（大军压境），被修仙者碾压（仙凡之别）'},
  { id: 'shizi', name: '士子清流体系', category: '朝堂江湖/历史权谋', description: '文人士子、清流言官的舆论体系', order: 6,
    realmSystem: '布衣书生→县学生→府学生→太学生→清流言官→御史中丞→御史大夫→清流领袖→士林宗师→文坛泰斗→文宗→文圣' , cultivationMethod: '苦读经史子集，通过科举或举荐入仕，以清流言官身份影响朝政', restraintRelation: '清流舆论克制权贵（笔伐口诛），被皇权压制（文字狱），被军权碾压（武将乱政）'},
  { id: 'jiupin', name: '九品中正体系', category: '朝堂江湖/历史权谋', description: '九品中正制的门第选官体系', order: 7,
    realmSystem: '下下品→下中品→下上品→中下品→中中品→中上品→上下品→上中品→上上品→中正大都督→天下中正→九品至尊' , cultivationMethod: '通过中正官评定品级，凭门第和德行获得官职，门第越高起点越高', restraintRelation: '门第克制寒门（品级压制），被科举冲击（科举取士），被军权颠覆（武力改朝）'},
  { id: 'xuli', name: '胥吏官僚体系', category: '朝堂江湖/历史权谋', description: '基层胥吏把持实务的官僚体系', order: 8,
    realmSystem: '白役→帮闲→文书→典史→主簿→县丞→通判→同知→知府→布政使→巡抚→胥吏之主' , cultivationMethod: '从基层文书做起，熟悉律令案例，通过把持实务和人情世故逐步掌权', restraintRelation: '胥吏把持实务克制官员（架空长官），被清流弹劾（言官纠察），被皇权清洗（严刑峻法）'},
  { id: 'xiuxian', name: '修仙体系', category: '东方玄幻', description: '练气筑基金丹元婴化神渡劫的修仙体系', order: 9,
    realmSystem: '练气期→筑基期→金丹期→元婴期→化神期→炼虚期→合体期→大乘期→渡劫期→真仙→金仙→仙尊' , cultivationMethod: '吸收天地灵气入体，凝练真元，打通经脉，逐步突破境界，渡劫飞升', restraintRelation: '仙道克制妖修（神识克制妖兽本能），被魔修克制（魔气污染灵气），克制凡人武道（法术远程）'},
  { id: 'wudao', name: '武道体系', category: '东方玄幻', description: '武者炼体聚气凝真的武道修炼体系', order: 10,
    realmSystem: '武徒→武者→武师→大武师→武宗→武王→武皇→武帝→武尊→武圣→武神→武道至尊' , cultivationMethod: '淬炼肉身，凝聚真气，通过武学招式和战斗历练逐步突破武道境界', restraintRelation: '武道克制异能（肉身抗击打），被修仙克制（法术远程消耗），被妖修克制（妖兽肉身更强）'},
  { id: 'lianti', name: '炼体体系', category: '东方玄幻', description: '淬炼肉身、以力证道的炼体体系', order: 11,
    realmSystem: '铜皮→铁骨→银脏→金血→玉髓→龙筋→凤骨→天脉→神体→圣躯→不朽体→力之大道' , cultivationMethod: '以外力淬炼肉身，通过天材地宝、特殊功法、极限磨练强化体魄', restraintRelation: '炼体克制法术攻击（肉身硬抗），被灵魂攻击克制（肉身强但灵魂弱），克制妖修肉身'},
  { id: 'hunxiu', name: '魂修体系', category: '东方玄幻', description: '修炼元神、灵魂攻击的魂修体系', order: 12,
    realmSystem: '魂火→魂雾→魂晶→元神→神识→神念→神心→神域→神格→神王→神帝→魂之大道' , cultivationMethod: '修炼元神，强化灵魂力场，通过灵魂攻击和神识修炼逐步进阶', restraintRelation: '魂修克制炼体（灵魂攻击无视肉身），被精神力强者克制（精神屏障），被佛修克制（佛法镇魂）'},
  { id: 'liandan', name: '炼丹体系', category: '东方玄幻', description: '炼制丹药、丹道宗师的炼丹体系', order: 13,
    realmSystem: '丹徒→丹工→丹师→丹客→丹宗→丹王→丹皇→丹帝→丹尊→丹圣→丹神→丹道至尊' , cultivationMethod: '学习炼丹之术，通过炼制丹药、研究丹方、丹火淬炼逐步精进', restraintRelation: '炼丹克制毒术（丹药解毒），被炼器克制（神兵破丹炉），需依赖炼体/修仙保护'},
  { id: 'zhenfa', name: '阵法体系', category: '东方玄幻', description: '布置阵法、困敌杀敌的阵道体系', order: 14,
    realmSystem: '阵徒→阵师→阵客→阵宗→阵王→阵皇→阵帝→阵尊→阵圣→阵神→阵道大师→阵道至尊' , cultivationMethod: '研习阵法之道，通过布阵、破阵、阵纹刻画逐步掌握阵法奥妙', restraintRelation: '阵法克制群战（困敌杀敌），被阵法师克制（破阵），被修仙强者克制（强力破阵）'},
  { id: 'fulu', name: '符箓体系', category: '东方玄幻', description: '画符念咒、驱鬼降妖的符箓体系', order: 15,
    realmSystem: '符徒→符师→符客→符宗→符王→符皇→符帝→符尊→符圣→符神→符道大师→符道至尊' , cultivationMethod: '学习符箓之术，通过画符、念咒、驱鬼降妖逐步精进', restraintRelation: '符箓克制妖邪（驱鬼降妖），被佛修克制（佛法超度），被修仙强者克制（法力破符）'},
  { id: 'lingqi', name: '灵气体系', category: '东方玄幻', description: '吸收天地灵气修炼的通用体系', order: 16,
    realmSystem: '感气→引气→凝气→化气→液化→固化→结丹→元婴→化神→返虚→合道→飞升' , cultivationMethod: '感悟天地灵气，引导灵气入体，通过凝气、化气、结丹逐步突破', restraintRelation: '灵气体系克制凡人武道（灵气压制），被魔修克制（魔气污染），被妖修克制（妖气侵蚀）'},
  { id: 'zhenqi', name: '真气体系', category: '东方玄幻', description: '凝练真气、打通经脉的武道体系', order: 17,
    realmSystem: '凡息→真气→周天→凝真→罡气→真元→化形→神真→仙真→真王→真帝→真之大道' , cultivationMethod: '凝练真气，打通经脉，通过周天运转、凝真、罡气逐步突破', restraintRelation: '真气克制异能（真气护体），被灵气体系克制（灵气更高维），被魔修克制（魔气污染）'},
  { id: 'xingli', name: '星力体系', category: '东方玄幻', description: '接引星辰之力修炼的星道体系', order: 18,
    realmSystem: '星辉→星光→星芒→星力→星魂→星将→星王→星君→星尊→星圣→星神→星道至尊' , cultivationMethod: '接引星辰之力，通过星辉沐浴、星光凝脉、星力淬体逐步突破', restraintRelation: '星力克制夜间妖邪（星辉克制），被日间修仙克制（日光压制星力），被混沌之力克制'},
  { id: 'mofa', name: '魔法体系', category: '西方奇幻', description: '魔法师学徒到大魔导师的魔法体系', order: 19,
    realmSystem: '魔法学徒→见习法师→初级法师→中级法师→高级法师→魔导士→大魔导士→魔导师→大魔导师→法神→法圣→法尊' , cultivationMethod: '感悟魔法元素，通过冥想积累魔力、学习法术、魔导书研习逐步进阶', restraintRelation: '魔法克制斗气（远程消耗），被斗气近战克制（贴身斩杀），被抗魔生物克制（魔法免疫）'},
  { id: 'douqi', name: '斗气体系', category: '西方奇幻', description: '斗者斗师大斗师斗灵的斗气体系', order: 20,
    realmSystem: '斗者→斗师→大斗师→斗灵→斗王→斗皇→斗宗→斗尊→斗圣→斗帝→斗神→斗之至尊' , cultivationMethod: '吸收斗气种子，通过斗气修炼、战斗历练、斗气化形逐步突破', restraintRelation: '斗气克制魔法近战（贴身斩杀），被魔法远程克制（法术消耗），被暗影刺客克制（偷袭）'},
  { id: 'mofadouqi', name: '魔法斗气双系体系', category: '西方奇幻', description: '魔法与斗气双修的盘龙/西幻通用体系', order: 21,
    realmSystem: '凡人→战士→大地骑士→天空骑士→圣域→深渊→神级→主神→天界→至高神→法则掌控→宇宙主宰' , cultivationMethod: '魔法与斗气双修，通过双系融合、圣域突破、神级洗礼逐步进阶', restraintRelation: '魔法斗气双系克制单系（双系融合），被神级强者克制（神力压制），被圣域克制（圣域碾压）'},
  { id: 'shenge', name: '神格体系', category: '西方奇幻', description: '封神获取神格、神职的成神体系', order: 22,
    realmSystem: '凡人→半神→下位神→中位神→上位神→主神→神王→神帝→神尊→神祖→创世神→至高神' , cultivationMethod: '积累信仰之力，通过封神仪式、神格凝聚、神职获取逐步成神', restraintRelation: '神格克制凡人（神威压制），被其他神格克制（神战），被信仰崩塌克制（信徒流失神格碎裂）'},
  { id: 'xuemai-2', name: '血脉体系', category: '西方奇幻', description: '远古血脉觉醒、血脉进化的体系', order: 23,
    realmSystem: '凡血→微薄血脉→稀薄血脉→觉醒血脉→纯正血脉→远古血脉→上古血脉→太古血脉→神兽血脉→真神血脉→混沌血脉→血脉至尊' , cultivationMethod: '觉醒远古血脉，通过血脉淬炼、血脉进化、血脉返祖逐步突破', restraintRelation: '血脉克制凡人（血脉压制），被更高阶血脉克制（血脉碾压），被血脉克制术克制（封血脉）'},
  { id: 'qishi', name: '骑士体系', category: '西方奇幻', description: '骑士侍从到大骑士的骑士修炼体系', order: 24,
    realmSystem: '侍从→见习骑士→黑铁骑士→青铜骑士→白银骑士→黄金骑士→白金骑士→钻石骑士→圣骑士→神骑士→龙骑士→骑士之神' , cultivationMethod: '从侍从做起，通过骑士训练、战斗历练、封地积累逐步晋升', restraintRelation: '骑士克制魔法近战（冲锋破法），被魔法远程克制（法术消耗），被暗影刺客克制（偷袭）'},
  { id: 'lianjin', name: '炼金体系', category: '西方奇幻', description: '炼金术士炼制魔药道具的炼金体系', order: 25,
    realmSystem: '炼金学徒→炼金术士→炼金师→高级炼金师→炼金大师→炼金宗师→炼金王→炼金皇→炼金帝→炼金尊→炼金圣→炼金神' , cultivationMethod: '学习炼金术，通过魔药炼制、魔法道具制造、炼金研究逐步精进', restraintRelation: '炼金克制魔法（魔药道具），被炼金大师克制（炼金碾压），需依赖战士保护'},
  { id: 'yinengdj', name: '异能等级体系', category: '异能/都市', description: 'F级到SSS级的异能等级体系', order: 26,
    realmSystem: 'F级→E级→D级→C级→B级→A级→S级→SS级→SSS级→EX级→传说级→神话级' , cultivationMethod: '异能觉醒后，通过异能训练、实战磨砺、异能突破逐步进阶', restraintRelation: '异能克制凡人（超能力），被更高阶异能克制（异能碾压），被科技武器克制（异能克制装置）'},
  { id: 'jiyin', name: '基因进化体系', category: '异能/都市', description: '基因突变、基因锁开启的进化体系', order: 27,
    realmSystem: '基因锁一阶→基因锁二阶→基因锁三阶→基因锁四阶→基因锁五阶→基因锁六阶→基因突变→基因融合→基因进化→基因领域→超凡生命→基因至尊' , cultivationMethod: '基因锁开启后，通过基因药剂、基因突变、基因融合逐步进化', restraintRelation: '基因进化克制异能（基因适应），被基因崩溃克制（进化失败），被科技武器克制（基因锁定装置）'},
  { id: 'jingshen', name: '精神力体系', category: '异能/都市', description: '精神念力、心灵感应的精神体系', order: 28,
    realmSystem: '精神力初级→精神力中级→精神力高级→精神力大师→精神力宗师→精神力王者→精神力皇者→精神力帝者→精神力圣者→精神力神者→精神力至尊→精神神域' , cultivationMethod: '精神力觉醒后，通过精神修炼、念力训练、精神领域展开逐步进阶', restraintRelation: '精神力克制肉身类（精神攻击），被精神屏障克制（精神防御），被科技武器克制（精神干扰装置）'},
  { id: 'keji', name: '科技进化体系', category: '异能/都市', description: '机械改造、纳米科技的赛博体系', order: 29,
    realmSystem: '义体改造→纳米注入→机械骨骼→智能核心→半机械化→全机械化→意识上传→机械飞升→机械神明→科技造物主→文明缔造者→科技至尊' , cultivationMethod: '通过机械改造、纳米注入、智能核心植入逐步飞升', restraintRelation: '科技进化克制异能（科技加持），被EMP克制（电磁脉冲），被黑客克制（网络入侵）'},
  { id: 'dengjizhi', name: '等级制体系', category: '游戏/系统', description: '1级到100级的通用等级体系', order: 30,
    realmSystem: '1-10级新手→11-20级初阶→21-30级中阶→31-40级高阶→41-50级精英→51-60级稀有→61-70级史诗→71-80级传说→81-90级神话→91-99级不朽→100级永恒→超越等级' , cultivationMethod: '通过任务、战斗、探索获取经验值，升级提升等级解锁能力', restraintRelation: '等级制克制低级（等级碾压），被高级克制（等级压制），被BOSS克制（BOSS机制）'},
  { id: 'zhiye', name: '职业体系', category: '游戏/系统', description: '战士法师弓箭手等职业转职体系', order: 31,
    realmSystem: '平民→学徒→一转→二转→三转→四转→五转→六转→七转→八转→九转→神职' , cultivationMethod: '通过职业转职、技能学习、装备升级逐步进阶', restraintRelation: '职业克制相克职业（职业相克），被转职高阶克制（转职碾压），被BOSS克制（BOSS机制）'},
  { id: 'jineng', name: '技能进化体系', category: '游戏/系统', description: '技能从初级到神级的进化体系', order: 32,
    realmSystem: '初级→中级→高级→专家→大师→宗师→王者→皇者→帝者→圣者→神级→超神' , cultivationMethod: '通过技能熟练度积累、技能书学习、技能进化逐步提升', restraintRelation: '技能进化克制低级技能（技能碾压），被高级技能克制（技能压制），被技能免疫克制（技能免疫）'},
  { id: 'zhuangbei', name: '装备品质体系', category: '游戏/系统', description: '白绿蓝紫金红橙的装备品质体系', order: 33,
    realmSystem: '白色普通→绿色优秀→蓝色精良→紫色史诗→金色传说→红色神器→橙色创世→彩色混沌→七彩鸿蒙→永恒不朽→超凡神话→创世之源' , cultivationMethod: '通过装备获取、强化、升星、品质提升逐步增强', restraintRelation: '装备品质克制低品质（品质碾压），被更高品质克制（品质压制），被装备破坏术克制（装备破碎）'},
  { id: 'honghuang', name: '洪荒体系', category: '洪荒/神话', description: '地仙天仙金仙大罗金仙准圣圣人的洪荒体系', order: 34,
    realmSystem: '地仙→天仙→真仙→玄仙→金仙→太乙金仙→大罗金仙→准圣→圣人→圣人王→天道→大道' , cultivationMethod: '修炼洪荒法力，通过渡劫、悟道、斩尸逐步证道成圣', restraintRelation: '洪荒克制凡仙（圣压仙），被天道克制（天道压制），被混沌之力克制（混沌灭圣）'},
  { id: 'shendao', name: '神道体系', category: '洪荒/神话', description: '香火成神、神位神职的神道体系', order: 35,
    realmSystem: '阴神→阳神→游神→土地→城隍→山神→水神→天神→主神→神王→神帝→神祖' , cultivationMethod: '收集香火之力，凝聚神位神职，通过信徒供奉、神格凝聚逐步成神', restraintRelation: '神道克制凡人（神威压制），被信仰崩塌克制（信徒流失神格碎裂），被仙道克制（仙压神）'},
  { id: 'wuzu', name: '巫族体系', category: '洪荒/神话', description: '祖巫血脉、肉身成圣的巫族体系', order: 36,
    realmSystem: '巫兵→巫将→巫帅→巫侯→巫王→巫皇→巫帝→巫尊→巫圣→祖巫→盘古→巫之大道' , cultivationMethod: '修炼祖巫血脉，以肉身成圣，通过血脉觉醒、图腾凝聚、肉身突破逐步进阶', restraintRelation: '巫族克制妖族（肉身碾压妖兽），被仙道克制（法术远程消耗），被佛修克制（佛法镇巫）'},
  { id: 'foxiu', name: '佛修体系', category: '洪荒/神话', description: '沙门佛法、罗汉果位的佛修体系', order: 37,
    realmSystem: '沙弥→和尚→法师→罗汉→菩萨→佛陀→古佛→过去佛→燃灯佛→弥勒佛→如来佛祖→佛之大道' , cultivationMethod: '修炼佛法，通过禅定、悟道、积累功德逐步证果成佛', restraintRelation: '佛修克制魔修（佛法镇魔），被妖修克制（妖气污染佛法），被仙道克制（仙压佛）'},
  { id: 'yaoxiu', name: '妖修体系', category: '洪荒/神话', description: '妖族化形、妖丹修炼的妖修体系', order: 38,
    realmSystem: '凡兽→灵兽→妖兽→开智→化形→妖将→妖王→妖皇→妖帝→妖尊→妖圣→妖之大道' , cultivationMethod: '妖族化形后，通过妖丹修炼、化形突破、天劫洗礼逐步进阶', restraintRelation: '妖修克制凡人（妖气压制），被仙道克制（仙压妖），被佛修克制（佛法超度）'},
  { id: 'moxiu', name: '魔修体系', category: '洪荒/神话', description: '魔道修行、心魔历练的魔修体系', order: 39,
    realmSystem: '魔徒→魔者→魔师→魔将→魔王→魔皇→魔帝→魔尊→魔圣→魔神→魔祖→魔之大道' , cultivationMethod: '修炼魔道，通过心魔历练、魔气吸收、魔功突破逐步进阶', restraintRelation: '魔修克制仙道（魔气污染灵气），被佛修克制（佛法镇魔），被正道联盟克制（正邪对抗）'},
  { id: 'shouchong', name: '兽宠进化体系', category: '其他', description: '御兽师与宠兽共同成长的体系', order: 40,
    realmSystem: '见习御兽师→初级御兽师→中级御兽师→高级御兽师→御兽大师→御兽宗师→御兽王→御兽皇→御兽帝→御兽尊→御兽圣→万兽之主' , cultivationMethod: '与兽宠契约后，通过兽宠培养、进化、技能开发逐步进阶', restraintRelation: '兽宠进化克制凡人战宠（兽宠碾压），被更高阶兽宠克制（兽宠压制），被驯兽师克制（驯兽术）'},
  { id: 'wenming', name: '文明等级体系', category: '其他', description: '从原始文明到宇宙文明的等级体系', order: 41,
    realmSystem: '原始文明→奴隶文明→封建文明→工业文明→电气文明→信息文明→星际文明→空间文明→维度文明→混沌文明→永恒文明→宇宙之主' , cultivationMethod: '通过文明发展、科技突破、文明跃迁逐步提升文明等级', restraintRelation: '文明等级克制低维文明（科技碾压），被更高文明克制（文明碾压），被宇宙法则克制（法则限制）'},
  { id: 'weimian', name: '位面体系', category: '其他', description: '位面穿梭、位面战争的多元宇宙体系', order: 42,
    realmSystem: '低维位面→物质位面→能量位面→法则位面→神道位面→圣道位面→混沌位面→鸿蒙位面→永恒位面→超脱位面→多元宇宙→位面之主' , cultivationMethod: '通过位面穿梭、位面战争、位面法则掌握逐步进阶', restraintRelation: '位面克制低维位面（维度碾压），被更高维位面克制（维度压制），被位面之主克制（位面操控）'},
  { id: 'wudengji', name: '无等级体系', category: '其他', description: '无明确等级划分的力量体系', order: 43,
    realmSystem: '初窥→入门→小成→大成→圆满→化境→通玄→入圣→超凡→入神→合道→永恒' , cultivationMethod: '无明确等级划分，通过境界感悟、武学圆满、化境通玄逐步进阶', restraintRelation: '无等级体系靠境界感悟，被等级制克制（等级碾压），被法则掌控者克制（法则灭境）'},
  { id: 'wudao-2', name: '巫道体系', category: '洪荒/神话', description: '上古巫族传承、巫道双修的体系', order: 44,
    realmSystem: '巫徒→巫士→巫师→大巫师→巫祭→巫相→巫王→巫皇→巫帝→巫尊→巫圣→巫祖' , cultivationMethod: '巫道双修，通过巫族传承、巫道融合、血脉觉醒逐步进阶', restraintRelation: '巫道双修克制单系（巫道融合），被仙佛联合克制（仙佛镇压），被混沌之力克制（混沌灭巫道）'},
  { id: 'chansan', name: '斩三尸体系', category: '洪荒/神话', description: '斩去三尸证道混元的成圣体系', order: 45,
    realmSystem: '凡境→感境→化境→斩善尸→斩恶尸→斩自我→合道→混元→大罗→圣人→天道→大道' , cultivationMethod: '斩去三尸证道，通过斩善尸、斩恶尸、斩自我逐步合道成圣', restraintRelation: '斩三尸克制未斩尸者（心境圆满），被圣人克制（圣压），被混沌之力克制（混沌灭三尸）'},
  { id: 'gongde', name: '功德体系', category: '洪荒/神话', description: '积累功德、功德成圣的体系', order: 46,
    realmSystem: '小功德→中功德→大功德→无量功德→金光功德→紫金功德→功德金莲→功德莲台→功德成圣→功德圣王→功德至尊→功德大道' , cultivationMethod: '积累功德，通过行善积德、化解因果、功德成圣逐步进阶', restraintRelation: '功德克制魔道（功德镇魔），被天劫克制（天劫消功德），被因果克制（因果纠缠）'},
  { id: 'qiyun-2', name: '气运体系', category: '洪荒/神话', description: '气运金龙、王朝气运的神道体系', order: 47,
    realmSystem: '微弱气运→凡人气运→英雄气运→王者气运→帝者气运→圣者气运→气运金龙→气运紫龙→气运真龙→气运神龙→气运祖龙→气运之主' , cultivationMethod: '凝聚气运，通过气运金龙培养、王朝气运积累逐步进阶', restraintRelation: '气运克制凡人（气运压制），被天命者克制（天命难违），被因果克制（因果消气运）'},
  { id: 'jianxiu', name: '剑修体系', category: '东方玄幻', description: '一剑破万法的剑修仙侠体系', order: 48,
    realmSystem: '剑徒→剑者→剑师→剑客→剑将→剑王→剑皇→剑帝→剑尊→剑圣→剑神→剑之大道' , cultivationMethod: '以剑入道，通过剑招、剑意、剑心、剑域逐步精进，一剑破万法', restraintRelation: '剑修克制群战（一剑破万法），被阵法克制（困剑阵），被魂修克制（灵魂攻击断剑意）'},
  { id: 'fudaoshi', name: '符道体系', category: '东方玄幻', description: '以符入道、万符朝宗的符道体系', order: 49,
    realmSystem: '符徒→符师→符客→符将→符王→符皇→符帝→符尊→符圣→符神→符祖→符之大道' , cultivationMethod: '以符入道，通过符文刻画、符阵布置、符道感悟逐步精进', restraintRelation: '符道克制妖邪（符箓驱邪），被剑修克制（一剑破万符），被阵法师克制（阵法困符）'},
  { id: 'qidao', name: '棋道体系', category: '东方玄幻', description: '以棋入道、天地为棋盘的体系', order: 50,
    realmSystem: '棋徒→棋者→棋师→棋客→棋将→棋王→棋皇→棋帝→棋尊→棋圣→棋神→棋之大道' , cultivationMethod: '以棋入道，通过棋局对弈、天地为盘、棋道感悟逐步精进', restraintRelation: '棋道克制智谋类（棋局算计），被武道克制（武力破局），被修仙克制（法术碾压）'},
  { id: 'huadao', name: '画道体系', category: '东方玄幻', description: '画中世界、画龙点睛的画道体系', order: 51,
    realmSystem: '画徒→画者→画师→画客→画将→画王→画皇→画帝→画尊→画圣→画神→画之大道' , cultivationMethod: '以画入道，通过画技、画意、画境、画道感悟逐步精进', restraintRelation: '画道克制幻术（画中世界），被剑修克制（一剑破画），被修仙克制（法力破画境）'},
  { id: 'qindao', name: '琴道体系', category: '东方玄幻', description: '以琴入道、音波杀敌的琴道体系', order: 52,
    realmSystem: '琴徒→琴者→琴师→琴客→琴将→琴王→琴皇→琴帝→琴尊→琴圣→琴神→琴之大道' , cultivationMethod: '以琴入道，通过琴技、琴音、琴意、琴道感悟逐步精进', restraintRelation: '琴道克制魂修（音波镇魂），被剑修克制（一剑断琴弦），被修仙克制（法力破音波）'},
  { id: 'shudao', name: '书道体系', category: '东方玄幻', description: '以书入道、字含天地的书道体系', order: 53,
    realmSystem: '书徒→书者→书师→书客→书将→书王→书皇→书帝→书尊→书圣→书神→书之大道' , cultivationMethod: '以书入道，通过书法、书意、书境、书道感悟逐步精进', restraintRelation: '书道克制文道（字含天地），被武道克制（武力破书），被修仙克制（法力破字）'},
  { id: 'shushu', name: '术数体系', category: '东方玄幻', description: '奇门遁甲、八卦周易的术数体系', order: 54,
    realmSystem: '术徒→术者→术师→术客→术将→术王→术皇→术帝→术尊→术圣→术神→术之大道' , cultivationMethod: '研习奇门遁甲、八卦周易，通过术数推演、天地感悟逐步精进', restraintRelation: '术数克制智谋类（推演算计），被天命者克制（天命难违），被修仙克制（法力破术）'},
  { id: 'jiansheng', name: '剑圣体系', category: '东方玄幻', description: '剑心通明、人剑合一的剑圣体系', order: 55,
    realmSystem: '剑心初成→剑心通明→人剑合一→剑意凝形→剑意化形→剑域展开→剑道法则→剑道化身→剑道至尊→剑道圣王→剑道神王→剑之至高' , cultivationMethod: '修炼剑心，通过剑心通明、人剑合一、剑意凝形逐步精进', restraintRelation: '剑圣克制剑修（剑心通明），被魂修克制（灵魂攻击断剑心），被阵法师克制（困剑阵）'},
  { id: 'shenlong', name: '神龙体系', category: '西方奇幻', description: '龙血觉醒、化龙的龙骑士体系', order: 56,
    realmSystem: '龙血者→龙裔→半龙人→龙人→地龙→飞龙→巨龙→龙王→龙皇→龙帝→龙尊→龙神' , cultivationMethod: '觉醒龙血，通过龙血淬体、龙化变身、龙骑契约逐步进阶', restraintRelation: '龙血克制凡人（龙威压制），被屠龙勇士克制（屠龙术），被神级强者克制（神力灭龙）'},
  { id: 'mojie', name: '魔戒体系', category: '西方奇幻', description: '魔导科技、魔法机械的魔戒体系', order: 57,
    realmSystem: '魔导学徒→魔导士→魔导师→大魔导师→魔导大师→魔导宗师→魔导王→魔导皇→魔导帝→魔导尊→魔导圣→魔导至尊' , cultivationMethod: '学习魔导科技，通过魔导器制造、魔法机械研发逐步精进', restraintRelation: '魔导科技克制传统魔法（科技加持），被神级强者克制（神力碾压），被反科技力量克制（EMP）'},
  { id: 'aoses', name: '奥术体系', category: '西方奇幻', description: '奥术师、真理之环的奥术体系', order: 58,
    realmSystem: '奥术学徒→奥术士→奥术师→高级奥术师→奥术大师→奥术宗师→奥术王→奥术皇→奥术帝→奥术尊→奥术圣→奥术至尊' , cultivationMethod: '感悟真理奥义，通过奥术研究、真理之环凝聚、奥术实验逐步进阶', restraintRelation: '奥术克制魔法（真理压制），被神级强者克制（神力碾压），被法则掌控者克制（法则灭奥术）'},
  { id: 'jingying', name: '精英体系', category: '游戏/系统', description: '普通精英稀有传说史诗神话的品质体系', order: 59,
    realmSystem: '普通→精英→稀有→史诗→传说→神话→不朽→永恒→超凡→神级→创世→本源' , cultivationMethod: '通过品质提升、稀有度进化、属性强化逐步进阶', restraintRelation: '精英品质克制普通（品质碾压），被更高品质克制（品质压制），被品质免疫克制（品质免疫）'},
  { id: 'tiandi', name: '天地人体系', category: '其他', description: '人阶地阶天阶的三阶九品体系', order: 60,
    realmSystem: '人阶一品→人阶二品→人阶三品→地阶一品→地阶二品→地阶三品→天阶一品→天阶二品→天阶三品→超天阶→神阶→圣阶' , cultivationMethod: '人阶地阶天阶三阶九品，通过品级突破、境界圆满逐步进阶', restraintRelation: '天地人三阶克制凡人（境界碾压），被更高阶克制（境界压制），被法则掌控者克制（法则灭境）'},
  { id: 'fanxian', name: '凡仙体系', category: '东方玄幻', description: '凡人到仙人的凡仙两界体系', order: 61,
    realmSystem: '凡人→练气→筑基→金丹→元婴→化神→渡劫→地仙→天仙→金仙→大罗→仙尊' , cultivationMethod: '凡人修仙，通过练气、筑基、金丹、元婴、化神、渡劫逐步飞升', restraintRelation: '凡仙克制凡人武道（仙凡之别），被真仙克制（仙阶压制），被魔修克制（魔气污染）'},
  { id: 'zhenxian', name: '真仙体系', category: '东方玄幻', description: '真仙玄仙金仙太乙大罗的仙阶体系', order: 62,
    realmSystem: '凡仙→真仙→玄仙→金仙→太乙→大罗→准圣→圣人→圣人王→天道→大道→永恒' , cultivationMethod: '修真者通过仙阶突破，从凡仙到真仙、玄仙、金仙逐步进阶', restraintRelation: '真仙克制凡仙（仙阶压制），被圣人克制（圣压仙），被混沌之力克制（混沌灭仙）'},
  // 🔥 BUG-7修复：补充市面常见题材的世界力量体系类型
  // 🔥 BUG-11修复：补充 realmSystem 境界/等级体系 和 description 详细描述
  { id: 'shangyecz', name: '商业资本体系', category: '异能/都市', order: 63,
    description: '以资本运作为核心，从初创小微企业到跨国商业帝国的层级晋升体系。等级反映企业规模、资本量级、市场影响力和行业话语权，商业博弈与资本运作是主要冲突形式',
    realmSystem: '个体户→小微创业→中小企业→区域龙头→行业龙头→全国巨头→跨国集团→财阀→商业帝国→资本寡头→全球经济命脉→世界资本之主' , cultivationMethod: '从初创小微企业做起，通过资本运作、市场扩张、行业整合逐步做大', restraintRelation: '资本克制小企业（资本碾压），被政策制约（反垄断），被舆论冲击（口碑崩塌）'},
  { id: 'xingjihh', name: '星际航行体系', category: '异能/都市', order: 64,
    description: '以星际航行与宇宙探索为核心的科技等级体系。等级反映文明掌握的航行技术、星域控制范围和宇宙势力影响力，从行星级到宇宙级的科技进化路线',
    realmSystem: '行星级→恒星级→星系级→星域级→银河级→宇宙级→超光速文明→维度文明→时空文明→混沌文明→永恒文明→宇宙主宰' , cultivationMethod: '通过星际航行技术掌握、星域控制、宇宙势力扩张逐步进阶', restraintRelation: '星际航行克制行星级（星舰碾压），被更高文明克制（文明碾压），被宇宙法则克制（法则限制）'},
  { id: 'liangzi', name: '量子力场体系', category: '异能/都市', order: 65,
    description: '以量子力场操控为核心的异能体系。等级反映量子操控精度、力场覆盖范围和维度干涉能力，从基础量子感知到维度掌控的进阶路线',
    realmSystem: '量子感知→量子扰动→量子操控→力场形成→力场掌控→维度干涉→空间扭曲→时间干涉→因果操控→维度穿越→维度掌控→量子神域' , cultivationMethod: '觉醒量子感知后，通过量子扰动、力场操控、维度干涉逐步进阶', restraintRelation: '量子力场克制物理攻击（力场护盾），被反量子装置克制（量子消除），被维度掌控者克制（维度碾压）'},
  { id: 'jijia', name: '机甲体系', category: '异能/都市', order: 66,
    description: '以机甲驾驶与机体进化为核心的科技战斗体系。等级反映机甲性能、驾驶者同步率和人机合一程度，从基础机甲到神级机甲的进化路线',
    realmSystem: '见习机师→初级机师→中级机师→高级机师→王牌机师→机甲骑士→机甲统领→机甲战神→人机合一→机甲化身→机甲神明→永恒机甲' , cultivationMethod: '从见习机师做起，通过机甲驾驶训练、同步率提升、人机合一逐步进阶', restraintRelation: '机甲克制异能（机甲护甲），被EMP克制（电磁脉冲），被更高阶机甲克制（机甲碾压）'},
  { id: 'moshijh', name: '末世进化体系', category: '异能/都市', order: 67,
    description: '以末世变异与晶核进化为核心的生存战斗体系。等级反映变异程度、晶核能量级和生存者地位，从普通幸存者到末世主宰的进化路线',
    realmSystem: '幸存者→变异者→晶核者→进化者→高阶进化者→变异王者→末世领主→变异帝王→末世君王→进化至尊→末世主宰→新世界缔造者' , cultivationMethod: '末世变异后，通过晶核吸收、变异进化、末世领地扩张逐步进阶', restraintRelation: '末世进化克制凡人（变异压制），被晶核武器克制（晶核爆破），被更高阶变异克制（变异碾压）'},
  { id: 'bianyi', name: '变异体系', category: '异能/都市', order: 68,
    description: '以基因变异与异能觉醒为核心的进化体系。等级反映变异等级、异能强度和变异稳定性，从初级变异到神级变异的进化路线',
    realmSystem: '初级变异→中级变异→高级变异→异能觉醒→异能突破→变异王者→变异帝王→变异皇者→变异至尊→神级变异→变异神王→变异之主' , cultivationMethod: '基因变异后，通过异能觉醒、变异突破、变异稳定化逐步进阶', restraintRelation: '变异克制凡人（变异能力），被变异稳定剂克制（药物压制），被更高阶变异克制（变异碾压）'},
  { id: 'wuhun', name: '武魂体系', category: '东方玄幻', order: 69,
    description: '以武魂觉醒与魂环进阶为核心的修炼体系。等级反映武魂品质、魂环数量和魂力境界，从武魂觉醒到武魂封神的修炼路线',
    realmSystem: '武魂觉醒→魂士→魂师→大魂师→魂尊→魂宗→魂王→魂帝→魂圣→魂斗罗→封号斗罗→武魂真神' , cultivationMethod: '武魂觉醒后，通过魂环吸收、魂力修炼、武魂进阶逐步突破', restraintRelation: '武魂克制异能（魂环压制），被魂修克制（灵魂攻击破魂环），被修仙克制（法术碾压）'},
  { id: 'lingwu', name: '灵武体系', category: '东方玄幻', order: 70,
    description: '灵武双修、武灵合一的复合修炼体系。等级反映灵力与武力的融合程度和战斗境界，从灵武入门到灵武化神的修炼路线',
    realmSystem: '灵武入门→灵武双修→灵武合一→灵武化身→灵武通玄→灵武宗师→灵武大师→灵武王者→灵武皇者→灵武帝君→灵武圣者→灵武神尊' , cultivationMethod: '灵武双修，通过灵力和武力融合修炼、武灵合一逐步突破', restraintRelation: '灵武双修克制单系（灵武融合），被双系修仙克制（双系碾压），被魔修克制（魔气污染）'},
  { id: 'shenwen', name: '神纹体系', category: '东方玄幻', order: 71,
    description: '以神纹铭刻与符文觉醒为核心的修炼体系。等级反映神纹数量、纹力强度和神纹品阶，从神纹初刻到神纹成神的修炼路线',
    realmSystem: '神纹初刻→神纹凝形→神纹觉醒→神纹通灵→神纹化形→神纹王者→神纹皇者→神纹帝君→神纹圣者→神纹神王→神纹神皇→神纹之主' , cultivationMethod: '神纹铭刻后，通过纹力修炼、神纹觉醒、神纹通灵逐步突破', restraintRelation: '神纹克制符箓（神纹压制），被阵法师克制（阵法困纹），被修仙强者克制（法力破纹）'},
  { id: 'xuanmai', name: '玄脉体系', category: '东方玄幻', order: 72,
    description: '以玄脉觉醒与脉力修炼为核心的修炼体系。等级反映玄脉品阶、脉力强度和经脉境界，从玄脉初醒到玄脉化神的修炼路线',
    realmSystem: '玄脉初醒→脉力凝形→脉力通玄→玄脉化形→玄脉王者→玄脉皇者→玄脉帝君→玄脉圣者→玄脉神王→玄脉神皇→玄脉神尊→玄脉之主' , cultivationMethod: '玄脉觉醒后，通过脉力修炼、经脉贯通、玄脉化形逐步突破', restraintRelation: '玄脉克制经脉类（脉力压制），被魂修克制（灵魂攻击断脉），被修仙克制（法力破脉）'},
  { id: 'dianji', name: '电竞体系', category: '游戏/系统', order: 73,
    description: '以电竞实力为核心的竞技等级体系。等级反映游戏段位、赛事成就和职业地位，从路人玩家到世界冠军的晋级路线',
    realmSystem: '青铜→白银→黄金→铂金→钻石→大师→宗师→王者→职业选手→明星选手→世界冠军→电竞传奇' , cultivationMethod: '通过电竞训练、比赛实战、段位提升逐步登顶', restraintRelation: '电竞克制路人（技术碾压），被职业选手克制（技术压制），被版本克制（版本削弱）'},
  { id: 'yidaotx', name: '医道体系', category: '朝堂江湖/历史权谋', order: 74,
    description: '以医术造诣为核心的医道修炼体系。等级反映医术境界、丹方传承和救治能力，从医童到国医圣手的医道进阶路线',
    realmSystem: '医童→医徒→医者→名医→神医→医宗→医王→医皇→医圣→医尊→医帝→国医圣手' , cultivationMethod: '拜入医馆或师从名医，通过望闻问切、丹方调配、行医实践逐步精进', restraintRelation: '医道救人克制毒术（解毒），被毒术反制（奇毒难解），被武道碾压（武力灭口）'},
  { id: 'yuletx', name: '娱乐圈体系', category: '异能/都市', order: 75,
    description: '以娱乐圈地位为核心的等级体系。等级反映知名度、作品成就和行业影响力，从路人到影帝的娱乐圈晋升路线',
    realmSystem: '路人→群演→配角→主角→新人奖→人气明星→实力演员→影帝/影后→国民演员→娱乐圈天王/天后→娱乐圈传奇→娱乐之神' , cultivationMethod: '从路人做起，通过演艺训练、作品积累、粉丝运营逐步登顶', restraintRelation: '娱乐圈克制路人（流量压制），被丑闻克制（人设崩塌），被更高流量克制（流量碾压）'},
  { id: 'jiakong', name: '架空王朝体系', category: '朝堂江湖/历史权谋', order: 76,
    description: '架空王朝的爵位官职封地权力体系。等级反映爵位品级、官职高低和封地规模，从白身到王爵的权力晋升路线',
    realmSystem: '白身→秀才→举人→进士→七品知县→五品知府→三品大员→二品封疆→一品尚书→内阁大学士→国公→王爵' , cultivationMethod: '通过科举或恩荫入仕，凭借爵位、官职、封地三重权力逐步晋升', restraintRelation: '爵位官职封地三重权力互相制衡，被皇权收缴（削藩），被军权颠覆（武将篡位）'},
  { id: 'renshu', name: '忍术体系', category: '其他', order: 77,
    description: '以忍术修炼与查克拉为核心的忍者体系。等级反映忍术境界、查克拉量和忍阶等级，从忍校学生到忍界之神的修炼路线',
    realmSystem: '忍校学生→下忍→中忍→特别上忍→上忍→精英上忍→影级→超影级→传说三忍→忍界半神→六道级→忍界之神' , cultivationMethod: '修炼忍术与查克拉，通过忍术学习、查克拉控制、忍阶晋升逐步进阶', restraintRelation: '忍术克制凡人（忍术压制），被更高阶忍术克制（忍术碾压），被六道级克制（六道碾压）'},
  { id: 'bahwang', name: '霸王色体系', category: '其他', order: 78,
    description: '以霸气修炼为核心的战斗体系。等级反映霸气类型、强度和应用境界，从霸气初醒到霸气化神的修炼路线',
    realmSystem: '霸气初醒→见闻色初级→见闻色高级→武装色初级→武装色高级→武装色外放→霸王色觉醒→霸王色精通→霸王色压制→霸王色化形→霸王色领域→霸气之神' , cultivationMethod: '修炼霸气，通过霸气觉醒、霸气精通、霸王色觉醒逐步进阶', restraintRelation: '霸气克制凡人（霸气压制），被更高阶霸气克制（霸气碾压），被霸王色克制（霸王色压制）'},
  { id: 'tiyujj', name: '体育竞技体系', category: '其他', order: 79,
    description: '以体育竞技实力为核心的等级体系。等级反映运动水平、赛事成就和竞技地位，从业余到世界冠军的晋升路线',
    realmSystem: '业余爱好者→校队→市队→省队→国家队→洲际冠军→世界冠军→奥运冠军→世界纪录保持者→体育传奇→名人堂→体育之神' , cultivationMethod: '通过体育训练、比赛实战、赛事成就逐步晋升', restraintRelation: '体育竞技克制业余（技术碾压），被职业选手克制（技术压制），被世界冠军克制（冠军碾压）'},
  { id: 'tuilijj', name: '推理等级体系', category: '其他', order: 80,
    description: '以推理洞察与心理分析为核心的智谋等级体系。等级反映推理能力、侧写精度和心理洞察深度，从推理爱好者到心理学权威的进阶路线',
    realmSystem: '推理爱好者→见习侦探→侦探→名侦探→推理专家→推理大师→心理侧写师→心理学权威→行为分析大师→犯罪心理学宗师→真相揭露者→推理之神' , cultivationMethod: '通过推理实践、案件分析、心理洞察逐步精进', restraintRelation: '推理洞察克制凡人（洞察力），被更高阶推理克制（推理碾压），被心理学权威克制（心理碾压）'},
  { id: 'youxi', name: '游戏世界体系', category: '游戏/系统', order: 81,
    description: '以游戏世界规则为核心的力量体系。等级反映玩家等级、装备品质和副本成就，从新手到游戏之神的成长路线',
    realmSystem: '1级新手→10级初阶→30级中阶→50级高阶→70级精英→90级稀有→100级传说→120级史诗→150级神话→180级不朽→200级永恒→游戏之神' , cultivationMethod: '通过游戏任务、副本、战斗获取经验和装备逐步升级', restraintRelation: '游戏世界克制低级玩家（等级碾压），被高级玩家克制（等级压制），被BOSS克制（BOSS机制）'},
  { id: 'saibo', name: '赛博朋克体系', category: '异能/都市', order: 82,
    description: '以义体改造、网络骇客和企业霸权为核心的赛博体系。等级反映义体改造程度、网络能力和企业地位，从边缘人到赛博之神的进阶路线',
    realmSystem: '边缘人→街头小子→义体改造者→网络骇客→企业特工→企业高管→企业霸主→网络幽灵→赛博传奇→数字意识→赛博神明→赛博之主' , cultivationMethod: '从街头小子做起，通过义体改造、网络骇客、企业地位提升逐步进阶', restraintRelation: '赛博科技克制凡人（义体强化），被EMP克制（电磁脉冲），被网络幽灵克制（网络入侵）'},
  { id: 'weidu', name: '维度体系', category: '其他', order: 83,
    description: '以维度穿梭与维度战争为核心的多元体系。等级反映维度等级、穿梭能力和维度掌控程度，从低维到高维的进化路线',
    realmSystem: '三维凡人→四维感知→五维穿梭→六维操控→七维创造→八维法则→九维本源→十维永恒→超维生命→维度之主→维度神王→维度之主' , cultivationMethod: '通过维度穿梭、维度法则掌握、维度创造逐步进阶', restraintRelation: '维度克制低维（维度碾压），被更高维克制（维度压制），被维度之主克制（维度操控）'},
  { id: 'xuxuni', name: '虚拟现实体系', category: '异能/都市', order: 84,
    description: '以虚拟宇宙和意识上传为核心的虚拟体系。等级反映虚拟能力、沉浸深度和意识层级，从虚拟体验到虚拟之神的进化路线',
    realmSystem: '虚拟体验者→虚拟居民→虚拟构建者→虚拟操控者→虚拟统治者→意识上传者→虚拟神明→虚拟造物主→虚拟宇宙之主→永恒意识→虚拟本源→虚拟之神' , cultivationMethod: '通过虚拟体验、意识上传、虚拟构建逐步进阶', restraintRelation: '虚拟现实克制现实（虚拟操控），被现实力量克制（物理破坏），被虚拟之主克制（虚拟碾压）'},
  // 🔥 优化扩展：补充适合宇宙科幻题材的世界力量体系（参考《吞噬星空》等白金爆款）
  { id: 'yuzhouxiuxing', name: '宇宙修行体系', category: '异能/都市', order: 85,
    description: '以宇宙能量修炼为核心的星空修行体系（参考《吞噬星空》）。等级反映生命层次跃迁、宇宙能量掌控和星空势力地位，从地球武者到宇宙最强者的进化路线，是宇宙科幻题材的核心体系',
    realmSystem: '学徒级→行星级→恒星级→宇宙级→域主级→界主级→不朽级→宇宙尊者→宇宙之主→宇宙最强者→宇宙本源→宇宙至尊' , cultivationMethod: '吸收宇宙能量淬炼肉身与神识，通过生命层次跃迁逐步突破（参考《吞噬星空》）', restraintRelation: '宇宙修行克制行星级（生命层次碾压），被宇宙尊者克制（法则碾压），被宇宙本源克制（本源灭杀）'},
  { id: 'xingkongwuzhe', name: '星空武者体系', category: '异能/都市', order: 86,
    description: '武道修炼与宇宙能量融合的复合战斗体系。等级反映武道境界、基因进化和宇宙能量融合度，从行星武者到宇宙武道至尊的进阶路线',
    realmSystem: '行星武者→恒星武者→宇宙武者→域主武者→界主武者→不朽武者→尊者武者→之主武者→最强武者→武道法则→武道本源→武道至尊' , cultivationMethod: '武道修炼与宇宙能量融合，通过武道突破、基因进化、能量融合同步提升', restraintRelation: '星空武者克制异族（武道+宇宙能量融合），被宇宙尊者克制（法则碾压），被虚空生物克制（虚空侵蚀）'},
  { id: 'jingshennianshi', name: '精神念师体系', category: '异能/都市', order: 87,
    description: '以精神念力修炼为核心的灵魂战斗体系。等级反映精神力强度、念动力精度和灵魂境界，从初级念师到宇宙念师之主的进阶路线',
    realmSystem: '初级念师→中级念师→高级念师→念力大师→念力宗师→念力王者→念力皇者→念力帝者→念力圣者→念力神者→念力本源→念力至尊' , cultivationMethod: '修炼精神念力，通过念动力操控、精神扫描、灵魂攻击逐步进阶', restraintRelation: '精神念师克制肉身类（精神攻击），被精神屏障克制（精神防御），被灵魂免疫者克制（灵魂免疫）'},
  { id: 'yuzhouwenming', name: '宇宙文明体系', category: '异能/都市', order: 88,
    description: '以宇宙文明等级为核心的势力等级体系。等级反映文明科技水平、星域控制范围和宇宙势力地位，从星球文明到宇宙文明的跃迁路线',
    realmSystem: '星球文明→星系文明→星域文明→银河文明→宇宙文明→超光速文明→维度文明→时空文明→混沌文明→永恒文明→多元宇宙→宇宙之主' , cultivationMethod: '通过文明科技研发、星域控制、文明跃迁逐步提升文明等级', restraintRelation: '宇宙文明克制低维文明（科技碾压），被更高文明克制（文明碾压），被宇宙法则克制（法则限制）'},
  { id: 'xukongfaze', name: '虚空法则体系', category: '异能/都市', order: 89,
    description: '以虚空法则领悟为核心的宇宙法则体系。等级反映法则感悟深度、虚空操控能力和本源掌控程度，从法则感悟到宇宙本源的进阶路线',
    realmSystem: '法则感悟→法则初掌→法则精通→法则大成→法则化境→法则领域→法则化身→法则创世→虚空掌控→本源感悟→本源掌控→宇宙本源' , cultivationMethod: '领悟虚空法则，通过法则感悟、法则操控、本源掌控逐步进阶', restraintRelation: '虚空法则克制物理攻击（法则操控），被本源掌控者克制（本源碾压），被混沌之力克制（混沌灭法则）'},
  { id: 'xingchenxiumai', name: '星辰修脉体系', category: '异能/都市', order: 90,
    description: '以星辰之力淬炼经脉的星空修炼体系。等级反映经脉品阶、星辰能量强度和星空境界，从星辉入门到星辰化神的修炼路线',
    realmSystem: '星辉入门→星光凝脉→星芒通脉→星力凝真→星魂觉醒→星将境界→星王境界→星君境界→星尊境界→星圣境界→星神境界→星辰至尊' , cultivationMethod: '以星辰之力淬炼经脉，通过星辉凝脉、星力凝真、星魂觉醒逐步突破', restraintRelation: '星辰修脉克制凡人经脉（星力淬脉），被更高阶星修克制（星辰碾压），被混沌之力克制（混沌灭星辰）'},
]

interface MergeResult {
  result: TypeItem[]
  needUpdate: boolean
}

function mergeTypes(existing: TypeItem[], defaults: TypeItem[]): MergeResult {
  const map = new Map<string, TypeItem>()
  existing.forEach((item) => map.set(item.id, item))
  let needUpdate = false
  defaults.forEach((def) => {
    const existing = map.get(def.id)
    if (!existing) {
      map.set(def.id, { ...def })
      needUpdate = true
    } else {
      // 如果已有类型的描述为空，用默认描述补全
      if (!existing.description && def.description) {
        existing.description = def.description
        needUpdate = true
      }
      // 金手指类型字段补全（与阶段3世界构建-金手指组对齐）
      if (def.coreFunction && !existing.coreFunction) {
        existing.coreFunction = def.coreFunction
        needUpdate = true
      }
      // 🔥 字段迁移：specificAbilities → triggerCondition
      // 旧数据 specificAbilities 内容转为 triggerCondition（语义重新定义为"触发条件"）
      if (!existing.triggerCondition) {
        if (def.triggerCondition) {
          existing.triggerCondition = def.triggerCondition
          needUpdate = true
        } else if (existing.specificAbilities) {
          // 旧数据迁移：将具体能力列表作为触发条件参考，添加前缀说明
          existing.triggerCondition = existing.specificAbilities
          needUpdate = true
        }
      }
      if (def.limitations && !existing.limitations) {
        existing.limitations = def.limitations
        needUpdate = true
      }
      if (def.growthPath && !existing.growthPath) {
        existing.growthPath = def.growthPath
        needUpdate = true
      }
      // 体系类型字段补全（与阶段3世界构建-力量体系组对齐）
      if (def.realmSystem && !existing.realmSystem) {
        existing.realmSystem = def.realmSystem
        needUpdate = true
      }
      // 🔥 新增字段：修炼方式 + 克制关系
      if (def.cultivationMethod && !existing.cultivationMethod) {
        existing.cultivationMethod = def.cultivationMethod
        needUpdate = true
      }
      if (def.restraintRelation && !existing.restraintRelation) {
        existing.restraintRelation = def.restraintRelation
        needUpdate = true
      }
    }
  })
  const result = Array.from(map.values())
  result.sort((a, b) => a.order - b.order)
  return { result, needUpdate }
}

function readTypes(): TypesData {
  if (!fs.existsSync(getTypesFile())) {
    const defaultData: TypesData = {
      abilityTypes: defaultAbilityTypes,
      systemTypes: defaultSystemTypes,
    }
    writeTypes(defaultData)
    return defaultData
  }
  try {
    const data = fs.readFileSync(getTypesFile(), 'utf-8')
    const parsed = JSON.parse(data)
    // 🔥 BUG修复：无论是数组为空还是不存在，都用默认数据补全
    const abilityIsEmpty = !Array.isArray(parsed.abilityTypes) || parsed.abilityTypes.length === 0
    const systemIsEmpty = !Array.isArray(parsed.systemTypes) || parsed.systemTypes.length === 0
    if (abilityIsEmpty) {
      parsed.abilityTypes = defaultAbilityTypes
    }
    if (systemIsEmpty) {
      parsed.systemTypes = defaultSystemTypes
    }
    // 合并缺失的类型和描述
    const abilityMerge = mergeTypes(parsed.abilityTypes, defaultAbilityTypes)
    const systemMerge = mergeTypes(parsed.systemTypes, defaultSystemTypes)
    parsed.abilityTypes = abilityMerge.result
    parsed.systemTypes = systemMerge.result
    if (abilityMerge.needUpdate || systemMerge.needUpdate || abilityIsEmpty || systemIsEmpty) {
      writeTypes(parsed)
    }
    return parsed
  } catch {
    return {
      abilityTypes: defaultAbilityTypes,
      systemTypes: defaultSystemTypes,
    }
  }
}

function writeTypes(data: TypesData) {
  ensureDataFolder()
  fs.writeFileSync(getTypesFile(), JSON.stringify(data, null, 2), 'utf-8')
}

export async function GET() {
  try {
    const data = readTypes()
    return NextResponse.json({
      success: true,
      data: data,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // 修复 v4 M6：写操作限制为管理员
    const actor = await getRequestActor(request)
    if (!actor.isAdmin) {
      return NextResponse.json({ success: false, message: '无权限：仅管理员可修改系统类型' }, { status: 403 })
    }
    const body = await request.json()
    const { type, item } = body

    if (!type || !item || !item.name) {
      return NextResponse.json(
        { success: false, message: '参数不完整' },
        { status: 400 }
      )
    }

    const data = readTypes()
    const newItem: TypeItem = {
      id: item.id || (type + '-' + Date.now()),
      name: item.name,
      category: item.category || '其他',
      description: item.description || '',
      order: item.order || 999,
      // 金手指字段（与阶段3世界构建-金手指组对齐）
      coreFunction: item.coreFunction || '',
      triggerCondition: item.triggerCondition || '',
      limitations: item.limitations || '',
      growthPath: item.growthPath || '',
      // 体系字段（与阶段3世界构建-力量体系组对齐）
      realmSystem: item.realmSystem || '',
      cultivationMethod: item.cultivationMethod || '',
      restraintRelation: item.restraintRelation || '',
    }

    if (type === 'ability') {
      data.abilityTypes.push(newItem)
      data.abilityTypes.sort((a, b) => a.order - b.order)
    } else if (type === 'system') {
      data.systemTypes.push(newItem)
      data.systemTypes.sort((a, b) => a.order - b.order)
    } else {
      return NextResponse.json(
        { success: false, message: '类型不支持' },
        { status: 400 }
      )
    }

    writeTypes(data)

    return NextResponse.json({
      success: true,
      data: newItem,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '添加失败' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    // 修复 v4 M6：写操作限制为管理员
    const actor = await getRequestActor(request)
    if (!actor.isAdmin) {
      return NextResponse.json({ success: false, message: '无权限：仅管理员可修改系统类型' }, { status: 403 })
    }
    const body = await request.json()
    const { type, item } = body

    if (!type || !item || !item.id || !item.name) {
      return NextResponse.json(
        { success: false, message: '参数不完整' },
        { status: 400 }
      )
    }

    const data = readTypes()

    if (type === 'ability') {
      const idx = data.abilityTypes.findIndex((t: TypeItem) => t.id === item.id)
      if (idx === -1) {
        return NextResponse.json(
          { success: false, message: '未找到该类型' },
          { status: 404 }
        )
      }
      data.abilityTypes[idx] = { ...data.abilityTypes[idx], ...item }
      data.abilityTypes.sort((a, b) => a.order - b.order)
    } else if (type === 'system') {
      const idx = data.systemTypes.findIndex((t: TypeItem) => t.id === item.id)
      if (idx === -1) {
        return NextResponse.json(
          { success: false, message: '未找到该类型' },
          { status: 404 }
        )
      }
      data.systemTypes[idx] = { ...data.systemTypes[idx], ...item }
      data.systemTypes.sort((a, b) => a.order - b.order)
    } else {
      return NextResponse.json(
        { success: false, message: '类型不支持' },
        { status: 400 }
      )
    }

    writeTypes(data)

    return NextResponse.json({
      success: true,
      data: item,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '更新失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    // 修复 v4 M6：写操作限制为管理员
    const actor = await getRequestActor(request)
    if (!actor.isAdmin) {
      return NextResponse.json({ success: false, message: '无权限：仅管理员可删除系统类型' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')

    if (!type || !id) {
      return NextResponse.json(
        { success: false, message: '参数不完整' },
        { status: 400 }
      )
    }

    const data = readTypes()

    if (type === 'ability') {
      data.abilityTypes = data.abilityTypes.filter((t: TypeItem) => t.id !== id)
    } else if (type === 'system') {
      data.systemTypes = data.systemTypes.filter((t: TypeItem) => t.id !== id)
    } else {
      return NextResponse.json(
        { success: false, message: '类型不支持' },
        { status: 400 }
      )
    }

    writeTypes(data)

    return NextResponse.json({
      success: true,
      message: '删除成功',
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    )
  }
}
