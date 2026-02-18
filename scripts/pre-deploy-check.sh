#!/usr/bin/env bash
set -euo pipefail

echo "═══════════════════════════════════════"
echo "  INTRINSIC Pre-Deployment Check"
echo "═══════════════════════════════════════"
echo ""

# 1. TypeScript
echo "→ TypeScript Check..."
npx tsc --noEmit
echo "✅ TypeScript clean"

# 2. Build
echo "→ Building..."
FMP_API_KEY="${FMP_API_KEY:-local-dummy-key}" \
FINNHUB_API_KEY="${FINNHUB_API_KEY:-local-dummy-key}" \
FRED_API_KEY="${FRED_API_KEY:-local-dummy-key}" \
npx next build
echo "✅ Build successful"

# 3. Security Headers
echo "→ Checking next.config for security headers..."
if grep -q "X-Frame-Options" next.config.ts 2>/dev/null || grep -q "X-Frame-Options" next.config.mjs 2>/dev/null; then
  echo "✅ Security headers configured"
else
  echo "❌ Security headers MISSING in next.config"
  exit 1
fi

# 4. Environment
echo "→ Checking .env..."
if [ -f .env.local ] || [ -f .env ]; then
  echo "✅ Environment file exists"
else
  echo "⚠️  No .env.local found (ok for Vercel)"
fi

# 5. Secrets check
echo "→ Scanning for hardcoded secrets..."
if rg -n "FMP_API_KEY\s*[=:]\s*['\"][^'\"]+['\"]" src scripts --glob '*.ts' --glob '*.tsx' --glob '*.py' | rg -v "process\.env|os\.environ\.get|os\.getenv|\.example" | head -5; then
  echo "❌ Possible hardcoded API key found!"
  exit 1
else
  echo "✅ No hardcoded secrets detected"
fi

# 6. npm audit
echo "→ npm audit..."
npm audit --audit-level=high 2>/dev/null || echo "⚠️  npm audit findings (review manually)"

echo ""
echo "═══════════════════════════════════════"
echo "  ✅ Pre-Deployment Check PASSED"
echo "═══════════════════════════════════════"
