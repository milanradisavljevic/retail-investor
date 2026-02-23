Bewertung des INTRINSIC Roadmap (2026-02-22)

    📊 Implementierbarkeits-Bewertung

    Stärken der Roadmap

     1. Realistische Aufwandsschätzungen
        - Die Schätzungen (0.5-3 Tage pro Task) wirken durchdacht
        - Komplexere Tasks (Anomalie-Detektor: 3 Tage, Auth: 2-3 Tage) sind angemessen
        - Puffer durch Phasen-Gates eingebaut

     2. Klare Abhängigkeiten
        - Phase 4 (Universe Expansion) vor Phase 5 (Portfolio) ist logisch
        - Deployment (Phase 7) vor Monetarisierung (Phase 8) ist korrekt
        - Quality Observatory bereits implementiert zeigt Reife

     3. Stage-Gates definiert
        - Jede Phase hat messbare Erfolgskriterien
        - "Gate: EU-Runs liefern DQ >90" ist konkret überprüfbar

    Kritische Risiken

     1. 10 Wochen bis Go-Live ist optimistisch
        - Phase 8 (Monetarisierung) allein: 14-18 Tage → Legal-Themen sind unterschätzt
        - ToS/Privacy/Impressum in DE/EN braucht externe Rechtsberatung
        - Stripe-Integration + Webhooks + Billing UI: 5-6 Tage ist sehr sportlich

     2. Fehlende Test-Infrastruktur
        - Keine CI/CD bis Phase 7 (April!)
        - Bei ~200 Tests aktuell: Manuelles Testing wird zum Flaschenhals
        - E2E-Tests für Portfolio/Export/Auth fehlen komplett

     3. Datenqualität als Blocker
        - Russell 2000 FMP-Befüllung: "~8 Tage bei 250 Calls/Tag" → läuft noch
        - EU-Universes haben keine Fundamentals-Baseline
        - Quality Gate "red" bei aktuellen Runs (DQ ~42, nicht >90)

     4. Agent-Zuweisung problematisch
        - "GLM/Qwen/Codex" als Verantwortliche → keine menschliche Ownership
        - Wer validiert die Agent-Ergebnisse?
        - Komplexe Tasks (Anomalie-Detektor: "Claude+Qwen") brauchen menschliche Review

    ---

    🧠 Philosophische Bewertung

    Kohärenz mit Produkt-Vision

     1. "Evidence-Based" wird gelebt ✅
        - Quality Observatory mit Cross-Source-Validation
        - Survivorship Bias transparent dokumentiert (F7)
        - Staleness Alerting (F6) zeigt Datenalter an
        - Outlier Detection (F5) flaggt Anomalien statt sie zu verstecken

     2. "Transparent, not Black-Box" ✅
        - Alle Formeln in scoring_config.ts einsehbar
        - DECISIONS.md dokumentiert Trade-offs
        - CHANGELOG zeigt jede Änderung nachvollziehbar
        - Piotroski F-Score mit 9 einzelnen Checks erklärbar

     3. "Retail Investor First" ✅
        - Desktop-First statt Mobile (ernsthafte Analyse > Convenience)
        - i18n bewusst gestrichen für MVP-Fokus
        - Keine Trading-Integration vor Alpha-Validierung
        - Education Layer (Tooltips, Methodik-Erklärungen) in Phase 6

    Philosophische Brüche

     1. Monetarisierung vs. Evidence-Based ⚠️
        - Tier-Split (Free: 1 Universe + Top 10 / Premium: Alle) könnte Nutzer zu schlechteren Entscheidungen zwingen
        - "Top 10" ohne Kontext → Gefahr von Cherry-Picking
        - Email Alerts bei Score-Änderungen >5 Punkte → könnte zu Over-Trading animieren

     2. "No Cloud Dependency" vs. Auth/Payment ⚠️
        - Clerk/Auth0 = externe Abhängigkeit
        - Stripe = weitere externe Abhängigkeit
        - Vercel/VPS-Entscheidung steht aus (D017 offen)
        - Eigentliches Versprechen: "100% lokal" → jetzt nur noch "100% lokal ohne Auth"

     3. Backtesting-Integrität ungelöst ❌
        - Survivorship Bias dokumentiert, aber nicht gelöst
        - "5-10% nach oben verzerrt" → wird das im UI kommuniziert?
        - Historische Index-Zusammensetzung als "Post-Launch" → könnte frühe Nutzer in die Irre führen

    ---

    🔍 Changelog-Konsistenzanalyse

    Was gut passt

     1. Phase 3f (Architecture Cleanup) → Roadmap TEIL 2
        - SSOT-Architektur (F1) implementiert ✅
        - Cross-Source Validation (F2) ✅
        - Coverage Dashboard (F3) ✅
        - Outlier Detection (F4/F5) ✅
        - Staleness Alerting (F6) ✅
        - Quality Observatory (F7) ✅
        - Alles konsistent dokumentiert

     2. Scoring Calibration (Phase 3g) → Roadmap Status
        - Technical Pillar reaktiviert ✅
        - ROA Thresholds datenbasiert kalibriert (3/15 → 0/10) ✅
        - Batch-Resilience (Single-Symbol-Recovery) ✅
        - Stage-Gate BESTANDEN mit allen 5 KPIs ✅

     3. Provider-Strategie evolutionär
        - Finnhub → yfinance (D003) ✅
        - FMP Free Tier → Multi-Key Sharding (Phase 3e) ✅
        - SEC EDGAR Bulk als SSOT-Quelle ✅
        - Kein Big-Bang-Rewrite, sondern inkrementell

    Was nicht passt / Lücken

     1. EU-Universes seit IND-1 (2026-02-12) offen
        - Configs erstellt, aber keine Runs durchgeführt
        - Roadmap Phase 4.1 plant 2 Tage → warum 10 Tage Wartzeit?
        - Risiko: EU-Datenqualität könnte schlechter sein (yfinance-Coverage)

     2. Portfolio-Tracking nirgends vorbereitet
        - Kein Datenmodell im Changelog
        - Keine API-Vorbereitung
        - Phase 5.1-5.6 = 6.5 Tage für komplett neues Feature-Set → sehr optimistisch

     3. Export (PDF/Excel) als "Prototyp vorhanden, Bugs offen"
        - Im Changelog keine Erwähnung von Export-Bugs
        - Roadmap sagt "Prototyp aus Nordstern App" → wo ist der Code?
        - Phase 5.7-5.8: 3 Tage für Bugfixes ohne Kontext → Risiko

     4. FMP Tier-Entscheidung offen (D004)
        - Roadmap: "Free vs. $19/Monat (nach Monetarisierung)"
        - Aber: Russell 2000 FMP-Befüllung läuft bereits (8 Tage)
        - Widerspruch: Wenn Free Tier, warum jetzt schon 250 Calls/Tag investieren?

    ---

    💡 Konkrete Verbesserungsvorschläge

    Features die fehlen

     1. Score-History pro Aktie (verpasste Chance)
        - Roadmap hat "Compare Runs UI" (Phase 5.9)
        - Aber: Keine zeitliche Entwicklung pro Symbol
        - Vorschlag: score_history Tabelle mit (symbol, run_date, total_score, pillar_scores)
        - Nutzen: "Wie hat sich AAPL Score seit Jan entwickelt?"

     2. Peer-Group-Scoring (natürliche Erweiterung)
        - Quality Observatory existiert bereits
        - Vorschlag: "Sektor-Ranking" pro Score (z.B. "AAPL: #12 im Tech-Sektor")
        - Aufwand: <1 Tag (bestehende Infrastruktur nutzbar)

     3. Watchlist-Alerts (vor Monetarisierung testen)
        - Roadmap: Email Alerts erst Phase 8.7 (nach Payment)
        - Vorschlag: Lokale Alerts vorab (localStorage oder SQLite)
        - Nutzen: Feature-Validierung ohne Auth-Overhead

     4. Data-Quality-Trend (nicht nur Snapshot)
        - Quality Observatory baut Snapshots auf
        - Vorschlag: Trend-Visualisierung ("DQ verbessert sich seit Woche X")
        - Aufwand: 1-2 Tage (bestehende latest.json nutzen)

    Features die gestrichen werden sollten

     1. REIT-Universe (FFO-Scoring)
        - Roadmap: "Post-Launch, Nische"
        - Begründung: Benötigt komplett eigene Scoring-Logik (FFO statt EPS, AFFO Yield)
        - Risiko: Verwässert Fokus auf Kern-Universes

     2. LatAm-Universes (Ibovespa)
        - Roadmap: Phase 4 als "Asien-Universes" geplant, LatAm im Backlog
        - Begründung: Datenverfügbarkeit kritisch (yfinance-Coverage schlecht)
        - Risiko: Niedrige Data Quality → schlechtes Nutzererlebnis

     3. Daily Briefing Email (Phase 8.8)
        - Roadmap: 1 Tag Aufwand
        - Begründung: Email-Infrastruktur (SMTP, DKIM, Spam) unterschätzt
        - Besser: In-App-Notification nach Run-Abschluss

    Prioritäts-Verschiebungen

     1. CI/CD vor Phase 7 ziehen
        - Aktuell: Phase 7 (April)
        - Vorschlag: Phase 5 (März) für GitHub Actions Basic
        - Begründung: Portfolio/Export/Auth ohne CI testen → manuell nicht skalierbar

     2. Portfolio vor Export
        - Aktuell: Phase 5 kombiniert beides
        - Vorschlag: Portfolio (5.1-5.6) zuerst, Export (5.7-5.8) nach Phase 6
        - Begründung: Portfolio ist Kern-Feature, Export nur Nice-to-have

     3. EUR-Umrechnung früher
        - Aktuell: Phase 4.2 (2 Tage)
        - Vorschlag: Phase 4.1 integrieren (EU-Runs direkt mit EUR)
        - Begründung: EU-Nutzer wollen EUR-Preise sofort sehen

    ---

    🎯 Fazit

    Implementierbarkeit: 7/10
     - Roadmap ist detailliert und durchdacht
     - 10-Wochen-Zeitplan optimistisch, aber machbar mit Scope-Cuts
     - Größte Risiken: Legal-Themen, CI/CD-Lücke, Portfolio-Komplexität

    Philosophische Kohärenz: 8/10
     - "Evidence-Based" und "Transparent" werden konsequent gelebt
     - Monetarisierung erzeugt leichte Spannungen (Tier-Split, Auth-Pflicht)
     - Backtesting-Integrität (Survivorship Bias) ungelöst

    Changelog-Konsistenz: 9/10
     - Phase 3f/3g vollständig umgesetzt
     - EU-Universes einzige offene Flanke (seit 10 Tagen)
     - Dokumentation (DECISIONS.md, CHANGELOG) vorbildlich

    Empfehlung: Roadmap umsetzen, aber:
     1. CI/CD auf Phase 5 vorziehen
     2. Legal-Budget einplanen (externe Beratung)
     3. Portfolio-Tracking als MVP (ohne Diversifikation/Performance)
     4. Survivorship Bias im UI explizit kommunizieren