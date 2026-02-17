'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from './defaults';
import type { AppSettings } from './types';
import { useServerSettings } from './useServerSettings';

const CACHE_KEY = 'intrinsic_settings_cache_v2';

function enforceGerman(settings: AppSettings): AppSettings {
  return {
    ...settings,
    general: {
      ...settings.general,
      language: 'de',
    },
  };
}

export function useUnifiedSettings() {
  const server = useServerSettings();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [cacheHydrated, setCacheHydrated] = useState(false);

  // Hydrate from local cache (optimistic, non-authoritative)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as AppSettings;
        setSettings(enforceGerman(parsed));
      }
    } catch (err) {
      console.warn('[useUnifiedSettings] Failed to read cache', err);
    } finally {
      setCacheHydrated(true);
    }
  }, []);

  // Apply authoritative server settings when ready
  useEffect(() => {
    if (!server.isReady) return;
    const normalized = enforceGerman(server.settings);
    setSettings(normalized);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore cache write failures
      }
    }
  }, [server.isReady, server.settings]);

  const updateCategory = <K extends keyof AppSettings>(
    category: K,
    values: Partial<AppSettings[K]>
  ) => {
    // optimistic merge for immediate UI response (shallow per category)
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        ...values,
      } as AppSettings[K],
    }));
    server.updateCategory(category, values);
  };

  const resetSettings = () => {
    server.resetSettings();
  };

  const isReady = server.isReady || cacheHydrated;

  return useMemo(
    () => ({
      settings,
      isReady,
      isSaving: server.isSaving,
      lastSavedAt: server.lastSavedAt,
      error: server.error,
      updateCategory,
      resetSettings,
    }),
    [settings, isReady, server.isSaving, server.lastSavedAt, server.error]
  );
}
