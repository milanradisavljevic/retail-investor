# Studio Workspace UX Specification

## 1. Information Architecture

### Routes (Parallel to Existing)
```
/studio                           → Studio landing (workspace selector)
/studio/[universe]                → Main workspace for a universe
/studio/[universe]/run/[runId]    → Historical run viewer (read-only)
/studio/[universe]/compare        → Multi-run comparison view
/studio/backtest                  → Backtest workspace (separate, focused)
```

### Navigation Model
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] Studio                    ⌘K  [Provider] [User]     │ ← Global header
├──────┬──────────────────────────────────────────────────┬───┤
│      │                                                  │   │
│ Left │            Central Canvas                        │Ins│
│ Rail │         (Results/Visualizations)                 │pec│
│      │                                                  │tor│
│      │                                                  │   │
│ Nav  │                                                  │Ctx│
│ Tree │                                                  │   │
│      │                                                  │   │
│ Run  │                                                  │   │
│ Hist │                                                  │   │
│      │                                                  │   │
└──────┴──────────────────────────────────────────────────┴───┘
```

**Left Rail (240px, collapsible):**
- Universe selector (dropdown or command palette trigger)
- Current run badge (e.g., "2026-01-27 • rocket • 30 picks")
- Run history list (last 10, grouped by date)
- Quick actions: "New analysis", "Compare runs", "Settings"

**Central Canvas (fluid):**
- Primary content area: results table/cards, charts, insights
- Top bar: breadcrumb + view mode (Table/Cards/Insights)
- Bottom: subtle status bar (symbol count, provider, last updated)

**Right Inspector (360px, contextual):**
- Morphs based on selection:
  - No selection: "Strategy Configuration" (preset, weights, diversification)
  - Stock selected: Stock detail inspector
  - Ghost row clicked: Diversification explanation + skipped list
  - Comparison mode: Side-by-side diff inspector
- Always closable (Escape key)

---

## 2. Interaction Design: Progressive Disclosure

### Rule System

**Trigger 1: Universe Selection**
- User picks universe → Inspector shows:
  - Preset selector (5 presets as cards with one-liner explanations)
  - "Custom" option (collapsed by default)
- If "Custom" clicked → Expand weight sliders + diversification caps
- If preset selected → Collapse custom controls, show "Why this preset?" accordion

**Trigger 2: Preset Selection**
- User clicks preset card → Inspector updates:
  - Show preset weights as read-only badges (not sliders)
  - Show "Customize" button (tertiary action)
  - "Run Analysis" button appears (primary action, initially clean state)
- If "Customize" clicked → Switch to custom mode, sliders appear, dirty state triggers

**Trigger 3: Configuration Changes (Dirty State)**
- User adjusts slider/diversification cap → Immediate feedback:
  - Dirty indicator appears in inspector header: "Unsaved changes"
  - Diff summary below: "Changed: Weights (Valuation 25→30), Diversification (Tech cap 25→30%)"
  - "Reset to current run" button appears (secondary action)
  - "Run Analysis" button updates to show estimated cost:
    ```
    [▶ Run Analysis]
    ~1,943 symbols • yfinance • ~8-12 min
    ```
- Draft config stored in localStorage key: `studio:draft:${universe}:${preset || 'custom'}`

**Trigger 4: Ghost Row Click**
- User clicks diversification ghost row → Inspector switches to "Diversification Details" mode:
  - Header: "Why some picks were skipped"
  - Content:
    - Summary: "3 symbols skipped due to sector/industry caps"
    - Grouped list:
      ```
      Technology sector cap reached (30%)
      • AAPL (would be pick #6, score 87.2)
      • MSFT (would be pick #8, score 85.1)

      Healthcare industry cap reached (20%)
      • JNJ (would be pick #12, score 82.4)
      ```
    - Highlight active caps in diversification config section
  - Footer: "Adjust caps" button → jumps to diversification settings in inspector

**Trigger 5: Stock Row Click**
- User clicks stock row → Inspector switches to "Stock Detail" mode:
  - Header: Symbol + name + current price
  - Content: Pillar scores (radial chart), key metrics, price target, evidence summary
  - Footer: "View full analysis" link → opens `/studio/[universe]/stock/[symbol]`

### "Pop Up Only If Needed" Behaviors

**Auto-show Inspector:**
- First visit to workspace (show strategy config)
- Dirty state detected (show config + diff)
- Ghost row clicked (show diversification details)
- Stock row clicked (show stock details)

**Auto-hide Inspector:**
- User presses Escape
- User clicks "Apply and close" after config changes
- User switches to comparison mode (inspector becomes comparison panel)

**Never Auto-run:**
- Configuration changes ONLY update draft state
- "Run Analysis" must be explicitly clicked
- On click, show confirmation if estimated runtime > 5 min:
  ```
  ┌─────────────────────────────────────────┐
  │ Confirm Analysis Run                    │
  ├─────────────────────────────────────────┤
  │ This will score 1,943 symbols using     │
  │ yfinance provider.                      │
  │                                         │
  │ Estimated time: 8-12 minutes            │
  │                                         │
  │ [Cancel]              [▶ Start Run]    │
  └─────────────────────────────────────────┘
  ```

---

## 3. Component Plan

### New Components (Server/Client Split)

**Server Components:**
```typescript
// app/studio/[universe]/page.tsx
export default async function StudioWorkspace({ params }: { params: { universe: string } }) {
  const currentRun = await loadLatestRun(params.universe);
  const runHistory = await loadRunHistory(params.universe, { limit: 10 });
  const universeConfig = await loadUniverseConfig(params.universe);

  return (
    <StudioLayout universe={params.universe}>
      <LeftRail runHistory={runHistory} currentRun={currentRun} />
      <CentralCanvas run={currentRun} universeConfig={universeConfig} />
      <Inspector universeConfig={universeConfig} />
    </StudioLayout>
  );
}

// components/studio/CentralCanvas.tsx (Server Component)
export async function CentralCanvas({ run, universeConfig }: Props) {
  return (
    <div className="canvas">
      <CanvasHeader run={run} />
      <ResultsTable
        selections={run.selections}
        diversificationApplied={run.selections.diversification_applied}
        skippedForDiversity={run.selections.skipped_for_diversity}
      />
    </div>
  );
}
```

**Client Components:**
```typescript
// components/studio/Inspector.tsx ('use client')
'use client';
export function Inspector({ universeConfig }: Props) {
  const [mode, setMode] = useState<'config' | 'stock' | 'diversification'>('config');
  const [draftConfig, setDraftConfig] = useDraft(universeConfig.id);
  const dirty = useMemo(() => compareConfig(draftConfig, currentConfig), [draftConfig]);

  return (
    <aside className="inspector">
      {mode === 'config' && <ConfigInspector draft={draftConfig} dirty={dirty} />}
      {mode === 'stock' && <StockInspector symbol={selectedSymbol} />}
      {mode === 'diversification' && <DiversificationInspector skipped={skippedList} />}
    </aside>
  );
}

// components/studio/ResultsTable.tsx ('use client')
'use client';
export function ResultsTable({ selections, diversificationApplied, skippedForDiversity }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useAtom(selectedSymbolAtom);

  return (
    <table>
      {selections.top30.map((pick, idx) => (
        <>
          <PickRow key={pick.symbol} pick={pick} onClick={() => setSelectedSymbol(pick.symbol)} />

          {/* Ghost row injection: appears where first skip would have occurred */}
          {idx === findFirstSkipIndex(selections.top30, skippedForDiversity) && (
            <GhostRow
              skipped={skippedForDiversity}
              onClick={() => showDiversificationInspector()}
            />
          )}
        </>
      ))}
    </table>
  );
}

// components/studio/GhostRow.tsx ('use client')
'use client';
export function GhostRow({ skipped, onClick }: Props) {
  const summary = groupSkippedReasons(skipped);

  return (
    <tr className="ghost-row" onClick={onClick}>
      <td colSpan={100}>
        <div className="ghost-content">
          <InfoIcon />
          <span>
            {summary.totalCount} {summary.totalCount === 1 ? 'pick' : 'picks'} skipped due to diversification caps
            ({summary.topReason})
          </span>
          <ChevronRightIcon />
        </div>
      </td>
    </tr>
  );
}

// hooks/useDraft.ts
export function useDraft(universeId: string) {
  const key = `studio:draft:${universeId}:${preset || 'custom'}`;
  const [draft, setDraft] = useLocalStorage(key, defaultConfig);

  const reset = useCallback(() => {
    setDraft(currentRunConfig);
  }, [currentRunConfig]);

  return { draft, setDraft, reset, dirty: !isEqual(draft, currentRunConfig) };
}
```

### Reusable from Existing Codebase
- `ScoreGauge` (pillar score visualization)
- `PriceTargetBadge`
- `BacktestChart` (for backtest workspace)
- Data fetching utilities: `loadBacktestData`, universe loaders

---

## 4. State Model

### Client-Side State (localStorage)

**Draft Configuration:**
```typescript
// Key scheme: studio:draft:${universe}:${preset|'custom'}
interface DraftConfig {
  preset: string | null;
  weights: { valuation: number; quality: number; technical: number; risk: number };
  diversification: {
    enabled: boolean;
    sectorCap: number;
    industryCap: number;
  };
  topK: number; // which selection to view (5/10/15/20/30)
  lastModified: string; // ISO timestamp
}

// Example keys:
// "studio:draft:russell2000_full:rocket"
// "studio:draft:sp500:custom"
```

**UI Preferences:**
```typescript
// Key: studio:prefs
interface StudioPrefs {
  leftRailCollapsed: boolean;
  inspectorCollapsed: boolean;
  defaultViewMode: 'table' | 'cards' | 'insights';
  recentUniverses: string[];
}
```

### Server-Derived State (from Run JSON)

**Current Run Config:**
```typescript
// Parsed from data/runs/YYYY-MM-DD__<hash>.json
interface CurrentRunConfig {
  preset: string | null;
  weights: WeightConfig;
  diversification: DiversificationConfig;
  metadata: {
    universe: string;
    provider: string;
    scoringMode: string;
    timestamp: string;
  };
}
```

**Comparison State (derived):**
```typescript
// When comparing Draft vs Current or Run A vs Run B
interface ConfigDiff {
  weightsChanged: boolean;
  weightsDelta: { pillar: string; from: number; to: number }[];
  diversificationChanged: boolean;
  diversificationDelta: { setting: string; from: any; to: any }[];
  topKChanged: boolean;
}

function compareConfig(a: DraftConfig, b: CurrentRunConfig): ConfigDiff {
  // Deep diff logic
}
```

### Ghost Row Logic (derived)

```typescript
// Calculate where to inject ghost row
function findFirstSkipIndex(
  picks: SymbolScore[],
  skipped: SkippedForDiversity[]
): number | null {
  if (!skipped.length) return null;

  // Find the rank of the first skipped symbol
  const firstSkipped = skipped.reduce((min, s) =>
    s.wouldBeRank < min ? s.wouldBeRank : min
  , Infinity);

  // Find insertion index in the displayed picks array
  // (inject right before the first pick with rank > firstSkipped)
  return picks.findIndex(p => p.rank > firstSkipped);
}

function groupSkippedReasons(skipped: SkippedForDiversity[]): {
  totalCount: number;
  topReason: string;
  groups: { reason: string; symbols: SkippedForDiversity[] }[];
} {
  const groups = Object.entries(
    skipped.reduce((acc, s) => {
      const key = s.reason; // e.g., "Technology sector cap reached (30%)"
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {} as Record<string, SkippedForDiversity[]>)
  ).map(([reason, symbols]) => ({ reason, symbols }));

  return {
    totalCount: skipped.length,
    topReason: groups[0].reason,
    groups
  };
}
```

---

## 5. Visual System

### Typography Scale (Tailwind Config Extension)
```javascript
// tailwind.config.js additions
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
      },
    },
  },
};
```

### Color Tokens (Dark-First)
```javascript
// Semantic color system (HSL for easy manipulation)
const colors = {
  // Surfaces
  'surface-0': 'hsl(240 8% 6%)',    // Page background
  'surface-1': 'hsl(240 8% 9%)',    // Card/panel background
  'surface-2': 'hsl(240 8% 12%)',   // Hover states
  'surface-3': 'hsl(240 8% 15%)',   // Active/selected states

  // Borders
  'border-subtle': 'hsl(240 8% 18%)',
  'border-default': 'hsl(240 8% 24%)',
  'border-emphasis': 'hsl(240 8% 32%)',

  // Text
  'text-primary': 'hsl(240 8% 96%)',
  'text-secondary': 'hsl(240 8% 72%)',
  'text-tertiary': 'hsl(240 8% 56%)',
  'text-placeholder': 'hsl(240 8% 40%)',

  // Accent (blue for primary actions)
  'accent-50': 'hsl(210 100% 96%)',
  'accent-500': 'hsl(210 90% 58%)',  // Primary action buttons
  'accent-600': 'hsl(210 90% 52%)',  // Hover
  'accent-700': 'hsl(210 90% 46%)',  // Active

  // Semantic
  'success': 'hsl(142 76% 48%)',
  'warning': 'hsl(38 92% 58%)',
  'error': 'hsl(0 72% 58%)',
  'info': 'hsl(199 89% 58%)',

  // Ghost row (subtle info state)
  'ghost-bg': 'hsl(199 40% 12%)',
  'ghost-border': 'hsl(199 40% 22%)',
  'ghost-text': 'hsl(199 60% 72%)',
};
```

### Spacing System
```javascript
// Use Tailwind defaults but enforce consistent usage:
// 4px base unit (space-1 = 4px, space-2 = 8px, etc.)

