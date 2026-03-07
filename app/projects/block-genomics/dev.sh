#!/bin/bash
# ============================================================================
# Block Genomics — Development Runner
# ============================================================================
# Starts both the API server (port 3100) and the Next.js app (port 3000)
# Usage: ./dev.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$SCRIPT_DIR/api-server"
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
if [ ! -d "$API_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing API server dependencies...${NC}"
  cd "$API_DIR" && npm install
fi

if [ ! -d "$APP_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing Next.js app dependencies...${NC}"
  cd "$APP_DIR" && npm install
fi

# Kill existing processes on our ports
for port in 3000 3100; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}Killing existing process on port $port (PID: $pid)${NC}"
    kill $pid 2>/dev/null || true
    sleep 1
  fi
done

# Start API server in background
echo -e "${GREEN}Starting API server on port 3100...${NC}"
cd "$API_DIR"
npx tsx server.ts &
API_PID=$!

# Give API server time to start
sleep 2

# Start Next.js app
echo -e "${GREEN}Starting Next.js app on port 3000...${NC}"
cd "$APP_DIR"
npx next dev &
APP_PID=$!

echo ""
echo -e "${GREEN}🧬 Block Genomics is running!${NC}"
echo -e "   API:  ${CYAN}http://localhost:3100${NC}"
echo -e "   App:  ${CYAN}http://localhost:3000${NC}"
echo -e "   Health: ${CYAN}http://localhost:3100/health${NC}"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $API_PID 2>/dev/null || true
  kill $APP_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Wait for both processes
wait
