CREATE SCHEMA IF NOT EXISTS purchasing;

CREATE TABLE purchasing.supplier (
    id                     BIGSERIAL PRIMARY KEY,
    code                   VARCHAR(20)  NOT NULL,
    name                   VARCHAR(200) NOT NULL,
    phone                  VARCHAR(30),
    email                  VARCHAR(100),
    address                VARCHAR(255),
    default_lead_time_days INT          NOT NULL DEFAULT 5,
    active                 BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_supplier_code UNIQUE (code),
    CONSTRAINT ck_supplier_lead_time CHECK (default_lead_time_days > 0)
);

-- Commercial terms for buying a product from a supplier. Quantities are in the product's base unit.
CREATE TABLE purchasing.supplier_product (
    id                 BIGSERIAL PRIMARY KEY,
    supplier_id        BIGINT         NOT NULL REFERENCES purchasing.supplier (id),
    product_id         BIGINT         NOT NULL,
    pack_size          BIGINT         NOT NULL,
    min_order_quantity BIGINT         NOT NULL,
    unit_price         NUMERIC(18, 4) NOT NULL,
    preferred          BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_supplier_product UNIQUE (supplier_id, product_id),
    CONSTRAINT ck_supplier_product_pack CHECK (pack_size >= 1 AND min_order_quantity >= 0)
);

CREATE UNIQUE INDEX uq_supplier_product_preferred ON purchasing.supplier_product (product_id) WHERE preferred;

CREATE SEQUENCE purchasing.purchase_order_code_seq;

CREATE TABLE purchasing.purchase_order (
    id                BIGSERIAL PRIMARY KEY,
    code              VARCHAR(30)  NOT NULL,
    supplier_id       BIGINT       NOT NULL REFERENCES purchasing.supplier (id),
    status            VARCHAR(30)  NOT NULL,
    source            VARCHAR(20)  NOT NULL,
    note              VARCHAR(500),
    created_by        BIGINT       NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL,
    submitted_at      TIMESTAMPTZ,
    approved_by       BIGINT,
    approved_at       TIMESTAMPTZ,
    rejection_reason  VARCHAR(500),
    sent_at           TIMESTAMPTZ,
    first_received_at TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    version           BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_purchase_order_code UNIQUE (code),
    CONSTRAINT ck_purchase_order_status CHECK (status IN
        ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT ck_purchase_order_source CHECK (source IN ('MANUAL', 'SUGGESTION'))
);

CREATE INDEX ix_purchase_order_status ON purchasing.purchase_order (status);
CREATE INDEX ix_purchase_order_supplier ON purchasing.purchase_order (supplier_id);

CREATE TABLE purchasing.purchase_order_line (
    id                BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT         NOT NULL REFERENCES purchasing.purchase_order (id),
    product_id        BIGINT         NOT NULL,
    quantity          BIGINT         NOT NULL,
    received_quantity BIGINT         NOT NULL DEFAULT 0,
    unit_price        NUMERIC(18, 4) NOT NULL,
    suggestion_id     BIGINT,
    CONSTRAINT uq_purchase_order_line UNIQUE (purchase_order_id, product_id),
    CONSTRAINT ck_po_line_quantity CHECK (quantity > 0 AND received_quantity >= 0)
);

CREATE TABLE purchasing.purchase_order_event (
    id                BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT      NOT NULL REFERENCES purchasing.purchase_order (id),
    from_status       VARCHAR(30),
    to_status         VARCHAR(30) NOT NULL,
    performed_by      BIGINT      NOT NULL,
    occurred_at       TIMESTAMPTZ NOT NULL,
    note              VARCHAR(500)
);

CREATE INDEX ix_po_event_order ON purchasing.purchase_order_event (purchase_order_id);
