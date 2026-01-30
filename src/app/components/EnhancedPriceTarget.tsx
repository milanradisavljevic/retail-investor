'use client';

import type { PriceTargetEnhanced } from '@/lib/analysis/priceTargetAnalysis';

interface Props {
  data: PriceTargetEnhanced;
}

export function EnhancedPriceTarget({ data }: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">Price Target Analysis</h3>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-text-muted">Current Price</div>
          <div className="text-3xl font-bold text-text-primary">
            ${data.current.price.toFixed(2)}
          </div>
          <div className="text-xs text-text-muted">{data.current.date}</div>
        </div>
        <ConfidenceBadge level={data.confidence.level} reasons={data.confidence.reasons} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TargetCard
          label="Entry Target"
          price={data.targets.entry}
          percentage={((data.targets.entry - data.current.price) / data.current.price) * 100}
          color="text-blue-400"
        />
        <TargetCard
          label="Exit Target"
          price={data.targets.exit}
          percentage={((data.targets.exit - data.current.price) / data.current.price) * 100}
          color="text-green-400"
        />
        <TargetCard
          label="Fair Value"
          price={data.targets.fairValue}
          percentage={((data.targets.fairValue - data.current.price) / data.current.price) * 100}
          color="text-accent-gold"
        />
      </div>

      <div className="rounded-xl border border-navy-700 bg-navy-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-text-primary">Risk/Reward Analysis</h4>
          <RiskRewardBadge ratio={data.riskReward.ratio} interpretation={data.riskReward.interpretation} />
        </div>

        <Bar
          label="Upside Potential"
          value={data.potential.upside.percentage}
          colorFrom="from-green-500"
          colorTo="to-green-400"
          textColor="text-green-400"
          suffix={`To $${data.potential.upside.price.toFixed(2)} • ${data.potential.upside.basis}`}
        />

        <Bar
          label="Downside Risk"
          value={-Math.abs(data.potential.downside.percentage)}
          colorFrom="from-red-500"
          colorTo="to-red-400"
          textColor="text-red-400"
          suffix={`To $${data.potential.downside.price.toFixed(2)} • ${data.potential.downside.support}`}
        />
      </div>

      {data.historicalPattern && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📊</div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-400 mb-1">Historical Pattern Detected</h4>
              <p className="text-sm text-text-secondary">{data.historicalPattern.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span>Occurrences: {data.historicalPattern.occurrences}</span>
                <span>•</span>
                <span>Avg Gain: +{data.historicalPattern.avgGain}%</span>
                <span>•</span>
                <span>Confidence: {(data.historicalPattern.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-navy-700 bg-navy-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-text-primary">Recommended Holding Period</h4>
          <span className="text-sm font-mono text-accent-blue">{data.holdingPeriod.months} months</span>
        </div>
        <p className="text-sm text-text-secondary">{data.holdingPeriod.reasoning}</p>
        {data.holdingPeriod.targetDate && (
          <div className="text-xs text-text-muted mt-2">
            Target Date: {new Date(data.holdingPeriod.targetDate).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

function TargetCard({
  label,
  price,
  percentage,
  color,
}: {
  label: string;
  price: number;
  percentage: number;
  color: string;
}) {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-800 p-3">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>${price.toFixed(2)}</div>
      <div className={`text-xs ${pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {pct >= 0 ? '+' : ''}
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

function ConfidenceBadge({ level, reasons }: { level: string; reasons: string[] }) {
  const colors = {
    high: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-red-500/20 text-red-400 border-red-500/30',
  } as const;

  const color = colors[(level as keyof typeof colors) ?? 'low'] ?? colors.low;

  return (
    <div className="group relative">
      <div className={`px-3 py-1 rounded-full border text-xs font-semibold uppercase ${color}`}>
        {level ?? 'low'} Confidence
      </div>
      {reasons.length > 0 && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-navy-700 bg-navy-800 p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
          <div className="text-xs font-semibold text-text-primary mb-2">Confidence Factors:</div>
          <ul className="text-xs text-text-secondary space-y-1">
            {reasons.map((reason, idx) => (
              <li key={idx}>• {reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RiskRewardBadge({ ratio, interpretation }: { ratio: number; interpretation: string }) {
  const colors = {
    excellent: 'text-green-400',
    good: 'text-blue-400',
    balanced: 'text-yellow-400',
    poor: 'text-red-400',
  } as const;

  const label = interpretation.charAt(0).toUpperCase() + interpretation.slice(1);
  return (
    <div className={`text-sm font-semibold ${colors[(interpretation as keyof typeof colors) ?? 'poor']}`}>
      {Number.isFinite(ratio) ? ratio.toFixed(2) : '—'}:1 • {label}
    </div>
  );
}

function Bar({
  label,
  value,
  colorFrom,
  colorTo,
  textColor,
  suffix,
}: {
  label: string;
  value: number;
  colorFrom: string;
  colorTo: string;
  textColor: string;
  suffix: string;
}) {
  const pct = Math.min(Math.abs(value) * 2, 100); // cap width for readability
  return (
    <div>
      <div className="flex justify-between text-xs text-text-muted mb-1">
        <span>{label}</span>
        <span className={`${textColor} font-semibold`}>
          {value >= 0 ? '+' : ''}
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 bg-navy-900 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${colorFrom} ${colorTo}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-text-muted mt-1">{suffix}</div>
    </div>
  );
}
