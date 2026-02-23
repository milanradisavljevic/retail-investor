# INTRINSIC — Finaler Phasenplan v2

**Datum:** 2026-02-22
**Revision:** v2 (nach Multi-Agent-Review: Qwen, GLM-5, Gemini 3.1 Pro)
**Architekt:** Claude Opus + Milan
**Philosophie:** Quality over Speed. Kein Feature shipped das nicht exzellent ist.

---

## STATUS QUO — Was bereits im Repo existiert (origin/main)

### Scoring & Daten ✅
- 4-Pillar Scoring Engine (Valuation, Quality, Technical, Risk) — kalibriert, Stage-Gate bestanden
- 7 Strategy Presets (Magic Formula, Piotroski, GARP, Compounder, Deep Value, Dividend Quality, Shield)
- SSOT-Architektur (Single Source of Truth für Fundamentals)
- Multi-Provider: yfinance (Primary) + FMP (Secondary, Free Tier) + SEC EDGAR (Bulk Audit)
- Quality Observatory (Engine + API + /quality Page)
- Quality Gate (Green/Yellow/Red mit Blocker-Banner)
- Macro Regime Detection (FRED: Risk On/Neutral/Risk Off/Crisis)
- Preset-aware Regime Overlays
- Outlier Detection + Staleness Alerting
- Backtesting Framework (Strategy Comparison, Equity/Drawdown Charts)
- Price Target Model mit Fair Value

### Universes ✅
- US: NASDAQ-100 (100%), S&P 500 (100%), Russell 2000 (1943 Symbole, DQ 96.6)
- EU Configs: DAX 40, CAC 40, FTSE 100, Euro Stoxx 50 (Configs erstellt, Runs ausstehend)

### Features (bereits implementiert) ✅
- Portfolio-Tracking (CRUD API, UI, Holdings, Gesamtwert, Diversifikation, Performance vs. Benchmark)
- Auth (Clerk: OAuth + Email/Password, Protected Routes, Middleware)
- CI/CD (GitHub Actions: Typecheck, Build, Tests, Audits, Deploy-Check)
- PDF Export (API Route + Report Generator)
- Excel Export (API Route + Excel Builder)
- Stock Detail Page Pro (Peer Comparison, Score History, Prev/Next Nav)
- Sidebar + Homepage Polish (Live Run History, relative Time)
- Data Health Dashboard (/health)
- Strategy Selector UI mit Tier-Badges
- Manual Run Trigger (GUI + API)
- 198 Tests (Unit + Integration)

### Infrastruktur ✅
- DB-Konsolidierung (provider_cache, Multi-Provider)
- FMP ETL Script (Rate Limiting, CLI, v3→stable)
- Merge-Logik (getMergedFundamentals)
- Company Name Metadata (100% Coverage Russell 2000)

---

## WAS OFFEN IST — Konsolidierte Feature-Liste

### Daten & Universes
1. EU Universe Runs durchführen (DAX 40, CAC 40, FTSE 100, Euro Stoxx 50)
2. EUR-Umrechnung (ECB/yfinance FX, Toggle in Settings)
3. Asien-Universe: Nikkei 225 (Config + Validierung + Runs)
4. ETF-Universe (SPY, QQQ, IWM, Sektor-ETFs, vereinfachtes Scoring)
5. Russell 2000 FMP-Befüllung abschließen (läuft, ~6 Tage Rest)
6. systemd Timer für täglichen ETL (SEC + FMP + yfinance)
7. Score-History-Tabelle (automatisch bei jedem Run mitschreiben)

### Scoring & Analytik
8. Anomalie-Detektor (Rule-Based Hybrid)
9. Compare Runs UI (Side-by-side, Delta-Tracking, Score-Änderungen)
10. Forward Testing Dashboard (Track Picks vs. Realität)
11. Sektor-Rotation-Signale (Cross-Run Trend-Analyse)
12. Monte-Carlo Import-Fix + data/performance Ordner

