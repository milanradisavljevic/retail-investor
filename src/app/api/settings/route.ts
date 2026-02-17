import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AppSettings, PartialAppSettings } from '@/lib/settings/types';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';

const SETTINGS_FILE = join(process.cwd(), 'data', 'settings.json');

function enforceGerman(settings: AppSettings): AppSettings {
  return {
    ...settings,
    general: {
      ...settings.general,
      language: 'de',
    },
  };
}

/**
 * Load settings from JSON file
 */
function loadSettings(): AppSettings {
  if (!existsSync(SETTINGS_FILE)) {
    return DEFAULT_SETTINGS;
  }

  try {
    const content = readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Deep merge with defaults to ensure all fields exist
    const merged = deepMerge(DEFAULT_SETTINGS, parsed);
    return enforceGerman(merged);
  } catch (error) {
    console.error('[Settings API] Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to JSON file
 */
function saveSettings(settings: AppSettings): void {
  try {
    const normalized = enforceGerman(settings);
    const dir = join(process.cwd(), 'data');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(SETTINGS_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Settings API] Failed to save settings:', error);
    throw error;
  }
}

/**
 * Deep merge utility
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

/**
 * GET /api/settings
 * Returns current settings
 */
export async function GET() {
  try {
    const settings = loadSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[Settings API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings
 * Updates and saves settings
 */
export async function POST(request: NextRequest) {
  try {
    const updates = (await request.json()) as PartialAppSettings;
    
    // Load current settings
    const current = loadSettings();
    
    // Merge updates
    const updated = enforceGerman(deepMerge(current, updates as Record<string, unknown>));
    
    // Save to file
    saveSettings(updated);
    
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[Settings API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
