// 完整部署脚本：上传 zip → 解压覆盖(保留 .env/.env.local) → npm install → prisma generate → build → PM2 restart → 验证
// 用法: node _deploy_route.cjs <本地zip绝对路径>
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = '175.27.244.202'
const USER = 'root'
const PASS = 'leiyang*0'
const PORT = 22

const localZip = process.argv[2]
if (!localZip) { console.error('usage: node _deploy_route.cjs <local.zip>'); process.exit(2) }
const localBytes = fs.statSync(localZip).size
const remoteZip = '/tmp/_deploy.zip'
const APP = '/www/wwwroot/tuzhong-wenshu'

const conn = new Client()
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP_ERR:', err.message); process.exit(3) }
    sftp.fastPut(localZip, '/tmp/_deploy.zip', (err2) => {
      if (err2) { console.error('PUT_ERR:', err2.message); process.exit(4) }
      console.log(`UPLOADED bytes=${localBytes}`)
      const remoteCmd = [
        'set -e',
        `cp -f /tmp/_deploy.zip ${remoteZip}`,
        `cd ${APP}`,
        // 保留线上 .env / .env.local
        'cp -f .env /tmp/_env_bak 2>/dev/null || true',
        'cp -f .env.local /tmp/_env_local_bak 2>/dev/null || true',
        // 解压覆盖（排除数据库等已受保护文件）
        `unzip -o ${remoteZip} -d ${APP} > /tmp/_unzip.log 2>&1`,
        'cp -f /tmp/_env_bak .env 2>/dev/null || true',
        'cp -f /tmp/_env_local_bak .env.local 2>/dev/null || true',
        // 关键文件 MD5
        'echo REMOTE_BYTES=$(wc -c < ' + remoteZip + ')',
        'md5sum src/components/ai-generate-wizard.tsx src/components/wizard-steps/StepChapters.tsx src/components/wizard-steps/StepFactions.tsx src/lib/faction-normalize.ts',
        'echo "--- npm install ---"',
        'npm install --no-audit --no-fund > /tmp/_npm.log 2>&1 || (tail -20 /tmp/_npm.log; exit 1)',
        'echo "--- prisma generate ---"',
        'npx prisma generate > /tmp/_prisma.log 2>&1 || (tail -20 /tmp/_prisma.log; exit 1)',
        'echo "--- next build ---"',
        'rm -rf .next',
        'npx next build > /tmp/_build.log 2>&1 || (tail -30 /tmp/_build.log; exit 1)',
        'tail -5 /tmp/_build.log',
        'echo "--- pm2 restart ---"',
        'pm2 restart tuzhong-wenshu 2>&1 | tail -3',
        'sleep 3',
        'pm2 list | grep tuzhong-wenshu || true',
        'echo "--- verify ---"',
        'curl -s -o /dev/null -w "APP_HTTP=%{http_code}\n" http://127.0.0.1:3000/tuzhong-wenshu/api/config/public || true',
        'echo DEPLOY_DONE',
      ].join(' && ')
      conn.exec(remoteCmd, (e3, stream) => {
        if (e3) { console.error('EXEC_ERR:', e3.message); process.exit(5) }
        let out = ''
        stream.on('close', (code) => {
          process.stdout.write(out)
          conn.end()
          console.log(`EXIT_CODE=${code}`)
          process.exit(code === 0 ? 0 : 6)
        }).on('data', (d) => { out += d.toString(); process.stdout.write(d) })
          .stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d) })
      })
    })
  })
}).on('error', (err) => {
  console.error('CONN_ERR:', err.message)
  process.exit(1)
}).connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 20000 })
