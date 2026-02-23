import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { loadRunFiles } from '@/run/files';
import { evaluateRunQualityGate } from '@/run/quality_gate';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import type {
  ObservatoryConsistencySeverity,
  ObservatorySource,
  ObservatoryStockDeltaLeader,
  ObservatoryStockRecord,
  ObservatoryUniverseDrift,
  ObservatoryUniverseScorecard,
  QualityObservatorySnapshot,
} from '@/types/quality_observatory';

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_UNIVERSE_IDS = ['nasdaq100', 'sp500-full', 'russell2000_full'];
const QUALITY_FIELDS = ['roe', 'roa', 'debtToEquity', 'grossMargin'] as const;
const VALUATION_FIELDS = ['peRatio', 'pbRatio', 'psRatio'] as const;
const CROSS_SOURCE_AUDITS_DIR = path.join(process.cwd(), 'data', 'audits');
const CROSS_SOURCE_VALIDATION_PATH = path.join(
  process.cwd(),
  'data',
  'validation',
  'cross-source-audit.json'
);

interface UniverseConfig {
  id: string;
  name: string;
  symbols: string[];
}

interface LatestSnapshotRow {
  symbol: string;
  fetched_at: number;
  data_json: string;
}

interface LatestSnapshot {
  symbol: string;
  fetchedAtMs: number;
  source: ObservatorySource;
  payload: Record<string, unknown>;
}

interface CrossSourceReport {
  generated_at?: string;
  universe?: string;
  summary?: {
    pair_comparisons_total?: number;
    pair_conflicts_total?: number;
    pair_critical_total?: number;
  };
  top_pair_conflicts?: Array<{
    symbol?: string;
    metric?: string;
    severity?: string;
  }>;
}

interface ConsistencyLookup {
  summary: ObservatoryUniverseScorecard['consistency'];
  perSymbol: Map<string, { severity: ObservatoryConsistencySeverity; metrics: string[] }>;
}

interface DistributionStats {
  avg: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

interface RunPair {
  latest: RunV1SchemaJson | null;
  previous: RunV1SchemaJson | null;
  latestId: string | null;
  previousId: string | null;
}

let cache: { expiresAt: number; key: string; data: QualityObservatorySnapshot } | null = null;

function normalizeUniverseId(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSource(raw: unknown): ObservatorySource {
  if (raw === 'sec_edgar_bulk') return 'sec_edgar_bulk';
  if (raw === 'sec_edgar') return 'sec_edgar';
  if (raw === 'fmp') return 'fmp';
  if (raw === 'yfinance') return 'yfinance';
  if (raw === null || raw === undefined) return 'unknown';
  return 'unknown';
}

function normalizeEpochMs(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // ignore malformed rows
  }
  return null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export function calculateDistribution(values: Array<number | null | undefined>): DistributionStats {
  const cleaned = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (cleaned.length === 0) {
    return { avg: null, p25: null, p50: null, p75: null };
  }
  const avg = cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length;
  return {
    avg: Number(avg.toFixed(2)),
    p25: percentile(cleaned, 25),
    p50: percentile(cleaned, 50),
    p75: percentile(cleaned, 75),
  };
}

function resolveUniversePath(universeId: string): string {
  const id = normalizeUniverseId(universeId);
  const universesDir = path.join(process.cwd(), 'config', 'universes');
  const candidates = Array.from(
    new Set([
      `${id}.json`,
      `${id.replace(/_/g, '-')}.json`,
      `${id.replace(/-/g, '_')}.json`,
    ])
  );

  for (const candidate of candidates) {
    const full = path.join(universesDir, candidate);
    if (fs.existsSync(full)) return full;
  }

  throw new Error(`Universe config not found for "${universeId}"`);
}

function loadUniverseConfig(universeId: string): UniverseConfig {
  const fullPath = resolveUniversePath(universeId);
  const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as {
    name?: string;
    symbols?: unknown[];
  };

  const symbols = Array.from(
    new Set(
      (Array.isArray(parsed.symbols) ? parsed.symbols : [])
        .map((symbol) => normalizeSymbol(symbol))
        .filter((symbol): symbol is string => Boolean(symbol))
    )
  );

  return {
    id: normalizeUniverseId(universeId),
    name: typeof parsed.name === 'string' ? parsed.name : universeId,
    symbols,
  };
}

function chunk<T>(input: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let idx = 0; idx < input.length; idx += size) {
    result.push(input.slice(idx, idx + size));
  }
  return result;
}

function loadLatestSnapshots(db: Database.Database, symbols: string[]): Map<string, LatestSnapshot> {
  const bySymbol = new Map<string, LatestSnapshot>();
  if (symbols.length === 0) return bySymbol;

  for (const symbolChunk of chunk(symbols, 900)) {
    const placeholders = symbolChunk.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `
        WITH latest AS (
          SELECT symbol, MAX(fetched_at) AS fetched_at
          FROM fundamentals_snapshot
          WHERE symbol IN (${placeholders})
          GROUP BY symbol
        )
        SELECT fs.symbol, fs.fetched_at, fs.data_json
        FROM fundamentals_snapshot fs
        JOIN latest l
          ON l.symbol = fs.symbol
         AND l.fetched_at = fs.fetched_at
      `
      )
      .all(...symbolChunk) as LatestSnapshotRow[];

    for (const row of rows) {
      const payload = parseJsonObject(row.data_json);
      if (!payload) continue;

      const fetchedAtMs = normalizeEpochMs(row.fetched_at);
      if (!fetchedAtMs) continue;

      bySymbol.set(String(row.symbol).toUpperCase(), {
        symbol: String(row.symbol).toUpperCase(),
        fetchedAtMs,
        source: normalizeSource(payload._source),
        payload,
      });
    }
  }

