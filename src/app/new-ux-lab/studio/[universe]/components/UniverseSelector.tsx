"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Universe {
  name: string;
  encodedName: string;
}

export function UniverseSelector({
  currentUniverse,
  availableUniverses,
}: {
  currentUniverse: string;
  availableUniverses: Universe[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelectUniverse = (encodedName: string) => {
    setIsOpen(false);
    router.push(`/new-ux-lab/studio/${encodedName}`);
  };

  const decodedCurrent = decodeURIComponent(currentUniverse);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2 block">
        Universe
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-surface-2 border border-border-default rounded-md text-sm text-text-primary hover:border-border-emphasis transition flex items-center justify-between group"
      >
        <span className="truncate">{decodedCurrent}</span>
        <svg
          className={`w-4 h-4 text-text-tertiary group-hover:text-text-secondary transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface-1 border border-border-default rounded-lg shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
          {availableUniverses.map((universe) => {
            const isSelected = universe.name === decodedCurrent;
            return (
              <button
                key={universe.encodedName}
                onClick={() => handleSelectUniverse(universe.encodedName)}
                className={`w-full px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? "bg-surface-3 text-text-primary border-l-2 border-accent-500"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{universe.name}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-accent-500 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
