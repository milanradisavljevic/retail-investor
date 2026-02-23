#!/usr/bin/env python3
"""
EU Fundamentals Coverage Test
Tests yfinance fundamentals coverage for 100 EU symbols (25 per universe)
"""

import yfinance as yf
import json
from datetime import datetime
from pathlib import Path

# Sample symbols from each EU universe (25 each = 100 total)
SAMPLE_SYMBOLS = {
    "DAX 40": [
        "SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "MBG.DE",
        "MUV2.DE", "ADS.DE", "BAS.DE", "BAYN.DE", "BMW.DE",
        "DBK.DE", "VNA.DE", "IFX.DE", "HEI.DE", "RWE.DE",
        "BEI.DE", "FRE.DE", "HEN3.DE", "MRK.DE", "SHL.DE",
        "DHL.DE", "EON.DE", "FME.DE", "MTX.DE", "SY1.DE"
    ],
    "CAC 40": [
        "AC.PA", "AIR.PA", "AI.PA", "MT.PA", "ATO.PA",
        "CS.PA", "BNP.PA", "BOL.PA", "BVI.PA", "CAP.PA",
        "CA.PA", "CHD.PA", "SGO.PA", "CSA.PA", "BN.PA",
        "DAST.PA", "ENGI.PA", "EL.PA", "EPA.PA", "RMS.PA",
        "ICO.PA", "KER.PA", "LR.PA", "ORA.PA", "MC.PA"
    ],
    "FTSE 100": [
        "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L",
        "BHP.L", "GSK.L", "RIO.L", "AAL.L", "BARC.L",
        "BLND.L", "BT.A.L", "BA.L", "BATS.L", "CPG.L",
        "CNA.L", "CRH.L", "CCH.L", "DCC.L", "DGE.L",
        "ENT.L", "EXPN.L", "FERG.L", "FLTR.L", "FRAS.L"
    ],
    "EURO STOXX 50": [
        "SAN.MC", "TEF.MC", "REP.MC", "BBVA.MC", "ACS.MC",
        "AIR.PA", "BNP.PA", "CS.PA", "MC.PA", "OR.PA",
        "ALV.DE", "BAS.DE", "BAYN.DE", "BMW.DE", "DTE.DE",
        "ADS.DE", "SAP.DE", "SIE.DE", "NESN.SW", "NOVN.SW",
        "ROG.SW", "UBSG.SW", "ZURN.SW", "ABBN.SW", "TTE.PA"
    ]
}

# Key fundamental metrics to check
KEY_METRICS = [
    # Valuation
    "trailingPE", "forwardPE", "priceToBook", "pegRatio", "enterpriseToEbitda",
    "enterpriseToRevenue", "priceToSalesTrailing12Months",
    # Profitability
    "profitMargins", "operatingMargins", "grossMargins",
    "returnOnAssets", "returnOnEquity",
    # Financial Health
    "debtToEquity", "currentRatio", "quickRatio",
    # Growth
    "revenueGrowth", "earningsGrowth",
    # Per Share
    "earningsPerShare", "bookValue", "revenuePerShare",
    # Cash Flow
    "freeCashflow", "operatingCashflow",
    # Dividends
    "dividendYield", "payoutRatio",
    # Other
    "beta", "marketCap", "enterpriseValue"
]

def fetch_symbol_data(symbol: str) -> dict:
    """Fetch all available info for a symbol"""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        return {"symbol": symbol, "info": info, "error": None}
    except Exception as e:
        return {"symbol": symbol, "info": {}, "error": str(e)}

def check_coverage(symbol_data: dict) -> dict:
    """Check which metrics are available"""
    info = symbol_data.get("info", {})
    result = {
        "symbol": symbol_data["symbol"],
        "error": symbol_data.get("error"),
        "available": [],
        "missing": [],
        "coverage_rate": 0.0
    }
    
    if symbol_data["error"]:
        result["coverage_rate"] = 0.0
        return result
    
    for metric in KEY_METRICS:
        value = info.get(metric)
        if value is not None and value != "":
            result["available"].append(metric)
        else:
            result["missing"].append(metric)
    
    if len(KEY_METRICS) > 0:
        result["coverage_rate"] = len(result["available"]) / len(KEY_METRICS) * 100
    
    return result

