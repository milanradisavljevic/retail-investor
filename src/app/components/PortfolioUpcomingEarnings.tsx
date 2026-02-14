'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import type { EarningsApiResponse, EarningsCalendarEntry } from '@/types/earnings';

const MAX_COLLAPSED_ITEMS = 5;

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDaysUntil(daysUntil: number): string {
  if (daysUntil <= 0) return 'heute';
  if (daysUntil === 1) return 'morgen';
  return `in ${daysUntil} Tagen`;
}

function formatEstimate(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(2);
}

function formatSurprise(value: number | null): { label: string; className: string } {
  if (value === null || value === undefined) {
    return { label: 'Keine Daten', className: 'text-text-muted' };
  }
  if (value >= 0) {
    return { label: `Beat +${value.toFixed(1)}%`, className: 'text-emerald-400' };
  }
  return { label: `Miss ${value.toFixed(1)}%`, className: 'text-red-400' };
}

function scoreBorderClass(score: number | null): string {
  if (score === null || score === undefined) return 'border-navy-700';
  if (score > 70) return 'border-emerald-500/60';
  if (score < 40) return 'border-red-500/60';
  return 'border-navy-700';
}

function buildHint(entry: EarningsCalendarEntry): string {
  const scoreLabel = entry.score !== null ? entry.score.toFixed(0) : 'n/a';
  const dayLabel = entry.days_until <= 0 ? 'heute' : `in ${entry.days_until} Tagen`;

  if (entry.score === null) {
    return `${entry.symbol} berichtet ${dayLabel}. Score: n/a. Kritisch: Ohne Score fehlt eine klare Pre-Earnings Einordnung.`;
  }

  if (entry.score > 70) {
    const qualitySuffix =
      entry.pillar_quality !== null
        ? ` Aktuell liegt Quality bei ${entry.pillar_quality.toFixed(0)}.`
        : '';
    return `${entry.symbol} berichtet ${dayLabel}. Score: ${scoreLabel}. Kritisch: Quality-Pillar muss über 65 bleiben.${qualitySuffix}`;
  }

  if (entry.score < 40) {
    return `${entry.symbol} berichtet ${dayLabel}. Score: ${scoreLabel}. Kritisch: Niedriger Score, negative Überraschungen werden oft stärker abgestraft.`;
  }

  return `${entry.symbol} berichtet ${dayLabel}. Score: ${scoreLabel}. Kritisch: Achte auf stabile Guidance und auf Quality-Pillar über 65.`;
}

export default function PortfolioUpcomingEarnings() {
  const [data, setData] = useState<EarningsCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/earnings?days=14&portfolio=true');
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const payload = (await response.json()) as EarningsApiResponse;
        if (active) {
          setData(payload.data ?? []);
        }
      } catch (err) {
        if (active) {
          setError('Earnings data unavailable');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const visibleEntries = useMemo(() => {
    if (expanded) return data;
    return data.slice(0, MAX_COLLAPSED_ITEMS);
  }, [data, expanded]);

  const hint = data.length > 0 ? buildHint(data[0]) : null;

  return (
    <section className="rounded-xl border border-navy-700 bg-navy-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Anstehende Earnings</h2>
          <p className="text-xs text-text-muted">Deine Holdings in den nächsten 14 Tagen</p>
        </div>
        <CalendarClock className="h-4 w-4 text-accent-blue" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-16 animate-pulse rounded-lg bg-navy-700" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-navy-600 bg-navy-700/50 px-3 py-2 text-sm text-text-muted">
          {error}
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-navy-600 bg-navy-700/50 px-3 py-2 text-sm text-text-muted">
          Keine anstehenden Earnings in den nächsten 14 Tagen.
        </div>
      ) : (
        <div className="space-y-2">
          {hint && (
            <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/5 px-3 py-2 text-sm text-text-secondary">
              {hint}
            </div>
          )}

          {visibleEntries.map((entry) => {
            const surprise = formatSurprise(entry.last_surprise_pct);
            return (
              <div
                key={`${entry.symbol}-${entry.earnings_date}`}
                className={`rounded-lg border bg-navy-800/50 p-3 ${scoreBorderClass(entry.score)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary">
                      {entry.symbol}
                      <span className="ml-2 text-xs font-normal text-text-muted">{entry.name}</span>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {formatDate(entry.earnings_date)} · {formatDaysUntil(entry.days_until)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs">
                  <div className="text-text-muted">
                    EPS-Schätzung: <span className="text-text-primary">{formatEstimate(entry.eps_estimate)}</span>
                  </div>
                  <div className="text-text-muted">
                    Letzte Überraschung:{' '}
                    <span className={surprise.className}>{surprise.label}</span>
                  </div>
                  <div className="text-text-muted">
                    Score:{' '}
                    <span className="text-text-primary">
                      {entry.score !== null ? entry.score.toFixed(0) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {data.length > MAX_COLLAPSED_ITEMS && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-navy-600 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              {expanded ? (
                <>
                  Weniger anzeigen <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Mehr anzeigen <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
