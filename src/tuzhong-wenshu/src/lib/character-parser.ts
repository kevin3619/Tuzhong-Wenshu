// 自研Markdown角色解析器 - 途中文枢专属
// 支持：Markdown表格、技能卡格式、分段文案 → 结构化角色对象

interface ParsedCharacter {
  name: string
  role: string
  age: string
  gender: string
  appearance: string
  personality: string
  background: string
  coreSkills: string[]
  specialSkill: string
  identity: string
  loyalty: string
  coreQuote: string
  functionTags: string[]
}

// 角色定位关键词识别 - 增量追加时，绝不返回"主角/protagonist"，主角已存在
const ROLE_KEYWORD_MAP: Record<string, string> = {
  '亲随': 'confidant', '亲卫': 'confidant', '护卫': 'confidant', '贴身': 'confidant',
  '丫鬟': 'confidant', '侍女': 'confidant', '太监': 'eunuch', '内侍': 'eunuch',
  '忠臣': 'loyalist', '巡抚': 'loyalist', '尚书': 'loyalist', '参政': 'loyalist',
  '将领': 'general', '将军': 'general', '参将': 'general', '校尉': 'general',
  '都督': 'general', '总兵': 'general', '指挥': 'general',
  '反派': 'antagonist', '奸臣': 'villain', '奸佞': 'villain',
  '汉奸': 'villain',
  '盟友': 'ally', '名将': 'ally', '水师': 'ally',
  '统帅': 'general', '反派势力': 'antagonist',
  '文臣': 'loyalist', '大臣': 'loyalist', '阁老': 'loyalist', '首辅': 'loyalist',
  '武将': 'general', '军官': 'general', '士兵': 'general',
  '女主': 'femaleLead',
  // 注意：不包含"主角"关键词 - 增量追加时主角已存在，绝不允许配角被标记为主角
}

// 根据角色标签推断定位 - 增量追加专用，绝不返回protagonist
function inferRoleFromText(text: string): string {
  const lower = text.toLowerCase()
  for (const key in ROLE_KEYWORD_MAP) {
    if (lower.indexOf(key) >= 0) return ROLE_KEYWORD_MAP[key]
  }
  // 检查反派标签
  if (lower.indexOf('反派') >= 0 || lower.indexOf('敌对') >= 0) return 'antagonist'
  if (lower.indexOf('忠臣') >= 0 || lower.indexOf('大臣') >= 0) return 'loyalist'
  if (lower.indexOf('将领') >= 0 || lower.indexOf('将军') >= 0) return 'general'
  if (lower.indexOf('文臣') >= 0 || lower.indexOf('文官') >= 0) return 'loyalist'
  if (lower.indexOf('武将') >= 0) return 'general'
  // 默认返回配角，绝不返回protagonist
  return 'supporting'
}

// 解析【姓名】—— 职位标题行
function parseTitleLine(line: string): { name: string; identity: string } | null {
  // 匹配：【姓名】—— 职位（可能包含更多描述）
  const match = line.match(/【(.+?)】[——\-]\s*(.+)/)
  if (!match) return null
  return { name: match[1].trim(), identity: match[2].trim() }
}

// 解析 | 属性 | 详情 | 表格
function parseAttributeTable(tableText: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = tableText.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // 跳过表头行和分隔行
    if (line.indexOf('|') < 0) continue
    if (line.indexOf('---') >= 0) continue
    if (line.indexOf('属性') >= 0 && line.indexOf('详情') >= 0) continue

    const cells = line.split('|').map(function (c) { return c.trim() }).filter(function (c) { return c.length > 0 })
    if (cells.length >= 2) {
      // 清理键名（去掉**标记）
      const key = cells[0].replace(/\*\*/g, '').trim()
      const value = cells[1].replace(/\*\*/g, '').trim()
      if (key && value) {
        result[key] = value
      }
    }
  }
  return result
}

// 提取核心技能评级
function parseSkillRating(text: string): string[] {
  const skills: string[] = []
  const regex = /([\u4e00-\u9fa5（）()]+)[（(]?★+[）)]?/g
  let match
  while ((match = regex.exec(text)) !== null) {
    skills.push(match[0].trim())
  }
  return skills
}

