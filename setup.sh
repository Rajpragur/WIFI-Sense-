#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm ci --prefix frontend
if [ "$(uname -s)" = Darwin ]; then
  swiftc collector/main.swift -o collector/wifisense-collector -framework CoreWLAN
  collector/build-collector.sh
else
  echo 'Native Wi-Fi collection currently requires macOS. Manual surveys remain available.'
fi
printf '\nSetup complete. Run ./start.sh and open http://127.0.0.1:5173\n'
