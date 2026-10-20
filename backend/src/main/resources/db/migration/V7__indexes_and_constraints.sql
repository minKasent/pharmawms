CREATE INDEX IF NOT EXISTS ix_disposal_line_disposal ON inventory.disposal_line (disposal_id);
CREATE INDEX IF NOT EXISTS ix_refresh_token_user ON iam.refresh_token (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_take_open_zone ON inventory.stock_take (zone_id) WHERE status IN ('COUNTING', 'SUBMITTED');
CREATE INDEX IF NOT EXISTS ix_movement_occurred_at ON inventory.stock_movement (occurred_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_username_lower ON iam.app_user (lower(username));
