const DEFAULT_DECIMAL_THRESHOLD = 5;

type NormalizeOptions = {
  /**
   * Values with absolute magnitude up to this threshold are treated as decimals (0.452 → 45.2%).
   * Larger values are assumed to already be expressed as percents.
   */
  decimalThreshold?: number;
};

export function normalizePercent(
  value: number | null | undefined,
  opts: NormalizeOptions = {}
): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;

  const threshold = opts.decimalThreshold ?? DEFAULT_DECIMAL_THRESHOLD;
  const absValue = Math.abs(value);
  const scaled = absValue <= threshold ? absValue * 100 : absValue;

  return value < 0 ? -scaled : scaled;
}

type FormatOptions = NormalizeOptions & {
  signed?: boolean;
  decimals?: number;
};

export function formatPercent(
  value: number | null | undefined,
  opts: FormatOptions = {}
): string {
  const normalized = normalizePercent(value, opts);
  if (normalized === null) return "--";

  const decimals = opts.decimals ?? 1;
  const pct = `${Math.abs(normalized).toFixed(decimals)}%`;

  if (opts.signed) {
    const prefix = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
    return `${prefix}${pct}`;
  }

  return `${normalized.toFixed(decimals)}%`;
}
