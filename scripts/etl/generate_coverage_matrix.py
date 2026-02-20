#!/usr/bin/env python3
"""
Generate strategy-aware coverage matrix from SEC bulk audit outputs.
"""

import json
import csv
from datetime import datetime
from pathlib import Path
from collections import defaultdict


RAW_FIELD_MAPPING = {
    "revenue": "revenue_ttm",
    "net_income": "net_income_ttm",
    "total_assets": "total_assets",
    "stockholders_equity": "total_equity",
    "total_debt": "debt_total",
    "gross_profit": "gross_profit_ttm",
    "operating_cash_flow": "operating_cf_ttm",
    "capex": "capex_ttm",
    "current_assets": "current_assets",
    "current_liabilities": "current_liabilities",
    "shares_outstanding": "shares_outstanding",
}

DERIVED_FIELD_MAPPING = {
    "roe": "roe",
    "roa": "roa",
    "debt_to_equity": "debt_to_equity",
    "gross_margin": "gross_margin",
    "fcf": "fcf_ttm",
    "fcf_yield": "fcf_yield",
    "current_ratio": "current_ratio",
    "ebitda": "ebitda",
}

STRATEGY_REQUIREMENTS = {
    "Quality Pillar (ROE+ROA+D/E+GM)": ["roe", "roa", "debt_to_equity", "gross_margin"],
    "Valuation Core (Rev+NI+Equity+Debt)": [
        "revenue",
        "net_income",
        "stockholders_equity",
        "total_debt",
    ],
    "FCF Analysis (OCF+CapEx+FCF)": ["operating_cash_flow", "capex", "fcf"],
    "Liquidity (Current Ratio)": [
        "current_assets",
        "current_liabilities",
        "current_ratio",
    ],
    "Piotroski-9 Ready": [
        "net_income",
        "total_assets",
        "stockholders_equity",
        "total_debt",
        "revenue",
        "gross_profit",
        "operating_cash_flow",
        "current_assets",
        "current_liabilities",
        "shares_outstanding",
    ],
}

ALL_RAW_METRICS = list(RAW_FIELD_MAPPING.keys())
ALL_DERIVED_METRICS = list(DERIVED_FIELD_MAPPING.keys())


def find_latest_audit(audits_dir: Path) -> Path | None:
    audit_files = list(audits_dir.glob("sec_edgar_bulk_audit_*.json"))
    if not audit_files:
        return None
    return sorted(audit_files, key=lambda p: p.name, reverse=True)[0]


def load_audit_report(audit_path: Path) -> dict:
    return json.loads(audit_path.read_text(encoding="utf-8"))


def compute_coverage_matrix(report: dict) -> dict:
    per_ticker = report.get("per_ticker", [])
    processed = report.get("summary", {}).get("processed", 0)
    skipped = report.get("summary", {}).get("skipped", 0)
    skipped_breakdown = report.get("summary", {}).get("skipped_breakdown", {})

    raw_counts = defaultdict(int)
    derived_counts = defaultdict(int)
    missing_tickers = defaultdict(list)

    for item in per_ticker:
        ticker = item.get("ticker", "UNKNOWN")
        status = item.get("status", "unknown")

        if status != "processed":
            reason = item.get("reason", "unknown")
            missing_tickers[f"skipped_{reason}"].append(ticker)
            continue

        found_fields = item.get("found_fields", [])
        for field in found_fields:
            raw_counts[field] += 1

        derived_metrics = item.get("derived_metrics", {})
        derived_present = item.get("derived_metrics_present", [])
        for field in derived_present:
            derived_counts[field] += 1

        for field in ALL_RAW_METRICS:
            if field not in found_fields:
                missing_tickers[f"raw_{field}"].append(ticker)

        for field in ALL_DERIVED_METRICS:
            if field not in derived_present:
                missing_tickers[f"derived_{field}"].append(ticker)

    strategy_coverage = {}
    for strategy_name, required_fields in STRATEGY_REQUIREMENTS.items():
        present_count = 0
        for item in per_ticker:
            if item.get("status") != "processed":
                continue
            found_fields = set(item.get("found_fields", []))
            derived_present = set(item.get("derived_metrics_present", []))
            all_present = found_fields | derived_present

            if all(f in all_present for f in required_fields):
                present_count += 1

        coverage_pct = (
            round((present_count / processed * 100), 2) if processed > 0 else 0.0
        )
        strategy_coverage[strategy_name] = {
            "pct": coverage_pct,
            "present": present_count,
            "total": processed,
        }

    raw_matrix = {}
    for raw_field in ALL_RAW_METRICS:
        count = raw_counts.get(raw_field, 0)
        pct = round((count / processed * 100), 2) if processed > 0 else 0.0
        display_name = RAW_FIELD_MAPPING.get(raw_field, raw_field)
        top_missing = missing_tickers.get(f"raw_{raw_field}", [])[:10]
        raw_matrix[display_name] = {
            "pct": pct,
            "present": count,
            "total": processed,
            "top_missing": top_missing,
        }

    derived_matrix = {}
    for derived_field in ALL_DERIVED_METRICS:
        count = derived_counts.get(derived_field, 0)
        pct = round((count / processed * 100), 2) if processed > 0 else 0.0
        display_name = DERIVED_FIELD_MAPPING.get(derived_field, derived_field)
        top_missing = missing_tickers.get(f"derived_{derived_field}", [])[:10]
        derived_matrix[display_name] = {
            "pct": pct,
            "present": count,
            "total": processed,
            "top_missing": top_missing,
        }

    return {
        "meta": {
            "audit_file": str(
                report.get("inputs", {}).get("companyfacts_dir", "unknown")
            ),
            "processed": processed,
            "skipped": skipped,
            "skipped_breakdown": skipped_breakdown,
            "timestamp": report.get("timestamp_utc", "unknown"),
        },
        "raw_metrics": raw_matrix,
        "derived_metrics": derived_matrix,
        "strategy_coverage": strategy_coverage,
    }


