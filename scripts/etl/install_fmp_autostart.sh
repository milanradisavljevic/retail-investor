#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_NAME="intrinsic-fmp-autofill.service"
TIMER_NAME="intrinsic-fmp-autofill.timer"

mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/$SERVICE_NAME" <<EOF
[Unit]
Description=INTRINSIC FMP Coverage Autofill
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/env bash -lc 'cd "$PROJECT_DIR" && PYTHONUNBUFFERED=1 && if [ -x .venv/bin/python ]; then .venv/bin/python scripts/etl/fmp_autofill_boot.py; else python3 scripts/etl/fmp_autofill_boot.py; fi'
Nice=10

[Install]
WantedBy=default.target
EOF

cat > "$UNIT_DIR/$TIMER_NAME" <<'EOF'
[Unit]
Description=Run INTRINSIC FMP Coverage Autofill on startup

[Timer]
OnStartupSec=2min
OnUnitActiveSec=12h
Persistent=true
AccuracySec=1min
Unit=intrinsic-fmp-autofill.service

[Install]
WantedBy=timers.target
EOF

run_systemctl_user() {
  if systemctl --user "$@" 2>/dev/null; then
    return 0
  fi
  dbus-run-session -- systemctl --user "$@"
}

run_systemctl_user daemon-reload
run_systemctl_user enable --now "$TIMER_NAME"

echo "Installed and enabled: $TIMER_NAME"
echo "Service file: $UNIT_DIR/$SERVICE_NAME"
echo "Timer file: $UNIT_DIR/$TIMER_NAME"
echo ""
echo "Next runs:"
if ! run_systemctl_user list-timers --all | grep -F "intrinsic-fmp-autofill"; then
  true
fi
