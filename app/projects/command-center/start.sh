#!/bin/bash
# Pepe Command Center v2 — Quick Start
# Starts the HTTP server and opens the dashboard

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="$(dirname "$SCRIPT_DIR")"

echo "🐸 Starting Pepe Command Center v2..."

# Scan files
node "$SCRIPT_DIR/scan-files.js"

# Check if server is already running
if curl -s http://localhost:8099/ > /dev/null 2>&1; then
    echo "✅ Server already running on http://localhost:8099"
else
    echo "Starting server..."
    node "$SCRIPT_DIR/server.js" &
    sleep 1
    echo "✅ Server started on http://localhost:8099"
fi

# Open in browser
echo "Opening in browser..."
open http://localhost:8099

echo ""
echo "🐸 Pepe Command Center v2 is ready!"
echo "   Browser: http://localhost:8099"
echo "   Mac App:  Search 'Pepe Command Center' in Spotlight"
echo ""
echo "Press Ctrl+C to stop the server"
wait
