#!/usr/bin/env python3
"""
FMP Data Loader

Usage:
  python scripts/etl/fmp_load.py --universe nasdaq100 [--limit 125] [--dry-run]
  python scripts/etl/fmp_load.py --universe sp500 --skip-cached
  python scripts/etl/fmp_load.py --universe nasdaq100 --force-remap
  python scripts/etl/fmp_load.py --universe sp500 --until-full
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.data_py.cache import SQLiteCache
from src.data_py.fmp_client import FMPClient

DEFAULT_DB_PATH = ROOT / "data" / "privatinvestor.db"
UNIVERSES_DIR = ROOT / "config" / "universes"
FRESHNESS_DAYS = 30
FMP_DAILY_BUDGET = 250


def _strip_inline_comment(value: str) -> str:
    in_single = False
    in_double = False
    escaped = False
    result: list[str] = []

    for char in value:
        if escaped:
            result.append(char)
            escaped = False
            continue

        if char == "\\":
            result.append(char)
            escaped = True
            continue

        if char == "'" and not in_double:
            in_single = not in_single
            result.append(char)
            continue

        if char == '"' and not in_single:
            in_double = not in_double
            result.append(char)
            continue

        if char == "#" and not in_single and not in_double:
            break

        result.append(char)

    return "".join(result).strip()


def _parse_env_file(env_path: str) -> dict[str, str]:
    p = Path(env_path)
    if not p.exists():
        return {}

    parsed: dict[str, str] = {}

    with p.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, _, value = line.partition("=")
            key = key.strip()
            if key.startswith("export "):
                key = key[len("export ") :].strip()

            value = _strip_inline_comment(value.strip())
            if (
                len(value) >= 2
                and value[0] == value[-1]
                and value[0] in ('"', "'")
            ):
                value = value[1:-1]
            if key:
                parsed[key] = value

    return parsed


def load_dotenv(env_path: str = ".env") -> dict[str, str]:
    """Load .env file into os.environ (simple parser, no dependency)."""
    parsed = _parse_env_file(env_path)
    for key, value in parsed.items():
        if key not in os.environ:
            os.environ[key] = value
    return parsed


def get_fmp_api_keys() -> list[str]:
    """Resolve FMP keys from env with stable order and deduping.

    Supported:
    - FMP_API_KEYS (comma-separated explicit order)
    - FMP_API_KEY
    - FMP_API_KEY2 / FMP_API_KEY3 / ... (numeric suffix)
    """
    raw_values: list[str] = []

    multi_raw = os.environ.get("FMP_API_KEYS", "").strip()
    if multi_raw:
        raw_values.extend(part.strip() for part in multi_raw.split(","))

    base_value = os.environ.get("FMP_API_KEY", "").strip()
    if base_value:
        raw_values.append(base_value)

    numbered_keys: list[tuple[int, str]] = []
    pattern = re.compile(r"^FMP_API_KEY(\d+)$")
    for env_key, env_val in os.environ.items():
        m = pattern.match(env_key)
        if not m:
            continue
        suffix = int(m.group(1))
        value = env_val.strip()
        if value:
            numbered_keys.append((suffix, value))

    for _, value in sorted(numbered_keys, key=lambda item: item[0]):
        raw_values.append(value)

    deduped: list[str] = []
    seen: set[str] = set()
    for value in raw_values:
        if not value or value in seen:
            continue
        deduped.append(value)
        seen.add(value)

    return deduped


def provider_budget_key_for_slot(slot_idx: int, slot_count: int) -> str:
    if slot_count <= 1:
        return "fmp"
    return f"fmp:key{slot_idx + 1}"


def preferred_slot_order(symbol: str, slot_count: int) -> list[int]:
    if slot_count <= 1:
        return [0]
    preferred = sum(ord(ch) for ch in symbol) % slot_count
    return [preferred] + [i for i in range(slot_count) if i != preferred]


def emit(event: str, **payload: Any) -> None:
    line = {"event": event, **payload}
    print(json.dumps(line, sort_keys=True, default=str), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load FMP fundamentals into SQLite")
    parser.add_argument("--universe", required=True, help="Universe name (e.g. nasdaq100)")
    parser.add_argument(
        "--limit",
        type=int,
        default=125,
        help="Maximum symbols to process (default: 125)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be loaded without making API calls",
    )
    parser.add_argument(
        "--skip-cached",
        action="store_true",
        help="Skip symbols where fresh FMP cache exists (<30 days)",
    )
    parser.add_argument(
        "--force-remap",
        action="store_true",
        help="Rebuild fundamentals_snapshot from provider_cache only (no API calls)",
    )
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help="Path to privatinvestor SQLite DB",
    )
    parser.add_argument(
        "--until-full",
        action="store_true",
        help=(
            "Scan full universe and process all symbols needing work "
            "(acts like --skip-cached and ignores --limit)"
        ),
    )
    return parser.parse_args()


def _parse_iso(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        if value.endswith("Z"):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        else:
            return None

    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def resolve_universe_path(universe_name: str) -> Path:
    raw = universe_name.strip()
    raw_path = Path(raw)

    if raw_path.exists():
        return raw_path

    aliases = {
        "nasdaq100": "nasdaq100-full",
        "sp500": "sp500-full",
        "russell2000": "russell2000_full",
        "dax40": "dax40-full",
        "cac40": "cac40-full",
        "eurostoxx50": "eurostoxx50-full",
        "ftse100": "ftse100-full",
    }

    normalized = raw.replace(".json", "")
    alias = aliases.get(normalized, normalized)

    candidates = [
        UNIVERSES_DIR / f"{alias}.json",
        UNIVERSES_DIR / f"{normalized}.json",
        UNIVERSES_DIR / f"{normalized}-full.json",
        UNIVERSES_DIR / f"{normalized}_full.json",
        UNIVERSES_DIR / f"{normalized.replace('-', '_')}.json",
        UNIVERSES_DIR / f"{normalized.replace('_', '-')}.json",
    ]

    for path in candidates:
        if path.exists():
            return path

    raise FileNotFoundError(
        f"Universe '{universe_name}' not found in {UNIVERSES_DIR}"
    )


def load_symbols(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    symbols = data.get("symbols") if isinstance(data, dict) else data
    if not isinstance(symbols, list):
        raise ValueError(f"Universe file has no symbol list: {path}")
    return [str(symbol).strip().upper() for symbol in symbols if str(symbol).strip()]


def get_fmp_cache_state(
    conn: sqlite3.Connection, symbol: str, cutoff: datetime
) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT field, value_json, fetched_at
        FROM provider_cache
        WHERE symbol = ? AND provider = 'fmp' AND field IN ('ratios', 'profile')
        """,
        (symbol,),
    ).fetchall()

    by_field: dict[str, datetime] = {}
    payloads: dict[str, dict | None] = {"ratios": None, "profile": None}

    for field, value_json, fetched_at in rows:
        parsed = _parse_iso(str(fetched_at))
        if parsed is not None:
            by_field[str(field)] = parsed
        try:
            decoded = json.loads(str(value_json))
            payloads[str(field)] = decoded if isinstance(decoded, dict) else None
        except (TypeError, ValueError, json.JSONDecodeError):
            payloads[str(field)] = None

    ratios_fresh = "ratios" in by_field and by_field["ratios"] >= cutoff
    profile_fresh = "profile" in by_field and by_field["profile"] >= cutoff
    return {
        "ratios": payloads.get("ratios"),
        "profile": payloads.get("profile"),
        "has_ratios": payloads.get("ratios") is not None,
        "has_profile": payloads.get("profile") is not None,
        "has_any": payloads.get("ratios") is not None or payloads.get("profile") is not None,
        "ratios_fresh": ratios_fresh,
        "profile_fresh": profile_fresh,
        "both_fresh": ratios_fresh and profile_fresh,
    }