// Component spacing guidelines:
// - Inspector padding: px-6 py-4 (24px/16px)
// - Card padding: p-4 (16px)
// - Section gaps: space-y-6 (24px)
// - Input groups: space-y-3 (12px)
// - Inline elements: gap-2 (8px)
```

### Surfaces & Elevation
```css
/* No shadows (flat design), use borders + subtle background shifts */
.surface-raised {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
}

.surface-interactive {
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  transition: all 0.15s ease;
}

.surface-interactive:hover {
  background: var(--surface-2);
  border-color: var(--border-emphasis);
}

.surface-interactive:active {
  background: var(--surface-3);
}

/* Focus states (keyboard accessibility) */
.surface-interactive:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}
```

### Component Templates

**Ghost Row (Notion-style inline callout):**
```css
.ghost-row {
  background: linear-gradient(
    to right,
    hsl(199 40% 10%) 0%,
    hsl(199 40% 12%) 100%
  );
  border-top: 1px solid var(--ghost-border);
  border-bottom: 1px solid var(--ghost-border);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ghost-row:hover {
  background: linear-gradient(
    to right,
    hsl(199 40% 12%) 0%,
    hsl(199 40% 14%) 100%
  );
  border-color: hsl(199 40% 28%);
}

.ghost-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: var(--ghost-text);
  font-size: 0.875rem;
}

