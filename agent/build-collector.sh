#!/bin/sh
set -eu
cd "$(dirname "$0")"
app='WiFiSense Collector.app'
mkdir -p "$app/Contents/MacOS"
cp Info.plist "$app/Contents/Info.plist"
swiftc CollectorApp.swift -o "$app/Contents/MacOS/WiFiSenseCollector" -framework CoreWLAN -framework CoreLocation -framework AppKit
codesign --force --sign "${WIFISENSE_SIGN_IDENTITY:--}" "$app"
echo "Built $app"