def has_fmp_snapshot(conn: sqlite3.Connection, symbol: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM fundamentals_snapshot
        WHERE symbol = ?
          AND json_extract(data_json, '$._source') = 'fmp'
        LIMIT 1
        """,
        (symbol,),
    ).fetchone()
    return row is not None


def ensure_provider_budget_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS provider_api_budget (
          provider TEXT NOT NULL,
          usage_date TEXT NOT NULL,
          calls_used INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (provider, usage_date)
        )
        """
    )


def get_provider_daily_calls(
    conn: sqlite3.Connection, provider: str, usage_date: str
) -> int:
    row = conn.execute(
        """
        SELECT calls_used
        FROM provider_api_budget
        WHERE provider = ? AND usage_date = ?
        """,
        (provider, usage_date),
    ).fetchone()
    return int(row[0]) if row is not None else 0


def set_provider_daily_calls(
    conn: sqlite3.Connection, provider: str, usage_date: str, calls_used: int
) -> None:
    updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    conn.execute(
        """
        INSERT INTO provider_api_budget (provider, usage_date, calls_used, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(provider, usage_date)
        DO UPDATE SET calls_used = excluded.calls_used, updated_at = excluded.updated_at
        """,
        (provider, usage_date, max(0, int(calls_used)), updated_at),
    )


