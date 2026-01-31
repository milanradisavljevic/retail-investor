#!/usr/bin/env python3
"""
Re-fetch Incomplete Historical Data

Intelligently re-fetches only symbols with incomplete data coverage.
Reads the audit report and fetches missing data for 2015-2025 period.

Usage:
    python scripts/backtesting/refetch-incomplete.py [--universe UNIVERSE] [--dry-run]

Examples:
    python scripts/backtesting/refetch-incomplete.py --universe nasdaq100
    python scripts/backtesting/refetch-incomplete.py --dry-run  # Show what would be fetched
"""

import json
import sys
import os
import argparse
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

def load_audit_report():
    """Load the most recent audit report"""
    audit_path = Path('data/audits/historical-data-audit.json')
    if not audit_path.exists():
        print("❌ No audit report found. Run: npx tsx scripts/audit/historical-data-audit.ts")
        sys.exit(1)

    with open(audit_path, 'r') as f:
        return json.load(f)

def get_symbols_to_refetch(audit_data, universe_filter=None):
    """Extract symbols that need re-fetching"""
    symbols_by_universe = {}

    for universe in audit_data:
        universe_id = universe['universe']

        # Skip if filtering by universe
        if universe_filter and universe_id != universe_filter:
            continue

        # Skip universes with excellent coverage
        if universe['coveragePercentage'] >= 99.0:
            continue

        # Collect missing and incomplete symbols
        symbols_to_fetch = []

        # Missing symbols (no CSV file)
        for symbol in universe['missingSymbols']:
            symbols_to_fetch.append({
                'symbol': symbol,
                'reason': 'missing',
                'priority': 'high'
            })

        # Incomplete symbols (insufficient data)
        for detail in universe['symbolDetails']:
            if not detail['exists']:
                continue

            # Check for critical issues
            has_critical_issue = False
            for issue in detail['issues']:
                if 'Insufficient data' in issue or 'Data starts late: 20' in issue:
                    has_critical_issue = True
                    break

            if has_critical_issue:
                symbols_to_fetch.append({
                    'symbol': detail['symbol'],
                    'reason': '; '.join(detail['issues']),
                    'priority': 'medium'
                })

        if symbols_to_fetch:
            symbols_by_universe[universe_id] = {
                'name': universe['universeName'],
                'symbols': symbols_to_fetch,
                'coverage': universe['coveragePercentage']
            }

    return symbols_by_universe

def print_refetch_plan(symbols_by_universe):
    """Print what will be re-fetched"""
    print("\n" + "="*60)
    print("RE-FETCH PLAN")
    print("="*60 + "\n")

    total_symbols = sum(len(data['symbols']) for data in symbols_by_universe.values())

    for universe_id, data in symbols_by_universe.items():
        print(f"\n📊 {data['name']} (Coverage: {data['coverage']:.1f}%)")
        print(f"   Symbols to re-fetch: {len(data['symbols'])}")

        # Show top 10 symbols
        for i, sym_data in enumerate(data['symbols'][:10]):
            priority_icon = "🔴" if sym_data['priority'] == 'high' else "🟡"
            print(f"   {priority_icon} {sym_data['symbol']}: {sym_data['reason']}")

        if len(data['symbols']) > 10:
            print(f"   ... and {len(data['symbols']) - 10} more")

    print(f"\n{'='*60}")
    print(f"Total symbols to re-fetch: {total_symbols}")
    print(f"{'='*60}\n")

def create_refetch_script(symbols_by_universe, output_file='refetch-symbols.txt'):
    """Create a file with symbols to re-fetch"""
    output_path = Path('data/audits') / output_file
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        for universe_id, data in symbols_by_universe.items():
            f.write(f"# {data['name']} ({universe_id})\n")
            f.write(f"# Coverage: {data['coverage']:.1f}%\n")
            f.write(f"# Symbols: {len(data['symbols'])}\n\n")

            for sym_data in data['symbols']:
                f.write(f"{sym_data['symbol']}\n")

            f.write("\n")

    return output_path

