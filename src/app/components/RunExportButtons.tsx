"use client";

import type { RunV1SchemaJson } from "@/types/generated/run_v1";

export interface CsvRow {
  symbol: string;
  companyName: string;
  total: number;
  fundamental: number;
  technical: number;
  pillar_valuation: number;
  pillar_quality: number;
  pillar_technical: number;
  pillar_risk: number;
  current_price: number | null;
  fair_value: number | null;
  target_sell_price: number | null;
  expected_return_pct: number | null;
  holding_period_months: number | null;
  confidence: "high" | "medium" | "low" | null;
  requires_deep_analysis: boolean | null;
}

interface Props {
  run: RunV1SchemaJson;
  csvRows: CsvRow[];
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: CsvRow[]): string {
  const headers: Array<keyof CsvRow> = [
    "symbol",
    "companyName",
    "total",
    "fundamental",
    "technical",
    "pillar_valuation",
    "pillar_quality",
    "pillar_technical",
    "pillar_risk",
    "current_price",
    "fair_value",
    "target_sell_price",
    "expected_return_pct",
    "holding_period_months",
    "confidence",
    "requires_deep_analysis",
  ];

  const lines = rows.map((row) =>
    headers.map((key) => escapeCsv(row[key])).join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

function triggerDownload(content: string, fileName: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function RunExportButtons({ run, csvRows }: Props) {
  const handleJson = () => {
    triggerDownload(JSON.stringify(run, null, 2), `${run.run_id}.json`, "application/json");
  };

  const handleCsv = () => {
    triggerDownload(toCsv(csvRows), `${run.run_id}.csv`, "text/csv;charset=utf-8;");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleJson}
        className="text-sm px-3 py-2 rounded-lg border border-navy-700 bg-navy-800 text-text-secondary hover:text-text-primary"
      >
        Download run.json
      </button>
      <button
        type="button"
        onClick={handleCsv}
        className="text-sm px-3 py-2 rounded-lg border border-navy-700 bg-navy-800 text-text-secondary hover:text-text-primary"
      >
        Download CSV
      </button>
    </div>
  );
}
