CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE inventory.warehouse (
    id      BIGSERIAL PRIMARY KEY,
    code    VARCHAR(20)  NOT NULL,
    name    VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    CONSTRAINT uq_warehouse_code UNIQUE (code)
);

CREATE TABLE inventory.zone (
    id                BIGSERIAL PRIMARY KEY,
    warehouse_id      BIGINT       NOT NULL REFERENCES inventory.warehouse (id),
    code              VARCHAR(20)  NOT NULL,
    name              VARCHAR(100) NOT NULL,
    storage_condition VARCHAR(20)  NOT NULL,
    CONSTRAINT uq_zone_code UNIQUE (warehouse_id, code),
    CONSTRAINT ck_zone_storage CHECK (storage_condition IN ('NORMAL', 'COOL', 'COLD'))
);

CREATE TABLE inventory.location (
    id      BIGSERIAL PRIMARY KEY,
    zone_id BIGINT      NOT NULL REFERENCES inventory.zone (id),
    code    VARCHAR(30) NOT NULL,
    active  BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_location_code UNIQUE (zone_id, code)
);

-- product_id / supplier_id reference other modules; no cross-schema foreign keys so modules stay separable.
CREATE TABLE inventory.batch (
    id               BIGSERIAL PRIMARY KEY,
    product_id       BIGINT         NOT NULL,
    lot_number       VARCHAR(50)    NOT NULL,
    manufacture_date DATE,
    expiry_date      DATE           NOT NULL,
    supplier_id      BIGINT,
    status           VARCHAR(20)    NOT NULL,
    unit_cost        NUMERIC(18, 4) NOT NULL,
    received_at      TIMESTAMPTZ    NOT NULL,
    hold_reason      VARCHAR(255),
    version          BIGINT         NOT NULL DEFAULT 0,
    CONSTRAINT uq_batch_product_lot UNIQUE (product_id, lot_number),
    CONSTRAINT ck_batch_dates CHECK (manufacture_date IS NULL OR manufacture_date < expiry_date),
    CONSTRAINT ck_batch_status CHECK (status IN ('QUARANTINE', 'AVAILABLE', 'ON_HOLD', 'EXPIRED', 'DISPOSED'))
);

CREATE INDEX ix_batch_fefo ON inventory.batch (product_id, expiry_date) WHERE status = 'AVAILABLE';
CREATE INDEX ix_batch_expiry ON inventory.batch (expiry_date);

-- Quantities are in the product's base unit.
CREATE TABLE inventory.stock_balance (
    id          BIGSERIAL PRIMARY KEY,
    batch_id    BIGINT NOT NULL REFERENCES inventory.batch (id),
    location_id BIGINT NOT NULL REFERENCES inventory.location (id),
    on_hand     BIGINT NOT NULL DEFAULT 0,
    reserved    BIGINT NOT NULL DEFAULT 0,
    version     BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_stock_balance UNIQUE (batch_id, location_id),
    CONSTRAINT ck_stock_balance_non_negative CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)
);

-- Append-only ledger. SUM(quantity) per (batch, location) must always equal stock_balance.on_hand.
CREATE TABLE inventory.stock_movement (
    id             BIGSERIAL PRIMARY KEY,
    batch_id       BIGINT      NOT NULL REFERENCES inventory.batch (id),
    location_id    BIGINT      NOT NULL REFERENCES inventory.location (id),
    product_id     BIGINT      NOT NULL,
    movement_type  VARCHAR(20) NOT NULL,
    quantity       BIGINT      NOT NULL,
    reference_type VARCHAR(30) NOT NULL,
    reference_id   BIGINT      NOT NULL,
    performed_by   BIGINT      NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_movement_type CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'DISPOSAL')),
    CONSTRAINT ck_movement_quantity CHECK (quantity <> 0)
);

CREATE INDEX ix_movement_product_time ON inventory.stock_movement (product_id, occurred_at);
CREATE INDEX ix_movement_batch_location ON inventory.stock_movement (batch_id, location_id);
CREATE INDEX ix_movement_issue_time ON inventory.stock_movement (occurred_at) WHERE movement_type = 'ISSUE';

CREATE SEQUENCE inventory.goods_receipt_code_seq;
CREATE SEQUENCE inventory.goods_issue_code_seq;
CREATE SEQUENCE inventory.stock_take_code_seq;
CREATE SEQUENCE inventory.disposal_code_seq;