.ghost-content svg {
  width: 1rem;
  height: 1rem;
  opacity: 0.8;
}

.ghost-content span {
  flex: 1;
}

.ghost-content svg:last-child {
  opacity: 0.5;
}
```

**Dirty State Indicator (in Inspector header):**
```tsx
<div className="inspector-header">
  <h3>Strategy Configuration</h3>
  {dirty && (
    <div className="dirty-indicator">
      <span className="dirty-badge">Unsaved changes</span>
      <button onClick={reset} className="reset-btn">Reset</button>
    </div>
  )}
</div>

// Styles:
.dirty-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: hsl(38 60% 20%);
  border: 1px solid hsl(38 60% 30%);
  border-radius: 0.25rem;
  color: hsl(38 100% 76%);
  font-size: 0.75rem;
  font-weight: 500;
}

.dirty-badge::before {
  content: '';
  width: 0.375rem;
  height: 0.375rem;
  background: hsl(38 92% 58%);
  border-radius: 50%;
}

.reset-btn {
  padding: 0.25rem 0.5rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.reset-btn:hover {
  color: var(--text-primary);
}
```

**Run Analysis Button (with estimated cost):**
```tsx
<button className="run-analysis-btn" disabled={!dirty}>
  <PlayIcon />
  <span>Run Analysis</span>
  {dirty && estimatedCost && (
    <span className="cost-estimate">
      ~{estimatedCost.symbolCount.toLocaleString()} symbols • {estimatedCost.provider} • {estimatedCost.timeCategory}
    </span>
  )}
</button>

// Styles:
.run-analysis-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 1.25rem;
  background: var(--accent-500);
  border-radius: 0.375rem;
  color: white;
  font-weight: 500;
  transition: all 0.15s ease;
}

