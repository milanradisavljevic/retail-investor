-- Group medians cache per as-of date and group type
-- groupType: 'industry' | 'sector'

CREATE TABLE IF NOT EXISTS group_medians (
  as_of_date TEXT NOT NULL,
  group_type TEXT NOT NULL,
  group_name TEXT NOT NULL,
  metric TEXT NOT NULL,
  median REAL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (as_of_date, group_type, group_name, metric)
);
