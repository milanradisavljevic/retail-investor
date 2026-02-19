import { existsSync } from 'fs';
import path from 'path';

function pickFirstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolvePythonExecutable(cwd = process.cwd()): string {
  const override = process.env.PYTHON_EXECUTABLE?.trim();
  if (override) return override;

  const fromVenvEnv = process.env.VIRTUAL_ENV?.trim();
  if (fromVenvEnv) {
    const fromActiveVenv = pickFirstExisting([
      path.join(fromVenvEnv, 'bin', 'python'),
      path.join(fromVenvEnv, 'Scripts', 'python.exe'),
    ]);
    if (fromActiveVenv) return fromActiveVenv;
  }

  const localVenv = pickFirstExisting([
    path.join(cwd, '.venv', 'bin', 'python'),
    path.join(cwd, '.venv', 'Scripts', 'python.exe'),
  ]);
  if (localVenv) return localVenv;

  return 'python3';
}