def resolve_symbol_action(
    *,
    force_remap: bool,
    skip_cached: bool,
    cache_state: dict[str, Any],
    snapshot_exists: bool,
) -> str:
    if force_remap:
        return "remap_cache_forced" if cache_state["has_any"] else "skip_no_cache"
    if skip_cached and cache_state["both_fresh"] and snapshot_exists:
        return "skip_cached"
    if skip_cached and cache_state["both_fresh"] and not snapshot_exists and cache_state["has_any"]:
        return "remap_missing_snapshot"
    return "fetch_api"


def store_fundamentals_snapshot(
    conn: sqlite3.Connection, symbol: str, data: dict[str, Any]
) -> int:
    payload = dict(data)
    payload["_source"] = "fmp"
    fetched_at = int(time.time())
    conn.execute(
        """
        INSERT OR REPLACE INTO fundamentals_snapshot (symbol, fetched_at, data_json)
        VALUES (?, ?, ?)
        """,
        (symbol, fetched_at, json.dumps(payload, sort_keys=True, default=str)),
    )
    return fetched_at


def _normalize_epoch_ms(value: Any) -> int | None:
    if value is None:
        return None
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    return ts * 1000 if ts < 1_000_000_000_000 else ts


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    mid = len(sorted_values) // 2
    if len(sorted_values) % 2 == 0:
        return (sorted_values[mid - 1] + sorted_values[mid]) / 2.0
    return sorted_values[mid]


def compute_fundamentals_freshness(
    conn: sqlite3.Connection, symbols: list[str], stale_days: int
) -> dict[str, Any]:
    if not symbols:
        return {
            "stale_threshold_days": stale_days,
            "checked_symbols": 0,
            "symbols_with_snapshot": 0,
            "missing_snapshot": 0,
            "stale_symbols": 0,
            "stale_pct_of_snapshot": 0.0,
            "stale_pct_of_universe": 0.0,
            "oldest_age_days": None,
            "median_age_days": None,
            "top_stale_symbols": [],
        }

    latest_by_symbol: dict[str, int] = {}
    chunk_size = 900
    for start_idx in range(0, len(symbols), chunk_size):
        chunk = symbols[start_idx : start_idx + chunk_size]
        placeholders = ",".join("?" for _ in chunk)
        rows = conn.execute(
            f"""
            SELECT symbol, MAX(fetched_at) as fetched_at
            FROM fundamentals_snapshot
            WHERE symbol IN ({placeholders})
            GROUP BY symbol
            """,
            chunk,
        ).fetchall()
        for symbol, fetched_at in rows:
            normalized = _normalize_epoch_ms(fetched_at)
            if normalized is None:
                continue
            latest_by_symbol[str(symbol).upper()] = normalized

    now_ms = int(time.time() * 1000)
    stale_ms = stale_days * 24 * 60 * 60 * 1000
    age_days_values: list[float] = []
    stale_details: list[dict[str, Any]] = []

    for symbol, fetched_ms in latest_by_symbol.items():
        age_days = max(0.0, (now_ms - fetched_ms) / (24 * 60 * 60 * 1000))
        rounded_age = round(age_days, 1)
        age_days_values.append(rounded_age)
        if now_ms - fetched_ms > stale_ms:
            stale_details.append({"symbol": symbol, "age_days": rounded_age})

    stale_details.sort(key=lambda item: item["age_days"], reverse=True)
    symbols_with_snapshot = len(latest_by_symbol)
    checked_symbols = len(symbols)
    stale_count = len(stale_details)
    missing_snapshot = max(0, checked_symbols - symbols_with_snapshot)

    return {
        "stale_threshold_days": stale_days,
        "checked_symbols": checked_symbols,
        "symbols_with_snapshot": symbols_with_snapshot,
        "missing_snapshot": missing_snapshot,
        "stale_symbols": stale_count,
        "stale_pct_of_snapshot": round(
            (stale_count / symbols_with_snapshot) * 100.0, 2
        )
        if symbols_with_snapshot
        else 0.0,
        "stale_pct_of_universe": round((stale_count / checked_symbols) * 100.0, 2)
        if checked_symbols
        else 0.0,
        "oldest_age_days": round(max(age_days_values), 1) if age_days_values else None,
        "median_age_days": round(_median(age_days_values), 1)
        if age_days_values
        else None,
        "top_stale_symbols": stale_details[:20],
    }


