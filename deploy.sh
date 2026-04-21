#!/bin/bash
set -e

# ============================================================
# JewelBox 一键部署脚本 (Ubuntu 22.04)
# 用法: bash deploy.sh
# 首次部署会安装所有依赖，后续执行会拉取最新代码并重启
# ============================================================

# ---------- 配置区 ----------
DOMAIN="jewelbox.yi-ben.com"
REPO="https://github.com/mankindli/jewelbox.git"
APP_DIR="/opt/jewelbox"
APP_PORT=3004
NODE_VERSION=20
# ----------------------------

echo "========================================="
echo " JewelBox 部署脚本"
echo "========================================="

# 检测是否首次部署
FIRST_RUN=false
if [ ! -d "$APP_DIR" ]; then
  FIRST_RUN=true
fi

# ========== 1. 系统依赖 ==========
if [ "$FIRST_RUN" = true ]; then
  echo "[1/6] 安装系统依赖..."
  apt-get update -qq
  apt-get install -y -qq curl git nginx certbot python3-certbot-nginx

  # Node.js
  if ! command -v node &>/dev/null; then
    echo "  安装 Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
  fi

  # PM2
  if ! command -v pm2 &>/dev/null; then
    echo "  安装 PM2..."
    npm install -g pm2
    pm2 startup systemd -u root --hp /root
  fi
else
  echo "[1/6] 系统依赖已安装，跳过"
fi

# ========== 2. 拉取代码 ==========
echo "[2/6] 拉取代码..."
if [ "$FIRST_RUN" = true ]; then
  git clone "$REPO" "$APP_DIR"
else
  cd "$APP_DIR"
  git pull origin main
fi

# ========== 3. 安装项目依赖 ==========
echo "[3/6] 安装项目依赖..."
cd "$APP_DIR"
npm install --production

# 确保 uploads 目录存在
mkdir -p "$APP_DIR/uploads"

# ========== 4. PM2 启动/重启 ==========
echo "[4/6] 启动应用..."
if pm2 describe jewelbox &>/dev/null; then
  pm2 restart jewelbox
else
  pm2 start server.js --name jewelbox --cwd "$APP_DIR" \
    --env production \
    --max-memory-restart 1G \
    --time
  pm2 save
fi

echo "  等待应用启动..."
sleep 2
if curl -sf http://127.0.0.1:${APP_PORT}/api/auth/me >/dev/null 2>&1 || [ $? -eq 22 ]; then
  echo "  应用启动成功 (端口 ${APP_PORT})"
else
  echo "  警告: 应用可能未正常启动，请检查 pm2 logs jewelbox"
fi

# ========== 5. Nginx 配置 ==========
echo "[5/6] 配置 Nginx..."
NGINX_CONF="/etc/nginx/sites-available/jewelbox"

cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/jewelbox
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

# ========== 6. SSL 证书 ==========
echo "[6/6] 配置 SSL 证书..."
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
  echo "  SSL 证书已签发"
else
  certbot renew --dry-run 2>/dev/null && echo "  SSL 证书已存在，续期正常" || echo "  SSL 证书已存在"
fi

echo ""
echo "========================================="
echo " 部署完成!"
echo " 访问: https://${DOMAIN}"
echo " 默认账号: admin / admin123"
echo " 日志: pm2 logs jewelbox"
echo " 状态: pm2 status"
echo "========================================="