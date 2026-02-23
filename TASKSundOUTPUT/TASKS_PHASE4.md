
# INTRINSIC Task Queue — Phase 4

**Phase:** Universe Expansion + Daten-Fundament  
**Ziel:** Alle Kernmärkte abgedeckt, EUR-Umrechnung, ETL automatisiert, Score-History startet.  
**Geschätzter Aufwand:** ~14 Tage

**Checkpoints:**
- [ ] Nach 4.5: EU-Cluster komplett (4.3, 4.4, 4.5)
- [ ] Nach 4.8: Alle neuen Universes (+ Nikkei, ETF)
- [ ] Nach 4.12: Phase 4 komplett

**Gate-Kriterien Phase 4:**
- EU-Runs DQ > 90
- EUR-Toggle funktioniert
- Nikkei läuft differenziert
- ETFs mit vereinfachtem Scoring
- systemd Timer aktiv

---

## Task 4.1: Hosting-Entscheidung fixieren
**Agent:** Milan (manuell)  
**Abhängigkeiten:** keine  
**Aufwand:** 0.5 Tag

### Beschreibung
Hetzner VPS bestellen, Docker/PM2 Setup planen, Domain klären.

### Checkliste
- [ ] VPS-Typ gewählt und bestellt
- [ ] Domain entschieden
- [ ] Setup-Plan dokumentiert

---

## Task 4.2: FMP API Key rotieren
**Agent:** Milan (manuell)  
**Abhängigkeiten:** keine  
**Aufwand:** 0.5 Tag

### Beschreibung
Neuen Key generieren, .env aktualisieren, alten Key deaktivieren.

### Checkliste
- [ ] Neuer Key generiert
- [ ] .env.local aktualisiert
- [ ] Alter Key deaktiviert
- [ ] Testabfrage erfolgreich

---

## Task 4.3: EU Universe Runs
**Agent:** Qwen  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.5  
**Aufwand:** 2 Tage

### Kontext
DAX 40, CAC 40, FTSE 100, Euro Stoxx 50 Configs existieren in config/universes/. Runs wurden noch nie durchgeführt.

### Akzeptanzkriterien
- [ ] Alle 4 EU Universes gescort
- [ ] DQ Mean > 90 für jedes Universe
- [ ] Runs in data/runs/ gespeichert
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Führe die ersten Scoring-Runs für die europäischen Universes durch: DAX 40, CAC 40, FTSE 100, Euro Stoxx 50.

1. Prüfe die Configs in config/universes/
2. Führe für jedes Universe einen Run durch
3. Validiere die Data Quality (Ziel: DQ Mean > 90)
4. Bei DQ-Problemen: Ursache dokumentieren, nicht blind weitermachen
5. CHANGELOG-Eintrag mit Run-IDs und DQ-Werten

Validierung nach Abschluss:
npm run quality:build

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.3
```

### Output
→ OUTPUT.md #4.3

---

## Task 4.4: EU Fundamentals Coverage Test
**Agent:** Qwen  
**Abhängigkeiten:** 4.3 (informativ, kein Blocker)  
**Checkpoint:** Nach 4.5  
**Aufwand:** 0.5 Tag

### Kontext
Bevor volle EU-Runs als stabil gelten, muss die yfinance-Coverage für europäische Symbole validiert werden.

### Akzeptanzkriterien
- [ ] 100 EU-Symbole getestet (Stichprobe aus allen 4 Universes)
- [ ] Coverage-Rate dokumentiert
- [ ] Problematische Symbole identifiziert
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Teste die yfinance Fundamentals-Coverage für europäische Symbole.

1. Wähle 25 Symbole je EU-Universe (DAX, CAC, FTSE, Euro Stoxx) als Stichprobe
2. Fetche Fundamentals via yfinance
3. Dokumentiere Coverage-Rate (welche Felder fehlen häufig?)
4. Liste problematische Symbole auf
5. CHANGELOG-Eintrag mit Coverage-Statistik

Ziel: Verstehen, ob EU-Daten verlässlich genug für Scoring sind.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.4
```

### Output
→ OUTPUT.md #4.4

---

## Task 4.5: EUR-Umrechnung
**Agent:** Codex  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.5  
**Aufwand:** 2 Tage

### Kontext
Alle Preise und Fair Values sind aktuell in USD. Europäische Nutzer brauchen EUR-Option.

### Akzeptanzkriterien
- [ ] FX-Rate von ECB oder yfinance abrufbar
- [ ] Toggle in Settings implementiert
- [ ] Preise, Fair Values, Portfolio-Werte in EUR anzeigbar
- [ ] Umrechnung korrekt (Spot-Rate, nicht historisch)
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Implementiere EUR-Umrechnung für INTRINSIC.

