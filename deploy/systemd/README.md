# INTRINSIC systemd Timer Setup

This directory contains systemd service and timer files for running the INTRINSIC ETL pipeline automatically.

## Files

- `intrinsic-etl.service` - systemd service definition
- `intrinsic-etl.timer` - systemd timer definition (daily at 06:00 UTC)
- `install_timer.sh` - Installation script

## Installation

### Quick Install

```bash
# Run the installation script
sudo ./deploy/systemd/install_timer.sh
```

### Manual Installation

1. **Update placeholders in service file:**
   ```bash
   sudo nano /etc/systemd/system/intrinsic-etl.service
   # Replace YOUR_USERNAME with your actual username
   # Update WorkingDirectory and ExecStart paths
   ```

2. **Copy files to systemd directory:**
   ```bash
   sudo cp intrinsic-etl.service /etc/systemd/system/
   sudo cp intrinsic-etl.timer /etc/systemd/system/
   ```

3. **Create log directory:**
   ```bash
   sudo mkdir -p /var/log/intrinsic
   sudo chown YOUR_USERNAME:YOUR_USERNAME /var/log/intrinsic
   ```

4. **Reload systemd:**
   ```bash
   sudo systemctl daemon-reload
   ```

5. **Enable and start timer:**
   ```bash
   sudo systemctl enable intrinsic-etl.timer
   sudo systemctl start intrinsic-etl.timer
   ```

## Verification

```bash
# Check timer status
systemctl list-timers | grep intrinsic

# Check service status
systemctl status intrinsic-etl.service

# View logs
tail -f /var/log/intrinsic/etl.log
```

## Configuration

### Environment Variables

Set these in your `.env` or `.env.local` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `ETL_UNIVERSE` | `russell2000_full` | Universe to process |
| `ENABLE_SEC_SYNC` | `false` | Enable SEC sync step |
| `ENABLE_QUALITY_OBSERVATORY` | `false` | Enable quality observatory |
| `FMP_API_KEY` | - | FMP API key (required for FMP load) |
| `LOG_DIR` | `$PROJECT_DIR/logs/etl` | Custom log directory |

### Timer Schedule

Default: Daily at 06:00 UTC

To change the schedule, edit `intrinsic-etl.timer`:

```ini
[Timer]
# Examples:
# Every 6 hours
OnCalendar=*-*-* 00/6:00:00

# Every day at 18:00 UTC
OnCalendar=*-*-* 18:00:00

# Every Monday at 03:00 UTC
OnCalendar=Mon *-*-* 03:00:00
```

## Troubleshooting

### Timer not running

```bash
# Check if timer is enabled
systemctl is-enabled intrinsic-etl.timer

# Check timer status
systemctl status intrinsic-etl.timer

# View timer details
systemctl cat intrinsic-etl.timer
```

### ETL failing

```bash
# Check logs
tail -100 /var/log/intrinsic/etl.log

# Check status file
cat /path/to/project/data/etl-status.json

# Run manually for debugging
./scripts/etl/run_daily_etl_orchestrator.sh --universe russell2000_full
```

### Permission issues

```bash
# Ensure log directory exists and is writable
sudo mkdir -p /var/log/intrinsic
sudo chown $USER:$USER /var/log/intrinsic

# Ensure project directories are writable
chmod -R u+w /path/to/project/data
chmod -R u+w /path/to/project/logs
```

## Uninstall

```bash
# Stop and disable timer
sudo systemctl stop intrinsic-etl.timer
sudo systemctl disable intrinsic-etl.timer

# Remove service files
sudo rm /etc/systemd/system/intrinsic-etl.service
sudo rm /etc/systemd/system/intrinsic-etl.timer

# Reload systemd
sudo systemctl daemon-reload

# Remove timer files
sudo systemctl reset-failed
```
