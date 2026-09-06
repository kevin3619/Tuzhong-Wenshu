/**
 * 🔥 容错 JSON 解析器（lenientParseJSON）
 *
 * 针对免费档 9B 模型常见的 JSON 语法错误做最大努力修复：
 *   - 缺失冒号（"key" "value"）            - 缺失逗号（"k":"v" "k2":"v2"）
 *   - 未加引号的键名/字符串值             - 字符串内控制字符
 *   - 结构未闭合（到 EOF 自动收尾）        - 末尾多余逗号/括号
 * 作为 parseJSON 的终极结构化兜底：宁可返回“部分正确”的对象，也不返回空对象导致下游全崩。
 *
 * 此模块为共享实现，供以下路由使用：
 *   - src/app/api/ai-generate/route.ts
 *   - src/app/api/auto-book-analysis/route.ts
 *   - src/app/api/book-search/route.ts（如需）
 */
export function lenientParseJSON(rawText: string): any | null {
  if (!rawText) return null
  let t = String(rawText)
  // 预处理：去 code fence / think 标签 / 控制字符
  t = t.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  t = t.replace(/<think[\s\S]*?<\/think>/gi, '').replace(/<think[\s\S]*/gi, '')
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s === -1 || e === -1 || e <= s) return null
  t = t.slice(s, e + 1)

  let i = 0
  const n = t.length
  function skipWs() { while (i < n && /\s/.test(t[i])) i++ }
  function isKeyStart(c: string) { return c === '"' || /[A-Za-z_\u4e00-\u9fa5]/.test(c) }
  function isValStart(c: string) { return c === '"' || c === '{' || c === '[' || c === '-' || /[0-9]/.test(c) || /[A-Za-z_\u4e00-\u9fa5]/.test(c) }

  function parseString(): string {
    let out = ''
    i++ // 跳过起始 "
    while (i < n) {
      const c = t[i]
      if (c === '\\') {
        const nx = t[i + 1]
        if (nx === 'n') out += '\n'
        else if (nx === 't') out += '\t'
        else if (nx === 'r') out += '\r'
        else if (nx === 'u') { out += t.slice(i, i + 6); i += 5 }
        else if (nx === '"' || nx === '\\' || nx === '/' || nx === 'b' || nx === 'f') out += nx
        else out += nx
        i += 2
      } else if (c === '"') {
        i++
        return out
      } else {
        out += c
        i++
      }
    }
    return out
  }

  function parseBareword(): any {
    const start = i
    while (i < n && !/[,}\]\s]/.test(t[i])) i++
    const word = t.slice(start, i).trim().replace(/^["']|["']$/g, '')
    if (word === '' || word === undefined) return undefined
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(word)) return Number(word)
    if (word === 'true') return true
    if (word === 'false') return false
    if (word === 'null') return null
    return word
  }

  function parseNumber(): any {
    const start = i
    while (i < n && /[0-9eE.+-]/.test(t[i])) i++
    const num = t.slice(start, i)
    const v = Number(num)
    return isNaN(v) ? num : v
  }

  function parseValue(): any {
    skipWs()
    if (i >= n) return undefined
    const c = t[i]
    if (c === '{') return parseObject()
    if (c === '[') return parseArray()
    if (c === '"') return parseString()
    if (c === '-' || /[0-9]/.test(c)) return parseNumber()
    if (t.startsWith('true', i)) { i += 4; return true }
    if (t.startsWith('false', i)) { i += 5; return false }
    if (t.startsWith('null', i)) { i += 4; return null }
    return parseBareword()
  }

  function parseObject(): any {
    const obj: any = {}
    i++ // 跳过 {
    if (i < n && t[i] === '}') { i++; return obj }
    while (i < n) {
      skipWs()
      if (t[i] === '}') { i++; return obj }
      if (t[i] === ',') { i++; continue } // 容忍多余逗号
      // 解析键名
      let key = ''
      if (t[i] === '"') key = parseString()
      else {
        const start = i
        while (i < n && !/[:,\}\]\s]/.test(t[i])) i++
        key = t.slice(start, i).trim().replace(/^["']|["']$/g, '')
      }
      if (key === '') { while (i < n && t[i] !== ',' && t[i] !== '}') i++; if (t[i] === ',') i++; continue }
      skipWs()
      let val: any
      if (t[i] === ':') { i++; val = parseValue() }
      else if (t[i] === ',' || t[i] === '}' || t[i] === ']') { val = '' }
      else if (isValStart(t[i])) { val = parseValue() } // 缺失冒号，直接取后续值
      else { while (i < n && t[i] !== ',' && t[i] !== '}') i++; if (t[i] === ',') i++; continue }
      obj[key] = val
      skipWs()
      if (t[i] === ',') { i++; continue }
      if (t[i] === '}') { i++; return obj }
      // 容忍缺失逗号：下一个 token 像新键/新元素则继续
      if (isKeyStart(t[i]) || isValStart(t[i])) { continue }
      break
    }
    return obj
  }

  function parseArray(): any {
    const arr: any[] = []
    i++ // 跳过 [
    if (i < n && t[i] === ']') { i++; return arr }
    while (i < n) {
      skipWs()
      if (t[i] === ']') { i++; return arr }
      if (t[i] === ',') { i++; continue }
      const val = parseValue()
      arr.push(val)
      skipWs()
      if (t[i] === ',') { i++; continue }
      if (t[i] === ']') { i++; return arr }
      if (isValStart(t[i]) || isKeyStart(t[i])) { continue } // 容忍缺失逗号
      break
    }
    return arr
  }

  try {
    const result = parseObject()
    if (result && typeof result === 'object') return result
  } catch (e) {
    // 容错解析不应抛错，返回已解析部分
  }
  return null
}
