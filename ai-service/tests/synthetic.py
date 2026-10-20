"""Seeded demand generator for tests.

Mixes what makes pharmacy demand hard: weekly pattern, yearly season whose strength changes
from year to year, per-product trend, occasional level shifts, a Tết dip, and slow movers.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.calendar_vn import TET_DATES

SLOW_MOVER_SHARE = 0.25
LEVEL_SHIFT_SHARE = 0.3
DAYS_PER_YEAR = 365.25


def _tet_effect(dates: pd.DatetimeIndex) -> np.ndarray:
    effect = np.zeros(len(dates))
    for tet_day in TET_DATES:
        offsets = (dates - pd.Timestamp(tet_day)).days.to_numpy()
        effect += np.where((offsets >= 0) & (offsets < 7), -0.7, 0) + np.where((offsets >= -14) & (offsets < 0), 0.3, 0)
    return effect


def synthetic_history(product_count: int = 12, days: int = 760, end: date = date(2026, 9, 30),
                      seed: int = 7) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    start = end - timedelta(days=days - 1)
    dates = pd.date_range(start, end, freq="D")
    t_years = np.arange(days) / DAYS_PER_YEAR
    day_of_year = dates.dayofyear.to_numpy()
    weekly = np.where(dates.weekday.to_numpy() == 6, 0.3, 1.0)
    tet = _tet_effect(dates)
    year_index = dates.year.to_numpy() - dates.year.min()

    rows: list[tuple[int, date, float]] = []
    categories: list[tuple[int, str]] = []
    for product in range(1, product_count + 1):
        is_slow = rng.random() < SLOW_MOVER_SHARE
        base = rng.uniform(0.2, 1.5) if is_slow else rng.uniform(3, 40)
        amplitude = rng.uniform(0.1, 0.7)
        yearly_strength = rng.uniform(0.5, 1.5, size=year_index.max() + 1)[year_index]
        phase = rng.uniform(0, 2 * np.pi)
        trend = (1 + rng.uniform(-0.25, 0.5)) ** t_years
        level = np.ones(days)
        if rng.random() < LEVEL_SHIFT_SHARE:
            level[rng.integers(days // 3, days):] = rng.uniform(0.6, 1.6)
        season = 1 + amplitude * yearly_strength * np.sin(2 * np.pi * day_of_year / DAYS_PER_YEAR + phase)
        mean = base * trend * level * season * weekly * (1 + tet)
        demand = rng.poisson(np.clip(mean, 0.01, None))
        rows.extend((product, day, float(q)) for day, q in zip(dates.date, demand, strict=True) if q > 0)
        categories.append((product, "RESP" if product % 2 else "GI"))
    history = pd.DataFrame(rows, columns=["product_id", "day", "quantity"])
    products = pd.DataFrame(categories, columns=["product_id", "category"])
    return history, products
