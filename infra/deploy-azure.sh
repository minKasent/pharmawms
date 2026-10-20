#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# PharmaWMS — One-Command Azure Ubuntu Production Deployment Script
# Usage:
#   chmod +x infra/deploy-azure.sh
#   sudo DOMAIN=khoa-pharmawms.id.vn ./infra/deploy-azure.sh
# ==============================================================================

DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "❌ Vui lòng truyền tên miền của bạn, ví dụ:"
  echo "   sudo DOMAIN=pharmawms.tenmien.com ./infra/deploy-azure.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 [1/5] Kiểm tra và tạo Swap 2GB (tránh tràn RAM khi build Docker trên VM 4GB)..."
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "✅ Đã kích hoạt 2GB Swap."
else
  echo "✅ Swap đã tồn tại."
fi

echo "🐳 [2/5] Kiểm tra Docker & Docker Compose..."
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg python3
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

echo "🔐 [3/5] Khởi tạo file cấu hình infra/.env cho tên miền: $DOMAIN..."
ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASS="$(openssl rand -hex 16)"
  AI_KEY="$(openssl rand -hex 24)"
  cat > "$ENV_FILE" <<EOF
DOMAIN=$DOMAIN
COOKIE_SECURE=true
DB_PASSWORD=$DB_PASS
AI_API_KEY=$AI_KEY
DEMO_ENABLED=true
DEMO_PASSWORD=${DEMO_PASSWORD:-Demo@123}
EOF
  chmod 600 "$ENV_FILE"
  echo "✅ Đã tạo $ENV_FILE với mật khẩu DB và AI_API_KEY ngẫu nhiên."
else
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE" || echo "DOMAIN=$DOMAIN" >> "$ENV_FILE"
  echo "✅ Đã cập nhật DOMAIN=$DOMAIN trong $ENV_FILE."
fi

echo "🏗️ [4/5] Build và khởi chạy toàn bộ cụm Docker (Postgres, Redis, AI, Backend, Frontend, Caddy HTTPS)..."
docker compose --env-file "$ENV_FILE" -f "$SCRIPT_DIR/docker-compose.prod.yml" up -d --build

echo "⏳ Đang chờ Backend khởi tất Flyway migrations (V1..V7) và đạt trạng thái HEALTHY..."
for i in {1..60}; do
  STATUS="$(docker inspect --format='{{.State.Health.Status}}' pharmawms-backend-1 2>/dev/null || echo 'starting')"
  if [[ "$STATUS" == "healthy" ]]; then
    echo "✅ Backend đã HEALTHY!"
    break
  fi
  sleep 3
done

echo "🌱 [5/5] Kiểm tra và nạp dữ liệu mẫu 730 ngày (56 thuốc, 6 NCC, dự báo AI)..."
PRODUCT_COUNT="$(docker exec pharmawms-postgres-1 psql -U pharmawms -d pharmawms -tAc 'SELECT count(*) FROM catalog.product;' 2>/dev/null || echo '0')"
if [[ "${PRODUCT_COUNT// /}" == "0" ]]; then
  echo "📦 Kho dữ liệu đang trống -> tiến hành nạp dữ liệu mô phỏng 730 ngày..."
  python3 "$PROJECT_ROOT/scripts/datagen/seed.py" --container pharmawms-postgres-1 --redis-container pharmawms-redis-1
  echo "🤖 Kích hoạt chạy dự báo AI và sinh đề xuất đặt hàng lần đầu..."
  python3 "$PROJECT_ROOT/scripts/run_forecast.py" --base http://127.0.0.1:8080/api/v1 || true
  echo "✅ Đã nạp xong toàn bộ dữ liệu mẫu và dự báo AI!"
else
  echo "✅ Cơ sở dữ liệu đã có sẵn $PRODUCT_COUNT mặt hàng thuốc (bỏ qua bước seed)."
fi

echo ""
echo "=============================================================================="
echo "🎉 TRIỂN KHAI PHARMAWMS LÊN AZURE THÀNH CÔNG!"
echo "🌐 Giao diện Web (HTTPS tự động): https://$DOMAIN"
echo "📘 Swagger API Docs:              https://$DOMAIN/swagger-ui.html"
echo "🔑 Tài khoản Demo:                admin / duocsi / thukho / muahang (Mật khẩu: ${DEMO_PASSWORD:-Demo@123})"
echo "=============================================================================="
