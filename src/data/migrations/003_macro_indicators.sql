CREATE TABLE IF NOT EXISTS macro_indicators (
  series_id TEXT NOT NULL,       -- z.B. 'DGS10', 'VIXCLS'
  date TEXT NOT NULL,            -- ISO date 'YYYY-MM-DD'
  value REAL,                    -- Wert (NULL wenn FRED '.' liefert)
  fetched_at INTEGER NOT NULL,   -- Unix timestamp
  PRIMARY KEY (series_id, date)
);
CREATE INDEX IF NOT EXISTS idx_macro_date ON macro_indicators(date);
CREATE INDEX IF NOT EXISTS idx_macro_series ON macro_indicators(series_id);