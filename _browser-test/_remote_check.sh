#!/bin/bash
echo "=== PM2 describe ==="
pm2 describe tuzhong-wenshu 2>/dev/null | grep -iE 'script path|cwd|exec cwd|status|restarts|uptime' | head -20
echo "=== process cwd ==="
PID=$(pm2 pid tuzhong-wenshu 2>/dev/null)
echo "PID=$PID"
readlink /proc/$PID/cwd 2>/dev/null
echo "=== root app BUILD_ID ==="
cat /root/tuzhong-wenshu/.next/BUILD_ID 2>/dev/null; echo
echo "=== www app BUILD_ID ==="
cat /www/wwwroot/tuzhong-wenshu/.next/BUILD_ID 2>/dev/null; echo
echo "=== www src ai-generate-wizard basis-full ==="
grep -c 'basis-full' /www/wwwroot/tuzhong-wenshu/src/components/ai-generate-wizard.tsx 2>/dev/null
echo "=== www compiled wizard basis-full ==="
grep -rl 'basis-full' /www/wwwroot/tuzhong-wenshu/.next/static/chunks/ 2>/dev/null | head -2
echo "=== root compiled wizard basis-full ==="
grep -rl 'basis-full' /root/tuzhong-wenshu/.next/static/chunks/ 2>/dev/null | head -2
echo "=== which dirs exist ==="
ls -d /www/wwwroot/tuzhong-wenshu /root/tuzhong-wenshu 2>/dev/null
echo "=== lsof port 3001 ==="
ss -ltnp 2>/dev/null | grep ':3001' | head -3
echo DONE