-- At most one forecast run may be RUNNING at a time.
CREATE UNIQUE INDEX uq_forecast_run_single_running ON forecasting.forecast_run ((true)) WHERE status = 'RUNNING';

-- Level the AI explanation effects are relative to (NULL for fallback runs written before this column).
ALTER TABLE forecasting.forecast_result ADD COLUMN baseline_quantity NUMERIC(18, 2);

ALTER TABLE forecasting.purchase_suggestion ADD COLUMN forecast_quantity NUMERIC(18, 2);
ALTER TABLE forecasting.purchase_suggestion ADD COLUMN horizon_days INT;

CREATE INDEX ix_forecast_run_started ON forecasting.forecast_run (started_at DESC);
