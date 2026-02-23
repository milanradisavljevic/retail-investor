'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DisplayCurrency } from '@/lib/settings/types';
import { useServerSettings } from '@/lib/settings/useServerSettings';

type FxApiResponse = {
  pair: 'USD_EUR';
  rate: number;
  asOf: string;
  provider: 'ecb' | 'yahoo' | 'cache';
  fetchedAt: string;
  stale?: boolean;
};

const DEFAULT_RATE = 1;

export function useDisplayCurrency() {
  const { settings, isReady: settingsReady } = useServerSettings();
  const displayCurrency: DisplayCurrency = settings.general.displayCurrency ?? 'USD';

  const [usdToEurRate, setUsdToEurRate] = useState<number>(DEFAULT_RATE);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxAsOf, setFxAsOf] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchRate = async () => {
      if (displayCurrency !== 'EUR') {
        setFxError(null);
        setFxLoading(false);
        return;
      }

      setFxLoading(true);
      setFxError(null);
      try {
        const response = await fetch('/api/fx-rate?base=USD&quote=EUR', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as FxApiResponse;
        if (!cancelled && typeof payload.rate === 'number' && Number.isFinite(payload.rate) && payload.rate > 0) {
          setUsdToEurRate(payload.rate);
          setFxAsOf(payload.asOf);
        }
      } catch {
        if (!cancelled) {
          setFxError('FX rate unavailable');
        }
      } finally {
        if (!cancelled) {
          setFxLoading(false);
        }
      }
    };

    void fetchRate();
    return () => {
      cancelled = true;
    };
  }, [displayCurrency]);

  return useMemo(
    () => ({
      displayCurrency,
      usdToEurRate,
      isReady: settingsReady && (displayCurrency === 'USD' || !fxLoading),
      fxLoading,
      fxError,
      fxAsOf,
    }),
    [displayCurrency, fxAsOf, fxError, fxLoading, settingsReady, usdToEurRate]
  );
}
