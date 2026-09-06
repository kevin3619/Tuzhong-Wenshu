// 临时 SSH 助手：用密码连接 175.27.244.202 执行远程命令
// 用法: node ssh-helper.cjs "远程命令"
const { Client } = require('ssh2')

const HOST = '175.27.244.202'
const USER = 'root'
const PASS = 'leiyang*0'
const PORT = 22

const cmd = process.argv[2] || 'echo ok'

const conn = new Client()
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('EXEC_ERR:', err.message); conn.end(); process.exit(2); return }
    let out = ''
    stream.on('close', (code, signal) => {
      process.stdout.write(out)
      conn.end()
      process.exit(code || 0)
    }).on('data', (d) => {
      out += d.toString()
      process.stdout.write(d)
    }).stderr.on('data', (d) => {
      out += d.toString()
      process.stderr.write(d)
    })
  })
}).on('error', (err) => {
  console.error('CONN_ERR:', err.message)
  process.exit(1)
}).connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 20000 })
