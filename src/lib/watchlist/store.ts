'use client';

export interface WatchlistStock {
  symbol: string;
  companyName: string;
  addedAt: string;
  lastScore?: number;
  lastPrice?: number;
}

const WATCHLIST_KEY = 'privatinvestor_watchlist_v1';

class WatchlistStore {
  private listeners: Set<() => void> = new Set();

  getAll(): WatchlistStock[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as WatchlistStock[];
    } catch (error) {
      console.error('Failed to load watchlist:', error);
      return [];
    }
  }

  add(stock: Omit<WatchlistStock, 'addedAt'>): void {
    const watchlist = this.getAll();

    if (watchlist.some((s) => s.symbol === stock.symbol)) {
      console.log('Stock already in watchlist:', stock.symbol);
      return;
    }

    const newStock: WatchlistStock = {
      ...stock,
      addedAt: new Date().toISOString(),
    };

    watchlist.push(newStock);
    this.save(watchlist);
    this.notifyListeners();

    console.log('✅ Added to watchlist:', stock.symbol);
  }

  remove(symbol: string): void {
    const watchlist = this.getAll().filter((s) => s.symbol !== symbol);
    this.save(watchlist);
    this.notifyListeners();

    console.log('✅ Removed from watchlist:', symbol);
  }

  isInWatchlist(symbol: string): boolean {
    return this.getAll().some((s) => s.symbol === symbol);
  }

  update(symbol: string, updates: Partial<WatchlistStock>): void {
    const watchlist = this.getAll();
    const index = watchlist.findIndex((s) => s.symbol === symbol);

    if (index !== -1) {
      watchlist[index] = { ...watchlist[index], ...updates };
      this.save(watchlist);
      this.notifyListeners();
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    if (confirm('Watchlist wirklich komplett leeren?')) {
      this.save([]);
      this.notifyListeners();
    }
  }

  private save(watchlist: WatchlistStock[]): void {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch (error) {
      console.error('Failed to save watchlist:', error);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const watchlistStore = new WatchlistStore();
