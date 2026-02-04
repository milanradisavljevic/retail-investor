'use client';

import type { TimeSeriesPoint } from '../utils/loadBacktestData';

interface Props {
  data: TimeSeriesPoint[];
}

export default function DrawdownChart({ data }: Props) {
  return (
    <div className="p-4 border-2 border-red-500 bg-red-900/20 text-red-200 rounded-lg">
      <h3 className="font-bold text-lg mb-2">DEBUG: DrawdownChart</h3>
      <div className="text-sm font-mono space-y-1">
        <p>✅ Component Rendered Successfully</p>
        <p>📊 Data Points Received: <span className="font-bold text-white">{data?.length ?? 0}</span></p>
      </div>
      
      {data?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase text-red-400 mb-1">First Data Point Sample:</p>
          <pre className="bg-black/50 p-2 rounded text-xs overflow-x-auto">
            {JSON.stringify(data[0], null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}