.run-analysis-btn:hover:not(:disabled) {
  background: var(--accent-600);
}

.run-analysis-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cost-estimate {
  font-size: 0.75rem;
  font-weight: 400;
  opacity: 0.9;
}
```

### Empty States
```tsx
// No run history
<div className="empty-state">
  <ArchiveIcon />
  <h3>No runs yet</h3>
  <p>Start by selecting a universe and running your first analysis</p>
  <button className="primary-action">New Analysis</button>
</div>

// No diversification skips
<div className="empty-state-inline">
  <CheckCircleIcon />
  <span>All top picks included • No diversification caps triggered</span>
</div>
```

### Loading States
```tsx
// Run in progress
<div className="loading-state">
  <Spinner />
  <div className="loading-info">
    <h3>Running analysis...</h3>
    <p>Scoring 1,943 symbols with yfinance provider</p>
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${progress}%` }} />
    </div>
    <p className="eta">~7 min remaining</p>
  </div>
</div>
```

### Error States
```tsx
// Run failed
<div className="error-state">
  <AlertTriangleIcon />
  <h3>Analysis failed</h3>
  <p>{errorMessage}</p>
  <div className="error-actions">
    <button className="secondary">View logs</button>
    <button className="primary">Retry</button>
  </div>
</div>
```

