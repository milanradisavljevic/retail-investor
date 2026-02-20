# SEC EDGAR PoC (Block A) - Setup & Run

## Begriffe

- `CIK` = Central Index Key (SEC-Unternehmenskennung)
- `XBRL` = eXtensible Business Reporting Language (SEC-Finanzdatenformat)
- `TTM` = Trailing Twelve Months (letzte 12 Monate)

## Voraussetzungen

```bash
pip install requests yfinance pandas
pip install edgartools  # optional fuer --method edgartools|both
```

Hinweis: Falls `python` lokal nicht vorhanden ist, stattdessen `python3` (oder `.venv/bin/python`) verwenden.

## Pflicht-Commands (Audit-Run)

```bash
python scripts/etl/sec_edgar_poc.py --dry-run --skip-validation -v
python scripts/etl/sec_edgar_poc.py --dry-run -v
```

Erwartetes Verhalten:
- Script startet, iteriert Ticker und beendet mit Exit Code `0`.
- Bei Netzproblemen werden Warnungen geloggt und Ticker sauber uebersprungen (kein Hard-Crash).
- Bei erreichbarer SEC/yfinance-API werden Extraktions- und optional Validierungsreports ausgegeben.

## DB-Sicherheit

Das Script schreibt standardmaessig in `fundamentals_snapshot`, **nur wenn** die Tabelle exakt die PoC-Spalten besitzt:
- `symbol`
- `fetched_at`
- `data_json`

Bei Schema-Abweichung schreibt das Script automatisch in:
- `fundamentals_snapshot_sec_poc`

Damit wird das bestehende Produktionsschema nicht gebrochen.

## Wichtige Logikannahmen

- CompanyFacts Endpoint nutzt `CIK{cik}.json` (nicht `CID`).
- Instant-Werte (z. B. `Assets`, `Equity`) nehmen den neuesten Filing-Zeitpunkt unabhaengig von `10-Q` vs. `10-K`.
- `FCF` wird als `OperatingCashFlow - abs(CapEx)` gerechnet, damit unterschiedliche XBRL-Vorzeichen fuer CapEx konsistent behandelt werden.
- Debt-to-Equity nutzt primaer Long-Term-Debt und zusaetzlich `us-gaap:DebtCurrent` als minimale Current-Debt-Ergaenzung.
- Validation nutzt eine tolerantere Schwelle von `<15%` Abweichung, um False-Negatives zu reduzieren.

## Mini-Tests (ohne Netzwerk)

```bash
python -m unittest tests/test_sec_edgar_poc.py -v
```

## Block B - Bulk Audit (offline, ohne Network)

Lokale Inputs:
- `--companyfacts-dir`: Ordner mit Dateien wie `CIK0000320193.json`
- `--company-tickers`: lokale `company_tickers.json` fuer Ticker -> CIK Mapping

Run (Audit-only):

```bash
python scripts/etl/sec_edgar_bulk_audit.py --companyfacts-dir data/sec/companyfacts --company-tickers data/sec/company_tickers.json --tickers AAPL MSFT --limit 2 -v
```

Run (Tests):

```bash
python -m unittest tests/test_sec_edgar_bulk_audit.py -v
```

Optional DB-Write:

```bash
python scripts/etl/sec_edgar_bulk_audit.py --companyfacts-dir data/sec/companyfacts --company-tickers data/sec/company_tickers.json --tickers AAPL MSFT --limit 2 --write-db -v
```

Erwartete Ausgabe:
- Summary mit `processed`, `skipped` und Feld-Coverage pro Feld/gesamt.
- JSON Audit-Report unter `data/audits/sec_edgar_bulk_audit_<timestamp>.json`.
- Bei `--write-db`: Ausgabe der verwendeten Tabelle, z. B. `fundamentals_snapshot`.
