import fs from 'fs';
import path from 'path';

const VALID_ID_PATTERN = /^[a-z0-9_-]+$/i;
const MAX_ID_LENGTH = 64;

export function validateUniverseId(id: string): { valid: boolean; error?: string } {
  if (!id || typeof id !== 'string') return { valid: false, error: 'Universe ID required' };
  if (id.length > MAX_ID_LENGTH) return { valid: false, error: 'Universe ID too long' };
  if (!VALID_ID_PATTERN.test(id)) return { valid: false, error: 'Universe ID contains invalid characters' };
  return { valid: true };
}

export function validatePresetId(id: string): { valid: boolean; error?: string } {
  if (!id || typeof id !== 'string') return { valid: false, error: 'Preset ID required' };
  if (id.length > MAX_ID_LENGTH) return { valid: false, error: 'Preset ID too long' };
  if (!VALID_ID_PATTERN.test(id)) return { valid: false, error: 'Preset ID contains invalid characters' };
  return { valid: true };
}

export function universeExists(id: string): boolean {
  const universePath = path.join(process.cwd(), 'config', 'universes', `${id}.json`);
  return fs.existsSync(universePath);
}

export function presetExists(id: string): boolean {
  const presetPath = path.join(process.cwd(), 'config', 'presets', `${id}.json`);
  return fs.existsSync(presetPath);
}
