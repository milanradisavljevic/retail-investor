'use client';

import type { ScoreBreakdown } from '@/lib/scoreBreakdown';

const interpretationColors: Record<string, string> = {
  excellent: 'text-emerald-400',
  good: 'text-blue-400',
  fair: 'text-amber-400',
  poor: 'text-red-400',
};

interface Props {
  breakdown: ScoreBreakdown;
  onClose: () => void;
}

export function ScoreBreakdownModal({ breakdown, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-navy-700 bg-navy-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-navy-700 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">Why this score?</p>
            <h2 className="text-xl font-semibold text-text-primary">
              {breakdown.symbol}
              <span className="ml-2 text-text-secondary">{breakdown.companyName}</span>
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold text-accent-green">
                {breakdown.totalScore.toFixed(1)}
              </div>
              <div className="text-[11px] uppercase text-text-muted">Total</div>
            </div>
            <button
              type="button"
              aria-label="Close"
              className="rounded-lg p-2 text-text-secondary hover:bg-navy-800 hover:text-text-primary"
              onClick={onClose}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {Object.values(breakdown.pillars).map((pillar) => (
            <div key={pillar.key} className="rounded-xl border border-navy-700 bg-navy-800/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-text-muted">
                    {pillar.name} · {(pillar.weight * 100).toFixed(0)}% weight
                  </p>
                  <p className="text-sm text-text-secondary">
                    Weighted: {pillar.weightedScore.toFixed(1)} points
                  </p>
                </div>
                <span className="text-2xl font-semibold text-text-primary">{pillar.score.toFixed(0)}</span>
              </div>

              <div className="space-y-2">
                {pillar.components.map((comp, idx) => (
                  <div
                    key={`${pillar.key}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-navy-700 bg-navy-900/70 px-3 py-2 text-sm"
                  >
                    <div className="text-text-primary">
                      <span>{comp.name}</span>
                      {comp.comparison && (
                        <span className="ml-2 text-text-muted">({comp.comparison})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-text-secondary">{comp.value}</span>
                      <span className={`font-semibold ${interpretationColors[comp.interpretation]}`}>
                        {comp.score.toFixed(0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-navy-700 px-6 py-4 text-[11px] text-text-muted">
          Scores are normalized 0-100. Lower is better for valuation & risk metrics where noted; missing inputs fall back to neutral.
        </div>
      </div>
    </div>
  );
}
