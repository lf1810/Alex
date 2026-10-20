#!/bin/zsh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="visual-workbench"

if /usr/bin/screen -ls | /usr/bin/grep -q "\.${SESSION}[[:space:]]"; then
  exit 0
fi

/usr/bin/screen -dmS "$SESSION" /bin/zsh -lc "cd '$ROOT' && exec node scripts/workbench-supervisor.mjs"
