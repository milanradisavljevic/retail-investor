#!/usr/bin/env python3
"""
Earnings Calendar ETL via yfinance.

Fetches upcoming earnings dates and the latest 4 quarter results
(actual vs estimate EPS) for symbols from active US universes.

Usage:
  python scripts/etl/fetch_earnings.py
  python scripts/etl/fetch_earnings.py --days 90
  python scripts/etl/fetch_earnings.py --limit 20
  python scripts/etl/fetch_earnings.py --symbols AAPL,MSFT,NVDA
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf
import yfinance.cache as yf_cache

logger = logging.getLogger(__name__)

CONFIG_UNIVERSES_DIR = Path("config/universes")
DEFAULT_OUTPUT_FILE = Path("data/earnings/calendar.json")
DEFAULT_DAYS = 90
DEFAULT_MAX_RPS = 5.0
DEFAULT_RETRIES = 3
DEFAULT_BACKOFF_SECONDS = 1.0
CACHE_DIR = Path(".cache/yfinance")

# Architecture D020: yfinance source only.
ACTIVE_UNIVERSE_CANDIDATES: list[list[str]] = [
    ["nasdaq100-full", "nasdaq100"],
    ["sp500-full", "sp500"],
    ["russell2000_full", "russell2000", "russell2000-full"],
]

YAHOO_ALIASES: dict[str, str] = {
    "BF.B": "BF-B",
    "BRK.B": "BRK-B",
    "MOGA": "MOG-A",
    "GEFB": "GEF-B",
    "CRDA": "CRD-A",
}


@dataclass
class RateLimiter:
    min_interval_s: float
    _last_call_ts: float = 0.0

    def wait(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_call_ts
        if elapsed < self.min_interval_s:
            time.sleep(self.min_interval_s - elapsed)
        self._last_call_ts = time.monotonic()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch earnings calendar via yfinance")
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_DAYS,
        help=f"Upcoming window in days (default: {DEFAULT_DAYS})",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_OUTPUT_FILE),
        help=f"Output file (default: {DEFAULT_OUTPUT_FILE})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process first N symbols (debug/testing)",
    )
    parser.add_argument(
        "--symbols",
        type=str,
        default=None,
        help="Comma separated symbols to process (overrides universe loading)",
    )
    parser.add_argument(
        "--max-rps",
        type=float,
        default=DEFAULT_MAX_RPS,
        help=f"Max yfinance requests per second (default: {DEFAULT_MAX_RPS})",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=DEFAULT_RETRIES,
        help=f"Retries per request (default: {DEFAULT_RETRIES})",
    )
    return parser.parse_args()


def configure_yfinance_cache() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    yf_cache.set_cache_location(str(CACHE_DIR.absolute()))


def load_universe_symbols() -> list[str]:
    symbols: list[str] = []

    for candidates in ACTIVE_UNIVERSE_CANDIDATES:
        selected_file: Path | None = None
        for universe_id in candidates:
            candidate_file = CONFIG_UNIVERSES_DIR / f"{universe_id}.json"
            if candidate_file.exists():
                selected_file = candidate_file
                break

        if selected_file is None:
            raise FileNotFoundError(
                f"Could not find universe file for candidates: {', '.join(candidates)}"
            )

        with selected_file.open("r", encoding="utf-8") as f:
            universe = json.load(f)

        raw_symbols = universe.get("symbols")
        if not isinstance(raw_symbols, list):
            raise ValueError(
                f"Invalid universe format in {selected_file}: expected list at 'symbols'"
            )

        symbols.extend(str(s).strip().upper() for s in raw_symbols if str(s).strip())
        logger.info("Loaded %d symbols from %s", len(raw_symbols), selected_file)

    # De-duplicate while preserving order.
    deduped: list[str] = []
    seen: set[str] = set()
    for symbol in symbols:
        if symbol not in seen:
            seen.add(symbol)
            deduped.append(symbol)

    return deduped


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return float(value)

    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        if cleaned == "":
            return None
        try:
            parsed = float(cleaned)
        except ValueError:
            return None
        if math.isnan(parsed) or math.isinf(parsed):
            return None
        return parsed

    return None


def normalize_calendar(calendar_raw: Any) -> dict[str, Any]:
    if calendar_raw is None:
        return {}

    if isinstance(calendar_raw, dict):
        return calendar_raw

    if isinstance(calendar_raw, pd.Series):
        return calendar_raw.to_dict()

    if isinstance(calendar_raw, pd.DataFrame):
        if calendar_raw.empty:
            return {}
        if calendar_raw.shape[1] == 1:
            col = calendar_raw.columns[0]
            return {
                str(idx): calendar_raw.at[idx, col]
                for idx in calendar_raw.index
            }
        if calendar_raw.shape[0] >= 1:
            row = calendar_raw.iloc[0]
            return {str(col): row[col] for col in calendar_raw.columns}

    return {}


def extract_first_datetime(value: Any) -> pd.Timestamp | None:
    if value is None:
        return None

    if isinstance(value, (list, tuple, set)):
        for item in value:
            dt = extract_first_datetime(item)
            if dt is not None:
                return dt
        return None

    if isinstance(value, pd.DatetimeIndex):
        if len(value) == 0:
            return None
        return extract_first_datetime(value[0])

    try:
        ts = pd.to_datetime(value, errors="coerce", utc=False)
    except Exception:
        return None

    if ts is None or (isinstance(ts, float) and math.isnan(ts)):
        return None

    if isinstance(ts, pd.DatetimeIndex):
        if len(ts) == 0:
            return None
        ts = ts[0]

    if isinstance(ts, pd.Timestamp):
        if ts.tzinfo is None:
            # yfinance often returns local-market timestamps without tz.
            return ts.tz_localize(ZoneInfo("America/New_York"))
        return ts

    return None


def infer_earnings_time_label(ts: pd.Timestamp | None) -> str:
    if ts is None:
        return "unknown"

    try:
        local_ts = ts.astimezone(ZoneInfo("America/New_York"))
    except Exception:
        local_ts = ts

    if local_ts.hour == 0 and local_ts.minute == 0:
        return "unknown"
    if local_ts.hour < 12:
        return "before_open"
    if local_ts.hour >= 16:
        return "after_close"
    return "during_market"


def get_calendar_field(calendar: dict[str, Any], candidates: list[str]) -> Any:
    for key in candidates:
        if key in calendar:
            return calendar[key]
    return None


def parse_surprise_pct(value: Any) -> float | None:
    parsed = to_float(value)
    if parsed is None:
        return None
    # If the source is decimal (0.021), normalize to percentage points (2.1).
    if -1.0 <= parsed <= 1.0 and parsed != 0:
        return round(parsed * 100.0, 4)
    return round(parsed, 4)


def call_with_retry(
    fn: Callable[[], Any],
    limiter: RateLimiter,
    retries: int,
    backoff_s: float = DEFAULT_BACKOFF_SECONDS,
) -> Any:
    last_exc: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            limiter.wait()
            return fn()
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                sleep_s = backoff_s * (2 ** (attempt - 1))
                logger.warning(
                    "Request failed (%s: %s), retrying in %.1fs (%d/%d)",
                    type(exc).__name__,
                    exc,
                    sleep_s,
                    attempt,
                    retries,
                )
                time.sleep(sleep_s)

    if last_exc is not None:
        raise last_exc
    return None


def get_earnings_dates_df(
    ticker: yf.Ticker,
    limiter: RateLimiter,
    retries: int,
) -> pd.DataFrame | None:
    def _fetch_via_method() -> Any:
        return ticker.get_earnings_dates(limit=12)

    def _fetch_via_property() -> Any:
        return ticker.earnings_dates

    raw: Any = None
    try:
        raw = call_with_retry(_fetch_via_method, limiter, retries)
    except Exception:
        try:
            raw = call_with_retry(_fetch_via_property, limiter, retries)
        except Exception:
            raw = None

    if raw is None:
        return None
    if not isinstance(raw, pd.DataFrame) or raw.empty:
        return None

    return raw.copy()


def parse_last_quarters(df: pd.DataFrame) -> list[dict[str, Any]]:
    now = pd.Timestamp.now(tz=timezone.utc)
    rows: list[dict[str, Any]] = []

    working = df.copy()
    working = working.sort_index(ascending=False)

    for idx, row in working.iterrows():
        date_ts = extract_first_datetime(idx)
        if date_ts is None:
            date_ts = extract_first_datetime(row.get("Earnings Date"))
        if date_ts is None:
            continue

        date_utc = date_ts.astimezone(timezone.utc)
        if date_utc > now:
            continue

        eps_actual = to_float(
            row.get("Reported EPS", row.get("EPS Actual", row.get("epsActual")))
        )
        eps_estimate = to_float(
            row.get("EPS Estimate", row.get("epsEstimate", row.get("Estimated EPS")))
        )
        surprise_pct = parse_surprise_pct(
            row.get("Surprise(%)", row.get("Surprise %", row.get("surprisePercent")))
        )

        rows.append(
            {
                "date": date_utc.date().isoformat(),
                "eps_actual": eps_actual,
                "eps_estimate": eps_estimate,
                "surprise_pct": surprise_pct,
            }
        )
        if len(rows) >= 4:
            break

    return rows


def fetch_symbol_earnings(
    symbol: str,
    limiter: RateLimiter,
    retries: int,
) -> tuple[dict[str, Any] | None, str | None]:
    yf_symbol = YAHOO_ALIASES.get(symbol, symbol)
    ticker = yf.Ticker(yf_symbol)

    try:
        calendar_raw = call_with_retry(lambda: ticker.calendar, limiter, retries)
    except Exception as exc:
        return None, f"calendar_error: {type(exc).__name__}: {exc}"

    calendar = normalize_calendar(calendar_raw)

    earnings_date_raw = get_calendar_field(
        calendar,
        [
            "Earnings Date",
            "earningsDate",
            "earnings_date",
            "Earnings Date Start",
        ],
    )
    earnings_ts = extract_first_datetime(earnings_date_raw)

    if earnings_ts is None:
        return None, "missing_earnings_date"

    eps_estimate = to_float(
        get_calendar_field(
            calendar,
            ["EPS Estimate", "epsEstimate", "Earnings Estimate", "eps_estimate"],
        )
    )
    revenue_estimate = to_float(
        get_calendar_field(
            calendar,
            [
                "Revenue Estimate",
                "revenueEstimate",
                "Revenue Estimate Avg",
                "revenue_estimate",
            ],
        )
    )

    earnings_dates_df = get_earnings_dates_df(ticker, limiter, retries)
    last_quarters = parse_last_quarters(earnings_dates_df) if earnings_dates_df is not None else []

    earnings_utc = earnings_ts.astimezone(timezone.utc)
    return (
        {
            "symbol": symbol,
            "earnings_date": earnings_utc.date().isoformat(),
            "time": infer_earnings_time_label(earnings_ts),
            "eps_estimate": eps_estimate,
            "revenue_estimate": revenue_estimate,
            "last_4_quarters": last_quarters,
        },
        None,
    )


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )
    args = parse_args()

    if args.days < 1:
        raise ValueError("--days must be >= 1")
    if args.max_rps <= 0:
        raise ValueError("--max-rps must be > 0")
    if args.retries < 1:
        raise ValueError("--retries must be >= 1")

    output_file = Path(args.output)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    configure_yfinance_cache()

    if args.symbols:
        raw_symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
        symbols = list(dict.fromkeys(raw_symbols))
        logger.info("Using explicit symbols (%d)", len(symbols))
    else:
        symbols = load_universe_symbols()
        logger.info("Loaded %d unique symbols from active universes", len(symbols))

    if args.limit is not None:
        symbols = symbols[: max(0, args.limit)]
        logger.info("Applying --limit=%d (effective symbols: %d)", args.limit, len(symbols))

    if len(symbols) == 0:
        raise RuntimeError("No symbols to process")

    now_utc = datetime.now(timezone.utc)
    cutoff_date = (now_utc + timedelta(days=args.days)).date()
    limiter = RateLimiter(min_interval_s=1.0 / args.max_rps)

    start_time = time.time()
    upcoming: list[dict[str, Any]] = []
    upcoming_dates_all: list[datetime.date] = []
    failed_symbols: list[dict[str, str]] = []

    total = len(symbols)
    for idx, symbol in enumerate(symbols, start=1):
        logger.info("[%d/%d] %s", idx, total, symbol)
        record, error = fetch_symbol_earnings(symbol, limiter, args.retries)

        if record is None:
            failed_symbols.append({"symbol": symbol, "reason": error or "unknown_error"})
            continue

        earnings_date = datetime.strptime(record["earnings_date"], "%Y-%m-%d").date()
        if earnings_date >= now_utc.date():
            upcoming_dates_all.append(earnings_date)

        if now_utc.date() <= earnings_date <= cutoff_date:
            upcoming.append(record)

    upcoming.sort(key=lambda x: (x["earnings_date"], x["symbol"]))

    upcoming_7_days = sum(
        1
        for dt in upcoming_dates_all
        if now_utc.date() <= dt <= (now_utc.date() + timedelta(days=7))
    )
    upcoming_30_days = sum(
        1
        for dt in upcoming_dates_all
        if now_utc.date() <= dt <= (now_utc.date() + timedelta(days=30))
    )

    payload = {
        "fetched_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "upcoming": upcoming,
        "summary": {
            "total_symbols_checked": total,
            "upcoming_total_found": len(upcoming_dates_all),
            "upcoming_in_window": len(upcoming),
            "upcoming_7_days": upcoming_7_days,
            "upcoming_30_days": upcoming_30_days,
            "window_days": args.days,
            "failed_symbols_count": len(failed_symbols),
            "failed_symbols": failed_symbols,
            "fetch_duration_seconds": round(time.time() - start_time, 2),
        },
    }

    with output_file.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    logger.info("Saved earnings calendar to %s", output_file)
    logger.info(
        "Summary: checked=%d, upcoming_in_window=%d, failed=%d",
        total,
        len(upcoming),
        len(failed_symbols),
    )


if __name__ == "__main__":
    main()
