import fs from 'fs';
import path from 'path';

interface FetchEntry {
  ts: number;
  phase: 'fundamentals' | 'prices' | 'technical' | 'metadata';
  symbol: string;
  durationMs: number;
  cacheHit: boolean;
  provider: string;
  error?: string;
}

interface PhaseStats {
  count: number;
  totalMs: number;
  min: number;
  max: number;
  cacheHits: number;
  errors: number;
}

function loadEntries(logPath: string): FetchEntry[] {
  if (!fs.existsSync(logPath)) {
    console.error('Log file not found:', logPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  return lines
    .map((l) => {
      try {
        return JSON.parse(l) as FetchEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is FetchEntry => !!e);
}

function initStats(): PhaseStats {
  return { count: 0, totalMs: 0, min: Number.POSITIVE_INFINITY, max: 0, cacheHits: 0, errors: 0 };
}

function summarize(entries: FetchEntry[]) {
  const phases: Record<string, PhaseStats> = {
    fundamentals: initStats(),
    prices: initStats(),
    technical: initStats(),
    metadata: initStats(),
  };
  const providerTotals: Record<string, number> = {};

  for (const e of entries) {
    const ps = phases[e.phase];
    ps.count++;
    ps.totalMs += e.durationMs;
    ps.min = Math.min(ps.min, e.durationMs);
    ps.max = Math.max(ps.max, e.durationMs);
    if (e.cacheHit) ps.cacheHits++;
    if (e.error) ps.errors++;
    providerTotals[e.provider] = (providerTotals[e.provider] ?? 0) + e.durationMs;
  }

  const phaseSummary = Object.entries(phases).map(([phase, s]) => {
    const avg = s.count ? s.totalMs / s.count : 0;
    const cacheRate = s.count ? s.cacheHits / s.count : 0;
    return { phase, avg, min: s.min === Infinity ? 0 : s.min, max: s.max, cacheRate, errors: s.errors, total: s.totalMs };
  });

  phaseSummary.sort((a, b) => b.total - a.total);
  const bottleneck = phaseSummary[0]?.phase ?? 'unknown';

  const totalDuration = phaseSummary.reduce((acc, p) => acc + p.total, 0);

  return { phaseSummary, bottleneck, totalDuration, providerTotals };
}

function formatMs(ms: number) {
  if (ms > 60000) return `${(ms / 60000).toFixed(1)} min`;
  if (ms > 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms.toFixed(0)} ms`;
}

function buildReport(logPath: string, outPath: string) {
  const entries = loadEntries(logPath);
  const { phaseSummary, bottleneck, totalDuration, providerTotals } = summarize(entries);
  const now = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push('# Performance Audit Report');
  lines.push(`Date: ${now}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Log file: ${logPath}`);
  lines.push(`- Total Runtime (sum of phases): ${formatMs(totalDuration)}`);
  lines.push(`- Bottleneck Phase: **${bottleneck}**`);
  lines.push('');
  lines.push('## Phase Breakdown');
  lines.push('');
  lines.push('| Phase | Avg | Min | Max | Cache Rate | Errors | Total |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const p of phaseSummary) {
    lines.push(`| ${p.phase} | ${formatMs(p.avg)} | ${formatMs(p.min)} | ${formatMs(p.max)} | ${(p.cacheRate * 100).toFixed(1)}% | ${p.errors} | ${formatMs(p.total)} |`);
  }

  lines.push('');
  lines.push('## Provider Share');
  lines.push('');
  lines.push('| Provider | Total Time |');
  lines.push('| --- | --- |');
  for (const [prov, total] of Object.entries(providerTotals).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${prov} | ${formatMs(total)} |`);
  }

  lines.push('');
  lines.push('## Recommendations');
  lines.push('- Increase concurrency for fundamentals/prices if they dominate total time.');
  lines.push('- Improve cache hit rate; consider warming frequently-used symbols.');
  lines.push('- Investigate errors if error count > 0.');

  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`Report written to ${outPath}`);
}

const logPathArg = process.argv[2];
const logPath = logPathArg ?? path.join(process.cwd(), 'data', 'performance', 'fetch-phase-log.ndjson');
const outPath = path.join(process.cwd(), 'docs', 'performance-audit-report.md');
buildReport(logPath, outPath);
