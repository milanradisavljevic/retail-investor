'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, PartialAppSettings } from './types';
import { DEFAULT_SETTINGS } from './defaults';

export function useServerSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
          throw new Error('Failed to load settings');
        }
        const data = (await response.json()) as AppSettings;
        setSettings(data);
        setIsReady(true);
      } catch (err) {
        console.error('[useServerSettings] Failed to load settings:', err);
        setError('Failed to load settings');
        setIsReady(true);
      }
    };

    loadSettings();
  }, []);

  const applyUpdate = async (updates: PartialAppSettings) => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      const data = (await response.json()) as AppSettings;
      setSettings(data);
      setLastSavedAt(Date.now());
    } catch (err) {
      console.error('[useServerSettings] Failed to save settings:', err);
      setError('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const updateCategory = <K extends keyof AppSettings>(
    category: K,
    values: Partial<AppSettings[K]>
  ) => {
    applyUpdate({ [category]: values } as PartialAppSettings);
  };

  const resetSettings = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(DEFAULT_SETTINGS),
      });

      if (!response.ok) {
        throw new Error('Failed to reset settings');
      }

      const data = (await response.json()) as AppSettings;
      setSettings(data);
      setLastSavedAt(Date.now());
    } catch (err) {
      console.error('[useServerSettings] Failed to reset settings:', err);
      setError('Failed to reset settings');
    } finally {
      setIsSaving(false);
    }
  };

  return useMemo(
    () => ({
      settings,
      isReady,
      isSaving,
      lastSavedAt,
      error,
      updateCategory,
      resetSettings,
    }),
    [settings, isReady, isSaving, lastSavedAt, error, updateCategory, resetSettings]
  );
}
