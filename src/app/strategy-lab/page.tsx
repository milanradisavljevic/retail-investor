import { getLatestRun } from "@/lib/runLoader";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import StrategyLabClient from "./StrategyLabClient";

export default function StrategyLabPage() {
  const latest = getLatestRun();
  const run: RunV1SchemaJson | null = latest?.run ?? null;

  return <StrategyLabClient latestRun={run} />;
}
