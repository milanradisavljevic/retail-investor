#!/usr/bin/env python3
"""
Run SEC EDGAR bulk ingestion for key US universes in sequence.

Default universes:
  - nasdaq100
  - sp500-full
  - russell2000_full
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


DEFAULT_UNIVERSES = ["nasdaq100", "sp500-full", "russell2000_full"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run SEC bulk sync for US universes")
    parser.add_argument(
        "--companyfacts-dir",
        default=os.environ.get("SEC_COMPANYFACTS_DIR", "data/sec/companyfacts"),
        help="Directory with SEC companyfacts JSON files",
    )
    parser.add_argument(
        "--company-tickers",
        default=os.environ.get("SEC_COMPANY_TICKERS_PATH", "data/sec/company_tickers.json"),
        help="Path to SEC company_tickers.json",
    )
    parser.add_argument(
        "--db-path",
        default=os.environ.get("SEC_SYNC_DB_PATH", "data/privatinvestor.db"),
        help="SQLite database path for fundamentals_snapshot writes",
    )
    parser.add_argument(
        "--universes",
        nargs="+",
        default=DEFAULT_UNIVERSES,
        help="Universe IDs (config/universes/<id>.json)",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Continue with remaining universes if one fails",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(__file__).resolve().parents[2]
    script = root / "scripts" / "etl" / "sec_edgar_bulk_audit.py"
    companyfacts_dir = Path(args.companyfacts_dir)
    company_tickers = Path(args.company_tickers)

    if not companyfacts_dir.exists():
        print(f"[sec-sync] Missing companyfacts dir: {companyfacts_dir}", file=sys.stderr)
        return 2
    if not company_tickers.exists():
        print(f"[sec-sync] Missing company tickers file: {company_tickers}", file=sys.stderr)
        return 2
    if not script.exists():
        print(f"[sec-sync] Missing script: {script}", file=sys.stderr)
        return 2

    failures = 0
    print(f"[sec-sync] Starting SEC sync for universes: {', '.join(args.universes)}")

    for universe in args.universes:
        cmd = [
            sys.executable,
            str(script),
            "--companyfacts-dir",
            str(companyfacts_dir),
            "--company-tickers",
            str(company_tickers),
            "--universe",
            universe,
            "--db-path",
            args.db_path,
            "--write-db",
        ]
        print(f"[sec-sync] -> {universe}")
        proc = subprocess.run(cmd, cwd=root, text=True, capture_output=True)
        if proc.returncode == 0:
            print(f"[sec-sync] OK: {universe}")
            tail = "\n".join(proc.stdout.strip().splitlines()[-8:])
            if tail:
                print(tail)
            continue

        failures += 1
        print(f"[sec-sync] FAILED: {universe} (exit={proc.returncode})", file=sys.stderr)
        stderr_tail = "\n".join(proc.stderr.strip().splitlines()[-12:])
        stdout_tail = "\n".join(proc.stdout.strip().splitlines()[-8:])
        if stderr_tail:
            print(stderr_tail, file=sys.stderr)
        elif stdout_tail:
            print(stdout_tail, file=sys.stderr)

        if not args.continue_on_error:
            break

    if failures:
        print(f"[sec-sync] Completed with {failures} failure(s).", file=sys.stderr)
        return 1

    print("[sec-sync] Completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
