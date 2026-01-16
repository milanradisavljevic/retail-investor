import type { MarketDataProvider } from '../types';
import { getFinnhubClient, FinnhubClient } from './client';

export class FinnhubProvider implements MarketDataProvider {
  private client: FinnhubClient;

  constructor(client: FinnhubClient = getFinnhubClient()) {
    this.client = client;
  }

  getTechnicalMetrics(symbol: string) {
    return this.client.getTechnicalMetrics(symbol);
  }

  getFundamentals(symbol: string) {
    return this.client.getFundamentals(symbol);
  }

  getRequestCount(): number {
    return this.client.getRequestCount();
  }

  close(): void {
    // Finnhub client has no persistent resources to dispose
  }

  getCompanyProfile(symbol: string) {
    return this.client.getCompanyProfile(symbol);
  }
}
