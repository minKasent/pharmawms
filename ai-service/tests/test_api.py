import time

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from tests.synthetic import synthetic_history

API_KEY = "test-internal-key"
HORIZON = 28
POLL_INTERVAL_SECONDS = 0.5
TRAINING_TIMEOUT_SECONDS = 120


@pytest.fixture(scope="module")
def client(tmp_path_factory, monkeypatch_module):
    monkeypatch_module.setenv("AI_API_KEY", API_KEY)
    monkeypatch_module.setenv("AI_MODEL_DIR", str(tmp_path_factory.mktemp("models")))
    get_settings.cache_clear()
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture(scope="module")
def monkeypatch_module():
    with pytest.MonkeyPatch.context() as patch:
        yield patch


@pytest.fixture(scope="module")
def dataset():
    history, products = synthetic_history(product_count=6)
    as_of = max(history["day"])
    return {
        "asOfDate": as_of.isoformat(),
        "horizonDays": HORIZON,
        "products": [{"productId": int(r.product_id), "category": r.category} for r in products.itertuples()],
        "history": [{"productId": int(r.product_id), "day": r.day.isoformat(), "quantity": r.quantity}
                    for r in history.itertuples()],
    }


def headers():
    return {"X-Internal-Api-Key": API_KEY}


def test_health_is_public(client):
    assert client.get("/health").json() == {"status": "UP"}


def test_api_key_is_required(client, dataset):
    assert client.post("/v1/forecasts:batch", json=dataset).status_code == 401
    assert client.post("/v1/forecasts:batch", json=dataset, headers={"X-Internal-Api-Key": "wrong"}).status_code == 401


def test_forecast_before_training_is_conflict(client, dataset):
    response = client.post("/v1/forecasts:batch", json=dataset, headers=headers())
    assert response.status_code == 409
    assert response.json()["code"] == "MODEL_NOT_TRAINED"


def test_future_history_is_rejected(client, dataset):
    bad = {**dataset, "asOfDate": "2020-01-01"}
    assert client.post("/v1/forecasts:batch", json=bad, headers=headers()).status_code == 422


def test_train_then_forecast(client, dataset):
    job = client.post("/v1/models:train", json=dataset, headers=headers())
    assert job.status_code == 202
    job_id = job.json()["jobId"]

    deadline = time.monotonic() + TRAINING_TIMEOUT_SECONDS
    status = job.json()["status"]
    while status in ("QUEUED", "RUNNING") and time.monotonic() < deadline:
        time.sleep(POLL_INTERVAL_SECONDS)
        status = client.get(f"/v1/models/jobs/{job_id}", headers=headers()).json()["status"]
    assert status == "SUCCEEDED"

    info = client.get("/v1/models/current", headers=headers()).json()
    assert info["horizonDays"] == HORIZON
    assert "wape" in info["backtest"]["overall"]["model"]

    response = client.post("/v1/forecasts:batch", json=dataset, headers=headers())
    assert response.status_code == 200
    body = response.json()
    assert body["modelVersion"] == info["modelVersion"]
    assert len(body["forecasts"]) == 6
    first = body["forecasts"][0]
    assert first["quantity"] >= 0 and first["dailyErrorStd"] > 0
    assert first["explanation"][0]["effectPercent"] is not None

    mismatch = {**dataset, "horizonDays": 14}
    assert client.post("/v1/forecasts:batch", json=mismatch, headers=headers()).status_code == 422
