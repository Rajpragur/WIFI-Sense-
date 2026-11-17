# Wi-FiSense

A working local Wi-Fi monitor and site-survey prototype. It reads the Mac's radio through CoreWLAN, shows live signal history, and builds a growing heatmap from device locations paired with real RSSI readings.

## Open the application

If it is already running, open **http://127.0.0.1:5173/**. The backend is at http://127.0.0.1:8000 and its interactive API docs are at http://127.0.0.1:8000/docs.

For a fresh checkout on macOS, install Python 3.10+, Node.js 18+ and Xcode command-line tools, then run:

```sh
./setup.sh
./start.sh
```

Setup creates a local Python virtual environment, installs npm dependencies and compiles the native collector. Start runs the API and dashboard on loopback. Press Ctrl-C to stop. On subsequent starts, a changed native collector is recompiled automatically. The app reports occupied ports instead of moving silently to another address.

## Live monitor

The home screen reads real RSSI every three seconds. It also displays noise floor, signal-to-noise ratio, channel, frequency band, interface and transmit link rate when provided by macOS. The history trace is built from actual samples; pauses and long gaps are not filled with invented values. Pause/resume and refresh controls are available.

SSID/BSSID require Location Services permission for **WiFiSense Collector**, separately from browser location permission. If names are missing, open **Nearby networks**, scan, and select **Open Wi-Fi collector**. In the collector window choose **Allow location access…**, accept the macOS prompt, then scan again. If access was denied, use **Open Location Settings** and enable WiFiSense Collector in Privacy & Security → Location Services. The collector uses permission for CoreWLAN identifiers; it does not record geographic coordinates during a Wi-Fi scan.

The bundled native collector runs in the logged-in macOS session and provides status and scan data to the local backend over a per-user private Unix socket. It starts automatically in the background when the dashboard needs it. The original command-line agent remains a fallback for signal readings if the native app cannot launch. Some APs may genuinely hide names. On this Mac, both connected and nearby names and BSSIDs were verified after allowing access.

The default build is locally ad-hoc signed. Rebuilding it may cause macOS to ask for location access again. A stable Apple signing identity can be supplied with `WIFISENSE_SIGN_IDENTITY` when building; users should use their own legitimate identity. Location authorization and CoreWLAN behavior can differ across macOS versions. Revoke access anytime in System Settings. If native collection fails, check that the Mac is connected to Wi-Fi and run `./setup.sh`.

## Walking heatmap: automatic device location

1. Open **Walking heatmap** in the sidebar.
2. Create a session with **Automatic device location** selected.
3. Press **Start walking survey** and allow the browser to access your location.
4. Carry the Mac as you walk. Keep the application tab open. Each usable position is paired with a fresh native Wi-Fi reading, saved and displayed on the map.
5. The route and map bounds expand as locations change. Only areas within the chosen reveal radius of a sample are colored. Blank space stays unknown. Pause when finished; the session is saved locally and can be exported as JSON.

Your browser provides latitude, longitude, accuracy and a timestamp through the Geolocation API. It can use GPS, Wi-Fi positioning or other device location services. A Mac generally does not have a dedicated GPS receiver; its position may come from Wi-Fi-based estimates and may not move accurately indoors. This software cannot create GPS accuracy the hardware does not provide. For reliable automatic walking surveys, use a device/positioning setup that actually delivers fresh, accurate locations.

Fixes more than 50 metres uncertain are skipped. The browser rejects stale fixes, and the API independently checks freshness. Accuracy is displayed beside the recording status. The coverage radius is a visualization parameter and does not improve positioning precision. The map is a local coordinate grid in metres from the first fix, with north up; it does not use street-map tiles. Recorded route length can include GPS jitter and is not a validated walking-distance measurement.

Recording continues when you switch between views inside the app, and stops when you pause or close/reload the tab. A browser running on a phone cannot read that phone's Wi-Fi RSSI through this backend: radio measurements always come from the Mac running the collector. Keep the position source and measured radio on the same moving device.

### Indoor fallback

Create a walking session with **Indoor floor plan**, enter the plan's approximate physical width/height, and optionally upload an image. Select your current position as you move and press **Record signal here**. Each new location adds measured coverage. This mode uses explicitly selected positions; it does not pretend to automatically locate you indoors.

## Coverage survey

The **Coverage survey** section supports conventional, named floor-plan sessions. Click a point and read the Mac's signal, or enter an RSSI manually. Optionally capture ping and iPerf3 results at that location. Each new location requires a fresh signal reading. Measurements, image and network scans are saved in SQLite. Heatmap display, measurement deletion, JSON export and a before/after comparison are included.

The application does not generate sample surveys or synthetic signal readings. Manual entries are shown as user-entered, while collector readings come from the Mac.

## Nearby networks

Press **Scan nearby networks** to invoke CoreWLAN. Available AP signal levels, bands, channels and names are displayed; names and BSSIDs may be masked by macOS. A scan can be attached to a survey. Estimated overlap on 2.4 GHz channels 1, 6 and 11 is scored by the backend. Scores use visible signal power and an approximate 20 MHz overlap model. They do not measure airtime, traffic, non-Wi-Fi interference or actual client impact. Masked BSSIDs can make duplicate entries impossible to identify. Check hardware and local regulations before changing a router channel.

## Network tests

