// 完整部署：上传 zip → 备份线上 .env/.env.local → 解压覆盖（排除线上配置）→ 恢复线上配置 → 构建 → PM2 重启 → 验证
// 用法: node _full_deploy.cjs
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = process.env.SSH_HOST || '175.27.244.202'
const USER = process.env.SSH_USER || 'root'
const PASS = process.env.SSH_PASS
if (!PASS) { console.error('SET_SSH_PASS env (from protected source) before running.'); process.exit(2) }
const PORT = 22
const LOCAL = path.join(__dirname, 'deploy', 'tuzhong-wenshu-deploy.zip')
const APP = '/www/wwwroot/tuzhong-wenshu'
const REMOTE_ZIP = APP + '/tuzhong-wenshu-deploy.zip'

if (!fs.existsSync(LOCAL)) { console.error('ZIP_NOT_FOUND', LOCAL); process.exit(2) }
const localBytes = fs.statSync(LOCAL).size
console.log(`ZIP=${LOCAL} bytes=${localBytes}`)

const REMOTE_CMD = `
set -e
cd ${APP} || { echo "NO_APP_DIR"; exit 9; }
echo ">>> preserving online configs..."
[ -f .env ] && cp -f .env /tmp/tw_env || echo "no .env"
[ -f .env.local ] && cp -f .env.local /tmp/tw_env_local || echo "no .env.local"
echo ">>> unzip overwrite (excluding nothing; configs restored next)..."
unzip -o ${REMOTE_ZIP} -d ${APP} 2>&1 | tail -20 || { echo "UNZIP_FAIL"; exit 10; }
echo ">>> restoring online configs..."
if [ -f /tmp/tw_env ]; then cp -f /tmp/tw_env ${APP}/.env; fi
if [ -f /tmp/tw_env_local ]; then cp -f /tmp/tw_env_local ${APP}/.env.local; fi
echo ">>> npm install..."
cd ${APP} && npm install >/dev/null 2>&1 || { echo "NPM_FAIL"; exit 11; }
echo ">>> prisma generate..."
npx prisma generate >/dev/null 2>&1 || { echo "PRISMA_FAIL"; exit 12; }
echo ">>> build (see _deploy.sh)..."
bash _deploy.sh
echo ">>> verify api..."
sleep 1
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/config/public); echo "API_HTTP=$code"
echo ">>> DEPLOY_DONE"
`

const conn = new Client()
conn.on('ready', () => {
  console.log('CONNECTED')
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP_ERR', err.message); process.exit(3) }
    sftp.fastPut(LOCAL, REMOTE_ZIP, (e2) => {
      if (e2) { console.error('UPLOAD_ERR', e2.message); process.exit(4) }
      const rb = fs.statSync(LOCAL).size
      console.log(`UPLOADED ${rb} bytes -> ${REMOTE_ZIP}`)
      // 校验远端字节数
      conn.exec(`wc -c < ${REMOTE_ZIP}`, (e3, stream) => {
        if (e3) { console.error('WC_ERR', e3.message); process.exit(5) }
        let wc = ''
        stream.on('close', (code) => {
          if (code !== 0) { console.error('WC_FAIL'); return }
          const rn = Number(String(wc).trim())
          if (rn === localBytes) {
            console.log(`BYTES_MATCH ${rn}`)
            runRemote(conn)
          } else {
            console.error(`BYTES_MISMATCH local=${localBytes} remote=${rn}`)
            conn.end(); process.exit(6)
          }
        }).on('data', (d) => wc += d.toString())
        stream.stderr.on('data', (d) => process.stderr.write(d))
      })
    })
  })
}).on('error', (e) => { console.error('CONN_ERR', e.message); process.exit(1) })
.connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 20000 })

function runRemote(conn) {
  conn.exec(REMOTE_CMD, (e, stream) => {
    if (e) { console.error('EXEC_ERR', e.message); conn.end(); process.exit(7) }
    let out = ''
    stream.on('close', (code) => {
      console.log('=== REMOTE OUTPUT ===')
      process.stdout.write(out)
      console.log('=== REMOTE EXIT CODE: ' + code + ' ===')
      conn.end()
      const ok = /DEPLOY_DONE/.test(out) && /UNZIP_FAIL|NPM_FAIL|PRISMA_FAIL|BUILD FAILED/.test(out) === false
      process.exit(ok ? 0 : 8)
    }).on('data', (d) => { out += d.toString(); process.stdout.write(d) })
      .stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d) })
  })
}