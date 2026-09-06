const fs = require('fs')
const txt = fs.readFileSync(__dirname + '/_fix_arcs.json', 'utf8')
const lines = txt.split(/\r?\n/)
lines.forEach((l, i) => {
  if (/"]'|"\]/.test(l)) console.log((i + 1) + ': ' + l)
})