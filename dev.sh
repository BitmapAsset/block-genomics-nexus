#!/bin/bash
# ============================================================================
# Block Genomics — Development Runner
# ============================================================================
# Starts the Next.js app (port 3000).
#
# The legacy api-server (port 3100) is SUPERSEDED: app/ serves those endpoints
# itself, nothing in this repo calls port 3100, and it is neither deployed nor
# covered by CI. It is no longer installed or started by default — its dependency
# tree pulls `elliptic`, unmaintained since 2024-11 with open advisories, and a
# routine `./dev.sh` has no reason to put that on a developer's machine.
# See api-server/README.md.
#
# Usage: ./dev.sh                          # app only
#        BG_LEGACY_API_SERVER=1 ./dev.sh   # also start the legacy api-server
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$SCRIPT_DIR/api-server"
APP_DIR="$SCRIPT_DIR/app"
LEGACY_API="${BG_LEGACY_API_SERVER:-0}"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🧬 Block Genomics — Dev Mode 🧬     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check dependencies
if [ "$LEGACY_API" = "1" ] && [ ! -d "$API_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing legacy API server dependencies...${NC}"
  cd "$API_DIR" && npm install
fi

if [ ! -d "$APP_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing Next.js app dependencies...${NC}"
  cd "$APP_DIR" && npm install
fi

# Kill existing processes on our ports. Port 3100 is cleared either way, so a
# legacy server left running from an earlier session does not linger.
for port in 3000 3100; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}Killing existing process on port $port (PID: $pid)${NC}"
    kill $pid 2>/dev/null || true
    sleep 1
  fi
done

API_PID=""
if [ "$LEGACY_API" = "1" ]; then
  echo -e "${YELLOW}Starting LEGACY api-server on port 3100 (superseded — see api-server/README.md)...${NC}"
  cd "$API_DIR"
  npx tsx server.ts &
  API_PID=$!
  sleep 2
fi

# Start Next.js app
echo -e "${GREEN}Starting Next.js app on port 3000...${NC}"
cd "$APP_DIR"
npx next dev &
APP_PID=$!

echo ""
echo -e "${GREEN}🧬 Block Genomics is running!${NC}"
echo -e "   App:  ${CYAN}http://localhost:3000${NC}"
echo -e "   API:  ${CYAN}http://localhost:3000/api/v1${NC}"
if [ -n "$API_PID" ]; then
  echo -e "   Legacy API: ${CYAN}http://localhost:3100${NC} (health: ${CYAN}http://localhost:3100/health${NC})"
fi
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  kill $APP_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Wait for both processes
wait
