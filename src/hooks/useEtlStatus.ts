'use client';

import { useEffect, useState } from 'react';

type Freshness = 'fresh' | 'stale' | 'critical' | 'unknown';

export interface EtlStatus {
  status: string;
  message?: string;
  last_run?: number | null;
  data_age_hours?: number | null;
  freshness?: Freshness;
}

export function useEtlStatus() {
  const [status, setStatus] = useState<EtlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/etl/status');
        if (!mounted) return;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as EtlStatus;
        setStatus(json);
      } catch (err: any) {
        if (mounted) setError(err?.message ?? 'Failed to load ETL status');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return { status, loading, error };
}
