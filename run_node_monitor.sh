#!/usr/bin/env bash
# Usage: ./run_node_monitor.sh
# Starts the server with extra Node tracing flags, logs stdout/stderr to server.log,
# writes PID to server.pid, and records exit code and timestamp to server-monitor.log.

OUT_LOG="server.log"
MONITOR_LOG="server-monitor.log"
PID_FILE="server.pid"
NODE_CMD="node --trace-uncaught --trace-warnings src/server.js"

echo "Starting Node with tracing at $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$MONITOR_LOG"
# Start node in background, redirect stdout/stderr
bash -lc "$NODE_CMD" >> "$OUT_LOG" 2>&1 &
NODE_PID=$!
echo $NODE_PID > "$PID_FILE"
echo "PID=$NODE_PID" | tee -a "$MONITOR_LOG"

# Wait for the process to exit and capture exit code
wait $NODE_PID
EXIT_CODE=$?
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "Process $NODE_PID exited at $TIMESTAMP with exit code $EXIT_CODE" | tee -a "$MONITOR_LOG"

# Provide a hint for common causes
if [ "$EXIT_CODE" -eq 137 ]; then
  echo "Exit code 137 => process was killed (SIGKILL). This commonly indicates the OS or an external tool terminated Node (e.g., antivirus or OOM)." | tee -a "$MONITOR_LOG"
fi

# Dump last 400 lines of server.log for quick inspection
echo "----- last server.log -----" >> "$MONITOR_LOG"
tail -n 400 "$OUT_LOG" >> "$MONITOR_LOG" 2>&1

echo "Monitor finished. See $OUT_LOG and $MONITOR_LOG for details." 
