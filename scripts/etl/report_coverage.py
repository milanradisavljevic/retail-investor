#!/usr/bin/env python3
"""
Coverage Reporting Script
Reads data/market-data.db and reports coverage per universe
"""

import json
import sqlite3
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any


def load_universes(list_file: str) -> List[Dict[str, Any]]:
    """Load full universes list"""
    with open(list_file) as f:
        return json.load(f)


def get_db_coverage(db_path: str) -> Dict[str, Dict[str, int]]:
    """
    Query database for coverage statistics
    Returns: {symbol: {'prices': int, 'fundamentals': int, 'avg_metrics': int}}
    """
    db = sqlite3.connect(db_path)
    cursor = db.cursor()

    # Get unique symbols in prices table
    cursor.execute("SELECT DISTINCT symbol FROM prices")
    prices_symbols = {row[0] for row in cursor.fetchall()}

    # Get unique symbols in fundamentals table
    cursor.execute("SELECT DISTINCT symbol FROM fundamentals")
    fundamentals_symbols = {row[0] for row in cursor.fetchall()}

    # Get unique symbols in fundamentals_avg table
    cursor.execute("SELECT DISTINCT symbol FROM fundamentals_avg")
    avg_metrics_symbols = {row[0] for row in cursor.fetchall()}

    # Build coverage map
    coverage = {}
    all_symbols = (
        set(prices_symbols) | set(fundamentals_symbols) | set(avg_metrics_symbols)
    )

    for symbol in all_symbols:
        coverage[symbol] = {
            "prices": 1 if symbol in prices_symbols else 0,
            "fundamentals": 1 if symbol in fundamentals_symbols else 0,
            "avg_metrics": 1 if symbol in avg_metrics_symbols else 0,
        }

    db.close()
    return coverage


def load_universe_symbols(universe_file: str) -> List[str]:
    """Load symbols from a universe JSON file"""
    with open(universe_file) as f:
        data = json.load(f)
    return data.get("symbols", [])


def check_benchmark(db_path: str, benchmark: str, min_years: int = 3) -> Dict[str, Any]:
    """
    Check if benchmark has price data within last N years
    Returns: {'has_data': bool, 'row_count': int, 'latest_date': str | None}
    """
    db = sqlite3.connect(db_path)
    cursor = db.cursor()

    try:
        # Count rows for benchmark in last N years
        cutoff_date = datetime.now().year - min_years
        cursor.execute(
            """
            SELECT COUNT(*) as count, MAX(date) as latest
            FROM prices
            WHERE symbol = ?
              AND CAST(strftime('%Y', date) AS INTEGER) >= ?
        """,
            (benchmark, cutoff_date),
        )

        row = cursor.fetchone()
        row_count = row[0] if row else 0
        latest_date = row[1] if row else None

        return {
            "has_data": row_count > 0,
            "row_count": row_count,
            "latest_date": latest_date,
        }
    except Exception as e:
        return {"has_data": False, "row_count": 0, "latest_date": None, "error": str(e)}
    finally:
        db.close()


def generate_coverage_report(
    universes: List[Dict[str, Any]],
    db_coverage: Dict[str, Dict[str, int]],
    db_path: str,
) -> List[Dict[str, Any]]:
    """Generate coverage report for each universe"""

    report = []

    for universe in universes:
        # Load symbols from universe JSON file
        symbols = load_universe_symbols(universe["file"])
        universe_id = universe["id"]
        benchmark = universe.get("benchmark", "N/A")

        # Count coverage
        prices_count = sum(
            1 for s in symbols if db_coverage.get(s, {}).get("prices", 0)
        )
        fundamentals_count = sum(
            1 for s in symbols if db_coverage.get(s, {}).get("fundamentals", 0)
        )
        avg_metrics_count = sum(
            1 for s in symbols if db_coverage.get(s, {}).get("avg_metrics", 0)
        )

        total_symbols = len(symbols)

        # Calculate ratios
        prices_ratio = prices_count / total_symbols if total_symbols > 0 else 0
        fundamentals_ratio = (
            fundamentals_count / total_symbols if total_symbols > 0 else 0
        )
        avg_metrics_ratio = (
            avg_metrics_count / total_symbols if total_symbols > 0 else 0
        )

        # Check benchmark
        benchmark_info = check_benchmark(db_path, benchmark)

        universe_report = {
            "id": universe_id,
            "name": universe.get("name", "Unknown"),
            "symbols_count": total_symbols,
            "symbols_with_prices": prices_count,
            "symbols_with_fundamentals": fundamentals_count,
            "symbols_with_avgmetrics": avg_metrics_count,
            "prices_coverage_ratio": prices_ratio,
            "fundamentals_coverage_ratio": fundamentals_ratio,
            "avgmetrics_coverage_ratio": avg_metrics_ratio,
            "benchmark": benchmark,
            "benchmark_status": benchmark_info,
        }

        report.append(universe_report)

    return report