  return bySymbol;
}

function getFieldValue(payload: Record<string, unknown>, field: string): number | null {
  const direct = toNumber(payload[field]);
  if (direct !== null) return direct;
  const secEdgar =
    payload.secEdgar && typeof payload.secEdgar === 'object'
      ? (payload.secEdgar as Record<string, unknown>)
      : null;
  if (!secEdgar) return null;
  return toNumber(secEdgar[field]);
}

function loadUniverseRunPair(universe: UniverseConfig): RunPair {
  const allRuns = loadRunFiles(500);
  const targetUniverseName = universe.name.trim().toLowerCase();
  const targetUniverseNorm = targetUniverseName.replace(/[^a-z0-9]/g, '');

  const matches = allRuns.filter((entry) => {
    const runName = entry.run.universe?.definition?.name?.trim().toLowerCase() ?? '';
    if (!runName) return false;
    if (runName === targetUniverseName) return true;
    const runNorm = runName.replace(/[^a-z0-9]/g, '');
    return runNorm === targetUniverseNorm;
  });

  const latest = matches[0]?.run ?? null;
  const previous = matches[1]?.run ?? null;

  return {
    latest,
    previous,
    latestId: latest?.run_id ?? null,
    previousId: previous?.run_id ?? null,
  };
}

function loadCrossSourceConsistency(universeId: string): ConsistencyLookup {
  const fallback: ConsistencyLookup = {
    summary: null,
    perSymbol: new Map(),
  };

  const normalizedUniverse = normalizeUniverseId(universeId);
  const candidateFiles: string[] = [];

  if (fs.existsSync(CROSS_SOURCE_AUDITS_DIR)) {
    const files = fs
      .readdirSync(CROSS_SOURCE_AUDITS_DIR)
      .filter((name) => name.startsWith('cross_source_audit_') && name.endsWith('.json'))
      .sort()
      .reverse();
    for (const file of files) {
      candidateFiles.push(path.join(CROSS_SOURCE_AUDITS_DIR, file));
    }
  }

  if (fs.existsSync(CROSS_SOURCE_VALIDATION_PATH)) {
    candidateFiles.push(CROSS_SOURCE_VALIDATION_PATH);
  }

  for (const file of candidateFiles) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as CrossSourceReport;
      const reportUniverse = normalizeUniverseId(String(parsed.universe ?? ''));
      if (reportUniverse !== normalizedUniverse) continue;

      const comparablePairs = toNumber(parsed.summary?.pair_comparisons_total) ?? 0;
      const conflictPairs = toNumber(parsed.summary?.pair_conflicts_total) ?? 0;
      const criticalPairs = toNumber(parsed.summary?.pair_critical_total) ?? 0;

      const perSymbol = new Map<string, { severity: ObservatoryConsistencySeverity; metrics: string[] }>();
      for (const event of parsed.top_pair_conflicts ?? []) {
        const symbol = normalizeSymbol(event.symbol);
        if (!symbol) continue;
        const severity =
          event.severity === 'critical'
            ? 'critical'
            : event.severity === 'conflict'
              ? 'conflict'
              : 'none';
        if (severity === 'none') continue;

        const existing = perSymbol.get(symbol);
        const metric = typeof event.metric === 'string' ? event.metric : 'unknown';
        const metrics = Array.from(new Set([...(existing?.metrics ?? []), metric]));
        const mergedSeverity: ObservatoryConsistencySeverity =
          existing?.severity === 'critical' || severity === 'critical'
            ? 'critical'
            : 'conflict';
        perSymbol.set(symbol, { severity: mergedSeverity, metrics });
      }

      return {
        summary: {
          universe: normalizedUniverse,
          generated_at: parsed.generated_at ?? null,
          comparable_pairs: comparablePairs,
          conflict_pairs: conflictPairs,
          critical_pairs: criticalPairs,
          conflict_rate_pct:
            comparablePairs > 0 ? Number(((conflictPairs / comparablePairs) * 100).toFixed(2)) : 0,
          critical_rate_pct:
            comparablePairs > 0 ? Number(((criticalPairs / comparablePairs) * 100).toFixed(2)) : 0,
        },
        perSymbol,
      };
    } catch {
      // ignore malformed reports
    }
  }

  return fallback;
}

