 
 

export interface CharacterNamingOptions {
  genre: string
  gender: 'male' | 'female' | 'neutral'
  role: 'protagonist' | 'femaleLead' | 'supporting' | 'villain' | 'extra'
  identity?: string
  personality?: string
  existingNames?: string[]
}

export interface GeneratedName {
  fullName: string
  surname: string
  givenName: string
  style: 'single' | 'double' | 'western'
  title?: string
  nickname?: string
  daoName?: string
}

// 🔥 修复：删除所有硬编码名字列表，名字完全由AI动态生成
// 保留验证逻辑用于检查AI生成的名字是否符合规则

var _badHomophones = ['史珍香','杜子腾','吴礼','苟合','费彦','朱投','杨伟','范剑','毕云涛','庞光','沈京兵','杜琦燕','魏生津','矫厚根','黄建','郝健','秦寿生','刘产','贾君鹏','赵日天','谢主隆恩','史努比','王霸','杨威','史泰龙','刘德华','张学友','郭富城','黎明','周杰伦','林俊杰','王力宏','陶喆','陈奕迅','谢霆锋','王菲','赵薇','范冰冰','李冰冰','章子怡','巩俐','孙红雷','黄渤','徐峥','王宝强','吴京','张翰','郑爽','杨幂','唐嫣','刘诗诗','刘亦菲','赵丽颖','迪丽热巴','古力娜扎','关晓彤','鹿晗','吴亦凡','张艺兴','黄子韬','王一博','肖战','蔡徐坤','陈立农','范丞丞','朱正廷','黄明昊','林彦俊','王琳凯','王子异','尤长靖','陈飞宇','刘昊然','吴磊','张一山','易烊千玺','王俊凯','王源','宋亚轩','马嘉祺','丁程鑫','刘耀文','张真源','严浩翔','贺峻霖','张九龄','王九龙','张云雷','孟鹤堂','周九良','郭麒麟','岳云鹏','孙越','于谦','郭德纲']

var _overusedCharsS = ['静','丽','伟','强','艳','芳','敏','娜','勇','军']
var _overusedCharsA = ['涵','轩','浩','梓','萱','怡','欣','雨','诺','妍']

var _genderMaleOnly = ['戈','戮','莽','彪','锋','骁','烈','瀚','拓','铮','刚','峰','磊','峥','厉','驰','野','彬']
var _genderFemaleOnly = ['嫣','妮','芍','娣','蕊','芷','萱','婷','雅','妍','倩','茹','娜','敏','静','慧','佳','欣','雨','萱','涵','思','怡','悦','晴','雯','睿']

var _genreAncientOnly = ['宸','璟','曜','衡','昭','垣','砚','疏','策','峥','朔','遥','寻','尘','风','惊','野','芷','萱','汀','沅','柔','舒','晚','卿','瑶','瑾','瑜','鸾','翎','绾']
var _genreModernOnly = ['琛','屹','承','厉','川','泽','安','沐','言','珩','扬','驰','野','彬','屿','简','白','晚','诺','知','禾','念','凛','骁','澄','汐']

function _isWesternGenre(genre: string): boolean {
  var westernGenres = ['西幻','科幻','星际','末世']
  return westernGenres.some(function(g) { return genre.includes(g) })
}

function _validateName(fullName: string, options: CharacterNamingOptions): { valid: boolean; reason?: string; replacement?: string } {
  if (_badHomophones.includes(fullName)) {
    return { valid: false, reason: '谐音贬义' }
  }

  if (_overusedCharsS.some(function(c) { return fullName.includes(c) })) {
    if (options.role === 'protagonist' || options.role === 'femaleLead') {
      return { valid: false, reason: '主角禁用烂大街字' }
    }
  }

  if (_overusedCharsA.filter(function(c) { return fullName.includes(c) }).length > 1) {
    return { valid: false, reason: '热门字重复' }
  }

  if (options.gender === 'male') {
    if (_genderFemaleOnly.some(function(c) { return fullName.includes(c) })) {
      return { valid: false, reason: '男性禁用柔字' }
    }
  }

  if (options.gender === 'female') {
    if (_genderMaleOnly.some(function(c) { return fullName.includes(c) })) {
      if (!['女战神','魔头','侠女'].some(function(i) { return (options.identity || '').includes(i) })) {
        return { valid: false, reason: '女性禁用粗硬字' }
      }
    }
  }

  var genre = options.genre || ''
  if (genre.includes('古代') || genre.includes('历史') || genre.includes('武侠') || genre.includes('仙侠')) {
    if (_genreModernOnly.some(function(c) { return fullName.includes(c) })) {
      return { valid: false, reason: '古风禁止现代网红字' }
    }
  }

  if (genre.includes('现代') || genre.includes('都市') || genre.includes('校园')) {
    if (_genreAncientOnly.some(function(c) { return fullName.includes(c) })) {
      return { valid: false, reason: '现代禁止生僻古风字' }
    }
  }

  if (options.existingNames) {
    if (options.existingNames.includes(fullName)) {
      return { valid: false, reason: '名字重复' }
    }
  }

  return { valid: true }
}

// 🔥 修复：generateCharacterName 不再从硬编码列表中随机选择名字
// 返回空字符串，让AI负责动态生成符合题材和设定的角色名
export function generateCharacterName(options: CharacterNamingOptions): GeneratedName {
  return {
    fullName: '',
    surname: '',
    givenName: '',
    style: _isWesternGenre(options.genre) ? 'western' : 'double',
  }
}

export function validateCharacterName(name: string, options: CharacterNamingOptions): { valid: boolean; reason?: string } {
  var validation = _validateName(name, options)
  return { valid: validation.valid, reason: validation.reason }
}

// 🔥 修复：fixCharacterName 不再生成替换名字，只验证
// 如果名字无效，返回空字符串让AI重新生成
export function fixCharacterName(name: string, options: CharacterNamingOptions): string {
  var validation = _validateName(name, options)
  if (validation.valid) {
    return name
  }
  return ''
}

export function generateBatchNames(count: number, options: CharacterNamingOptions): GeneratedName[] {
  var names: GeneratedName[] = []
  for (var i = 0; i < count; i++) {
    names.push(generateCharacterName(options))
  }
  return names
}