// 主解析函数：解析完整角色文本
function parseOneCharacter(block: string): ParsedCharacter | null {
  if (!block || block.trim().length < 5) return null

  const lines = block.split('\n')
  const result: ParsedCharacter = {
    name: '', role: 'supporting', age: '', gender: '男',
    appearance: '', personality: '', background: '',
    coreSkills: [], specialSkill: '', identity: '',
    loyalty: '', coreQuote: '', functionTags: [],
  }

  // 第一步：解析标题【姓名】—— 职位
  for (let i = 0; i < lines.length; i++) {
    const titleInfo = parseTitleLine(lines[i])
    if (titleInfo) {
      result.name = titleInfo.name
      result.identity = titleInfo.identity
      break
    }
  }

  // 如果没有找到标题，尝试从 Markdown 表格解析姓名
  if (!result.name) {
    // 1. 匹配标准Markdown表头 | 姓名 | 性别 | 身份 | ...
    const headerMatch = block.match(/^\|\s*姓名\s*\|[\s\S]*?$/m)
    if (headerMatch) {
      // 读取表头下方第一行，提取姓名
      const tableLines = block.split('\n').filter(function(l) { return l.indexOf('|') >= 0 })
      for (let ti = 0; ti < tableLines.length; ti++) {
        const line = tableLines[ti]
        // 跳过表头行和分隔行
        if (line.indexOf('姓名') >= 0 || line.indexOf('---') >= 0) continue
        const cells = line.split('|').map(function(c) { return c.trim() }).filter(function(c) { return c.length > 0 })
        if (cells.length >= 1 && cells[0] && cells[0].length >= 2) {
          result.name = cells[0]
          // 后续列继续提取
          if (cells.length >= 2 && !result.gender) result.gender = cells[1]
          if (cells.length >= 3 && !result.role) result.role = inferRoleFromText(cells[2])
          if (cells.length >= 4 && !result.identity) result.identity = cells[2]
          if (cells.length >= 5 && !result.background) result.background = cells[3]
          break
        }
      }
    }
    // 2. 匹配 "姓名: XXX" 格式
    const colonMatch = block.match(/姓名\s*[:：]\s*([\u4e00-\u9fa5]{2,4})/)
    if (colonMatch && !result.name) {
      result.name = colonMatch[1].trim()
    }
    // 3. 匹配 **姓名** 格式
    const boldMatch = block.match(/\*\*姓名\*\*\s*[:：]?\s*([\u4e00-\u9fa5]{2,4})/)
    if (boldMatch && !result.name) {
      result.name = boldMatch[1].trim()
    }
    // 4. 匹配表格中姓名列
    const tableMatch = block.match(/\|\s*\*?\*?([\u4e00-\u9fa5]{2,4})\*?\*?\s*\|/)
    if (tableMatch && !result.name) {
      result.name = tableMatch[1].trim()
    }
  }

  if (!result.name) return null

  // 第二步：解析属性表格
  const tableMatch = block.match(/\|[\s\S]*?\|/g)
  if (tableMatch) {
    const fullTable = tableMatch.join('\n')
    const attrs = parseAttributeTable(fullTable)

    // 兼容多种列名格式
    const attrMap: Record<string, keyof ParsedCharacter> = {
      '年龄': 'age', '性别': 'gender', '姓名': 'name',
      '外貌': 'appearance', '容貌': 'appearance', '相貌': 'appearance',
      '性格': 'personality', '性情': 'personality',
      '背景': 'background', '履历': 'background', '简介': 'background',
      '身份': 'identity', '官职': 'identity', '职位': 'identity',
      '定位': 'role', '角色': 'role', '阵营': 'role',
      '核心技能': 'coreSkills', '技能': 'coreSkills', '擅长': 'coreSkills',
      '专属技能': 'specialSkill', '特技': 'specialSkill',
      '忠诚': 'loyalty', '忠诚度': 'loyalty', '忠诚等级': 'loyalty',
      '核心台词': 'coreQuote', '名言': 'coreQuote', '台词': 'coreQuote',
      '功能标签': 'functionTags', '标签': 'functionTags'
    }
    for (const key in attrMap) {
      if (attrs[key]) {
        const targetField = attrMap[key]
        if (targetField === 'coreSkills') {
          if (typeof attrs[key] === 'string') {
            result.coreSkills = parseSkillRating(attrs[key])
          }
        } else if (targetField === 'functionTags' && typeof attrs[key] === 'string') {
          result.functionTags = attrs[key].split(/[、,，]/).map(function (t) { return t.trim() }).filter(function (t) { return t.length > 0 })
        } else {
          (result as unknown as Record<string, unknown>)[targetField] = attrs[key]
        }
      }
    }
  }

  // 第三步：推断角色定位
  const roleText = block + (result.identity || '') + (result.functionTags.join(' ') || '')
  if (result.functionTags.length > 0) {
    for (let t = 0; t < result.functionTags.length; t++) {
      const tag = result.functionTags[t]
      if (tag.indexOf('反派') >= 0 || tag.indexOf('奸臣') >= 0) {
        result.role = tag.indexOf('奸臣') >= 0 ? 'villain' : 'antagonist'
        break
      }
      if (tag.indexOf('忠臣') >= 0) { result.role = 'loyalist'; break }
      if (tag.indexOf('盟友') >= 0) { result.role = 'ally'; break }
      if (tag.indexOf('亲随') >= 0 || tag.indexOf('护卫') >= 0) { result.role = 'confidant'; break }
      if (tag.indexOf('将领') >= 0) { result.role = 'general'; break }
    }
  }
  if (result.role === 'supporting') {
    result.role = inferRoleFromText(roleText)
  }

  // 强制规则：只有 name === '朱由榔' 的角色可以标记为"主角"
  // 其余角色一律修正为：文臣、武将、忠诚部将、智囊军师、敌方将领、盟友、中立人物
  if (result.role === '主角' || result.role === 'protagonist' || result.role === '男主') {
    if (result.name !== '朱由榔') {
      // 回退到 inferRoleFromText 推断
      result.role = inferRoleFromText(roleText)
      // 如果推断结果仍是通用的 supporting，尝试更精确的推断
      if (result.role === 'supporting') {
        const lowerText = roleText.toLowerCase()
        if (lowerText.indexOf('文臣') >= 0 || lowerText.indexOf('文官') >= 0 || lowerText.indexOf('阁老') >= 0 || lowerText.indexOf('首辅') >= 0) {
          result.role = '文臣'
        } else if (lowerText.indexOf('武将') >= 0 || lowerText.indexOf('将军') >= 0 || lowerText.indexOf('都督') >= 0 || lowerText.indexOf('总兵') >= 0) {
          result.role = '武将'
        } else if (lowerText.indexOf('部将') >= 0 || lowerText.indexOf('亲随') >= 0 || lowerText.indexOf('护卫') >= 0 || lowerText.indexOf('忠诚') >= 0) {
          result.role = '忠诚部将'
        } else if (lowerText.indexOf('军师') >= 0 || lowerText.indexOf('谋士') >= 0 || lowerText.indexOf('智囊') >= 0) {
          result.role = '智囊军师'
        } else if (lowerText.indexOf('敌方') >= 0 || lowerText.indexOf('敌将') >= 0 || lowerText.indexOf('反派') >= 0 || lowerText.indexOf('奸臣') >= 0) {
          result.role = '敌方将领'
        } else if (lowerText.indexOf('盟友') >= 0 || lowerText.indexOf('同盟') >= 0) {
          result.role = '盟友'
        } else if (lowerText.indexOf('中立') >= 0) {
          result.role = '中立人物'
        } else {
          result.role = '文臣' // 默认修正为文臣
        }
      }
    }
  }

  return result
}

