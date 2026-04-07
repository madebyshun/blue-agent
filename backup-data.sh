#!/bin/bash
BACKUP_DIR="/Users/congson/.openclaw/workspace/blocky-builder-bot/data/backups"
mkdir -p "$BACKUP_DIR"
cp /Users/congson/.openclaw/workspace/blocky-builder-bot/data/users.json "$BACKUP_DIR/users-$(date +%Y%m%d-%H%M).json"
# Keep only last 48 backups (24h)
ls -t "$BACKUP_DIR"/users-*.json | tail -n +49 | xargs rm -f 2>/dev/null
echo "Backup done: $(date)"
