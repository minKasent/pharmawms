from __future__ import annotations

import sys
from datetime import UTC, date, datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR / "scripts" / "datagen"))

from app.calendar_vn import TET_DATES as AI_TET_DATES
from app.config import Settings
from app.registry import ModelRegistry
from app.schemas import JobStatus, TrainingJob
from app.service import MAX_JOBS, ForecastingService
from seed import TET_DATES as SEED_TET_DATES, Simulation, interpolated_strength


def test_tet_dates_match_and_cover_2021_to_2032():
    assert SEED_TET_DATES == AI_TET_DATES
    assert [d.year for d in SEED_TET_DATES] == list(range(2021, 2033))


def test_seasonal_strength_interpolates_smoothly_across_year_boundary():
    strengths = {2025: 0.6, 2026: 1.4, 2027: 0.8}
    dec_31 = interpolated_strength(date(2025, 12, 31), strengths)
    jan_01 = interpolated_strength(date(2026, 1, 1), strengths)
    assert abs(jan_01 - dec_31) < 0.01


def test_seed_simulation_updates_purchase_order_line_received_quantity_and_verifies():
    users = {"thukho": 3, "muahang": 4, "duocsi": 2}
    sim = Simulation(seed=2026, days=180, today=date(2026, 10, 12), users=users)
    sim.run()  # calls verify() internally

    pol_cols = sim.t.columns["purchasing.purchase_order_line"]
    rec_col = pol_cols.index("received_quantity")
    total_pol_received = sum(row[rec_col] for row in sim.t.rows["purchasing.purchase_order_line"])
    assert total_pol_received > 0


def test_service_evicts_old_jobs_above_max_jobs(tmp_path):
    settings = Settings(api_key="test-internal-key", model_dir=tmp_path)
    svc = ForecastingService(settings, ModelRegistry(tmp_path))
    try:
        for i in range(MAX_JOBS + 15):
            svc._store(
                TrainingJob(
                    job_id=f"job-{i}",
                    status=JobStatus.SUCCEEDED,
                    submitted_at=datetime.now(UTC),
                )
            )
        assert len(svc._jobs) == MAX_JOBS
        assert svc.job("job-0") is None
        assert svc.job(f"job-{MAX_JOBS + 14}") is not None
    finally:
        svc.shutdown()
