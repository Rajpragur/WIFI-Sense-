import Foundation
import CoreWLAN

func emit(_ value: [String: Any], status: Int32 = 0) -> Never {
    let data = (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])) ?? Data("{}".utf8)
    print(String(decoding: data, as: UTF8.self))
    exit(status)
}
func band(_ b: CWChannelBand) -> String {
    switch b {
    case .band2GHz: return "2.4 GHz"
    case .band5GHz: return "5 GHz"
    case .band6GHz: return "6 GHz"
    default: return "Unknown"
    }
}
let client = CWWiFiClient.shared()
guard let interface = client.interface() else { emit(["error": "No Wi-Fi interface found. Enable Wi-Fi and try again."], status: 1) }
let mode = CommandLine.arguments.dropFirst().first ?? "status"
if mode == "status" {
    var data: [String: Any] = ["interface": interface.interfaceName ?? "Wi-Fi", "rssi": interface.rssiValue()]
    let noise = interface.noiseMeasurement()
    if noise < 0 && noise >= -150 { data["noise_dbm"] = noise; data["snr_db"] = interface.rssiValue() - noise }
    let rate = interface.transmitRate()
    if rate > 0 { data["transmit_mbps"] = rate }
    if let s = interface.ssid() { data["ssid"] = s }
    if let b = interface.bssid() { data["bssid"] = b }
    if let c = interface.wlanChannel() { data["channel"] = c.channelNumber; data["band"] = band(c.channelBand) }
    if interface.rssiValue() == 0 { emit(["error": "No connected Wi-Fi signal is available. Connect to Wi-Fi and check macOS Location Services permissions."], status: 1) }
    emit(data)
} else if mode == "scan" {
    do {
        let found = try interface.scanForNetworks(withName: nil)
        let networks: [[String: Any]] = found.map { n in
            var row: [String: Any] = [:]
            if n.rssiValue < 0 && n.rssiValue >= -120 { row["rssi"] = n.rssiValue }
            if let c = n.wlanChannel { row["channel"] = c.channelNumber; row["band"] = band(c.channelBand) }
            if let s = n.ssid { row["ssid"] = s }
            if let b = n.bssid { row["bssid"] = b }
            return row
        }
        emit(["networks": networks])
    } catch { emit(["error": "Wi-Fi scan failed: \(error.localizedDescription). Check macOS Location Services and Wi-Fi permissions."], status: 1) }
} else { emit(["error": "Use status or scan."], status: 1) }
