import fs from 'fs/promises';
import path from 'path';

type UniverseConfig = { id?: string; name?: string; symbols?: string[] };
type CompanyNamesFile = { default: Record<string, string>; overrides?: Record<string, Record<string, string>> };
type NameEntry = { symbol: string; shortName?: string; longName?: string };

async function loadJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function loadAllUniverses(): Promise<UniverseConfig[]> {
  const universesDir = path.join(process.cwd(), 'config', 'universes');
  const entries = await fs.readdir(universesDir);
  const universeFiles = entries.filter((f) => f.endsWith('.json'));

  const universes: UniverseConfig[] = [];

  for (const file of universeFiles) {
    const filePath = path.join(universesDir, file);
    const data = await loadJsonFile<UniverseConfig>(filePath, {});
    const symbols = Array.isArray(data.symbols) ? data.symbols : [];
    universes.push({
      id: data.id ?? path.basename(file, '.json'),
      name: data.name,
      symbols,
    });
  }

  // Also include default config/universe.json if present
  const defaultUniversePath = path.join(process.cwd(), 'config', 'universe.json');
  const defaultUniverse = await loadJsonFile<UniverseConfig>(defaultUniversePath, {});
  if (defaultUniverse.symbols && defaultUniverse.symbols.length) {
    universes.push({
      id: defaultUniverse.id ?? 'default',
      name: defaultUniverse.name,
      symbols: defaultUniverse.symbols,
    });
  }

  return universes;
}

async function loadUniverseMetadata(): Promise<Record<string, string>> {
  const metadataDir = path.join(process.cwd(), 'data', 'universe_metadata');
  let files: string[] = [];
  try {
    files = (await fs.readdir(metadataDir)).filter((f) => f.endsWith('_names.json'));
  } catch {
    return {};
  }

  const nameMap: Record<string, string> = {};

  for (const file of files) {
    const fullPath = path.join(metadataDir, file);
    const entries = await loadJsonFile<NameEntry[]>(fullPath, []);
    for (const entry of entries) {
      if (!entry?.symbol) continue;
      const name = entry.longName || entry.shortName;
      if (name) {
        nameMap[entry.symbol.toUpperCase()] = name;
      }
    }
  }
  return nameMap;
}

export async function updateCompanyNames() {
  const universes = await loadAllUniverses();
  const allSymbols = Array.from(new Set(universes.flatMap((u) => u.symbols || []))).sort();

  const metaNames = await loadUniverseMetadata();
  const companyNamesPath = path.join(process.cwd(), 'config', 'company_names.json');
  const existing = await loadJsonFile<CompanyNamesFile>(companyNamesPath, { default: {}, overrides: {} });
  const nextDefault: Record<string, string> = { ...existing.default };

  console.log(`Updating company names for ${allSymbols.length} symbols across ${universes.length} universes...`);

  for (const symbol of allSymbols) {
    const upper = symbol.toUpperCase();
    // Skip if already present
    if (nextDefault[upper]) continue;
    const name = metaNames[upper] || upper;
    nextDefault[upper] = name;
  }

  const payload: CompanyNamesFile = {
    default: nextDefault,
    overrides: existing.overrides ?? {},
  };

  await fs.writeFile(companyNamesPath, JSON.stringify(payload, null, 2));
  console.log(`Updated ${Object.keys(nextDefault).length} company names → ${companyNamesPath}`);
}

if (require.main === module) {
  updateCompanyNames().catch((error) => {
    console.error('Failed to update company names', error);
    process.exitCode = 1;
  });
}
