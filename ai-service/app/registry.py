"""File-system model registry: ``<dir>/<version>/{model.txt,metadata.json}`` plus ``current.txt``."""

from __future__ import annotations

import json
import os
import shutil
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import lightgbm as lgb

from app.model import TrainedModel

MODEL_FILE = "model.txt"
METADATA_FILE = "metadata.json"
CURRENT_POINTER = "current.txt"


@dataclass(frozen=True)
class LoadedModel:
    version: str
    booster: lgb.Booster
    metadata: dict[str, object]

    @property
    def horizon(self) -> int:
        return int(self.metadata["horizon_days"])

    @property
    def residual_std_by_product(self) -> dict[int, float]:
        raw = self.metadata.get("residual_std_by_product", {})
        return {int(key): float(value) for key, value in raw.items()}

    @property
    def global_relative_rmse(self) -> float:
        return float(self.metadata["global_relative_rmse"])

    @property
    def category_vocabulary(self) -> tuple[str, ...]:
        return tuple(self.metadata.get("category_vocabulary", ()))


def _sanitize_json(value: object) -> object:
    if isinstance(value, dict):
        return {k: _sanitize_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_json(v) for v in value]
    if isinstance(value, float) and (value != value or value == float("inf") or value == float("-inf")):
        return None
    return value


class ModelRegistry:
    def __init__(self, directory: Path, seed_directory: Path | None = None) -> None:
        self._directory = directory
        self._directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._current: LoadedModel | None = None
        self._pointer_mtime_ns: int | None = None
        if seed_directory is not None:
            self._bootstrap_from_seed(seed_directory)

    def _bootstrap_from_seed(self, seed_directory: Path) -> None:
        pointer = self._directory / CURRENT_POINTER
        seed_pointer = seed_directory / CURRENT_POINTER
        if pointer.exists() or not seed_pointer.exists():
            return
        version = seed_pointer.read_text(encoding="utf-8").strip()
        if not version:
            return
        seed_folder = seed_directory / version
        if not seed_folder.is_dir():
            return
        target_folder = self._directory / version
        if not target_folder.exists():
            shutil.copytree(seed_folder, target_folder)
        pointer_tmp = self._directory / f"{CURRENT_POINTER}.tmp"
        pointer_tmp.write_text(version, encoding="utf-8")
        os.replace(pointer_tmp, pointer)

    def save(self, trained: TrainedModel, extra: dict[str, object]) -> str:
        base_version = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        version = base_version
        counter = 1
        while (self._directory / version).exists():
            version = f"{base_version}_{counter}"
            counter += 1
        target = self._directory / version
        target.mkdir(parents=True, exist_ok=True)
        trained.booster.save_model(str(target / MODEL_FILE))
        metadata = _sanitize_json({
            "version": version,
            "trained_at": datetime.now(UTC).isoformat(),
            "horizon_days": trained.horizon,
            "as_of_date": trained.as_of.isoformat(),
            "training_rows": trained.training_rows,
            "product_count": trained.product_count,
            "backtest": trained.backtest,
            "feature_importance": trained.feature_importance,
            "residual_std_by_product": {str(k): v for k, v in trained.residual_std_by_product.items()},
            "global_relative_rmse": trained.global_relative_rmse,
            "category_vocabulary": list(trained.category_vocabulary),
            **extra,
        })
        assert isinstance(metadata, dict)
        (target / METADATA_FILE).write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8"
        )
        pointer = self._directory / CURRENT_POINTER
        pointer_tmp = self._directory / f"{CURRENT_POINTER}.tmp"
        pointer_tmp.write_text(version, encoding="utf-8")
        os.replace(pointer_tmp, pointer)  # atomic switch
        with self._lock:
            self._current = LoadedModel(version, trained.booster, metadata)
            self._pointer_mtime_ns = pointer.stat().st_mtime_ns
        return version

    def current(self) -> LoadedModel | None:
        with self._lock:
            pointer = self._directory / CURRENT_POINTER
            if not pointer.exists():
                self._current = None
                self._pointer_mtime_ns = None
                return None
            stat_mtime = pointer.stat().st_mtime_ns
            version = pointer.read_text(encoding="utf-8").strip()
            if not version:
                self._current = None
                self._pointer_mtime_ns = None
                return None
            if (
                self._current is not None
                and self._current.version == version
                and self._pointer_mtime_ns == stat_mtime
            ):
                return self._current
            folder = self._directory / version
            model_path = folder / MODEL_FILE
            meta_path = folder / METADATA_FILE
            if not model_path.is_file() or not meta_path.is_file():
                self._current = None
                self._pointer_mtime_ns = None
                return None
            booster = lgb.Booster(model_file=str(model_path))
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self._current = LoadedModel(version, booster, metadata)
            self._pointer_mtime_ns = stat_mtime
            return self._current
