#!/usr/bin/env python3
"""
Daily market-data ETL
---------------------
Fetches fundamentals and OHLCV history for an entire universe once per day
and stores them in SQLite for fast, offline backtesting.

Usage:
    python scripts/etl/daily_data_pipeline.py --universe russell2000_full
    python scripts/etl/daily_data_pipeline.py --universe-file config/universes/sp500-full.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import time
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "data" / "market-data.db"
DEFAULT_SCHEMA = ROOT / "data" / "market-data-schema.sql"
DEFAULT_UNIVERSE = ROOT / "config" / "universes" / "russell2000_full.json"

logger = logging.getLogger("etl.daily_data_pipeline")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Daily market-data ETL into SQLite")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--universe", help="Universe name (resolved in config/universes/<name>.json)")
    group.add_argument("--universe-file", help="Explicit path to universe JSON file")
    parser.add_argument("--db-path", default=str(DEFAULT_DB), help="Target SQLite DB path")
    parser.add_argument("--schema", default=str(DEFAULT_SCHEMA), help="Schema SQL file")
    parser.add_argument("--start", default="2014-01-01", help="History start date (YYYY-MM-DD)")
    parser.add_argument("--end", default=None, help="History end date (YYYY-MM-DD); defaults to today")
    parser.add_argument("--max-symbols", type=int, default=None, help="Limit number of symbols (debugging)")
    parser.add_argument("--sleep", type=float, default=0.25, help="Delay between symbols to stay polite")
    return parser.parse_args()


def load_symbols(universe: Optional[str], universe_file: Optional[str]) -> Sequence[str]:
    if universe_file:
        path = Path(universe_file)
    else:
        name = universe or DEFAULT_UNIVERSE.stem
        path = ROOT / "config" / "universes" / f"{name}.json"

    if not path.exists():
        raise FileNotFoundError(f"Universe file not found: {path}")

    with path.open("r") as f:
        data = json.load(f)

    symbols = data.get("symbols") or data
    return [str(sym).upper() for sym in symbols]


def ensure_parent(path: Path) -> None:
    if not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


class DailyDataPipeline:
    def __init__(self, db_path: Path, schema_path: Path) -> None:
        self.db_path = db_path
        ensure_parent(db_path)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.execute("PRAGMA journal_mode = WAL;")
        self.conn.execute("PRAGMA synchronous = NORMAL;")
        self.cursor = self.conn.cursor()
        self._apply_schema(schema_path)

    def _apply_schema(self, schema_path: Path) -> None:
        with schema_path.open("r") as f:
            schema_sql = f.read()
        self.conn.executescript(schema_sql)
        logger.info("Schema ensured at %s", schema_path)

    def close(self) -> None:
        self.conn.commit()
        self.conn.close()

    # ---- Fetchers -----------------------------------------------------------------
    def fetch_fundamentals(self, symbol: str) -> Optional[dict]:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.get_info()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Fundamentals fetch failed for %s: %s", symbol, exc)
            return None

        def pct(value: Optional[float]) -> Optional[float]:
            if value is None:
                return None
            try:
                return float(value) * 100
            except Exception:  # noqa: BLE001
                return None

        fundamentals = {
            "symbol": symbol,
            "date": date.today().isoformat(),
            "pe": info.get("trailingPE"),
            "pb": info.get("priceToBook"),
            "ps": info.get("priceToSalesTrailing12Months"),
            "peg": info.get("pegRatio"),
            "ev_ebitda": info.get("enterpriseToEbitda"),
            "roe": pct(info.get("returnOnEquity")),
            "roic": pct(info.get("returnOnAssets")),  # approximation
            "gross_margin": pct(info.get("grossMargins")),
            "operating_margin": pct(info.get("operatingMargins")),
            "debt_equity": info.get("debtToEquity"),
            "current_ratio": info.get("currentRatio"),
            "market_cap": info.get("marketCap"),
        }

        total_fields = len(fundamentals) - 2  # exclude symbol/date
        available = sum(
            1 for key, value in fundamentals.items() if key not in {"symbol", "date"} and value not in (None, 0)
        )
        fundamentals["data_completeness"] = round(available / total_fields * 100, 2) if total_fields else None
        return fundamentals

    def fetch_prices(self, symbol: str, start: str, end: Optional[str]) -> pd.DataFrame:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=start, end=end or None, auto_adjust=False)
        if hist.empty:
            return hist
        hist.index = hist.index.tz_localize(None)
        hist["Date"] = hist.index.date
        return hist

    def compute_technicals(self, hist: pd.DataFrame, symbol: str) -> Optional[dict]:
        if hist.empty:
            return None
        closes = hist["Close"].astype(float)
        returns = closes.pct_change().dropna()
        volatility = float(returns.std() * (252 ** 0.5)) if not returns.empty else None
        sharpe = float((returns.mean() / returns.std()) * (252 ** 0.5)) if returns.std() else None

        def pct(start_idx: int) -> Optional[float]:
            if len(closes) <= start_idx:
                return None
            base = closes.iloc[-start_idx - 1]
            return float((closes.iloc[-1] - base) / base) if base else None

        ma_50 = float(closes.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else None
        ma_200 = float(closes.rolling(200).mean().iloc[-1]) if len(closes) >= 200 else None

        return {
            "symbol": symbol,
            "date": closes.index[-1].date().isoformat(),
            "beta": None,  # beta requires benchmark; optional future work
            "volatility": volatility,
            "sharpe_ratio": sharpe,
            "return_13w": pct(65),
            "return_26w": pct(130),
            "return_52w": pct(252),
            "ma_50": ma_50,
            "ma_200": ma_200,
        }

    def fetch_metadata(self, symbol: str) -> Optional[dict]:
        try:
            info = yf.Ticker(symbol).get_info()
        except Exception as exc:  # noqa: BLE001
            logger.debug("Metadata fetch failed for %s: %s", symbol, exc)
            return None
        return {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "country": info.get("country"),
            "exchange": info.get("exchange"),
            "currency": info.get("currency"),
        }

    def fetch_avg_metrics_batch(self, symbols: Sequence[str]) -> List[dict]:
        """Fetch avgMetrics in batches to avoid YFinance timeouts."""
        batch_size = 50
        all_metrics = []

        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            logger.info("Fetching avgMetrics batch %d-%d of %d", i + 1, i + len(batch), len(symbols))

            for symbol in batch:
                try:
                    ticker = yf.Ticker(symbol)
                    info = ticker.get_info()

                    def pct(value: Optional[float]) -> Optional[float]:
                        if value is None:
                            return None
                        try:
                            return float(value) * 100
                        except Exception:  # noqa: BLE001
                            return None

                    metrics = {
                        "symbol": symbol,
                        "roe": pct(info.get("returnOnEquity")),
                        "roic": pct(info.get("returnOnAssets")),  # Using ROA as ROIC proxy
                        "pe": info.get("trailingPE"),
                        "pb": info.get("priceToBook"),
                        "fetched_at": int(time.time()),
                    }

                    # Only add if at least one metric is available
                    if any(metrics[k] is not None for k in ["roe", "roic", "pe", "pb"]):
                        all_metrics.append(metrics)
                    else:
                        logger.debug("No avgMetrics available for %s", symbol)

                except Exception as exc:  # noqa: BLE001
                    logger.warning("avgMetrics fetch failed for %s: %s", symbol, exc)
                    continue

            # Small delay between batches to be polite to YFinance
            if i + batch_size < len(symbols):
                time.sleep(0.5)

        return all_metrics

    # ---- Upserts ------------------------------------------------------------------
    def upsert_fundamentals(self, rows: Iterable[dict]) -> None:
        self.cursor.executemany(
            """
            INSERT OR REPLACE INTO fundamentals (
              symbol, date, pe, pb, ps, peg, ev_ebitda,
              roe, roic, gross_margin, operating_margin,
              debt_equity, current_ratio, market_cap,
              data_completeness
            ) VALUES (
              :symbol, :date, :pe, :pb, :ps, :peg, :ev_ebitda,
              :roe, :roic, :gross_margin, :operating_margin,
              :debt_equity, :current_ratio, :market_cap,
              :data_completeness
            )
            """,
            rows,
        )

    def upsert_prices(self, rows: Iterable[dict]) -> None:
        self.cursor.executemany(
            """
            INSERT OR REPLACE INTO prices (
              symbol, date, open, high, low, close, volume, adjusted_close
            ) VALUES (
              :symbol, :date, :open, :high, :low, :close, :volume, :adjusted_close
            )
            """,
            rows,
        )

    def upsert_technicals(self, rows: Iterable[dict]) -> None:
        self.cursor.executemany(
            """
            INSERT OR REPLACE INTO technical_indicators (
              symbol, date, beta, volatility, sharpe_ratio,
              return_13w, return_26w, return_52w, ma_50, ma_200
            ) VALUES (
              :symbol, :date, :beta, :volatility, :sharpe_ratio,
              :return_13w, :return_26w, :return_52w, :ma_50, :ma_200
            )
            """,
            rows,
        )

    def upsert_metadata(self, rows: Iterable[dict]) -> None:
        self.cursor.executemany(
            """
            INSERT OR REPLACE INTO metadata (
              symbol, name, sector, industry, country, exchange, currency
            ) VALUES (
              :symbol, :name, :sector, :industry, :country, :exchange, :currency
            )
            """,
            rows,
        )

    def upsert_avg_metrics(self, rows: Iterable[dict]) -> None:
        self.cursor.executemany(
            """
            INSERT OR REPLACE INTO fundamentals_avg (
              symbol, roe, roic, pe, pb, fetched_at
            ) VALUES (
              :symbol, :roe, :roic, :pe, :pb, :fetched_at
            )
            """,
            rows,
        )

    # ---- Pipeline -----------------------------------------------------------------
    def run(self, symbols: Sequence[str], start: str, end: Optional[str], sleep: float) -> None:
        start_time = time.time()
        fundamentals_batch: List[dict] = []
        technicals_batch: List[dict] = []
        metadata_batch: List[dict] = []

        for idx, symbol in enumerate(symbols, 1):
            logger.info("(%s/%s) Processing %s", idx, len(symbols), symbol)

            hist = self.fetch_prices(symbol, start, end)
            if not hist.empty:
                price_rows = [
                    {
                        "symbol": symbol,
                        "date": d.isoformat(),
                        "open": float(row["Open"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "close": float(row["Close"]),
                        "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else None,
                        "adjusted_close": float(row.get("Adj Close", row["Close"])),
                    }
                    for d, row in hist.iterrows()
                ]
                self.upsert_prices(price_rows)

                tech = self.compute_technicals(hist, symbol)
                if tech:
                    technicals_batch.append(tech)

            fundamentals = self.fetch_fundamentals(symbol)
            if fundamentals:
                fundamentals_batch.append(fundamentals)

            meta = self.fetch_metadata(symbol)
            if meta:
                metadata_batch.append(meta)

            if idx % 25 == 0:
                self._flush_batches(fundamentals_batch, technicals_batch, metadata_batch)
            time.sleep(sleep)

        self._flush_batches(fundamentals_batch, technicals_batch, metadata_batch)

        # IMPORTANT: Fetch avgMetrics in batch mode AFTER individual symbol processing
        logger.info("Fetching avgMetrics for %d symbols (batch mode)", len(symbols))
        avg_metrics_batch = self.fetch_avg_metrics_batch(symbols)
        if avg_metrics_batch:
            self.upsert_avg_metrics(avg_metrics_batch)
            self.conn.commit()

            # Log coverage stats
            complete_count = sum(
                1 for m in avg_metrics_batch
                if all(m.get(k) is not None for k in ["roe", "roic", "pe", "pb"])
            )
            logger.info(
                "avgMetrics coverage: %d/%d symbols (%.1f%% complete with all 4 metrics)",
                complete_count, len(avg_metrics_batch),
                100 * complete_count / len(avg_metrics_batch) if avg_metrics_batch else 0
            )

        elapsed = time.time() - start_time
        logger.info("ETL finished in %.1f minutes", elapsed / 60)

    def _flush_batches(
        self,
        fundamentals_batch: List[dict],
        technicals_batch: List[dict],
        metadata_batch: List[dict],
    ) -> None:
        if fundamentals_batch:
            self.upsert_fundamentals(fundamentals_batch)
            fundamentals_batch.clear()
        if technicals_batch:
            self.upsert_technicals(technicals_batch)
            technicals_batch.clear()
        if metadata_batch:
            self.upsert_metadata(metadata_batch)
            metadata_batch.clear()
        self.conn.commit()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    symbols = load_symbols(args.universe, args.universe_file)
    if args.max_symbols:
        symbols = symbols[: args.max_symbols]
    end_date = args.end or date.today().isoformat()

    pipeline = DailyDataPipeline(Path(args.db_path), Path(args.schema))
    try:
        pipeline.run(symbols, args.start, end_date, args.sleep)
    finally:
        pipeline.close()


if __name__ == "__main__":
    main()
