"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  symbols: string[];
}

export function DocumentsBanner({ symbols }: Props) {
  const [open, setOpen] = useState(false);

  if (symbols.length === 0) return null;

  if (symbols.length === 1) {
    const symbol = symbols[0];
    return (
      <Link
        href={`/stock/${symbol}#analysis`}
        className="block bg-accent-gold/10 border border-accent-gold/30 rounded-xl p-4 mb-8 hover:border-accent-gold/60 transition-colors"
      >
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-accent-gold mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-accent-gold mb-1">
              Additional Analysis Recommended
            </h3>
            <p className="text-sm text-text-secondary">
              Open the valuation section for <span className="text-text-primary">{symbol}</span>.
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="bg-accent-gold/10 border border-accent-gold/30 rounded-xl p-4 mb-8">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-accent-gold mt-0.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-accent-gold mb-1">
            Additional Analysis Recommended
          </h3>
          <p className="text-sm text-text-secondary">
            {symbols.length} symbols need documents.{" "}
            <button
              type="button"
              className="text-accent-gold underline ml-1"
              onClick={() => setOpen(true)}
            >
              View list
            </button>
          </p>
        </div>
      </div>
      {open && (
        <div className="mt-3 bg-navy-900/80 border border-accent-gold/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted uppercase tracking-wider">Symbols</span>
            <button
              type="button"
              className="text-xs text-text-muted hover:text-text-primary"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {symbols.map((s) => (
              <Link
                key={s}
                href={`/stock/${s}#analysis`}
                className="text-sm text-text-primary hover:text-accent-gold"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
