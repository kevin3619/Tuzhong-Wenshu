// 一次性补丁脚本：把 route.ts 内联的徽章/定位规范化替换为共享模块调用
const fs = require('fs')
const p = 'src/app/api/ai-generate/route.ts'
let s = fs.readFileSync(p, 'utf-8')

const startMark = '      // 🔥 最终：徽章(封号/官职) 与 角色定位(叙事职能) 分离——二者必须是不同字段'
const endMark = '      } catch (_trE) { /* 徽章/定位分离失败不影响主流程 */ }'
const i0 = s.indexOf(startMark)
const i1 = s.indexOf(endMark, i0)
if (i0 < 0 || i1 < 0) { console.error('MARK_NOT_FOUND', i0, i1); process.exit(1) }
const iEnd = i1 + endMark.length

const replacement = [
  '      // 🔥 最终：徽章(封号/官职) 与 角色定位(叙事职能) 规范化',
  "      //   逻辑已抽到 lib/character-normalize.ts，与「一键校正」接口 /api/characters/normalize 共用同一实现（避免两份实现漂移）",
  '      try {',
  "        normalizeCharactersTitlesAndRoles(structuredResult, String((previousData && (previousData.detailedDesignInput || (previousData.idea && previousData.idea.userDesign))) || ''))",
  '      } catch (_trE) { /* 徽章/定位规范化失败不影响主流程 */ }'
].join('\n')

s = s.slice(0, i0) + replacement + s.slice(iEnd)

const impMark = "import { getRequestActor, isAdminOnlyNovel, loadNovelMetaOrNull } from '@/lib/permissions'"
if (s.indexOf(impMark) < 0) { console.error('IMPORT_ANCHOR_NOT_FOUND'); process.exit(1) }
if (s.indexOf("from '@/lib/character-normalize'") < 0) {
  s = s.replace(impMark, impMark + "\nimport { normalizeCharactersTitlesAndRoles } from '@/lib/character-normalize'")
}

fs.writeFileSync(p, s)
console.log('patched bytes=', Buffer.byteLength(s), 'removedChars=', (iEnd - i0) - replacement.length)
