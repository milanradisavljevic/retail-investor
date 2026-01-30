'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { settingsStore } from './store';
import { DEFAULT_SETTINGS } from './defaults';
import type {
  UserSettings,
  PartialUserSettings,
  Language,
  Theme,
  DateFormat,
  RiskTolerance,
  ScorePrecision,
} from './types';

/**
 * React hook for accessing and updating settings
 * Provides reactive settings with automatic UI updates
 */
export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Subscribe to settings changes
    const unsubscribe = settingsStore.subscribe((newSettings) => {
      setSettings(newSettings);
      setIsReady(true);
    });

    return unsubscribe;
  }, []);

  /**
   * Update settings with partial changes
   */
  const updateSettings = useCallback((updates: PartialUserSettings): void => {
    settingsStore.update(updates);
  }, []);

  /**
   * Update a specific category
   */
  const updateCategory = useCallback(
    <K extends keyof UserSettings>(
      category: K,
      values: Partial<UserSettings[K]>
    ): void => {
      settingsStore.updateCategory(category, values);
    },
    []
  );

  /**
   * Reset all settings to defaults
   */
  const resetSettings = useCallback((): void => {
    settingsStore.reset();
  }, []);

  /**
   * Export settings as JSON
   */
  const exportSettings = useCallback((): string => {
    return settingsStore.export();
  }, []);

  /**
   * Import settings from JSON
   */
  const importSettings = useCallback((json: string): boolean => {
    return settingsStore.import(json);
  }, []);

  /**
   * Convenience setters for common operations
   */
  const setLanguage = useCallback(
    (language: Language) => updateCategory('general', { language }),
    [updateCategory]
  );

  const setTheme = useCallback(
    (theme: Theme) => updateCategory('general', { theme }),
    [updateCategory]
  );

  const setDefaultUniverse = useCallback(
    (defaultUniverse: string) => updateCategory('general', { defaultUniverse }),
    [updateCategory]
  );

  const setDateFormat = useCallback(
    (dateFormat: DateFormat) => updateCategory('general', { dateFormat }),
    [updateCategory]
  );

  const setDefaultStrategy = useCallback(
    (defaultStrategy: string) => updateCategory('analysis', { defaultStrategy }),
    [updateCategory]
  );

  const setRiskTolerance = useCallback(
    (riskTolerance: RiskTolerance) => updateCategory('analysis', { riskTolerance }),
    [updateCategory]
  );

  const setMinScoreThreshold = useCallback(
    (minScoreThreshold: number) => updateCategory('analysis', { minScoreThreshold }),
    [updateCategory]
  );

  const setCardsPerPage = useCallback(
    (cardsPerPage: number) => updateCategory('display', { cardsPerPage }),
    [updateCategory]
  );

  const setScorePrecision = useCallback(
    (scorePrecision: ScorePrecision) => updateCategory('display', { scorePrecision }),
    [updateCategory]
  );

  const setCompactView = useCallback(
    (compactView: boolean) => updateCategory('display', { compactView }),
    [updateCategory]
  );

  const setShowPercentiles = useCallback(
    (showPercentiles: boolean) => updateCategory('display', { showPercentiles }),
    [updateCategory]
  );

  const setAutoRefresh = useCallback(
    (autoRefresh: boolean) => updateCategory('data', { autoRefresh }),
    [updateCategory]
  );

  const setPerformanceTracking = useCallback(
    (performanceTracking: boolean) => updateCategory('data', { performanceTracking }),
    [updateCategory]
  );

  /**
   * Memoized return value to prevent unnecessary re-renders
   */
  return useMemo(
    () => ({
      // State
      settings,
      isReady,

      // General actions
      updateSettings,
      updateCategory,
      resetSettings,
      exportSettings,
      importSettings,

      // Convenience setters
      setLanguage,
      setTheme,
      setDefaultUniverse,
      setDateFormat,
      setDefaultStrategy,
      setRiskTolerance,
      setMinScoreThreshold,
      setCardsPerPage,
      setScorePrecision,
      setCompactView,
      setShowPercentiles,
      setAutoRefresh,
      setPerformanceTracking,
    }),
    [
      settings,
      isReady,
      updateSettings,
      updateCategory,
      resetSettings,
      exportSettings,
      importSettings,
      setLanguage,
      setTheme,
      setDefaultUniverse,
      setDateFormat,
      setDefaultStrategy,
      setRiskTolerance,
      setMinScoreThreshold,
      setCardsPerPage,
      setScorePrecision,
      setCompactView,
      setShowPercentiles,
      setAutoRefresh,
      setPerformanceTracking,
    ]
  );
}

/**
 * Hook for accessing a single setting value
 * Use when you only need one specific setting
 */
export function useSetting<
  K extends keyof UserSettings,
  SK extends keyof UserSettings[K]
>(category: K, key: SK): UserSettings[K][SK] {
  const { settings } = useSettings();
  return settings[category][key];
}

/**
 * Hook for checking if settings are loaded
 */
export function useSettingsReady(): boolean {
  const { isReady } = useSettings();
  return isReady;
}
