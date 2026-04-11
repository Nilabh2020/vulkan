#!/bin/bash

# Change to script directory
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# ── Cleanup Previous Instances ──
echo "[SYSTEM] Cleaning up existing Vulkan processes..."
pkill -f "server.js" > /dev/null 2>&1
pkill -f "vite" > /dev/null 2>&1

# ── Global Command Setup (Linux/macOS) ──
if [[ ":$PATH:" != *":$PROJECT_DIR:"* ]] && [ ! -f "/usr/local/bin/vulkan" ]; then
    echo "[SETUP] Setting up 'vulkan' command..."
    
    # Ensure script is executable
    chmod +x start_vulkan.sh

    # Method 1: Try symbolic link to /usr/local/bin (requires sudo, most robust)
    if [ -w "/usr/local/bin" ]; then
        ln -sf "$PROJECT_DIR/start_vulkan.sh" /usr/local/bin/vulkan
        echo "[SETUP] Success! Created symbolic link in /usr/local/bin/vulkan"
    else
        # Method 2: Fallback to shell profile
        SHELL_PROFILE=""
        if [ -f "$HOME/.bashrc" ]; then
            SHELL_PROFILE="$HOME/.bashrc"
        elif [ -f "$HOME/.zshrc" ]; then
            SHELL_PROFILE="$HOME/.zshrc"
        fi

        if [ -n "$SHELL_PROFILE" ]; then
            if ! grep -q "$PROJECT_DIR" "$SHELL_PROFILE"; then
                echo "export PATH=\"\$PATH:$PROJECT_DIR\"" >> "$SHELL_PROFILE"
                # Create a local symlink so 'vulkan' works if directory is in PATH
                ln -sf start_vulkan.sh vulkan
                echo "[SETUP] Success! Added to $SHELL_PROFILE. Please run 'source $SHELL_PROFILE' or restart terminal."
            fi
        else
            echo "[SETUP] Could not find .bashrc or .zshrc. Please add $PROJECT_DIR to your PATH manually."
        fi
    fi
    echo ""
fi

echo ""
echo "  VULKAN AGENT COMMAND CENTER"
echo "  ───────────────────────────"
echo ""

# ── Dependencies ──
echo "  [1/4] Checking backend dependencies..."
if [ ! -d "backend/node_modules" ]; then
    echo "        Installing backend packages..."
    (cd backend && npm install)
fi

echo "  [2/4] Checking frontend dependencies..."
if [ ! -d "node_modules" ]; then
    echo "        Installing frontend packages..."
    npm install
fi

# ── Start Servers ──
echo "  [3/4] Starting backend on port 3001..."
cd backend
node server.js > /dev/null 2>&1 &
BACKEND_PID=$!
cd ..

echo "  [4/4] Starting frontend on port 5173..."
npx vite --host > /dev/null 2>&1 &
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
