// 用密钥免密验证线上服务状态
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = '175.27.244.202'
const USER = 'root'
const PORT = 22
const APP = '/www/wwwroot/tuzhong-wenshu'
const KEY = path.join(process.env.USERPROFILE, '.ssh', 'minimind_ed25519')

const cmd = [
  'cd ' + APP,
  'echo "--- pm2 ---"',
  'pm2 list | grep tuzhong-wenshu || true',
  'echo "--- ports ---"',
  'ss -tlnp | grep -E ":3001|:3000" || true',
  'echo "--- api 3001 ---"',
  'curl -s -o /dev/null -w "HTTP=%{http_code}\n" http://127.0.0.1:3001/tuzhong-wenshu/api/config/public || true',
  'echo "--- api 3001 root ---"',
  'curl -s -o /dev/null -w "HTTP=%{http_code}\n" http://127.0.0.1:3001/ || true',
  'echo "--- public https ---"',
  'curl -s -o /dev/null -w "HTTP=%{http_code}\n" https://tuzhongwang.xyz/tuzhong-wenshu/ || true',
  'echo "--- build markers ---"',
  'grep -c "userModifiedVolumeConfig" .next/static/chunks/*.js 2>/dev/null | grep -v ":0" | head -3 || echo "marker userModifiedVolumeConfig NOT in chunks"',
  'grep -l "替换NPC模板性格占位" .next/static/chunks/*.js 2>/dev/null | head -2 || echo "marker 模板替换 NOT in chunks"',
  'echo DONE',
].join(' && ')

const conn = new Client()
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('EXEC_ERR:', err.message); conn.end(); process.exit(2); return }
    let out = ''
    stream.on('close', (code) => {
      process.stdout.write(out)
      conn.end()
      process.exit(code || 0)
    }).on('data', (d) => { out += d.toString(); process.stdout.write(d) })
      .stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d) })
  })
}).on('error', (err) => {
  console.error('CONN_ERR:', err.message)
  process.exit(1)
}).connect({
  host: HOST, port: PORT, username: USER,
  privateKey: fs.readFileSync(KEY),
  readyTimeout: 20000,
})
