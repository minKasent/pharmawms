"""Vietnamese calendar effects that matter for pharmacy demand."""

from __future__ import annotations

from datetime import date

import numpy as np

# First day of the Lunar New Year (Tết Nguyên Đán). Pharmacies stock up before Tết and demand
# drops during the holiday week.
TET_DATES: tuple[date, ...] = (
    date(2021, 2, 12),
    date(2022, 2, 1),
    date(2023, 1, 22),
    date(2024, 2, 10),
    date(2025, 1, 29),
    date(2026, 2, 17),
    date(2027, 2, 6),
    date(2028, 1, 26),
    date(2029, 2, 13),
    date(2030, 2, 3),
    date(2031, 1, 23),
    date(2032, 2, 11),
)

TET_DISTANCE_CLIP_DAYS = 60
TET_HOLIDAY_LENGTH_DAYS = 7

_TET_ORDINALS = np.array([d.toordinal() for d in TET_DATES], dtype=np.int64)


def signed_days_to_nearest_tet(ordinals: np.ndarray) -> np.ndarray:
    """Days from each date to the closest Tết (negative = before Tết), clipped to ±60."""
    differences = ordinals[:, None] - _TET_ORDINALS[None, :]
    nearest = differences[np.arange(len(ordinals)), np.abs(differences).argmin(axis=1)]
    return np.clip(nearest, -TET_DISTANCE_CLIP_DAYS, TET_DISTANCE_CLIP_DAYS)


def tet_days_in_window(start_ordinals: np.ndarray, length: int) -> np.ndarray:
    """Number of Tết holiday days falling inside [start, start + length)."""
    holiday_days = (_TET_ORDINALS[:, None] + np.arange(TET_HOLIDAY_LENGTH_DAYS)[None, :]).ravel()
    window = start_ordinals[:, None] + np.arange(length)[None, :]
    return np.isin(window, holiday_days).sum(axis=1)
