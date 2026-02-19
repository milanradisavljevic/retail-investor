import { getDatabase } from '@/data/db';

const STALE_LOCK_MS = 30 * 60 * 1000;

type RunLockStatus = 'idle' | 'running' | 'failed';

interface RunLockRow {
  status: RunLockStatus;
  run_type: string | null;
  universe: string | null;
  preset: string | null;
  started_by: string | null;
  started_at: string | null;
  updated_at: string | null;
  progress_pct: number | null;
  progress_msg: string | null;
  error_msg: string | null;
}

export interface RunLockState {
  status: RunLockStatus;
  run_type: string | null;
  universe: string | null;
  preset: string | null;
  started_by: string | null;
  started_at: string | null;
  updated_at: string | null;
  progress_pct: number;
  progress_msg: string | null;
  error_msg: string | null;
}

function ensureSingletonRow(): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR IGNORE INTO run_lock (id, status, progress_pct, progress_msg)
    VALUES (1, 'idle', 0, 'Bereit')
  `).run();
}

function clampProgress(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  const rounded = Math.round(pct);
  return Math.max(0, Math.min(100, rounded));
}

function normalizeRow(row?: RunLockRow): RunLockState {
  if (!row) {
    return {
      status: 'idle',
      run_type: null,
      universe: null,
      preset: null,
      started_by: null,
      started_at: null,
      updated_at: null,
      progress_pct: 0,
      progress_msg: 'Bereit',
      error_msg: null,
    };
  }

  return {
    ...row,
    progress_pct: clampProgress(row.progress_pct ?? 0),
  };
}

export function getRunLockState(): RunLockState {
  ensureSingletonRow();
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM run_lock WHERE id = 1').get() as RunLockRow | undefined;
  return normalizeRow(row);
}

export function acquireRunLock(params: {
  run_type: string;
  universe: string;
  preset: string | null;
  started_by: string;
}): boolean {
  ensureSingletonRow();
  const db = getDatabase();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const current = db
      .prepare('SELECT status, started_at FROM run_lock WHERE id = 1')
      .get() as Pick<RunLockRow, 'status' | 'started_at'> | undefined;

    if (current?.status === 'running') {
      if (current.started_at) {
        const startedAtMs = new Date(current.started_at).getTime();
        if (Number.isFinite(startedAtMs) && Date.now() - startedAtMs <= STALE_LOCK_MS) {
          return false;
        }
      } else {
        return false;
      }
    }

    db.prepare(`
      UPDATE run_lock
      SET
        status = 'running',
        run_type = ?,
        universe = ?,
        preset = ?,
        started_by = ?,
        started_at = ?,
        updated_at = ?,
        progress_pct = 0,
        progress_msg = 'Initialisierung...',
        error_msg = NULL
      WHERE id = 1
    `).run(params.run_type, params.universe, params.preset, params.started_by, now, now);

    return true;
  });

  return tx();
}

export function updateRunProgress(pct: number, msg: string): void {
  ensureSingletonRow();
  const db = getDatabase();
  db.prepare(`
    UPDATE run_lock
    SET
      progress_pct = ?,
      progress_msg = ?,
      updated_at = ?
    WHERE id = 1
      AND status = 'running'
  `).run(clampProgress(pct), msg, new Date().toISOString());
}

export function releaseRunLock(error?: string): void {
  ensureSingletonRow();
  const db = getDatabase();
  const now = new Date().toISOString();

  if (error) {
    db.prepare(`
      UPDATE run_lock
      SET
        status = 'failed',
        error_msg = ?,
        updated_at = ?
      WHERE id = 1
    `).run(error, now);
    return;
  }

  db.prepare(`
    UPDATE run_lock
    SET
      status = 'idle',
      run_type = NULL,
      universe = NULL,
      preset = NULL,
      started_by = NULL,
      started_at = NULL,
      progress_pct = 100,
      progress_msg = 'Abgeschlossen',
      error_msg = NULL,
      updated_at = ?
    WHERE id = 1
  `).run(now);
}
