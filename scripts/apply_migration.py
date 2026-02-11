#!/usr/bin/env python3
"""
Apply database migrations
"""
import sqlite3
import os
from pathlib import Path

def apply_migrations():
    # Connect to database
    db_path = Path("data/market-data.db")
    os.makedirs(db_path.parent, exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if macro_indicators table exists
    cursor.execute("""
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='macro_indicators';
    """)
    
    table_exists = cursor.fetchone() is not None
    
    if not table_exists:
        # Read and execute migration
        migration_path = Path("src/data/migrations/003_macro_indicators.sql")
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
        
        cursor.executescript(migration_sql)
        print("Applied macro_indicators migration")
    else:
        print("macro_indicators table already exists")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    apply_migrations()