// 公开接口：解析完整角色文本，返回结构化角色数组
export function parseCharacterText(rawText: string): ParsedCharacter[] {
  if (!rawText || rawText.trim().length === 0) return []

  const characters: ParsedCharacter[] = []
  const segments = splitCharacterBlocks(rawText)

  for (let i = 0; i < segments.length; i++) {
    const parsed = parseOneCharacter(segments[i])
    if (parsed && parsed.name) {
      characters.push(parsed)
    }
  }

  return characters
}

// 按【姓名】标记分割角色块
function splitCharacterBlocks(rawText: string): string[] {
  const blocks: string[] = []
  const lines = rawText.split('\n')
  let currentBlock: string[] = []
  let inBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 检测角色标题【姓名】—— XXX
    if (line.match(/【[\u4e00-\u9fa5]{2,4}】/)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'))
        currentBlock = []
      }
      inBlock = true
      currentBlock.push(line)
    } else if (inBlock) {
      currentBlock.push(line)
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'))
  }

  // 如果没有找到【】格式的标题，尝试按 Markdown 表格分割
  if (blocks.length === 0) {
    // 尝试按 ## 标题分割
    const h2Blocks = rawText.split(/\n(?=##\s)/)
    if (h2Blocks.length > 1) {
      return h2Blocks.filter(function (b) { return b.trim().length > 10 })
    }
    // 尝试按空行+表格分割
    return [rawText]
  }

  return blocks
}

// 将解析结果转换为 StepCharacters 组件需要的格式
export function convertToCharacterFormat(parsed: ParsedCharacter[]): Record<string, unknown>[] {
  return parsed.map(function (item) {
    return {
      name: item.name,
      role: item.role,
      age: item.age,
      gender: item.gender,
      appearance: item.appearance,
      personality: item.personality,
      background: item.background,
      skills: item.coreSkills,
      coreSkills: item.coreSkills,
      specialSkill: item.specialSkill,
      identity: item.identity,
      loyalty: item.loyalty,
      coreMotivation: item.coreQuote,
      functionTags: item.functionTags,
      hiddenTraits: '',
      weaknesses: '',
      growthArc: '',
      attributes: { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 },
      id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
    }
  })
}