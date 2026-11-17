# Wi-FiSense: computer networks implementation plan

## Project objective
Build a local, demonstrable wireless network survey system that combines 802.11 signal measurements, ICMP diagnostics, TCP throughput, spatial mapping and evidence-based optimization. Every displayed measurement must indicate its source and limitations.

## Implemented foundation
1. **802.11 collection:** Swift/CoreWLAN collector reads RSSI, noise, channel, band and available AP information on macOS. The native app requests Location Services permission; authorized scans returned SSIDs/BSSIDs on the tested Mac.
2. **Live monitoring:** React dashboard polls the FastAPI backend and plots actual signal samples. SQLite stores sessions and recent readings.
3. **Site survey:** User places measurements on a floor plan. Bounded IDW heatmaps and weak-area estimates are approximate; areas without nearby readings remain blank, and walking-location mode is not room-level reliable indoors.
4. **Performance tests:** ICMP ping measures RTT, RTT variation and loss; iPerf3 measures TCP throughput to an explicitly selected server. The test target and its path affect the results.
5. **Channel analysis:** Visible 2.4 GHz APs contribute to approximate overlap scores for channels 1, 6 and 11; this is not measured airtime.

## Packet lab: implemented
- A user selects a hostname or IPv4 address and a bounded number of probes.
- The backend resolves the target to IPv4 and runs one system ICMP echo probe at a time. The browser displays individual observed replies, local deadlines, RTT, reply TTL, reply byte count and the sequence printed by ping.
- The animated request and reply are a **conceptual** visualization driven by real probe outcomes. It is not a packet capture, router trace, topology discovery, one-way measurement or playback of packet contents. Animation duration does not represent RTT.
- The timeline and summary calculate received count, unanswered percentage, average RTT and mean absolute successive RTT variation from completed probes. A no-reply observation can result from filtering, rate limiting, an unreachable host or packet loss; it does not establish cause.
- Export the observed session as JSON. IPv4 ICMP requests and replies have types 8 and 0. Each probe uses a separate ping process, so the operating system's ICMP sequence can repeat.

## Route explorer: implemented
- Runs IPv4 ICMP traceroute, streaming hop responses and explicit no-response markers, with bounded hop count and cancellation.
- Public hop addresses are looked up via the configured DNS resolver when available; PTR names are labels, not visited websites. Private addresses are not submitted for public reverse lookup.
- Reports per-hop RTT without treating those values as additive or claiming a single packet is followed. Real network devices may filter probes.

## Remaining work, in recommended order
1. **Indoor survey validation:** collect repeated manual floor-plan points throughout a real building. Reserve independent points and calculate IDW mean absolute error. Verify signal readings against another trusted tool.
2. **macOS permissions:** the native collector and Location Services flow are implemented and verified on this Mac. Verify other macOS versions and supply a stable signing identity for distribution.
3. **Real network experiments:** run iPerf3 on a second authorized device, measure both directions at matching survey points and compare before/after latency, loss and throughput with test conditions recorded.
4. **Real packet capture, optional:** if needed for protocol analysis, implement a separately authorized, bounded capture using an appropriate capture interface and privileges; include consent, filtering, privacy, platform limitations and a clear distinction between captured packets and animations. Do not collect traffic contents by default.
5. **Better optimization:** incorporate measured channel widths, calibrated geometry, walkable masks and AP constraints. Evaluate candidate placements against real measurements instead of inventing improvement percentages.
6. **Delivery:** update the report with diagrams, screenshots, honest measurements and limitations; prepare a reproducible live demo and setup instructions. Production deployment requires authentication, TLS and suitable database configuration.

## Verification
- Python unit tests cover IDW, channel scoring, collector failure, GPS/floor-plan coordinates and ICMP reply/no-reply/error parsing.
- The frontend production build checks TypeScript and bundling.
- A local loopback ICMP probe checks the end-to-end packet UI; loopback confirms software behavior, not Wi-Fi or Internet performance.
- Independently test an authorized network target and real indoor conditions during the course demonstration.
