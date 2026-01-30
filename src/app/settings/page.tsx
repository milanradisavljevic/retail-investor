'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSettings } from '@/lib/settings/useSettings';
import { SETTINGS_OPTIONS, SETTINGS_LABELS, SETTINGS_VALIDATION } from '@/lib/settings/defaults';
import {
  SettingsSection,
  SettingsRow,
  SettingsSelect,
  SettingsToggle,
  SettingsNumberInput,
  SettingsButton,
} from '@/app/components/SettingsSection';
import type { Language, Theme, DateFormat, RiskTolerance, ScorePrecision } from '@/lib/settings/types';

export default function SettingsPage() {
  const {
    settings,
    isReady,
    updateCategory,
    resetSettings,
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
  } = useSettings();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  if (!isReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
          <span className="text-[#94A3B8]">Einstellungen laden...</span>
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

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const json = event.target?.result as string;
          // settingsStore.import() would be called here
          setImportError('Import-Funktion wird implementiert');
          setTimeout(() => setImportError(null), 3000);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const labels = SETTINGS_LABELS;

  return (
    <div className="min-h-screen bg-[#0B1220]">
      {/* Header */}
      <div className="border-b border-[#1F2937] bg-[#111827]">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#64748B]">Settings</p>
              <h1 className="text-2xl font-semibold text-[#F1F5F9]">Einstellungen</h1>
              <p className="mt-1 text-sm text-[#94A3B8]">
                Passen Sie Ihre Analyse-Einstellungen und Anzeige-Präferenzen an
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/settings/design-system"
                className="rounded-lg border border-[#334155] bg-[#1F2937] px-4 py-2 text-sm text-[#E2E8F0] transition hover:border-[#475569] hover:bg-[#334155]"
              >
                Design System
              </Link>
              <SettingsButton
                onClick={handleReset}
                variant={showResetConfirm ? 'danger' : 'secondary'}
              >
                {showResetConfirm ? 'Klicken zum Bestätigen' : 'Zurücksetzen'}
              </SettingsButton>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {importError && (
          <div className="mb-6 rounded-lg border border-yellow-600/30 bg-yellow-600/10 p-4 text-yellow-400">
            {importError}
          </div>
        )}

        {/* General Settings */}
        <SettingsSection
          title={labels.general.title}
          description={labels.general.description}
          icon="⚙️"
        >
          <SettingsRow
            label={labels.general.language.label}
            description={labels.general.language.description}
          >
            <SettingsSelect
              value={settings.general.language}
              onChange={(v) => setLanguage(v as Language)}
              options={SETTINGS_OPTIONS.language}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.general.theme.label}
            description={labels.general.theme.description}
          >
            <SettingsSelect
              value={settings.general.theme}
              onChange={(v) => setTheme(v as Theme)}
              options={SETTINGS_OPTIONS.theme}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.general.defaultUniverse.label}
            description={labels.general.defaultUniverse.description}
          >
            <SettingsSelect
              value={settings.general.defaultUniverse}
              onChange={(v) => setDefaultUniverse(v)}
              options={SETTINGS_OPTIONS.universe}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.general.dateFormat.label}
            description={labels.general.dateFormat.description}
          >
            <SettingsSelect
              value={settings.general.dateFormat}
              onChange={(v) => setDateFormat(v as DateFormat)}
              options={SETTINGS_OPTIONS.dateFormat}
            />
          </SettingsRow>
        </SettingsSection>

        {/* Analysis Settings */}
        <SettingsSection
          title={labels.analysis.title}
          description={labels.analysis.description}
          icon="📊"
        >
          <SettingsRow
            label={labels.analysis.defaultStrategy.label}
            description={labels.analysis.defaultStrategy.description}
          >
            <SettingsSelect
              value={settings.analysis.defaultStrategy}
              onChange={(v) => setDefaultStrategy(v)}
              options={SETTINGS_OPTIONS.strategy}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.analysis.riskTolerance.label}
            description={labels.analysis.riskTolerance.description}
          >
            <SettingsSelect
              value={settings.analysis.riskTolerance}
              onChange={(v) => setRiskTolerance(v as RiskTolerance)}
              options={SETTINGS_OPTIONS.riskTolerance}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.analysis.minScoreThreshold.label}
            description={labels.analysis.minScoreThreshold.description}
          >
            <SettingsNumberInput
              value={settings.analysis.minScoreThreshold}
              onChange={setMinScoreThreshold}
              min={SETTINGS_VALIDATION.minScoreThreshold.min}
              max={SETTINGS_VALIDATION.minScoreThreshold.max}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.analysis.showDeepAnalysisWarnings.label}
            description={labels.analysis.showDeepAnalysisWarnings.description}
          >
            <SettingsToggle
              checked={settings.analysis.showDeepAnalysisWarnings}
              onChange={(checked) => updateCategory('analysis', { showDeepAnalysisWarnings: checked })}
            />
          </SettingsRow>
        </SettingsSection>

        {/* Display Settings */}
        <SettingsSection
          title={labels.display.title}
          description={labels.display.description}
          icon="🎨"
        >
          <SettingsRow
            label={labels.display.cardsPerPage.label}
            description={labels.display.cardsPerPage.description}
          >
            <SettingsSelect
              value={settings.display.cardsPerPage}
              onChange={(v) => setCardsPerPage(parseInt(v))}
              options={SETTINGS_OPTIONS.cardsPerPage}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.display.scorePrecision.label}
            description={labels.display.scorePrecision.description}
          >
            <SettingsSelect
              value={settings.display.scorePrecision}
              onChange={(v) => setScorePrecision(parseInt(v) as ScorePrecision)}
              options={SETTINGS_OPTIONS.scorePrecision}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.display.showPercentiles.label}
            description={labels.display.showPercentiles.description}
          >
            <SettingsToggle
              checked={settings.display.showPercentiles}
              onChange={setShowPercentiles}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.display.compactView.label}
            description={labels.display.compactView.description}
          >
            <SettingsToggle
              checked={settings.display.compactView}
              onChange={setCompactView}
            />
          </SettingsRow>
        </SettingsSection>

        {/* Data Settings */}
        <SettingsSection
          title={labels.data.title}
          description={labels.data.description}
          icon="💾"
        >
          <SettingsRow
            label={labels.data.cacheTTLDays.label}
            description={labels.data.cacheTTLDays.description}
          >
            <SettingsSelect
              value={settings.data.cacheTTLDays}
              onChange={(v) => updateCategory('data', { cacheTTLDays: parseInt(v) })}
              options={SETTINGS_OPTIONS.cacheTTLDays}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.data.autoRefresh.label}
            description={labels.data.autoRefresh.description}
          >
            <SettingsToggle
              checked={settings.data.autoRefresh}
              onChange={setAutoRefresh}
            />
          </SettingsRow>

          <SettingsRow
            label={labels.data.performanceTracking.label}
            description={labels.data.performanceTracking.description}
          >
            <SettingsToggle
              checked={settings.data.performanceTracking}
              onChange={setPerformanceTracking}
            />
          </SettingsRow>
        </SettingsSection>

        {/* Import/Export */}
        <SettingsSection
          title="Backup & Wiederherstellung"
          description="Exportieren oder importieren Sie Ihre Einstellungen"
          icon="📦"
        >
          <div className="flex flex-wrap gap-3">
            <SettingsButton
              onClick={() => {
                const blob = new Blob(
                  [JSON.stringify(settings, null, 2)],
                  { type: 'application/json' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'privatinvestor-settings.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              variant="primary"
            >
              Einstellungen exportieren
            </SettingsButton>
            <SettingsButton onClick={handleImport} variant="secondary">
              Einstellungen importieren
            </SettingsButton>
          </div>
          <p className="mt-3 text-xs text-[#64748B]">
            Exportieren Sie Ihre Einstellungen, um sie auf einem anderen Gerät wiederherzustellen
            oder als Backup zu speichern.
          </p>
        </SettingsSection>

        {/* Storage Info */}
        <div className="mt-8 rounded-lg border border-[#1F2937] bg-[#111827]/50 p-4">
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <span>ℹ️</span>
            <span>
              Einstellungen werden lokal in Ihrem Browser gespeichert (localStorage).
              Sie sind nicht mit einem Konto synchronisiert.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
