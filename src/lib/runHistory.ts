import fs from 'fs/promises';
import path from 'path';

export interface RunHistoryItem {
  runId: string;
  universe: string;
  preset: string;
  pickCount: number;
  timestamp: string;
  isActive: boolean;
}

export async function loadRunHistory(limit = 10): Promise<RunHistoryItem[]> {
  const runsDir = path.join(process.cwd(), 'data/runs');

  try {
    const files = await fs.readdir(runsDir);

    // Filter .json files and get their stats
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    // Get file stats to sort by modification time
    const fileStats = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(runsDir, file);
        const stat = await fs.stat(filePath);
        return { file, mtime: stat.mtime };
      })
    );

    // Sort by modification time (newest first)
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Take the most recent files up to the limit
    const recentFiles = fileStats.slice(0, limit);

    // Process each file to extract run information
    const runs: RunHistoryItem[] = [];

    for (const { file, mtime } of recentFiles) {
      try {
        const filePath = path.join(runsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const runData = JSON.parse(content);

        // Extract run information from the JSON
        const runId = path.parse(file).name; // Use filename without extension as runId

        // Extract universe name from definition
        let universe = 'Unbekannt';
        if (runData.universe && runData.universe.definition) {
          universe = runData.universe.definition.name || 'Unbekannt';
        } else if (runData.universe_name) {
          // Fallback to universe_name if universe object is not available
          universe = runData.universe_name;
        }

        // Extract preset (might be in different fields depending on the run)
        let preset = 'Standard';
        if (runData.preset) {
          preset = runData.preset;
        } else if (runData.strategy) {
          preset = runData.strategy;
        }

        // Count picks from selections (could be top5, top10, top20, etc.)
        let pickCount = 0;
        if (runData.selections) {
          // Check for various top-k arrays in selections
          const topArrays = Object.keys(runData.selections).filter(key =>
            key.startsWith('top') && Array.isArray(runData.selections[key])
          );

          if (topArrays.length > 0) {
            // Use the first available top array to determine pick count
            pickCount = runData.selections[topArrays[0]].length;
          }
        }

        const timestamp = mtime.toISOString(); // Using file modification time

        runs.push({
          runId,
          universe,
          preset,
          pickCount,
          timestamp,
          isActive: false // Initially none is active
        });
      } catch (error) {
        console.error(`Fehler beim Lesen der Datei ${file}:`, error);
        // Skip files that can't be parsed
        continue;
      }
    }

    return runs;
  } catch (error) {
    console.error('Fehler beim Laden der Run-Historie:', error);
    return []; // Return empty array if directory doesn't exist or other error occurs
  }
}