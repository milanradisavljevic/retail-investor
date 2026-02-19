# Calculation Reference

Ziel: Jede zentrale Berechnung offenlegen, inkl. Formel, Schwellwerten und Codepfad.

Formale LaTeX-Ausgabe fuer externe/serioese Dokumentation: `docs/CALCULATION_REFERENCE.tex`

## 1) Normalisierung (0-100)

Code: `src/scoring/normalize.ts`

- `linearScale(x) = clamp(outMin + ((x-inMin)/(inMax-inMin))*(outMax-outMin))`
- `inverseLinearScale(x) = clamp(outMax - ((x-inMin)/(inMax-inMin))*(outMax-outMin))`
- `normalizeToRange(value, {low,high}, invert)`:
  - `value = null` oder `NaN` -> `50`
  - invertiert (`lower is better`):
    - `value <= low` -> `100`
    - `value >= high` -> `0`
    - sonst lineare Inversion zwischen `low..high`
  - nicht invertiert (`higher is better`):
    - `value <= low` -> `0`
    - `value >= high` -> `100`
    - sonst lineare Skalierung zwischen `low..high`
  - Soft-Cap: Rueckgabe ist `min(rawScore, 95)`

## 2) Fundamentals (Live-Scoring)

Code: `src/scoring/fundamental.ts`

Default-Thresholds:

- `pe: low 15, high 30`
- `pb: low 1.5, high 5`
- `ps: low 1, high 5`
- `roe: low 8, high 35`
- `debtEquity: low 0.2, high 1.5`
- `grossMargin: low 20, high 60`
- `fcfYield: low 2, high 10`

### 2.1 Einzelmetriken

- `peScore`, `pbScore`, `psScore`, `roeScore`, `grossMarginScore` via `normalizeToRange(...)`
- `debtEquityScore`:
  - wenn `debtToEquity < 0` -> `0`
  - sonst `normalizeToRange(..., invert=true)`
- `grossMarginScore`:
  - via `normalizeToRange(grossMargin, thresholds.grossMargin, invert=false)`
  - Default: low=20, high=60 (higher is better, in %)
  - Akademische Basis: Novy-Marx 2013 "The Other Side of Value"
- `fcfYieldScore`:
  - Berechnung: `fcfYield = (freeCashFlow / marketCap) * 100` (in %)
  - Falls `fcfYield < 0`: Score = 0 (Cash-Burner werden bestraft)
  - Sonst: `normalizeToRange(fcfYield, thresholds.fcfYield, invert=false)`
  - Default: low=2, high=10 (higher is better, in %)

### 2.2 Valuation-Pillar

- Komponenten: `P/E`, `P/B`, `P/S`, `FCF Yield` (NEU)
- Falls mindestens 2 von 4 Inputs verfuegbar: gleichgewichtetes Mittel der verfuegbaren Scores
- Falls <2 Inputs: `valuation = 0` und `isInsufficient = true`
- FCF Yield Sonderbehandlung: Negative FCF -> Score 0 (nicht neutral)

### 2.3 GARP-Overlay

Code: `src/scoring/formulas/peg.ts`, `src/scoring/fundamental.ts`

- Aktiv, wenn `PRESET`/`SCORING_PRESET` == `garp`
- `growthPercent = earningsGrowth * 100`
- `PEG = trailingPE / growthPercent` (nur bei `growth > 0` und `PE >= 0`)
- `pegScore` Mapping:
  - `<=0.5: 100`
  - `0.5..1.0: 100->75`
  - `1.0..1.5: 75->50`
  - `1.5..2.0: 50->25`
  - `2.0..3.0: 25->0`
  - `>3.0: 0` (bei `peg > 5` gecappt)
- Blend: `valuation = 0.7 * valuation + 0.3 * pegScore`
- Wenn PEG nicht berechenbar: neutral `pegScore = 50` mit Skip-Reason.

### 2.4 Quality-Pillar und Fundamental Total

- Komponenten: `ROE`, `D/E`, `Gross Margin` (NEU)
- Falls mindestens 2 von 3 Inputs verfuegbar: gleichgewichtetes Mittel der verfuegbaren Scores
- Falls <2 Inputs: `quality = 0`
- Gross Margin: Novy-Marx 2013 zeigt dass Gross Profitability der staerkste Quality-Predictor ist
- Vorher: min 1 von 2 (zu tolerant). Nachher: min 2 von 3 (konsistent mit Valuation)
- Fundamental-Total:
  - falls `isInsufficient`: `0`
  - sonst `(valuation + quality) / 2`