1. FX-Rate Provider: ECB API oder yfinance (EUR/USD)
2. Settings-Toggle: "Währung: USD / EUR"
3. Alle relevanten Werte umrechnen: Preise, Fair Values, Portfolio-Gesamtwert
4. Caching der FX-Rate (nicht bei jedem Request fetchen)
5. UI zeigt aktuelle Währung an

Validierung:
- Toggle funktioniert
- Werte ändern sich korrekt bei Währungswechsel
- Keine Console Errors

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.5
```

### Output
→ OUTPUT.md #4.5

---

## Task 4.6: Universe-Selector Polish
**Agent:** GLM  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.8  
**Aufwand:** 1 Tag

### Kontext
Universe-Selector existiert, zeigt aber nur flache Liste. Soll nach Regionen gruppiert werden mit visuellen Verbesserungen.

### Akzeptanzkriterien
- [ ] Dropdown gruppiert nach Region (US / Europe / Asia)
- [ ] Flaggen-Icons je Universe
- [ ] Symbol-Count je Universe angezeigt
- [ ] Dark Theme konsistent
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Verbessere den Universe-Selector in der UI.

1. Gruppiere Universes nach Region:
   - US: NASDAQ-100, S&P 500, Russell 2000
   - Europe: DAX 40, CAC 40, FTSE 100, Euro Stoxx 50
   - Asia: Nikkei 225
2. Füge kleine Flaggen-Icons hinzu (US, DE, FR, UK, EU, JP)
3. Zeige Anzahl der Symbole je Universe in Klammern
4. Dark Theme beibehalten

Validierung: Visueller Check, keine Console Errors.

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.6
```

### Output
→ OUTPUT.md #4.6

---

## Task 4.7: Nikkei 225
**Agent:** Qwen  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.8  
**Aufwand:** 2 Tage

### Kontext
Asien-Expansion beginnt mit Nikkei 225. yfinance nutzt .T Suffix für Tokyo-Börse.

### Akzeptanzkriterien
- [ ] Config in config/universes/nikkei225.json erstellt
- [ ] .T Suffixes korrekt (z.B. 7203.T für Toyota)
- [ ] Fundamentals-Coverage geprüft
- [ ] Erster Run durchgeführt
- [ ] DQ > 85 (etwas toleranter wegen neuer Region)
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Erstelle das Nikkei 225 Universe für INTRINSIC.

1. Config-File: config/universes/nikkei225.json
2. Symbole mit .T Suffix (Tokyo Stock Exchange)
3. Validiere Fundamentals-Coverage für 20-30 Symbole als Stichprobe
4. Führe ersten Scoring-Run durch
5. Dokumentiere DQ-Wert und eventuelle Probleme

Hinweis: Japanische Firmen haben teils andere Bilanzierungsstandards. Dokumentiere Auffälligkeiten.

Validierung:
npm run run:daily -- --universe nikkei225
npm run quality:build

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.7
```

### Output
→ OUTPUT.md #4.7

---

## Task 4.8: ETF-Universe
**Agent:** Codex  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.8  
**Aufwand:** 2 Tage

### Kontext
ETFs brauchen vereinfachtes Scoring: Nur Technical + Risk, kein Valuation/Quality (macht bei ETFs keinen Sinn).

### Akzeptanzkriterien
- [ ] Config in config/universes/etf.json erstellt
- [ ] ETFs enthalten: SPY, QQQ, IWM, XLK, XLF, XLE, XLV, XLI, XLP, XLY, XLB, XLU, XLRE, VTI, VEA, VWO, BND, TLT, GLD, SLV
- [ ] Scoring-Logik angepasst: Technical + Risk only
- [ ] Erster Run durchgeführt
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Erstelle das ETF-Universe für INTRINSIC mit vereinfachtem Scoring.

1. Config-File: config/universes/etf.json
2. ETFs: SPY, QQQ, IWM, Sektor-ETFs (XLK, XLF, XLE, XLV, XLI, XLP, XLY, XLB, XLU, XLRE), International (VTI, VEA, VWO), Bonds (BND, TLT), Commodities (GLD, SLV)
3. Scoring anpassen: Nur Technical (50%) + Risk (50%), Valuation und Quality auf 0 setzen
4. UI muss erkennen, dass ETF-Universe andere Scoring-Logik hat
5. Erster Run durchführen

Validierung:
npm run run:daily -- --universe etf
- ETFs haben nur Technical + Risk Scores
- Total Score ist Durchschnitt aus beiden

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.8
```

### Output
→ OUTPUT.md #4.8

---

## Task 4.9: Score-History-Tabelle
**Agent:** Qwen  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.12  
**Aufwand:** 1 Tag

### Kontext
Aktuell werden Scores bei jedem Run überschrieben. Für Compare Runs (Phase 5) brauchen wir History.

