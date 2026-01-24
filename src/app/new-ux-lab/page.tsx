import Link from "next/link";
import { readFileSync } from "fs";
import path from "path";

function loadPrompt(): string {
  try {
    const promptPath = path.join(process.cwd(), "docs", "ux", "new-ux-prompt.md");
    return readFileSync(promptPath, "utf-8");
  } catch {
    return "Prompt not found. Ensure docs/ux/new-ux-prompt.md exists.";
  }
}

export default function NewUxLabPage() {
  const prompt = loadPrompt();

  return (
    <div className="min-h-screen bg-navy-900 text-text-primary px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-text-muted">
              Exploration
            </p>
            <h1 className="text-3xl font-semibold text-text-primary">New UX Lab</h1>
            <p className="text-text-secondary mt-2">
              Parallel route for designing a premium alternative UX. The existing dashboard
              stays untouched; this lab is for drafts, prompts, and prototypes.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-sm text-text-secondary hover:border-navy-500 hover:text-text-primary transition"
          >
            Back to Briefing
          </Link>
        </header>

        <section className="rounded-xl border border-navy-700 bg-navy-800/70 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Prompt (source of truth)</h2>
              <p className="text-sm text-text-secondary mt-1">
                This is the exact LLM brief we iterate on. Copy-paste as needed; keep synced with{" "}
                <code className="bg-navy-900 border border-navy-700 px-1 py-0.5 rounded text-xs">
                  docs/ux/new-ux-prompt.md
                </code>.
              </p>
            </div>
            <Link
              href="https://www.notion.so"
              className="text-xs text-accent-blue hover:underline"
              target="_blank"
            >
              Open reference (Notion inspiration)
            </Link>
          </div>
          <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg bg-navy-900 border border-navy-700 p-4 text-sm leading-relaxed text-text-secondary">
{prompt}
          </pre>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-navy-700 bg-navy-800/70 p-5 space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Next steps</h3>
            <ul className="text-sm text-text-secondary list-disc pl-5 space-y-1">
              <li>Draft layout concepts (Notion-like, command palette first, retro-cards).</li>
              <li>Define Ghost Row + Draft/Dirty behaviors in UI stubs.</li>
              <li>Create comparison hooks to load run JSONs and diff presets.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-navy-700 bg-navy-800/70 p-5 space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Route status</h3>
            <p className="text-sm text-text-secondary">
              This page is a sandbox. Existing pages remain as-is. Add sub-routes under{" "}
              <code className="bg-navy-900 border border-navy-700 px-1 py-0.5 rounded text-xs">/new-ux-lab</code>{" "}
              for specific prototypes (e.g., /new-ux-lab/notion, /new-ux-lab/retro).
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
