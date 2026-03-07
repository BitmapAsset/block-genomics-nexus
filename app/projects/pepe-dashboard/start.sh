#!/bin/bash
# Pepe Dashboard Startup Script

echo "🐸 Starting Pepe Dashboard..."

# Start data server if not running
if ! lsof -i :8097 > /dev/null 2>&1; then
  echo "   Starting data server on port 8097..."
  node data-server.cjs > /tmp/data-server.log 2>&1 &
  sleep 1
fi

# Start Vite dev server
echo "   Starting dashboard on port 5173..."
npm run dev
