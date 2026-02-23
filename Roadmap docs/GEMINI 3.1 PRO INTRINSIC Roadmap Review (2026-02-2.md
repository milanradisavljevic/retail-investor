GEMINI 3.1 PRO INTRINSIC Roadmap Review (2026-02-22)
Hier ist eine detaillierte Bewertung deines Roadmaps, aufgeteilt in Implementierbarkeit, philosophische/produktstrategische Ebene und Abgleich mit dem Changelog.

1. Abgleich mit dem Changelog & Historie
Die Roadmap im Bereich "Was ist erledigt" stimmt absolut perfekt mit dem 
TECHNICAL_WEEKLY.md
 (05.02. - 11.02.) und den darauffolgenden Errungenschaften überein.

Die Integration der FRED Macro-Daten, des Regime-Widgets und der Backtesting-Frameworks (inklusive GARP, Dividend Quality, Shield) sind im Changelog sauber dokumentiert.
Das rasante Tempo (Phase 0 bis 3g in ca. 3 Wochen) zeigt, dass die Architektur (SQLite, yfinance batching, SSOT) extrem effizient für Rapid Prototyping ist.
Fazit: Die Vergangenheits-Einträge ergeben absolut Sinn. Sie zeigen einen klaren Shift von einer anfänglichen "Scoring-Idee" hin zu einer robusten, datengetriebenen quantitativen Engine (Behebung von Survivorship Bias bei Momentum, Härten der Filter).
2. Implementierbarkeit & Technische Architektur (Feedback & Risiken)
Insgesamt ist der Phasenplan (Phase 4 bis 8 in ~10 Wochen) ambitioniert, aber durch den starken Einsatz von KI-Agenten realistisch. Dennoch gibt es zwei kritische Architektur-Fallen, die du vor Phase 5 (Portfolio) und 7 (Deployment) klären solltest:

WARNING

Das SQLite / Vercel Problem (Phase 7.4) Auf der Roadmap steht unter Phase 7.4 "Vercel oder VPS" bei aktueller Nutzung von SQLite. Vercel nutzt serverless Functions, die keinen persistenten Dateizugriff haben. Eine SQLite-Datei (privatinvestor.db / market-data.db) wird bei jedem Funktionsaufruf auf Vercel neu aus dem Repo geladen (read-only) und Änderungen gehen beim nächsten Request verloren. Lösungsvorschlag:

Entweder: Einen klassischen VPS (Hetzner/DigitalOcean) mit z.B. Docker oder PM2 nutzen (perfekt für SQLite).
Oder: Wenn Vercel, dann die DB migrieren zu Turso (libSQL), was SQLite am Edge erlaubt, oder zu einer gehosteten PostgreSQL (Supabase/Neon).
IMPORTANT

Sequenzierungs-Problem: Auth vs. Portfolio (Phase 5 vs. Phase 8) Du planst das Portfolio-Datenmodell (Phase 5) vor dem Auth-System (Phase 8). Das bedeutet, du baust erst CRUD-APIs ohne User-Kontext und musst diese in Phase 8 komplett refactoren (Überall user_id anhängen, Auth-Guards einbauen, RLS in der DB). Lösungsvorschlag: Ziehe Phase 8.1 (Auth System) und 8.2 (User-DB Schema) an den Anfang von Phase 5. Auth (Clerk) einzubauen dauert mit KI nur wenige Stunden, erspart dir aber massives Refactoring beim Portfolio und den Export-Funktionen.

Weitere technische Anmerkungen:

Asien/LatAm Universes (Phase 4.4): Prüfe vorher, ob yfinance für Nikkei/Bovespa saubere Fundamentals (insb. EPS und Dividend) liefert. Europäische Ticker funktionieren meist noch, aber Asien ist notoriously unzuverlässig bei kostenlosen Providern.
Phase 9 (Paper Trading): Das Live-Tracking von Portfolios erfordert Split/Dividend-Adjustments in Echtzeit. Das ist weitaus komplexer als reine Close-Preise.
3. Philosophische Ebene (Das abgeschlossene Produkt)
Als SaaS-Produkt für Retail-Investoren, das Transparenz ("No Blackbox") über alles stellt, ist die Positionierung hervorragend. Es füllt genau die Lücke zwischen zu komplexen Tools (Moringstar, Finviz Screener) und zu simplen Apps (Trade Republic).

Produktstrategisches Feedback:

Die "Why-Barriere" senken (Phase 6): Du hast in Phase 6.2 den "Education Layer" geplant. Dieser ist absolut kritisch für den Go-Live. Retail-Investoren wissen oft nicht, was ein F-Score ist. Tooltips wie "Dieser Score ist 8/10, weil die Marge Year-over-Year um 12% gestiegen ist" sind das eigentliche Produkt-Gold, nicht die reinen Zahlen.

Der Killer-Feature-Fokus: Phase 5.9 ("Compare Runs UI - Delta Tracking"): Dies ist dein stärkstes Alleinstellungsmerkmal gegenüber Koyfin. Die Fähigkeit zu sehen, warum eine Aktie von Tier 1 in Tier 2 abgerutscht ist (z.B. "Debt/Equity spiked in the latest earnings"), ist enorm wertvoll. Ich würde dieses Feature in der Priorität noch höher setzen, noch vor den Export-Features (PDF/Excel).

Pricing & Monetarisierung (Phase 8.4): Dein Tier-Split ("Free: 1 Universe + Top 10" vs "Premium: Alle + Portfolio + Alerts") ist klassisch und gut. Idee für Monetarisierung: Lass "Regime Overlays" ein reines Premium-Feature sein. Die Free-User bekommen die nackten Strategien, aber der strategische Markt-Kontext (der erwiesenermaßen +23pp bei Compounder bringt laut README) ist Premium. Das ist ein extrem greifbarer Mehrwert für ein Abo.

Die "No Cloud Dependency" Narrative: Im aktuellen README (lokale Installation) ist das ein Feature. Sobald du aber in Phase 8 ein SaaS draus machst, fällst du genau in die Cloud. Überlege, ob INTRINSIC primär eine SaaS-Plattform ist, oder ob es eine "Open Core" Philosophie fährt (wie Ghost oder Plausible), wo technisch affine Nutzer es self-hosten können.

4. Feature-Ideen für das Backlog
E-Mail Alerts bei Regime-Wechsel: Nicht nur Score-Änderungen von Aktien, sondern ein Alert "Das Regime wechselt von RISK_ON zu NEUTRAL. Hier sind die Implikationen für deine Strategien."
Portfolio-Overlap-Matrix: Zeigt, wie stark die verschiedenen Presets im gleichen Universum überlappen.
Backtest-Beweis-Export: Eine "Trust but Verify" PDF, die exakt auflistet, wie der Backtest (z.B. der 110% Hybrid) zustande kam, was das Vertrauen der Nutzer in ein kostenpflichtiges Abo massiv steigern würde.