import React from 'react';

interface RunHistoryItem {
  runId: string;
  universe: string;
  preset: string;
  pickCount: number;
  timestamp: string;
  isActive: boolean;
}

// Hilfsfunktion zum Gruppieren der Runs nach Datum
const groupRunsByDate = (runs: RunHistoryItem[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  return runs.reduce((groups, run) => {
    const runDate = new Date(run.timestamp);
    runDate.setHours(0, 0, 0, 0);
    
    if (runDate.getTime() === today.getTime()) {
      groups['Heute'] = groups['Heute'] || [];
      groups['Heute'].push(run);
    } else if (runDate.getTime() === yesterday.getTime()) {
      groups['Gestern'] = groups['Gestern'] || [];
      groups['Gestern'].push(run);
    } else if (runDate >= startOfWeek) {
      groups['Diese Woche'] = groups['Diese Woche'] || [];
      groups['Diese Woche'].push(run);
    } else {
      groups['Älter'] = groups['Älter'] || [];
      groups['Älter'].push(run);
    }
    
    return groups;
  }, {} as Record<string, RunHistoryItem[]>);
};

export function RunHistorySidebar({
  runs,
  onSelectRun
}: {
  runs: RunHistoryItem[];
  onSelectRun: (runId: string) => void
}) {
  const groupedRuns = groupRunsByDate(runs);

  return (
    <div className="w-60 bg-navy-800 border-r border-navy-700 h-full flex flex-col">
      <div className="p-4 border-b border-navy-700">
        <h2 className="text-lg font-semibold text-white">Run-Historie</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(groupedRuns).map(([groupName, groupRuns]) => (
          <RunGroup
            key={groupName}
            groupName={groupName}
            runs={groupRuns}
            onSelectRun={onSelectRun}
          />
        ))}
      </div>
    </div>
  );
}

const RunGroup = ({ 
  groupName, 
  runs, 
  onSelectRun 
}: { 
  groupName: string; 
  runs: RunHistoryItem[]; 
  onSelectRun: (runId: string) => void 
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);
  
  return (
    <div className="mb-4">
      <button 
        className="w-full flex justify-between items-center p-2 text-sm font-medium text-text-secondary hover:text-text-primary"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>{groupName} ({runs.length})</span>
        <span>{isExpanded ? '▼' : '▶'}</span>
      </button>
      
      {isExpanded && (
        <div className="mt-2 space-y-1">
          {runs.map(run => (
            <RunCard 
              key={run.runId} 
              run={run} 
              onClick={() => onSelectRun(run.runId)} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

const RunCard = ({ 
  run, 
  onClick 
}: { 
  run: RunHistoryItem; 
  onClick: () => void 
}) => {
  const runDate = new Date(run.timestamp);
  const formattedTime = runDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  return (
    <div 
      className={`p-2 rounded cursor-pointer text-sm ${
        run.isActive 
          ? 'bg-accent-blue/10 border border-accent-blue' 
          : 'hover:bg-navy-700'
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium text-white">{run.preset}</div>
          <div className="text-xs text-text-muted mt-1">
            {run.universe} • {run.pickCount} Picks
          </div>
        </div>
        <div className="text-xs text-text-muted whitespace-nowrap">
          {formattedTime}
        </div>
      </div>
    </div>
  );
};