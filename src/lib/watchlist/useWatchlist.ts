'use client';

import { useEffect, useState } from 'react';
import { watchlistStore, type WatchlistStock } from './store';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setWatchlist(watchlistStore.getAll());
    setIsLoading(false);

    const unsubscribe = watchlistStore.subscribe(() => {
      setWatchlist(watchlistStore.getAll());
    });

    return unsubscribe;
  }, []);

  const addToWatchlist = (stock: Omit<WatchlistStock, 'addedAt'>) => {
    watchlistStore.add(stock);
  };

  const removeFromWatchlist = (symbol: string) => {
    watchlistStore.remove(symbol);
  };

  const isInWatchlist = (symbol: string) => watchlistStore.isInWatchlist(symbol);

  const toggleWatchlist = (stock: Omit<WatchlistStock, 'addedAt'>) => {
    if (isInWatchlist(stock.symbol)) {
      removeFromWatchlist(stock.symbol);
    } else {
      addToWatchlist(stock);
    }
  };

  const clearWatchlist = () => {
    watchlistStore.clear();
  };

  return {
    watchlist,
    isLoading,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    toggleWatchlist,
    clearWatchlist,
    count: watchlist.length,
  };
}
