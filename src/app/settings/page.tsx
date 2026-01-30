import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Settings</p>
          <h1 className="text-2xl font-semibold text-text-primary">Workspace Preferences</h1>
          <p className="text-text-secondary mt-1">Manage API keys, design system, and feature labs.</p>
        </div>
        <Link
          href="/settings/design-system"
          className="px-4 py-2 rounded-lg border border-navy-700 bg-navy-800 text-sm text-text-secondary hover:border-navy-500 hover:text-text-primary transition"
        >
          Design System
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-text-primary">API & Data</h2>
          <p className="text-sm text-text-secondary">Coming soon: connect providers, manage keys, and set rate limits.</p>
        </div>
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-text-primary">Preferences</h2>
          <p className="text-sm text-text-secondary">Customize theme, defaults, and notification preferences.</p>
        </div>
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-5 space-y-3 md:col-span-2">
          <h2 className="text-lg font-semibold text-text-primary">Labs</h2>
          <p className="text-sm text-text-secondary">Experimental areas for internal teams.</p>
          <ul className="text-sm text-text-secondary list-disc pl-5 space-y-1">
            <li>
              <Link href="/settings/design-system" className="text-accent-blue hover:underline">
                Design System / UX Lab
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
