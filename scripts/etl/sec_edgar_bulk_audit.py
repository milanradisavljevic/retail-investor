#!/usr/bin/env python3
"""
SEC EDGAR bulk CompanyFacts audit (offline, local files only).

This script reads local SEC CompanyFacts JSON files (CIK##########.json),
extracts key fundamentals, computes derived metrics, prints coverage, writes an
audit report JSON, and can optionally upsert payloads into SQLite.
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    from scripts.etl.sec_edgar_poc import (
        RawAccountingData,
        XBRL_CONCEPTS,
        _find_facts,
        _get_annual_value,
        _get_instant_value,
        _get_annual_value_with_prior,
        _get_instant_value_with_prior,
        build_fundamentals_payload,
        calculate_derived_metrics,
    )
except ModuleNotFoundError:
    from sec_edgar_poc import (  # type: ignore
        RawAccountingData,
        XBRL_CONCEPTS,
        _find_facts,
        _get_annual_value,
        _get_instant_value,
        _get_annual_value_with_prior,
        _get_instant_value_with_prior,
        build_fundamentals_payload,
        calculate_derived_metrics,
    )

log = logging.getLogger("sec_edgar_bulk_audit")

RAW_FIELDS = {
    "net_income": "NetIncome",
    "total_assets": "TotalAssets",
    "stockholders_equity": "StockholdersEquity",
    "total_debt": "TotalDebt",
    "revenue": "Revenue",
    "gross_profit": "GrossProfit",
    "operating_cash_flow": "OperatingCashFlow",
    "capex": "CapEx",
    "current_assets": "CurrentAssets",
    "current_liabilities": "CurrentLiabilities",
    "shares_outstanding": "SharesOutstanding",
}

# Prior year fields mapping (same concepts, _py suffix)
RAW_FIELDS_PY = {
    "net_income_py": "NetIncome",
    "total_assets_py": "TotalAssets",
    "stockholders_equity_py": "StockholdersEquity",
    "total_debt_py": "TotalDebt",
    "revenue_py": "Revenue",
    "gross_profit_py": "GrossProfit",
    "operating_cash_flow_py": "OperatingCashFlow",
    "current_assets_py": "CurrentAssets",
    "current_liabilities_py": "CurrentLiabilities",
    "shares_outstanding_py": "SharesOutstanding",
}

DURATION_FIELDS = {
    "net_income",
    "revenue",
    "gross_profit",
    "operating_cash_flow",
    "capex",
}

DURATION_FIELDS_PY = {
    "net_income_py",
    "revenue_py",
    "gross_profit_py",
    "operating_cash_flow_py",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit local SEC CompanyFacts bulk files"
    )
    parser.add_argument(
        "--companyfacts-dir",
        required=True,
        help="Directory with CIK##########.json files",
    )
    parser.add_argument(
        "--company-tickers", required=True, help="Path to SEC company_tickers.json"
    )
    parser.add_argument(
        "--universe", help="Universe name from config/universes/<name>.json"
    )
    parser.add_argument(
        "--tickers", nargs="+", help="Explicit ticker subset (space-separated)"
    )
    parser.add_argument("--limit", type=int, help="Limit number of tickers processed")
    parser.add_argument(
        "--db-path", default="data/privatinvestor.db", help="SQLite path"
    )
    parser.add_argument(
        "--write-db", action="store_true", help="Write payloads to SQLite"
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logs")
    return parser.parse_args()


def _normalize_cik(cik_value: Any) -> Optional[str]:
    if cik_value is None:
        return None
    digits = "".join(ch for ch in str(cik_value) if ch.isdigit())
    if not digits:
        return None
    return digits.zfill(10)


def format_cik_file_name(cik10: str) -> str:
    return f"CIK{cik10}.json"


def load_ticker_to_cik(company_tickers_path: Path) -> dict[str, str]:
    data = json.loads(company_tickers_path.read_text(encoding="utf-8"))
    mapping: dict[str, str] = {}

    entries: list[dict[str, Any]] = []
    if isinstance(data, dict):
        entries = [v for v in data.values() if isinstance(v, dict)]
    elif isinstance(data, list):
        entries = [v for v in data if isinstance(v, dict)]

    for entry in entries:
        ticker = str(entry.get("ticker", "")).strip().upper()
        cik10 = _normalize_cik(entry.get("cik_str") or entry.get("cik"))
        if ticker and cik10:
            mapping[ticker] = cik10

    return mapping


def load_universe_tickers(universe_name: str) -> list[str]:
    rel = universe_name if universe_name.endswith(".json") else f"{universe_name}.json"
    universe_path = Path("config/universes") / rel
    if not universe_path.exists():
        raise FileNotFoundError(f"Universe file not found: {universe_path}")

    data = json.loads(universe_path.read_text(encoding="utf-8"))
    symbols = data.get("symbols", [])
    if not isinstance(symbols, list):
        raise ValueError(f"Universe symbols must be list in {universe_path}")
    return [str(s).upper() for s in symbols if str(s).strip()]


def resolve_target_tickers(args: argparse.Namespace) -> list[str]:
    if args.tickers:
        tickers = [t.upper() for t in args.tickers]
    elif args.universe:
        tickers = load_universe_tickers(args.universe)
    else:
        raise ValueError("Provide either --tickers or --universe")

    if args.limit is not None:
        tickers = tickers[: max(args.limit, 0)]

    return tickers


def extract_from_companyfacts(
    symbol: str, cik10: str, company_facts: dict[str, Any]
) -> tuple[RawAccountingData, dict[str, Any]]:
    raw = RawAccountingData(symbol=symbol, cik=cik10, method="bulk_json")
    notes = raw.extraction_notes
    notes.append(f"Entity: {company_facts.get('entityName', '?')}")

    # Extract current year values
    for attr_name, concept_key in RAW_FIELDS.items():
        aliases = XBRL_CONCEPTS[concept_key]
        facts = _find_facts(company_facts, aliases)

        if attr_name in DURATION_FIELDS:
            value, method = _get_annual_value(facts, allow_ttm=True)
        else:
            value, method = _get_instant_value(facts)

        setattr(raw, attr_name, value)
        notes.append(
            f"{concept_key}: {method}"
            + (f" = {value:,.0f}" if value is not None else "")
        )

        if value is not None and raw.fiscal_year is None:
            for fact in facts:
                end_date = fact.get("end")
                if end_date:
                    raw.fiscal_year = end_date
                    break

    # Extract prior year values for Piotroski
    for attr_name, concept_key in RAW_FIELDS_PY.items():
        aliases = XBRL_CONCEPTS[concept_key]
        facts = _find_facts(company_facts, aliases)

        if attr_name in DURATION_FIELDS_PY:
            value, method = (
                _get_annual_value_with_prior(facts, allow_ttm=False)[2],
                _get_annual_value_with_prior(facts, allow_ttm=False)[3],
            )
        else:
            value, method = (
                _get_instant_value_with_prior(facts)[2],
                _get_instant_value_with_prior(facts)[3],
            )

        setattr(raw, attr_name, value)
        if value is not None:
            notes.append(f"{attr_name}: {method} = {value:,.0f}")
            if raw.fiscal_year_py is None:
                raw.fiscal_year_py = (
                    method.split("ending")[-1].strip() if "ending" in method else None
                )

    derived = calculate_derived_metrics(raw, market_cap=None)
    payload = build_fundamentals_payload(
        raw, derived, market_cap=None, current_price=None
    )
    payload["_source"] = "sec_edgar_bulk"
    payload["_method"] = "bulk_json"

    # Add fiscal years to payload
    if raw.fiscal_year:
        payload["fiscalYearCurrent"] = raw.fiscal_year
    if raw.fiscal_year_py:
        payload["fiscalYearPrior"] = raw.fiscal_year_py

    # Add prior year fields to payload under secEdgar
    sec_edgar_data = {}
    for attr_name in RAW_FIELDS_PY.keys():
        value = getattr(raw, attr_name, None)
        if value is not None:
            sec_edgar_data[attr_name] = value

    if sec_edgar_data:
        payload["secEdgar"] = sec_edgar_data

    return raw, payload


def detect_target_table(conn: sqlite3.Connection) -> str:
    expected_columns = {"symbol", "fetched_at", "data_json"}
    target_table = "fundamentals_snapshot"

    table_exists = (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (target_table,),
        ).fetchone()
        is not None
    )

    if table_exists:
        current_cols = {
            row[1]
            for row in conn.execute(f"PRAGMA table_info({target_table})").fetchall()
        }
        if current_cols != expected_columns:
            log.warning(
                "Schema mismatch on fundamentals_snapshot (%s). Falling back to fundamentals_snapshot_sec_poc.",
                sorted(current_cols),
            )
            return "fundamentals_snapshot_sec_poc"

    return target_table


def upsert_payload(
    conn: sqlite3.Connection, table_name: str, symbol: str, payload: dict[str, Any]
) -> None:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            symbol TEXT NOT NULL,
            fetched_at INTEGER NOT NULL,
            data_json TEXT NOT NULL,
            PRIMARY KEY (symbol, fetched_at)
        )
        """
    )
    fetched_at = int(time.time())
    conn.execute(
        f"INSERT OR REPLACE INTO {table_name} (symbol, fetched_at, data_json) VALUES (?, ?, ?)",
        (symbol, fetched_at, json.dumps(payload, sort_keys=True, default=str)),
    )