---

## 6. Data Fetching Patterns

### Pattern 1: Server Component Direct Read
```typescript
// app/studio/[universe]/page.tsx
import { readRunFile } from '@/lib/runs';
import fs from 'fs/promises';
import path from 'path';

async function loadLatestRun(universe: string) {
  const runsDir = path.join(process.cwd(), 'data/runs');
  const files = await fs.readdir(runsDir);

  // Find latest run for this universe
  const runFiles = files
    .filter(f => f.endsWith('.json') && !f.endsWith('_llm.json'))
    .sort()
    .reverse();

  for (const file of runFiles) {
    const run = await readRunFile(path.join(runsDir, file));
    if (run.metadata.universe === universe) {
      return run;
    }
  }

  return null;
}

export default async function StudioPage({ params }) {
  const run = await loadLatestRun(params.universe);
  return <StudioWorkspace run={run} />;
}
```

### Pattern 2: API Route for Client-Side Fetching
```typescript
// app/api/studio/runs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loadRunHistory } from '@/lib/studio/data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const universe = searchParams.get('universe');
  const limit = parseInt(searchParams.get('limit') || '10');

  const runs = await loadRunHistory(universe, { limit });
  return NextResponse.json(runs);
}

// Client component usage:
'use client';
import useSWR from 'swr';

export function RunHistory({ universe }: Props) {
  const { data: runs, error } = useSWR(
    `/api/studio/runs?universe=${universe}&limit=10`,
    fetcher
  );

  if (error) return <ErrorState error={error} />;
  if (!runs) return <LoadingState />;

  return <RunHistoryList runs={runs} />;
}
```

### Pattern 3: Server Utility + Server Component
```typescript
// lib/studio/data.ts (server-side utility)
import fs from 'fs/promises';
import path from 'path';
import { RunV1SchemaJson } from '@/types/generated';

export async function loadRunHistory(
  universe: string | null,
  options: { limit?: number } = {}
): Promise<RunV1SchemaJson[]> {
  const runsDir = path.join(process.cwd(), 'data/runs');
  const files = await fs.readdir(runsDir);

  const runs = await Promise.all(
    files
      .filter(f => f.endsWith('.json') && !f.endsWith('_llm.json'))
      .sort()
      .reverse()
      .slice(0, options.limit || 50)
      .map(async f => {
        const content = await fs.readFile(path.join(runsDir, f), 'utf-8');
        return JSON.parse(content) as RunV1SchemaJson;
      })
  );

  return universe
    ? runs.filter(r => r.metadata.universe === universe)
    : runs;
}

// Server component usage:
import { loadRunHistory } from '@/lib/studio/data';

export default async function LeftRail({ universe }: Props) {
  const history = await loadRunHistory(universe, { limit: 10 });

  return (
    <aside>
      <RunHistoryList runs={history} />
    </aside>
  );
}
```

---

## 7. Build Plan (3 Incremental Milestones)

### Milestone 1: Core Workspace Shell (Ship Independently)
**Goal:** Minimal viable studio workspace with read-only current run display.

**Scope:**
- Route: `/studio` landing + `/studio/[universe]` workspace
- Components:
  - `StudioLayout` (left rail + canvas, no inspector yet)
  - `LeftRail` (universe selector, current run badge, minimal history)
  - `CentralCanvas` (results table, no ghost rows yet)
  - `CanvasHeader` (breadcrumb, view mode toggle placeholder)
- Data:
  - Server component loads latest run JSON
  - Read-only display of selections (top30)
  - No draft state, no configuration yet
- Visual:
  - Implement color tokens, typography, surface styles
  - Basic table layout with hover states

