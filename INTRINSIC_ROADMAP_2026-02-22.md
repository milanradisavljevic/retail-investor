# INTRINSIC — Gesamtplan: Aktueller Stand bis Monetarisierung

**Datum:** 2026-02-22
**Autor:** Claude Opus (Architekt) + Milan
**Zweck:** Vollständige Übersicht aller erledigten, offenen und geplanten Features

---

## TEIL 1: Was ist erledigt (lt. CHANGELOG + Runs)

### Phase 0 — Critical Stabilization ✅ (2026-02-06, 1 Tag)
- Build-Fix (Server/Client Components)
- TypeScript Errors eliminiert (57 → 0)
- Settings-Persistenz repariert
- Watchlist repariert
- avgMetrics-ETL (99%+ Coverage)
- Shield-Strategie validiert
- Data Integrity Gate
- Phase-0-Review (Kimi)

### Phase 1a — Preisbasierte Strategien ✅ (2026-02-07, 1 Tag)
- Momentum-Only Validierung (780% Return, extremer Survivorship Bias → nicht für Produktion)
- Hybrid-Strategie Validierung (110.90% Return, Sharpe 0.39 → RECOMMENDED)
- Shield Backtests (R2000: 48%, NDX100: 35%)
- Backtest-Framework mit Rebalancing, Equity/Drawdown Charts

### Phase 1b — Fundamentals Infrastructure ✅ (2026-02-08 bis 2026-02-12, 5 Tage)
- 7 Presets: Magic Formula, Piotroski F-Score, GARP, Compounder, Deep Value, Dividend Quality, Shield
- yfinance Bridge mit >90% Cache Hits
- Price Targets, Per-Share-Metriken, Group Medians
- PEG für GARP
- Dividend-Filter (Yield >1.5%, Payout <80%)
- Strategy Selector UI mit Tier-Badges

### Phase 2 — Macro Intelligence ✅ (2026-02-10 bis 2026-02-12, 3 Tage)
- FRED Macro-Daten (Fed Funds Rate, 10Y Yield, VIX, CPI, Spread)
- Regime Detection: RISK_ON / NEUTRAL / RISK_OFF / CRISIS
- Preset-aware Regime Overlays
- Validierte Backtests: 5 Presets × 2 Universen × 2 Overlay-Varianten
- Regime-Widget im Strategy Lab

### IND-Tasks (Independent) ✅ (2026-02-12)
- IND-1: Europäische Universen (DAX 40, CAC 40, FTSE 100, Euro Stoxx 50) — Configs erstellt
- IND-2: Stock Detail Page Pro (Peer Comparison, Score History, Prev/Next Nav)
- IND-3: Sidebar + Homepage Polish (Live Run History, relative Time)
- IND-4: Data Health Dashboard (/health mit Freshness, Coverage, System)
- IND-5: Test Suite Expansion (99 neue Tests → 198 total)
- IND-6: README + DECISIONS.md + ARCHITECTURE.md

### Phase 1c — Data Infrastructure Upgrade ✅ (2026-02-12 bis 2026-02-17)
- DB-Konsolidierung (provider_cache Tabelle, Multi-Provider Support)
- FMP ETL Script (Rate Limiting, CLI-Args, v3→stable Endpoints)
- Merge-Logik (getMergedFundamentals, transparente Integration)
- Health Dashboard Update (Provider Coverage Sektion)

### Phase 3e — Quality Pillar Upgrade ✅ (2026-02-17 bis 2026-02-19)
- Quality Pillar von 2 auf 4 Metriken erweitert (ROE, ROA, D/E, Gross Margin)
- Piotroski F-Score Integration (Modul + Card + Serialisierung + YoY-Felder)
- ROA Thresholds auf 0/10 kalibriert (datenbasiert)
- SEC EDGAR Bulk Audit für Operating Cash Flow (95% Coverage)

