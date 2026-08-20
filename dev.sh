#!/bin/bash
# ============================================================================
# Block Genomics — Development Runner
# ============================================================================
# Starts the Next.js app (port 3000), which serves both the UI and the public
# API under /api/v1.
#
# Usage: ./dev.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"

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
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing Next.js app dependencies...${NC}"
  cd "$APP_DIR" && npm install
fi

# Kill any existing process on our port
pid=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$pid" ]; then
  echo -e "${YELLOW}Killing existing process on port 3000 (PID: $pid)${NC}"
  kill $pid 2>/dev/null || true
  sleep 1
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
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $APP_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

wait
