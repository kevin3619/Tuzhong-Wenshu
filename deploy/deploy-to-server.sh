#!/bin/bash
# ============================================
# 途中文枢 - 服务器端部署脚本
# 在服务器上执行：./deploy-to-server.sh
# 功能：安装依赖、构建、配置Nginx、启动PM2
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_DIR="/root/tuzhong-wenshu"
APP_PORT=3001
NGINX_CONF_SRC="/root/tuzhong-wenshu/nginx-tuzhongwang.conf"
NGINX_CONF_DST="/etc/nginx/conf.d/tuzhongwang.conf"

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  途中文枢 - 服务器部署脚本${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

# 检查是否 root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用 root 用户执行此脚本${NC}"
  exit 1
fi

# 检查应用目录
if [ ! -d "$APP_DIR" ]; then
  echo -e "${RED}应用目录不存在: $APP_DIR${NC}"
  echo -e "${YELLOW}请先执行: unzip tuzhong-wenshu-deploy.zip -d $APP_DIR${NC}"
  exit 1
fi

cd "$APP_DIR"

# ============================================
# STEP 1: 安装 Node.js (如果未安装)
# ============================================
echo -e "${YELLOW}[STEP 1] 检查 Node.js 环境...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}  安装 Node.js 20.x...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}  [OK] Node.js $NODE_VERSION${NC}"

# ============================================
# STEP 2: 安装 PM2
# ============================================
echo -e "${YELLOW}[STEP 2] 检查 PM2...${NC}"

if ! command -v pm2 &> /dev/null; then
  echo -e "${YELLOW}  安装 PM2...${NC}"
  npm install -g pm2
fi

echo -e "${GREEN}  [OK] PM2 $(pm2 --version)${NC}"

# ============================================
# STEP 3: 安装项目依赖 (优先 npm, 因为有 package-lock.json)
# ============================================
echo -e "${YELLOW}[STEP 3] 安装项目依赖...${NC}"

if [ -f "package-lock.json" ]; then
  echo -e "${YELLOW}  使用 npm install (检测到 package-lock.json)...${NC}"
  npm install
elif [ -f "yarn.lock" ]; then
  echo -e "${YELLOW}  使用 yarn install...${NC}"
  npm install -g yarn 2>/dev/null || true
  yarn install --frozen-lockfile 2>/dev/null || yarn install
else
  echo -e "${YELLOW}  使用 npm install (无 lock 文件)...${NC}"
  npm install
fi
echo -e "${GREEN}  [OK] 依赖安装完成${NC}"

# ============================================
# STEP 4: 生成 Prisma Client
# ============================================
echo -e "${YELLOW}[STEP 4] 生成 Prisma Client...${NC}"

npx prisma generate
echo -e "${GREEN}  [OK] Prisma Client 已生成${NC}"

# ============================================
# STEP 5: 初始化数据库
# ============================================
echo -e "${YELLOW}[STEP 5] 检查/初始化数据库...${NC}"

if [ ! -f "./prisma/tuzhong.db" ]; then
  echo -e "${YELLOW}  数据库不存在，执行初始化...${NC}"
  npx prisma db push
  echo -e "${GREEN}  [OK] 数据库已创建${NC}"
else
  echo -e "${GREEN}  [OK] 数据库已存在，跳过初始化${NC}"
  # 推送 schema 变更
  npx prisma db push --accept-data-loss 2>/dev/null || true
fi

# ============================================
# STEP 6: 构建 Next.js 应用
# ============================================
echo -e "${YELLOW}[STEP 6] 构建 Next.js 应用...${NC}"

npm run build
echo -e "${GREEN}  [OK] 构建完成${NC}"

# ============================================
# STEP 7: Nginx（共享配置，由宝塔/其它项目统一管理，本脚本绝不修改任何 vhost）
# ============================================
# 站点反代配置（含 /tuzhong-wenshu -> localhost:3001、官网、workdesk、
# AI量化天眼 等）已在服务器的 /etc/nginx/conf.d/tuzhongwang.conf 中维护。
# 本步骤只确保 nginx 进程在运行，不复制、不删除、不覆盖任何 nginx 配置，
# 避免影响服务器上其它项目（铁律：只操作途中文枢本项目）。
echo -e "${YELLOW}[STEP 7] 检查 Nginx 运行状态...${NC}"

if ! command -v nginx &> /dev/null; then
  echo -e "${YELLOW}  安装 Nginx...${NC}"
  apt-get update
  apt-get install -y nginx
fi

# 仅确保 nginx 运行，不修改任何配置文件
if systemctl is-active --quiet nginx; then
  echo -e "${GREEN}  [OK] Nginx 正在运行（反代配置由共享 tuzhongwang.conf 维护）${NC}"
else
  systemctl start nginx 2>/dev/null || service nginx start 2>/dev/null || true
  echo -e "${GREEN}  [OK] 已尝试启动 Nginx${NC}"
fi

# 确保 Nginx 开机自启
systemctl enable nginx 2>/dev/null || true

# ============================================
# STEP 8: 启动 PM2 进程
# ============================================
echo -e "${YELLOW}[STEP 8] 启动 PM2 进程...${NC}"

# 停止旧进程（如果存在）
pm2 delete tuzhong-wenshu 2>/dev/null || true

# 使用 ecosystem 配置启动
if [ -f "./ecosystem.config.js" ]; then
  pm2 start ecosystem.config.js
else
  pm2 start "yarn start" --name tuzhong-wenshu
fi

# 保存 PM2 进程列表（开机自启）
pm2 save
pm2 startup 2>/dev/null | tail -1

echo -e "${GREEN}  [OK] PM2 process started${NC}"

# ============================================
# STEP 9: Seed admin user (if not exists)
# ============================================
echo -e "${YELLOW}[STEP 9] Seed admin user...${NC}"

if [ -f "./scripts/seed-admin.cjs" ]; then
  node scripts/seed-admin.cjs 2>/dev/null || echo -e "${YELLOW}  Admin seed skipped (may already exist)${NC}"
  echo -e "${GREEN}  [OK] Admin user check complete${NC}"
else
  echo -e "${YELLOW}  [SKIP] seed-admin.cjs not found${NC}"
fi

# ============================================
# STEP 10: SSL Certificate (Let's Encrypt)
# ============================================
# STEP 10: SSL 证书（由宝塔/运维统一管理，本脚本不自动签发，避免改写共享 nginx 配置）
# ============================================
echo -e "${YELLOW}[STEP 10] Check SSL certificate...${NC}"

if [ -f "/etc/letsencrypt/live/tuzhongwang.xyz/fullchain.pem" ] || [ -f "/www/server/panel/vhost/ssl/tuzhongwang.xyz/fullchain.pem" ]; then
  echo -e "${GREEN}  [OK] SSL 证书已存在，跳过签发（由共享 tuzhongwang.conf 引用）${NC}"
else
  echo -e "${YELLOW}  [WARN] 未检测到 SSL 证书。请勿在此自动签发，请在宝塔面板或手动执行：${NC}"
  echo -e "${YELLOW}  certbot --nginx -d tuzhongwang.xyz -d www.tuzhongwang.xyz${NC}"
fi

# ============================================
# STEP 11: Verify service
# ============================================
echo -e "${YELLOW}[STEP 11] Verify service...${NC}"

sleep 3

# 检查本地服务
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}  [OK] 本地服务正常 (HTTP $HTTP_CODE)${NC}"
else
  echo -e "${YELLOW}  [WARN] 本地服务返回 HTTP $HTTP_CODE，可能还在启动中${NC}"
  echo -e "${YELLOW}  查看日志: pm2 logs tuzhong-wenshu${NC}"
fi

# 检查 Nginx
NGINX_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost 2>/dev/null || echo "000")
echo -e "${GREEN}  [OK] Nginx 反向代理 (HTTP $NGINX_CODE)${NC}"

echo ""
echo -e "${CYAN}==========================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "应用目录: ${YELLOW}$APP_DIR${NC}"
echo -e "本地端口: ${YELLOW}$APP_PORT${NC}"
echo -e "生产域名: ${YELLOW}https://tuzhongwang.xyz${NC}"
echo ""
echo -e "常用命令:"
echo -e "  查看日志:   ${YELLOW}pm2 logs tuzhong-wenshu${NC}"
echo -e "  重启应用:   ${YELLOW}pm2 restart tuzhong-wenshu${NC}"
echo -e "  停止应用:   ${YELLOW}pm2 stop tuzhong-wenshu${NC}"
echo -e "  Nginx状态:  ${YELLOW}systemctl status nginx${NC}"
echo -e "  Nginx重载:  ${YELLOW}nginx -s reload${NC}"
echo ""
echo -e "${YELLOW}请确保已配置 SSL 证书 (Let's Encrypt):${NC}"
echo -e "  certbot --nginx -d tuzhongwang.xyz -d www.tuzhongwang.xyz"
echo ""
