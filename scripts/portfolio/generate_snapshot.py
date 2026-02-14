#!/usr/bin/env python3
"""
Portfolio Snapshot Generator

Generates daily portfolio snapshots for performance tracking.
Should run as part of the daily ETL pipeline (after scoring run).

Usage:
    python scripts/portfolio/generate_snapshot.py
"""

import json
import logging
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

DB_PATH = Path("data/privatinvestor.db")
MACRO_DATA_PATH = Path("data/macro/commodities.json")
RUNS_DIR = Path("data/runs")

USER_ID = "default"

FX_RATES_TO_USD = {
    "USD": 1.0,
    "EUR": 1.08,
    "GBP": 1.27,
    "CHF": 1.12,
    "JPY": 0.0067,
}

PHYSICAL_METALS = {
    "PHYS:XAU": {"price_ticker": "GC=F"},
    "PHYS:XAG": {"price_ticker": "SI=F"},
    "PHYS:XPT": {"price_ticker": "PL=F"},
    "PHYS:XPD": {"price_ticker": "PA=F"},
}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_positions(conn: sqlite3.Connection, user_id: str = USER_ID) -> List[Dict]:
    cursor = conn.execute(
        "SELECT * FROM portfolio_positions WHERE user_id = ?", (user_id,)
    )
    return [dict(row) for row in cursor.fetchall()]


def load_macro_prices() -> Dict[str, float]:
    if not MACRO_DATA_PATH.exists():
        logger.warning(f"Macro data file not found: {MACRO_DATA_PATH}")
        return {}

    try:
        with open(MACRO_DATA_PATH, "r") as f:
            data = json.load(f)

        prices = {}
        for symbol, info in data.get("tickers", {}).items():
            if info.get("price_current") is not None:
                prices[symbol] = info["price_current"]

        return prices
    except Exception as e:
        logger.error(f"Failed to load macro data: {e}")
        return {}


def get_latest_run() -> Optional[Dict]:
    if not RUNS_DIR.exists():
        return None

    run_files = list(RUNS_DIR.glob("*.json"))
    if not run_files:
        return None

    run_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    for run_file in run_files[:3]:
        try:
            with open(run_file, "r") as f:
                data = json.load(f)
            if "scores" in data:
                return data
        except:
            continue

    return None


def build_score_map(run_data: Dict) -> Dict[str, float]:
    score_map = {}
    for score in run_data.get("scores", []):
        symbol = score.get("symbol")
        total_score = score.get("total_score")
        if symbol and total_score is not None:
            score_map[symbol] = total_score
    return score_map


def convert_to_usd(value: float, currency: str) -> float:
    rate = FX_RATES_TO_USD.get(currency, 1.0)
    return value * rate


def calculate_position_value(
    position: Dict, macro_prices: Dict[str, float], score_map: Dict[str, float]
) -> Dict[str, Any]:
    symbol = position["symbol"]
    asset_type = position["asset_type"]
    quantity = position["quantity"]
    buy_price = position["buy_price"]
    currency = position["currency"]

    current_price = None
    total_score = None

    if asset_type == "equity":
        current_price = score_map.get(symbol)
        total_score = score_map.get(symbol)
    elif asset_type == "commodity":
        metal_info = PHYSICAL_METALS.get(symbol)
        if metal_info:
            price_ticker = metal_info["price_ticker"]
            current_price = macro_prices.get(price_ticker)

    if current_price is not None:
        price_usd = convert_to_usd(current_price, currency)
        value_usd = quantity * price_usd
    else:
        buy_price_usd = convert_to_usd(buy_price, currency)
        value_usd = quantity * buy_price_usd

    return {
        "symbol": symbol,
        "asset_type": asset_type,
        "value_usd": value_usd,
        "total_score": total_score,
    }


def calculate_portfolio_metrics(
    positions: List[Dict], macro_prices: Dict[str, float], score_map: Dict[str, float]
) -> Dict[str, Any]:
    total_value_usd = 0.0
    equity_value_usd = 0.0
    commodity_value_usd = 0.0
    equity_count = 0
    commodity_count = 0

    weighted_score_sum = 0.0
    scored_value_sum = 0.0

    for position in positions:
        pos_data = calculate_position_value(position, macro_prices, score_map)

        value_usd = pos_data["value_usd"]
        total_value_usd += value_usd

        if position["asset_type"] == "equity":
            equity_count += 1
            equity_value_usd += value_usd

            if pos_data["total_score"] is not None:
                weighted_score_sum += pos_data["total_score"] * value_usd
                scored_value_sum += value_usd
        else:
            commodity_count += 1
            commodity_value_usd += value_usd

    portfolio_score = None
    if scored_value_sum > 0:
        portfolio_score = weighted_score_sum / scored_value_sum

    return {
        "total_value_usd": round(total_value_usd, 2),
        "equity_value_usd": round(equity_value_usd, 2),
        "commodity_value_usd": round(commodity_value_usd, 2),
        "equity_count": equity_count,
        "commodity_count": commodity_count,
        "portfolio_score": round(portfolio_score, 2)
        if portfolio_score is not None
        else None,
    }


def save_snapshot(
    conn: sqlite3.Connection,
    snapshot_date: str,
    metrics: Dict[str, Any],
    user_id: str = USER_ID,
) -> int:
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    cursor = conn.execute(
        """
        INSERT OR REPLACE INTO portfolio_snapshots (
            user_id, snapshot_date, total_value_usd, equity_value_usd,
            commodity_value_usd, portfolio_score, equity_count, commodity_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            snapshot_date,
            metrics["total_value_usd"],
            metrics["equity_value_usd"],
            metrics["commodity_value_usd"],
            metrics["portfolio_score"],
            metrics["equity_count"],
            metrics["commodity_count"],
            now,
        ),
    )
    conn.commit()

    cursor = conn.execute(
        "SELECT id FROM portfolio_snapshots WHERE user_id = ? AND snapshot_date = ?",
        (user_id, snapshot_date),
    )
    row = cursor.fetchone()
    return row["id"] if row else 0


def main():
    if not DB_PATH.exists():
        logger.error(f"Database not found: {DB_PATH}")
        sys.exit(1)

    snapshot_date = datetime.now().strftime("%Y-%m-%d")
    logger.info(f"Generating portfolio snapshot for {snapshot_date}")

    conn = get_connection()

    try:
        positions = get_positions(conn)

        if not positions:
            logger.warning("No positions found in portfolio")
            return

        logger.info(f"Found {len(positions)} positions")

        macro_prices = load_macro_prices()
        logger.info(f"Loaded {len(macro_prices)} macro prices")

        run_data = get_latest_run()
        score_map = build_score_map(run_data) if run_data else {}
        logger.info(f"Loaded {len(score_map)} scores from latest run")

        metrics = calculate_portfolio_metrics(positions, macro_prices, score_map)

        logger.info(f"Portfolio metrics:")
        logger.info(f"  Total Value: ${metrics['total_value_usd']:,.2f}")
        logger.info(f"  Equity Value: ${metrics['equity_value_usd']:,.2f}")
        logger.info(f"  Commodity Value: ${metrics['commodity_value_usd']:,.2f}")
        logger.info(f"  Portfolio Score: {metrics['portfolio_score'] or 'N/A'}")
        logger.info(f"  Equity Count: {metrics['equity_count']}")
        logger.info(f"  Commodity Count: {metrics['commodity_count']}")

        snapshot_id = save_snapshot(conn, snapshot_date, metrics)
        logger.info(f"Saved snapshot with ID {snapshot_id}")

    finally:
        conn.close()

    logger.info("Snapshot generation complete")


if __name__ == "__main__":
    main()
