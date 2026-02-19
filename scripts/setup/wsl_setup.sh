#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[intrinsic] WSL setup starting..."
echo "[intrinsic] project: $PROJECT_DIR"

cd "$PROJECT_DIR"

./scripts/etl/install_fmp_autostart.sh
./scripts/etl/install_etl_autostart.sh

echo "[intrinsic] Active timers:"
if ! dbus-run-session -- systemctl --user list-timers --all | grep -E "intrinsic-(etl|fmp-autofill)"; then
  true
fi

echo "[intrinsic] WSL setup done."
