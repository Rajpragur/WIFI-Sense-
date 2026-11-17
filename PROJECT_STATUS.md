# Wi-FiSense: implementation and completion audit

## Verdict

The local macOS prototype is functional, but the original course-project proposal is not fully complete. Indoor positioning accuracy, field validation, cross-version collector verification, optimization depth, and controlled field results in the report remain open. No field-survey improvement or validated prediction accuracy is claimed.

## Implemented

| Area | Current behavior | Limits |
| --- | --- | --- |
| Live signal | CoreWLAN supplies RSSI, band, channel, noise, SNR and link rate when available. React shows recent readings. | The collector runs on the Mac hosting the backend; radio data depends on macOS and hardware permissions. |
| Scanning | Scans nearby APs with available signal and channel. | The native collector with Location Services permission returned names and BSSIDs on this Mac. A stable distribution signature and cross-version verification are still needed. |
| Floor-plan survey | Upload an image, select points, save real or manually entered RSSI and optional network tests. | Placement is manual; signal interpolation does not model walls. |
| Walking heatmap | Displays a route and bounded estimated coverage using device location, or manual floor-plan positions. | Automatic indoor location is not reliably room-level accurate. iPhone location is not integrated. |
| ICMP packet lab | Sends individual real IPv4 ICMP echo probes and shows reply/no-reply, RTT, TTL and size in a timeline and chart. | The packet animation is illustrative; system ping output is not a packet capture or router trace. |
| Route explorer | Streams IPv4 ICMP traceroute responses, hop addresses, RTT and available reverse-DNS labels. | Silent routers, changing paths and missing reverse DNS can leave gaps. This is not a capture of one packet or browsing history. |
| Performance | Ping reports RTT, loss and RTT variation. Optional iPerf3 reports upload/download to a supplied server. | A second authorized device is needed to measure actual network throughput. ICMP can be filtered. |
| Recommendations | Estimates overlapping 2.4 GHz channels and marks an area of weak coverage. | Scores do not measure channel utilization; weak-area marker is not a validated AP placement or a predicted improvement. |
| Storage and comparison | Local SQLite, survey history, JSON export and before/after summary. | The application is single-user and local, with no authentication or TLS. |

## Verification completed

- 33 automated Python tests cover interpolation, channel scoring, native collector errors, walking positions and ICMP parsing.
- The React/TypeScript production build succeeds.
- Browser checks exercise the live collector, navigation, packet timeline/chart, selection and responsive layout. Loopback checks validate application behavior only, not Wi-Fi performance.
- After the user granted Location Services access, a live scan returned both names and BSSIDs, and they remained available after the collector restarted.

## Remaining for a credible course submission

1. Survey a real indoor floor with repeated, labeled measurements. Reserve independent locations and compute mean absolute heatmap error; compare selected RSSI values against a trusted measurement tool.
2. Perform a controlled before/after experiment at matching points, using the same device and target. Run iPerf3 against a second device and record measured latency, loss and throughput.
3. Verify the native collector across other macOS versions and prepare a stable distribution signature; local SSID/BSSID access now works after Location Services permission.
4. Refine the floor-plan survey workflow and explicitly report location/measurement uncertainty. Avoid claims that the current GPS mode provides accurate indoor positioning.
5. Evaluate channel/AP recommendations with actual measurements and practical deployment constraints. Implement stronger placement optimization only if required by the submission.
6. Add verified field results to the report after a controlled survey. Prepare the presentation and setup instructions.

## Optional beyond the course prototype

Authenticated multi-user operation, TLS, PostgreSQL, Windows/Linux collectors, multi-floor analysis, real packet capture with appropriate permission/privacy handling, and dedicated indoor positioning hardware are future extensions. The prototype must remain on loopback until production security is implemented.
