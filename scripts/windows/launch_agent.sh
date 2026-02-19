#!/usr/bin/env bash

set -u

check_only=0
if [ "${1:-}" = "--check" ]; then
  check_only=1
  shift
fi

agent="${1:-}"
repo="$HOME/dev/retail-investor"

bootstrap_path() {
  export PATH="$HOME/.local/bin:$PATH"

  if [ -f "$HOME/.local/bin/env" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.local/bin/env" >/dev/null 2>&1 || true
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
  fi

  # Fallback: add installed node bins even if nvm init was skipped.
  for bin_dir in "$HOME"/.nvm/versions/node/*/bin; do
    [ -d "$bin_dir" ] && export PATH="$bin_dir:$PATH"
  done
}

bootstrap_path

if [ -z "$agent" ]; then
  echo "[intrinsic] missing agent name"
  exec bash -i
fi

if ! cd "$repo"; then
  echo "[intrinsic] repo not found: $repo"
  exec bash -i
fi

if ! command -v "$agent" >/dev/null 2>&1; then
  echo "[intrinsic] agent not found in PATH: $agent"
  exec bash -i
fi

if [ "$check_only" -eq 1 ]; then
  command -v "$agent"
  exit 0
fi

echo "[intrinsic] starting $agent in $repo"
"$agent"
status=$?

echo "[intrinsic] $agent exited with code $status"
exec bash -i