function scoreMapFromRun(
  run: RunV1SchemaJson | null
): Map<
  string,
  {
    total: number | null;
    quality: number | null;
    dq: number | null;
  }
> {
  const map = new Map<
    string,
    {
      total: number | null;
      quality: number | null;
      dq: number | null;
    }
  >();
  if (!run) return map;

  for (const score of run.scores) {
    const symbol = normalizeSymbol(score.symbol);
    if (!symbol) continue;
    map.set(symbol, {
      total: typeof score.total_score === 'number' ? score.total_score : null,
      quality: typeof score.evidence?.quality === 'number' ? score.evidence.quality : null,
      dq:
        typeof score.data_quality?.data_quality_score === 'number'
          ? score.data_quality.data_quality_score
          : null,
    });
  }
  return map;
}

export function buildQualityObservatory(universeIds: string[] = DEFAULT_UNIVERSE_IDS): QualityObservatorySnapshot {
  const generatedAt = new Date().toISOString();
  const normalizedUniverseIds = Array.from(new Set(universeIds.map((id) => normalizeUniverseId(id))));
  const privatinvestorDbPath = path.join(process.cwd(), 'data', 'privatinvestor.db');
  const db = new Database(privatinvestorDbPath, { readonly: true });

  try {
    const universeScorecards: ObservatoryUniverseScorecard[] = [];
    const stockRecords: ObservatoryStockRecord[] = [];
    const driftRows: ObservatoryUniverseDrift[] = [];
    const dqLeaderPool: Array<{ symbol: string; delta: number; current: number; previous: number }> = [];

    for (const universeId of normalizedUniverseIds) {
      const universe = loadUniverseConfig(universeId);
      const snapshots = loadLatestSnapshots(db, universe.symbols);
      const runPair = loadUniverseRunPair(universe);
      const latestRunScores = scoreMapFromRun(runPair.latest);
      const previousRunScores = scoreMapFromRun(runPair.previous);
      const consistency = loadCrossSourceConsistency(universe.id);

      const sourceMix: Record<ObservatorySource, number> = {
        sec_edgar_bulk: 0,
        sec_edgar: 0,
        fmp: 0,
        yfinance: 0,
        unknown: 0,
        gap: 0,
      };

      let withSnapshot = 0;
      let quality4Complete = 0;
      let valuation3Complete = 0;
      let stale7Count = 0;
      let stale30Count = 0;
      const ages: number[] = [];

      for (const symbol of universe.symbols) {
        const snapshot = snapshots.get(symbol);
        const runCurrent = latestRunScores.get(symbol);
        const runPrevious = previousRunScores.get(symbol);
        const currentTotal = runCurrent?.total ?? null;
        const previousTotal = runPrevious?.total ?? null;
        const currentQuality = runCurrent?.quality ?? null;
        const previousQuality = runPrevious?.quality ?? null;
        const currentDq = runCurrent?.dq ?? null;
        const previousDq = runPrevious?.dq ?? null;

        if (!snapshot) {
          sourceMix.gap += 1;
          stockRecords.push({
            universe_id: universe.id,
            universe_name: universe.name,
            symbol,
            has_snapshot: false,
            source: 'gap',
            fetched_at: null,
            age_days: null,
            stale_30d: true,
            quality4_complete: false,
            valuation3_complete: false,
            quality_fields_present: 0,
            valuation_fields_present: 0,
            missing_quality_fields: [...QUALITY_FIELDS],
            missing_valuation_fields: [...VALUATION_FIELDS],
            data_quality_score: currentDq,
            total_score: currentTotal,
            total_score_delta:
              currentTotal !== null && previousTotal !== null
                ? Number((currentTotal - previousTotal).toFixed(2))
                : null,
            quality_pillar_score: currentQuality,
            quality_pillar_delta:
              currentQuality !== null && previousQuality !== null
                ? Number((currentQuality - previousQuality).toFixed(2))
                : null,
            consistency_severity: 'none',
            consistency_metrics: [],
          });
          continue;
        }

        withSnapshot += 1;
        sourceMix[snapshot.source] += 1;

        const ageDays = Number(((Date.now() - snapshot.fetchedAtMs) / (1000 * 60 * 60 * 24)).toFixed(2));
        if (Number.isFinite(ageDays)) {
          ages.push(ageDays);
          if (ageDays > 7) stale7Count += 1;
          if (ageDays > 30) stale30Count += 1;
        }

        const missingQuality = QUALITY_FIELDS.filter(
          (field) => getFieldValue(snapshot.payload, field) === null
        );
        const missingValuation = VALUATION_FIELDS.filter(
          (field) => getFieldValue(snapshot.payload, field) === null
        );

        const qualityComplete = missingQuality.length === 0;
        const valuationComplete = missingValuation.length === 0;
        if (qualityComplete) quality4Complete += 1;
        if (valuationComplete) valuation3Complete += 1;

        const symbolConsistency = consistency.perSymbol.get(symbol);

        const totalScoreDelta =
          currentTotal !== null && previousTotal !== null
            ? Number((currentTotal - previousTotal).toFixed(2))
            : null;
        const qualityDelta =
          currentQuality !== null && previousQuality !== null
            ? Number((currentQuality - previousQuality).toFixed(2))
            : null;

        if (
          currentDq !== null &&
          previousDq !== null &&
          Number.isFinite(currentDq) &&
          Number.isFinite(previousDq)
        ) {
          dqLeaderPool.push({
            symbol,
            delta: Number((currentDq - previousDq).toFixed(2)),
            current: currentDq,
            previous: previousDq,
          });
        }

        stockRecords.push({
          universe_id: universe.id,
          universe_name: universe.name,
          symbol,
          has_snapshot: true,
          source: snapshot.source,
          fetched_at: new Date(snapshot.fetchedAtMs).toISOString(),
          age_days: ageDays,
          stale_30d: ageDays > 30,
          quality4_complete: qualityComplete,
          valuation3_complete: valuationComplete,
          quality_fields_present: QUALITY_FIELDS.length - missingQuality.length,
          valuation_fields_present: VALUATION_FIELDS.length - missingValuation.length,
          missing_quality_fields: missingQuality,
          missing_valuation_fields: missingValuation,
          data_quality_score: currentDq,
          total_score: currentTotal,
          total_score_delta: totalScoreDelta,
          quality_pillar_score: currentQuality,
          quality_pillar_delta: qualityDelta,
          consistency_severity: symbolConsistency?.severity ?? 'none',
          consistency_metrics: symbolConsistency?.metrics ?? [],
        });
      }

      const dqDistribution = calculateDistribution(
        universe.symbols.map((symbol) => latestRunScores.get(symbol)?.dq ?? null)
      );
      const pctLow =
        typeof runPair.latest?.data_quality_summary?.pct_low === 'number'
          ? Number((runPair.latest.data_quality_summary.pct_low * 100).toFixed(2))
          : null;
      const medianAge = calculateDistribution(ages).p50;
      const oldestAge = ages.length ? Number(Math.max(...ages).toFixed(2)) : null;

      const gate = runPair.latest?.quality_gate
        ? {
            status: runPair.latest.quality_gate.status,
            blocked: runPair.latest.quality_gate.blocked,
            reasons: runPair.latest.quality_gate.reasons,
          }
        : runPair.latest?.data_quality_summary
          ? (() => {
              const evaluated = evaluateRunQualityGate(
                runPair.latest.data_quality_summary,
                runPair.latest.scores.length
              );
              return {
                status: evaluated.status,
                blocked: evaluated.blocked,
                reasons: evaluated.reasons,
              };
            })()
          : null;

      universeScorecards.push({
        universe_id: universe.id,
        universe_name: universe.name,
        generated_at: generatedAt,
        symbol_count: universe.symbols.length,
        symbols_with_snapshot: withSnapshot,
        snapshot_coverage_pct: Number(
          ((withSnapshot / Math.max(universe.symbols.length, 1)) * 100).toFixed(2)
        ),
        quality4_coverage_pct: Number(
          ((quality4Complete / Math.max(universe.symbols.length, 1)) * 100).toFixed(2)
        ),
        valuation3_coverage_pct: Number(
          ((valuation3Complete / Math.max(universe.symbols.length, 1)) * 100).toFixed(2)
        ),
        data_quality: {
          avg: dqDistribution.avg,
          p25: dqDistribution.p25,
          p50: dqDistribution.p50,
          p75: dqDistribution.p75,
          pct_low: pctLow,
        },
        freshness: {
          median_age_days: medianAge,
          oldest_age_days: oldestAge,
          pct_older_than_7d: Number(
            ((stale7Count / Math.max(withSnapshot, 1)) * 100).toFixed(2)
          ),
          pct_older_than_30d: Number(
            ((stale30Count / Math.max(withSnapshot, 1)) * 100).toFixed(2)
          ),
        },
        source_mix: sourceMix,
        consistency: consistency.summary,
        quality_gate: gate,
      });

      let changed = 0;
      let improved = 0;
      let declined = 0;
      for (const symbol of universe.symbols) {
        const current = latestRunScores.get(symbol)?.dq;
        const previous = previousRunScores.get(symbol)?.dq;
        if (current === null || current === undefined || previous === null || previous === undefined) continue;
        const delta = current - previous;
        if (Math.abs(delta) < 0.001) continue;
        changed += 1;
        if (delta > 0) improved += 1;
        if (delta < 0) declined += 1;
      }

      driftRows.push({
        universe_id: universe.id,
        universe_name: universe.name,
        current_run_id: runPair.latestId,
        previous_run_id: runPair.previousId,
        avg_data_quality_delta:
          runPair.latest?.data_quality_summary?.avg_data_quality_score !== undefined &&
          runPair.previous?.data_quality_summary?.avg_data_quality_score !== undefined
            ? Number(
                (
                  runPair.latest.data_quality_summary.avg_data_quality_score -
                  runPair.previous.data_quality_summary.avg_data_quality_score
                ).toFixed(2)
              )
            : null,
        pct_low_delta:
          runPair.latest?.data_quality_summary?.pct_low !== undefined &&
          runPair.previous?.data_quality_summary?.pct_low !== undefined
            ? Number(
                (
                  (runPair.latest.data_quality_summary.pct_low -
                    runPair.previous.data_quality_summary.pct_low) *
                  100
                ).toFixed(2)
              )
            : null,
        changed_symbols: changed,
        improved_symbols: improved,
        declined_symbols: declined,
      });
    }

    const topImprovers: ObservatoryStockDeltaLeader[] = [...dqLeaderPool]
      .filter((row) => row.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 20)
      .map((row) => ({
        symbol: row.symbol,
        delta: row.delta,
        current: row.current,
        previous: row.previous,
      }));

    const topDecliners: ObservatoryStockDeltaLeader[] = [...dqLeaderPool]
      .filter((row) => row.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 20)
      .map((row) => ({
        symbol: row.symbol,
        delta: row.delta,
        current: row.current,
        previous: row.previous,
      }));

    return {
      generated_at: generatedAt,
      universe_ids: normalizedUniverseIds,
      universes: universeScorecards,
      stocks: stockRecords,
      drift: {
        generated_at: generatedAt,
        universes: driftRows,
        top_dq_improvers: topImprovers,
        top_dq_decliners: topDecliners,
      },
    };
  } finally {
    db.close();
  }
}

