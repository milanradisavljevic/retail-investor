# Retail Investor MVP - Development Roadmap
Last Updated: 2026-01-30

> Hinweis: `PROJECT_CONTEXT.md` wurde nicht gefunden; diese Roadmap basiert auf den aktuellen Implementierungen, Repository-Status und Laufzeitergebnissen.

## Executive Summary
- Product completion roughly 86%: stock detail briefings, performance tracker, and real-time run progress are live; company names offline coverage shipped.
- Next milestone (Feb 2): validate Run Progress Indicator end-to-end in Strategy Lab and close low-score regression.
- Launch readiness ~30%: core analytics proven, but auth/payment/legal still missing; branding partially done.
- Performance bottleneck: data_fetch phase = 98.5% of runtime (latest performance log); scoring/selection already efficient.
- Key risks: 57 open TypeScript errors (mostly tests), placeholder logic in peer analysis, and missing async loading/error boundaries.

## Feature Completion Status
| Feature | Status | Completion | Notes |
|---------|--------|------------|-------|
| Stock Detail View | ✅ DONE | 100% | Score Forensics, Performance Timeline, Peer Comparison, Price Target |
| Performance Tracker | ✅ DONE | 100% | CLI + Dashboard + Auto-tracking |
| Run Progress Indicator | ✅ DONE | 100% | SSE live bar with ETA/cache hit rate; wired into Strategy Lab |
| Company Names (offline) | ✅ DONE | 100% | Extracts from run data |
| Navigation Cleanup | ✅ DONE | 100% | Dashboard/Strategy Lab/Settings |
| Automated Daily Runs | ❌ TODO | 0% | GitHub Actions or cron |
| Anomaly Detection | ❌ TODO | 0% | Research phase not started |
| Logo Design | ❌ TODO | 0% | Needs Gemini Imagen |
| Low Scores Debug | ⚠️ IN PROGRESS | 50% | Investigation report drafted (2026-01-30), fix pending |

## Roadmap

### Short Term (This Week · Jan 30 – Feb 2)
- Run Progress Indicator QA (Kimi) – 1 day: real run smoke test, retry logic, empty-state copy.
- Low Scores remediation (Qwen) – 0.5 day: relax sector sample threshold to 5, review technical indicator configs, rerun validation.
- Company Names coverage check (Codex) – 0.5 day: verify all universes, fill gaps if any.
- Logo prompt & selection (Gemini) – 0.5 day: generate candidates, pick final, export SVG+PNG, wire into layout.

### Mid Term (Next 2 Weeks · Feb 3 – Feb 14)
- Automated Daily Runs: GitHub Actions workflow, notifications, error handling, secrets hygiene.
- Anomaly Detection research + prototype: rule vs ML comparison; backtest on historical runs; surface alerts in UI.
- Monte Carlo Optimization: worker-based parallelization; target 75 min → 20 min for Russell 2000; UI toggle.
- Data Pipeline upkeep: rolling 5y window, automated refresh, data-quality monitors.

### Long Term (Feb 15+)
- Monetization stack: Clerk auth, Stripe payments, tiered access, usage tracking.
- Forward Testing Dashboard: compare recommendations vs live performance to build trust.
- LLM-powered insights: news sentiment, ask-anything, scenario analysis (multi-provider).
- Export enhancements: PDF/CSV/Excel and API endpoints for integrations.
- Infrastructure: Vercel frontend, job backend separation, CDN, monitoring/alerting (Sentry + perf).

## Technical Debt Assessment
- Metrics: 57 TypeScript errors (`npx tsc --noEmit`), 4 TODO comments, placeholders spotted in ScoreForensics and history filters.
- High Priority
  - Fix TypeScript errors (tests and strict checks).
  - React 19/Recharts peer warning; verify compatibility before shipping charts broadly.
  - Replace placeholder analysis functions (getSector/getMarketCap in peer analysis) with real data.
  - Add error boundaries and loading states for long async operations (briefing pages, Strategy Lab).
- Medium Priority
  - Hard-coded config values and duplicated logic in components.
  - Standardize error handling and input validation.
- Low Priority
  - Long functions (>100 lines) and naming inconsistencies; improve comments where clarity is low.

## Performance Optimization Opportunities
- Latest performance log: data_fetch phase consumes 98.49% of runtime; bottleneck flagged by tracker.
- Quick wins (<1 day): batch provider calls, increase cache TTL if hit rate <50%, precompute sector medians, parallelize fetches with `Promise.all`.
- Medium (1–3 days): request pooling, in-memory LRU cache, optimize scoring hot paths, add provider-level metrics to pinpoint slow endpoints.
- Large (1+ weeks): Monte Carlo parallel workers, server-side prefetch for large universes, incremental builds, distributed processing for huge universes.

## User-Facing Improvements
- Pain points addressed: company names present; stock detail briefing live; progress indicator live.
- Active: clarify low-score changes (delta vs last run), add tooltips, ensure responsive layouts.
- Upcoming:
  - Phase 1 (next week): run progress polish, score delta explanations, tooltip coverage.
  - Phase 2 (next 2 weeks): watchlist, email alerts for price targets, run comparison tool.
  - Phase 3 (month 2): mobile app (React Native), browser extension, Slack/Discord bot.

## Monetization Readiness Checklist
- Must Have (blockers): auth, Stripe payments, tiered access, legal disclaimers, privacy/ToS, forward-testing proof. Status: not started.
- Should Have (important): branding, marketing site, demo video, support channel, analytics/tracking, email automation. Status: partial (branding started).
- Nice to Have: referral program, developer API, white-label, educational content. Status: pending.
- Current readiness: ~30%; minimum launch in ~4 weeks (bare-bones), realistic 8 weeks for polished March 2026 release.

## Immediate Action Items (Next 3 Days)
1. Run Progress Indicator: live run QA + retry logic; ensure Strategy Lab refresh on completion.
2. Low Scores: apply sector threshold change, rerun analysis, document fix.
3. Performance Tracker: validate latest data_fetch bottleneck, propose batching plan.

## Success Metrics
- Run duration <15 min for Russell 2000 with caching; cache hit rate >70%.
- Real-time progress visible with ETA and failure count for all runs.
- All universes carry company names with zero missing entries.
- Zero critical TypeScript errors in CI; automated daily runs green for 7 days.
