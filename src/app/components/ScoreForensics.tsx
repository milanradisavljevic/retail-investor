import React from 'react';

interface PillarData {
  score: number;
  percentile: number;
  metrics: Record<string, any>;
}

interface ScoreForensicsProps {
  symbol: string;
  totalScore: number;
  pillars: {
    valuation: PillarData;
    quality: PillarData;
    technical: PillarData;
    risk: PillarData;
  };
}

export function ScoreForensics({ symbol, totalScore, pillars }: ScoreForensicsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Score Forensics</h2>
        <div className="text-sm font-medium text-text-secondary">
          Total Score: <span className="text-accent-gold">{totalScore.toFixed(1)}</span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <PillarCard title="Valuation" data={pillars.valuation} />
        <PillarCard title="Quality" data={pillars.quality} />
        <PillarCard title="Technical" data={pillars.technical} />
        <PillarCard title="Risk" data={pillars.risk} />
      </div>
    </div>
  );
}

function PillarCard({ title, data }: { title: string; data: PillarData }) {
  const getColor = (val: number) => {
    if (val >= 70) return 'text-accent-green';
    if (val >= 50) return 'text-accent-gold';
    return 'text-accent-red';
  };
  
  const getBgColor = (val: number) => {
    if (val >= 70) return 'bg-accent-green/10 border-accent-green/30';
    if (val >= 50) return 'bg-accent-gold/10 border-accent-gold/30';
    return 'bg-accent-red/10 border-accent-red/30';
  };

  return (
    <div className={`p-4 rounded-lg border ${getBgColor(data.score)}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <span className={`text-xl font-bold ${getColor(data.score)}`}>
          {data.score.toFixed(0)}
        </span>
      </div>
      <div className="text-xs text-text-muted">
        Percentile: {data.percentile.toFixed(0)}th
      </div>
      {/* Metrics placeholder - in a real app, we would list key drivers here */}
      <div className="mt-2 text-xs text-text-secondary">
         {Object.keys(data.metrics).length > 0 ? (
           <ul className="list-disc list-inside">
             {Object.entries(data.metrics).slice(0, 3).map(([k, v]) => (
               <li key={k}>{k}: {String(v)}</li>
             ))}
           </ul>
         ) : (
           <span>No specific metrics</span>
         )}
      </div>
    </div>
  );
}
