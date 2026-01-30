# Retail Investor MVP - Project Context

**Last Updated:** 2026-01-28

## What You're Working On

This is a quantitative stock analysis platform for private retail investors. 
We combine deterministic scoring (Valuation, Quality, Technical, Risk) with 
comprehensive backtesting to generate daily investment briefings.

**Tech Stack:**
- Next.js 15 (App Router)
- TypeScript (strict mode)
- SQLite (better-sqlite3) for caching
- Python (yfinance) for historical data
- Recharts for visualizations

**Data Sources:**
- Primary: YFinance API
- Fallback: Finnhub (legacy, being phased out)
- Coverage: Russell 2000, S&P 500, International indices

---

## Current Project Phase

**Phase:** Stock Detail View Implementation + Performance Tracking
**Priority:** Performance measurement before feature additions
**Status:** 85% complete (core scoring + backtesting done)

---

## Coding Standards

### TypeScript
- Strict mode enabled
- No `any` types (use `unknown` if necessary)
- Prefer interfaces over types for objects
- Use Zod for runtime validation on API boundaries

### Styling
- Tailwind CSS only (no custom CSS files except globals.css)
- Dark Finance Theme:
  - Background: `bg-navy-900`, `bg-navy-800`
  - Borders: `border-navy-700`
  - Text: `text-text-primary` (white), `text-text-secondary` (gray-300)
  - Accents: `accent-blue` (actions), `accent-gold` (highlights), `accent-orange` (warnings)
- No shadows (use borders + subtle background shifts)
- Monospace font (JetBrains Mono) for numbers/scores

### File Organization
```
src/
  app/              # Next.js routes
  components/       # React components (client + server)
  lib/              # Utilities, helpers
  scoring/          # Scoring engine logic
  providers/        # Data provider adapters
  hooks/            # Custom React hooks
scripts/            # CLI tools, maintenance scripts
data/
  runs/             # Daily run outputs (JSON)
  backtesting/      # Backtest results
  historical/       # YFinance CSV files
  performance/      # Performance metrics (NEW)
```

### Data Flow
1. **Daily Run:** CLI triggers scoring engine → fetches data → scores symbols → selects top picks → writes JSON to data/runs/
2. **UI:** Server components load latest run → render dashboard
3. **Backtesting:** Python script reads historical CSVs → runs strategy simulation → outputs metrics

---

## Key Principles

1. **Deterministic:** No randomness, same inputs = same outputs
2. **Offline-First:** All data cached locally, works without internet (except initial fetch)
3. **Performance-Critical:** Target <15min for Russell 2000 full run (1,943 symbols)
4. **Privacy-Focused:** No user tracking, no external analytics
5. **Incremental:** Ship small features, iterate based on validation

---

## Common Patterns

### Loading Data
```typescript
// Always use getLatestRunFile() from @/run/files
import { getLatestRunFile } from '@/run/files';

const latestRun = getLatestRunFile();
if (!latestRun) {
  // Handle no runs case
}
```

### Error Handling
```typescript
// Always wrap provider calls in try-catch
try {
  const data = await provider.fetchFundamentals(symbol);
} catch (error) {
  logger.error({ symbol, error }, 'Failed to fetch fundamentals');
  // Use fallback or skip symbol
}
```

### Performance Logging
```typescript
// Use pino logger with structured data
logger.info({
  symbols: symbolCount,
  duration_ms: elapsed,
  cache_hit_rate: cacheHits / totalRequests
}, 'Operation completed');
```

---

## Known Issues & Workarounds

### Issue 1: SQLite Readonly Errors
**Problem:** Concurrent reads sometimes fail with "readonly database"
**Workaround:** Use WAL mode: `db.pragma('journal_mode = WAL')`
**Status:** Being fixed in current sprint

### Issue 2: YFinance Rate Limiting
**Problem:** 2000 requests/hour limit from Yahoo Finance
**Mitigation:** 
- Cache with long TTL (14 days for fundamentals)
- Request throttling (100ms between calls)
- Fallback to Finnhub if quota exceeded

### Issue 3: Historical Data Staleness
**Problem:** CSV files are static (2020-2024), don't auto-update
**Solution:** Monthly rolling update script (in development)

---

## Testing Strategy

### After Each Implementation
1. Run locally: `npm run dev`
2. Test happy path + edge cases
3. Check console for errors
4. Validate performance impact
5. Update CHANGELOG.md
6. Git commit with conventional commits format

### Manual Test Checklist
- [ ] UI renders correctly (no hydration errors)
- [ ] Dark theme consistent
- [ ] Data accuracy (spot-check 3-5 symbols)
- [ ] Performance acceptable (<2s page load)
- [ ] Mobile responsive (if applicable)
- [ ] No TypeScript errors (`npm run build`)

---

## When Stuck

1. **Data Schema Questions:** Check `schemas/*.json` (JSON Schema definitions)
2. **Type Errors:** Run `npm run generate:types` (regenerates from schemas)
3. **Provider Errors:** Check `src/providers/` for adapter implementations
4. **Scoring Logic:** See `src/scoring/engine.ts` (main orchestrator)
5. **Ask:** If unclear, request clarification in your response

---

## Current Sprint Tasks

**In Progress:**
- [ ] Performance Tracking System (Claude Code)
- [ ] Stock Detail View - Score Forensics (Gemini)

**Next Up:**
- [ ] Performance Timeline Chart (Qwen)
- [ ] Peer Comparison Table (Codex)
- [ ] Price Target Enhancement (Claude Code)

**Backlog:**
- [ ] Anomaly Detection Research
- [ ] LLM Integration (multi-provider)
- [ ] Forward Testing Dashboard

---

## Important Context Files

- `CHANGELOG.md` - All technical changes documented here
- `README.md` - High-level project overview
- `ux.md` - Design vision document (reference, not for immediate implementation)
- `docs/ASSUMPTIONS.md` - Design decisions and trade-offs

---

## Questions to Ask Before Starting

1. "Do I need to read any files to understand the current implementation?"
2. "Are there existing components I should reuse?"
3. "What's the expected data schema for this feature?"
4. "Should this be a Server Component or Client Component?"
5. "Are there performance implications I should consider?"

---

**Remember:** We prioritize shipping working features over perfect code. 
Iterate, validate, improve. Document all decisions in CHANGELOG.md.
```

---

## How to Use This in Prompts

**Option A: Reference File Directly**
```
Before starting, read PROJECT_CONTEXT.md for project overview, coding standards, and current sprint context.

[Your specific task instructions here]
```

**Option B: Inline Key Context**
```
CONTEXT:
You're working on the Retail Investor MVP, a quantitative stock analysis platform.
- Tech: Next.js 15, TypeScript, SQLite
- Theme: Dark Finance (navy backgrounds, accent-blue actions)
- Current Phase: Stock Detail View Implementation
- Performance Critical: Target <15min Russell 2000 runs

See PROJECT_CONTEXT.md for full standards.

[Your specific task instructions here]
```

---

## Empfehlung

1. **Erstelle PROJECT_CONTEXT.md** im Root deines Repos
2. **Bei jedem Prompt:** Füge am Anfang hinzu:
```Update regelmäßig: Nach jedem Sprint-Abschluss aktualisierst du "Current Sprint Tasks"
   Read PROJECT_CONTEXT.md for project overview and coding standards.