## 3) Technical (Live-Scoring)

Code: `src/scoring/technical.ts`

### 3.1 Trend-Score

- Basis: 52W-Position `((price-low52)/(high52-low52))*100`
- Bins:
  - `>=80 -> 90`
  - `>=60 -> 75`
  - `>=40 -> 60`
  - `>=20 -> 40`
  - sonst `25`
- Tages-Adjust:
  - `dayChangePercent > 2` -> `+10`
  - `dayChangePercent < -2` -> `-10`

### 3.2 Momentum-Score

- 5-Day Momentum: unveraendert (Short-Term Signal)
- 13-Week Momentum: unveraendert (Medium-Term)
- 26-Week Momentum: unveraendert (Intermediate)
- 52-Week Momentum: ERSETZT durch 12-1 Momentum
  - `momentum12m1m = priceReturn52Week - (priceReturn5Day * 4)`
  - Akademische Basis: Jegadeesh & Titman 1993, Gray "Quantitative Momentum" 2016
  - "past 12-month cumulative returns, skipping the most recent month"
  - Approximation: 5D * 4 ≈ 1 Monat. Exaktes 4W-Feld als Follow-Up geplant.
  - Fallback: Falls priceReturn5Day = null, wird shortTermComponent = 0 (unreinigter 52W Return)
- Durchschnitt aus verfuegbaren Signalen, jeweils diskret auf 0-100 gemappt.
- Wenn keine Returns vorliegen -> `50`.

### 3.3 Volatility-Score

- `vol3m < 15 -> 90`
- `< 25 -> 70`
- `< 35 -> 50`
- `< 50 -> 35`
- sonst `20`

Beta-Adjust:

- `<0.6:+20`, `<0.8:+12`, `<=1.0:+0`, `<=1.2:-10`, `<=1.5:-20`, `>1.5:-30`

### 3.4 Technical Total

- `technicalTotal = 0.3*trend + 0.4*momentum + 0.3*volatility`

## 4) Evidence-Pillars und Gesamt-Score (Live)

Code: `src/scoring/evidence.ts`

- `valuation = fundamental.components.valuation`
- `quality = fundamental.components.quality`
- `technical = (trend + momentum) / 2`
- `risk`:
  - Standard: `(volatility + debtEquityScore) / 2`
  - Shield-Modus: `(betaRisk + volatility)/2` mit Beta-Risk-Mapping
- Gesamt:
  - `total = valuation*wV + quality*wQ + technical*wT + risk*wR`
  - Defaultgewichte: je `0.25`

Confidence (Erklaerungsebene):

- `high`: Spread < 20 und min-Pillar >= 50
- `low`: Spread > 40 oder min-Pillar < 30
- sonst `medium`

## 5) Backtest Pure Scoring (Preset-Pfad)

Code: `src/scoring/pure/score_symbol.ts`, `scripts/backtesting/rank_stocks_preset.ts`

Hinweis: Dieser Pfad nutzt dieselben Kennzahlen wie das Live-Scoring, aber mit leichtgewichtiger Implementierung.

### 5.1 Valuation (pure)

Pro Metrik (`PE/PB/PS/FCF_YIELD`):

- missing -> `50`
- `<= low -> 100`
- `low..high -> 100 - ((m-low)/(high-low))*40` (also 100..60)
- `> high -> max(10, 60 - min((m-high)/high, 1.5)*40)`
- FCF Yield: Negativer FCF -> Score 0 (Cash-Burner)

Valuation = Mittel der 4 Metriken (min 2/4 erforderlich), danach ggf. GARP-Blend (70/30 mit PEG).

### 5.2 Quality (pure)

Komponenten: `ROE`, `D/E`, `GROSS_MARGIN` (min 2/3 erforderlich)

Start bei `50`:

- ROE:
  - `>= roe.high` -> `+25`
  - `>= roe.low` -> `+10`
  - sonst `-10`
- Debt/Equity:
  - `<= de.low` -> `+15`
  - `<= de.high` -> `+5`
  - sonst `-15`
- Gross Margin:
  - `>= gm.high` -> `+20`
  - `>= gm.low` -> `+8`
  - sonst `-8`

Clamping auf `0..100`.

### 5.3 Technical (pure)

- Momentum:
  - `momentum12m1m = return52w - (return5d * 4)` (12-1 Momentum)
  - `momentum = clamp(((r13*0.6 + r26*0.4) + 0.5) * 100)`
