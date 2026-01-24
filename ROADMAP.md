# ROADMAP

Aktuelle Richtung und Prioritäten für das Retail Investor MVP.

---

## ✅ Kürzlich erledigt
- Universe- und Preset-Selector mit Regionen/Flaggen, Runtime-Anzeige, Status-Badges.
- Full-Universe-Library aufgebaut (US/EU/ASIA/LATAM) inkl. Backtest-Skripte und UI-Integration.
- Historical Fetcher erweitert (2015–2025, Env-Override) mit Alias-Support für umbenannte Ticker.

---

## 🔥 Nächste Schritte (Q1 2026)
1) Equity Curve & Drawdown Charts (Blocker)
   - Ziel: saubere Time-Series für alle Strategien (Hybrid/Momentum/4-Pillar) im Dashboard.
   - Tasks: Datenpfad stabilisieren, Recharts-Legende/Tooltip vereinheitlichen, CSV+JSON Struktur finalisieren.
2) Rebalancing + Slippage Backend
   - Ziel: realistischere Backtests durch Handelskosten/Slippage und planbares Rebalancing.
   - Tasks: Slippage/Cost-Model in Scoring-Engine, Rebalance-Schedule (quarterly/ monthly toggle), CLI/Env-Flags.
3) Dev-/Test-Universes gruppieren (statt verstecken)
   - Ziel: Produktions-User sehen nur produktive Universes, Dev kann Test/Sample aufklappen.
   - Ansatz: Neue Gruppe „Development“ (collapsed) im Selector; optional Toggle für Dev-Modus.
4) Historical Data vervollständigen
   - Ziel: 100% CSV-Coverage für US/Intl Runs.
   - Offene Lücken: S&P 500 Full (11 Ticker), Russell2000_full (2 Ticker), ggf. Intl Rechecks.

---

## 📋 Backlog (geordnet nach Nutzen)
- Filter-Integration für Live Runs (Defense/Fossil/Crypto/Liquidity/MCap) analog Backtest.
- Performance/Infra: Caching/Batching für Provider-Latenzen, optional Redis; TSX RPC fallback.
- Data Enrichment: Logos, Echtzeit-Preis-Polling/Websocket, Sector/Industry Analytics.
- Portfolio/Exports: Watchlists, Positions/P&L, PDF/Excel Reports.
- UX: Mobile/Accessibility, Internationalisierung (EN/DE), High-contrast Mode.

---

## 🧭 Prinzipien
- Produktions-Defaults schlank halten; Dev-/Test-Flows klar trennen.
- Datenpfade deterministisch (CSV+JSON) und lokal reproduzierbar halten.
- Optionalität via Feature-Flags/Env, keine Breaking Changes für bestehende Pipelines.
