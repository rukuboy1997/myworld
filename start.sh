#!/bin/bash
set -e

echo "=== myWorld Full Stack ==="

# Install backend deps if needed
if [ ! -d "node_modules" ]; then
  echo "[backend] Installing dependencies..."
  npm install
fi

# Install frontend deps if needed
if [ ! -d "frontend/node_modules" ]; then
  echo "[frontend] Installing dependencies..."
  cd frontend && npm install && cd ..
fi

# Start Express backend
echo "[backend] Starting on port 3001..."
node server.js &
BACKEND_PID=$!

# Give backend a moment to start
sleep 2

# Start Vite frontend
echo "[frontend] Starting on port 5000..."
cd frontend && npm run dev
