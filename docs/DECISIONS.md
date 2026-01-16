# Technical Decisions

This document records key technical decisions made during implementation.

## D001: Ajv over Zod for Schema Validation

**Decision:** Use Ajv instead of Zod for schema validation.

**Rationale:** JSON Schemas are the Source of Truth for this project. Ajv validates JSON directly against JSON Schema specifications, eliminating any translation layer. This ensures the schemas in `schemas/` are authoritative.

**Trade-offs:**
- Pro: Direct validation against JSON Schema spec
- Pro: Type generation from same schemas via json-schema-to-typescript
- Con: Less ergonomic than Zod's chained API

---

## D002: SQLite with better-sqlite3

**Decision:** Use SQLite via better-sqlite3 for data persistence.

**Rationale:**
- Single-user MVP doesn't need PostgreSQL complexity
- No external database server required
- Synchronous API simplifies code
- WAL mode provides good read concurrency

**Trade-offs:**
- Pro: Zero configuration, embedded
- Pro: Single file = easy backup
- Con: No network access (single machine only)
- Con: Limited concurrent writes

---

## D003: Finnhub as Sole Data Provider

**Decision:** Use Finnhub API exclusively, not FMP or Yahoo Finance.

**Rationale:** Master prompt specified Finnhub. Single provider simplifies:
- Rate limiting logic
- Data normalization
- Caching strategy

**Trade-offs:**
- Pro: Consistent data format
- Pro: Simpler implementation
- Con: Single point of failure
- Con: Limited to Finnhub's data coverage

---

## D004: Deterministic Pick of Day

**Decision:** Pick of Day uses SHA256(date + salt) seeded selection.

**Rationale:** Reproducibility is a core requirement. Same date always produces same pick from the same top 5.

**Implementation:**
```typescript
const seed = deterministicHash(runDate + 'POTD');
const index = parseInt(seed.substring(0, 8), 16) % top5.length;
```

---

## D005: Technical Indicators via Library

**Decision:** Use `technicalindicators` npm package.

**Rationale:**
- Well-tested implementations
- Covers all required indicators (SMA, RSI, MACD, ATR, Bollinger)
- No need to implement complex algorithms

**Trade-offs:**
- Pro: Battle-tested code
- Pro: Faster development
- Con: External dependency
- Con: Less control over edge cases

---

## D006: LLM Feature Flag

**Decision:** LLM integration is feature-flagged via ENABLE_LLM env var.

**Rationale:**
- MVP should work without LLM API access
- Template fallback provides baseline functionality
- Allows gradual rollout

**Implementation:**
- `ENABLE_LLM=false` → Template-based text generation
- `ENABLE_LLM=true` + `LLM_PROVIDER=openai|anthropic` → API calls

---

## D007: Median Imputation for Missing Values

**Decision:** Missing fundamental values use universe median or neutral score (50).

**Rationale:**
- Complete analysis required for all symbols
- Median imputation is standard practice
- Neutral score signals uncertainty without biasing ranking

**Trade-offs:**
- Pro: Every symbol gets scored
- Pro: Clearly documented assumptions
- Con: Imputed values may not reflect reality

---

## D008: 60 Requests/Minute Rate Limit

**Decision:** Implement 60 req/min rate limiting for Finnhub.

**Rationale:** Finnhub free tier limit. Exceeding triggers 429 errors.

**Implementation:**
- Sliding window with request timestamps
- Max 5 concurrent requests
- Exponential backoff on 429

---

## D009: Prices as Adjusted by Default

**Decision:** Treat Finnhub candle data as adjusted prices.

**Rationale:**
- Finnhub states they provide adjusted prices
- Technical indicators require adjusted prices for accuracy
- Schema requires `adjusted_price_mode` field

**Flag:** If evidence suggests raw prices, set flag in `data_quality`.
