export interface WatchlistEntry {
  symbol: string;
  companyName: string;
  addedAt: string;
  lastScore?: number | null;
  lastPrice?: number | null;
}