CREATE TABLE inventory.goods_receipt (
    id                BIGSERIAL PRIMARY KEY,
    code              VARCHAR(30)  NOT NULL,
    supplier_id       BIGINT,
    purchase_order_id BIGINT,
    idempotency_key   VARCHAR(64),
    note              VARCHAR(500),
    received_by       BIGINT       NOT NULL,
    received_at       TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_goods_receipt_code UNIQUE (code),
    CONSTRAINT uq_goods_receipt_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX ix_goods_receipt_po ON inventory.goods_receipt (purchase_order_id);

CREATE TABLE inventory.goods_receipt_line (
    id          BIGSERIAL PRIMARY KEY,
    receipt_id  BIGINT         NOT NULL REFERENCES inventory.goods_receipt (id),
    product_id  BIGINT         NOT NULL,
    batch_id    BIGINT         NOT NULL REFERENCES inventory.batch (id),
    location_id BIGINT         NOT NULL REFERENCES inventory.location (id),
    quantity    BIGINT         NOT NULL,
    unit_cost   NUMERIC(18, 4) NOT NULL,
    CONSTRAINT ck_receipt_line_quantity CHECK (quantity > 0)
);

CREATE INDEX ix_receipt_line_receipt ON inventory.goods_receipt_line (receipt_id);

CREATE TABLE inventory.goods_issue (
    id                            BIGSERIAL PRIMARY KEY,
    code                          VARCHAR(30)  NOT NULL,
    destination                   VARCHAR(200) NOT NULL,
    min_remaining_shelf_life_days INT          NOT NULL,
    idempotency_key               VARCHAR(64),
    note                          VARCHAR(500),
    issued_by                     BIGINT       NOT NULL,
    issued_at                     TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_goods_issue_code UNIQUE (code),
    CONSTRAINT uq_goods_issue_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX ix_goods_issue_time ON inventory.goods_issue (issued_at);

CREATE TABLE inventory.goods_issue_line (
    id         BIGSERIAL PRIMARY KEY,
    issue_id   BIGINT NOT NULL REFERENCES inventory.goods_issue (id),
    product_id BIGINT NOT NULL,
    quantity   BIGINT NOT NULL,
    CONSTRAINT ck_issue_line_quantity CHECK (quantity > 0)
);

CREATE INDEX ix_issue_line_issue ON inventory.goods_issue_line (issue_id);

CREATE TABLE inventory.issue_allocation (
    id            BIGSERIAL PRIMARY KEY,
    issue_line_id BIGINT NOT NULL REFERENCES inventory.goods_issue_line (id),
    batch_id      BIGINT NOT NULL REFERENCES inventory.batch (id),
    location_id   BIGINT NOT NULL REFERENCES inventory.location (id),
    quantity      BIGINT NOT NULL,
    CONSTRAINT ck_allocation_quantity CHECK (quantity > 0)
);

CREATE INDEX ix_allocation_line ON inventory.issue_allocation (issue_line_id);

CREATE TABLE inventory.stock_take (
    id           BIGSERIAL PRIMARY KEY,
    code         VARCHAR(30) NOT NULL,
    zone_id      BIGINT      NOT NULL REFERENCES inventory.zone (id),
    status       VARCHAR(20) NOT NULL,
    created_by   BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    approved_by  BIGINT,
    approved_at  TIMESTAMPTZ,
    version      BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT uq_stock_take_code UNIQUE (code),
    CONSTRAINT ck_stock_take_status CHECK (status IN ('COUNTING', 'SUBMITTED', 'APPROVED', 'CANCELLED'))
);

CREATE TABLE inventory.stock_take_line (
    id               BIGSERIAL PRIMARY KEY,
    stock_take_id    BIGINT NOT NULL REFERENCES inventory.stock_take (id),
    batch_id         BIGINT NOT NULL REFERENCES inventory.batch (id),
    location_id      BIGINT NOT NULL REFERENCES inventory.location (id),
    product_id       BIGINT NOT NULL,
    system_quantity  BIGINT NOT NULL,
    counted_quantity BIGINT,
    CONSTRAINT uq_stock_take_line UNIQUE (stock_take_id, batch_id, location_id),
    CONSTRAINT ck_stock_take_counted CHECK (counted_quantity IS NULL OR counted_quantity >= 0)
);

CREATE TABLE inventory.disposal (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL,
    reason      VARCHAR(255) NOT NULL,
    disposed_by BIGINT       NOT NULL,
    disposed_at TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_disposal_code UNIQUE (code)
);

CREATE TABLE inventory.disposal_line (
    id          BIGSERIAL PRIMARY KEY,
    disposal_id BIGINT NOT NULL REFERENCES inventory.disposal (id),
    batch_id    BIGINT NOT NULL REFERENCES inventory.batch (id),
    location_id BIGINT NOT NULL REFERENCES inventory.location (id),
    quantity    BIGINT NOT NULL,
    CONSTRAINT ck_disposal_line_quantity CHECK (quantity > 0)
);