export function getQualityObservatorySnapshot(
  opts: { universeIds?: string[]; forceRefresh?: boolean } = {}
): QualityObservatorySnapshot {
  const universeIds = opts.universeIds ?? DEFAULT_UNIVERSE_IDS;
  const forceRefresh = opts.forceRefresh ?? false;
  const key = universeIds.map((id) => normalizeUniverseId(id)).sort().join(',');
  const now = Date.now();

  if (!forceRefresh && cache && cache.key === key && cache.expiresAt > now) {
    return cache.data;
  }

  const data = buildQualityObservatory(universeIds);
  cache = {
    key,
    data,
    expiresAt: now + CACHE_TTL_MS,
  };
  return data;
}

function copyFileSafe(from: string, to: string): void {
  fs.copyFileSync(from, to);
}

export function persistQualityObservatorySnapshot(
  snapshot: QualityObservatorySnapshot,
  opts: { rootDir?: string } = {}
): { dir: string; latestFile: string } {
  const rootDir =
    opts.rootDir ?? path.join(process.cwd(), 'data', 'quality', 'observatory');
  fs.mkdirSync(rootDir, { recursive: true });

  const ts = snapshot.generated_at
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');
  const dir = path.join(rootDir, ts);
  fs.mkdirSync(dir, { recursive: true });

  const snapshotPath = path.join(dir, 'snapshot.json');
  const scorecardPath = path.join(dir, 'universe_scorecard.json');
  const driftPath = path.join(dir, 'drift_report.json');
  const stocksJsonlPath = path.join(dir, 'stock_quality.jsonl');

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  fs.writeFileSync(scorecardPath, JSON.stringify(snapshot.universes, null, 2), 'utf-8');
  fs.writeFileSync(driftPath, JSON.stringify(snapshot.drift, null, 2), 'utf-8');
  fs.writeFileSync(
    stocksJsonlPath,
    snapshot.stocks.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf-8'
  );

  const latestFile = path.join(rootDir, 'latest.json');
  const latestScorecard = path.join(rootDir, 'latest_universe_scorecard.json');
  const latestDrift = path.join(rootDir, 'latest_drift_report.json');
  const latestStocks = path.join(rootDir, 'latest_stock_quality.jsonl');

  copyFileSafe(snapshotPath, latestFile);
  copyFileSafe(scorecardPath, latestScorecard);
  copyFileSafe(driftPath, latestDrift);
  copyFileSafe(stocksJsonlPath, latestStocks);

  return { dir, latestFile };
}