- Range-Score aus 52W-Position (piecewise)
- Wenn Returns vorhanden:
  - `technical = momentum*0.6 + range*0.4`
- sonst `technical = range`

### 5.4 Risk (pure)

Volatilitaets-Bins:

- `<=15 -> 100`
- `<=25 -> 85 + (25-vol)*1.5`
- `<=30 -> 70 + (30-vol)*4`
- `<=35 -> 50 + (35-vol)*4`
- `<=40 -> max(10, (40-vol)*2)`
- `>40 -> 5`

### 5.5 Pure Total

- `total = valuation*wV + quality*wQ + technical*wT + risk*wR`

## 6) Preset-Filter

Code: `src/scoring/pure/filters.ts`

- Unterstuetzt `min_*`, `max_*` fuer Felder wie `pe`, `pb`, `ps`, `peg`, `debt_equity`, `roe`, `payout_ratio`, `dividend_yield`, `beta`, `market_cap`, `volatility`.
- `min_..._score` Schluessel werden nach dem Scoring auf Pillarwerte angewendet.
- Spezialfall: `max_volatility <= 1.5` wird als Prozent interpretiert (`*100`).

## 7) Regime-Detection

Code: `src/regime/engine.ts`, `src/regime/history.ts`

Signale:

- `VIX` -> Score in `[-1, +1]`, Override bei `VIX > 40` auf `CRISIS`
- `T10Y2Y` (Yield Curve) -> Score in `[-1, +1]`
- `FEDFUNDS` Momentum:
  - `delta3m = fed_now - fed_3m_ago`
  - `delta6m = fed_now - fed_6m_ago`
- `CPI YoY = (cpi_now / cpi_12m_ago - 1) * 100`

Gewichtete Aggregation (bei Datenluecken dynamisch re-normalisiert):

- `0.35*VIX + 0.30*Yield + 0.20*Fed + 0.15*CPI`

Mapping:

- `< -0.6` oder `VIX>40` -> `CRISIS`
- `< -0.2` -> `RISK_OFF`
- `<= 0.4` -> `NEUTRAL`
- `> 0.4` -> `RISK_ON`

Confidence:

- `availableSignals / 4`

## 8) Regime-Overlay im Backtest

Code: `scripts/backtesting/run-backtest.ts`

Policies pro Rebalance:

- `RISK_ON`: invest `1.00`, technical boost `+0.10`
- `NEUTRAL`: invest `1.00`, keine Boosts
- `RISK_OFF`: invest `0.70`, quality `+0.10`, risk `+0.05`
- `CRISIS`: invest `0.40`, quality `+0.15`, risk `+0.10`, `min_quality_score +10`

Gewichtsanpassung:

- Pillar-Booster werden addiert und danach auf Summe `1.0` normalisiert.

Cash-Effekt:

- Nur `investmentFraction` des Cash wird in Top-Picks investiert.
- Rest bleibt Cash mit implizit `0%` Rendite innerhalb der Rebalance-Periode.

## 9) Regime-Performance im Summary

Code: `scripts/backtesting/run-backtest.ts`

`performance_by_regime`:

- Fuer jede Rebalance-Periode:
  - `quarterReturn = endValue/startValue - 1`
  - akkumuliert je Regime via Multiplikatorprodukt
- Ausgabe je Regime:
  - `return_pct = (product - 1) * 100`
  - `avg_quarterly_return = mean(quarterReturn) * 100`
  - `quarters = Anzahl zugeordneter Quartale`

`regime_periods`:

- Aufeinanderfolgende Quartale mit gleichem Regime werden zu einer Periode zusammengefasst (`quarters_count`).

## 10) Default-Thresholds Uebersicht

| Metrik | Low | High | Richtung | Quelle |
|--------|-----|------|----------|--------|
| P/E | 15 | 30 | lower is better | Standard |
| P/B | 1.5 | 5 | lower is better | Standard |
| P/S | 1 | 5 | lower is better | Standard |
| ROE | 8% | 35% | higher is better | Standard |
| D/E | 0.2 | 1.5 | lower is better | Standard |
| Gross Margin | 20% | 60% | higher is better | Novy-Marx 2013 |
| FCF Yield | 2% | 10% | higher is better | Standard |

Hinweis: Presets koennen diese Thresholds ueberschreiben. Die obige Tabelle zeigt die Defaults.
