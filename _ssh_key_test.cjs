// 测试 SSH 密钥认证是否可用（无密码）
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = '175.27.244.202'
const USER = 'root'
const PORT = 22
const KEY = path.join(process.env.USERPROFILE, '.ssh', 'minimind_ed25519')

const conn = new Client()
conn.on('ready', () => {
  conn.exec('echo KEY_AUTH_OK && hostname', (err, stream) => {
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
