'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import type { PortfolioPosition, PillarScores } from '@/types/portfolio';
import GlossaryTooltip from '@/app/components/GlossaryTooltip';

interface PortfolioScoreBreakdownProps {
  positions: PortfolioPosition[];
  totalValueUsd: number;
  equityCount: number;
  commodityCount: number;
}

interface WeightedPillarScores {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
}

interface PositionWithScore extends PortfolioPosition {
  total_score: number;
  current_value_usd: number;
}

const PILLAR_CONFIG = [
  { key: 'valuation' as const, label: 'Valuation', color: '#3B82F6' },
  { key: 'quality' as const, label: 'Quality', color: '#10B981' },
  { key: 'technical' as const, label: 'Technical', color: '#F59E0B' },
  { key: 'risk' as const, label: 'Risk', color: '#EF4444' },
];

function getPillarColor(score: number): string {
  if (score >= 60) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function getPillarBgColor(score: number): string {
  if (score >= 60) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

export function PortfolioScoreBreakdown({
  positions,
  totalValueUsd,
  equityCount,
  commodityCount,
}: PortfolioScoreBreakdownProps) {
  const { 
    scoredPositions, 
    unscoredPositions, 
    weightedPillars, 
    scoredValue,
    totalEquityValue,
    portfolioScore,
    topPositions,
    bottomPositions,
  } = useMemo(() => {
    const equityPositions = positions.filter(p => p.asset_type === 'equity');
    const scored: PositionWithScore[] = [];
    const unscored: PortfolioPosition[] = [];
    
    let totalEquityVal = 0;
    let scoredVal = 0;
    
    for (const pos of equityPositions) {
      const value = pos.current_value_usd ?? (pos.buy_price * pos.quantity);
      totalEquityVal += value;
      
      if (pos.total_score !== null && pos.total_score !== undefined && pos.current_value_usd) {
        scored.push({
          ...pos,
          total_score: pos.total_score,
          current_value_usd: pos.current_value_usd,
        });
        scoredVal += pos.current_value_usd;
      } else {
        unscored.push(pos);
      }
    }
    
    const pillarWeights: WeightedPillarScores = {
      valuation: 0,
      quality: 0,
      technical: 0,
      risk: 0,
    };
    
    let totalWeightedValue = 0;
    
    for (const pos of scored) {
      if (pos.pillar_scores && pos.current_value_usd > 0) {
        const weight = pos.current_value_usd;
        totalWeightedValue += weight;
        
        pillarWeights.valuation += pos.pillar_scores.valuation * weight;
        pillarWeights.quality += pos.pillar_scores.quality * weight;
        pillarWeights.technical += pos.pillar_scores.technical * weight;
        pillarWeights.risk += pos.pillar_scores.risk * weight;
      }
    }
    
    if (totalWeightedValue > 0) {
      pillarWeights.valuation /= totalWeightedValue;
      pillarWeights.quality /= totalWeightedValue;
      pillarWeights.technical /= totalWeightedValue;
      pillarWeights.risk /= totalWeightedValue;
    }
    
    const avgScore = scored.length > 0 
      ? scored.reduce((sum, p) => sum + p.total_score * p.current_value_usd, 0) / scoredVal
      : null;
    
    const sorted = [...scored].sort((a, b) => b.total_score - a.total_score);
    const top = sorted.slice(0, 3);
    const bottom = sorted.slice(-3).reverse();
    
    return {
      scoredPositions: scored,
      unscoredPositions: unscored,
      weightedPillars: pillarWeights,
      scoredValue: scoredVal,
      totalEquityValue: totalEquityVal,
      portfolioScore: avgScore,
      topPositions: top,
      bottomPositions: bottom,
    };
  }, [positions]);

  if (equityCount === 0) {
    return (
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        <div className="flex items-center gap-3 text-text-muted">
          <AlertCircle className="w-5 h-5" />
          <span>Kein Portfolio-Score verfügbar (keine Aktien-Positionen)</span>
        </div>
      </div>
    );
  }

  if (scoredPositions.length === 0) {
    return (
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        <div className="flex items-center gap-3 text-text-muted">
          <AlertCircle className="w-5 h-5" />
          <span>Kein Portfolio-Score verfügbar (keine Positionen im aktuellen Universum)</span>
        </div>
        <div className="mt-4 text-sm text-text-secondary">
          <div className="font-medium mb-2">Ohne Score:</div>
          <div className="flex flex-wrap gap-2">
            {unscoredPositions.map(p => (
              <span 
                key={p.id}
                className="px-2 py-1 bg-navy-700 rounded text-xs text-text-muted"
              >
                {p.symbol}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const scoredPct = totalEquityValue > 0 ? (scoredValue / totalEquityValue) * 100 : 0;

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-text-primary">Portfolio-Score Breakdown</h2>
          <div className="text-xs text-text-muted">
            <GlossaryTooltip term="diversification">Diversifikation</GlossaryTooltip>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Portfolio-Score:</span>
          <span className={`text-xl font-bold ${getScoreColor(portfolioScore ?? 0)}`}>
            {portfolioScore !== null ? portfolioScore.toFixed(1) : '—'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
          Gewichtete Pillar-Scores
        </div>
        
        <div className="space-y-3">
          {PILLAR_CONFIG.map(pillar => {
            const score = weightedPillars[pillar.key];
            const pct = Math.min(100, Math.max(0, score));
            
            return (
              <div key={pillar.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: pillar.color }}
                    />
                    <span className="text-sm text-text-secondary">{pillar.label}</span>
                  </div>
                  <span className={`text-sm font-medium ${getPillarColor(score)}`}>
                    {score.toFixed(1)}
                  </span>
                </div>
                <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getPillarBgColor(score)} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-navy-700">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Staerkste Positionen
          </div>
          <div className="space-y-1.5">
            {topPositions.map((pos, idx) => (
              <div key={pos.id} className="flex items-center justify-between text-sm">
                <span className="text-text-primary">{pos.symbol}</span>
                <span className={`font-medium ${getScoreColor(pos.total_score)}`}>
                  {pos.total_score.toFixed(1)}
                </span>
              </div>
            ))}
            {topPositions.length === 0 && (
              <div className="text-sm text-text-muted">Keine Positionen</div>
            )}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            Schwaechste Positionen
          </div>
          <div className="space-y-1.5">
            {bottomPositions.map((pos, idx) => (
              <div key={pos.id} className="flex items-center justify-between text-sm">
                <span className="text-text-primary">{pos.symbol}</span>
                <span className={`font-medium ${getScoreColor(pos.total_score)}`}>
                  {pos.total_score.toFixed(1)}
                </span>
              </div>
            ))}
            {bottomPositions.length === 0 && (
              <div className="text-sm text-text-muted">Keine Positionen</div>
            )}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-navy-700">
        <div className="text-xs text-text-muted mb-3">
          Portfolio-Score basiert auf{' '}
          <span className="text-text-secondary font-medium">
            {scoredPositions.length} von {equityCount} Positionen
          </span>
          {' '}({scoredPct.toFixed(0)}% des Aktienwerts)
        </div>
        
        {unscoredPositions.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-text-muted">Ohne Score:</div>
            <div className="flex flex-wrap gap-1.5">
              {unscoredPositions.map(p => (
                <span 
                  key={p.id}
                  className="px-2 py-1 bg-navy-700 rounded text-xs text-text-muted flex items-center gap-1"
                >
                  {p.symbol}
                  <span className="text-text-tertiary">(nicht im Universum)</span>
                </span>
              ))}
            </div>
          </div>
        )}
        
        {commodityCount > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {positions.filter(p => p.asset_type === 'commodity').map(p => (
              <span 
                key={p.id}
                className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400"
              >
                {p.symbol} (Commodity)
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
