'use client';

import type { PeerComparisonData } from '@/lib/analysis/peerAnalysis';

interface Props {
  data: PeerComparisonData;
}

export function PeerComparison({ data }: Props) {
  const allPeers = [data.targetMetrics, ...data.peers];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Peer Comparison</h3>
        <span className="text-sm text-text-muted">
          {data.sector} Sector • Similar Market Cap
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-navy-700 bg-navy-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-700">
              <th className="text-left px-4 py-3 text-text-muted font-medium">Symbol</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium">Score</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium">P/E</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium">ROE</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium">1Y Return</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium">Risk Score</th>
            </tr>
          </thead>
          <tbody>
            {allPeers.map((peer) => {
              const isTarget = peer.symbol === data.targetSymbol;
              const oneYearReturn = peer.metrics.oneYearReturn;
              const returnColor =
                oneYearReturn === null
                  ? 'text-text-secondary'
                  : oneYearReturn >= 0
                    ? 'text-green-400'
                    : 'text-red-400';

              return (
                <tr
                  key={peer.symbol}
                  className={`border-b border-navy-700 ${isTarget ? 'bg-accent-blue/10' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono font-semibold ${
                          isTarget ? 'text-accent-blue' : 'text-text-primary'
                        }`}
                      >
                        {peer.symbol}
                      </span>
                      {isTarget && (
                        <span className="text-xs bg-accent-blue/20 text-accent-blue px-2 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{peer.companyName}</div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-semibold text-text-primary">
                        {peer.totalScore.toFixed(1)}
                      </span>
                      <RankBadge rank={peer.ranking.score} />
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={getValueColor(peer.metrics.pe, data.averages.pe, 'lower')}>
                        {peer.metrics.pe !== null ? peer.metrics.pe.toFixed(1) : '—'}
                      </span>
                      {peer.metrics.pe !== null && <RankBadge rank={peer.ranking.pe} />}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={getValueColor(peer.metrics.roe, data.averages.roe, 'higher')}>
                        {peer.metrics.roe !== null ? `${peer.metrics.roe.toFixed(1)}%` : '—'}
                      </span>
                      {peer.metrics.roe !== null && <RankBadge rank={peer.ranking.roe} />}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={returnColor}>
                        {oneYearReturn !== null
                          ? `${oneYearReturn >= 0 ? '+' : ''}${oneYearReturn.toFixed(1)}%`
                          : '—'}
                      </span>
                      {oneYearReturn !== null && <RankBadge rank={peer.ranking.return} />}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-text-primary">{peer.metrics.riskScore.toFixed(1)}</span>
                      <RankBadge rank={peer.ranking.risk} />
                    </div>
                  </td>
                </tr>
              );
            })}

            <tr className="bg-navy-700/50">
              <td className="px-4 py-3 font-semibold text-text-primary">Sector Average</td>
              <td className="px-4 py-3 text-right text-text-secondary">
                {data.averages.score.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-right text-text-secondary">
                {data.averages.pe.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-right text-text-secondary">
                {data.averages.roe.toFixed(1)}%
              </td>
              <td className="px-4 py-3 text-right text-text-secondary">
                {data.averages.return.toFixed(1)}%
              </td>
              <td className="px-4 py-3 text-right text-text-secondary">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-navy-700 bg-navy-800 p-4">
        <h4 className="text-sm font-semibold text-text-primary mb-2">Interpretation</h4>
        <p className="text-sm text-text-secondary">{generateInterpretation(data)}</p>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medals = ['🥇', '🥈', '🥉'];

  if (rank === 1) return <span className="text-lg">{medals[0]}</span>;
  if (rank === 2) return <span className="text-lg">{medals[1]}</span>;
  if (rank === 3) return <span className="text-lg">{medals[2]}</span>;

  return <span className="text-xs text-text-muted font-mono">#{rank}</span>;
}

function getValueColor(
  value: number | null,
  average: number,
  betterWhen: 'higher' | 'lower'
): string {
  if (value === null || average === 0 || Number.isNaN(average)) return 'text-text-secondary';

  const diff = betterWhen === 'higher' ? value - average : average - value;

  if (diff > Math.abs(average) * 0.1) return 'text-green-400';
  if (diff < -Math.abs(average) * 0.1) return 'text-red-400';
  return 'text-text-primary';
}

function generateInterpretation(data: PeerComparisonData): string {
  const target = data.targetMetrics;
  let interpretation = `${target.symbol} `;

  if (target.ranking.score === 1) {
    interpretation += 'leads peers with the highest total score. ';
  } else if (target.ranking.score <= 3) {
    interpretation += `ranks #${target.ranking.score} among peers. `;
  } else {
    interpretation += 'ranks in the lower half of peers. ';
  }

  if (target.metrics.pe !== null && target.metrics.pe < data.averages.pe && data.averages.pe !== 0) {
    const discount = ((data.averages.pe - target.metrics.pe) / data.averages.pe) * 100;
    interpretation += `Trading at a ${discount.toFixed(0)}% P/E discount to peers suggests relative value. `;
  }

  if (target.metrics.roe !== null && target.metrics.roe > data.averages.roe && data.averages.roe !== 0) {
    interpretation += 'Above-average ROE indicates superior profitability. ';
  }

  if (target.ranking.risk <= 2) {
    interpretation += 'Low risk profile makes it suitable for defensive portfolios.';
  }

  return interpretation.trim();
}
