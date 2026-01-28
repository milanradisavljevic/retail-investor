"use client";

/**
 * Performance Dashboard Component
 * Displays run performance metrics, trends, and bottlenecks
 */

import { useEffect, useState } from "react";
import type { PerformanceMetrics } from "@/lib/performance/tracker";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface PerformanceSummary {
  recent_runs: PerformanceMetrics[];
  averages: {
    total_duration_ms: number;
    data_fetch_ms: number;
    scoring_ms: number;
    selection_ms: number;
    persistence_ms: number;
    cache_hit_rate: number;
    symbols_per_run: number;
  };
  trends: {
    date: string;
    duration_ms: number;
    cache_hit_rate: number;
    symbol_count: number;
  }[];
}

export function PerformanceDashboard() {
  const [data, setData] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/performance/summary")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-text-secondary">Loading performance data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 p-4">
        <p className="text-sm text-accent-red">Failed to load performance data: {error}</p>
      </div>
    );
  }

  if (!data || data.recent_runs.length === 0) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-8 text-center">
        <p className="text-text-secondary mb-2">No performance data available yet</p>
        <p className="text-sm text-text-muted">Run some scoring operations to generate metrics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Performance Metrics</h2>
        <p className="text-sm text-text-secondary">
          Tracking {data.recent_runs.length} recent runs • Average {formatDuration(data.averages.total_duration_ms)} per run
        </p>
      </header>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Avg Total Duration"
          value={formatDuration(data.averages.total_duration_ms)}
          icon="⏱️"
        />
        <MetricCard
          title="Avg Data Fetch"
          value={formatDuration(data.averages.data_fetch_ms)}
          subtitle={`${((data.averages.data_fetch_ms / data.averages.total_duration_ms) * 100).toFixed(0)}% of total`}
          icon="📊"
        />
        <MetricCard
          title="Avg Scoring"
          value={formatDuration(data.averages.scoring_ms)}
          subtitle={`${((data.averages.scoring_ms / data.averages.total_duration_ms) * 100).toFixed(0)}% of total`}
          icon="🎯"
        />
        <MetricCard
          title="Cache Hit Rate"
          value={`${(data.averages.cache_hit_rate * 100).toFixed(1)}%`}
          icon="💾"
          highlight={data.averages.cache_hit_rate < 0.5 ? "warning" : data.averages.cache_hit_rate > 0.8 ? "success" : undefined}
        />
      </div>

      {/* Recent Runs Table */}
      <div className="rounded-xl border border-navy-700 bg-navy-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-navy-700">
          <h3 className="text-lg font-semibold text-text-primary">Recent Runs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy-900">
              <tr className="text-text-muted uppercase tracking-wider text-xs">
                <th className="text-left py-3 px-6 font-semibold">Run ID</th>
                <th className="text-left py-3 px-4">Universe</th>
                <th className="text-right py-3 px-4">Symbols</th>
                <th className="text-right py-3 px-4">Total Time</th>
                <th className="text-right py-3 px-4">Cache Hit %</th>
                <th className="text-left py-3 px-6">Bottleneck</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {data.recent_runs.map(run => {
                const cacheHitRate = run.phases.data_fetch && 'cache_hits' in run.phases.data_fetch
                  ? ((run.phases.data_fetch as any).cache_hits / run.total_symbols) * 100
                  : 0;

                return (
                  <tr key={run.run_id} className="hover:bg-navy-700/50 transition-colors">
                    <td className="py-3 px-6 font-mono text-xs text-text-primary">
                      {run.run_id.slice(0, 20)}...
                    </td>
                    <td className="py-3 px-4 text-text-secondary">{run.universe}</td>
                    <td className="text-right py-3 px-4 text-text-secondary">{run.total_symbols}</td>
                    <td className="text-right py-3 px-4 text-text-primary font-semibold">
                      {formatDuration(run.totals.wall_clock_duration_ms)}
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className={`font-semibold ${cacheHitRate > 80 ? 'text-accent-green' : cacheHitRate > 50 ? 'text-accent-gold' : 'text-accent-red'}`}>
                        {cacheHitRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-6">
                      {run.bottlenecks.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-accent-orange">⚠️</span>
                          <span className="text-text-secondary">
                            {run.bottlenecks[0].phase}
                          </span>
                          <span className="text-xs text-accent-orange">
                            ({run.bottlenecks[0].percentage_of_total.toFixed(0)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Performance Trends Chart */}
      {data.trends.length > 0 && (
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Performance Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                style={{ fontSize: 12 }}
              />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: 12 }}
                tickFormatter={(value) => formatDuration(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#f8fafc"
                }}
                formatter={(value: any) => [formatDuration(value), "Duration"]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="duration_ms"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
                name="Duration"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cache Hit Rate Trend */}
      {data.trends.length > 0 && (
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Cache Hit Rate Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                style={{ fontSize: 12 }}
              />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: 12 }}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                domain={[0, 1]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#f8fafc"
                }}
                formatter={(value: any) => [`${(value * 100).toFixed(1)}%`, "Cache Hit Rate"]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="cache_hit_rate"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: "#22c55e", r: 4 }}
                name="Cache Hit Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: string;
  highlight?: "success" | "warning" | "error";
}

function MetricCard({ title, value, subtitle, icon, highlight }: MetricCardProps) {
  const borderColor = highlight === "success"
    ? "border-accent-green/30"
    : highlight === "warning"
    ? "border-accent-gold/30"
    : highlight === "error"
    ? "border-accent-red/30"
    : "border-navy-700";

  const bgColor = highlight === "success"
    ? "bg-accent-green/5"
    : highlight === "warning"
    ? "bg-accent-gold/5"
    : highlight === "error"
    ? "bg-accent-red/5"
    : "bg-navy-800";

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-5 transition-colors`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-text-muted uppercase tracking-wider font-semibold">{title}</div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-text-primary mb-1">{value}</div>
      {subtitle && <div className="text-xs text-text-secondary">{subtitle}</div>}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}
