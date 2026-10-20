#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# PharmaWMS — Automated Production PostgreSQL Backup & Restore Utility
# Usage:
#   sudo ./infra/backup-db.sh                        # Create & verify compressed backup
#   sudo ./infra/backup-db.sh --install-cron         # Schedule daily 02:00 AM backup
#   sudo ./infra/backup-db.sh --restore <dump-file>  # Restore from backup archive
# ==============================================================================

CONTAINER="${PG_CONTAINER:-pharmawms-postgres-1}"
DB_NAME="${PG_DB:-pharmawms}"
DB_USER="${PG_USER:-pharmawms}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pharmawms}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

if [[ "${1:-}" == "--install-cron" ]]; then
  CRON_FILE="/etc/cron.d/pharmawms-db-backup"
  cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 2 * * * root $SCRIPT_PATH >> /var/log/pharmawms-backup.log 2>&1
EOF
  chmod 644 "$CRON_FILE"
  echo "✅ Đã cài đặt lịch sao lưu tự động lúc 02:00 sáng hàng ngày tại $CRON_FILE"
  exit 0
fi

if [[ "${1:-}" == "--restore" ]]; then
  DUMP_FILE="${2:-}"
  if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
    echo "❌ Vui lòng chỉ định file backup hợp lệ: sudo $0 --restore /var/backups/pharmawms/file.dump"
    exit 1
  fi
  echo "⏳ Đang khôi phục cơ sở dữ liệu $DB_NAME từ $DUMP_FILE..."
  docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$DUMP_FILE"
  echo "✅ Khôi phục cơ sở dữ liệu hoàn tất!"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TIMESTAMP="$(TZ=Asia/Ho_Chi_Minh date +'%Y%m%d_%H%M%S')"
OUT_FILE="$BACKUP_DIR/pharmawms_${TIMESTAMP}.dump"

echo "📦 [1/3] Đang trích xuất bản sao lưu nén (pg_dump -Fc) từ container $CONTAINER..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -Z 6 > "$OUT_FILE"
chmod 600 "$OUT_FILE"

echo "🔍 [2/3] Kiểm tra tính toàn vẹn của danh mục bảng trong bản sao lưu..."
TABLE_COUNT="$(docker exec -i "$CONTAINER" pg_restore -l < "$OUT_FILE" | grep -c 'TABLE DATA' || true)"
FILE_SIZE="$(du -h "$OUT_FILE" | cut -f1)"
if [[ "$TABLE_COUNT" -lt 10 ]]; then
  echo "❌ Bản sao lưu không hợp lệ (chỉ tìm thấy $TABLE_COUNT bảng dữ liệu)."
  rm -f "$OUT_FILE"
  exit 1
fi
echo "✅ Bản sao lưu hợp lệ: $OUT_FILE ($FILE_SIZE · $TABLE_COUNT bảng dữ liệu)."

echo "🧹 [3/3] Dọn dẹp các bản sao lưu cũ hơn $RETENTION_DAYS ngày..."
find "$BACKUP_DIR" -maxdepth 1 -name 'pharmawms_*.dump' -type f -mtime +"$RETENTION_DAYS" -delete
echo "🎉 Sao lưu cơ sở dữ liệu PharmaWMS hoàn tất!"
