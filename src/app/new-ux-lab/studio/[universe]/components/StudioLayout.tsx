import type { ReactNode } from "react";

export function StudioLayout({
  universe,
  children,
}: {
  universe: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-0 text-text-primary">
      {/* Global Header */}
      <header className="h-14 border-b border-border-subtle bg-surface-1 px-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-base font-semibold text-text-primary">Studio</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition rounded-md border border-border-subtle hover:border-border-default">
            ⌘K
          </button>
          <span className="text-xs text-text-secondary px-2 py-1 bg-surface-2 rounded border border-border-subtle">
            yfinance
          </span>
        </div>
      </header>

      {/* Main Layout: Left Rail + Canvas */}
      <div className="flex">
        {children}
      </div>
    </div>
  );
}
