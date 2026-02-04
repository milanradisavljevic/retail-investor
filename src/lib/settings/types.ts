export type Language = 'de' | 'en';
export type Theme = 'dark' | 'light';
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive';
export type ScorePrecision = 0 | 1 | 2;

export type AppSettings = {
  general: {
    language: Language;
    theme: Theme;
    defaultUniverse: string;
  };
  analysis: {
    defaultStrategy: string;
    riskTolerance: RiskTolerance;
    minScoreThreshold: number;
  };
  display: {
    cardsPerPage: number;
    scorePrecision: ScorePrecision;
    showPercentiles: boolean;
  };
};

export type PartialAppSettings = {
  [K in keyof AppSettings]?: Partial<AppSettings[K]>;
};

export type SettingsListener = (settings: AppSettings) => void;

// Legacy/compat aliases expected by barrel
export type UserSettings = AppSettings;
export type PartialUserSettings = PartialAppSettings;
export type GeneralSettings = AppSettings['general'];
export type AnalysisSettings = AppSettings['analysis'];
export type DisplaySettings = AppSettings['display'];
export type DataSettings = Record<string, never>;
export type DateFormat = 'iso' | 'locale' | string;
