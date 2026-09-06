// 临时单文件上传助手（2026-09-03 重建，#112 清理曾删除原版）
// 用法: node _upload_route.cjs <本地绝对路径> <远程绝对路径>
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = '175.27.244.202'
const USER = 'root'
const PASS = 'leiyang*0'
const PORT = 22

const localFile = process.argv[2]
const remoteFile = process.argv[3]
if (!localFile || !remoteFile) { console.error('usage: node _upload_route.cjs <local> <remote>'); process.exit(2) }

const localB64 = path.join(path.dirname(localFile), '_up_payload.b64')
fs.writeFileSync(localB64, fs.readFileSync(localFile).toString('base64'))
const localBytes = fs.statSync(localFile).size
const payloadBytes = fs.statSync(localB64).size
console.log(`local=${localFile} bytes=${localBytes} b64=${payloadBytes}`)

const conn = new Client()
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP_ERR:', err.message); process.exit(3) }
    sftp.fastPut(localB64, '/tmp/_up_payload.b64', (err2) => {
      if (err2) { console.error('PUT_ERR:', err2.message); process.exit(4) }
      const cmd =
        `cd /www/wwwroot/tuzhong-wenshu && cp -f ${remoteFile} ${remoteFile}.bak_20260903 && ` +
        `base64 -d /tmp/_up_payload.b64 > ${remoteFile} && ` +
        `echo REMOTE_BYTES=$(wc -c < ${remoteFile}) && rm -f /tmp/_up_payload.b64`
      conn.exec(cmd, (e3, stream) => {
        if (e3) { console.error('EXEC_ERR:', e3.message); process.exit(5) }
        let out = ''
        stream.on('close', (code) => {
          process.stdout.write(out)
          conn.end()
          const m = out.match(/REMOTE_BYTES=(\d+)/)
          if (code === 0 && m && Number(m[1]) === localBytes) {
            console.log(`UPLOAD_OK bytes_match=${m[1]}`)
            process.exit(0)
          } else {
            console.error(`UPLOAD_FAIL code=${code} expected=${localBytes}`)
            process.exit(6)
          }
        }).on('data', (d) => { out += d.toString(); process.stdout.write(d) })
          .stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d) })
      })
    })
  })
}).on('error', (err) => {
  console.error('CONN_ERR:', err.message)
  process.exit(1)
}).connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 20000 })
