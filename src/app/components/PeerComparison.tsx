'use client';

import type { RunV1SchemaJson } from '@/types/generated/run_v1';

type ScoreEntry = RunV1SchemaJson['scores'][number];

interface PeerComparisonProps {
  run: RunV1SchemaJson;
  currentScore: ScoreEntry;
}

function getSector(score: ScoreEntry): string | null {
  const direct = (score as { sector?: string | null }).sector;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();

  const diagnosticSector = score.price_target_diagnostics?.inputs?.sector;
  if (typeof diagnosticSector === 'string' && diagnosticSector.trim().length > 0) {
    return diagnosticSector.trim();
  }

  return null;
}

function formatDelta(value: number): string {
  if (Math.abs(value) < 0.05) return '0.0';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function formatScore(value: number): string {
  return value.toFixed(1);
}

function textForDelta(value: number): string {
  if (Math.abs(value) < 0.05) return 'text-text-muted';
  return value > 0 ? 'text-accent-green' : 'text-accent-red';
}

function normalizePeers(sectorScores: ScoreEntry[], currentScore: ScoreEntry): ScoreEntry[] {
  const topFive = sectorScores.slice(0, 5);
  if (topFive.some((item) => item.symbol === currentScore.symbol)) return topFive;

  const topWithoutCurrent = sectorScores
    .filter((item) => item.symbol !== currentScore.symbol)
    .slice(0, 4);

  return [...topWithoutCurrent, currentScore].sort((a, b) => b.total_score - a.total_score);
}

export function PeerComparison({ run, currentScore }: PeerComparisonProps) {
  const sector = getSector(currentScore);

  if (!sector) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
        <h3 className="text-base font-semibold text-text-primary">Peer Comparison</h3>
        <p className="mt-2 text-sm text-text-muted">Sector data not available</p>
      </div>
    );
  }

  const peersInSector = run.scores
    .filter((score) => getSector(score) === sector)
    .sort((a, b) => b.total_score - a.total_score);

  if (peersInSector.length === 0) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
        <h3 className="text-base font-semibold text-text-primary">Peer Comparison</h3>
        <p className="mt-2 text-sm text-text-muted">Sector data not available</p>
      </div>
    );
  }

  const peers = normalizePeers(peersInSector, currentScore);

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-text-primary">Peer Comparison</h3>
        <span className="text-xs text-text-muted">{sector}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-navy-700 text-[10px] uppercase tracking-wider text-text-muted">
              <th className="px-2 py-2 text-left" style={{ width: 80 }}>Symbol</th>
              <th className="px-2 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-right" style={{ width: 60 }}>Score</th>
              <th className="px-2 py-2 text-right" style={{ width: 50 }}>Val</th>
              <th className="px-2 py-2 text-right" style={{ width: 50 }}>Qual</th>
              <th className="px-2 py-2 text-right" style={{ width: 60 }}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((peer) => {
              const isCurrent = peer.symbol === currentScore.symbol;
              const delta = peer.total_score - currentScore.total_score;
              return (
                <tr
                  key={peer.symbol}
                  className={`border-b border-navy-700/70 ${isCurrent ? 'bg-navy-700/40' : ''}`}
                >
                  <td className="px-2 py-2">
                    <span className={`font-mono ${isCurrent ? 'text-accent-gold' : 'text-text-primary'}`}>
                      {peer.symbol}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-text-secondary">
                    <span className="line-clamp-1">{peer.company_name ?? peer.symbol}</span>
                  </td>
                  <td className="px-2 py-2 text-right text-text-primary">{formatScore(peer.total_score)}</td>
                  <td className="px-2 py-2 text-right text-text-secondary">{formatScore(peer.evidence.valuation)}</td>
                  <td className="px-2 py-2 text-right text-text-secondary">{formatScore(peer.evidence.quality)}</td>
                  <td className={`px-2 py-2 text-right ${isCurrent ? 'text-text-muted' : textForDelta(delta)}`}>
                    {isCurrent ? '0.0' : formatDelta(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