def main() -> int:
    args = parse_args()
    shell_fmp_key = os.environ.get("FMP_API_KEY")
    dotenv_values = load_dotenv(str(ROOT / ".env"))

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    db_path = Path(args.db_path)
    if not db_path.exists():
        emit("fmp_load.error", error=f"DB not found: {db_path}")
        return 1

    try:
        universe_path = resolve_universe_path(args.universe)
        symbols = load_symbols(universe_path)
    except Exception as exc:  # noqa: BLE001
        emit("fmp_load.error", error=str(exc))
        return 1

    effective_skip_cached = args.skip_cached or args.until_full
    max_actions = len(symbols) if args.until_full else max(0, min(args.limit, len(symbols)))
    scan_symbols = (
        symbols
        if (effective_skip_cached or args.force_remap or args.until_full)
        else symbols[:max_actions]
    )
    scan_total = len(scan_symbols)
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=FRESHNESS_DAYS)

    emit(
        "fmp_load.start",
        universe=args.universe,
        universe_file=str(universe_path),
        total_symbols=len(symbols),
        selected_symbols=max_actions,
        scan_symbols=scan_total,
        skip_cached=effective_skip_cached,
        force_remap=args.force_remap,
        until_full=args.until_full,
        dry_run=args.dry_run,
        db_path=str(db_path),
    )

    api_keys = get_fmp_api_keys()
    if not args.dry_run and not args.force_remap and not api_keys:
        emit(
            "fmp_load.error",
            error="Missing FMP API credentials (set FMP_API_KEYS or FMP_API_KEY/FMP_API_KEY2...)",
        )
        return 1
    if (
        shell_fmp_key
        and "FMP_API_KEY" in dotenv_values
        and shell_fmp_key != dotenv_values["FMP_API_KEY"]
    ):
        emit(
            "fmp_load.warning",
            warning="Shell env var FMP_API_KEY overrides .env value",
            hint="Run with env -u FMP_API_KEY ... to force .env key",
        )

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL;")
    ensure_provider_budget_table(conn)
    usage_date = datetime.now(timezone.utc).date().isoformat()
    if not api_keys:
        # For dry-run/cache-remap paths we still need a client object.
        api_keys = ["cache-remap"]

    slot_count = len(api_keys)
    legacy_calls_used = get_provider_daily_calls(conn, "fmp", usage_date)

    key_slots: list[dict[str, Any]] = []
    for idx, api_key in enumerate(api_keys):
        provider_budget_key = provider_budget_key_for_slot(idx, slot_count)
        calls_before = get_provider_daily_calls(conn, provider_budget_key, usage_date)
        if slot_count > 1 and idx == 0:
            # Backward compatibility with pre-sharding daily usage row.
            calls_before = max(calls_before, legacy_calls_used)

        daily_available = max(0, FMP_DAILY_BUDGET - calls_before)
        session_call_cap = (
            FMP_DAILY_BUDGET
            if args.dry_run or args.force_remap
            else daily_available
        )
        key_slots.append(
            {
                "index": idx,
                "label": f"key{idx + 1}",
                "provider_budget_key": provider_budget_key,
                "calls_used_before": calls_before,
                "daily_calls_available": daily_available,
                "session_call_cap": session_call_cap,
            }
        )

    calls_used_before = sum(int(slot["calls_used_before"]) for slot in key_slots)
    daily_calls_available = sum(int(slot["daily_calls_available"]) for slot in key_slots)
    daily_budget_total = FMP_DAILY_BUDGET * slot_count

    emit(
        "fmp_load.budget",
        usage_date=usage_date,
        daily_budget=FMP_DAILY_BUDGET,
        daily_budget_total=daily_budget_total,
        key_slots=len(key_slots),
        daily_calls_used_before=calls_used_before,
        daily_calls_available=daily_calls_available,
        per_key=[
            {
                "slot": slot["label"],
                "provider_budget_key": slot["provider_budget_key"],
                "daily_calls_used_before": slot["calls_used_before"],
                "daily_calls_available": slot["daily_calls_available"],
                "session_call_cap": slot["session_call_cap"],
            }
            for slot in key_slots
        ],
    )

    if not args.dry_run and not args.force_remap and daily_calls_available <= 0:
        emit(
            "fmp_load.error",
            error="FMP daily call budget exhausted for today",
            usage_date=usage_date,
            daily_budget=daily_budget_total,
            calls_used_today=calls_used_before,
        )
        conn.close()
        return 2

    cache = SQLiteCache(db_path=str(db_path), ttl_hours=24 * FRESHNESS_DAYS, provider="fmp")
    for slot in key_slots:
        slot["client"] = FMPClient(
            api_key=api_keys[slot["index"]],
            cache=cache,
            max_calls_per_session=slot["session_call_cap"],
        )
    calls_used_after = calls_used_before

    processed = 0
    failed = 0
    skipped_cached = 0
    skipped_no_cache = 0
    remapped_from_cache = 0
    loaded = 0
    dry_run_count = 0
    with_pe = 0
    with_roe = 0
    with_market_cap = 0
    actions_taken = 0
    freshness_summary: dict[str, Any] | None = None

    try:
        for idx, symbol in enumerate(scan_symbols, start=1):
            cache_state = get_fmp_cache_state(conn, symbol, cutoff)
            snapshot_exists = has_fmp_snapshot(conn, symbol)
            action = resolve_symbol_action(
                force_remap=args.force_remap,
                skip_cached=effective_skip_cached,
                cache_state=cache_state,
                snapshot_exists=snapshot_exists,
            )

            is_actionable = action in ("fetch_api", "remap_cache_forced", "remap_missing_snapshot")
            if is_actionable:
                if actions_taken >= max_actions:
                    break
                actions_taken += 1

            api_calls_before = sum(slot["client"].calls_made for slot in key_slots)
            mode = "api_fetch"
            fundamentals: dict[str, Any] | None = None
            selected_slot_label = key_slots[0]["label"] if key_slots else "key1"

            if args.dry_run:
                dry_run_count += 1
                if action == "skip_no_cache":
                    dry_status = "would_skip_no_cache"
                    msg = f"[{idx}/{scan_total}] {symbol}: would skip (no cached fmp payloads)"
                elif action == "skip_cached":
                    dry_status = "would_skip_cached"
                    msg = f"[{idx}/{scan_total}] {symbol}: would skip (fresh fmp cache + snapshot)"
                elif action in ("remap_cache_forced", "remap_missing_snapshot"):
                    dry_status = "would_remap_from_cache"
                    msg = f"[{idx}/{scan_total}] {symbol}: would remap from cache"
                else:
                    dry_status = "would_fetch"
                    msg = f"[{idx}/{scan_total}] {symbol}: would fetch via API"

                emit(
                    "fmp_load.progress",
                    index=idx,
                    total=scan_total,
                    symbol=symbol,
                    status=dry_status,
                    action=action,
                    ratios_fresh=cache_state["ratios_fresh"],
                    profile_fresh=cache_state["profile_fresh"],
                    snapshot_exists=snapshot_exists,
                    message=msg,
                )
                continue

            if action == "skip_no_cache":
                skipped_no_cache += 1
                emit(
                    "fmp_load.progress",
                    index=idx,
                    total=scan_total,
                    symbol=symbol,
                    status="skipped_no_cache",
                    action=action,
                    message=f"[{idx}/{scan_total}] {symbol}: skipped (no cached fmp payloads)",
                )
                continue

            if action == "skip_cached":
                skipped_cached += 1
                emit(
                    "fmp_load.progress",
                    index=idx,
                    total=scan_total,
                    symbol=symbol,
                    status="skipped_cached",
                    action=action,
                    message=f"[{idx}/{scan_total}] {symbol}: skipped (fresh fmp cache + snapshot)",
                )
                continue

            if action == "remap_cache_forced":
                mode = "cache_remap_forced"
                fundamentals = key_slots[0]["client"].build_fundamentals(
                    symbol=symbol,
                    ratios=cache_state["ratios"],
                    profile=cache_state["profile"],
                )
            elif action == "remap_missing_snapshot":
                mode = "cache_remap_missing_snapshot"
                fundamentals = key_slots[0]["client"].build_fundamentals(
                    symbol=symbol,
                    ratios=cache_state["ratios"],
                    profile=cache_state["profile"],
                )

            if fundamentals is None:
                fetch_error: str | None = None
                fetch_hard_failed = False
                for slot_idx in preferred_slot_order(symbol, len(key_slots)):
                    slot = key_slots[slot_idx]
                    client = slot["client"]
                    selected_slot_label = slot["label"]
                    try:
                        fundamentals = client.fetch_fundamentals(symbol)
                        break
                    except RuntimeError as exc:
                        fetch_error = str(exc)
                        err_l = fetch_error.lower()
                        if (
                            "budget exhausted" in err_l
                            or "forbidden" in err_l
                            or "403" in err_l
                        ):
                            continue
                        failed += 1
                        emit(
                            "fmp_load.progress",
                            index=idx,
                            total=scan_total,
                            symbol=symbol,
                            status="failed",
                            action=action,
                            key_slot=selected_slot_label,
                            error=fetch_error,
                            message=f"[{idx}/{scan_total}] {symbol}: failed ({fetch_error})",
                        )
                        fetch_hard_failed = True
                        break

                if fundamentals is None and fetch_error is not None and not fetch_hard_failed:
                    failed += 1
                    emit(
                        "fmp_load.progress",
                        index=idx,
                        total=scan_total,
                        symbol=symbol,
                        status="failed",
                        action=action,
                        key_slot=selected_slot_label,
                        error=fetch_error,
                        message=f"[{idx}/{scan_total}] {symbol}: failed ({fetch_error})",
                    )
                    err_l = fetch_error.lower()
                    if "budget exhausted" in err_l or "forbidden" in err_l or "403" in err_l:
                        break
                    continue

            api_calls_used = sum(slot["client"].calls_made for slot in key_slots) - api_calls_before
            raw_fmp = fundamentals.get("rawFmp") or {}
            has_data = raw_fmp.get("ratios") is not None or raw_fmp.get("profile") is not None
            if not has_data:
                if mode.startswith("cache_remap"):
                    skipped_no_cache += 1
                    emit(
                        "fmp_load.progress",
                        index=idx,
                        total=scan_total,
                        symbol=symbol,
                        status="skipped_no_cache",
                        action=action,
                        key_slot=selected_slot_label,
                        api_calls=api_calls_used,
                        message=f"[{idx}/{scan_total}] {symbol}: skipped (cached payload empty)",
                    )
                else:
                    failed += 1
                    emit(
                        "fmp_load.progress",
                        index=idx,
                        total=scan_total,
                        symbol=symbol,
                        status="failed",
                        action=action,
                        key_slot=selected_slot_label,
                        api_calls=api_calls_used,
                        message=(
                            f"[{idx}/{scan_total}] {symbol}: failed (no FMP data returned, "
                            f"{api_calls_used} API calls)"
                        ),
                    )
                continue

            store_fundamentals_snapshot(conn, symbol, fundamentals)
            conn.commit()

            processed += 1
            loaded += 1
            if mode.startswith("cache_remap"):
                remapped_from_cache += 1

            pe = fundamentals.get("peRatio")
            roe = fundamentals.get("roe")
            mcap = fundamentals.get("marketCap")

            if pe is not None:
                with_pe += 1
            if roe is not None:
                with_roe += 1
            if mcap is not None:
                with_market_cap += 1

            pe_display = "n/a" if pe is None else f"{pe:.2f}"
            roe_display = "n/a" if roe is None else f"{roe:.2f}%"

            emit(
                "fmp_load.progress",
                index=idx,
                total=scan_total,
                symbol=symbol,
                status="ok",
                action=action,
                peRatio=pe,
                roe=roe,
                marketCap=mcap,
                key_slot=selected_slot_label,
                api_calls=api_calls_used,
                mode=mode,
                message=(
                    f"[{idx}/{scan_total}] {symbol}: "
                    f"OK PE={pe_display} ROE={roe_display} "
                    f"({api_calls_used} API calls, mode={mode})"
                ),
            )
    finally:
        if not args.dry_run:
            calls_used_after = 0
            for slot in key_slots:
                client = slot["client"]
                slot_calls_after = int(slot["calls_used_before"]) + int(client.calls_made)
                slot["calls_used_after"] = slot_calls_after
                set_provider_daily_calls(
                    conn,
                    str(slot["provider_budget_key"]),
                    usage_date,
                    slot_calls_after,
                )
                calls_used_after += slot_calls_after

            # Keep legacy aggregate row for compatibility with existing tooling.
            set_provider_daily_calls(conn, "fmp", usage_date, calls_used_after)
            conn.commit()

        try:
            freshness_summary = compute_fundamentals_freshness(
                conn,
                symbols,
                stale_days=FRESHNESS_DAYS,
            )
            if freshness_summary.get("stale_symbols", 0) > 0:
                emit(
                    "fmp_load.warning",
                    warning="stale_fundamentals_detected",
                    stale_threshold_days=FRESHNESS_DAYS,
                    stale_symbols=freshness_summary.get("stale_symbols", 0),
                    checked_symbols=freshness_summary.get("checked_symbols", 0),
                    stale_pct_of_universe=freshness_summary.get("stale_pct_of_universe", 0.0),
                    oldest_age_days=freshness_summary.get("oldest_age_days"),
                )
        except Exception as exc:  # noqa: BLE001
            freshness_summary = {"error": str(exc)}
            emit(
                "fmp_load.warning",
                warning="freshness_check_failed",
                error=str(exc),
            )
        for slot in key_slots:
            slot["client"].close()
        conn.close()

    attempted = actions_taken
    summary_payload = {
        "universe": args.universe,
        "selected_symbols": max_actions,
        "scan_symbols": scan_total,
        "until_full": args.until_full,
        "dry_run": args.dry_run,
        "skip_cached": effective_skip_cached,
        "force_remap": args.force_remap,
        "actions_taken": actions_taken,
        "dry_run_symbols": dry_run_count,
        "skipped_cached": skipped_cached,
        "skipped_no_cache": skipped_no_cache,
        "remapped_from_cache": remapped_from_cache,
        "loaded": loaded,
        "processed": processed,
        "failed": failed,
        "attempted": attempted,
        "api_keys_configured": len(key_slots),
        "api_calls_total": sum(slot["client"].calls_made for slot in key_slots),
        "api_calls_total_by_key": {
            slot["label"]: int(slot["client"].calls_made) for slot in key_slots
        },
        "api_calls_remaining_budget": max(0, daily_budget_total - calls_used_after),
        "session_call_cap": sum(int(slot["session_call_cap"]) for slot in key_slots),
        "daily_budget": FMP_DAILY_BUDGET,
        "daily_budget_total": daily_budget_total,
        "daily_usage_date": usage_date,
        "daily_calls_used_before": calls_used_before,
        "daily_calls_used_after": calls_used_after,
        "daily_calls_used_after_by_key": {
            slot["label"]: int(
                slot.get("calls_used_after", int(slot["calls_used_before"]))
            )
            for slot in key_slots
        },
        "daily_calls_remaining": max(0, daily_budget_total - calls_used_after),
        "coverage_pe_ratio": (with_pe / loaded) if loaded else 0.0,
        "coverage_roe": (with_roe / loaded) if loaded else 0.0,
        "coverage_market_cap": (with_market_cap / loaded) if loaded else 0.0,
        "freshness": freshness_summary or {},
    }
    emit("fmp_load.summary", **summary_payload)

    if failed > 0:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
