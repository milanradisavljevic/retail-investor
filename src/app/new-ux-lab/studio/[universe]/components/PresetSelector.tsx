"use client";

const PRESETS = [
  {
    key: "rocket",
    name: "Rocket",
    description: "High-growth momentum plays",
    emoji: "🚀",
  },
  {
    key: "deep-value",
    name: "Deep Value",
    description: "Undervalued bargains with strong fundamentals",
    emoji: "💎",
  },
  {
    key: "balanced",
    name: "Balanced",
    description: "Well-rounded picks across all pillars",
    emoji: "⚖️",
  },
  {
    key: "quality",
    name: "Quality",
    description: "High-quality businesses with strong moats",
    emoji: "⭐",
  },
  {
    key: "risk-aware",
    name: "Risk-Aware",
    description: "Conservative picks with lower volatility",
    emoji: "🛡️",
  },
];

export function PresetSelector({
  selectedPreset,
  onPresetSelect,
  onCustomize,
}: {
  selectedPreset: string | null;
  onPresetSelect: (presetKey: string) => void;
  onCustomize: () => void;
}) {
  return (
    <div className="space-y-2">
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          onClick={() => onPresetSelect(preset.key)}
          className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
            selectedPreset === preset.key
              ? "bg-surface-3 border-border-emphasis text-text-primary"
              : "bg-surface-1 border-border-default text-text-secondary hover:bg-surface-2 hover:border-border-emphasis hover:text-text-primary"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{preset.emoji}</span>
            <span className="text-sm font-medium">{preset.name}</span>
          </div>
          <p className="text-xs text-text-tertiary pl-7">{preset.description}</p>
        </button>
      ))}

      <button
        onClick={onCustomize}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
          selectedPreset === null
            ? "bg-surface-3 border-border-emphasis text-text-primary"
            : "bg-surface-1 border-border-default text-text-secondary hover:bg-surface-2 hover:border-border-emphasis hover:text-text-primary"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">⚙️</span>
          <span className="text-sm font-medium">Custom</span>
        </div>
        <p className="text-xs text-text-tertiary pl-7">Configure your own weights</p>
      </button>
    </div>
  );
}
