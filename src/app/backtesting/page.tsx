import fs from 'fs';
import path from 'path';
import BacktestingClient, { type ModelEntry } from './components/BacktestingClient';
import { loadBacktestData, loadStrategyComparison, type StrategyComparisonRow, type BacktestSummary } from './utils/loadBacktestData';

function summaryToRow(summary: BacktestSummary, name: string): StrategyComparisonRow {
  const bench = summary.benchmark?.total_return_pct ?? 0;
  return {
    name,
    totalReturn: summary.metrics.total_return_pct,
    sharpe: summary.metrics.sharpe_ratio,
    maxDrawdown: summary.metrics.max_drawdown_pct,
    outperformance: summary.metrics.total_return_pct - bench,
  };
}

function loadUniverses(): string[] {
  const dir = path.join(process.cwd(), 'config', 'universes');
  if (!fs.existsSync(dir)) return ['russell2000_full'];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}

function buildComparisonRows(
  momentum: ReturnType<typeof loadBacktestData>,
  hybrid: ReturnType<typeof loadBacktestData>,
  fourPillar: ReturnType<typeof loadBacktestData>,
  fileRows: StrategyComparisonRow[]
): StrategyComparisonRow[] {
  const rows: StrategyComparisonRow[] = [];
  if (momentum.summary) rows.push(summaryToRow(momentum.summary, 'Momentum-Only'));
  if (hybrid.summary) rows.push(summaryToRow(hybrid.summary, 'Hybrid'));
  if (fourPillar.summary) rows.push(summaryToRow(fourPillar.summary, '4-Pillar'));

  const seen = new Set(rows.map((r) => r.name.toLowerCase()));
  for (const row of fileRows) {
    const key = row.name.toLowerCase();
    if (!seen.has(key)) {
      rows.push(row);
    }
  }
  return rows;
}

export default function BacktestingPage() {
  const momentum = loadBacktestData('momentum');
  const hybrid = loadBacktestData('hybrid');
  const fourPillar = loadBacktestData('4pillar');
  const comparisonFile = loadStrategyComparison();
  const universes = loadUniverses();

  const models: ModelEntry[] = [
    {
      key: 'momentum',
      label: 'Momentum-Only',
      status: momentum.summary ? 'done' : 'pending',
      summary: momentum.summary,
      timeSeries: momentum.timeSeries,
      note: 'Aktueller Momentum-Run (388% Total Return, hoher DD).',
    },
    {
      key: 'hybrid',
      label: 'Hybrid',
      status: hybrid.summary ? 'done' : 'pending',
      summary: hybrid.summary,
      timeSeries: hybrid.timeSeries,
      note: 'Hybrid-Run (23% p.a., DD moderat).',
    },
    {
      key: '4pillar',
      label: '4-Pillar',
      status: fourPillar.summary ? 'done' : 'failed',
      summary: fourPillar.summary,
      timeSeries: fourPillar.timeSeries,
      note: '4-Pillar Lauf (aktuell via hybrid-run erzeugt; für echtes 4-Pillar-Scoring Custom Weights nutzen).',
    },
    {
      key: 'momentum-cap',
      label: 'Momentum + MCAP > 500M',
      status: 'pending',
      summary: null,
      timeSeries: [],
      note: 'Noch nicht gerechnet.',
    },
    {
      key: 'momentum-vol',
      label: 'Momentum + Volatility < 50%',
      status: 'pending',
      summary: null,
      timeSeries: [],
      note: 'Noch nicht gerechnet.',
    },
  ];

  const comparisonRows = buildComparisonRows(momentum, hybrid, fourPillar, comparisonFile);

  return <BacktestingClient models={models} universes={universes} comparisonRows={comparisonRows} />;
}
