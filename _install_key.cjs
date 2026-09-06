// 一次性安装 SSH 公钥到服务器 authorized_keys（用户已批准）
// 密码从既有 _deploy_route.cjs 源码中读取，不在命令行/环境变量暴露
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = '175.27.244.202'
const USER = 'root'
const PORT = 22

// 从既有部署脚本读取密码（避免命令行明文）
const deploySrc = fs.readFileSync(path.join(__dirname, '_deploy_route.cjs'), 'utf8')
const m = deploySrc.match(/PASS\s*=\s*'([^']+)'/)
if (!m) { console.error('PASS_NOT_FOUND'); process.exit(2) }
const PASS = m[1]

const pub = fs.readFileSync(path.join(process.env.USERPROFILE, '.ssh', 'minimind_ed25519.pub'), 'utf8').trim()

const cmd = [
  'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
  `grep -qF "${pub}" ~/.ssh/authorized_keys 2>/dev/null || echo "${pub}" >> ~/.ssh/authorized_keys`,
  'chmod 600 ~/.ssh/authorized_keys',
  'echo KEY_INSTALLED',
].join(' && ')

const conn = new Client()
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('EXEC_ERR:', err.message); conn.end(); process.exit(3); return }
    let out = ''
    stream.on('close', (code) => {
      process.stdout.write(out)
      conn.end()
      console.log('INSTALL_EXIT=' + code)
      process.exit(code === 0 ? 0 : 4)
    }).on('data', (d) => { out += d.toString(); process.stdout.write(d) })
      .stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d) })
  })
}).on('error', (err) => {
  console.error('CONN_ERR:', err.message)
  process.exit(1)
}).connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 20000 })
