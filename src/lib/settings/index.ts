/**
 * Settings System
 * Complete user preferences management with persistence
 */

// Types
export type {
  UserSettings,
  PartialUserSettings,
  GeneralSettings,
  AnalysisSettings,
  DisplaySettings,
  DataSettings,
  SettingsListener,
  Language,
  Theme,
  DateFormat,
  RiskTolerance,
  ScorePrecision,
} from './types';

// Defaults
export { DEFAULT_SETTINGS, SETTINGS_OPTIONS, SETTINGS_LABELS, SETTINGS_VALIDATION } from './defaults';

// Store
export { SettingsStore, settingsStore } from './store';

// React Hook
export { useSettings, useSetting, useSettingsReady } from './useSettings';
