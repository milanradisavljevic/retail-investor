'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useServerSettings } from '@/lib/settings/useServerSettings';
import { SETTINGS_OPTIONS, SETTINGS_VALIDATION } from '@/lib/settings/defaults';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  SettingsSection,
  SettingsRow,
  SettingsSelect,
  SettingsToggle,
  SettingsNumberInput,
  SettingsButton,
} from '@/app/components/SettingsSection';
import type { RiskTolerance, ScorePrecision } from '@/lib/settings/types';

export default function SettingsPage() {
  const { t } = useTranslation();
  const {
    settings,
    isReady,
    isSaving,
    lastSavedAt,
    updateCategory,
    resetSettings,
    error,
  } = useServerSettings();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  useEffect(() => {
    if (!lastSavedAt) return;
    setShowSavedToast(true);
    const timer = setTimeout(() => setShowSavedToast(false), 1500);
    return () => clearTimeout(timer);
  }, [lastSavedAt]);

  if (!isReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
          <span className="text-[#94A3B8]">{t('settings.messages.loading') || 'Laden...'}</span>
        </div>
      </div>
    );
  }

  const handleReset = () => {
    if (showResetConfirm) {
      resetSettings();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 3000);
    }
  };

  const translateOpts = (key: string, opts: ReadonlyArray<{ value: string | number; label: string }>) => {
    return opts.map((opt) => ({
      value: opt.value,
      label: t(`settings.options.${key}.${opt.value}`) || opt.label
    }));
  };

  return (
    <div className="min-h-screen bg-[#0B1220]">
      {/* Header */}
      <div className="border-b border-[#1F2937] bg-[#111827]">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#64748B]">{t('settings.title')}</p>
              <h1 className="text-2xl font-semibold text-[#F1F5F9]">{t('settings.title')}</h1>
              <p className="mt-1 text-sm text-[#94A3B8]">
                {t('settings.description')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/settings/design-system"
                className="rounded-lg border border-[#334155] bg-[#1F2937] px-4 py-2 text-sm text-[#E2E8F0] transition hover:border-[#475569] hover:bg-[#334155]"
              >
                {t('settings.actions.designSystem')}
              </Link>
              <SettingsButton
                onClick={handleReset}
                variant={showResetConfirm ? 'danger' : 'secondary'}
              >
                {showResetConfirm ? t('settings.actions.resetConfirm') : t('settings.actions.reset')}
              </SettingsButton>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {showSavedToast && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-600/30 bg-green-600/10 p-3 text-green-400 animate-slide-up">
            <div className={`h-3 w-3 rounded-full ${isSaving ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
            <span className="text-sm">
              {isSaving ? t('settings.messages.saving') ?? 'Speichern...' : t('settings.messages.saved')}
            </span>
          </div>
        )}

        {/* General Settings */}
        <SettingsSection
          title={t('settings.general.title')}
          description={t('settings.general.description')}
          icon="⚙️"
        >
          <SettingsRow
            label={t('settings.general.language.label')}
            description={t('settings.general.language.description')}
          >
            <SettingsSelect
              value={settings.general.language}
              onChange={() => updateCategory('general', { language: 'de' })}
              options={translateOpts('language', SETTINGS_OPTIONS.language)}
            />
          </SettingsRow>

          <SettingsRow
            label={t('settings.general.theme.label')}
            description={t('settings.general.theme.description')}
          >
            <SettingsSelect
              value={settings.general.theme}
              onChange={(v) => updateCategory('general', { theme: v as 'dark' | 'light' })}
              options={translateOpts('theme', SETTINGS_OPTIONS.theme)}
            />
          </SettingsRow>

          <SettingsRow
            label={t('settings.general.defaultUniverse.label')}
            description={t('settings.general.defaultUniverse.description')}
          >
            <SettingsSelect
              value={settings.general.defaultUniverse}
              onChange={(v) => updateCategory('general', { defaultUniverse: v })}
              options={translateOpts('universe', SETTINGS_OPTIONS.universe)}
            />
          </SettingsRow>
        </SettingsSection>

        {/* Analysis Settings */}
        <SettingsSection
          title={t('settings.analysis.title')}
          description={t('settings.analysis.description')}
          icon="📊"
        >
          <SettingsRow
            label={t('settings.analysis.defaultStrategy.label')}
            description={t('settings.analysis.defaultStrategy.description')}
          >
            <SettingsSelect
              value={settings.analysis.defaultStrategy}
              onChange={(v) => updateCategory('analysis', { defaultStrategy: v })}
              options={translateOpts('strategy', SETTINGS_OPTIONS.strategy)}
            />
          </SettingsRow>

          <SettingsRow
            label={t('settings.analysis.riskTolerance.label')}
            description={t('settings.analysis.riskTolerance.description')}
          >
            <SettingsSelect
              value={settings.analysis.riskTolerance}
              onChange={(v) => updateCategory('analysis', { riskTolerance: v as RiskTolerance })}
              options={translateOpts('riskTolerance', SETTINGS_OPTIONS.riskTolerance)}
            />
          </SettingsRow>

          <SettingsRow
            label={t('settings.analysis.minScoreThreshold.label')}
            description={t('settings.analysis.minScoreThreshold.description')}
          >
            <SettingsNumberInput
              value={settings.analysis.minScoreThreshold}
              onChange={(v) => updateCategory('analysis', { minScoreThreshold: v })}
              min={SETTINGS_VALIDATION.minScoreThreshold.min}
              max={SETTINGS_VALIDATION.minScoreThreshold.max}
            />
          </SettingsRow>
        </SettingsSection>

        {/* Display Settings */}
        <SettingsSection
          title={t('settings.display.title')}
          description={t('settings.display.description')}
          icon="🎨"
        >
          <SettingsRow
            label={t('settings.display.cardsPerPage.label')}
            description={t('settings.display.cardsPerPage.description')}
          >
            <SettingsSelect
              value={settings.display.cardsPerPage}
              onChange={(v) => updateCategory('display', { cardsPerPage: parseInt(v) })}
              options={translateOpts('cardsPerPage', SETTINGS_OPTIONS.cardsPerPage)}
            />
          </SettingsRow>

          <SettingsRow
            label={t('settings.display.scorePrecision.label')}
            description={t('settings.display.scorePrecision.description')}
          >
            <SettingsSelect
              value={settings.display.scorePrecision}
              onChange={(v) => updateCategory('display', { scorePrecision: parseInt(v) as ScorePrecision })}
              options={translateOpts('scorePrecision', SETTINGS_OPTIONS.scorePrecision)}
            />
          </SettingsRow>

          <SettingsRow
            label={t('settings.display.showPercentiles.label')}
            description={t('settings.display.showPercentiles.description')}
          >
            <SettingsToggle
              checked={settings.display.showPercentiles}
              onChange={(checked) => updateCategory('display', { showPercentiles: checked })}
            />
          </SettingsRow>
        </SettingsSection>

        {/* Storage Info */}
        <div className="mt-8 rounded-lg border border-[#1F2937] bg-[#111827]/50 p-4">
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <span>ℹ️</span>
            <span>
              Einstellungen werden serverseitig gespeichert und stehen Ihnen auf allen Geraeten zur Verfuegung.
            </span>
          </div>
          {error && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
