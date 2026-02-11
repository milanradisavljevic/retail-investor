#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEX_FILE="$ROOT_DIR/docs/INVESTOR_EXECUTIVE_SUMMARY.tex"
OUT_DIR="$ROOT_DIR/.tmp/latex"

if [[ ! -f "$TEX_FILE" ]]; then
  echo "Missing TeX file: $TEX_FILE" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

pdflatex -interaction=nonstopmode -halt-on-error -output-directory "$OUT_DIR" "$TEX_FILE" >/dev/null
pdflatex -interaction=nonstopmode -halt-on-error -output-directory "$OUT_DIR" "$TEX_FILE" >/dev/null

echo "PDF generated:"
echo "  $OUT_DIR/INVESTOR_EXECUTIVE_SUMMARY.pdf"
