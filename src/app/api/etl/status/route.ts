import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const statusPath = join(process.cwd(), 'data', 'etl-status.json');
  
  if (!existsSync(statusPath)) {
    return NextResponse.json({
      status: 'unknown',
      message: 'No ETL has been run yet',
      last_run: null,
      data_age_hours: null,
    });
  }
  
  try {
    const raw = readFileSync(statusPath, 'utf-8');
    const status = JSON.parse(raw);
    
    // Calculate age of data
    const lastRunTimestamp = status.timestamp;
    const ageSeconds = Math.floor(Date.now() / 1000) - lastRunTimestamp;
    const ageHours = Math.round((ageSeconds / 3600) * 10) / 10;
    
    // Warnstufen
    let freshness: 'fresh' | 'stale' | 'critical';
    if (ageHours < 26) {
      freshness = 'fresh';       // < 26h = OK (taeglicher Run)
    } else if (ageHours < 50) {
      freshness = 'stale';      // < 50h = Warnung
    } else {
      freshness = 'critical';    // > 50h = Kritisch
    }
    
    return NextResponse.json({
      ...status,
      data_age_hours: ageHours,
      freshness,
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      message: 'Could not read ETL status',
      error: String(err),
    }, { status: 500 });
  }
}
