#!/usr/bin/env python3
"""
FRED Data Fetcher

Fetches 5 FRED time series and stores them in the macro_indicators table.
"""
import argparse
import json
import logging
import os
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional
import requests
from dateutil.parser import parse as parse_date

# Load environment variables from .env files
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # If python-dotenv is not installed, manually load from .env files
    import pathlib
    
    # Check for the specific file mentioned by user
    env_path = pathlib.Path('.') / 'process.env.FRED_API_KEY'
    if not env_path.exists():
        env_path = pathlib.Path('.') / '.env'
    if not env_path.exists():
        env_path = pathlib.Path('.') / '.env.local'
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Define the FRED series we want to fetch
FRED_SERIES = {
    'DGS10': '10-Year Treasury Yield (daily)',
    'T10Y2Y': '10Y-2Y Treasury Spread / Yield Curve (daily)',
    'VIXCLS': 'VIX Close (daily)',
    'CPIAUCSL': 'CPI All Urban Consumers (monthly)',
    'FEDFUNDS': 'Federal Funds Rate (monthly)'
}


def fetch_fred_series(series_id: str, api_key: str, start_date: str, end_date: str) -> List[Dict]:
    """
    Fetch a single FRED series.
    
    Args:
        series_id: The FRED series ID
        api_key: FRED API key
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        
    Returns:
        List of observations with date and value
    """
    url = f"https://api.stlouisfed.org/fred/series/observations"
    params = {
        'series_id': series_id,
        'api_key': api_key,
        'file_type': 'json',
        'observation_start': start_date,
        'observation_end': end_date
    }
    
    logger.info(f"Fetching {series_id} from {start_date} to {end_date}")
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    observations = []
    
    for obs in data['observations']:
        # Convert '.' values to None (NULL in database)
        value = float(obs['value']) if obs['value'] != '.' else None
        observations.append({
            'date': obs['date'],
            'value': value
        })
    
    logger.info(f"Fetched {len(observations)} data points for {series_id}")
    return observations


def connect_to_db(db_path: str) -> sqlite3.Connection:
    """Connect to the SQLite database."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Enable dict-like access to rows
    return conn


def upsert_macro_indicator(conn: sqlite3.Connection, series_id: str, date: str, value: Optional[float]):
    """
    Insert or update a macro indicator record.
    
    Args:
        conn: Database connection
        series_id: The FRED series ID
        date: Date in YYYY-MM-DD format
        value: Value (can be None)
    """
    fetched_at = int(datetime.now().timestamp())
    
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO macro_indicators (series_id, date, value, fetched_at)
        VALUES (?, ?, ?, ?)
    """, (series_id, date, value, fetched_at))


def fetch_and_store_fred_data(
    series_ids: List[str],
    start_date: str,
    end_date: str,
    db_path: str,
    api_key: str
) -> None:
    """
    Fetch FRED data for specified series and store in database.
    
    Args:
        series_ids: List of FRED series IDs to fetch
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        db_path: Path to SQLite database
        api_key: FRED API key
    """
    conn = connect_to_db(db_path)
    
    try:
        for series_id in series_ids:
            try:
                observations = fetch_fred_series(series_id, api_key, start_date, end_date)
                
                for obs in observations:
                    upsert_macro_indicator(conn, series_id, obs['date'], obs['value'])
                
                logger.info(f"Stored {len(observations)} records for {series_id}")
                
            except Exception as e:
                logger.error(f"Failed to fetch {series_id}: {str(e)}")
                continue  # Continue with next series even if one fails
        
        conn.commit()
        logger.info("All data committed to database")
        
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Fetch FRED time series data")
    parser.add_argument(
        '--series',
        nargs='+',
        choices=list(FRED_SERIES.keys()),
        default=list(FRED_SERIES.keys()),
        help='FRED series to fetch (default: all 5)'
    )
    parser.add_argument(
        '--start-date',
        type=str,
        default='2010-01-01',
        help='Start date in YYYY-MM-DD format (default: 2010-01-01)'
    )
    parser.add_argument(
        '--end-date',
        type=str,
        default=datetime.now().strftime('%Y-%m-%d'),
        help='End date in YYYY-MM-DD format (default: today)'
    )
    parser.add_argument(
        '--db-path',
        type=str,
        default='data/privatinvestor.db',
        help='Path to SQLite database (default: data/privatinvestor.db)'
    )
    
    args = parser.parse_args()
    
    # Get FRED API key from environment
    api_key = os.environ.get('FRED_API_KEY')
    
    # If not found in environment, try to read from the specific file
    if not api_key:
        try:
            with open('process.env.FRED_API_KEY', 'r') as f:
                for line in f:
                    if line.startswith('FRED_API_KEY='):
                        api_key = line.split('=')[1].strip()
                        break
        except FileNotFoundError:
            pass
    
    if not api_key:
        raise ValueError("FRED_API_KEY environment variable not set")
    
    # Validate dates
    try:
        start_dt = parse_date(args.start_date)
        end_dt = parse_date(args.end_date)
        if start_dt > end_dt:
            raise ValueError("Start date must be before end date")
    except Exception as e:
        raise ValueError(f"Invalid date format: {e}")
    
    logger.info(f"Starting FRED data fetch for series: {args.series}")
    logger.info(f"Date range: {args.start_date} to {args.end_date}")
    logger.info(f"Database: {args.db_path}")
    
    fetch_and_store_fred_data(
        series_ids=args.series,
        start_date=args.start_date,
        end_date=args.end_date,
        db_path=args.db_path,
        api_key=api_key
    )


if __name__ == "__main__":
    main()
