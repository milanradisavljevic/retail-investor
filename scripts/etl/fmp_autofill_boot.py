#!/usr/bin/env python3
"""
FMP boot autofill runner.

Runs prioritized US universes with --until-full and stops cleanly when
the daily FMP budget is exhausted.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FMP_LOAD_SCRIPT = ROOT / "scripts" / "etl" / "fmp_load.py"
UNIVERSE_PRIORITY: tuple[str, ...] = ("nasdaq100", "sp500", "russell2000")


def emit(event: str, **payload: Any) -> None:
    line = {"event": event, **payload}
    print(json.dumps(line, sort_keys=True, default=str), flush=True)


def run_universe(universe: str) -> tuple[int, dict[str, Any] | None, list[dict[str, Any]]]:
    cmd = [
        sys.executable,
        str(FMP_LOAD_SCRIPT),
        "--universe",
        universe,
        "--until-full",
    ]
    emit("fmp_autofill.universe_start", universe=universe, cmd=" ".join(cmd))

    proc = subprocess.Popen(
        cmd,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    latest_summary: dict[str, Any] | None = None
    errors: list[dict[str, Any]] = []

    assert proc.stdout is not None
    for line in proc.stdout:
        clean = line.rstrip("\n")
        print(clean, flush=True)
        try:
            parsed = json.loads(clean)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue

        event_name = parsed.get("event")
        if event_name == "fmp_load.summary":
            latest_summary = parsed
        elif event_name == "fmp_load.error":
            errors.append(parsed)

    return proc.wait(), latest_summary, errors


def _is_daily_budget_error(errors: list[dict[str, Any]]) -> bool:
    for err in errors:
        msg = str(err.get("error", "")).lower()
        if "daily call budget exhausted" in msg:
            return True
    return False


def main() -> int:
    emit(
        "fmp_autofill.start",
        root=str(ROOT),
        universes=list(UNIVERSE_PRIORITY),
    )

    results: list[dict[str, Any]] = []
    stop_reason = "completed_all_universes"

    for universe in UNIVERSE_PRIORITY:
        exit_code, summary, errors = run_universe(universe)
        daily_remaining = None
        calls_used = None
        loaded = None
        failed = None

        if summary is not None:
            daily_remaining = summary.get("daily_calls_remaining")
            calls_used = summary.get("api_calls_total")
            loaded = summary.get("loaded")
            failed = summary.get("failed")

        result = {
            "universe": universe,
            "exit_code": exit_code,
            "loaded": loaded,
            "failed": failed,
            "api_calls_total": calls_used,
            "daily_calls_remaining": daily_remaining,
        }
        results.append(result)
        emit("fmp_autofill.universe_done", **result)

        if summary is not None and daily_remaining is not None and int(daily_remaining) <= 0:
            stop_reason = "daily_budget_exhausted"
            break

        if _is_daily_budget_error(errors):
            stop_reason = "daily_budget_exhausted"
            break

        if exit_code not in (0, 2):
            stop_reason = f"unexpected_exit_{universe}_{exit_code}"
            break

    emit("fmp_autofill.summary", stop_reason=stop_reason, results=results)
    if stop_reason.startswith("unexpected_exit_"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
