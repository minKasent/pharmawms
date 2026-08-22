CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE catalog.category (
    id   BIGSERIAL PRIMARY KEY,
    code VARCHAR(30)  NOT NULL,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT uq_category_code UNIQUE (code)
);

CREATE TABLE catalog.product (
    id                             BIGSERIAL PRIMARY KEY,
    sku                            VARCHAR(30)   NOT NULL,
    name                           VARCHAR(200)  NOT NULL,
    active_ingredient              VARCHAR(200)  NOT NULL,
    strength                       VARCHAR(100),
    dosage_form                    VARCHAR(50),
    registration_number            VARCHAR(50),
    manufacturer                   VARCHAR(200),
    atc_code                       VARCHAR(10),
    category_id                    BIGINT        NOT NULL REFERENCES catalog.category (id),
    storage_condition              VARCHAR(20)   NOT NULL,
    prescription_required          BOOLEAN       NOT NULL DEFAULT FALSE,
    base_unit                      VARCHAR(20)   NOT NULL,
    min_shelf_life_on_receipt_days INT           NOT NULL DEFAULT 180,
    reference_unit_cost            NUMERIC(18, 2) NOT NULL DEFAULT 0,
    active                         BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at                     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version                        BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT uq_product_sku UNIQUE (sku),
    CONSTRAINT ck_product_storage CHECK (storage_condition IN ('NORMAL', 'COOL', 'COLD')),
    CONSTRAINT ck_product_shelf_life CHECK (min_shelf_life_on_receipt_days >= 0)
);

CREATE INDEX ix_product_category ON catalog.product (category_id);
CREATE INDEX ix_product_name_lower ON catalog.product (lower(name));

-- Packaging hierarchy, e.g. Viên (1) - Vỉ (10) - Hộp (100) - Thùng (2400). Stock is always kept in the base unit.
CREATE TABLE catalog.product_unit (
    id             BIGSERIAL PRIMARY KEY,
    product_id     BIGINT      NOT NULL REFERENCES catalog.product (id) ON DELETE CASCADE,
    unit_name      VARCHAR(20) NOT NULL,
    factor_to_base INT         NOT NULL,
    gtin           VARCHAR(14),
    CONSTRAINT uq_product_unit UNIQUE (product_id, unit_name),
    CONSTRAINT ck_product_unit_factor CHECK (factor_to_base >= 1)
);
