CREATE TABLE IF NOT EXISTS run_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle',
  run_type TEXT,
  universe TEXT,
  preset TEXT,
  started_by TEXT,
  started_at TEXT,
  updated_at TEXT,
  progress_pct INTEGER DEFAULT 0,
  progress_msg TEXT,
  error_msg TEXT
);

INSERT OR IGNORE INTO run_lock (id, status, progress_pct, progress_msg)
VALUES (1, 'idle', 0, 'Bereit');
