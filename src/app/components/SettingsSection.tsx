'use client';

import { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: string;
}

/**
 * Reusable settings section component
 * Provides consistent styling for settings categories
 */
export function SettingsSection({
  title,
  description,
  children,
  icon,
}: SettingsSectionProps) {
  return (
    <section className="mb-8 rounded-xl border border-[#1F2937] bg-[#111827] shadow-lg">
      {/* Header */}
      <div className="border-b border-[#1F2937] px-6 py-4">
        <div className="flex items-center gap-3">
          {icon && <span className="text-2xl">{icon}</span>}
          <div>
            <h2 className="text-lg font-semibold text-[#F1F5F9]">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-[#64748B]">{description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  error?: string;
}

/**
 * Individual setting row with label and control
 */
export function SettingsRow({
  label,
  description,
  children,
  error,
}: SettingsRowProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-4 border-b border-[#1F2937] last:border-0">
      <div className="flex-1 pr-4">
        <label className="block text-sm font-medium text-[#E2E8F0]">{label}</label>
        {description && (
          <p className="mt-1 text-xs text-[#64748B]">{description}</p>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
      <div className="mt-2 sm:mt-0">{children}</div>
    </div>
  );
}

interface SettingsSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string | number; label: string }>;
  disabled?: boolean;
}

/**
 * Styled select dropdown for settings
 */
export function SettingsSelect({
  value,
  onChange,
  options,
  disabled,
}: SettingsSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="min-w-[180px] rounded-lg border border-[#334155] bg-[#0B1220] px-4 py-2.5 text-sm text-[#E2E8F0] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface SettingsToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Styled toggle switch for boolean settings
 */
export function SettingsToggle({
  checked,
  onChange,
  disabled,
}: SettingsToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:ring-offset-2 focus:ring-offset-[#111827] ${
        checked ? 'bg-[#3B82F6]' : 'bg-[#334155]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

interface SettingsNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

/**
 * Styled number input for numeric settings
 */
export function SettingsNumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
}: SettingsNumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-24 rounded-lg border border-[#334155] bg-[#0B1220] px-4 py-2.5 text-sm text-[#E2E8F0] text-center focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6] disabled:opacity-50"
      />
      {unit && <span className="text-sm text-[#64748B]">{unit}</span>}
    </div>
  );
}

interface SettingsButtonProps {
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  disabled?: boolean;
}

/**
 * Styled button for settings actions
 */
export function SettingsButton({
  onClick,
  variant = 'secondary',
  children,
  disabled,
}: SettingsButtonProps) {
  const variantClasses = {
    primary:
      'bg-[#3B82F6] text-white hover:bg-[#2563EB] border-transparent',
    secondary:
      'bg-[#1F2937] text-[#E2E8F0] hover:bg-[#334155] border-[#334155]',
    danger:
      'bg-red-600/10 text-red-400 hover:bg-red-600/20 border-red-600/30',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:ring-offset-2 focus:ring-offset-[#111827] disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]}`}
    >
      {children}
    </button>
  );
}