def generate_markdown(matrix: dict) -> str:
    lines = []
    lines.append("# SEC EDGAR Bulk Coverage Matrix\n")
    lines.append(f"Generated: {datetime.now().isoformat()}\n")

    meta = matrix["meta"]
    lines.append("## Summary\n")
    lines.append(f"- **Processed:** {meta['processed']}")
    lines.append(f"- **Skipped:** {meta['skipped']}")
    if meta["skipped_breakdown"]:
        for reason, count in meta["skipped_breakdown"].items():
            lines.append(f"  - {reason}: {count}")
    lines.append(f"- **Source:** {meta['audit_file']}\n")

    lines.append("## Strategy Coverage\n")
    lines.append("| Strategy | Coverage % | Present / Total |")
    lines.append("|----------|------------|-----------------|")
    for strategy, data in matrix["strategy_coverage"].items():
        lines.append(
            f"| {strategy} | {data['pct']}% | {data['present']} / {data['total']} |"
        )
    lines.append("")

    lines.append("## Raw Metrics Coverage\n")
    lines.append("| Metric | Coverage % | Present / Total | Top Missing |")
    lines.append("|--------|------------|-----------------|-------------|")
    for metric, data in matrix["raw_metrics"].items():
        missing = ", ".join(data["top_missing"][:5]) if data["top_missing"] else "-"
        lines.append(
            f"| {metric} | {data['pct']}% | {data['present']} / {data['total']} | {missing} |"
        )
    lines.append("")

    lines.append("## Derived Metrics Coverage\n")
    lines.append("| Metric | Coverage % | Present / Total | Top Missing |")
    lines.append("|--------|------------|-----------------|-------------|")
    for metric, data in matrix["derived_metrics"].items():
        missing = ", ".join(data["top_missing"][:5]) if data["top_missing"] else "-"
        lines.append(
            f"| {metric} | {data['pct']}% | {data['present']} / {data['total']} | {missing} |"
        )
    lines.append("")

    return "\n".join(lines)


def generate_csv(matrix: dict) -> str:
    rows = []
    rows.append(
        ["Category", "Metric", "Coverage_%", "Present", "Total", "Top_5_Missing"]
    )

    for metric, data in matrix["raw_metrics"].items():
        missing = "; ".join(data["top_missing"][:5]) if data["top_missing"] else ""
        rows.append(
            ["Raw", metric, data["pct"], data["present"], data["total"], missing]
        )

    for metric, data in matrix["derived_metrics"].items():
        missing = "; ".join(data["top_missing"][:5]) if data["top_missing"] else ""
        rows.append(
            ["Derived", metric, data["pct"], data["present"], data["total"], missing]
        )

    for strategy, data in matrix["strategy_coverage"].items():
        rows.append(
            ["Strategy", strategy, data["pct"], data["present"], data["total"], ""]
        )

    output = []
    for row in rows:
        output.append(",".join(str(cell) for cell in row))
    return "\n".join(output)


def main():
    repo_root = Path(__file__).parent.parent.parent
    audits_dir = repo_root / "data" / "audits"
    logs_dir = repo_root / "logs"
    logs_dir.mkdir(exist_ok=True)

    latest_audit = find_latest_audit(audits_dir)
    if not latest_audit:
        print("ERROR: No sec_edgar_bulk_audit_*.json files found")
        return 1

    print(f"Reading: {latest_audit}")
    report = load_audit_report(latest_audit)

    matrix = compute_coverage_matrix(report)

    md_content = generate_markdown(matrix)
    md_path = logs_dir / "coverage_matrix_sec_bulk.md"
    md_path.write_text(md_content, encoding="utf-8")
    print(f"Written: {md_path}")

    csv_content = generate_csv(matrix)
    csv_path = logs_dir / "coverage_matrix_sec_bulk.csv"
    csv_path.write_text(csv_content, encoding="utf-8")
    print(f"Written: {csv_path}")

    print("\n=== SUMMARY ===")
    print(f"Processed: {matrix['meta']['processed']}")
    print(f"Skipped: {matrix['meta']['skipped']}")
    print("\n=== STRATEGY COVERAGE ===")
    for strategy, data in matrix["strategy_coverage"].items():
        print(f"  {strategy}: {data['pct']}%")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
