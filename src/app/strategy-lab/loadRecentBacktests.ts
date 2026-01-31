import fs from 'fs';
import path from 'path';

export interface RecentBacktest {
  title: string;
  ago: string;
  metrics: string;
  fileName: string;
  timestamp: number;
}

/**
 * Load recent backtest results from the backtesting directory
 */
export function loadRecentBacktests(limit = 5): RecentBacktest[] {
  const backtestDir = path.join(process.cwd(), 'data', 'backtesting');

  if (!fs.existsSync(backtestDir)) {
    return [];
  }

  // Find all backtest summary JSON files
  const summaryFiles = fs
    .readdirSync(backtestDir)
    .filter(f => f.startsWith('backtest-summary-') && f.endsWith('.json') && !f.includes('full'))
    .map(fileName => {
      const filePath = path.join(backtestDir, fileName);
      const stats = fs.statSync(filePath);
      return {
        fileName,
        filePath,
        timestamp: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
    .slice(0, limit);

  const results: RecentBacktest[] = [];

  for (const { fileName, filePath, timestamp } of summaryFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const summary = JSON.parse(content);

      // Extract strategy name from filename (e.g., "backtest-summary-hybrid.json" -> "Hybrid")
      const strategyMatch = fileName.match(/backtest-summary-(.+)\.json/);
      const strategyName = strategyMatch
        ? strategyMatch[1].charAt(0).toUpperCase() + strategyMatch[1].slice(1)
        : 'Unknown';

      // Get universe from summary or use default
      const universeName = summary.universe || 'Russell 2000';

      // Format time ago
      const now = Date.now();
      const ageMs = now - timestamp;
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      const ageWeeks = Math.floor(ageDays / 7);

      let ago: string;
      if (ageHours < 1) {
        ago = 'Just now';
      } else if (ageHours < 24) {
        ago = `${ageHours}h ago`;
      } else if (ageDays === 1) {
        ago = 'Yesterday';
      } else if (ageDays < 7) {
        ago = `${ageDays}d ago`;
      } else if (ageWeeks < 5) {
        ago = `${ageWeeks}w ago`;
      } else {
        ago = new Date(timestamp).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
      }

      // Format metrics
      const totalReturn = summary.metrics?.total_return_pct ?? 0;
      const maxDrawdown = summary.metrics?.max_drawdown_pct ?? 0;
      const metrics = `${totalReturn.toFixed(2)}% Return | ${maxDrawdown.toFixed(2)}% DD`;

      // Create title with strategy configuration hints
      let title = `${universeName} ${strategyName}`;
      if (summary.strategy?.includes('Momentum')) {
        title += ' (Momentum)';
      } else if (summary.strategy?.includes('Hybrid')) {
        title += ' (Hybrid)';
      } else if (summary.strategy?.includes('4-Pillar') || summary.strategy?.includes('Quality')) {
        title += ' (Quality Focus)';
      }

      results.push({
        title,
        ago,
        metrics,
        fileName,
        timestamp,
      });
    } catch (error) {
      console.error(`Failed to load backtest summary: ${fileName}`, error);
    }
  }

  return results;
}
