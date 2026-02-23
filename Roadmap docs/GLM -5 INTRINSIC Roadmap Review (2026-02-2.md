GLM-5 Bewertung: INTRINSIC_ROADMAP_2026-02-22
1. Konsistenz mit Changelog — Kritische Diskrepanzen
Die Roadmap weist erhebliche Lücken zum aktuellen Implementierungsstand auf:
| Roadmap behauptet | Changelog zeigt |
|------------------|-----------------|
| Portfolio-Tracking: ❌ Nicht implementiert | 2026-02-14: Vollständig implementiert (CRUD API, UI, Diversifikations-Dashboard, Performance vs Benchmark) |
| Export (PDF/Excel): 🟡 Prototyp | 2026-02-17: PDF + Excel Export vollständig implementiert mit API-Routes |
| CI/CD: ❌ Nicht implementiert | 2026-02-18: .github/workflows/ci.yml vorhanden |
| Auth/Payment: ❌ Nicht implementiert | 2026-02-19: Clerk Auth vollständig integriert, inkl. Protected Routes |
| Security-Audit: ❌ Offen | 2026-02-18: Security Headers, Input Validation, Run Lock implementiert |
Empfehlung: Roadmap dringend mit Changelog abgleichen und aktualisieren.
---
2. Implementierbarkeit pro Phase
Phase 4 (Universe Expansion + EUR): 10-12 Tage — ✅ REALISTISCH
- EU Universe Configs existieren bereits
- yfinance Batch-Provider ist stabil
- EUR-Umrechnung via ECB/yfinance FX ist straightforward
- Risiko: EU-Fundamentals-Coverage könnte schlechter sein als US (weniger SEC-Filings)
Phase 5 (Portfolio + Export): 11-14 Tage — 🟡 ÜBERFLÜSSIG
- Portfolio ist bereits implementiert!
- PDF/Excel Export bereits implementiert
- Compare Runs UI bereits da (2026-02-17)
- Statt neuer Features: Bugfixes und Polish für bestehende Export-Funktionen
Phase 6 (Intelligence Layer): 9-11 Tage — ✅ REALISTISCH
- Anomalie-Detektor: Rule-based, machbar
- Education Layer (Glossar) bereits teilweise implementiert (2026-02-14)
- Earnings-Kalender bereits implementiert
- Risiko: Forward Testing Dashboard braucht historische Run-Daten (erst ab Phase 4 vorhanden)
Phase 7 (Deployment Readiness): 5-8 Tage — 🟡 ZU OPTIMISTISCH
- Security-Audit bereits größtenteils erledigt
- CI/CD bereits vorhanden
- Aber: FMP API Key Rotation ist kritisch (steht im Chat-Verlauf!)
- Hinzufügen: CSP Headers, Rate Limiting für API-Endpoints
Phase 8 (Monetarisierung): 14-18 Tage — 🟡 OPTIMISTISCH
- Auth bereits implementiert (Clerk)
- Stripe Integration: 2-3 Tage ist sportlich
- Fehlt: Tier-Definition, Billing UI, Legal Docs
- Risiko: DSGVO/GDPR Compliance für EU-Nutzer (Impressum reicht nicht)
---
3. Philosophische Bewertung — Produkt-Vision
Stärken:
1. 4-Pillar Scoring (Valuation, Quality, Technical, Risk) ist konsistent und akademisch fundiert
2. SSOT-Architektur (Single Source of Truth) für Fundamentals ist professionell
3. Regime Detection (Risk On/Off) als Differenzierer zu Finviz/Koyfin
4. Survivorship Bias Disclaimer zeigt methodische Reife
Schwächen / Offene Fragen:
1. Target Audience unklar: Retail vs. Semi-Professional
   - 7 Strategy Presets überfordern Anfänger
   - Keine "One-Click" Empfehlung für Einsteiger
   - Vorschlag: "Guided Mode" mit automatischer Preset-Auswahl basierend auf Risk-Questionnaire
2. Datenqualität-Transparenz vs. UX:
   - Quality Gate (Green/Yellow/Red) ist gut
   - Aber: User versteht nicht, warum ein Run "rot" ist
   - Vorschlag: Plain-Language-Erklärung ("Die Daten von 342 Aktien sind älter als 7 Tage. Empfehlung: ETL neu ausführen.")
3. Backtesting-Validität:
   - Momentum-Only mit 780% Return ist irreführend (Roadmap sagt "Survivorship Bias")
   - Hybrid-Strategie (110.90%) ist realistischer, aber immer noch optimistisch
   - Vorschlag: Stärkere Warnung + Link zur Survivorship-Bias-Dokumentation
4. Moat / Differenzierung:
   - Was kann INTRINSIC, was Finviz/Koyfin nicht können?
   - Regime Detection ist gut, aber reicht das?
   - Vorschlag: LLM-gestützte "Ask Anything" Funktion (Post-Launch, bereits im Backlog)
---
4. Konkrete Verbesserungsvorschläge
Sofort (vor Phase 4):
1. Roadmap mit Changelog synchronisieren — viele "offene" Features sind bereits erledigt
2. FMP API Key ROTIEREN — steht im Chat-Verlauf (Security Risk #1)
3. PWA ist implementiert, aber Roadmap sagt "nicht implementiert" — korrigieren
Phase 4 Ergänzungen:
4. EU-Fundamentals Coverage Test vor大面积 Runs — erst 100 Symbole testen
5. ETL-Monitoring Dashboard — wenn SEC + FMP + yfinance täglich laufen, brauchst du Alerts bei Failures
Phase 6 Ergänzungen:
6. Onboarding Flow — Neuer User sieht leeres Dashboard. Vorschlag: "Welcome Wizard" mit:
   - Risk-Tolerance Questionnaire
   - Automatische Preset-Auswahl
   - Erstes Portfolio-Setup (CSV Import oder Manuell)
Phase 7 Ergänzungen:
7. CSP (Content Security Policy) Headers — Security Headers sind da, aber CSP fehlt
8. Rate Limiting für /api/* Endpoints (aktuell nur Request Size Limit)
9. Error Tracking (Sentry o.ä.) für Production
Phase 8 Ergänzungen:
10. Tier-Definition konkretisieren:
    ```
    Free: 1 Universe + Top 10 + Manual Runs
    Premium ($9/mo): Alle Universes + Portfolio + Export + Alerts + Scheduled Runs
    ```
11. GDPR Compliance: Privacy Policy reicht nicht — brauchst:
    - Cookie Consent Banner
    - Recht auf Datenlöschung (User-Delete-API)
    - Datenexport-Funktion (Portabilität)
---
5. Timeline-Realismus
Roadmap: 10 Wochen bis Go-Live (Anfang Mai 2026)
Einschätzung: 🟡 12-16 Wochen realistischer
Gründe:
- Phase 5 ist bereits erledigt → Zeit sparen
- Aber: Legal Docs (ToS, Privacy, Disclaimer) werden unterschätzt
- Stripe Webhook-Handling + Edge Cases brauchen Zeit
- Beta Testing Phase 9 braucht echte User
---
6. Fehlende Features im Backlog
Sollten priorisiert werden:
1. Mobile Responsive — Roadmap sagt "Desktop-First", aber 60%+ Traffic ist mobil
2. Error Recovery UI — Was passiert bei Provider-Ausfall? User sieht nur "Error"
3. Rate Limit Handling — FMP Free Tier = 250 Calls/Tag. Was passiert bei Exceed?
4. Cache Warming — Kalter Start nach Deployment = langsamer erster Run
Können warten:
- i18n (bereits gestrichen, korrekt)
- Native App (PWA reicht)
- IBKR API Trading (erst nach Validierung)
---
Zusammenfassung
| Dimension | Bewertung |
|-----------|-----------|
| Technische Implementierbarkeit | ✅ Hoch (Architektur ist solide) |
| Timeline-Realismus | 🟡 Mittel (10 → 12-16 Wochen) |
| Produkt-Markt-Fit | 🟡 Unklar (Target Audience ungeschärft) |
| Roadmap-Akkuratheit | ❌ Niedrig (viele erledigte Features als "offen" markiert) |
| Differenzierung | 🟡 Mittel (Regime Detection gut, aber mehr nötig) |
Top 3 Actions:
1. Roadmap mit Changelog synchronisieren
2. FMP API Key rotieren (sofort)
3. Target Audience schärfen + Onboarding Flow designen