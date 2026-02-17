import React from 'react';

interface RunHistoryItem {
  runId: string;
  universe: string;
  preset: string;
  pickCount: number;
  timestamp: string;
  isActive: boolean;
}

const formatRelativeTime = (timestamp: string): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const runDay = new Date(date);
  runDay.setHours(0, 0, 0, 0);
  const isToday = runDay.getTime() === today.getTime();

  if (isToday) {
    if (diffMins < 1) return 'gerade';
    if (diffMins < 60) return `vor ${diffMins}m`;
    if (diffHours < 24) return `vor ${diffHours}h`;
  }
  
  if (diffDays === 1) return 'gestern';
  if (diffDays < 7) return `vor ${diffDays}d`;
  
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};

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
  const groupOrder = ['Heute', 'Gestern', 'Diese Woche', 'Älter'];

  return (
    <div className="w-60 bg-navy-800 border-r border-navy-700 h-full flex flex-col">
      <div className="p-4 border-b border-navy-700">
        <h2 className="text-lg font-semibold text-white">Run-Historie</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-navy-600 scrollbar-track-transparent hover:scrollbar-thumb-navy-500">
        {groupOrder.map((groupName) => {
          const groupRuns = groupedRuns[groupName];
          if (!groupRuns || groupRuns.length === 0) return null;
          
          return (
            <RunGroup
              key={groupName}
              groupName={groupName}
              runs={groupRuns}
              onSelectRun={onSelectRun}
              showDivider={groupName === 'Älter'}
            />
          );
        })}
      </div>
    </div>
  );
}

const RunGroup = ({ 
  groupName, 
  runs, 
  onSelectRun,
  showDivider = false
}: { 
  groupName: string; 
  runs: RunHistoryItem[]; 
  onSelectRun: (runId: string) => void;
  showDivider?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);
  
  return (
    <div className={`mb-4 ${showDivider ? 'border-t border-navy-600 pt-4 mt-2' : ''}`}>
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
  const relativeTime = formatRelativeTime(run.timestamp);
  const isLiveRun = run.preset === 'Live Run';
  const presetLabel = isLiveRun ? 'Live-Run' : run.preset;
  
  return (
    <div 
      className={`p-2 rounded cursor-pointer text-sm transition-all ${
        run.isActive 
          ? 'bg-emerald-500/10 border-l-2 border-emerald-500 pl-3' 
          : 'hover:bg-navy-700 border-l-2 border-transparent'
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-white truncate flex items-center gap-1.5">
            <span className={isLiveRun ? 'text-emerald-400' : 'text-white'}>
              {presetLabel}
            </span>
            {isLiveRun && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>
          <div className="text-xs text-text-muted mt-1 truncate">
            {run.universe} • {run.pickCount} Picks
          </div>
        </div>
        <div className="text-xs text-text-muted whitespace-nowrap ml-2 flex-shrink-0">
          {relativeTime}
        </div>
      </div>
    </div>
  );
};
