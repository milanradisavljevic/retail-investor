# Retail Investor MVP (Privatinvestor Briefing)
<img width="1038" height="1280" alt="image" src="https://github.com/user-attachments/assets/df19d305-efc0-4540-b482-efb62978ee3d" />



Lokale, deterministische Aktienanalyse-Engine für tägliche Briefings. Finnhub liefert Preise/Fundamentals, alles andere läuft offline-freundlich und reproduzierbar.

## ⚠️ Legal Disclaimer

**FOR EDUCATIONAL AND RESEARCH PURPOSES ONLY**

This application uses data from:
- **Finnhub** (Free Tier) - Real-time quotes & fundamental metrics
- **Yahoo Finance** (via yfinance library) - Historical & fundamental data

**IMPORTANT NOTICES:**
- **NOT FINANCIAL ADVICE** - This tool is for educational purposes only and should not be used to make investment decisions
- **NO WARRANTY** - No warranty on data accuracy, completeness, or fitness for any particular purpose
- **USE AT YOUR OWN RISK** - Past performance does not guarantee future results
- **DATA TERMS** - Yahoo Finance data subject to their [Terms of Service](https://policies.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.htm)
- **NOT FOR COMMERCIAL USE** - Not for commercial distribution without proper licensing
- **NO AFFILIATION** - Not affiliated with or endorsed by Finnhub, Yahoo Finance, or any financial institution

**Academic Use:** Implements peer-reviewed valuation methods from academic literature (see References below).

**Regulatory Compliance:** Users are responsible for ensuring compliance with applicable securities laws and regulations in their jurisdiction.

## Projektumfang (aktuell)
- Scoring (TS, Next.js): Fundamental (P/E, P/B, P/S, ROE, Debt/Equity) und Technical (Renditen, 52W-Range, Volatilität) → Evidence-Pillars + Total Score (0–100); deterministisch inkl. alphabetischem Tie-Break + Seed für Pick of the Day.
- Selektion/Briefing: Top 10, Top 5, Pick of the Day, Dokument-Requests bei schwacher Evidenz; UI zeigt Universum-Badge, Firmenname, Scores.
- Daten & Caching: Finnhub mit Rate-Limit-Handling, SQLite + Filesystem-Cache, TTLs konfigurierbar.
- Python Add-ons (nicht in UI-Pipeline): Schnelle Scoring-Tests (`test_scoring_run.py`, `test_scoring_with_adapter.py`) mit Finnhub-Adapter für Free-Tier-Feldnamen sowie extrahierte Advanced-Formeln (DCF, WACC, Monte-Carlo-VaR, EV/EBITDA-Regression) unter `src/formulas/advanced/`.
- Dokumentation & Governance: Golden Docs, Literaturreview, Agent-Änderungen in `docs/AGENTS_CHANGELOG.md`.

## Universe Packs
- Format: `config/universes/<pack>.json` mit Feldern `name`, `provider`, `benchmark`, `symbols` (Großschreibung/De-Dupe beim Laden). Auswahl via `UNIVERSE` / `UNIVERSE_CONFIG` Env (Pfade oder Pack-Name).
- Packs an Bord: `test` (klein), `sp500`, `nasdaq100`, `eurostoxx50` (alle als gekürzte Samples für Offline/Ratelimit), optionaler `russell2000` Stub zum lokalen Erweitern.
- Benchmark aus Pack (`benchmark`) landet im Run-Record und Mode-Berechnung.

## Large Universe Safety
- Pipeline-Knobs (`config/scoring.json`): `pipeline.top_k`, `pipeline.max_symbols_per_run` (default 150), `pipeline.max_concurrency`, `pipeline.throttle_ms`, `pipeline.scan_only_price_target` (should stay `false`).
- Truncation: Wenn Universum > max_symbols_per_run → deterministischer Slice der ersten N Symbole + Warnung im Run (`pipeline.truncated`), Historie zeigt Symbole `scored/universe`.
- Rate-Limit: Cache-first Fetch (Fundamentals/Technicals/Profile) mit Request-Throttler; Run-Log enthält Request-Budget (estimated vs. actual + Cache-Hitrate).

## Neueste Änderungen (Januar 2026)

### 🌌 Sprint 6 – Universe Expansion & Rate-Limit Safety (NEU)
- Universe packs standardisiert unter `config/universes/*.json` (Felder: `name`, `provider`, `benchmark`, `symbols`), auswählbar via `UNIVERSE`/`UNIVERSE_CONFIG` Env. Packs für Test, S&P500/NASDAQ100/EUROSTOXX50 (truncated samples) + optional Russell2000 Stub.
- Pipeline-Schutz: `pipeline.max_symbols_per_run` (default 150) schneidet deterministisch nach der Pack-Reihenfolge ab und schreibt Warnung ins Run-Metadatum; Historie zeigt Symbolanzahl + Truncation-Hinweis.
- Request-Sicherheit: zentraler Throttler + Cache-First-Fetch (Fundamentals, Technicals, Profile) mit Hit-Rate und Request-Budget-Log; konfigurierbare `pipeline.max_concurrency`/`pipeline.throttle_ms`.

### 🧮 Sprint 5 – Value Score Audit & Missing-Data Robustness (NEU)
- Valuation pillar now degrades gracefully: weights renormalize when PE/PB/PS missing, single-input path flagged low confidence, full-missing falls back to neutral (50) with explicit assumption; coverage persisted as `valuation_input_coverage`.
- Explain/Detail: warnings for partial/fallback valuation inputs, stock detail shows “Valuation inputs: ... (missing: ...)”.
- Audit: `npx tsx scripts/audit-value.ts` reports valuation drivers/coverage per symbol plus sector rollups.
- Tests: missing-data robustness (`tests/unit/value_missing_data.test.ts`) keep Value from dropping to 0 purely due to missing PS.

### 🚀 Sprint 4 – Universe Scaling (NEU)
- Zwei-Phasen-Pipeline: Scan-Phase berechnet leichte Scores ohne Price Target (`is_scan_only=true`), deterministisch Top-K (Default 50, konfigurierbar in `config/scoring.json`) werden anschließend tief analysiert mit Preisziel + Diagnostics.
- Neue Universen unter `config/universes/` (test, sp500, nasdaq100, eurostoxx50); Runs enthalten Universe-Label für History-Filter.
- Sparsame Requests: Scan-Only Einträge tragen keine Price-Target-Aufrufe; Deep-Phase nutzt vorhandene Daten. Tests für deterministischen Top-K und Scan-Flag.

### 🔬 Sprint 3 – Trust & Debuggability (NEU)
- Price Target Diagnostics in `run.json`: Inputs (PE/PB/PS, EPS, BVPS, RPS, Sector), Medians inkl. Sample Size/Fallback-Grund, Komponenten (PE/PB/PS) + Fair-Value-Clamps; sichtbar auf `/stock/[symbol]` unter „Valuation Inputs/Value Drivers“.
- Median-Stabilität: konfigurierbares Mindest-N (Default 12, `config/scoring.json`), Fallback auf globale Medians bei zu kleinem Sektor (Confidence-Downgrade + Deep-Analysis-Reason), Tests: `tests/unit/price_target_diagnostics.test.ts`.
- UI Copy: PriceTargetCard zeigt „Fair Value (Model)“ / „Trade Target (Horizon)“, negative Upside wird optisch abgewertet; „Additional Analysis“ Banner öffnet deeplinks in Bewertungsabschnitt bzw. Modal bei mehreren Symbolen.

### 🔁 Run-to-Run Deltas (NEU - 14.01.2026)
- Dashboard-Karten + Top-10-Tabelle zeigen jetzt ΔTotal und ΔReturn vs. vorherigem Run (Fallback „—“ wenn kein Vorgänger).
- Laufzeit-Helper: `getRecentRuns()` in `src/lib/runLoader.ts` + `computeDeltas()` (`src/lib/runDelta.ts`) berechnen deltasymbol-genau; Price Target Card markiert Confidence/Deep-Analysis-Wechsel.
- Testabdeckung: `tests/unit/runDelta.test.ts`; `npm run build` grün.

### 🧭 Sort/Filter + History UX (NEU - 14.01.2026)
- Dashboard-Toolbar (`src/app/components/BriefingToolbar.tsx`) sortiert nach Total/Expected Return/Fundamental/Technical/Confidence und filtert (Deep Analysis, Low Confidence, Missing Data, Negative Upside); Zustand via URL-Query teilbar.
- Neues Score-View-Utility (`src/lib/scoreView.ts`) filtert/sortiert serverseitig, Karten/Tabelle rendern gefilterte Top-N.
- History: `/history` zeigt die letzten Runs (20+) inkl. Provider/Requests/Run-ID, optionaler Symbol-Filter; Klick öffnet `/history/[runId]` (Alias `/run/[runId]`).
- Run-Detail: gefilterte/sortierte Score-Tabelle, Symbol-Filter, Export-Buttons für `run.json` + CSV (Price-Target-Felder, Confidence, Deep-Analysis-Flag).

### 🧭 Why this score? (NEU - 14.01.2026)
- Stock-Detailseite zeigt deterministische Explain-Card mit 6–10 Signals (Positives/Negatives/Warnings) aus bestehenden score/price_target/data_quality Feldern – ohne LLM.
- Regelbasis: `src/lib/explainSignals.ts` (Valuation/Quality/Technical-Risk + Warnungen wie negative Upside, negative Equity, fehlende Fundamentals).
- Test: `npm test -- tests/unit/explainSignals.test.ts`.
- Beispiel (AAPL 2026-01-14, gekürzt):
  - Positives: Upside vs model fair value · 25.0%, Valuation pillar strong (72.0), Quality pillar strong (81.0)
  - Negatives: Risk profile elevated · 30.0
  - Warnings: Missing fundamentals: equity, cashflow
  - Tipp für Screenshot: `npm run dev` starten und `/stock/AAPL` öffnen; Karte „Why this score?“ capturen.

### 🔗 Hybrid Datenqualität (NEU)
- Finnhub bleibt Primärquelle; fehlende PS oder Debt/Equity werden per yfinance-Fallback ergänzt.
- Fair Values nutzen sektorbasierte Mediane mit IQR-Trim, Komponenten-Clamps und 10%-500%-Bounds plus Confidence-Downweight.
- Debug-Skripte: `npx tsx scripts/debug-fair-value.ts` und `npx tsx scripts/debug-quality-100.ts` zeigen jetzt auch Fallback-Daten (PS/D/E) und Deep-Analysis-Gründe.
- Negative Equity wird strikt mit Score 0 bewertet; D/E-Einheiten harmonisiert (Ratio statt Prozent).

### 🎯 Price Target Model (NEU - 13.01.2026)

Vollständiges Price-Target-System basierend auf Sektor-relativen Multiples.

**Neue Datei:** `src/scoring/price-target.ts` (~550 LOC)

**Implementierte Funktionen:**
| Funktion | Beschreibung |
|----------|--------------|
| `calculateFairValue()` | Gewichtete Fair-Value-Berechnung: 40% PE, 30% PB, 30% PS |
| `calculateSectorMedians()` | Berechnet Median-Multiples pro Sektor aus Universe |
| `calculateHoldingPeriod()` | Dynamische Haltedauer (3-18 Monate) basierend auf Upside & Volatilität |
| `calculateConfidence()` | Confidence Level (high/medium/low) aus Data Quality, Upside, Pillar Spread |
| `requiresDeepAnalysis()` | Flag für LLM-Deep-Analysis bei Edge Cases |
| `extractStockMetrics()` | Extrahiert/leitet EPS, Book Value, Revenue per Share ab |
| `calculatePillarSpread()` | Misst Konsistenz der Evidence Pillars |

**Fair Value Formel:**
```
Fair Value = 0.40 × (EPS × Sector_Median_PE)
           + 0.30 × (Book_Value/Share × Sector_Median_PB)
           + 0.30 × (Revenue/Share × Sector_Median_PS)
```

**Output-Schema erweitert** (`schemas/run.v1.schema.json`):
```json
{
  "price_target": {
    "current_price": 260.25,
    "fair_value": 110.33,
    "upside_pct": -0.5761,
    "target_buy_price": 260.25,
    "target_sell_price": 281.07,
    "expected_return_pct": 0.08,
    "holding_period_months": 3,
    "target_date": "2026-04-13",
    "confidence": "low",
    "requires_deep_analysis": true,
    "deep_analysis_reasons": ["Negative upside - potential value trap"]
  }
}
```

**Integration in Engine** (`src/scoring/engine.ts`):
- Neues Interface `ScoreSymbolContext` mit Profile und Sector Medians
- `scoreUniverse()` berechnet jetzt Sector Medians vor dem Scoring
- `scoreSymbol()` berechnet Price Target wenn Context vorhanden

---

### 🐛 Critical Bug Fix: Quality Score Dezimal-Konvertierung (13.01.2026)

**Problem:** Quality-Scores zeigten für 80%+ der Aktien den Fallback-Wert 50/100.

**Root Cause Analyse:**

yfinance liefert ALLE Ratio-Werte als Dezimal (nicht Prozent):
```python
# yfinance API Response
{
  "returnOnEquity": 1.7142199,    # Bedeutet 171.42% ROE
  "grossMargins": 0.46905,        # Bedeutet 46.9% Margin
  "returnOnAssets": 0.22964       # Bedeutet 22.96% ROA
}
```

Die ursprüngliche `decimalToPercent()` Funktion hatte eine fehlerhafte Heuristik:
```typescript
// VORHER (FALSCH):
private decimalToPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || isNaN(value)) return null;
  // FEHLER: Annahme dass Werte > 1 bereits Prozent sind
  if (Math.abs(value) > 1) {
    return value;  // FALSCH: 1.71 bleibt 1.71 statt 171.42
  }
  return value * 100;
}
```

**Auswirkung:**
- AAPL ROE: yfinance liefert `1.7142` → wurde als 1.71% interpretiert
- ROE Threshold: low=5%, high=20% → Score 0 (weil 1.71 < 5)
- Debt/Equity für diese Aktie: Score 0 (hohe D/E Ratio)
- Quality = (0 + 0) / 2 = 0... oder mit einem positiven D/E: Quality = 50

**Fix** (`src/providers/yfinance_provider.ts:266-278`):
```typescript
// NACHHER (KORREKT):
private decimalToPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || isNaN(value)) return null;
  // yfinance liefert IMMER Ratios, auch für Werte > 100%
  // z.B. returnOnEquity: 1.7142 bedeutet 171.42%
  return value * 100;
}
```

**Betroffene Metriken:**
- `roe` (Return on Equity)
- `roa` (Return on Assets)
- `grossMargin`
- `operatingMargin`
- `netMargin`
- `dividendYield`
- `payoutRatio`
- `revenueGrowth`
- `earningsGrowth`

**Verifizierung:**
```bash
# Debug-Script ausführen:
npx tsx scripts/debug-quality.ts

# Vorher: Quality meist 50
# Nachher: Quality variiert (0, 21, 50, 100)
```

---

### 🐛 Critical Bug Fix: Negative Equity + D/E Conversion (13.01.2026 - Abend)

**Problem:** Nach dem ersten Dezimal-Fix zeigten alle Quality Scores 100 oder 50 - statistisch unwahrscheinlich für ein 15-Symbol-Universum.

**Symptome identifiziert via Debug-Scripts:**
- BA: Quality = 100, D/E = -13.87 (negativ!)
- LOW: Quality = 50, D/E = -2.79 (negativ!)
- HCA: Quality = 50, D/E = -18.10 (negativ!)
- MCK: Quality = 50, D/E = -3.56 (negativ!)
- MO: Quality = 50, D/E = -11.14 (negativ!)
- AAPL: D/E = 152.41 (sollte ~1.52 sein)

**Root Cause #1: Negative Equity falsch bewertet**

Unternehmen mit negativem Eigenkapital haben negative D/E Ratios. Die `normalizeToRange()` Funktion behandelte dies fälschlicherweise als "sehr niedrig = sehr gut":

```typescript
// In normalizeToRange() mit invert=true:
if (value <= low) return 100;  // -13.87 <= 0.5 → Score 100 (FALSCH!)
```

**Realität:** Negatives Eigenkapital bedeutet, dass ein Unternehmen mehr Schulden als Vermögenswerte hat - ein **schwerwiegendes Warnsignal**, kein gutes Zeichen!

**Fix #1** (`src/scoring/fundamental.ts:94-103`):
```typescript
// Special handling für Debt/Equity: negatives D/E = negatives Eigenkapital
let debtEquityScore: number;
if (debtEquity !== null && !isNaN(debtEquity) && debtEquity < 0) {
  debtEquityScore = 0; // Negatives Eigenkapital = schlechtester Score
  assumptions.push('debtToEquity: negative value indicates negative equity - scored 0');
} else {
  debtEquityScore = normalizeToRange(debtEquity, thresholds.debtEquity, true);
}
```

**Root Cause #2: D/E Einheit falsch (yfinance)**

yfinance liefert D/E als Prozentwert (152.411 = 152.4%), aber Scoring erwartet Ratio (1.52):

```python
# yfinance API Response
{"debtToEquity": 152.411}  # Bedeutet 152.4% = 1.52 Ratio
```

**Auswirkung ohne Fix:**
- AAPL D/E: 152.41 → Score 0 (weil > 2.0 Threshold)
- Aber echte D/E ist 1.52 → sollte ~31.7 Score sein

**Fix #2** (`src/providers/yfinance_provider.ts:280-292`):
```typescript
/**
 * Convert percentage to ratio.
 * yfinance returns debtToEquity as percentage (152.411 = 152.4% = 1.52411 ratio).
 * Our scoring expects D/E as ratio (0.5-2.0 range for healthy companies).
 */
private percentToRatio(value: number | null | undefined): number | null {
  if (value === null || value === undefined || isNaN(value)) return null;
  return value / 100;  // 152.411 → 1.52411
}
```

Angewendet in `mapFundamentals()`:
```typescript
const rawDebtToEquity = metrics.debtToEquity ?? ...;
const debtToEquity = this.percentToRatio(rawDebtToEquity);
```

**Root Cause #3: Fair Value ohne Sanity Bounds**

Fair Value Berechnungen konnten extreme Werte produzieren (z.B. BA: $29.92 bei Current $239.81 = -87.5%).

**Fix #3** (`src/scoring/price-target.ts:71,324-336`):
```typescript
const MAX_FAIR_VALUE_DEVIATION = 2.0; // ±200% Maximum

// In calculatePriceTargets():
const minFairValue = currentPrice * (1 - MAX_FAIR_VALUE_DEVIATION);
const maxFairValue = currentPrice * (1 + MAX_FAIR_VALUE_DEVIATION);
fairValue = Math.max(minFairValue, Math.min(maxFairValue, fairValue));
```

**Ergebnis nach allen Fixes (yfinance Test-Universe):**

| Symbol | Quality VORHER | Quality NACHHER | D/E Score | Grund |
|--------|----------------|-----------------|-----------|-------|
| BA | 100 | 50 | 0 | Neg. Equity → D/E=0, ROE=100 |
| MCK | 50 | 0 | 0 | Neg. Equity → D/E=0, ROE=0 |
| LOW | 50 | 0 | 0 | Neg. Equity → D/E=0, ROE=0 |
| HCA | 50 | 0 | 0 | Neg. Equity → D/E=0, ROE=0 |
| MO | 50 | 0 | 0 | Neg. Equity → D/E=0, ROE=0 |
| AAPL | ~50 | 65.9 | 31.7 | D/E korrekt: 1.52 |
| XOM | ~50 | 71.4 | ~68 | D/E korrekt: 0.16 |

**Top 5 nach Fix:**
1. XOM - 81.7/100
2. WMT - 75.4/100
3. JNJ - 73.9/100
4. CVS - 61.6/100
5. PG - 61.0/100

**Verifizierung:**
```bash
# Debug Quality Distribution (zeigt immer noch alte normalizeToRange Logik):
npx tsx scripts/debug-quality-distribution.ts

# Vollständiger Run mit yfinance:
MARKET_DATA_PROVIDER=yfinance UNIVERSE_CONFIG=config/universe_test.json npm run run:daily

# Check Output:
cat data/runs/2026-01-13__*.json | jq '.scores[] | select(.symbol == "BA") | {symbol, quality: .evidence.quality, assumptions: .data_quality.assumptions}'
```

**Output bestätigt Fix:**
```json
{
  "symbol": "BA",
  "quality": 50,
  "assumptions": [
    "debtToEquity: negative value indicates negative equity - scored 0"
  ]
}
```

---

### 🎨 Dark Finance UI Theme (12.01.2026)

Komplette UI-Überarbeitung mit professionellem Dark Finance Design.

**Farbpalette** (`src/app/globals.css`):
```css
:root {
  /* Navy Palette (Hintergründe) */
  --navy-900: #0a0e1a;   /* Darkest - Page Background */
  --navy-800: #111827;   /* Cards */
  --navy-700: #1e293b;   /* Elevated surfaces */
  --navy-600: #334155;   /* Borders, dividers */

  /* Accent Colors (Status) */
  --accent-green: #22c55e;  /* Positive, bullish */
  --accent-red: #ef4444;    /* Negative, bearish */
  --accent-gold: #eab308;   /* Warning, neutral */
  --accent-blue: #3b82f6;   /* Info, Pick of Day */

  /* Text Hierarchy */
  --text-primary: #f8fafc;    /* Headlines */
  --text-secondary: #94a3b8;  /* Body text */
  --text-muted: #64748b;      /* Labels, captions */
}
```

**Neue Komponenten:**

1. **PriceTargetCard** (`src/app/components/PriceTargetCard.tsx`):
   - Vollständige Price Target Anzeige mit Fair Value, Target, Return
   - `PriceTargetCompact` Variante für Tabellen
   - `ConfidenceBadge` (High/Medium/Low)

2. **Dashboard Redesign** (`src/app/page.tsx`):
   - Score Cards mit integrierten Price Targets
   - Top 10 Tabelle mit TARGET, RETURN, HORIZON Spalten
   - Data Quality Overview Sektion
   - Mode Badge (RISK_ON/NEUTRAL/RISK_OFF)

3. **Layout** (`src/app/layout.tsx`):
   - Neuer Header mit Logo und Navigation
   - Responsive Dark Theme

---

### 🔧 Technische Änderungen (Build/Type Fixes)

**Type-Kompatibilität** (13.01.2026):

| Datei | Problem | Fix |
|-------|---------|-----|
| `src/run/builder.ts` | `ModeResult.features.ma50` null vs undefined | Transformation `null → undefined` für Schema-Kompatibilität |
| `src/run/builder.ts` | `missingFields` possibly undefined | Optional chaining `?.length ?? 0` |
| `src/human_loop/trigger.ts` | `missingFields` possibly undefined | Optional chaining |
| `src/llm/adapter.ts` | `missingFields` possibly undefined | Optional chaining |
| `src/llm/templates.ts` | `missingFields` possibly undefined | Optional chaining |
| `src/scoring/engine.ts` | `FundamentalsData` cast | `as unknown as Record<string, unknown>` |
| `src/scoring/metric_resolution.ts` | Return type undefined | `?? null` für alle Felder |

**Mode Features Transformation** (`src/run/builder.ts:103-118`):
```typescript
// Transform null → undefined für Schema-Kompatibilität
const transformedMode = {
  model_version: scoringResult.mode.model_version,
  label: scoringResult.mode.label,
  score: scoringResult.mode.score,
  confidence: scoringResult.mode.confidence,
  benchmark: scoringResult.mode.benchmark,
  features: {
    ma50: modeFeatures.ma50 ?? undefined,
    ma200: modeFeatures.ma200 ?? undefined,
    vol20: modeFeatures.vol20 ?? undefined,
    vol60: modeFeatures.vol60 ?? undefined,
    breadth: modeFeatures.breadth ?? undefined,
  },
};
```

---

### 📊 Debug-Scripts (NEU - 13.01.2026)

Neue Scripts für Diagnose und Validierung:

| Script | Zweck |
|--------|-------|
| `scripts/debug-quality.ts` | Testet yfinance Daten-Fetch und Decimal-Konvertierung |
| `scripts/debug-quality-distribution.ts` | Analysiert Quality Score Verteilung + negative D/E |
| `scripts/debug-fair-value.ts` | Fair Value Komponenten-Analyse (PE, PB, PS) |
| `scripts/debug-price-targets.ts` | Testet Price Target Pipeline end-to-end |
| `scripts/debug-raw-yfinance.ts` | Zeigt rohe yfinance API-Antworten |
| `scripts/mini-run.ts` | Schneller Test-Run mit 5 Symbolen |

**Verwendung:**
```bash
npx tsx scripts/debug-quality.ts
npx tsx scripts/debug-quality-distribution.ts
npx tsx scripts/debug-fair-value.ts
npx tsx scripts/debug-price-targets.ts
npx tsx scripts/mini-run.ts
```

---

### 📁 Neue/Geänderte Dateien (Übersicht)

**Neue Dateien:**
```
src/scoring/price-target.ts              # Price Target Model (~550 LOC)
src/app/components/PriceTargetCard.tsx   # UI Komponente
config/universe_test.json                # Test-Universe (15 Symbole)
scripts/debug-quality.ts                 # Debug: yfinance Decimal-Konvertierung
scripts/debug-quality-distribution.ts    # Debug: Quality Score Verteilung
scripts/debug-fair-value.ts              # Debug: Fair Value Komponenten
scripts/debug-price-targets.ts           # Debug: Price Target Pipeline
scripts/debug-raw-yfinance.ts            # Debug: Rohe yfinance API
scripts/mini-run.ts                      # Mini-Scoring-Run
tests/unit/price_target.test.ts          # 18 Unit Tests
```

**Geänderte Dateien:**
```
src/providers/yfinance_provider.ts    # decimalToPercent() + percentToRatio() Fixes
src/scoring/fundamental.ts            # Negative D/E Handling
src/scoring/price-target.ts           # Fair Value Sanity Bounds
src/scoring/engine.ts                 # Price Target Integration
src/run/builder.ts                    # price_target Mapping + Type Fixes
src/types/generated/run_v1.ts         # price_target TypeScript Interface
schemas/run.v1.schema.json            # price_target Schema
src/app/globals.css                   # Dark Finance Theme
src/app/layout.tsx                    # Neuer Header
src/app/page.tsx                      # Dashboard Redesign
src/human_loop/trigger.ts             # Optional chaining Fix
src/llm/adapter.ts                    # Optional chaining Fix
src/llm/templates.ts                  # Optional chaining Fix
src/scoring/metric_resolution.ts      # Return type Fix
```

---

### ✅ Validierung

**Tests:**
```bash
npm test                    # Vitest Suites (18 neue Price Target Tests)
npm run build               # Next.js Build (keine Fehler)
npx tsx scripts/mini-run.ts # Schneller End-to-End Test
```

**Erwartete Ergebnisse nach Fix:**
- Quality Scores variieren: 0, 21, 50, 100 (nicht mehr nur 50)
- Price Targets vorhanden für alle Symbole mit currentPrice
- UI zeigt TARGET, RETURN, HORIZON Werte

---

### Ältere Änderungen (Referenz)
- Claude: Finnhub-Adapter für reale Free-Tier-Feldnamen (`src/data_py/finnhub_adapter.py`), Testskripte `test_scoring_run.py` und `test_scoring_with_adapter.py` zur schnellen Profilprüfung, Logging/Cache-Verwendung. Adapter zählt verfügbare Felder und mapped auf erwartete Scoring-Namen.
- Codex: Advanced-Formeln aus der monolithischen Datei extrahiert nach `src/formulas/advanced/{dcf_two_stage,wacc,var_monte_carlo,ev_ebitda_regression}.py` mit Shared Utils (`utils.py`), Selbsttests und Damodaran-Fixtures. `docs/AGENTS_CHANGELOG.md` entsprechend ergänzt.
- Mode v1 & Data Quality: run.json enthält jetzt `mode` (RISK_ON/NEUTRAL/RISK_OFF) und `data_quality_summary`; pro Aktie Data-Quality-Score + Metrics-Map inkl. Quellen/Confidence/Imputation. Group-Medians in SQLite (`group_medians`), Missing-Data-Hierarchie mit yfinance-Fallback.

## Quickstart (TS/Next.js Pipeline)
```bash
npm install
FINNHUB_API_KEY=... npm run run:daily -- --universe=config/universe.json
# Alternativ: MARKET_DATA_PROVIDER=yfinance npm run run:daily -- --universe=config/universe.json
npm run dev   # webpack erzwungen, um Turbopack-Pfadprobleme bei Leerzeichen zu vermeiden
```
Dashboard: http://localhost:3000

### Frische Daten erzwingen
Falls Runs „Requests: 0“ melden (Cache-Hit): Caches/DB leeren und neu laufen lassen.
```bash
rm -f data/privatinvestor.db data/privatinvestor.db-wal data/privatinvestor.db-shm
rm -rf data/cache/technical data/cache/fundamentals 2>/dev/null || true
FINNHUB_API_KEY=... npm run run:daily -- --universe=config/universe.json
```

## Quickstart (Python Tests/Adapter)
```bash
cd "/home/milan/CA Sandbox/Privatinvestor/privatinvestor-mvp"
python3 -m venv .venv && source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install numpy pandas scikit-learn

export FINNHUB_API_KEY=...  # oder in .env.local eintragen
python3 test_scoring_run.py            # Basispfade ohne Adapter
python3 test_scoring_with_adapter.py   # Mit Finnhub-Adapter (Free-Tier Felder)

# Advanced-Formeln Selbsttests
python3 src/formulas/advanced/dcf_two_stage.py
python3 src/formulas/advanced/wacc.py
python3 src/formulas/advanced/var_monte_carlo.py
```

## Konfiguration
- FINNHUB_API_KEY in `.env.local` oder Umgebung.
- MARKET_DATA_PROVIDER: `finnhub` (Default) oder `yfinance` (Python-Bridge via `src/providers/yfinance_provider.ts` + `src/data_py/yfinance_cli.py`).
- Universum wählen: `UNIVERSE_CONFIG` / `UNIVERSE_FILE` / `UNIVERSE` (relativ zu `config/` oder absolut). CLI-Flag: `--universe=config/universe_dax.json`.
- Scoring: `config/scoring.json` (Thresholds, Pillar-Gewichte, per-Universum-Overrides).
- Unternehmensnamen: `config/company_names.json` (global + optionale Overrides pro Universum).
- Cache-TTLs: `config/cache_ttl.json`.

## Wichtige Skripte
- `npm run run:daily [-- --universe=...]` – Pipeline, schreibt `data/runs/*.json` (+ `_llm.json` bei LLM-Fallback).
- `npm run dev` – UI-Entwicklung.
- `npm test` – Vitest-Suites inkl. Determinismus-/Config-Tests.
- `npx tsx test_provider_bridge.ts` – Manuelle Brücke-Validierung des yfinance-Providers (ruft Python-CLI).
- `npm run validate:schemas` – Ajv-Validierung gegen JSON-Schemas.
- Python: `test_scoring_run.py`, `test_scoring_with_adapter.py`, Advanced-Formeln unter `src/formulas/advanced/`.

## Architektur (Kurz)
- Next.js App Router, React 18/TS strict, Tailwind.
- Backend/Scoring unter `src/` (core, data, providers, scoring, selection, run, human_loop, llm, validation).
- SQLite (better-sqlite3) mit Migration `src/data/migrations/001_init.sql`.
- JSON-Schemas als Source of Truth (`schemas/`), generierte Typen in `src/types/generated`, Ajv-Validierung.
- Logging: Pino mit Redaction.

## Projektauftrag / Referenzen
- Initiale Spezifikation/Prompt: `Initiale Prompt` (enthält Roadmap & Literaturhinweise).
- Golden Docs in `docs/golden/`.
- Agent-Änderungen: `docs/AGENTS_CHANGELOG.md`.

## Definition of Done (MVP v0.2)
- `npm test` grün (inkl. 18 Price Target Tests).
- `npm run build` ohne Fehler.
- `npm run run:daily` erzeugt valides `run.json` mit `price_target` pro Symbol.
- Dashboard zeigt:
  - Top 5 mit Scores, Universum-Badge und Firmenname
  - Evidence Pillars (Valuation, Quality, Technical, Risk)
  - Price Targets (Fair Value, Target Sell, Expected Return, Holding Period)
  - Mode Badge (RISK_ON/NEUTRAL/RISK_OFF)
  - Data Quality Scores
- Quality Scores variieren realistisch (nicht nur Fallback 50).
- Determinismus: gleicher Cache/Input → identische Scores/Hashes.

## Academic References & Literature

This project implements valuation models and risk metrics based on peer-reviewed academic research and industry-standard textbooks.

### Core Valuation Models

**1. Two-Stage Free Cash Flow to Equity (FCFE) DCF Model**
- **Source:** Damodaran, A. (2025). *Investment Valuation: Tools and Techniques for Determining the Value of Any Asset* (4th ed.). Wiley Finance.
- **Chapter:** Table 14.9 - Two-Stage FCFE Valuation Model
- **Implementation:** `src/scoring/formulas/dcf_two_stage.py`
- **Key Concepts:**
  - High-growth phase with FCFE CAGR from historical data
  - Stable-growth phase using perpetuity formula with risk-free rate
  - Terminal value calculation: FCFE_stable / (WACC - g_stable)

**2. Weighted Average Cost of Capital (WACC)**
- **Source:** Damodaran, A. (2025). *Investment Valuation* (4th ed.), Illustration 2.1
- **Implementation:** `src/scoring/formulas/wacc.py`
- **Formula:** WACC = (E/V) × r_e + (D/V) × r_d × (1 - tax_rate)
  - r_e (Cost of Equity): CAPM = risk_free_rate + beta × market_risk_premium
  - r_d (Cost of Debt): Approximated from interest expense / total debt
  - Market risk premium: 5.5% (long-term U.S. equity premium)

**3. Monte Carlo Value-at-Risk (VaR)**
- **Source:** Hilpisch, Y. (2018). *Python for Finance: Mastering Data-Driven Finance* (2nd ed.). O'Reilly Media.
- **Chapter:** Risk Analysis with Monte Carlo Simulation
- **Implementation:** `src/scoring/formulas/var_monte_carlo.py`
- **Method:**
  - 10,000 Monte Carlo paths using Geometric Brownian Motion
  - Calibrated from historical price volatility (252 trading days)
  - VaR at 95% confidence level = 5th percentile of return distribution

### Fundamental Analysis Metrics

**4. Enterprise Value / EBITDA Regression Analysis**
- **Source:** Koller, T., Goedhart, M., & Wessels, D. (2020). *Valuation: Measuring and Managing the Value of Companies* (7th ed.). McKinsey & Company/Wiley.
- **Implementation:** `src/scoring/formulas/ev_ebitda_regression.py`
- **Application:** Sector-based relative valuation using EV/EBITDA multiples

**5. DuPont ROE Decomposition**
- **Source:** Graham, B., Dodd, D. L., & Cottle, S. (2008). *Security Analysis* (6th ed.). McGraw-Hill.
- **Concept:** ROE = Net Profit Margin × Asset Turnover × Equity Multiplier
- **Note:** Used for profitability pillar scoring, not directly implemented

### Data Sources & Methodology

**Yahoo Finance Data (via yfinance)**
- **Library:** `yfinance` Python package (Ran Aroussi et al.)
- **Repository:** [ranaroussi/yfinance](https://github.com/ranaroussi/yfinance)
- **License:** Apache 2.0
- **Usage:** Historical prices, annual financial statements (cashflow, income statement, balance sheet)
- **Note:** Data sourced from Yahoo Finance APIs; subject to their Terms of Service

**Finnhub Financial Data**
- **API:** [Finnhub Stock API](https://finnhub.io/docs/api)
- **Free Tier:** 60 requests/minute, real-time quotes
- **Usage:** Current prices, TTM metrics (PE, PB, Beta)

### Risk-Free Rate & Market Parameters

**U.S. Treasury Yields (Risk-Free Rate)**
- **Source:** Federal Reserve Economic Data (FRED) - St. Louis Fed
- **Current Default:** 4.0% (representative 10-year Treasury yield as of 2025)
- **Update Frequency:** Should be updated quarterly based on [FRED DGS10](https://fred.stlouisfed.org/series/DGS10)

**Market Risk Premium**
- **Source:** Damodaran, A. (2025). Annual update: [Equity Risk Premiums](http://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html)
- **Value:** 5.5% (U.S. market, long-term historical average)

### Additional Reading

**Modern Portfolio Theory & Risk Management:**
- Markowitz, H. (1952). "Portfolio Selection." *Journal of Finance*, 7(1), 77-91.
- Sharpe, W. F. (1964). "Capital Asset Prices: A Theory of Market Equilibrium under Conditions of Risk." *Journal of Finance*, 19(3), 425-442.

**Behavioral Finance (Context for Limitations):**
- Kahneman, D., & Tversky, A. (1979). "Prospect Theory: An Analysis of Decision under Risk." *Econometrica*, 47(2), 263-291.
- Shiller, R. J. (2015). *Irrational Exuberance* (3rd ed.). Princeton University Press.

### Limitations & Assumptions

1. **Model Risk:** DCF models are highly sensitive to input assumptions (growth rates, discount rates)
2. **Historical Bias:** Past financial performance and volatility do not guarantee future results
3. **Data Quality:** Free-tier APIs may have limitations in data coverage and accuracy
4. **Sector Applicability:** DCF less suitable for financial institutions (banks, insurance) and early-stage companies
5. **Market Efficiency:** Models assume rational pricing; behavioral biases and market sentiment can cause deviations

### Citation

If you use this codebase for academic research, please cite:

```
@software{privatinvestor_mvp,
  title = {Privatinvestor MVP: Academic DCF Valuation Engine},
  author = {Milan Radisavljevic},
  year = {2025},
  url = {https://github.com/[your-username]/privatinvestor-mvp},
  note = {Implements Damodaran (2025) Two-Stage FCFE DCF and Hilpisch (2018) Monte Carlo VaR}
}
```

---

**Last Updated:** 13. Januar 2026 (Abend)
**Version:** 0.2.1 (Negative Equity Fix + D/E Conversion + Fair Value Bounds)
**Python Dependencies:** See `requirements.txt` for versions
**Node.js Version:** 18+ recommended
