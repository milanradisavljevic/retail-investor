'use client';

interface FilterCheckboxProps {
  label: string;
  tooltip?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  recommended?: boolean;
}

export function FilterCheckbox({ label, tooltip, checked, onChange, recommended }: FilterCheckboxProps) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
      />
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-200">{label}</span>
          {recommended && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">empfohlen</span>
          )}
        </div>
        {tooltip && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{tooltip}</p>}
      </div>
    </label>
  );
}
