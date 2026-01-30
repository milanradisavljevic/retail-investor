/**
 * In-memory store for run progress
 * Used to communicate between scoring engine and API
 */

export type RunPhase =
  | 'initializing'
  | 'data_fetch'
  | 'scoring'
  | 'selection'
  | 'persistence'
  | 'complete'
  | 'error';

export interface RunProgress {
  runId: string;
  universe: string;
  totalSymbols: number;
  processedSymbols: number;
  currentSymbol: string;
  currentPhase: RunPhase;
  startTime: number;
  cacheHits: number;
  cacheMisses: number;
  failedSymbols: string[];
  estimatedCompletion?: number;
  error?: string;
}

class ProgressStore {
  private store = new Map<string, RunProgress>();

  initRun(runId: string, universe: string, totalSymbols: number): void {
    this.store.set(runId, {
      runId,
      universe,
      totalSymbols,
      processedSymbols: 0,
      currentSymbol: '',
      currentPhase: 'initializing',
      startTime: Date.now(),
      cacheHits: 0,
      cacheMisses: 0,
      failedSymbols: [],
    });
  }

  updateProgress(runId: string, updates: Partial<RunProgress>): void {
    const current = this.store.get(runId);
    if (!current) return;

    const updated = { ...current, ...updates };

    // Calculate ETA when processedSymbols is updated
    if (updates.processedSymbols !== undefined && updates.processedSymbols > 0) {
      const elapsed = Date.now() - current.startTime;
      const avgTimePerSymbol = elapsed / updates.processedSymbols;
      const remaining = current.totalSymbols - updates.processedSymbols;
      updated.estimatedCompletion = Date.now() + avgTimePerSymbol * remaining;
    }

    this.store.set(runId, updated);
  }

  incrementCacheHit(runId: string): void {
    const current = this.store.get(runId);
    if (!current) return;
    this.store.set(runId, { ...current, cacheHits: current.cacheHits + 1 });
  }

  incrementCacheMiss(runId: string): void {
    const current = this.store.get(runId);
    if (!current) return;
    this.store.set(runId, { ...current, cacheMisses: current.cacheMisses + 1 });
  }

  addFailedSymbol(runId: string, symbol: string): void {
    const current = this.store.get(runId);
    if (!current) return;
    if (!current.failedSymbols.includes(symbol)) {
      this.store.set(runId, {
        ...current,
        failedSymbols: [...current.failedSymbols, symbol],
      });
    }
  }

  getProgress(runId: string): RunProgress | undefined {
    return this.store.get(runId);
  }

  completeRun(runId: string): void {
    const current = this.store.get(runId);
    if (!current) return;

    this.store.set(runId, {
      ...current,
      currentPhase: 'complete',
      processedSymbols: current.totalSymbols,
      estimatedCompletion: Date.now(),
    });

    // Clean up after 5 minutes
    setTimeout(() => this.store.delete(runId), 5 * 60 * 1000);
  }

  errorRun(runId: string, error: string): void {
    const current = this.store.get(runId);
    if (!current) return;

    this.store.set(runId, {
      ...current,
      currentPhase: 'error',
      error,
    });

    // Clean up after 10 minutes (keep error state longer for debugging)
    setTimeout(() => this.store.delete(runId), 10 * 60 * 1000);
  }

  // Get all active runs (for debugging/monitoring)
  getActiveRuns(): RunProgress[] {
    return Array.from(this.store.values()).filter(
      (p) => p.currentPhase !== 'complete' && p.currentPhase !== 'error'
    );
  }

  // Clean up old runs manually if needed
  cleanup(runId: string): void {
    this.store.delete(runId);
  }
}

export const progressStore = new ProgressStore();