def to_percent(part: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((part / total) * 100.0, 2)


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    companyfacts_dir = Path(args.companyfacts_dir)
    company_tickers_path = Path(args.company_tickers)

    if not companyfacts_dir.exists() or not companyfacts_dir.is_dir():
        raise FileNotFoundError(f"companyfacts dir not found: {companyfacts_dir}")
    if not company_tickers_path.exists():
        raise FileNotFoundError(
            f"company_tickers file not found: {company_tickers_path}"
        )

    ticker_to_cik = load_ticker_to_cik(company_tickers_path)
    target_tickers = resolve_target_tickers(args)

    print(f"SEC EDGAR BULK AUDIT - tickers={len(target_tickers)}")
    print(f"companyfacts_dir={companyfacts_dir}")
    print(f"company_tickers={company_tickers_path}")
    print(f"write_db={args.write_db} db_path={args.db_path}")

    processed = 0
    skipped_missing_mapping = 0
    skipped_missing_file = 0
    skipped_parse_error = 0

    field_present_counts = {field: 0 for field in RAW_FIELDS}
    field_py_present_counts = {field: 0 for field in RAW_FIELDS_PY}
    overall_present = 0
    overall_possible = 0
    piotroski_ready_count = 0
    db_table_counts: dict[str, int] = {}

    audit_items: list[dict[str, Any]] = []

    conn: Optional[sqlite3.Connection] = None
    target_table: Optional[str] = None

    if args.write_db:
        conn = sqlite3.connect(args.db_path)
        target_table = detect_target_table(conn)

    try:
        for ticker in target_tickers:
            item: dict[str, Any] = {
                "ticker": ticker,
                "status": "skipped",
                "reason": "",
                "cik": None,
                "companyfacts_file": None,
                "found_fields": [],
                "missing_fields": [],
                "found_fields_py": [],
                "missing_fields_py": [],
                "derived_metrics_present": [],
                "piotroski_ready": False,
                "notes": [],
            }

            cik10 = ticker_to_cik.get(ticker)
            item["cik"] = cik10
            if not cik10:
                skipped_missing_mapping += 1
                item["reason"] = "missing_mapping"
                audit_items.append(item)
                continue

            cf_path = companyfacts_dir / format_cik_file_name(cik10)
            item["companyfacts_file"] = str(cf_path)
            if not cf_path.exists():
                skipped_missing_file += 1
                item["reason"] = "missing_file"
                audit_items.append(item)
                continue

            try:
                company_facts = json.loads(cf_path.read_text(encoding="utf-8"))
            except Exception as exc:
                skipped_parse_error += 1
                item["reason"] = f"parse_error: {exc}"
                audit_items.append(item)
                continue

            raw, payload = extract_from_companyfacts(ticker, cik10, company_facts)
            derived = calculate_derived_metrics(raw, market_cap=None)

            # Current year fields
            found_fields = [k for k in RAW_FIELDS if getattr(raw, k) is not None]
            missing_fields = [k for k in RAW_FIELDS if getattr(raw, k) is None]
            for field_name in found_fields:
                field_present_counts[field_name] += 1

            # Prior year fields
            found_fields_py = [
                k for k in RAW_FIELDS_PY if getattr(raw, k, None) is not None
            ]
            missing_fields_py = [
                k for k in RAW_FIELDS_PY if getattr(raw, k, None) is None
            ]
            for field_name in found_fields_py:
                field_py_present_counts[field_name] += 1

            overall_present += len(found_fields)
            overall_possible += len(RAW_FIELDS)

            # Piotroski-9 ready check
            # Need: net_income + py, total_assets + py, operating_cf (current only),
            # total_debt + py, current_assets + py, current_liabilities + py,
            # shares_outstanding + py, revenue + py, gross_profit + py
            piotroski_fields = [
                "net_income",
                "total_assets",
                "operating_cash_flow",
                "total_debt",
                "current_assets",
                "current_liabilities",
                "shares_outstanding",
                "revenue",
                "gross_profit",
            ]
            piotroski_fields_py = [
                f + "_py" for f in piotroski_fields if f != "operating_cash_flow"
            ]

            has_all_current = all(
                getattr(raw, f, None) is not None for f in piotroski_fields
            )
            has_all_prior = all(
                getattr(raw, f, None) is not None for f in piotroski_fields_py
            )
            is_piotroski_ready = has_all_current and has_all_prior

            if is_piotroski_ready:
                piotroski_ready_count += 1

            item["status"] = "processed"
            item["reason"] = ""
            item["found_fields"] = found_fields
            item["missing_fields"] = missing_fields
            item["found_fields_py"] = found_fields_py
            item["missing_fields_py"] = missing_fields_py
            item["derived_metrics_present"] = [
                metric_name
                for metric_name, value in asdict(derived).items()
                if value is not None
            ]
            item["derived_metrics"] = asdict(derived)
            item["piotroski_ready"] = is_piotroski_ready
            item["notes"] = raw.extraction_notes[:10]

            if args.write_db and conn is not None and target_table is not None:
                upsert_payload(conn, target_table, ticker, payload)
                db_table_counts[target_table] = db_table_counts.get(target_table, 0) + 1

            processed += 1
            audit_items.append(item)

        if conn is not None:
            conn.commit()
    finally:
        if conn is not None:
            conn.close()

    skipped_total = skipped_missing_mapping + skipped_missing_file + skipped_parse_error

    field_coverage_pct = {
        field: to_percent(field_present_counts[field], processed)
        for field in RAW_FIELDS
    }
    field_py_coverage_pct = {
        field: to_percent(field_py_present_counts[field], processed)
        for field in RAW_FIELDS_PY
    }
    overall_coverage_pct = to_percent(overall_present, overall_possible)
    piotroski_ready_pct = to_percent(piotroski_ready_count, processed)

    print("\nSUMMARY")
    print(f"processed={processed}")
    print(
        f"skipped={skipped_total} (missing_mapping={skipped_missing_mapping}, missing_file={skipped_missing_file}, parse_error={skipped_parse_error})"
    )
    print(
        f"overall_field_coverage={overall_coverage_pct}% ({overall_present}/{overall_possible})"
    )
    print("field_coverage:")
    for field in RAW_FIELDS:
        print(
            f"  {field}: {field_coverage_pct[field]}% ({field_present_counts[field]}/{processed if processed else 0})"
        )

    print("\nprior_year_coverage:")
    for field in RAW_FIELDS_PY:
        print(
            f"  {field}: {field_py_coverage_pct[field]}% ({field_py_present_counts[field]}/{processed if processed else 0})"
        )

    print(
        f"\npiotroski_ready: {piotroski_ready_pct}% ({piotroski_ready_count}/{processed})"
    )

    if db_table_counts:
        print("db_write_tables:")
        for table_name, count in sorted(db_table_counts.items()):
            print(f"  {table_name}: {count}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    audit_path = Path("data/audits") / f"sec_edgar_bulk_audit_{timestamp}.json"
    audit_path.parent.mkdir(parents=True, exist_ok=True)

    report = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "inputs": {
            "companyfacts_dir": str(companyfacts_dir),
            "company_tickers": str(company_tickers_path),
            "universe": args.universe,
            "tickers": target_tickers,
            "limit": args.limit,
            "write_db": args.write_db,
            "db_path": args.db_path,
        },
        "summary": {
            "processed": processed,
            "skipped": skipped_total,
            "skipped_breakdown": {
                "missing_mapping": skipped_missing_mapping,
                "missing_file": skipped_missing_file,
                "parse_error": skipped_parse_error,
            },
            "overall_field_coverage_pct": overall_coverage_pct,
            "overall_field_coverage": {
                "present": overall_present,
                "possible": overall_possible,
            },
            "field_coverage_pct": field_coverage_pct,
            "field_present_counts": field_present_counts,
            "prior_year_coverage_pct": field_py_coverage_pct,
            "prior_year_present_counts": field_py_present_counts,
            "piotroski_ready": {
                "count": piotroski_ready_count,
                "pct": piotroski_ready_pct,
            },
            "db_tables_used": db_table_counts,
        },
        "per_ticker": audit_items,
    }

    audit_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"audit_report={audit_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
