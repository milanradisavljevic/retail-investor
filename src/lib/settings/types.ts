/**
 * Settings System Types
 * Type definitions for user preferences and settings
 */

export type Language = 'de' | 'en';
export type Theme = 'dark' | 'light';
export type DateFormat = 'EU' | 'US';
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive';
export type ScorePrecision = 0 | 1 | 2;

export interface GeneralSettings {
  /** Display language */
  language: Language;
  /** UI theme */
  theme: Theme;
  /** Default stock universe */
  defaultUniverse: string;
  /** Date format preference */
  dateFormat: DateFormat;
}

export interface AnalysisSettings {
  /** Default scoring strategy preset */
  defaultStrategy: string;
  /** Risk tolerance level */
  riskTolerance: RiskTolerance;
  /** Minimum score threshold for displayed stocks (0-100) */
  minScoreThreshold: number;
  /** Show warnings for stocks requiring deep analysis */
  showDeepAnalysisWarnings: boolean;
}

export interface DisplaySettings {
  /** Number of stock cards per page */
  cardsPerPage: number;
  /** Decimal precision for score display */
  scorePrecision: ScorePrecision;
  /** Show percentile rankings */
  showPercentiles: boolean;
  /** Use compact view mode */
  compactView: boolean;
}

export interface DataSettings {
  /** Cache time-to-live in days */
  cacheTTLDays: number;
  /** Auto-refresh data on load */
  autoRefresh: boolean;
  /** Enable performance tracking */
  performanceTracking: boolean;
}

/**
 * Complete user settings object
 */
export interface UserSettings {
  general: GeneralSettings;
  analysis: AnalysisSettings;
  display: DisplaySettings;
  data: DataSettings;
  [key: string]: unknown;
}

/**
 * Partial settings for updates
 */
export type PartialUserSettings = {
  [K in keyof UserSettings]?: Partial<UserSettings[K]>;
};

/**
 * Settings change listener type
 */
export type SettingsListener = (settings: UserSettings) => void;
