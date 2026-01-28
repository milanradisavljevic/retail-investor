import Link from "next/link";

export default function NewUxLabPage() {
  return (
    <div className="min-h-screen bg-navy-900 text-text-primary px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-text-muted">
              UX Laboratory
            </p>
            <h1 className="text-3xl font-semibold text-text-primary">Studio Workspace</h1>
            <p className="text-text-secondary mt-2 max-w-2xl">
              A professional, Notion/Linear-inspired alternative interface for deep stock analysis.
              Features progressive disclosure, contextual inspector panels, and interactive configuration.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-sm text-text-secondary hover:border-navy-500 hover:text-text-primary transition"
          >
            Back to Briefing
          </Link>
        </header>

        <section className="rounded-xl border border-accent-blue/30 bg-accent-blue/5 p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-text-primary mb-2">All Milestones Complete!</h2>
              <p className="text-text-secondary text-sm mb-4">
                The Studio Workspace is fully functional with all planned features from the original UX specification.
                Three-panel layout, configuration management, and contextual inspector modes are ready to use.
              </p>
              <Link
                href="/new-ux-lab/studio"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg text-sm font-medium transition"
              >
                <span>Launch Studio Workspace</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-navy-700 bg-navy-800/70 p-5 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🎨</span>
              <h3 className="text-lg font-semibold text-text-primary">Design Philosophy</h3>
            </div>
            <ul className="text-sm text-text-secondary space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-accent-green mt-0.5">✓</span>
                <span>Progressive disclosure - controls appear only when needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-green mt-0.5">✓</span>
                <span>Flat design with subtle borders (no shadows)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-green mt-0.5">✓</span>
                <span>Keyboard-first interaction patterns</span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-navy-700 bg-navy-800/70 p-5 space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Milestones</h3>
            <ul className="text-sm text-text-secondary space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-accent-green">✓</span>
                <div>
                  <div className="font-medium text-text-primary">Milestone 1: Core Workspace Shell</div>
                  <div className="text-xs text-text-tertiary">Layout, results table, run history</div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-green">✓</span>
                <div>
                  <div className="font-medium text-text-primary">Milestone 2: Configuration + Draft State</div>
                  <div className="text-xs text-text-tertiary">Inspector, presets, sliders, dirty state</div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-green">✓</span>
                <div>
                  <div className="font-medium text-text-primary">Milestone 3: Ghost Rows + Context</div>
                  <div className="text-xs text-text-tertiary">Diversification insights, stock details, inspector modes</div>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="rounded-xl border border-navy-700 bg-navy-800/70 p-5">
          <h3 className="text-lg font-semibold text-text-primary mb-3">Implementation Status</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Studio Layout</div>
                <div className="text-text-secondary">Three-panel layout with left rail, central canvas, and header</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Results Table</div>
                <div className="text-text-secondary">Displays top picks with pillar scores, price targets, and upside</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Run History</div>
                <div className="text-text-secondary">Left rail shows recent runs for the selected universe</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Inspector Panel</div>
                <div className="text-text-secondary">Right panel with strategy configuration, preset selection, and weight sliders</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Draft State Management</div>
                <div className="text-text-secondary">localStorage persistence, dirty detection, and configuration diff display</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Preset System</div>
                <div className="text-text-secondary">5 pre-configured strategies plus custom weights with validation</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Ghost Rows</div>
                <div className="text-text-secondary">Inline callouts in results table showing diversification skips - click for details</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Contextual Inspector Modes</div>
                <div className="text-text-secondary">Inspector panel morphs: Stock details (click row) or Diversification (click ghost row)</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-accent-green">✓</span>
              <div>
                <div className="text-text-primary font-medium">Interactive Results Table</div>
                <div className="text-text-secondary">Click any stock to see pillar breakdown, price target, and data quality metrics</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