**Deliverables:**
- Users can navigate to `/studio/russell2000_full` and see latest run results
- Left rail shows run history (last 5 runs)
- Table displays picks with score, pillars, price target
- Clicking rows does nothing yet (inspector not built)

**Implementation Time:** 1-2 days

---

### Milestone 2: Configuration + Draft State (Ship Independently)
**Goal:** Add inspector with strategy configuration and draft/dirty state handling.

**Scope:**
- Components:
  - `Inspector` (right panel, collapsible)
  - `ConfigInspector` (preset selector + custom controls)
  - `PresetCard` (5 presets with explanations)
  - `WeightSliders` (4 pillar weights)
  - `DiversificationControls` (sector/industry caps)
  - `DirtyIndicator` (in inspector header)
  - `RunAnalysisButton` (with estimated cost)
- State:
  - `useDraft` hook (localStorage persistence)
  - `compareConfig` utility (diff logic)
  - Draft config schema matches current run config schema
- Interactions:
  - Preset selection → show read-only weights + "Customize" button
  - Customize → expand sliders, trigger dirty state
  - Slider adjustment → update draft, show diff, enable "Run Analysis"
  - "Reset to current run" → clear draft, revert to last run config
  - "Run Analysis" → POST to `/api/studio/run` (stub for now)
- Visual:
  - Inspector slide-in animation (300ms ease)
  - Dirty badge with orange accent
  - Cost estimate typography (mono font for numbers)

**Deliverables:**
- Users can select presets and customize weights
- Draft state persists across page reloads (localStorage)
- Dirty indicator shows exactly what changed (diff summary)
- "Run Analysis" button shows estimated cost before triggering
- Clicking button shows confirmation modal (if runtime > 5 min)

**Implementation Time:** 2-3 days

---

### Milestone 3: Diversification Ghost Rows + Contextual Inspector (Ship Independently)
**Goal:** Add diversification visibility and contextual inspector modes.

**Scope:**
- Components:
  - `GhostRow` (inline callout in results table)
  - `DiversificationInspector` (inspector mode for skipped picks)
  - `StockInspector` (inspector mode for stock details)
- Logic:
  - `findFirstSkipIndex` utility (calculate ghost row position)
  - `groupSkippedReasons` utility (aggregate skip reasons)
  - Inspector mode switching (config/diversification/stock)
- Interactions:
  - Ghost row appears where first skip would have occurred
  - Ghost row shows summary: "3 picks skipped (Technology sector cap)"
  - Click ghost row → inspector switches to diversification mode
  - Diversification mode shows grouped list of skipped symbols with scores
  - Highlight active caps in diversification config section
  - Click stock row → inspector switches to stock detail mode
  - Stock mode shows pillar breakdown, metrics, evidence summary
  - Escape key → return to config mode
- Visual:
  - Ghost row uses subtle blue gradient background
  - Diversification inspector uses info accent color
  - Stock inspector uses radial chart for pillar scores

**Deliverables:**
- Ghost row appears in picks table when diversification skips occur
- Ghost row is visually distinct but low-noise (Notion-style callout)
- Clicking ghost row reveals full breakdown in inspector
- Clicking stock row shows stock details in inspector
- Inspector morphs smoothly between modes (fade transition)
- All interactions keyboard-accessible (Tab, Enter, Escape)

**Implementation Time:** 2-3 days

---

### Post-Milestones (Future Work)
- **Comparison Mode:** `/studio/[universe]/compare` with side-by-side run diffs
- **Backtest Workspace:** `/studio/backtest` with integrated backtest configuration
- **Command Palette:** ⌘K search/navigation across runs, universes, stocks
- **Export/Share:** Generate shareable links, PDF reports, CSV exports
- **Historical Run Viewer:** `/studio/[universe]/run/[runId]` with read-only details

---

## 8. ASCII Wireframes