### Phase 3f — Architecture Cleanup ✅ (2026-02-19 bis 2026-02-22)
- F1: SSOT-Architektur (Single Source of Truth für Fundamentals)
- F2: Cross-Source Validation
- F3: Coverage Dashboard
- F4: Outlier Detection (Flagging-Only)
- F5: Staleness Alerting (Badge, 10% Threshold)
- F6: Survivorship Bias Research
- F7: Quality Observatory (Engine + API + /quality Page)
- Timestamp-Hotfix (Freshness auf Millisekunden normalisiert)
- Run-Level Quality Gate (Green/Yellow/Red, Blocker-Banner)
- SEC-First Orchestration (SEC-Sync Preflight in Daily Run)
- Repo-Hygiene (Legacy-Dokumente entfernt, .gitignore gehärtet)

### Phase 3g — Scoring Calibration ✅ (2026-02-22)
- WP1: Technical Pillar reaktiviert (52W-Range, Returns, Volatilität, Volumen im Batch-Pfad)
- WP2: Fundamentals Normalisierung (Decimal→Percent, D/E-Ratio, SSOT-Merge)
- WP3: Batch-Resilience (symbolweiser Single-Symbol-Recovery statt Hard-Fail)
- Deterministische Unit-Tests (5/5 grün)
- Stage-Gate BESTANDEN: alle 5 KPIs grün auf Russell 2000

### Ältere Meilensteine (vor Phase 0)
- Grundlegende Scoring-Engine (4-Pillar)
- Finnhub + yfinance Integration
- SQLite Caching
- Next.js Dashboard mit Dark Finance Theme
- Strategy Lab (Live + Backtest UI)
- Russell 2000 Full Universe (1943 Symbole)
- Company Name Metadata (100% Coverage)
- Backtesting Framework (Strategy Comparison, Equity/Drawdown Charts)
- Price Target Model mit Fair Value
- Top-20 Grid mit Entry/Exit Targets
- Manual Run Trigger (GUI + API)

---

## TEIL 2: Aktueller Zustand (22. Feb 2026)

### Scoring-Qualität (Russell 2000, 1943 Symbole)
| Metrik | Wert |
|--------|------|
| Data Quality Mean | 96.6 |
| Total Score Mean | 47.8 (StdDev 13.6, 565 unique) |
| Valuation >0 | 97.5% |
| Quality >0 | 98.9% |
| Technical StdDev | 22.3 (88 unique) |
| Fair Value Coverage | 99.7% |
| Sektor Coverage | 99.6% |
| Batch-Failure (DQ≤50) | 0.3% (5 Symbole) |
| Top-20 Diversifikation | 12 Sektoren vertreten |

### Infrastruktur-Status
| Komponente | Status |
|------------|--------|
| Scoring-Engine (4 Pillars) | ✅ Vollständig, kalibriert |
| Backtesting-Framework | ✅ Funktional |
| 7 Strategy Presets | ✅ Implementiert |
| Macro Regime Detection | ✅ FRED + Overlays |
| Quality Observatory | ✅ Engine + API + UI |
| Quality Gate | ✅ Green/Yellow/Red |
| SEC EDGAR Integration | ✅ Bulk Audit |
| FMP Integration | ✅ ETL + Merge (Free Tier) |
| yfinance Batch Provider | ✅ Normalisiert, gehärtet |
| US Universes (3) | ✅ NASDAQ-100, S&P 500, Russell 2000 |
| EU Universe Configs (4) | ✅ DAX 40, CAC 40, FTSE 100, Euro Stoxx 50 |
| EU Universe Runs | ❌ Noch nicht durchgeführt |
| Portfolio-Tracking | ❌ Nicht implementiert |
| Export (PDF/Excel) | 🟡 Prototyp vorhanden (Nordstern App), Bugs offen |
| Auth/Payment | ❌ Nicht implementiert |
| CI/CD | ❌ Nicht implementiert |
| Deployment | ❌ Lokal (localhost) |

---