def main():
    print("=" * 60)
    print("EU FUNDAMENTALS COVERAGE TEST")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Total symbols: {sum(len(symbols) for symbols in SAMPLE_SYMBOLS.values())}")
    print(f"Metrics checked: {len(KEY_METRICS)}")
    print("=" * 60)
    
    all_results = []
    universe_summaries = {}
    
    for universe_name, symbols in SAMPLE_SYMBOLS.items():
        print(f"\n📊 Testing {universe_name} ({len(symbols)} symbols)...")
        universe_results = []
        
        for symbol in symbols:
            print(f"  Fetching {symbol}...", end=" ")
            data = fetch_symbol_data(symbol)
            coverage = check_coverage(data)
            universe_results.append(coverage)
            all_results.append(coverage)
            print(f"✓ {coverage['coverage_rate']:.1f}%")
        
        # Calculate universe summary
        avg_coverage = sum(r["coverage_rate"] for r in universe_results) / len(universe_results)
        symbols_with_error = sum(1 for r in universe_results if r["error"])
        symbols_high_coverage = sum(1 for r in universe_results if r["coverage_rate"] >= 80)
        symbols_low_coverage = sum(1 for r in universe_results if r["coverage_rate"] < 50)
        
        # Find most missing metrics
        all_missing = []
        for r in universe_results:
            all_missing.extend(r["missing"])
        
        from collections import Counter
        missing_counts = Counter(all_missing)
        most_missing = missing_counts.most_common(10)
        
        universe_summaries[universe_name] = {
            "symbol_count": len(symbols),
            "avg_coverage": avg_coverage,
            "symbols_with_error": symbols_with_error,
            "symbols_high_coverage": symbols_high_coverage,
            "symbols_low_coverage": symbols_low_coverage,
            "most_missing_metrics": most_missing
        }
        
        print(f"\n  📈 {universe_name} Summary:")
        print(f"     Avg Coverage: {avg_coverage:.1f}%")
        print(f"     High Coverage (≥80%): {symbols_high_coverage}/{len(symbols)}")
        print(f"     Low Coverage (<50%): {symbols_low_coverage}/{len(symbols)}")
        print(f"     Errors: {symbols_with_error}")
        print(f"     Most Missing: {[m[0] for m in most_missing[:5]]}")
    
    # Overall summary
    print("\n" + "=" * 60)
    print("OVERALL SUMMARY")
    print("=" * 60)
    
    total_symbols = len(all_results)
    overall_avg_coverage = sum(r["coverage_rate"] for r in all_results) / total_symbols
    total_errors = sum(1 for r in all_results if r["error"])
    symbols_very_high = sum(1 for r in all_results if r["coverage_rate"] >= 90)
    symbols_high = sum(1 for r in all_results if 80 <= r["coverage_rate"] < 90)
    symbols_medium = sum(1 for r in all_results if 50 <= r["coverage_rate"] < 80)
    symbols_low = sum(1 for r in all_results if r["coverage_rate"] < 50)
    
    print(f"Total Symbols Tested: {total_symbols}")
    print(f"Overall Avg Coverage: {overall_avg_coverage:.1f}%")
    print(f"Coverage ≥90%: {symbols_very_high} ({symbols_very_high/total_symbols*100:.1f}%)")
    print(f"Coverage 80-89%: {symbols_high} ({symbols_high/total_symbols*100:.1f}%)")
    print(f"Coverage 50-79%: {symbols_medium} ({symbols_medium/total_symbols*100:.1f}%)")
    print(f"Coverage <50%: {symbols_low} ({symbols_low/total_symbols*100:.1f}%)")
    print(f"Fetch Errors: {total_errors}")
    
    # Most missing metrics overall
    all_missing = []
    for r in all_results:
        all_missing.extend(r["missing"])
    
    missing_counts = Counter(all_missing)
    most_missing_overall = missing_counts.most_common(10)
    
    print("\nMost Missing Metrics (across all EU symbols):")
    for metric, count in most_missing_overall:
        pct = count / total_symbols * 100
        print(f"  - {metric}: {count}/{total_symbols} ({pct:.1f}%)")
    
    # Problematic symbols
    print("\nProblematic Symbols (Coverage <50%):")
    problematic = [r for r in all_results if r["coverage_rate"] < 50 or r["error"]]
    for r in sorted(problematic, key=lambda x: x["coverage_rate"]):
        error_str = f" (ERROR: {r['error']})" if r["error"] else ""
        print(f"  - {r['symbol']}: {r['coverage_rate']:.1f}%{error_str}")
    
    # Save results to JSON
    output_dir = Path("data/coverage_tests")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_file = output_dir / f"eu_coverage_{timestamp}.json"
    
    output_data = {
        "timestamp": datetime.now().isoformat(),
        "total_symbols": total_symbols,
        "overall_avg_coverage": overall_avg_coverage,
        "universe_summaries": universe_summaries,
        "symbol_results": all_results,
        "most_missing_metrics": most_missing_overall,
        "problematic_symbols": [r["symbol"] for r in problematic]
    }
    
    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n💾 Results saved to: {output_file}")
    print("=" * 60)

if __name__ == "__main__":
    main()