### Portfolio & Persönliches
13. Portfolio Export-Bugs fixen (Gold-Preis 8484%, fehlende Positionen, Delta-Spalte)
14. EUR in Portfolio (Holdings + Gesamtwert in EUR)
15. Earnings-Kalender gefiltert auf Portfolio/Watchlist
16. Lokale Watchlist-Alerts (SQLite-basiert, vor Email-System)

### UI/UX & Polish
17. GUI-Polish Pass (Dark Theme Konsistenz, Edge Cases, responsive Basics)
18. Education/Information Layer (Tooltips, "Was bedeutet dieser Score?", Methodik-Page)
19. Onboarding Flow (Welcome Wizard, Risk-Tolerance, Preset-Empfehlung, Portfolio-Setup)
20. Run Progress Indicator (SSE oder Polling mit ETA)
21. Error Recovery UI (Provider-Ausfall, Rate-Limit-Handling, User-Feedback)
22. Survivorship Bias Warnung im UI (bei Backtest-Ergebnissen)
23. Data-Quality-Trend (Visualisierung über Zeit, nicht nur Snapshot)

### Export & Reports
24. PDF Export Polish (Bugs aus Review beheben, strukturierter Report)
25. Excel Export Polish (Bugs beheben, vollständige Daten)
26. Compare Runs Export (PDF mit Delta-Analyse)
27. Backtest-Beweis-Export ("Trust but Verify" PDF)

