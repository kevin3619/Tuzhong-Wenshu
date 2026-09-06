const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')
const HOST = '175.27.244.202', USER = 'root', PORT = 22
const KEY = path.join(process.env.USERPROFILE, '.ssh', 'minimind_ed25519')
const CMD = [
  'echo ===CWD_OF_3001===',
  'ls -l /proc/1183726/cwd 2>/dev/null',
  'echo ===READLINK_3001_CWD===',
  'readlink -f /proc/1183726/cwd 2>/dev/null',
  'echo ===BUILD_DIR_WHERE===',
  'find / -maxdepth 6 -type d -name ".next" -path "*tuzhong-wenshu*" 2>/dev/null | head -10',
  'echo ===ANGINX_CONFIG_FILES===',
  'grep -rln "tuzhong-wenshu" /etc/nginx/ 2>/dev/null | head -10',
  'echo ===DONE===',
].join('\n')
const conn = new Client()
conn.on('ready', () => {
  conn.exec(CMD, (e, stream) => {
    if (e) { console.error('ERR', e.message); process.exit(1) }
    let out = ''
    stream.on('data', d => { out += d.toString() })
    stream.on('close', () => { process.stdout.write(out); conn.end(); process.exit(0) })
  })
}).on('error', e => { console.error('CONN_ERR', e.message); process.exit(1) })
.connect({ host: HOST, port: PORT, username: USER, privateKey: fs.readFileSync(KEY), readyTimeout: 20000 })