def execute_refetch(symbols_by_universe):
    """Execute the re-fetch using fetch-historical.py"""
    print("\n🚀 Starting re-fetch process...\n")

    from datetime import datetime
    import subprocess

    results = {}

    for universe_id, data in symbols_by_universe.items():
        print(f"\n{'='*60}")
        print(f"Fetching {data['name']} ({len(data['symbols'])} symbols)")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        try:
            # Call fetch-historical.py for this universe
            cmd = [
                'python3',
                'scripts/backtesting/fetch-historical.py',
                universe_id
            ]

            # Set environment variables for date range
            env = os.environ.copy()
            env['BACKTEST_START'] = '2015-01-01'
            env['BACKTEST_END'] = '2025-12-31'

            print(f"Running: {' '.join(cmd)}")
            print(f"Environment: BACKTEST_START=2015-01-01, BACKTEST_END=2025-12-31\n")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout per universe
                env=env
            )

            duration = (datetime.now() - start_time).total_seconds()

            if result.returncode == 0:
                results[universe_id] = {
                    'status': 'success',
                    'duration': duration,
                    'symbols': len(data['symbols'])
                }
                print(f"✅ Completed in {duration:.1f}s")
            else:
                results[universe_id] = {
                    'status': 'failed',
                    'error': result.stderr,
                    'duration': duration
                }
                print(f"❌ Failed after {duration:.1f}s")
                print(f"Error: {result.stderr}")

        except subprocess.TimeoutExpired:
            print(f"⏱️  Timeout after 10 minutes")
            results[universe_id] = {
                'status': 'timeout',
                'duration': 600
            }
        except Exception as e:
            print(f"❌ Error: {e}")
            results[universe_id] = {
                'status': 'error',
                'error': str(e)
            }

    # Print summary
    print(f"\n{'='*60}")
    print("RE-FETCH SUMMARY")
    print(f"{'='*60}\n")

    total_time = sum(r.get('duration', 0) for r in results.values())
    successful = sum(1 for r in results.values() if r.get('status') == 'success')

    for universe_id, result in results.items():
        status_icon = "✅" if result.get('status') == 'success' else "❌"
        print(f"{status_icon} {universe_id}: {result.get('status', 'unknown')}")

    print(f"\nSuccessful: {successful}/{len(results)}")
    print(f"Total time: {total_time:.1f}s ({total_time/60:.1f} minutes)")

    return results

def main():
    parser = argparse.ArgumentParser(description='Re-fetch incomplete historical data')
    parser.add_argument('--universe', type=str, help='Only re-fetch specific universe')
    parser.add_argument('--dry-run', action='store_true', help='Show plan without executing')
    parser.add_argument('--save-list', action='store_true', help='Save symbol list to file')

    args = parser.parse_args()

    # Load audit report
    print("📊 Loading audit report...")
    audit_data = load_audit_report()

    # Get symbols to re-fetch
    symbols_by_universe = get_symbols_to_refetch(audit_data, args.universe)

    if not symbols_by_universe:
        print("\n✅ All universes have excellent coverage! No re-fetch needed.")
        return

    # Print plan
    print_refetch_plan(symbols_by_universe)

    # Save list if requested
    if args.save_list:
        output_file = create_refetch_script(symbols_by_universe)
        print(f"\n💾 Symbol list saved to: {output_file}")

    # Execute if not dry-run
    if args.dry_run:
        print("\n🔍 DRY RUN - No data will be fetched.")
        print("\nTo execute, run without --dry-run flag:")
        print("  python scripts/backtesting/refetch-incomplete.py")
    else:
        # Ask for confirmation
        response = input("\n⚠️  Proceed with re-fetch? This may take several minutes. [y/N]: ")
        if response.lower() != 'y':
            print("\n❌ Aborted by user")
            return

        # Execute
        results = execute_refetch(symbols_by_universe)

        # Suggest running audit again
        print("\n💡 Recommendation: Run audit again to verify:")
        print("   npx tsx scripts/audit/historical-data-audit.ts")

if __name__ == '__main__':
    main()
