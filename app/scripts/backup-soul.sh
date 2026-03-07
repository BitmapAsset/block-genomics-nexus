#!/bin/bash
# Pepe Soul & Memory Backup Script
# Runs every 30 minutes via cron
# 
# Backs up to TWO locations:
#   1. Internal: workspace/backups/soul/ (within OpenClaw)
#   2. External: ~/OpenClaw Files/Pepe Backup/ (survives OpenClaw reinstall)
#   3. Daily chat export: ~/OpenClaw Files/Chat Backups/

WORKSPACE="/Users/gravity/.openclaw/workspace"
INTERNAL_DIR="$WORKSPACE/backups/soul"
EXTERNAL_DIR="/Users/gravity/.openclaw-backup/Pepe Backup"
CHAT_DIR="/Users/gravity/.openclaw-backup/Chat Backups"
SESSIONS_DIR="/Users/gravity/.openclaw/agents/main/sessions"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
TODAY=$(date +"%Y-%m-%d")

# ═══ CORE SOUL FILES ═══
FILES=(
  "SOUL.md"
  "IDENTITY.md"
  "USER.md"
  "MEMORY.md"
  "AGENTS.md"
  "TOOLS.md"
  "HEARTBEAT.md"
)

# Internal backup (within workspace)
mkdir -p "$INTERNAL_DIR/latest" "$INTERNAL_DIR/snapshots/$TIMESTAMP"
for file in "${FILES[@]}"; do
  [ -f "$WORKSPACE/$file" ] && cp "$WORKSPACE/$file" "$INTERNAL_DIR/latest/"
done
[ -d "$WORKSPACE/memory" ] && cp -r "$WORKSPACE/memory" "$INTERNAL_DIR/latest/"
cp -r "$INTERNAL_DIR/latest/"* "$INTERNAL_DIR/snapshots/$TIMESTAMP/"

# Cleanup old snapshots (keep last 24)
cd "$INTERNAL_DIR/snapshots" && ls -t | tail -n +25 | xargs rm -rf 2>/dev/null

# ═══ EXTERNAL BACKUP (survives OpenClaw reinstall) ═══
mkdir -p "$EXTERNAL_DIR/memory"
for file in "${FILES[@]}"; do
  [ -f "$WORKSPACE/$file" ] && cp "$WORKSPACE/$file" "$EXTERNAL_DIR/"
done
[ -d "$WORKSPACE/memory" ] && cp -r "$WORKSPACE/memory/"* "$EXTERNAL_DIR/memory/"

# Copy main session transcript
MAIN_SESSION=$(python3 -c "
import json
with open('${SESSIONS_DIR}/sessions.json','r') as f: d=json.load(f)
print(d.get('agent:main:main',{}).get('sessionId',''))
" 2>/dev/null)
[ -n "$MAIN_SESSION" ] && [ -f "$SESSIONS_DIR/$MAIN_SESSION.jsonl" ] && \
  cp "$SESSIONS_DIR/$MAIN_SESSION.jsonl" "$EXTERNAL_DIR/main-session.jsonl"

# ═══ DAILY CHAT EXPORT ═══
mkdir -p "$CHAT_DIR"
CHAT_FILE="$CHAT_DIR/${TODAY}_session.md"
if [ -n "$MAIN_SESSION" ] && [ -f "$SESSIONS_DIR/$MAIN_SESSION.jsonl" ]; then
  python3 -c "
import json
from datetime import datetime, timedelta

today = '${TODAY}'
chat_file = '${CHAT_FILE}'
session_file = '${SESSIONS_DIR}/${MAIN_SESSION}.jsonl'

# Also match UTC dates (PST = UTC-8, so today in PST spans two UTC dates)
utc_today = today
# Parse to get tomorrow too
from datetime import date
d = date.fromisoformat(today)
tomorrow = (d + timedelta(days=1)).isoformat()

msgs = []
with open(session_file, 'r') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            entry = json.loads(line)
            ts = entry.get('timestamp', '')
            if not ts: continue
            # Check if timestamp falls within today (PST) — UTC dates today or tomorrow
            if today not in str(ts) and tomorrow not in str(ts): continue
            
            msg = entry.get('message', {})
            role = msg.get('role', 'unknown')
            # Skip tool results and tool calls
            if role == 'toolResult': continue
            
            content_parts = msg.get('content', [])
            if isinstance(content_parts, str):
                text = content_parts
            elif isinstance(content_parts, list):
                texts = []
                for c in content_parts:
                    if isinstance(c, dict) and c.get('type') == 'text':
                        texts.append(c.get('text', ''))
                text = '\n'.join(t for t in texts if t)
            else:
                continue
            
            text = text.strip()
            if not text or len(text) < 2: continue
            if len(text) > 3000:
                text = text[:3000] + '... [truncated]'
            
            time_str = str(ts)[:19].replace('T', ' ')
            label = 'GRAVITY' if role == 'user' else 'PEPE' if role == 'assistant' else role.upper()
            msgs.append(f'### [{label}] {time_str}\n{text}\n')
        except: pass

if msgs:
    with open(chat_file, 'w') as f:
        f.write(f'# Chat Backup — {today}\n\n')
        f.write(f'Messages: {len(msgs)} | Exported: {datetime.now().isoformat()}\n\n---\n\n')
        f.write('\n---\n\n'.join(msgs))
    print(f'Chat export: {len(msgs)} messages')
else:
    print(f'No messages for {today}')
" 2>&1
fi

echo "Backup completed: $TIMESTAMP"
