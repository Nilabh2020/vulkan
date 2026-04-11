#!/bin/bash

echo ""
echo "  ██╗   ██╗██╗   ██╗██╗     ██╗  ██╗ █████╗ ███╗   ██╗"
echo "  ██║   ██║██║   ██║██║     ██║ ██╔╝██╔══██╗████╗  ██║"
echo "  ██║   ██║██║   ██║██║     █████╔╝ ███████║██╔██╗ ██║"
echo "  ╚██╗ ██╔╝██║   ██║██║     ██╔═██╗ ██╔══██║██║╚██╗██║"
echo "   ╚████╔╝ ╚██████╔╝███████╗██║  ██╗██║  ██║██║ ╚████║"
echo "    ╚═══╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝"
echo ""
echo "  Agent Command Center — Swarm Initialization"
echo "  ─────────────────────────────────────────────"
echo ""

# Change to script directory
cd "$(dirname "$0")"

echo "  [1/4] Checking backend dependencies..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "        Installing backend packages..."
    npm install
fi
cd ..

echo "  [2/4] Checking frontend dependencies..."
if [ ! -d "node_modules" ]; then
    echo "        Installing frontend packages..."
    npm install
fi

echo "  [3/4] Starting backend on port 3001..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

echo "  [4/4] Starting frontend on port 5173..."
npx vite --host &
FRONTEND_PID=$!

echo ""
echo "  Waiting for servers to initialize..."
sleep 5

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  Backend:   http://127.0.0.1:3001       │"
echo "  │  Frontend:  http://localhost:5173        │"
echo "  └─────────────────────────────────────────┘"
echo ""

# Attempt to open browser automatically
if command -v xdg-open > /dev/null; then
  xdg-open http://localhost:5173 > /dev/null 2>&1 &
elif command -v open > /dev/null; then
  open http://localhost:5173 > /dev/null 2>&1 &
fi

echo "  Vulkan is operational. Press Ctrl+C to shut down both servers."

# Trap SIGINT (Ctrl+C) and terminate child processes
trap "echo -e '\n  Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '  All systems terminated.'; exit" SIGINT SIGTERM

# Wait indefinitely for background processes
wait $BACKEND_PID $FRONTEND_PID