## TEIL 3: Offene Features — Gesamtliste

Alles was in vergangenen Chats diskutiert wurde, hier konsolidiert und kategorisiert.

### A. Daten & Universes
1. **EU Universe Runs durchführen** — DAX 40, CAC 40, FTSE 100, Euro Stoxx 50 erstmals scoren
2. **Asien-Universes** — Nikkei 225, SENSEX (Configs + Runs)
3. **LatAm-Universes** — Ibovespa (Config + Runs)
4. **ETF-Universes** — SPY, QQQ, IWM, Sektor-ETFs (vereinfachtes Scoring: Technical + Risk)
5. **REIT-Universe** — FFO statt EPS, AFFO Yield
6. **Russell 2000 FMP-Befüllung abschließen** — ~8 Tage bei 250 Calls/Tag, läuft
7. **FMP Tier-Entscheidung** — Free vs. $19/Monat (nach Monetarisierung)
8. **systemd Timer für täglichen ETL** — Automatisierung FMP + SEC + yfinance
9. **Historische Index-Zusammensetzung** — Survivorship Bias in Backtests (kostenpflichtige API)

### B. Scoring & Analytik
10. **Anomalie-Detektor** — Rule-Based Hybrid: Score-Divergenz, Sektor-Rotation, Volume Spikes, Valuation Compression (bereits konzipiert)
11. **Sektor-Rotation-Detektor** — Identifiziere Sektor-Trends über Runs hinweg
12. **Compare Runs UI** — Side-by-side Vergleich, Score-Änderungen, Delta-Tracking
13. **Forward Testing Dashboard** — Track Recommendations vs. Actual Performance
14. **Monte-Carlo Import-Fix** — Python-Import scoring.composite + fehlender data/performance-Ordner

### C. Portfolio & Persönliches
15. **Portfolio-Tracking** — Datenmodell, CRUD API, UI, gewichteter Score
16. **Diversifikations-Dashboard** — Pie Charts (Sektor, Land, Cap), Exposure-Heatmap
17. **Performance vs. Benchmark** — Portfolio gegen SPY/QQQ
18. **EUR-Umrechnung** — Alle Preise/Fair Values optional in EUR anzeigen (ECB-Kurs oder yfinance FX)
19. **Portfolio-Rebalancing-Vorschläge** — "Du hast 43% Cash, empfohlen: 20%"

### D. UI/UX & Polish
20. **GUI-Polish** — Konsistenz der Dark-Finance-Theme über alle Pages
21. **Run Progress Indicator** — Live-Fortschritt während Runs (SSE oder Polling)
22. **Information/Education Layer** — Tooltips, "Was bedeutet dieser Score?", Methodik-Erklärungen
23. **Earnings-Kalender (Portfolio-gefiltert)** — Nur relevante Holdings zeigen
24. **Mobile Responsive** — Desktop-First, aber Mindest-Lesbarkeit auf Tablet
25. **i18n** — Deutsch/Englisch Toggle (bewusst gestrichen für MVP, ggf. Post-Launch)

### E. Export & Reports
26. **PDF Export** — Strukturierter Report pro Run (Prototyp vorhanden, Bugs fixen)
27. **Excel Export** — Full Data, alle Scores (Prototyp vorhanden, Bugs fixen)
28. **Daily Briefing Email** — Automatischer Bericht nach Run

### F. Deployment & Sicherheit
29. **FMP API Key rotieren** — Key steht im Chat-Verlauf (Security Risk)
30. **Security-Audit** — npm/pip audit, Secret Scan, Static Analysis
31. **CI/CD Pipeline** — GitHub Actions
32. **Hosting-Entscheidung** — Vercel vs. Self-hosted VPS
33. **PWA Setup** — Kein native App vor 1000+ Nutzer