### Main Workspace (Default State)
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Studio                                   ⌘K  [yfinance] [@user]          │
├───────────┬──────────────────────────────────────────────────────────┬───────────┤
│           │                                                          │           │
│ Universe  │ [←] Studio / Russell 2000 Full            [Table][Cards]│ Strategy  │
│ ┌───────┐ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ Config    │
│ │Russell│ │                                                          │           │
│ │2000   │ │ Top 30 Picks • 2026-01-27 • rocket preset               │ ┌───────┐ │
│ └───────┘ │                                                          │ │Rocket │ │
│           │ ┌──────────────────────────────────────────────────────┐ │ │       │ │
│ Current   │ │ #   Symbol   Score  Val Qual Tech Risk  Target  Δ   │ │ │Growth-│ │
│ Run       │ ├──────────────────────────────────────────────────────┤ │ │focused│ │
│           │ │ 1   AAPL     92.3   88  95   94   91    $185   +12% │ │ └───────┘ │
│ 2026-01-27│ │ 2   MSFT     91.1   85  96   93   89    $420   +8%  │ │           │
│ rocket    │ │ 3   GOOGL    89.7   82  91   92   88    $145   +5%  │ │ Weights   │
│ 30 picks  │ │ 4   META     88.5   79  89   95   84    $520   +15% │ │ ━━━━━━━━━ │
│           │ │ 5   NVDA     87.9   76  92   94   82    $850   +18% │ │           │
│ ───────   │ │                                                      │ │ Val  40%  │
│           │ │ [ℹ] 3 picks skipped • Diversification caps     [→]  │ │ Qual 30%  │
│ Run       │ │                                                      │ │ Tech 20%  │
│ History   │ │ 6   TSLA     86.2   74  88   91   80    $240   +10% │ │ Risk 10%  │
│           │ │ ... (24 more)                                        │ │           │
│ 2026-01-26│ │                                                      │ │ [Customize│
│ deep-value│ └──────────────────────────────────────────────────────┘ │  Weights] │
│ 30 picks  │                                                          │           │
│           │ 1,943 symbols • yfinance • Updated 8 min ago            │ [▶ Run    │
│ 2026-01-25│                                                          │  Analysis]│
│ rocket    │                                                          │           │
│ 30 picks  │                                                          │           │
│           │                                                          │           │
└───────────┴──────────────────────────────────────────────────────────┴───────────┘
```

### Workspace with Dirty State (Configuration Changed)
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Studio                                   ⌘K  [yfinance] [@user]          │
├───────────┬──────────────────────────────────────────────────────────┬───────────┤
│           │                                                          │           │
│ Universe  │ [←] Studio / Russell 2000 Full            [Table][Cards]│ Strategy  │
│ ┌───────┐ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ Config    │
│ │Russell│ │                                                          │           │
│ │2000   │ │ Top 30 Picks • 2026-01-27 • rocket preset               │ ⚠ Unsaved │
│ └───────┘ │                                                          │ changes   │
│           │ ┌──────────────────────────────────────────────────────┐ │ [Reset]   │
│ Current   │ │ #   Symbol   Score  Val Qual Tech Risk  Target  Δ   │ │           │
│ Run       │ ├──────────────────────────────────────────────────────┤ │ Changed:  │
│           │ │ 1   AAPL     92.3   88  95   94   91    $185   +12% │ │ • Weights │
│ 2026-01-27│ │ 2   MSFT     91.1   85  96   93   89    $420   +8%  │ │   Val 40→ │
│ rocket    │ │ ... (results from LAST run, not dirty config)        │ │   45%     │
│ 30 picks  │ │                                                      │ │ • Div caps│
│           │ └──────────────────────────────────────────────────────┘ │   Tech 30→│
│ ───────   │                                                          │   35%     │
│           │                                                          │           │
│ Run       │                                                          │ Custom    │
│ History   │                                                          │ Weights   │
│           │                                                          │ ━━━━━━━━━ │
│ 2026-01-26│                                                          │           │
│ deep-value│                                                          │ Val  45% ←│
│ 30 picks  │                                                          │ ────█──── │
│           │                                                          │           │
│ 2026-01-25│                                                          │ Qual 30%  │
│ rocket    │                                                          │ ────█──── │
│ 30 picks  │                                                          │           │
│           │                                                          │ Tech 15%  │
│           │                                                          │ ──█────── │
│           │                                                          │           │
│           │                                                          │ Risk 10%  │
│           │                                                          │ ──█────── │
│           │                                                          │           │
│           │                                                          │ Diversity │
│           │                                                          │ ━━━━━━━━━ │
│           │                                                          │ Tech 35% ←│
│           │                                                          │ ────█──── │
│           │                                                          │           │
│           │                                                          │ [▶ Run    │
│           │                                                          │  Analysis]│
│           │                                                          │ ~1,943    │
│           │                                                          │ symbols • │
│           │                                                          │ 8-12 min  │
└───────────┴──────────────────────────────────────────────────────────┴───────────┘
```

