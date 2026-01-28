/**
 * Performance Dashboard Page
 * Server-rendered page for performance metrics visualization
 */

import { PerformanceDashboard } from "../components/PerformanceDashboard";

export const metadata = {
  title: "Performance Metrics - Privatinvestor MVP",
  description: "Run performance tracking and bottleneck analysis"
};

export default function PerformancePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-text-primary mb-2">Performance Analytics</h1>
        <p className="text-text-secondary">
          Track scoring run performance, identify bottlenecks, and monitor system health.
        </p>
      </header>

      <PerformanceDashboard />
    </div>
  );
}