### G. Monetarisierung
34. **Auth System** — Clerk/Auth0 (OAuth, Email/Password)
35. **User-Datenbank** — users, user_portfolios, user_settings
36. **Protected Routes** — Auth-Guards
37. **Email Alerts** — Trigger bei Score-Änderungen >5 Punkte
38. **Stripe Integration** — Checkout, Webhooks, Subscription Tiers
39. **Billing UI** — Subscription-Management
40. **Legal** — ToS (DE+EN), Privacy Policy (GDPR), Disclaimer, Impressum
41. **Tier-Definition** — Free vs. Premium Feature-Split

### H. Live Testing & Validierung
42. **Paper Trading Mode** — Simuliertes Portfolio
43. **Performance Tracking** — Actual vs. Backtest über Zeit
44. **Beta User Program** — 20-50 Testnutzer
45. **Alpha Validation** — 6 Monate Live-Tracking

---

## TEIL 4: Vorgeschlagener Phasenplan bis Live

### Phase 4: Universe Expansion + EUR (2-3 Wochen)

**Warum zuerst:** Die Scoring-Engine ist jetzt kalibriert. Europäische Universes sind konfiguriert, Runs fehlen. Das ist der größte Feature-Hebel mit geringstem Aufwand.

| # | Task | Aufwand | Agent |
|---|------|---------|-------|
| 4.1 | EU Universe Runs (DAX, CAC, FTSE, EuroStoxx) + Validierung | 2 Tage | GLM/Qwen |
| 4.2 | EUR-Umrechnung (ECB/yfinance FX-Rate, Toggle in Settings) | 2 Tage | Codex |
| 4.3 | Universe-Selector Polish (Dropdown mit Regionen: US / Europe / Asia) | 1 Tag | GLM |
| 4.4 | Asien-Universes Configs (Nikkei 225 + Validierung) | 1-2 Tage | Qwen |
| 4.5 | ETF-Universe (SPY, QQQ, IWM + vereinfachtes Scoring) | 2 Tage | GLM |
| 4.6 | Monte-Carlo Import-Fix + data/performance Ordner | 0.5 Tag | Codex |
| 4.7 | systemd Timer für täglichen ETL (SEC + FMP + yfinance) | 1 Tag | Qwen |

**Gesamtaufwand:** ~10-12 Tage
**Gate:** EU-Runs liefern DQ >90, EUR-Toggle funktioniert, ETF-Scoring differenziert

---

### Phase 5: Portfolio + Export (2-3 Wochen)

**Warum:** Portfolio-Tracking ist der größte Wert-Hebel für den Nutzer. Export wird für Beta-Tests benötigt.

| # | Task | Aufwand | Agent |
|---|------|---------|-------|
| 5.1 | Portfolio-Datenmodell (SQLite: symbol, quantity, buy_price, buy_date, currency) | 0.5 Tag | Qwen |
| 5.2 | Portfolio CRUD API (/api/portfolio) | 1 Tag | GLM |
| 5.3 | Portfolio UI (Eingabemaske, Holdings-Liste, Gesamtwert in EUR/USD) | 2 Tage | Codex |
| 5.4 | Portfolio-Score (gewichteter Durchschnitt der Holdings) | 0.5 Tag | GLM |
| 5.5 | Diversifikations-Dashboard (Sektor/Land/Cap Pie Charts) | 2 Tage | Codex |
| 5.6 | Performance vs. Benchmark (Portfolio gegen SPY/QQQ) | 1 Tag | GLM |
| 5.7 | PDF Export Bugfix + Polish (Prototyp-Fehler aus Review beheben) | 1-2 Tage | Codex |
| 5.8 | Excel Export Bugfix + Polish | 1 Tag | GLM |
| 5.9 | Compare Runs UI (Side-by-side, Delta-Tracking) | 2 Tage | Codex |

**Gesamtaufwand:** ~11-14 Tage
**Gate:** Portfolio speichert, zeigt korrekte Werte in EUR, PDF/Excel fehlerfrei

---

### Phase 6: Intelligence Layer (1-2 Wochen)