### Deployment & Sicherheit
28. FMP API Key rotieren (SOFORT)
29. Security-Audit vervollständigen (CSP Headers, Rate Limiting für /api/*)
30. Hetzner VPS Setup (Docker/PM2, SQLite persistent, Domain)
31. PWA Polish (Manifest, Offline-Banner, Add-to-Homescreen)
32. Error Tracking (Sentry oder Alternative)
33. Cache Warming (erster Run nach Deploy beschleunigen)
34. ETL-Monitoring Dashboard (Alerts bei SEC/FMP/yfinance Failures)

### Monetarisierung
35. Tier-Definition (Free vs. Premium, Regime Overlays = Premium)
36. Stripe Integration (Checkout, Webhooks, Subscription Management)
37. Billing UI (Plan-Auswahl, Upgrade/Downgrade, Rechnungen)
38. Email Alerts Backend (Score-Änderungen, Regime-Wechsel)
39. In-App Notifications nach Run-Abschluss (statt Daily Briefing Email)
40. Legal: ToS (DE+EN) — mit externer Rechtsberatung
41. Legal: Privacy Policy (GDPR: Löschrecht, Datenexport, Cookie Consent)
42. Legal: Disclaimer (Investment-Advice-Waiver)
43. Legal: Impressum
44. GDPR-Tooling (User-Delete-API, Datenexport-Funktion, Cookie Consent Banner)

### Live Testing
45. Paper Trading Mode
46. Beta User Program (20-50 Tester)
47. Performance Tracking (Actual vs. Backtest)

---

## PHASENPLAN

### Phase 4: Universe Expansion + Daten-Fundament

**Ziel:** Alle Kernmärkte abgedeckt, EUR-Umrechnung, ETL automatisiert, Score-History startet.

| # | Task | Beschreibung | Aufwand | Agent |
|---|------|-------------|---------|-------|
| 4.1 | Hosting-Entscheidung fixieren | Hetzner VPS bestellen, Docker/PM2 Setup planen, Domain klären | 0.5 Tag | Milan |
| 4.2 | FMP API Key rotieren | Neuen Key generieren, .env aktualisieren, alten Key deaktivieren | 0.5 Tag | Milan |
| 4.3 | EU Universe Runs | DAX 40, CAC 40, FTSE 100, Euro Stoxx 50 erstmals scoren + validieren (DQ >90 Gate) | 2 Tage | GLM/Qwen |
| 4.4 | EU Fundamentals Coverage Test | Erst 100 Symbole testen bevor voller Run (yfinance EU-Coverage prüfen) | 0.5 Tag | Qwen |
| 4.5 | EUR-Umrechnung | ECB/yfinance FX-Rate, Toggle in Settings, alle Preise/Fair Values optional EUR | 2 Tage | Codex |
| 4.6 | Universe-Selector Polish | Dropdown mit Regionen (US / Europe / Asia), Flaggen-Icons, Universe-Count | 1 Tag | GLM |
| 4.7 | Nikkei 225 | Config erstellen, yfinance .T Suffixes validieren, Fundamentals-Coverage prüfen, Run | 2 Tage | Qwen |
| 4.8 | ETF-Universe | SPY, QQQ, IWM, XLK, XLF etc. + vereinfachtes Scoring (Technical + Risk, kein Valuation/Quality) | 2 Tage | GLM |
| 4.9 | Score-History-Tabelle | Neues Schema: (symbol, run_date, universe, total_score, val, qual, tech, risk). Bei jedem Run automatisch schreiben. | 1 Tag | Qwen |
| 4.10 | systemd Timer | Täglicher ETL: SEC-Sync → FMP-Load (250) → yfinance-Batch → Run trigger. Logging + Failure-Alert. | 1 Tag | Qwen |
| 4.11 | Monte-Carlo Import-Fix | Python-Import scoring.composite + data/performance Ordner erstellen | 0.5 Tag | Codex |
| 4.12 | ETL-Monitoring | Dashboard-Widget auf /health: letzte ETL-Runs, Success/Fail, Duration, Symbol-Count | 1 Tag | GLM |

**Gesamtaufwand:** ~14 Tage
**Gate:** EU-Runs DQ >90, EUR-Toggle funktioniert, Nikkei differenziert, ETFs scored, systemd Timer aktiv

---

### Phase 5: Intelligence Layer + Compare Runs

**Ziel:** Das was INTRINSIC von Koyfin/Finviz unterscheidet. Anomalien, Delta-Tracking, Forward Testing, Education.

| # | Task | Beschreibung | Aufwand | Agent |
|---|------|-------------|---------|-------|
| 5.1 | Compare Runs UI | Side-by-side Vergleich zweier Runs. Delta pro Symbol (Score-Änderung, Rang-Änderung). Highlight: Auf-/Absteiger. Filter: "Nur Änderungen >5 Punkte". | 3 Tage | Codex |
| 5.2 | Compare Runs Backend | API: /api/runs/compare?run1=X&run2=Y. Delta-Berechnung, Sektor-Aggregation, Top-Mover. | 1 Tag | GLM |
| 5.3 | Anomalie-Detektor | Rule-Based Hybrid: (1) Score-Divergenz (Preis ↑ aber Score ↓), (2) Sektor-Outlier (>2σ vom Sektor-Median), (3) Volume Spike (>5x avg), (4) Valuation Compression (<10th Percentile 5Y). Flagging auf Stock Detail Page. | 3 Tage | Claude+Qwen |
| 5.4 | Anomalie-UI | Badge auf Stock Cards ("⚠ Anomalie"), Detailansicht mit Erklärung pro Anomalie-Typ, Filter "Nur Anomalien zeigen" | 1 Tag | GLM |
| 5.5 | Forward Testing Dashboard | Trackt Top-20 Picks jedes Runs. Zeigt nach 1W/1M/3M/6M: tatsächliche Performance vs. Score-Vorhersage. Aufbaut auf Score-History (4.9). | 2 Tage | GLM |
| 5.6 | Education/Information Layer | Tooltips auf allen Score-Werten ("Quality misst Profitabilität, Bilanzstärke und Cash Flow"). Methodik-Page (/methodology) mit allen Formeln, Gewichten, Quellen. Glossar (F-Score, PEG, ROIC etc.) | 2 Tage | GLM |
| 5.7 | Survivorship Bias Warnung | Bei jedem Backtest-Ergebnis: gelber Banner "Historische Backtests können Survivorship Bias von 5-10% enthalten. Details →" mit Link auf Dokumentation. | 0.5 Tag | GLM |
| 5.8 | Sektor-Rotation-Signale | Cross-Run Analyse: Welche Sektoren steigen/fallen konsistent über 4+ Runs? Heatmap auf Dashboard. | 2 Tage | Qwen |
| 5.9 | Score-Trend-Visualisierung | Pro Symbol: Sparkline der Score-Entwicklung über Runs (nutzt Score-History aus 4.9). Auf Stock Detail Page. | 1 Tag | Codex |
| 5.10 | Data-Quality-Trend | DQ-Entwicklung über Runs als Linienchart auf /health. "DQ verbessert sich seit Woche X". | 1 Tag | GLM |
| 5.11 | Backtest-Beweis-Export | "Trust but Verify" PDF: Listet exakt auf wie ein Backtest-Ergebnis zustande kam. Trades, Dates, Rebalances, jeder Schritt nachvollziehbar. | 2 Tage | Codex |

**Gesamtaufwand:** ~18-19 Tage
**Gate:** Compare Runs zeigt echte Deltas, Anomalien erkannt und erklärt, Forward Testing trackt, Methodik-Page vollständig

---

### Phase 6: Polish + Export-Qualität + UX-Exzellenz

**Ziel:** Jedes Feature funktioniert fehlerfrei. Onboarding für neue Nutzer. Export professionell.

| # | Task | Beschreibung | Aufwand | Agent |
|---|------|-------------|---------|-------|
| 6.1 | Export-Bugs fixen (PDF) | Gold-Preis 8484% (Währungs/Einheitenfehler), fehlende Positionen (PJT/XOM/ASML), Delta-Spalte leer, Earnings ungefiltert, "Unbekannt" Sektor → explizit benennen. | 2 Tage | Codex |
| 6.2 | Export-Bugs fixen (Excel) | Gleiche Bugs wie PDF + Datenvalidierung. Alle Scores, Fair Values, Sektoren korrekt. | 1 Tag | GLM |
| 6.3 | Compare Runs Export | PDF/Excel Export der Delta-Analyse aus Phase 5.1/5.2. | 1 Tag | Codex |
| 6.4 | EUR in Portfolio | Holdings-Werte in EUR umrechnen (nutzt FX aus 4.5). G/V% korrekt in Kaufwährung. | 1 Tag | Codex |
| 6.5 | Earnings-Kalender (Portfolio-gefiltert) | Nur Holdings/Watchlist-relevante Earnings anzeigen, Rest ausblenden oder einklappbar. | 1 Tag | GLM |
| 6.6 | Onboarding Flow | Welcome Wizard für neue User: (1) Risk-Tolerance Fragebogen (3 Fragen), (2) automatische Preset-Empfehlung, (3) Erstes Portfolio-Setup (CSV Import oder Manuell), (4) Universe-Auswahl. | 3 Tage | Codex |
| 6.7 | GUI-Polish Pass | Dark Theme Konsistenz über alle Pages. Spacing, Typography, Loading States. Edge Cases (leere Zustände, Fehler, lange Listen). Tablet-Lesbarkeit. | 2 Tage | GLM |
| 6.8 | Run Progress Indicator | Live-Fortschritt während Runs: "487/1943 Symbole (25%), ETA: 11 Min". SSE oder Polling. | 1.5 Tage | Codex |
| 6.9 | Error Recovery UI | Provider-Ausfall → klare Meldung ("yfinance nicht erreichbar, Daten von gestern verwendet"). Rate-Limit → "FMP Tageslimit erreicht, nächster Versuch morgen 00:00". | 1 Tag | GLM |
| 6.10 | Lokale Watchlist-Alerts | SQLite-basiert: Alert wenn Watchlist-Symbol Score-Änderung >5 Punkte seit letztem Run. In-App Badge + Alert-Page. Kein Email nötig. | 1.5 Tage | Qwen |
| 6.11 | Portfolio-Overlap-Matrix | Zeigt wie stark verschiedene Presets im gleichen Universe überlappen. "Compounder und GARP teilen 60% der Top-20." Tabelle + Heatmap. | 1 Tag | GLM |

**Gesamtaufwand:** ~16-17 Tage
**Gate:** Alle Exports fehlerfrei, Onboarding getestet, GUI konsistent, keine "broken" States

---

### Phase 7: Deployment + Sicherheit

**Ziel:** INTRINSIC läuft stabil auf Hetzner, ist sicher, monitoring-fähig.

| # | Task | Beschreibung | Aufwand | Agent |
|---|------|-------------|---------|-------|
| 7.1 | Hetzner VPS Setup | Docker-Compose: Next.js + Python ETL + SQLite Volume Mount + Nginx Reverse Proxy + Let's Encrypt SSL | 2 Tage | Codex |
| 7.2 | Deployment Pipeline | GitHub Actions: Build → Test → Deploy to Hetzner via SSH/Docker. Rollback-Strategie. | 1 Tag | Codex |
| 7.3 | Security-Audit vervollständigen | CSP Headers, Rate Limiting /api/*, Input Validation Review, Dependency Audit (npm/pip), OWASP Top 10 Check | 2 Tage | GLM |
| 7.4 | Error Tracking | Sentry Integration (oder Alternative): Frontend + Backend Errors, Performance Monitoring | 1 Tag | Codex |
| 7.5 | Cache Warming | Script das nach Deploy die wichtigsten Caches (Fundamentals, Prices) vorwärmt. Erster User-Request ist nicht langsam. | 0.5 Tag | Qwen |
| 7.6 | PWA Polish | Manifest, Service Worker (Offline-Banner, nicht Offline-Fähigkeit), Add-to-Homescreen, App Icons | 1 Tag | GLM |
| 7.7 | Backup-Strategie | Tägliches SQLite-Backup (DB-Dump → Hetzner Storage Box oder S3-kompatibel). Restore-Test. | 0.5 Tag | Qwen |
| 7.8 | Domain + DNS | Domain registrieren/konfigurieren, DNS Records, SSL verifizieren | 0.5 Tag | Milan |
| 7.9 | Monitoring | Uptime-Check (z.B. Uptime Kuma self-hosted), Disk Space Alert, Memory Alert | 0.5 Tag | GLM |

**Gesamtaufwand:** ~9-10 Tage
**Gate:** App erreichbar unter Domain, SSL grün, Sentry meldet, Backup verifiziert, CI/CD deployed automatisch

---

### Phase 8: Monetarisierung

**Ziel:** User können zahlen. Legal steht. Tiers differenzieren sinnvoll.

| # | Task | Beschreibung | Aufwand | Agent |
|---|------|-------------|---------|-------|
| 8.1 | Tier-Definition fixieren | **Free:** 1 Universe (NASDAQ-100), Top 10, Basic Scores, Watchlist (5 Symbole). **Premium (€9/mo):** Alle Universes, Alle Presets, Portfolio, Export, Regime Overlays, Alerts, Scheduled Runs, Anomalie-Flags, Compare Runs, Forward Testing. | Milan | — |
| 8.2 | Feature-Gating implementieren | Middleware/Hooks: `isPremium()` Check, Upgrade-Prompts bei Premium-Features, graceful Degradation (kein harter Block, sondern Blur + "Upgrade für vollen Zugang") | 2 Tage | Codex |
| 8.3 | Stripe Integration | Checkout Session, Webhooks (payment_succeeded, subscription_canceled), Customer Portal Link | 3 Tage | Codex |
| 8.4 | Billing UI | Plan-Auswahl Page, aktueller Plan anzeigen, Upgrade/Downgrade, Rechnungshistorie via Stripe Portal | 2 Tage | Codex |
| 8.5 | Email Alerts Backend | Trigger: Score-Änderung >5 Punkte, Regime-Wechsel, Neue Anomalie erkannt. Provider: Resend oder Postmark (kein SMTP selbst). | 2 Tage | Qwen |
| 8.6 | Email Templates | HTML Templates: Score Alert, Regime Alert, Weekly Digest. Branding, Unsubscribe-Link, CAN-SPAM konform. | 1 Tag | GLM |
| 8.7 | In-App Notifications | Toast/Badge nach Run-Abschluss: "Neuer Run verfügbar: 3 Score-Änderungen >5pt". Notification Center Page. | 1 Tag | GLM |
| 8.8 | Legal: ToS (DE+EN) | Externe Rechtsberatung beauftragen. Entwurf durch GLM, Review durch Anwalt. | 2 Tage + extern | Milan+GLM |
| 8.9 | Legal: Privacy Policy (GDPR) | Datenerfassung, Verarbeitung, Speicherung, Drittanbieter (Clerk, Stripe, Sentry). Externe Beratung. | 2 Tage + extern | Milan+GLM |
| 8.10 | Legal: Disclaimer | Investment-Advice-Waiver: "INTRINSIC bietet keine Anlageberatung. Alle Scores sind informativ, nicht als Kaufempfehlung zu verstehen." | 0.5 Tag | Milan |
| 8.11 | Legal: Impressum | Pflichtangaben nach TMG/DDG. | 0.5 Tag | Milan |
| 8.12 | GDPR-Tooling | User-Delete-API (/api/user/delete), Datenexport-Funktion (/api/user/export), Cookie Consent Banner (nur für Analytics, nicht für funktionale Cookies). | 2 Tage | Codex |

**Gesamtaufwand:** ~18-20 Tage (+ externe Rechtsberatung parallel)
**Gate:** Stripe-Zahlung funktioniert, Tier-Gating aktiv, Legal online, GDPR-Tooling verifiziert

---

### Phase 9: Beta + Live Validation

**Ziel:** Echte User, echtes Feedback, echte Performance-Messung.

| # | Task | Beschreibung | Aufwand | Agent |
|---|------|-------------|---------|-------|
| 9.1 | Paper Trading Mode | Simuliertes Portfolio das automatisch die Top-20 kauft. Trackt Performance ohne echtes Geld. | 1 Woche | GLM |
| 9.2 | Beta Einladungen | 20-50 Testnutzer einladen (Freunde, Reddit r/investing, Twitter/X FinTwit). Feedback-Formular. | Milan | laufend |
| 9.3 | Performance Tracking | Wöchentlicher Abgleich: Forward Testing Picks vs. Markt. Dashboard zeigt Trefferquote. | Qwen | laufend |
| 9.4 | Feedback-Loop | Bug Reports priorisieren, Feature Requests sammeln, iterieren. | alle | laufend |
| 9.5 | Alpha Validation | 6 Monate Live-Daten: Schlagen unsere Top-Picks den Benchmark? Statistisch signifikant? | — | 6 Monate |

---

## TIMELINE (ohne künstliche Deadline)

```
Feb 22  ████ HEUTE — Phase 3g abgeschlossen, Stage-Gate bestanden

Phase 4  ████████████████████████████  Universe Expansion + Daten
         ~14 Arbeitstage

Phase 5  ██████████████████████████████████████  Intelligence Layer
         ~18-19 Arbeitstage

Phase 6  ██████████████████████████████████  Polish + UX-Exzellenz
         ~16-17 Arbeitstage

Phase 7  ██████████████████  Deployment + Sicherheit
         ~9-10 Arbeitstage

Phase 8  ████████████████████████████████████████  Monetarisierung
         ~18-20 Arbeitstage (+ externe Legal parallel)

Phase 9  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Beta + Live
         laufend
```

**Gesamtaufwand Phasen 4-8:** ~75-80 Arbeitstage
**Realistisch bei Part-Time + Agent-Support:** 14-18 Wochen (Mai-Juni 2026)
**Go-Live (zahlende User möglich):** Mitte Juni 2026
**Alpha-Validation abgeschlossen:** Dezember 2026

Überlappung möglich: Phase 7 (Deployment) kann parallel zu Phase 6 (Polish) starten.
Legal-Beratung (Phase 8.8-8.9) kann ab Phase 6 parallel laufen.

---

## BEWUSST NICHT IM SCOPE (Backlog für Post-Launch)

| Feature | Begründung |
|---------|-----------|
| i18n (DE/EN Toggle) | Mixed Language im MVP akzeptabel |
| Mobile Native App | PWA reicht, erst ab 1000+ User |
| IBKR API Trading | Erst nach Alpha-Validation |
| Custom Strategy Builder | Premium-Feature Post-Launch |
| Historische Index-Zusammensetzung | Kostenpflichtige API, Bias dokumentiert |
| LLM "Ask Anything" | Starker Differenziator, aber Post-Launch |
| REIT-Universe (FFO-Scoring) | Eigene Scoring-Logik, Nische |
| Shanghai/Bovespa Universes | Datenverfügbarkeit kritisch |
| Daily Briefing Email | In-App Notifications stattdessen |
| Tax Loss Harvesting | Regulatorisch komplex |
| Portfolio Rebalancing-Vorschläge | Nach Portfolio-Tracking stabilisiert |
| Institutional Features (White-Label, API) | Bei Nachfrage |
| Video Tutorials | Nach Launch |
| "Guided Mode" mit Risk-Questionnaire | Onboarding Flow deckt Basis ab |

---

## ARCHITEKTUR-ENTSCHEIDUNGEN (aktualisiert)

| ID | Entscheidung | Datum | Status |
|----|-------------|-------|--------|
| D001 | Ajv over Zod für Schema Validation | 2026-02 | ✅ |
| D002 | SQLite mit better-sqlite3 (persistent auf VPS) | 2026-02 | ✅ |
| D003 | yfinance als Primary Data Provider | 2026-02 | ✅ |
| D004 | FMP als Secondary Provider (Free Tier) | 2026-02 | ✅ |
| D005 | SEC EDGAR für Bulk Audit | 2026-02 | ✅ |
| D006 | FRED API für Macro Data | 2026-02 | ✅ |
| D007 | Median Imputation für Missing Values | 2026-02 | ✅ |
| D008 | Batch Fetching für yfinance | 2026-02 | ✅ |
| D009 | European Universe Native Tickers (.DE, .PA, .L) | 2026-02 | ✅ |
| D010 | SSOT-Merge: Merged Fundamentals = Baseline | 2026-02 | ✅ |
| D011 | Quality Gate: Green/Yellow/Red mit Blocker | 2026-02 | ✅ |
| D012 | ROA Thresholds 0/10 (datenbasiert) | 2026-02 | ✅ |
| D013 | Regime Overlay optional + preset-aware | 2026-02 | ✅ |
| D014 | Desktop-First, PWA statt Native App | 2026-02 | ✅ |
| D015 | Clerk für Auth | 2026-02 | ✅ |
| D016 | Stripe für Payment | 2026-02 | geplant |
| D017 | Hetzner VPS (Docker + SQLite + Nginx) | 2026-02-22 | ✅ entschieden |
| D018 | Regime Overlays = Premium-Feature | 2026-02-22 | ✅ neu |
| D019 | In-App Notifications statt Email-Briefing | 2026-02-22 | ✅ neu |
| D020 | Score-History bei jedem Run persistieren | 2026-02-22 | ✅ neu |
| D021 | Externe Rechtsberatung für Legal Docs | 2026-02-22 | ✅ neu |
| D022 | Resend/Postmark für Alerts (kein SMTP selbst) | 2026-02-22 | ✅ neu |

---

## KOORDINATIONS-REGELN (verschärft)

1. **CHANGELOG ist Source of Truth** — JEDER Agent dokumentiert JEDE Änderung. Commits ohne CHANGELOG-Eintrag werden rejected.
2. **Fragen klären vor Code** — Keine Code-Welle ohne fixierten Plan. CLI-Prompts erst nach Plan-Bestätigung.
3. **Phase-End Review durch Kimi** — Bevor nächste Phase beginnt.
4. **Abhängigkeiten respektieren** — Kein Task startet vor seinen Dependencies.
5. **Scope Creep nur bei Quick Wins** — Neue Features → Bewertung: Passt es philosophisch? Ist es ein Quick Win (<1 Tag)? Wenn ja → aufnehmen. Wenn nein → Backlog.
6. **Philosophy Checkpoint vor jeder Phase:**
   - Does this provide REAL value to investors?
   - Is this the BEST implementation possible?
   - Are we being HONEST and TRANSPARENT?
   - Would I be PROUD to show this to professional investors?
7. **Quality over Speed** — Kein Feature shipped das nicht exzellent ist.
