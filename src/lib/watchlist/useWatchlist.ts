'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WatchlistEntry } from './types';

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Watchlist request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchJson<{ items: WatchlistEntry[] }>('/api/watchlist');
      setWatchlist(data.items ?? []);
      setError(null);
    } catch (err: any) {
      console.error('[watchlist] load failed', err);
      setError(err?.message ?? 'Failed to load watchlist');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isInWatchlist = useCallback(
    (symbol: string) => {
      const needle = symbol.toUpperCase();
      return watchlist.some((item) => item.symbol === needle);
    },
    [watchlist]
  );

  const addToWatchlist = useCallback(
    async (stock: Omit<WatchlistEntry, 'addedAt'>) => {
      const payload = { ...stock, symbol: stock.symbol.toUpperCase() };
      await fetchJson('/api/watchlist', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await load();
    },
    [load]
  );

  const removeFromWatchlist = useCallback(
    async (symbol: string) => {
      const needle = symbol.toUpperCase();
      await fetchJson(`/api/watchlist?symbol=${encodeURIComponent(needle)}`, {
        method: 'DELETE',
      });
      setWatchlist((prev) => prev.filter((item) => item.symbol !== needle));
    },
    []
  );

  const toggleWatchlist = useCallback(
    async (stock: Omit<WatchlistEntry, 'addedAt'>) => {
      if (isInWatchlist(stock.symbol)) {
        await removeFromWatchlist(stock.symbol);
      } else {
        await addToWatchlist(stock);
      }
    },
    [addToWatchlist, isInWatchlist, removeFromWatchlist]
  );

  const clearWatchlist = useCallback(async () => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Watchlist wirklich komplett leeren?');
      if (!confirmed) return;
    }
    await fetchJson('/api/watchlist?all=true', { method: 'DELETE' });
    setWatchlist([]);
  }, []);

  const count = useMemo(() => watchlist.length, [watchlist]);

  return {
    watchlist,
    isLoading,
    error,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    toggleWatchlist,
    clearWatchlist,
    count,
  };
}
