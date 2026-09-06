// 语法快检：用 TS transpileModule 仅做语法层面校验（不做类型检查，速度快）
const fs = require('fs')
const path = require('path')
const _root = path.join(__dirname, '..')
const ts = require(path.join(_root, 'src', 'tuzhong-wenshu', 'node_modules', 'typescript'))

const files = [
  'src/tuzhong-wenshu/src/app/api/ai-generate/route.ts',
  'src/tuzhong-wenshu/src/components/ai-generate-wizard.tsx',
  'src/tuzhong-wenshu/src/app/(main)/page.tsx',
]

let bad = 0
for (const rel of files) {
  const abs = path.join(_root, rel)
  if (!fs.existsSync(abs)) { console.log('MISSING: ' + rel); bad++; continue }
  const src = fs.readFileSync(abs, 'utf-8')
  const out = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
    fileName: rel,
  })
  const diags = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error)
  if (diags.length) {
    bad++
    console.log('❌ ' + rel + ' 语法错误 ' + diags.length + ' 处:')
    diags.slice(0, 12).forEach(d => {
      const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null
      const line = pos ? (pos.line + 1) + ':' + (pos.character + 1) : '?'
      console.log('   L' + line + ' ' + ts.flattenDiagnosticMessageText(d.messageText, ' '))
    })
  } else {
    console.log('✅ ' + rel + ' 语法通过')
  }
}
process.exit(bad ? 1 : 0)