### Akzeptanzkriterien
- [ ] Neues DB-Schema: score_history (symbol, run_date, universe, total_score, val, qual, tech, risk)
- [ ] Bei jedem Run automatisch History-Eintrag schreiben
- [ ] Bestehende Run-Logik nicht brechen
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Implementiere die Score-History-Tabelle für INTRINSIC.

1. Neues SQLite-Schema:
   CREATE TABLE score_history (
     id INTEGER PRIMARY KEY,
     symbol TEXT NOT NULL,
     run_date TEXT NOT NULL,
     universe TEXT NOT NULL,
     total_score REAL,
     valuation_score REAL,
     quality_score REAL,
     technical_score REAL,
     risk_score REAL,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
2. Index auf (symbol, run_date, universe)
3. Nach jedem Scoring-Run: Scores in score_history schreiben
4. Bestehende Logik nicht ändern, nur erweitern

Validierung:
- Run durchführen
- Prüfen ob score_history befüllt wurde
- Zweiten Run durchführen, beide Einträge vorhanden

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.9
```

### Output
→ OUTPUT.md #4.9

---

## Task 4.10: systemd Timer
**Agent:** Qwen  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.12  
**Aufwand:** 1 Tag

### Kontext
ETL soll täglich automatisch laufen: SEC → FMP → yfinance → Scoring Run.

### Akzeptanzkriterien
- [ ] systemd Service-File erstellt
- [ ] systemd Timer-File erstellt (täglich, z.B. 06:00 UTC)
- [ ] ETL-Reihenfolge: SEC-Sync → FMP-Load (250) → yfinance-Batch → Run trigger
- [ ] Logging in separate Log-Datei
- [ ] Failure-Alert (zumindest Log-Eintrag)
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Erstelle systemd Timer für den täglichen INTRINSIC ETL.

1. Service-File: /etc/systemd/system/intrinsic-etl.service
2. Timer-File: /etc/systemd/system/intrinsic-etl.timer
3. Ablauf:
   - SEC-Sync (falls aktiv)
   - FMP-Load (max 250 Calls)
   - yfinance-Batch für fehlende Daten
   - Scoring-Run für aktive Universes
4. Logging nach /var/log/intrinsic/etl.log
5. Bei Fehler: Exit Code != 0, Log-Eintrag mit ERROR

Erstelle auch ein Shell-Script das die einzelnen Schritte orchestriert.

Hinweis: Für lokale Entwicklung reicht das Script. systemd-Integration ist für VPS-Deployment.

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.10
```

### Output
→ OUTPUT.md #4.10

---

## Task 4.11: Monte-Carlo Import-Fix
**Agent:** Codex  
**Abhängigkeiten:** keine  
**Checkpoint:** Nach 4.12  
**Aufwand:** 0.5 Tag

### Kontext
Python Monte-Carlo-Skript hat defekte Imports. data/performance Ordner fehlt.

### Akzeptanzkriterien
- [ ] Import scoring.composite funktioniert
- [ ] data/performance/ Ordner existiert
- [ ] Skript läuft ohne Import-Fehler durch
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Fixe das Monte-Carlo Python-Skript.

1. Finde das Skript (vermutlich scripts/ oder python/)
2. Korrigiere den Import von scoring.composite
3. Erstelle data/performance/ falls nicht vorhanden
4. Teste einen Durchlauf

Validierung:
python <skript-pfad> --help
# oder
python <skript-pfad> --test

Skript muss ohne Import-Fehler starten.

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.11
```

### Output
→ OUTPUT.md #4.11

---

## Task 4.12: ETL-Monitoring
**Agent:** GLM  
**Abhängigkeiten:** 4.10 (informativ)  
**Checkpoint:** Nach 4.12  
**Aufwand:** 1 Tag

### Kontext
/health Dashboard existiert. Soll ETL-Status anzeigen.

### Akzeptanzkriterien
- [ ] Neues Widget auf /health: "ETL Status"
- [ ] Zeigt: Letzte Runs (SEC, FMP, yfinance), Success/Fail, Duration, Symbol-Count
- [ ] Visuell konsistent mit bestehendem Dashboard
- [ ] CHANGELOG-Eintrag geschrieben

### Prompt
```
Erweitere das /health Dashboard um ETL-Monitoring.

1. Neues Widget/Card: "ETL Status"
2. Inhalte:
   - Letzte ETL-Runs (Tabelle oder Liste)
   - Je Run: Timestamp, Provider (SEC/FMP/yfinance), Status (Success/Fail), Duration, Symbol-Count
3. Datenquelle: Falls keine ETL-Logs existieren, erstelle eine einfache etl_log Tabelle oder JSON-File
4. Dark Theme konsistent

Validierung: Visueller Check auf /health, keine Console Errors.

CHANGELOG-Eintrag nicht vergessen.

Dokumentiere deine Ergebnisse strukturiert für OUTPUT.md #4.12
```

### Output
→ OUTPUT.md #4.12
