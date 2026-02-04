'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { settingsStore } from './store';
import { DEFAULT_SETTINGS } from './defaults';
import type { AppSettings, PartialAppSettings } from './types';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribe = settingsStore.subscribe((newSettings) => {
      setSettings(newSettings);
      setIsReady(true);
      setIsSaving(false);
    });

    return unsubscribe;
  }, []);

  const applyUpdate = (updates: PartialAppSettings) => {
    setSettings((prev) =>
      deepMerge(prev as Record<string, unknown>, updates as Record<string, unknown>) as AppSettings
    );
    setIsSaving(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      settingsStore.update(updates);
      setIsSaving(false);
      setLastSavedAt(Date.now());
    }, 500);
  };

  const updateCategory = <K extends keyof AppSettings>(
    category: K,
    values: Partial<AppSettings[K]>
  ) => {
    applyUpdate({ [category]: values } as PartialAppSettings);
  };

  const resetSettings = () => {
    settingsStore.reset();
    setSettings(DEFAULT_SETTINGS);
    setLastSavedAt(Date.now());
  };

  return useMemo(
    () => ({
      settings,
      isReady,
      isSaving,
      lastSavedAt,
      updateCategory,
      resetSettings,
    }),
    [
      settings,
      isReady,
      updateCategory,
      isSaving,
      lastSavedAt,
      resetSettings,
    ]
  );
}

// simple deep merge helper
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue === undefined) continue;
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
  return result as T;
}
