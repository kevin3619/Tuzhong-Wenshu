// AI服务 - 支持多种大模型API

export interface AIRequest {
  prompt: string
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface AIResponse {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface AIModel {
  id: string
  name: string
  provider: string
  maxTokens: number
  supportsStreaming: boolean
}

// 预设风格模板
export const PRESET_STYLES = [
  // ===== 传统文学 & 经典名家风格 =====
  {
    id: 'wuxia-jinyong',
    name: '金庸武侠风',
    category: '古风',
    description: '金庸式武侠风格，文笔流畅，人物刻画深刻，情节跌宕起伏，家国情怀与江湖侠义并重',
    parameters: {
      formality: 70,
      emotionIntensity: 75,
      descriptionDensity: 80,
      dialogueRatio: 60,
      rhetoricFrequency: 75,
      pacing: 60,
      languageDensity: 70,
      eraFeel: 90,
      excitementDensity: 70
    }
  },
  {
    id: 'wuxia-gulong',
    name: '古龙悬疑武侠风',
    category: '古风',
    description: '古龙式武侠风格，语言冷峻简练，推理悬念交织，意境留白，人物孤独而浪漫',
    parameters: {
      formality: 55,
      emotionIntensity: 70,
      descriptionDensity: 50,
      dialogueRatio: 75,
      rhetoricFrequency: 45,
      pacing: 75,
      languageDensity: 55,
      eraFeel: 80,
      excitementDensity: 72
    }
  },
  {
    id: 'wuxia-liangyusheng',
    name: '梁羽生正气武侠风',
    category: '古风',
    description: '梁羽生式武侠风格，诗词功底深厚，名士风流，正邪分明，侠之大者为国为民',
    parameters: {
      formality: 80,
      emotionIntensity: 65,
      descriptionDensity: 85,
      dialogueRatio: 55,
      rhetoricFrequency: 85,
      pacing: 50,
      languageDensity: 85,
      eraFeel: 95,
      excitementDensity: 60
    }
  },
  {
    id: 'scifi-liucixin',
    name: '刘慈欣硬科幻风',
    category: '科幻',
    description: '刘慈欣式硬科幻风格，科学严谨，想象力宏大，思想深刻，探讨文明与宇宙终极命题',
    parameters: {
      formality: 85,
      emotionIntensity: 60,
      descriptionDensity: 85,
      dialogueRatio: 40,
      rhetoricFrequency: 60,
      pacing: 50,
      languageDensity: 80,
      eraFeel: 40,
      excitementDensity: 65
    }
  },
  {
    id: 'scifi-haicilaien',
    name: '海伯利安太空歌剧风',
    category: '科幻',
    description: '丹·西蒙斯海伯利安式风格，诗性叙事+哲学思辨+宗教隐喻+多线交织的太空史诗',
    parameters: {
      formality: 82, emotionIntensity: 78, descriptionDensity: 88, dialogueRatio: 42,
      rhetoricFrequency: 85, pacing: 45, languageDensity: 88, eraFeel: 50, excitementDensity: 70
    }
  },
  {
    id: 'scifi-wangjinkang',
    name: '王晋康生命科幻风',
    category: '科幻',
    description: '王晋康式科幻风格，生命科学与伦理思辨并重，东方哲思融入硬核科技，语言朴实厚重',
    parameters: {
      formality: 75, emotionIntensity: 65, descriptionDensity: 78, dialogueRatio: 50,
      rhetoricFrequency: 62, pacing: 58, languageDensity: 75, eraFeel: 45, excitementDensity: 62
    }
  },
  {
    id: 'modern-romance',
    name: '现代言情甜宠风',
    category: '现代',
    description: '现代言情甜宠风格，语言轻松，情感细腻，甜蜜温馨，霸总/暖男/校园/都市恋爱',
    parameters: {
      formality: 30,
      emotionIntensity: 90,
      descriptionDensity: 70,
      dialogueRatio: 80,
      rhetoricFrequency: 50,
      pacing: 70,
      languageDensity: 60,
      eraFeel: 20,
      excitementDensity: 60
    }
  },
  {
    id: 'suspense-dongye',
    name: '东野圭吾悬疑风',
    category: '悬疑',
    description: '东野圭吾式悬疑风格，逻辑严密，心理描写细腻，人性阴暗面深刻，结局反转惊人',
    parameters: {
      formality: 75,
      emotionIntensity: 70,
      descriptionDensity: 75,
      dialogueRatio: 55,
      rhetoricFrequency: 55,
      pacing: 80,
      languageDensity: 75,
      eraFeel: 50,
      excitementDensity: 75
    }
  },
  {
    id: 'suspense-agatha',
    name: '阿加莎推理黄金风',
    category: '悬疑',
    description: '阿加莎·克里斯蒂式本格推理，暴风雪山庄+毒杀诡计+人性观察，优雅英伦叙事',
    parameters: {
      formality: 80, emotionIntensity: 65, descriptionDensity: 72, dialogueRatio: 68,
      rhetoricFrequency: 60, pacing: 60, languageDensity: 75, eraFeel: 55, excitementDensity: 70
    }
  },
  {
    id: 'suspense-leiqi',
    name: '雷米刑侦悬疑风',
    category: '悬疑',
    description: '雷米《心理罪》式刑侦风格，犯罪心理画像+社会派推理，写实残酷，深挖人性阴影',
    parameters: {
      formality: 68, emotionIntensity: 80, descriptionDensity: 70, dialogueRatio: 60,
      rhetoricFrequency: 50, pacing: 78, languageDensity: 72, eraFeel: 40, excitementDensity: 80
    }
  },

  // ===== 起点 & 创世 白金大神 风格 =====
  {
    id: 'fantasy-tiancan',
    name: '天蚕土豆玄幻风',
    category: '玄幻',
    description: '天蚕土豆式玄幻风格，热血激昂，升级流，爽点密集，萧炎/林动/牧尘式少年逆袭',
    parameters: {
      formality: 40,
      emotionIntensity: 95,
      descriptionDensity: 65,
      dialogueRatio: 70,
      rhetoricFrequency: 80,
      pacing: 90,
      languageDensity: 70,
      eraFeel: 85,
      excitementDensity: 95
    }
  },
  {
    id: 'fantasy-chendong',
    name: '辰东遮天荒古风',
    category: '玄幻',
    description: '辰东式玄幻风格，宏大世界观+神话史诗+悲怆壮阔，九龙拉棺/完美世界式磅礴叙事',
    parameters: {
      formality: 65, emotionIntensity: 90, descriptionDensity: 85, dialogueRatio: 55,
      rhetoricFrequency: 85, pacing: 70, languageDensity: 80, eraFeel: 90, excitementDensity: 90
    }
  },
  {
    id: 'fantasy-ergen',
    name: '耳根仙逆求魔风',
    category: '仙侠',
    description: '耳根式仙侠风格，逆修哲学+魔性思辨+极道意志，一念成仙一念成魔的悲壮修仙',
    parameters: {
      formality: 70, emotionIntensity: 92, descriptionDensity: 82, dialogueRatio: 58,
      rhetoricFrequency: 80, pacing: 72, languageDensity: 82, eraFeel: 88, excitementDensity: 93
    }
  },
  {
    id: 'fantasy-wangyu',
    name: '忘语凡人修仙风',
    category: '仙侠',
    description: '忘语《凡人修仙传》风格，凡人流开山鼻祖，谨慎务实+步步为营+真实修仙界生态',
    parameters: {
      formality: 60, emotionIntensity: 70, descriptionDensity: 80, dialogueRatio: 62,
      rhetoricFrequency: 68, pacing: 65, languageDensity: 75, eraFeel: 88, excitementDensity: 80
    }
  },
  {
    id: 'xianxia-wozu',
    name: '爱潜水的乌贼风',
    category: '仙侠',
    description: '乌贼式仙侠/诡秘风格，设定严谨，剧情跌宕，人物立体，克苏鲁+维多利亚蒸汽朋克',
    parameters: {
      formality: 75,
      emotionIntensity: 70,
      descriptionDensity: 85,
      dialogueRatio: 55,
      rhetoricFrequency: 70,
      pacing: 65,
      languageDensity: 80,
      eraFeel: 85,
      excitementDensity: 75
    }
  },
  {
    id: 'xianxia-xiaoyao',
    name: '萧鼎诛仙虐恋仙侠风',
    category: '仙侠',
    description: '萧鼎《诛仙》风格，正邪对立+宿命虐恋+佛道儒融合，悲剧美学与中式仙侠哲学',
    parameters: {
      formality: 72, emotionIntensity: 95, descriptionDensity: 88, dialogueRatio: 58,
      rhetoricFrequency: 82, pacing: 60, languageDensity: 82, eraFeel: 92, excitementDensity: 78
    }
  },
  {
    id: 'history-guanfang',
    name: '官术/官居一品 官场历史风',
    category: '历史',
    description: '三戒大师式官场文风格，权谋斗争+层级博弈+官场规矩，层层递进步步高升',
    parameters: {
      formality: 75, emotionIntensity: 72, descriptionDensity: 75, dialogueRatio: 68,
      rhetoricFrequency: 65, pacing: 68, languageDensity: 80, eraFeel: 92, excitementDensity: 82
    }
  },
  {
    id: 'history-dangnian',
    name: '当年明月历史风',
    category: '历史',
    description: '当年明月式历史风格，幽默风趣，深入浅出，通俗易懂，用现代语言讲透正史人物',
    parameters: {
      formality: 70,
      emotionIntensity: 65,
      descriptionDensity: 80,
      dialogueRatio: 50,
      rhetoricFrequency: 70,
      pacing: 55,
      languageDensity: 80,
      eraFeel: 95,
      excitementDensity: 70
    }
  },
  {
    id: 'history-tonghua',
    name: '桐华言情风',
    category: '言情',
    description: '桐华式言情风格，情感细腻，文笔优美，虐心又温暖，古言/清穿/现代都市虐恋',
    parameters: {
      formality: 65,
      emotionIntensity: 95,
      descriptionDensity: 85,
      dialogueRatio: 65,
      rhetoricFrequency: 80,
      pacing: 50,
      languageDensity: 75,
      eraFeel: 60,
      excitementDensity: 55
    }
  },
  {
    id: 'romance-shanhaijuan',
    name: '山海卷轴古风言情风',
    category: '言情',
    description: '古风言情《三生三世》《香蜜》式风格，仙恋+轮回+宿命+虐恋，美轮美奂诗意场景',
    parameters: {
      formality: 70, emotionIntensity: 96, descriptionDensity: 92, dialogueRatio: 65,
      rhetoricFrequency: 90, pacing: 48, languageDensity: 85, eraFeel: 88, excitementDensity: 65
    }
  },
  {
    id: 'romance-mobei',
    name: '墨宝非宝甜宠暖爱风',
    category: '言情',
    description: '墨宝非宝式暖宠风格，高干/电竞/军旅+细水长流甜宠，文字干净温暖治愈不虐',
    parameters: {
      formality: 40, emotionIntensity: 88, descriptionDensity: 75, dialogueRatio: 78,
      rhetoricFrequency: 60, pacing: 65, languageDensity: 65, eraFeel: 35, excitementDensity: 72
    }
  },

  // ===== 番茄 & 七猫 爆款爽文风格 =====
  {
    id: 'fanqie-shuangwen',
    name: '番茄爽文风',
    category: '爽文',
    description: '番茄小说平台热门爽文风格，节奏快，打脸爽，代入感强，废柴逆袭+战神回归+神医下山',
    parameters: {
      formality: 25,
      emotionIntensity: 85,
      descriptionDensity: 50,
      dialogueRatio: 75,
      rhetoricFrequency: 45,
      pacing: 95,
      languageDensity: 55,
      eraFeel: 30,
      excitementDensity: 90
    }
  },
  {
    id: 'fanqie-gengshi',
    name: '番茄番茄梗式搞笑爽文风',
    category: '爽文',
    description: '番茄最火梗文风，段子密集+骚话连篇+脑洞乱飞+反套路打脸，读者从头笑到尾',
    parameters: {
      formality: 15, emotionIntensity: 90, descriptionDensity: 40, dialogueRatio: 85,
      rhetoricFrequency: 55, pacing: 96, languageDensity: 45, eraFeel: 25, excitementDensity: 95
    }
  },
  {
    id: 'fanqie-zhanshen',
    name: '番茄战神回归都市风',
    category: '爽文',
    description: '番茄战神文爆款公式：兵王/医圣/神尊归来→家族被欺→扮猪吃虎→层层打脸→全网震惊',
    parameters: {
      formality: 20, emotionIntensity: 92, descriptionDensity: 45, dialogueRatio: 78,
      rhetoricFrequency: 50, pacing: 95, languageDensity: 48, eraFeel: 20, excitementDensity: 96
    }
  },
  {
    id: 'fanqie-feichai',
    name: '番茄废柴签到系统流',
    category: '爽文',
    description: '番茄系统签到文爆款：开局绑定系统→每日签到送神级奖励→碾压一切→无敌流爽',
    parameters: {
      formality: 22, emotionIntensity: 94, descriptionDensity: 48, dialogueRatio: 80,
      rhetoricFrequency: 55, pacing: 97, languageDensity: 50, eraFeel: 40, excitementDensity: 98
    }
  },
  {
    id: 'qimao-dayizhu',
    name: '七猫大一柱都市神豪风',
    category: '爽文',
    description: '七猫热门神豪风格，神豪系统+花钱返利+打脸拜金女+商业帝国，读者代入感极强',
    parameters: {
      formality: 18, emotionIntensity: 93, descriptionDensity: 42, dialogueRatio: 82,
      rhetoricFrequency: 48, pacing: 98, languageDensity: 45, eraFeel: 15, excitementDensity: 97
    }
  },

  // ===== 飞卢 无限同人流 风格 =====
  {
    id: 'feilu-tongren',
    name: '飞卢综漫同人脑洞风',
    category: '同人',
    description: '飞卢最火综漫无限流，开局穿综漫/火影/海贼/漫威，800字一章结尾必爽，更新为王',
    parameters: {
      formality: 18, emotionIntensity: 95, descriptionDensity: 40, dialogueRatio: 82,
      rhetoricFrequency: 42, pacing: 98, languageDensity: 42, eraFeel: 30, excitementDensity: 99
    }
  },
  {
    id: 'feilu-xiangzhen',
    name: '飞卢曝光+向真文体',
    category: '爽文',
    description: '飞卢爆款向真文/曝光文：开局被采访/直播/节目曝光身份，层层反转让全网震惊',
    parameters: {
      formality: 20, emotionIntensity: 96, descriptionDensity: 40, dialogueRatio: 85,
      rhetoricFrequency: 45, pacing: 99, languageDensity: 40, eraFeel: 18, excitementDensity: 99
    }
  },
  {
    id: 'feilu-nvpin',
    name: '飞卢女频快穿虐渣风',
    category: '言情',
    description: '飞卢女频快穿爆款：系统快穿+打脸虐渣+收集气运+修罗场女主，单元剧节奏爆炸',
    parameters: {
      formality: 25, emotionIntensity: 95, descriptionDensity: 50, dialogueRatio: 80,
      rhetoricFrequency: 55, pacing: 97, languageDensity: 52, eraFeel: 35, excitementDensity: 96
    }
  },

  // ===== 晋江 & 长佩 女性向 风格 =====
  {
    id: 'jinjiang-danmei',
    name: '晋江耽美甜虐风',
    category: '言情',
    description: '晋江热门耽美风格，强强CP+破镜重圆/追妻火葬场/abo设定+细腻情感拉扯',
    parameters: {
      formality: 45, emotionIntensity: 96, descriptionDensity: 80, dialogueRatio: 72,
      rhetoricFrequency: 75, pacing: 55, languageDensity: 75, eraFeel: 45, excitementDensity: 78
    }
  },
  {
    id: 'jinjiang-nuesheng',
    name: '晋江女强重生复仇风',
    category: '言情',
    description: '晋江爆款古言重生：嫡女/庶女前世被害→重生归来→步步为营→虐渣复仇→帝后宠',
    parameters: {
      formality: 65, emotionIntensity: 92, descriptionDensity: 80, dialogueRatio: 68,
      rhetoricFrequency: 72, pacing: 68, languageDensity: 78, eraFeel: 85, excitementDensity: 85
    }
  },
  {
    id: 'jinjiang-xuanhuan-nvping',
    name: '晋江女频玄幻仙侠风',
    category: '仙侠',
    description: '晋江女频玄幻：女主修仙+1v1双强+打脸绿茶女配+宗门大比，升级与感情并行',
    parameters: {
      formality: 60, emotionIntensity: 90, descriptionDensity: 82, dialogueRatio: 70,
      rhetoricFrequency: 70, pacing: 70, languageDensity: 75, eraFeel: 85, excitementDensity: 88
    }
  },

  // ===== 无限 & 克苏鲁 & 末日 & 副本 风格 =====
  {
    id: 'unlimited-liudisi',
    name: '刘地师无限副本风',
    category: '科幻',
    description: '无限流副本+恐怖生存+规则怪谈，关卡设计精巧，智斗与心理战拉满',
    parameters: {
      formality: 50, emotionIntensity: 88, descriptionDensity: 75, dialogueRatio: 60,
      rhetoricFrequency: 58, pacing: 88, languageDensity: 70, eraFeel: 35, excitementDensity: 92
    }
  },
  {
    id: 'mori-nanpai',
    name: '南派三叔盗墓悬疑风',
    category: '悬疑',
    description: '《盗墓笔记》式风格，古墓探险+铁三角羁绊+神秘悬念+民俗怪谈，层层挖坑',
    parameters: {
      formality: 45, emotionIntensity: 85, descriptionDensity: 75, dialogueRatio: 65,
      rhetoricFrequency: 62, pacing: 78, languageDensity: 65, eraFeel: 70, excitementDensity: 88
    }
  },
  {
    id: 'mori-weixue',
    name: '天下霸唱鬼吹灯冒险风',
    category: '悬疑',
    description: '《鬼吹灯》式风格，摸金校尉+分金定穴+民俗怪谈+热血冒险，原汁原味中式探险',
    parameters: {
      formality: 55, emotionIntensity: 80, descriptionDensity: 80, dialogueRatio: 60,
      rhetoricFrequency: 68, pacing: 70, languageDensity: 70, eraFeel: 75, excitementDensity: 85
    }
  },
  {
    id: 'doomsday-liuxing',
    name: '末日废土进化流风',
    category: '科幻',
    description: '末日+丧尸/异兽+系统觉醒+建庇护所+人类复兴，残酷生存与热血进化并行',
    parameters: {
      formality: 35, emotionIntensity: 90, descriptionDensity: 70, dialogueRatio: 68,
      rhetoricFrequency: 50, pacing: 90, languageDensity: 60, eraFeel: 40, excitementDensity: 94
    }
  },
  {
    id: 'kesulu-huang',
    name: '黄衣之王克苏鲁神话风',
    category: '悬疑',
    description: '克苏鲁神话风格，不可名状恐惧+理智SAN值+黑暗调查+宇宙恐怖，绝望美学',
    parameters: {
      formality: 78, emotionIntensity: 85, descriptionDensity: 88, dialogueRatio: 45,
      rhetoricFrequency: 78, pacing: 60, languageDensity: 82, eraFeel: 55, excitementDensity: 80
    }
  },

  // ===== 游戏 & 竞技 & 电竞 风格 =====
  {
    id: 'game-lolquanzhi',
    name: '全职高手电竞职业风',
    category: '现代',
    description: '《全职高手》蝴蝶蓝风格，电竞职业+战术大师+群像+荣耀战队，热血又燃',
    parameters: {
      formality: 45, emotionIntensity: 88, descriptionDensity: 68, dialogueRatio: 75,
      rhetoricFrequency: 55, pacing: 85, languageDensity: 60, eraFeel: 25, excitementDensity: 92
    }
  },
  {
    id: 'game-youxichuan',
    name: '网游-从零开始数据流风',
    category: '科幻',
    description: '经典数据流网游，属性面板+装备掉落+副本攻略+公会战争，数值党最爱',
    parameters: {
      formality: 40, emotionIntensity: 85, descriptionDensity: 72, dialogueRatio: 70,
      rhetoricFrequency: 55, pacing: 85, languageDensity: 70, eraFeel: 30, excitementDensity: 90
    }
  },
  {
    id: 'game-dalufeng',
    name: '大富翁经营养成风',
    category: '现代',
    description: '种田/经营/基建/模拟城市，从零开始建设领地/村庄/王朝，养成感拉满',
    parameters: {
      formality: 40, emotionIntensity: 75, descriptionDensity: 75, dialogueRatio: 65,
      rhetoricFrequency: 55, pacing: 70, languageDensity: 65, eraFeel: 50, excitementDensity: 80
    }
  },
  // ===== 2026-10-22：补充热门赛道风格 =====
  {
    id: 'urban-yishen',
    name: '都市神医下山风',
    category: '都市',
    description: '扮猪吃虎+医武双修，主角低调藏拙，被轻视后一招翻盘，打脸节奏密',
    parameters: {
      formality: 35, emotionIntensity: 90, descriptionDensity: 55, dialogueRatio: 78,
      rhetoricFrequency: 40, pacing: 92, languageDensity: 55, eraFeel: 20, excitementDensity: 95
    }
  },
  {
    id: 'urban-zongcai',
    name: '都市豪门总裁风',
    category: '都市',
    description: '豪门恩怨+商战+强强对峙，场面体面、台词锋利，情绪张力靠关系拉扯',
    parameters: {
      formality: 65, emotionIntensity: 85, descriptionDensity: 70, dialogueRatio: 72,
      rhetoricFrequency: 60, pacing: 70, languageDensity: 62, eraFeel: 25, excitementDensity: 78
    }
  },
  {
    id: 'urban-chongsheng',
    name: '都市重生逆袭风',
    category: '都市',
    description: '带着前世记忆回到关键节点，先知先手布局，踩准风口、报复旧敌',
    parameters: {
      formality: 45, emotionIntensity: 88, descriptionDensity: 60, dialogueRatio: 70,
      rhetoricFrequency: 45, pacing: 88, languageDensity: 65, eraFeel: 30, excitementDensity: 90
    }
  },
  {
    id: 'urban-yineng',
    name: '都市异能觉醒风',
    category: '都市',
    description: '现代都市隐藏异能体系，日常与超常交错，能力有代价、有规则',
    parameters: {
      formality: 50, emotionIntensity: 82, descriptionDensity: 72, dialogueRatio: 68,
      rhetoricFrequency: 55, pacing: 80, languageDensity: 68, eraFeel: 25, excitementDensity: 85
    }
  },
  {
    id: 'fantasy-lord',
    name: '西幻领主种田风',
    category: '奇幻',
    description: '领主经营+领民养成+战争扩张，制度、税收、兵源写得实，成长线扎实',
    parameters: {
      formality: 60, emotionIntensity: 72, descriptionDensity: 85, dialogueRatio: 58,
      rhetoricFrequency: 60, pacing: 62, languageDensity: 75, eraFeel: 70, excitementDensity: 72
    }
  },
  {
    id: 'fantasy-academy',
    name: '魔法学院成长风',
    category: '奇幻',
    description: '学院派西幻，天赋测试→导师→试炼→竞赛，体系清晰，少年感与友情线并重',
    parameters: {
      formality: 52, emotionIntensity: 80, descriptionDensity: 78, dialogueRatio: 70,
      rhetoricFrequency: 62, pacing: 75, languageDensity: 68, eraFeel: 65, excitementDensity: 82
    }
  },
  {
    id: 'fantasy-xuanhuan',
    name: '传统玄幻升级风',
    category: '玄幻',
    description: '废柴逆袭+境界体系+宗门争斗，一章一小升、三章一大爽，节奏稳准狠',
    parameters: {
      formality: 45, emotionIntensity: 88, descriptionDensity: 72, dialogueRatio: 66,
      rhetoricFrequency: 58, pacing: 90, languageDensity: 65, eraFeel: 60, excitementDensity: 92
    }
  },
  {
    id: 'xianxia-gudian',
    name: '古典仙侠问道风',
    category: '仙侠',
    description: '文言气韵、洞府清修、因果道心，写景空灵，斗法讲究章法而非堆数值',
    parameters: {
      formality: 82, emotionIntensity: 62, descriptionDensity: 88, dialogueRatio: 48,
      rhetoricFrequency: 86, pacing: 52, languageDensity: 82, eraFeel: 95, excitementDensity: 62
    }
  },
  {
    id: 'xianxia-fanren',
    name: '凡人流稳健修仙风',
    category: '仙侠',
    description: '小人物步步为营，谨慎、算计、留后手，资源与寿元压力贯穿全书',
    parameters: {
      formality: 62, emotionIntensity: 70, descriptionDensity: 80, dialogueRatio: 55,
      rhetoricFrequency: 62, pacing: 68, languageDensity: 78, eraFeel: 85, excitementDensity: 74
    }
  },
  {
    id: 'guofeng-gongdou',
    name: '古风宫廷宅斗风',
    category: '古风',
    description: '深宅内院权谋，话里藏刀、礼数即武器，胜负落在规矩与人心细处',
    parameters: {
      formality: 88, emotionIntensity: 72, descriptionDensity: 88, dialogueRatio: 62,
      rhetoricFrequency: 82, pacing: 58, languageDensity: 82, eraFeel: 96, excitementDensity: 66
    }
  },
  {
    id: 'history-quanmou',
    name: '历史权谋朝堂风',
    category: '历史',
    description: '朝堂博弈+军政调度，文书、粮道、党争写得实，胜负靠制度与人心',
    parameters: {
      formality: 85, emotionIntensity: 68, descriptionDensity: 88, dialogueRatio: 55,
      rhetoricFrequency: 70, pacing: 62, languageDensity: 85, eraFeel: 92, excitementDensity: 68
    }
  },
  {
    id: 'history-niandai',
    name: '年代生活流风',
    category: '历史',
    description: '七八十年代烟火气，票证、物价、街坊、家宴皆有质感，靠日常与温情推进',
    parameters: {
      formality: 45, emotionIntensity: 78, descriptionDensity: 86, dialogueRatio: 70,
      rhetoricFrequency: 50, pacing: 60, languageDensity: 70, eraFeel: 88, excitementDensity: 62
    }
  },
  {
    id: 'suspense-xingzhen',
    name: '刑侦悬疑推理风',
    category: '悬疑',
    description: '案件驱动，现场取证、审讯交锋、线索闭环，逻辑严密不靠巧合',
    parameters: {
      formality: 60, emotionIntensity: 75, descriptionDensity: 78, dialogueRatio: 62,
      rhetoricFrequency: 52, pacing: 82, languageDensity: 75, eraFeel: 40, excitementDensity: 78
    }
  },
  {
    id: 'lingyi-minsu',
    name: '民俗灵异怪谈风',
    category: '灵异',
    description: '乡土怪谈+规矩禁忌，越日常越渗人，恐怖来自细节与不可解释',
    parameters: {
      formality: 55, emotionIntensity: 80, descriptionDensity: 85, dialogueRatio: 55,
      rhetoricFrequency: 62, pacing: 66, languageDensity: 72, eraFeel: 72, excitementDensity: 72
    }
  },
  {
    id: 'military-tiexue',
    name: '铁血军事战争风',
    category: '军事',
    description: '战术与后勤并重，地图、兵力、弹药、命令链写得实，牺牲有重量',
    parameters: {
      formality: 78, emotionIntensity: 82, descriptionDensity: 85, dialogueRatio: 55,
      rhetoricFrequency: 55, pacing: 80, languageDensity: 82, eraFeel: 70, excitementDensity: 78
    }
  },
  {
    id: 'modu-shengcun',
    name: '末世求生基建风',
    category: '末世',
    description: '灾难降临后资源匮乏，队伍管理、物资账目、营地建设，生存压力持续',
    parameters: {
      formality: 48, emotionIntensity: 85, descriptionDensity: 78, dialogueRatio: 62,
      rhetoricFrequency: 48, pacing: 86, languageDensity: 72, eraFeel: 30, excitementDensity: 84
    }
  },
  {
    id: 'game-wuxian',
    name: '无限流副本闯关风',
    category: '游戏',
    description: '规则怪谈式副本，规则解读即战斗，团队博弈+死亡倒计时',
    parameters: {
      formality: 52, emotionIntensity: 86, descriptionDensity: 72, dialogueRatio: 66,
      rhetoricFrequency: 50, pacing: 90, languageDensity: 74, eraFeel: 35, excitementDensity: 90
    }
  },
  {
    id: 'yanqing-tianchong',
    name: '甜宠日常恋爱风',
    category: '言情',
    description: '轻喜剧甜宠，误会不过夜，糖点密集，对白俏皮，情绪暖而不腻',
    parameters: {
      formality: 35, emotionIntensity: 90, descriptionDensity: 62, dialogueRatio: 82,
      rhetoricFrequency: 48, pacing: 78, languageDensity: 55, eraFeel: 25, excitementDensity: 76
    }
  },
  {
    id: 'shuangwen-xitong',
    name: '系统流金手指风',
    category: '爽文',
    description: '任务面板+奖励结算+数值成长，爽点高频可量化，节奏直奔目标',
    parameters: {
      formality: 35, emotionIntensity: 88, descriptionDensity: 58, dialogueRatio: 72,
      rhetoricFrequency: 40, pacing: 94, languageDensity: 62, eraFeel: 30, excitementDensity: 96
    }
  },
  {
    id: 'tongren-zongman',
    name: '综漫同人快穿风',
    category: '同人',
    description: '跨世界穿行，保留原作设定底色，主角以新身份介入并改变关键节点',
    parameters: {
      formality: 45, emotionIntensity: 85, descriptionDensity: 68, dialogueRatio: 74,
      rhetoricFrequency: 50, pacing: 86, languageDensity: 65, eraFeel: 40, excitementDensity: 86
    }
  },
]

// AI生成服务类
export class AIService {
  private apiKey: string
  private provider: string
  private baseUrl: string

  constructor(config: { apiKey: string; provider: string; baseUrl?: string }) {
    this.apiKey = config.apiKey
    this.provider = config.provider
    this.baseUrl = config.baseUrl || this.getDefaultBaseUrl(config.provider)
  }

  private getDefaultBaseUrl(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1'
      case 'claude':
        return 'https://api.anthropic.com/v1'
      case 'baidu':
        return 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat'
      case 'alibaba':
        return 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
      case 'deepseek':
        return 'https://api.deepseek.com/v1'
      default:
        return ''
    }
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    switch (this.provider) {
      case 'openai':
        return this.callOpenAI(request)
      case 'claude':
        return this.callClaude(request)
      case 'deepseek':
        return this.callDeepSeek(request)
      default:
        throw new Error(`不支持的AI提供商: ${this.provider}`)
    }
  }

  private async callOpenAI(request: AIRequest): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4',
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 2000,
        stream: request.stream || false
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API错误: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.choices[0].message.content,
      usage: data.usage
    }
  }

  private async callClaude(request: AIRequest): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: request.model || 'claude-3-opus-20240229',
        max_tokens: request.maxTokens || 2000,
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.temperature || 0.7
      })
    })

    if (!response.ok) {
      throw new Error(`Claude API错误: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      }
    }
  }

  private async callDeepSeek(request: AIRequest): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: request.model || 'deepseek-chat',
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 2000,
        stream: request.stream || false
      })
    })

    if (!response.ok) {
      throw new Error(`DeepSeek API错误: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.choices[0].message.content,
      usage: data.usage
    }
  }

  // 续写功能
  async continueWriting(
    context: string,
    style: string,
    length: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<string> {
    const lengthMap = { short: 200, medium: 500, long: 1000 }
    const targetLength = lengthMap[length]

    const prompt = `请根据以下上下文，以"${style}"的风格续写约${targetLength}字的内容。保持人物性格一致，情节连贯，语言自然流畅。

上下文：
${context}

请直接输出续写内容，不要添加任何说明。`

    const response = await this.generate({
      prompt,
      temperature: 0.8,
      maxTokens: targetLength * 2
    })

    return response.content
  }

  // 番茄检测 - 7维度分析
  async tomatoDetect(text: string): Promise<{
    ai_trace: number
    coherence: number
    homogeneity: number
    shadow_ban_risk: number
    excitement_density: number
    immersion: number
    cold_start: number
    issues: Array<{
      type: string
      location: string
      description: string
      severity: 'low' | 'medium' | 'high'
    }>
  }> {
    const prompt = `请对以下小说章节进行专业分析，从7个维度评分（0-100分），并指出存在的问题。

分析维度：
1. AI痕迹 - 内容是否具有明显的AI生成特征
2. 上下文连贯性 - 段落间逻辑是否连贯
3. 同质化 - 内容是否与常见套路高度相似
4. 暗限流风险 - 是否存在可能被平台限流的内容
5. 爽点密度 - 情节高潮点的分布密度
6. 代入感 - 读者代入感强度
7. 冷启动流量 - 内容是否符合平台算法偏好

请按以下JSON格式输出：
{
  "ai_trace": 分数,
  "coherence": 分数,
  "homogeneity": 分数,
  "shadow_ban_risk": 分数,
  "excitement_density": 分数,
  "immersion": 分数,
  "cold_start": 分数,
  "issues": [
    {
      "type": "问题类型",
      "location": "问题位置（段落或句子）",
      "description": "问题描述",
      "severity": "low/medium/high"
    }
  ]
}

待分析文本：
${text.substring(0, 3000)}`

    const response = await this.generate({
      prompt,
      temperature: 0.3,
      maxTokens: 2000
    })

    try {
      // 尝试从响应中提取JSON
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      throw new Error('无法解析检测结果')
    } catch (error) {
      // 返回默认评分
      return {
        ai_trace: 50,
        coherence: 70,
        homogeneity: 60,
        shadow_ban_risk: 40,
        excitement_density: 65,
        immersion: 70,
        cold_start: 60,
        issues: []
      }
    }
  }

  // 深度改写 - 去AI化
  async rewrite(
    text: string,
    style: string,
    targetScores: {
      ai_trace?: number
      coherence?: number
      excitement_density?: number
    }
  ): Promise<string> {
    const prompt = `请对以下文本进行深度改写，消除AI痕迹，使其更加自然流畅。

改写要求：
1. 采用"${style}"的写作风格
2. 增加口语化表达和心理活动描写
3. 打破过于规律的句式结构
4. 植入更多细节和感官描写
5. 增强情感张力和代入感
${targetScores.ai_trace ? `6. 将AI痕迹降至${targetScores.ai_trace}分以下` : ''}
${targetScores.excitement_density ? `7. 将爽点密度提升至${targetScores.excitement_density}分以上` : ''}

请保持原文的核心情节和人物设定，仅优化表达方式。

原文：
${text}

请直接输出改写后的内容，不要添加任何说明。`

    const response = await this.generate({
      prompt,
      temperature: 0.9,
      maxTokens: text.length * 1.5
    })

    return response.content
  }

  // 生成大纲
  async generateOutline(
    title: string,
    genre: string,
    synopsis: string,
    structure: 'three-act' | 'hero-journey' | 'traditional' = 'three-act'
  ): Promise<{
    acts: Array<{
      name: string
      chapters: Array<{
        title: string
        summary: string
        key_events: string[]
      }>
    }>
  }> {
    const structureMap = {
      'three-act': '三幕式结构',
      'hero-journey': '英雄之旅',
      'traditional': '起承转合'
    }

    const prompt = `请为以下小说生成详细的大纲，采用${structureMap[structure]}。

作品信息：
- 标题：${title}
- 类型：${genre}
- 核心创意：${synopsis}

请按以下JSON格式输出大纲，包含3-5幕，每幕3-8章：
{
  "acts": [
    {
      "name": "幕名称",
      "chapters": [
        {
          "title": "章节标题",
          "summary": "章节概要",
          "key_events": ["关键事件1", "关键事件2"]
        }
      ]
    }
  ]
}`

    const response = await this.generate({
      prompt,
      temperature: 0.8,
      maxTokens: 3000
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      throw new Error('无法解析大纲')
    } catch (error) {
      return { acts: [] }
    }
  }

  // 生成角色设定
  async generateCharacter(
    novelContext: string,
    role: string
  ): Promise<{
    name: string
    age: number
    gender: string
    appearance: string
    personality: string
    background: string
    skills: string[]
  }> {
    const prompt = `请为以下小说生成一个${role}角色的详细设定。

小说背景：
${novelContext}

请按以下JSON格式输出：
{
  "name": "角色姓名",
  "age": 年龄,
  "gender": "性别",
  "appearance": "外貌描写",
  "personality": "性格特点",
  "background": "背景故事",
  "skills": ["技能1", "技能2", "技能3"]
}`

    const response = await this.generate({
      prompt,
      temperature: 0.9,
      maxTokens: 1500
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      throw new Error('无法解析角色设定')
    } catch (error) {
      return {
        name: '',
        age: 0,
        gender: '',
        appearance: '',
        personality: '',
        background: '',
        skills: []
      }
    }
  }

  // 风格分析
  async analyzeStyle(text: string): Promise<{
    narrative_rhythm: string
    vocabulary_habits: string
    sentence_structure: string
    emotional_expression: string
    parameters: {
      formality: number
      emotionIntensity: number
      descriptionDensity: number
      dialogueRatio: number
      rhetoricFrequency: number
      pacing: number
    }
  }> {
    const prompt = `请分析以下文本的写作风格特征：

${text.substring(0, 5000)}

请按以下JSON格式输出分析结果：
{
  "narrative_rhythm": "叙事节奏分析",
  "vocabulary_habits": "用词习惯分析",
  "sentence_structure": "句式结构分析",
  "emotional_expression": "情感表达方式分析",
  "parameters": {
    "formality": 0-100,
    "emotionIntensity": 0-100,
    "descriptionDensity": 0-100,
    "dialogueRatio": 0-100,
    "rhetoricFrequency": 0-100,
    "pacing": 0-100
  }
}`

    const response = await this.generate({
      prompt,
      temperature: 0.5,
      maxTokens: 1500
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      throw new Error('无法解析风格分析')
    } catch (error) {
      return {
        narrative_rhythm: '',
        vocabulary_habits: '',
        sentence_structure: '',
        emotional_expression: '',
        parameters: {
          formality: 50,
          emotionIntensity: 50,
          descriptionDensity: 50,
          dialogueRatio: 50,
          rhetoricFrequency: 50,
          pacing: 50
        }
      }
    }
  }
}

// 导出单例
export const aiService = new AIService({
  apiKey: process.env.NEXT_PUBLIC_AI_API_KEY || '',
  provider: process.env.NEXT_PUBLIC_AI_PROVIDER || 'openai'
})
