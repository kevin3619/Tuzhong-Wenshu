#!/bin/bash
cd /www/wwwroot/tuzhong-wenshu || exit 9
echo ">>> Stopping PM2..."
pm2 stop tuzhong-wenshu 2>&1 | tail -2
echo ">>> Building..."
rm -rf .next
npx next build > /root/tuzhong-wenshu/_build.log 2>&1
BUILD_RC=$?
echo ">>> Build exit code: $BUILD_RC"
tail -12 /root/tuzhong-wenshu/_build.log
if [ "$BUILD_RC" -ne 0 ]; then
  echo ">>> BUILD FAILED - app left stopped."
  exit 1
fi
echo ">>> Restarting PM2..."
pm2 restart tuzhong-wenshu 2>&1 | tail -2
sleep 3
pm2 list | grep tuzhong-wenshu
echo ">>> Done."