### Ghost Row Clicked → Diversification Inspector
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Studio                                   ⌘K  [yfinance] [@user]          │
├───────────┬──────────────────────────────────────────────────────────┬───────────┤
│           │                                                          │           │
│ Universe  │ [←] Studio / Russell 2000 Full            [Table][Cards]│ [X] Close │
│ ┌───────┐ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│ │Russell│ │                                                          │ Why some  │
│ │2000   │ │ Top 30 Picks • 2026-01-27 • rocket preset               │ picks were│
│ └───────┘ │                                                          │ skipped   │
│           │ ┌──────────────────────────────────────────────────────┐ │           │
│ Current   │ │ #   Symbol   Score  Val Qual Tech Risk  Target  Δ   │ │ 3 symbols │
│ Run       │ ├──────────────────────────────────────────────────────┤ │ skipped   │
│           │ │ 1   AAPL     92.3   88  95   94   91    $185   +12% │ │ due to    │
│ 2026-01-27│ │ 2   MSFT     91.1   85  96   93   89    $420   +8%  │ │ sector/   │
│ rocket    │ │ 3   GOOGL    89.7   82  91   92   88    $145   +5%  │ │ industry  │
│ 30 picks  │ │ 4   META     88.5   79  89   95   84    $520   +15% │ │ caps.     │
│           │ │ 5   NVDA     87.9   76  92   94   82    $850   +18% │ │           │
│ ───────   │ ╞══════════════════════════════════════════════════════╡ │ ━━━━━━━━━ │
│           │ │ ℹ️ 3 picks skipped • Diversification caps      [→] │ │           │
│ Run       │ ╞══════════════════════════════════════════════════════╡ │ Technology│
│ History   │ │ 6   TSLA     86.2   74  88   91   80    $240   +10% │ │ sector cap│
│           │ │ ... (24 more)                                        │ │ reached   │
│ 2026-01-26│ │                                                      │ │ (30%)     │
│ deep-value│ └──────────────────────────────────────────────────────┘ │           │
│ 30 picks  │                                                          │ • INTC    │
│           │                                                          │   (pick #6│
│ 2026-01-25│                                                          │   score   │
│ rocket    │                                                          │   86.1)   │
│ 30 picks  │                                                          │ • AMD     │
│           │                                                          │   (pick #9│
│           │                                                          │   score   │
│           │                                                          │   84.7)   │
│           │                                                          │           │
│           │                                                          │ Healthcare│
│           │                                                          │ industry  │
│           │                                                          │ cap (20%) │
│           │                                                          │           │
│           │                                                          │ • JNJ     │
│           │                                                          │   (pick #8│
│           │                                                          │   score   │
│           │                                                          │   85.2)   │
│           │                                                          │           │
│           │                                                          │ [Adjust   │
│           │                                                          │  Caps →]  │
└───────────┴──────────────────────────────────────────────────────────┴───────────┘
```

---

## 9. Rationale Summary

**Why this design works:**

1. **Progressive Disclosure Executed Properly:**
   - Controls only appear when needed (custom mode, diversification details)
   - Ghost rows provide contextual "why" without cluttering default view
   - Inspector morphs based on user action (not always-visible bloat)

2. **Draft/Dirty State Solves Configuration Anxiety:**
   - Users can explore without fear of losing current run config
   - Clear diff summary shows exactly what changed
   - Estimated cost makes "run" consequences transparent
   - No auto-run prevents accidental expensive operations

3. **Diversification Visibility Without Noise:**
   - Ghost row appears in-context (where skip occurred)
   - Summary text is scannable, details on-demand
   - Groups skip reasons intelligently (not overwhelming)

4. **Keyboard-First Professional UX:**
   - Command palette (⌘K) for power users
   - Focus states, Escape to close, Tab navigation
   - Feels like Linear/Notion (tools engineers actually use)

5. **Incrementally Shippable:**
   - Each milestone delivers standalone value
   - No "big bang" rewrite required
   - Can run parallel to existing dashboard initially

6. **Visual Identity Distinct from Bloomberg:**
   - Flat design, subtle borders (not shadows/glassmorphism)
   - Editorial typography (not dashboard wallpaper)
   - Accent colors used sparingly (blue for action, orange for warning)
   - Monospace for numbers (financial data tradition)

This design feels **intentional, not vibecoded** because every interaction has a clear trigger, every state has a visual representation, and every component serves the workflow (not just filling space).

