#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/uvicorn ] || [ ! -d frontend/node_modules ]; then
  echo 'Run ./setup.sh first to install the local dependencies.' >&2
  exit 1
fi
.venv/bin/python - <<'PY'
import socket
for port in (8000, 5173):
    with socket.socket() as server:
        try:
            server.bind(('127.0.0.1', port))
        except OSError:
            raise SystemExit(f'Port {port} is already in use. If Wi-FiSense is running, open http://127.0.0.1:5173 instead.')
PY
if [ "$(uname -s)" = Darwin ] && { [ ! -x agent/wifisense-agent ] || [ agent/main.swift -nt agent/wifisense-agent ]; }; then
  swiftc agent/main.swift -o agent/wifisense-agent -framework CoreWLAN
fi
if [ "$(uname -s)" = Darwin ] && { [ ! -x 'agent/WiFiSense Collector.app/Contents/MacOS/WiFiSenseCollector' ] || [ agent/CollectorApp.swift -nt 'agent/WiFiSense Collector.app/Contents/MacOS/WiFiSenseCollector' ] || [ agent/Info.plist -nt 'agent/WiFiSense Collector.app/Contents/Info.plist' ]; }; then
  agent/build-collector.sh
fi
(cd backend && ../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000) &
api_pid=$!
cleanup() { kill "$api_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
cd frontend
npm run dev
