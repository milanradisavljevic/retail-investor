import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { validateUniverseId, validatePresetId, universeExists } from '@/lib/inputValidation';
import {
  acquireRunLock,
  getRunLockState,
  releaseRunLock,
  updateRunProgress,
} from '@/data/repositories/run_lock_repo';
import { sanitizeError } from '@/lib/apiError';
import { getAuthUserId } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LiveRunFilterConfig {
  excludeCryptoMining?: boolean;
  excludeDefense?: boolean;
  excludeFossilFuels?: boolean;
  minMarketCap?: number | null;
  minLiquidity?: number | null;
  maxVolatility?: number | null;
}

interface TriggerRunRequest {
  universe?: string;
  preset?: string | null;
  filters?: LiveRunFilterConfig;
}

interface TriggerRunResponse {
  success: boolean;
  message: string;
  runId?: string;
  estimatedDuration?: string;
  error?: string;
  currentRun?: {
    runType: string | null;
    universe: string | null;
    preset: string | null;
    startedAt: string | null;
    startedBy: string | null;
    progressPct: number;
    progressMsg: string | null;
  };
}

function estimateDuration(symbolCount: number): string {
  const minutes = Math.floor(symbolCount * 0.05);

  if (minutes === 0) return '~15 seconds';
  if (minutes < 1) return '~1 minute';
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
  }
  return `~${minutes} minutes`;
}

function getUniverseSymbolCount(universeId: string): number {
  try {
    const universePath = path.join(process.cwd(), 'config', 'universes', `${universeId}.json`);
    if (fs.existsSync(universePath)) {
      const universeConfig = JSON.parse(fs.readFileSync(universePath, 'utf-8'));
      return universeConfig.symbols?.length || 0;
    }
  } catch (error) {
    console.warn(`Could not load universe ${universeId}:`, error);
  }
  return 0;
}

export async function POST(request: NextRequest): Promise<NextResponse<TriggerRunResponse>> {
  try {
    const userId = await getAuthUserId();
    console.info('[Run Trigger] Run requested', { userId });

    const body = await request.json() as TriggerRunRequest;
    const universe = body.universe || 'russell2000_full_yf';
    const preset = body.preset || null;
    const filters = body.filters;

    const uniCheck = validateUniverseId(universe);
    if (!uniCheck.valid) {
      return NextResponse.json({ success: false, message: uniCheck.error || 'Invalid universe' }, { status: 400 });
    }
    if (!universeExists(universe)) {
      return NextResponse.json({ success: false, message: 'Universe not found' }, { status: 404 });
    }

    if (preset) {
      const presetCheck = validatePresetId(preset);
      if (!presetCheck.valid) {
        return NextResponse.json({ success: false, message: presetCheck.error || 'Invalid preset' }, { status: 400 });
      }
    }

    const lockAcquired = acquireRunLock({
      run_type: 'live',
      universe,
      preset,
      started_by: userId,
    });
    if (!lockAcquired) {
      const state = getRunLockState();
      return NextResponse.json(
        {
          success: false,
          message: 'Ein Run läuft bereits',
          error: 'RUN_IN_PROGRESS',
          currentRun: {
            runType: state.run_type,
            universe: state.universe,
            preset: state.preset,
            startedAt: state.started_at,
            startedBy: state.started_by,
            progressPct: state.progress_pct,
            progressMsg: state.progress_msg,
          },
        },
        { status: 409 }
      );
    }

    try {
      updateRunProgress(2, 'Daily-Run wird gestartet...');
      const symbolCount = getUniverseSymbolCount(universe);
      const estimatedDuration = symbolCount > 0 ? estimateDuration(symbolCount) : '~5-10 minutes';

      const scriptPath = path.join(process.cwd(), 'scripts', 'run_daily.ts');
      const args = ['tsx', scriptPath, `--universe=${universe}`];
      if (preset) {
        args.push(`--preset=${preset}`);
      }
      if (filters) {
        args.push(`--filters=${JSON.stringify(filters)}`);
      }

      return await new Promise((resolve) => {
        let responded = false;

        const respond = (response: NextResponse<TriggerRunResponse>) => {
          if (responded) return;
          responded = true;
          resolve(response);
        };

        const child = spawn('npx', args, {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd(),
        });

        child.once('error', (err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error('Failed to spawn run process:', message);
          releaseRunLock(`Run-Prozess konnte nicht gestartet werden: ${message}`);
          respond(
            NextResponse.json(
              {
                success: false,
                message: 'Run konnte nicht gestartet werden',
                error: message,
              },
              { status: 500 }
            )
          );
        });

        child.once('spawn', () => {
          updateRunProgress(5, `Run-Prozess gestartet (${universe})`);
          child.unref();

          const message = preset
            ? `Run triggered for ${universe} with preset ${preset}`
            : `Run triggered for ${universe}`;

          respond(
            NextResponse.json({
              success: true,
              message,
              estimatedDuration,
              runId: 'pending',
            })
          );
        });

        child.once('exit', (code, signal) => {
          if (code === 0) {
            releaseRunLock();
            return;
          }
          const reason = signal
            ? `Run-Prozess abgebrochen (signal=${signal})`
            : `Run-Prozess fehlgeschlagen (exit=${code ?? 'unknown'})`;
          releaseRunLock(reason);
        });
      });
    } catch (error) {
      releaseRunLock(error instanceof Error ? error.message : String(error));
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized',
        },
        { status: 401 }
      );
    }
    console.error('Failed to trigger run:', error);
    return NextResponse.json(
      {
        success: false,
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  const state = getRunLockState();
  return NextResponse.json({
    isRunning: state.status === 'running',
    currentRun: state.status === 'running' || state.status === 'failed'
      ? {
          runType: state.run_type,
          universe: state.universe,
          preset: state.preset,
          startedAt: state.started_at,
          startedBy: state.started_by,
          progressPct: state.progress_pct,
          progressMsg: state.progress_msg,
          errorMsg: state.error_msg,
        }
      : undefined,
    state,
  });
}