**Warum:** Differenzierung von Koyfin/Finviz — was kann INTRINSIC, das andere nicht bieten?

| # | Task | Aufwand | Agent |
|---|------|---------|-------|
| 6.1 | Anomalie-Detektor (Rule-Based: Score-Divergenz, Volume Spikes, Sektor-Outlier) | 3 Tage | Claude+Qwen |
| 6.2 | Information/Education Layer (Tooltips, "Was bedeutet dieser Score?", Methodik-Page) | 2 Tage | GLM |
| 6.3 | Earnings-Kalender gefiltert auf Portfolio/Watchlist | 1 Tag | Codex |
| 6.4 | Forward Testing Dashboard (Track Picks vs. Realität) | 2 Tage | GLM |
| 6.5 | Run Progress Indicator (SSE oder Polling mit ETA) | 1 Tag | Codex |

**Gesamtaufwand:** ~9-11 Tage
**Gate:** Anomalien werden erkannt, Tooltips erklären jeden Score, Forward Testing läuft

---

### Phase 7: Deployment Readiness (1 Woche)

**Warum:** Ohne Security und CI/CD kein Go-Live.

| # | Task | Aufwand | Agent |
|---|------|---------|-------|
| 7.1 | FMP API Key rotieren | 0.5 Tag | Milan |
| 7.2 | Security-Audit (npm/pip audit, Secret Scan) | 1-2 Tage | GLM |
| 7.3 | CI/CD Pipeline (GitHub Actions: Build + Test + Deploy) | 1-2 Tage | Codex |
| 7.4 | Hosting Setup (Vercel oder VPS) | 1 Tag | Milan+Codex |
| 7.5 | GUI-Polish Pass (Konsistenz, Dark Theme, Edge Cases) | 1-2 Tage | GLM |
| 7.6 | PWA Manifest (Add-to-Homescreen, Offline-Banner) | 0.5 Tag | Codex |

**Gesamtaufwand:** ~5-8 Tage
**Gate:** Build grün in CI, Security-Audit sauber, erreichbar unter Domain

---

### Phase 8: Monetarisierung (3-4 Wochen)

**Warum:** Ab hier verdient das Produkt Geld.

| # | Task | Aufwand | Agent |
|---|------|---------|-------|
| 8.1 | Auth System (Clerk/Auth0, OAuth + Email/Password) | 2-3 Tage | Codex |
| 8.2 | User-DB Schema (users, user_portfolios, user_settings) | 1 Tag | Qwen |
| 8.3 | Protected Routes + Auth-Guards | 1 Tag | GLM |
| 8.4 | Tier-Definition (Free: 1 Universe + Top 10 / Premium: Alle Universes + Portfolio + Export + Alerts) | Milan | — |
| 8.5 | Stripe Integration (Checkout, Webhooks) | 2-3 Tage | Codex |
| 8.6 | Billing UI (Subscription-Management) | 1-2 Tage | Codex |
| 8.7 | Email Alerts (Score-Änderungen >5 Punkte) | 2 Tage | Qwen |
| 8.8 | Daily Briefing Email (automatisch nach Run) | 1 Tag | GLM |
| 8.9 | Legal: ToS (DE+EN) | 1 Tag | Milan+GLM |
| 8.10 | Legal: Privacy Policy (GDPR) | 1 Tag | Milan+GLM |
| 8.11 | Legal: Disclaimer (Investment-Advice-Waiver) | 0.5 Tag | Milan+GLM |
| 8.12 | Legal: Impressum | 0.5 Tag | Milan |

**Gesamtaufwand:** ~14-18 Tage
**Gate:** User kann sich registrieren, zahlen, Premium-Features nutzen, Legal steht

---

### Phase 9: Live Testing + Beta (laufend, ab Go-Live)

