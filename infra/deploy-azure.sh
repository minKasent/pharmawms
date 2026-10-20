#!/usr/bin/env bash
set -euo pipefail

# Script trien khai PharmaWMS len may chu Ubuntu (Azure VM)
# Cach chay:
#   chmod +x infra/deploy-azure.sh
#   sudo DOMAIN=minkas.tech ./infra/deploy-azure.sh

DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "[ERR] Vui long truyen ten mien, vi du:"
  echo "  sudo DOMAIN=minkas.tech ./infra/deploy-azure.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "[1/5] Kiem tra va tao Swap 2GB..."
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "[OK] Da kich hoat 2GB Swap."
else
  echo "[OK] Swap da ton tai."
fi

echo "[2/5] Kiem tra Docker & Docker Compose..."
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

echo "[3/5] Khoi tao file cau hinh infra/.env cho ten mien: $DOMAIN..."
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
  echo "[OK] Da tao $ENV_FILE."
else
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE" || echo "DOMAIN=$DOMAIN" >> "$ENV_FILE"
  echo "[OK] Da cap nhat DOMAIN=$DOMAIN trong $ENV_FILE."
fi

echo "[4/5] Build va khoi chay cum Docker (Postgres, Redis, AI, Backend, Frontend, Caddy)..."
docker compose --env-file "$ENV_FILE" -f "$SCRIPT_DIR/docker-compose.prod.yml" up -d --build

echo "Dang cho Backend khoi dong va chay Flyway migrations..."
for i in {1..60}; do
  STATUS="$(docker inspect --format='{{.State.Health.Status}}' pharmawms-backend-1 2>/dev/null || echo 'starting')"
  if [[ "$STATUS" == "healthy" ]]; then
    echo "[OK] Backend da san sang."
    break
  fi
  sleep 3
done

echo "[5/5] Kiem tra du lieu mau..."
PRODUCT_COUNT="$(docker exec pharmawms-postgres-1 psql -U pharmawms -d pharmawms -tAc 'SELECT count(*) FROM catalog.product;' 2>/dev/null || echo '0')"
if [[ "${PRODUCT_COUNT// /}" == "0" ]]; then
  echo "Nap du lieu mo phong 730 ngay..."
  python3 "$PROJECT_ROOT/scripts/datagen/seed.py" --container pharmawms-postgres-1 --redis-container pharmawms-redis-1
  python3 "$PROJECT_ROOT/scripts/run_forecast.py" --base http://127.0.0.1:8080/api/v1 || true
  echo "[OK] Da nap xong du lieu mau va du bao AI."
else
  echo "[OK] Database da co san $PRODUCT_COUNT thuoc."
fi

echo ""
echo "Trien khai thanh cong:"
echo "  Web App:     https://$DOMAIN"
echo "  Swagger UI:  https://$DOMAIN/swagger-ui/index.html"
echo "  Tai khoan:   admin / duocsi / thukho / muahang (Mat khau: ${DEMO_PASSWORD:-Demo@123})"
