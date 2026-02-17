/**
 * Default Settings
 * System-wide default values for all user preferences
 */

import type { AppSettings } from './types';

/**
 * Default settings applied on first use or after reset
 */
export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    language: 'de',
    theme: 'dark',
    defaultUniverse: 'russell2000_full',
  },
  analysis: {
    defaultStrategy: 'compounder',
    riskTolerance: 'balanced',
    minScoreThreshold: 70,
  },
  display: {
    cardsPerPage: 20,
    scorePrecision: 1,
    showPercentiles: true,
  },
};

/**
 * Valid options for dropdown/select fields
 */
export const SETTINGS_OPTIONS = {
  language: [
    { value: 'de', label: 'Deutsch' },
  ],
  theme: [
    { value: 'dark', label: 'Dunkel' },
    { value: 'light', label: 'Hell' },
  ],
  universe: [
    { value: 'test', label: 'Test (5 Stocks)' },
    { value: 'sp500-full', label: 'S&P 500 (Voll)' },
    { value: 'nasdaq100-full', label: 'NASDAQ 100 (Voll)' },
    { value: 'russell2000_full', label: 'Russell 2000 (Voll)' },
    { value: 'dax40-full', label: 'DAX 40 (Voll)' },
    { value: 'cac40-full', label: 'CAC 40 (Voll)' },
    { value: 'eurostoxx50-full', label: 'EURO STOXX 50 (Voll)' },
    { value: 'ftse100-full', label: 'FTSE 100 (Voll)' },
  ],
  strategy: [
    { value: 'compounder', label: 'Compounder' },
    { value: 'deep_value', label: 'Deep Value' },
    { value: 'garp', label: 'GARP' },
    { value: 'dividend_quality', label: 'Dividendenqualität (experimentell)' },
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
  },
};