def format_markdown_report(report: List[Dict[str, Any]]) -> str:
    """Format report as markdown for human reading"""

    lines = [
        "# Universe Coverage Report",
        f"",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"",
        f"## Summary",
        f"",
    ]

    # Summary table
    lines.append(
        "| Universe | Total | Prices | Fundamentals | AvgMetrics | Benchmark |"
    )
    lines.append(
        "|----------|-------|--------|--------------|------------|-----------|"
    )

    for r in report:
        prices_pct = f"{r['prices_coverage_ratio']:.1%}"
        fund_pct = f"{r['fundamentals_coverage_ratio']:.1%}"
        avg_pct = f"{r['avgmetrics_coverage_ratio']:.1%}"
        bench_status = "✓" if r["benchmark_status"]["has_data"] else "✗"

        lines.append(
            f"| {r['name']:25s} | {r['symbols_count']:5d} | "
            f"{prices_pct:6s} | {fund_pct:6s} | {avg_pct:6s} | {bench_status:3s} |"
        )

    lines.append("")
    lines.append("## Details")
    lines.append("")

    # Detailed breakdown per universe
    for r in report:
        lines.append(f"### {r['name']}")
        lines.append("")
        lines.append(f"- **ID:** `{r['id']}`")
        lines.append(f"- **Total Symbols:** {r['symbols_count']}")
        lines.append(
            f"- **Prices:** {r['symbols_with_prices']} / {r['symbols_count']} ({r['prices_coverage_ratio']:.1%})"
        )
        lines.append(
            f"- **Fundamentals:** {r['symbols_with_fundamentals']} / {r['symbols_count']} ({r['fundamentals_coverage_ratio']:.1%})"
        )
        lines.append(
            f"- **AvgMetrics:** {r['symbols_with_avgmetrics']} / {r['symbols_count']} ({r['avgmetrics_coverage_ratio']:.1%})"
        )
        lines.append(f"- **Benchmark:** `{r['benchmark']}`")

        bench = r["benchmark_status"]
        if bench.get("has_data"):
            lines.append(
                f"  - ✓ Benchmark data available ({bench['row_count']} rows, latest: {bench['latest_date']})"
            )
        else:
            lines.append(
                f"  - ✗ Benchmark data missing (error: {bench.get('error', 'N/A')})"
            )

        lines.append("")

    return "\n".join(lines)


def main():
    # Configuration
    DB_PATH = "data/market-data.db"
    UNIVERSES_LIST = "docs/universes_full_list.json"
    OUTPUT_DIR = "data/audits"
    DOCS_DIR = "docs"

    # Check prerequisites
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        return 1

    if not os.path.exists(UNIVERSES_LIST):
        print(f"ERROR: Universes list not found at {UNIVERSES_LIST}")
        return 1

    # Create output directories
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(DOCS_DIR, exist_ok=True)

    print("Generating coverage report...")
    print(f"Database: {DB_PATH}")
    print(f"Universes: {UNIVERSES_LIST}")
    print("")

    # Load universes
    universes = load_universes(UNIVERSES_LIST)
    print(f"Loaded {len(universes)} universes")

    # Get database coverage
    print("Querying database coverage...")
    db_coverage = get_db_coverage(DB_PATH)
    print(f"Found coverage for {len(db_coverage)} symbols")

    # Generate report
    print("Generating report...")
    report = generate_coverage_report(universes, db_coverage, DB_PATH)

    # Save JSON report
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = os.path.join(OUTPUT_DIR, f"coverage-report-{timestamp}.json")
    with open(json_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"✓ Saved JSON report to {json_path}")

    # Save Markdown report
    md_path = os.path.join(DOCS_DIR, "coverage-report-latest.md")
    with open(md_path, "w") as f:
        f.write(format_markdown_report(report))
    print(f"✓ Saved Markdown report to {md_path}")

    # Print summary
    print("")
    print("=" * 80)
    print("COVERAGE SUMMARY")
    print("=" * 80)
    for r in report:
        print(
            f"{r['name']:30s} | Prices: {r['prices_coverage_ratio']:.1%} | Fundamentals: {r['fundamentals_coverage_ratio']:.1%} | AvgMetrics: {r['avgmetrics_coverage_ratio']:.1%}"
        )

    print("")
    print("✓ Coverage report generated successfully!")

    return 0


if __name__ == "__main__":
    exit(main())
