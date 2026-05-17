#!/bin/bash

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

printf "Starting Confidential Lottery...\n\n"

PORTS=(3006 8006 3007 6301)
for PORT in "${PORTS[@]}"; do
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
  if [[ -n "$PIDS" ]]; then
    echo "  [ports] Killing process(es) on :$PORT -> PID $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null
  fi
done

CONTRACT_SRC="$PROJECT_DIR/contract/src/lottery.compact"
CONTRACT_DIST="$PROJECT_DIR/contract/dist/lottery/contract/index.js"
BUY_KEY="$PROJECT_DIR/contract/dist/lottery/keys/buy_ticket.prover"
REVEAL_KEY="$PROJECT_DIR/contract/dist/lottery/keys/reveal_winner.prover"

if command -v compact >/dev/null 2>&1; then
  if [[ ! -f "$CONTRACT_DIST" ]] || [[ ! -f "$BUY_KEY" ]] || [[ ! -f "$REVEAL_KEY" ]] || [[ "$CONTRACT_SRC" -nt "$CONTRACT_DIST" ]]; then
    echo "  [contract] Compiling lottery.compact -> contract/dist/lottery"
    mkdir -p "$PROJECT_DIR/contract/dist"
    compact compile "$CONTRACT_SRC" "$PROJECT_DIR/contract/dist/lottery"
    if [[ $? -ne 0 ]]; then
      echo "  [contract] Compile failed; midnight-service will use mock ZK proofs"
    else
      echo "  [contract] Compiled successfully"
    fi
  else
    echo "  [contract] contract/dist/lottery is up-to-date"
  fi
else
  echo "  [contract] compact CLI not found; midnight-service will use mock ZK proofs"
fi

echo ""

cleanup() {
  jobs -p | xargs kill 2>/dev/null
}
trap cleanup INT TERM EXIT

(
  cd "$PROJECT_DIR/backend" || exit 1
  if [[ -f ".venv/bin/activate" ]]; then
    source .venv/bin/activate
  fi
  python3 -m uvicorn main:app --reload --port 8006
) &
BACKEND_PID=$!

(
  cd "$PROJECT_DIR/midnight-service" || exit 1
  npm start
) &
MIDNIGHT_PID=$!

(
  cd "$PROJECT_DIR/frontend" || exit 1
  npm run dev -- --port 3006
) &
FRONTEND_PID=$!

echo "Services launching:"
echo "  Backend:          http://localhost:8006"
echo "  Midnight service: http://localhost:3007"
echo "  Frontend:         http://localhost:3006"
echo ""

wait "$BACKEND_PID" "$MIDNIGHT_PID" "$FRONTEND_PID"
