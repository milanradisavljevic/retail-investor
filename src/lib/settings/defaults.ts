/**
 * Default Settings
 * System-wide default values for all user preferences
 */

import type { UserSettings } from './types';

/**
 * Default settings applied on first use or after reset
 */
export const DEFAULT_SETTINGS: UserSettings = {
  general: {
    language: 'de',
    theme: 'dark',
    defaultUniverse: 'russell2000_full',
    dateFormat: 'EU',
  },
  analysis: {
    defaultStrategy: 'compounder',
    riskTolerance: 'balanced',
    minScoreThreshold: 70,
    showDeepAnalysisWarnings: true,
  },
  display: {
    cardsPerPage: 20,
    scorePrecision: 1,
    showPercentiles: true,
    compactView: false,
  },
  data: {
    cacheTTLDays: 7,
    autoRefresh: true,
    performanceTracking: true,
  },
};

/**
 * Valid options for dropdown/select fields
 */
export const SETTINGS_OPTIONS = {
  language: [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ],
  theme: [
    { value: 'dark', label: 'Dunkel' },
    { value: 'light', label: 'Hell' },
  ],
  universe: [
    { value: 'test', label: 'Test (5 Stocks)' },
    { value: 'sp500', label: 'S&P 500 (Sample)' },
    { value: 'sp500_full', label: 'S&P 500 (Full)' },
    { value: 'nasdaq100', label: 'NASDAQ 100' },
    { value: 'russell2000', label: 'Russell 2000 (Sample)' },
    { value: 'russell2000_full', label: 'Russell 2000 (Full)' },
    { value: 'dax_full', label: 'DAX 40' },
    { value: 'eurostoxx50', label: 'Euro STOXX 50' },
  ],
  dateFormat: [
    { value: 'EU', label: 'EU (DD.MM.YYYY)' },
    { value: 'US', label: 'US (MM/DD/YYYY)' },
  ],
  strategy: [
    { value: 'compounder', label: 'Compounder' },
    { value: 'deep_value', label: 'Deep Value' },
    { value: 'quant', label: 'Quant' },
    { value: 'rocket', label: 'Rocket' },
    { value: 'shield', label: 'Shield' },
    { value: 'custom', label: 'Benutzerdefiniert' },
  ],
  riskTolerance: [
    { value: 'conservative', label: 'Konservativ' },
    { value: 'balanced', label: 'Ausgewogen' },
    { value: 'aggressive', label: 'Aggressiv' },
  ],
  cardsPerPage: [
    { value: 10, label: '10' },
    { value: 20, label: '20' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
  ],
  scorePrecision: [
    { value: 0, label: 'Ganzzahl (75)' },
    { value: 1, label: 'Eine Stelle (75.2)' },
    { value: 2, label: 'Zwei Stellen (75.23)' },
  ],
  cacheTTLDays: [
    { value: 1, label: '1 Tag' },
    { value: 7, label: '7 Tage' },
    { value: 30, label: '30 Tage' },
  ],
} as const;

/**
 * Setting validation ranges
 */
export const SETTINGS_VALIDATION = {
  minScoreThreshold: { min: 0, max: 100 },
  cardsPerPage: { min: 5, max: 200 },
  cacheTTLDays: { min: 1, max: 90 },
};

/**
 * Labels and descriptions for settings (German default)
 */
export const SETTINGS_LABELS = {
  general: {
    title: 'Allgemein',
    description: 'Grundlegende Einstellungen für die Anwendung',
    language: {
      label: 'Sprache',
      description: 'Anzeigesprache der Benutzeroberfläche',
    },
    theme: {
      label: 'Design',
      description: 'Farbschema der Anwendung',
    },
    defaultUniverse: {
      label: 'Standard-Universe',
      description: 'Vorausgewähltes Aktien-Universe',
    },
    dateFormat: {
      label: 'Datumsformat',
      description: 'Darstellung von Daten',
    },
  },
  analysis: {
    title: 'Analyse',
    description: 'Einstellungen für die Aktienanalyse',
    defaultStrategy: {
      label: 'Standard-Strategie',
      description: 'Voreingestellte Scoring-Strategie',
    },
    riskTolerance: {
      label: 'Risikotoleranz',
      description: 'Ihr bevorzugtes Risikoniveau',
    },
    minScoreThreshold: {
      label: 'Minimaler Score',
      description: 'Mindestschwelle für angezeigte Aktien (0-100)',
    },
    showDeepAnalysisWarnings: {
      label: 'Tiefenanalyse-Warnungen',
      description: 'Warnungen für Aktien mit tiefer Analyse anzeigen',
    },
  },
  display: {
    title: 'Anzeige',
    description: 'Einstellungen für die Darstellung',
    cardsPerPage: {
      label: 'Karten pro Seite',
      description: 'Anzahl der angezeigten Aktien pro Seite',
    },
    scorePrecision: {
      label: 'Score-Genauigkeit',
      description: 'Nachkommastellen bei Scores',
    },
    showPercentiles: {
      label: 'Perzentile anzeigen',
      description: 'Perzentil-Rankings in der Anzeige',
    },
    compactView: {
      label: 'Kompaktansicht',
      description: 'Platzsparende Darstellung aktivieren',
    },
  },
  data: {
    title: 'Daten',
    description: 'Einstellungen für Daten und Cache',
    cacheTTLDays: {
      label: 'Cache-Dauer',
      description: 'Wie lange Daten zwischengespeichert werden',
    },
    autoRefresh: {
      label: 'Auto-Aktualisierung',
      description: 'Daten automatisch beim Laden aktualisieren',
    },
    performanceTracking: {
      label: 'Performance-Tracking',
      description: 'Detaillierte Performance-Messung aktivieren',
    },
  },
};
