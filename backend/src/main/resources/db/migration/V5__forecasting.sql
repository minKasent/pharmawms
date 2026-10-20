CREATE SCHEMA IF NOT EXISTS forecasting;

-- Per-product service policy. abc_class is recomputed on every forecast run from consumption value.
CREATE TABLE forecasting.replenishment_policy (
    product_id          BIGINT PRIMARY KEY,
    abc_class           VARCHAR(1)   NOT NULL DEFAULT 'C',
    service_level       NUMERIC(5, 4),
    review_period_days  INT,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_policy_abc CHECK (abc_class IN ('A', 'B', 'C')),
    CONSTRAINT ck_policy_service_level CHECK (service_level IS NULL OR (service_level > 0.5 AND service_level < 1))
);

CREATE TABLE forecasting.forecast_run (
    id             BIGSERIAL PRIMARY KEY,
    status         VARCHAR(20)  NOT NULL,
    trigger_type   VARCHAR(20)  NOT NULL,
    as_of_date     DATE         NOT NULL,
    horizon_days   INT          NOT NULL,
    model_version  VARCHAR(50),
    source         VARCHAR(20),
    product_count  INT,
    error_message  VARCHAR(1000),
    started_at     TIMESTAMPTZ  NOT NULL,
    finished_at    TIMESTAMPTZ,
    triggered_by   BIGINT,
    CONSTRAINT ck_forecast_run_status CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_forecast_run_source CHECK (source IS NULL OR source IN ('AI', 'FALLBACK'))
);

CREATE TABLE forecasting.forecast_result (
    id                      BIGSERIAL PRIMARY KEY,
    run_id                  BIGINT         NOT NULL REFERENCES forecasting.forecast_run (id),
    product_id              BIGINT         NOT NULL,
    horizon_days            INT            NOT NULL,
    forecast_quantity       NUMERIC(18, 2) NOT NULL,
    daily_error_std         NUMERIC(18, 4) NOT NULL,
    explanation             TEXT,
    CONSTRAINT uq_forecast_result UNIQUE (run_id, product_id)
);

CREATE INDEX ix_forecast_result_product ON forecasting.forecast_result (product_id, run_id DESC);

CREATE TABLE forecasting.purchase_suggestion (
    id                     BIGSERIAL PRIMARY KEY,
    run_id                 BIGINT         NOT NULL REFERENCES forecasting.forecast_run (id),
    product_id             BIGINT         NOT NULL,
    supplier_id            BIGINT,
    status                 VARCHAR(20)    NOT NULL,
    abc_class              VARCHAR(1)     NOT NULL,
    service_level          NUMERIC(5, 4)  NOT NULL,
    daily_demand           NUMERIC(18, 4) NOT NULL,
    daily_error_std        NUMERIC(18, 4) NOT NULL,
    lead_time_days         NUMERIC(8, 2)  NOT NULL,
    lead_time_std_days     NUMERIC(8, 2)  NOT NULL,
    review_period_days     INT            NOT NULL,
    safety_stock           BIGINT         NOT NULL,
    reorder_point          BIGINT         NOT NULL,
    order_up_to_level      BIGINT         NOT NULL,
    usable_on_hand         BIGINT         NOT NULL,
    at_risk_quantity       BIGINT         NOT NULL,
    on_order               BIGINT         NOT NULL,
    inventory_position     BIGINT         NOT NULL,
    days_of_cover          NUMERIC(10, 2),
    suggested_quantity     BIGINT         NOT NULL,
    capped_by_shelf_life   BOOLEAN        NOT NULL DEFAULT FALSE,
    purchase_order_id      BIGINT,
    created_at             TIMESTAMPTZ    NOT NULL,
    CONSTRAINT ck_suggestion_status CHECK (status IN ('OPEN', 'ORDERED', 'DISMISSED', 'SUPERSEDED'))
);

CREATE INDEX ix_suggestion_status ON forecasting.purchase_suggestion (status);
CREATE INDEX ix_suggestion_product ON forecasting.purchase_suggestion (product_id);
