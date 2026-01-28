'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { RunHistorySidebar } from '@/app/components/RunHistorySidebar';
import type { RunHistoryItem } from '@/lib/runHistory';

interface SidebarWrapperProps {
  runs: RunHistoryItem[];
  activeRunId?: string;
}

export function SidebarWrapper({ runs, activeRunId }: SidebarWrapperProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelect = (runId: string) => {
    // Create new URLSearchParams to avoid mutating the hook's readonly value directly
    const params = new URLSearchParams(searchParams.toString());
    params.set('runId', runId);

    // Push the new URL
    router.push(`${pathname}?${params.toString()}`);
  };

  // Update runs to mark the active run
  const runsWithActiveState = runs.map(run => ({
    ...run,
    isActive: run.runId === activeRunId
  }));

  return (
    <RunHistorySidebar
      runs={runsWithActiveState}
      onSelectRun={handleSelect}
    />
  );
}