| # | Task | Aufwand |
|---|------|---------|
| 9.1 | Paper Trading Mode | 1 Woche |
| 9.2 | Beta User Program (20-50 Tester) | laufend |
| 9.3 | Performance Tracking (Actual vs. Backtest) | laufend |
| 9.4 | Alpha Validation (6 Monate Tracking) | 6 Monate |
| 9.5 | Feedback-Loop → Feature-Iteration | laufend |

---

## TEIL 5: Timeline-Übersicht

```
Phase 3g  ████ ✅ HEUTE (22. Feb) — Scoring kalibriert, Stage-Gate bestanden

Phase 4   ██████████████  Universe Expansion + EUR      ~ März 1-14
Phase 5   ████████████████████  Portfolio + Export       ~ März 10-28
Phase 6   ██████████████  Intelligence Layer             ~ März 24 - Apr 5
Phase 7   ████████  Deployment Readiness                 ~ Apr 5-12
Phase 8   ██████████████████████████  Monetarisierung    ~ Apr 12 - Mai 5

Phase 9   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Live Testing + Beta   ~ ab Mai
```

**Geschätzte Zeit bis Go-Live (zahlende User möglich):** ~10 Wochen (Anfang Mai 2026)
**Geschätzte Zeit bis Alpha-Validierung:** +6 Monate (November 2026)

---

## TEIL 6: Bewusst NICHT im Scope (Post-Launch / Backlog)

| Feature | Grund für Ausschluss |
|---------|---------------------|
| i18n (DE/EN Toggle) | MVP: Mixed Language akzeptabel, kein Blocker |
| Mobile Native App | Erst ab 1000+ User, PWA reicht |
| IBKR API Trading | Erst nach Alpha-Validierung |
| Custom Strategy Builder | Premium-Feature Post-Launch |
| Historische Index-Zusammensetzung | Kostenpflichtige API, Survivorship Bias dokumentiert |
| LLM Integration (Sentiment, Ask-Anything) | Post-Launch Differenziator |
| Video Tutorials | Nach Launch |
| Marketing Content | Nach Monetarisierung |
| Portfolio Rebalancing-Vorschläge | Post-Launch, nach Portfolio-Tracking |
| Tax Loss Harvesting | Post-Launch, regulatorisch komplex |
| REIT-Universe (FFO-Scoring) | Nische, nach Core-Universes |
| Shanghai/Bovespa Universes | Datenverfügbarkeit kritisch, nach Kernmärkten |
| Institutional Features (White-Label, API) | Erst bei signifikantem Interesse |
| Multi-Portfolio-Management | Post-Launch |

---

## TEIL 7: Architektur-Entscheidungen (aktuell gültig)

| ID | Entscheidung | Datum |
|----|--------------|-------|
| D001 | Ajv over Zod für Schema Validation | 2026-02 |
| D002 | SQLite mit better-sqlite3 | 2026-02 |
| D003 | yfinance als Primary Data Provider | 2026-02 |
| D004 | FMP als Secondary Provider (Free Tier) | 2026-02 |
| D005 | SEC EDGAR für Bulk Audit | 2026-02 |
| D006 | FRED API für Macro Data | 2026-02 |
| D007 | Median Imputation für Missing Values | 2026-02 |
| D008 | Batch Fetching für yfinance | 2026-02 |
| D009 | European Universe Native Tickers (.DE, .PA, .L) | 2026-02 |
| D010 | SSOT-Merge: Merged Fundamentals = Baseline, Live = Backfill | 2026-02 |
| D011 | Quality Gate: Green/Yellow/Red mit Blocker | 2026-02 |
| D012 | ROA Thresholds 0/10 (datenbasiert) | 2026-02 |
| D013 | Regime Overlay optional + preset-aware | 2026-02 |
| D014 | Desktop-First, PWA statt Native App | 2026-02 |
| D015 | Clerk/Auth0 für Auth (Entscheidung ausstehend) | — |
| D016 | Stripe für Payment | — |
| D017 | Vercel vs. VPS (Entscheidung ausstehend) | — |
