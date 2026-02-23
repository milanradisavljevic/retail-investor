#!/bin/bash
# ============================================================================
# INTRINSIC systemd Timer Installation Script
# ============================================================================
# Installs and configures the systemd timer for daily ETL execution.
#
# Usage:
#   sudo ./deploy/systemd/install_timer.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
USERNAME="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo ~$USERNAME)

echo "============================================================================"
echo "INTRINSIC systemd Timer Installation"
echo "============================================================================"
echo ""
echo "This script will:"
echo "  1. Create log directory (/var/log/intrinsic)"
echo "  2. Copy service and timer files to /etc/systemd/system/"
echo "  3. Update paths in service file"
echo "  4. Enable and start the timer"
echo ""
echo "Target user: $USERNAME"
echo "Project directory: $PROJECT_DIR"
echo ""

# Confirm installation
read -p "Continue with installation? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 0
fi

# Step 1: Create log directory
echo ""
echo "[1/5] Creating log directory..."
sudo mkdir -p /var/log/intrinsic
sudo chown "$USERNAME:$USERNAME" /var/log/intrinsic
sudo chmod 755 /var/log/intrinsic
echo "✓ Log directory created: /var/log/intrinsic"

# Step 2: Update service file with correct paths
echo ""
echo "[2/5] Preparing service file..."
SERVICE_TEMP=$(mktemp)
sed "s|YOUR_USERNAME|$USERNAME|g" "$SCRIPT_DIR/intrinsic-etl.service" | \
sed "s|/home/YOUR_USERNAME/dev/retail-investor|$PROJECT_DIR|g" > "$SERVICE_TEMP"

# Step 3: Copy files to systemd directory
echo ""
echo "[3/5] Copying service files..."
sudo cp "$SERVICE_TEMP" /etc/systemd/system/intrinsic-etl.service
sudo cp "$SCRIPT_DIR/intrinsic-etl.timer" /etc/systemd/system/intrinsic-etl.timer
rm -f "$SERVICE_TEMP"
echo "✓ Service file installed: /etc/systemd/system/intrinsic-etl.service"
echo "✓ Timer file installed: /etc/systemd/system/intrinsic-etl.timer"

# Step 4: Reload systemd
echo ""
echo "[4/5] Reloading systemd..."
sudo systemctl daemon-reload
echo "✓ systemd reloaded"

# Step 5: Enable and start timer
echo ""
echo "[5/5] Enabling and starting timer..."
sudo systemctl enable intrinsic-etl.timer
sudo systemctl start intrinsic-etl.timer
echo "✓ Timer enabled and started"

# Verification
echo ""
echo "============================================================================"
echo "Installation Complete!"
echo "============================================================================"
echo ""
echo "Timer status:"
systemctl list-timers intrinsic-etl.timer --no-pager || true
echo ""
echo "Service status:"
systemctl status intrinsic-etl.timer --no-pager || true
echo ""
echo "Next scheduled run:"
systemctl list-timers intrinsic-etl.timer --no-pager | grep -E "left|n/a" || true
echo ""
echo "To view logs:"
echo "  tail -f /var/log/intrinsic/etl.log"
echo ""
echo "To run ETL manually:"
echo "  $PROJECT_DIR/scripts/etl/run_daily_etl_orchestrator.sh"
echo ""
echo "============================================================================"
