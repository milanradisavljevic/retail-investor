import { getLatestRun, getRecentRuns } from "@/lib/runLoader";
import { redirect } from "next/navigation";

export default async function StudioLandingPage() {
  const latestRun = getLatestRun();

  if (!latestRun) {
    return (
      <div className="min-h-screen bg-surface-0 text-text-primary flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-surface-1 border border-border-subtle flex items-center justify-center">
            <svg className="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">
            No Runs Available
          </h2>
          <p className="text-text-secondary mb-6">
            Run a daily analysis to generate your first studio workspace.
          </p>
          <code className="inline-block bg-surface-1 border border-border-default px-4 py-2 rounded-lg text-sm font-mono text-accent-500">
            npm run run:daily
          </code>
        </div>
      </div>
    );
  }

  const universeName = latestRun.run.universe.definition.name;
  // Encode the universe name for URL
  const encodedName = encodeURIComponent(universeName);
  redirect(`/new-ux-lab/studio/${encodedName}`);
}
