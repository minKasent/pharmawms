"""Trigger a forecast run as the pharmacist and print the outcome, model backtest and top suggestions.

Usage: python scripts/run_forecast.py [--base http://localhost:8080/api/v1]
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from smoke_test import Api

POLL_INTERVAL_SECONDS = 3
RUN_TIMEOUT_SECONDS = 900
TOP_SUGGESTIONS = 10


def wait_for_run(api: Api, run_id: int) -> dict:
    deadline = time.monotonic() + RUN_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        _, run = api.call("GET", f"/forecasting/runs/{run_id}", expect=200)
        if run["status"] != "RUNNING":
            return run
        time.sleep(POLL_INTERVAL_SECONDS)
    raise TimeoutError(f"forecast run {run_id} still running after {RUN_TIMEOUT_SECONDS}s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://localhost:8080/api/v1")
    args = parser.parse_args()

    api = Api(args.base)
    api.login("duocsi")
    started = time.monotonic()
    _, run = api.call("POST", "/forecasting/runs", expect=202)
    run = wait_for_run(api, run["id"])
    print(f"Run {run['id']}: {run['status']} in {time.monotonic() - started:.0f}s")
    print(json.dumps(run, ensure_ascii=False, indent=2))

    status, model = api.call("GET", "/forecasting/model")
    print(f"\nModel (HTTP {status}):")
    print(json.dumps(model, ensure_ascii=False, indent=2))

    _, page = api.call("GET", f"/purchase-suggestions?status=OPEN&size={TOP_SUGGESTIONS}", expect=200)
    print(f"\nOpen suggestions: {page.get('totalElements')}")
    for item in page.get("content", []):
        print(json.dumps(item, ensure_ascii=False))
    return 0 if run["status"] == "SUCCEEDED" else 1


if __name__ == "__main__":
    sys.exit(main())
