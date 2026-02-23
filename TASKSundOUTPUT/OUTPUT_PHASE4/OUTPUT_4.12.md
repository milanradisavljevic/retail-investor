# OUTPUT Phase 4.12 — ETL-Monitoring

**Datum:** 2026-02-23
**Agent:** GLM
**Status:** ✅ Abgeschlossen

---

## Zusammenfassung

ETL-Monitoring Widget auf dem /health Dashboard implementiert. Zeigt die letzten ETL-Runs mit Timestamp, Provider, Status, Duration, Symbol-Count und Error Messages.

---

## Akzeptanzkriterien

| Kriterium | Status | Bemerkung |
|-----------|--------|-----------|
| Neues Widget auf /health: "ETL Status" | ✅ | Section mit Zap Icon |
| Zeigt: Letzte Runs | ✅ | Bis zu 20 Runs in Tabelle |
| Zeigt: Timestamp | ✅ | ISO-Format `YYYY-MM-DD HH:MM:SS` |
| Zeigt: Provider (SEC/FMP/yfinance) | ✅ | Mit Labels |
| Zeigt: Status (Success/Fail) | ✅ | OK/Fail/Running mit Farb-Badges |
| Zeigt: Duration | ✅ | Format: `s`, `m s`, `h m` |
| Zeigt: Symbol-Count | ✅ | Mit Tausender-Trennzeichen |
| Visuell konsistent mit bestehendem Dashboard | ✅ | Dark Theme, Tailwind-Klassen |
| CHANGELOG-Eintrag geschrieben | ✅ | `CHANGELOG.md` aktualisiert |

---

## Durchgeführte Änderungen

### 1. ETL-Logging Modul erstellt (`src/lib/etl_log.ts`)

```typescript
export type EtlProvider = 'sec' | 'fmp' | 'yfinance' | 'daily_run';
export type EtlStatus = 'success' | 'failed' | 'running';

export interface EtlRun {
  id: string;
  provider: EtlProvider;
  status: EtlStatus;
  started_at: string;
  finished_at: string | null;
  duration_sec: number | null;
  symbol_count: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

// Funktionen:
export function startEtlRun(provider, metadata): string
export function finishEtlRun(id, status, symbolCount, errorMessage, metadata): void
export function getRecentEtlRuns(limit): EtlRun[]
export function getLastSuccessfulRun(provider): EtlRun | null
```

### 2. HealthSnapshot erweitert (`src/lib/health.ts`)

```typescript
// Import hinzugefügt:
import { getRecentEtlRuns, type EtlRun } from './etl_log';

// Interface erweitert:
export interface HealthSnapshot {
  // ... existing fields ...
  etl_runs: EtlRun[];
}

// buildHealthSnapshot() erweitert:
etl_runs: getRecentEtlRuns(20),
```

### 3. UI-Komponente erstellt (`src/app/health/page.tsx`)

**Neue Funktionen:**
- `formatDuration(sec)` — Formatiert Sekunden zu `s`, `m s`, `h m`
- `providerLabel(provider)` — Mappt Provider zu Labels
- `statusStyle(status)` / `statusLabel(status)` — Farbige Status-Badges
- `EtlRunRow({ run })` — Tabellenzeile für einen ETL-Run

**Neue Section:**
```tsx
<section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
  <div className="mb-4 flex items-center gap-2">
    <Zap className="h-4 w-4 text-accent-blue" />
    <h2 className="text-lg font-semibold text-text-primary">ETL Status</h2>
    ...
  </div>
  {/* Tabelle mit ETL-Runs */}
</section>
```

### 4. Datenquelle erstellt (`data/logs/etl_runs.json`)

JSON-basierte Persistenz für ETL-Runs. Sample-Daten für die letzten 5 Runs sind enthalten.

---

## Validierung

### TypeScript
```bash
npx tsc --noEmit --pretty false
```
**Ergebnis:** ✅ Keine Fehler

### ESLint
```bash
npx eslint src/lib/etl_log.ts src/lib/health.ts src/app/health/page.tsx
```
**Ergebnis:** ✅ Keine Fehler

### Visueller Check
- `/health` zeigt neue "ETL Status" Section
- Tabelle mit Sample-Daten wird korrekt angezeigt
- Status-Badges korrekt gefärbt (OK=grün, Fail=rot, Running=blau)
- Keine Console Errors

---

## Nächste Schritte

1. **ETL-Skripte anpassen:** ETL-Skripte (SEC, FMP, yfinance, Daily Run) müssen `etl_log.ts` verwenden, um Runs zu loggen:
   ```typescript
   import { startEtlRun, finishEtlRun } from '@/lib/etl_log';
   
   const runId = startEtlRun('fmp', { daily_budget: 250 });
   try {
     // ... ETL logic ...
     finishEtlRun(runId, 'success', symbolCount);
   } catch (error) {
     finishEtlRun(runId, 'failed', null, error.message);
   }
   ```

2. **API-Endpoint (optional):** Für Live-Updates könnte ein API-Endpoint `/api/etl/status` erstellt werden.

---

## Dateien

| Datei | Aktion |
|-------|--------|
| `src/lib/etl_log.ts` | Neu erstellt |
| `src/lib/health.ts` | Erweitert |
| `src/app/health/page.tsx` | Erweitert |
| `data/logs/etl_runs.json` | Neu erstellt |
| `CHANGELOG.md` | Aktualisiert |
| `TASKSundOUTPUT/OUTPUT_PHASE4.md` | Aktualisiert |

---

## CHANGELOG-Eintrag

Siehe `CHANGELOG.md` unter `[Unreleased]` → `[Phase 4.12] ETL-Monitoring — 2026-02-23 (GLM)`.
