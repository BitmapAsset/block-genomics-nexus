# Guardian Monitor Skill

Monitor and command your Block Genomics Guardian AI agents from OpenClaw.

## Overview

This skill lets your OpenClaw agent act as the **owner/manager** of Guardian Shell agents running on your Bitcoin blocks in the Block Genomics Nexus. The Guardian handles visitors autonomously; you manage it through natural conversation with your OpenClaw agent.

## Setup

1. Go to your Guardian config on blockgenomics.io
2. Click "Connect OpenClaw" → sign with your wallet
3. Copy the monitor token (shown once)
4. Add to your OpenClaw workspace `TOOLS.md`:

```
### Block Genomics Guardians
- Block 720143: monitor token = <token>
- API: https://blockgenomics.io/api/v1/guardian/monitor
```

Or set env var: `BG_MONITOR_TOKEN_<BLOCK>=<token>`

## API Reference

All requests require header: `Authorization: Bearer <monitor-token>`
Base URL: `https://blockgenomics.io/api/v1/guardian/monitor`

### Check Status
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/command" -X POST \
  -H "Content-Type: application/json" \
  -d '{"guardianId":"ID","command":"get_status"}'
```

### Read Conversations
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/conversations?guardianId=ID&limit=20"
```

### Read Events (escalations, flags)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/events?guardianId=ID&type=all&limit=20"
```

### Get Activity Summary
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/summary?guardianId=ID&hours=24"
```

### Update Personality
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/command" -X POST \
  -H "Content-Type: application/json" \
  -d '{"guardianId":"ID","command":"update_personality","params":{"personality":"New personality"}}'
```

### Update Soul
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/command" -X POST \
  -H "Content-Type: application/json" \
  -d '{"guardianId":"ID","command":"update_soul","params":{"soulMd":"New soul content"}}'
```

### Pause / Resume
```bash
# Pause
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/command" -X POST \
  -H "Content-Type: application/json" \
  -d '{"guardianId":"ID","command":"pause"}'

# Resume
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/command" -X POST \
  -H "Content-Type: application/json" \
  -d '{"guardianId":"ID","command":"resume"}'
```

## Usage Patterns

When your human says things like:
- "Check on my Guardian" → GET /summary + GET /conversations
- "What's happening on block 720143?" → GET /summary
- "Tell my Guardian to be friendlier" → POST /command update_personality
- "Pause my Guardian" → POST /command pause
- "Show me recent visitor conversations" → GET /conversations
- "Any escalations?" → GET /events?type=escalation
- "Update Guardian's greeting to mention Bitcoin history" → POST /command update_soul

## Security

- Monitor tokens are scoped to one guardian only
- Tokens don't expire but can be revoked anytime from blockgenomics.io
- Never share tokens in chat or logs
- Store tokens in TOOLS.md (private workspace) or env vars