- **Latency & loss:** sends four ICMP probes to the entered IP or hostname. Shows mean received RTT, mean absolute difference between consecutive received RTTs, packet loss and received probe count. ICMP can be blocked or deprioritized. The target and upstream path affect the result.
- **Throughput:** requires iPerf3 on the Mac and an authorized iPerf3 server on another reachable device. Install iPerf3 using your preferred package manager, start `iperf3 -s` on the server, and enter its address. The app runs upload and reverse download TCP tests for three seconds each, using receiver throughput in Mbps. A localhost test verifies functionality only; it does not measure Wi-Fi performance.
- **Tx link rate:** the radio's link rate from CoreWLAN. This is different from measured transfer throughput.

## Heatmap interpretation

The standard survey uses inverse-distance weighting (power 2) on normalized image coordinates. Each grid cell uses only readings within 0.25 normalized units; farther cells stay blank. Exact-coordinate estimates average readings at that location. Weak means RSSI below -75 dBm. The estimated weak share is calculated only over colored cells near recorded points, which may include non-walkable portions; it is not a percentage of the entire building. The comparison error requires at least three distinct recorded coordinates.

The walking map uses local metre coordinates and a bounded IDW estimate around recorded samples. Repeated readings are averaged in small spatial bins. Cells outside the reveal radius are transparent; the estimated mapped area describes the colored grid footprint, not verified building coverage. A line connects recorded locations but does not color an unsampled gap automatically.

Neither heatmap is a wall-aware RF propagation model. Walls, furniture, reflections, antenna orientation and roaming can change actual reception. Independent withheld measurements are needed to evaluate map accuracy. The conventional survey's leave-one-location-out MAE helps diagnose interpolation error but does not replace independent validation. An AP candidate marker is an area to investigate, not a guaranteed installation position or predicted improvement.

## Local storage and privacy

SQLite uses `wifisense.db` in the project folder, or the path specified by `WIFISENSE_DB`. Back up the database to retain sessions. Live history retains the most recent 1,000 samples, with up to 120 returned to the chart. Walking sessions retain their samples, timestamps and location coordinates until you delete them. Exports include those coordinates.

This is a trusted, single-user local prototype. It has no authentication or TLS; keep it on loopback. Floor plans, coordinates and network identifiers can be sensitive. The application does not capture private traffic or change router settings. It references Google Fonts with system fallbacks; remove the CSS import for completely offline typography.

## Tests and source structure

```sh
.venv/bin/python -m unittest discover -s tests -v
npm run build --prefix frontend
```

- `agent/CollectorApp.swift`: native AppKit/CoreLocation/CoreWLAN collector and permission flow.
- `agent/main.swift`: command-line fallback for signal readings.
- `backend/collector.py`: private local socket bridge to the native collector.
- `backend/main.py`: API, validation, measurement tools and persistence.
- `backend/analysis.py`: conventional survey and channel algorithms.
- `backend/walking.py`: local coordinates and bounded walking heatmap.
- `frontend/src/LiveMonitor.tsx`: real-time monitor and network tests.
- `frontend/src/WalkingHeatmap.tsx`: geolocation workflow and growing map.
- `frontend/src/SurveyWorkspace.tsx`: floor-plan surveys and comparison.
- `frontend/src/NearbyNetworks.tsx`: scan and channel analysis.

The frontend uses IBM Plex Sans at light/regular weights, line icons, pale blue surfaces and a live trace as its central visual. Design guidance: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md

Future work includes a distribution-ready signed macOS collector, more reliable indoor positioning, calibrated geometry and walls, independent field evaluation, Windows/Linux agents, authentication, PostgreSQL, and multi-floor planning. No field-performance improvement is claimed without measurement.

## Packet lab

Open **Packet lab** to visualize individual IPv4 ICMP echo requests and their replies. Enter an IPv4 address or a hostname and send a bounded series of probes. The backend resolves the hostname once and invokes one system `ping` process per probe; the UI shows actual reply RTT, TTL, reply size and system sequence when available. Export the completed or stopped session as JSON.

The animation is conceptual and not to scale. A signal-by-channel chart uses actual scanned access points; the route timing chart uses actual traceroute replies. It does not capture traffic or identify routers. No reply means no response arrived by the deadline, which may be caused by filtering, rate limiting, an unavailable host, or loss. The operating system sequence can restart for each single-probe process. Only probe authorized targets. See `IMPLEMENTATION_PLAN.md` for the networking rationale and remaining work.

## Route explorer

Open **Route explorer**, enter a domain, website URL or IPv4 address, and press **Trace route**. Google, YouTube, GitHub and Wikipedia are provided as quick choices; any domain with an IPv4 address can be entered. A URL is reduced to its hostname before tracing, and URLs with embedded credentials are rejected. The chosen domain remains visible as the destination, including when it does not respond. The target resolves once to an IPv4 address. The backend runs the system `traceroute` with ICMP probes, one probe per increasing TTL, and streams each hop to the page. The selected hop shows its responding IP, its round-trip time, and a reverse-DNS name when one is available. Export saves only the current trace as JSON. Stop cancels the trace and cleans up its processes.

Traceroute sends separate probes; this is not the complete path of one captured packet. Silent hops can mean a router filtered or ignored a probe, and routes may change. The reported time is round-trip time to that response, not a hop-to-hop delay. A reverse-DNS name is a label for a responding IP address; it is not a list of visited websites or domains through which content passed. Only public addresses are sent to the configured DNS resolver for reverse lookup. On machines without `dig` or with DNS restrictions, names may be unavailable. The prototype supports IPv4 ICMP traceroute only. Run against authorized destinations.
