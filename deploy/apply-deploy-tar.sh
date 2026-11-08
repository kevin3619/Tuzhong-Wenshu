#!/bin/bash
APP=/www/wwwroot/tuzhong-wenshu
BAK=/root/deploy_bak
PKG=/root/tuzhong-wenshu-deploy.tar.gz
mkdir -p "$BAK"
cd "$APP" || exit 1
if [ -f .env ]; then cp -f .env "$BAK/env.bak"; fi
if [ -f .env.local ]; then cp -f .env.local "$BAK/env.local.bak"; fi

# 解包前清理上一轮反斜杠残留的脏文件（历史 zip 解包产物）
find "$APP" -maxdepth 3 -name '*\\*' -type f -delete 2>/dev/null

tar -xzf "$PKG" -C "$APP" || { echo TAR_FAILED; exit 1; }

cd "$APP" || exit 1
if [ -f "$BAK/env.bak" ]; then cp -f "$BAK/env.bak" .env; fi
if [ -f "$BAK/env.local.bak" ]; then cp -f "$BAK/env.local.bak" .env.local; fi

echo "=== source check ==="
grep -c 'idxBase' "$APP/src/app/(main)/write/[id]/page.tsx" || echo "IDXBASE_MISSING"

chmod +x deploy-to-server.sh
bash deploy-to-server.sh 2>&1 | tee /root/deploy.log
echo DEPLOY_DONE
