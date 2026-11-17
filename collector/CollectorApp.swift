import AppKit
import Foundation
import CoreWLAN
import CoreLocation
import Darwin
import CryptoKit

let appID = "WiFiSense Collector"
let agentPath = Bundle.main.bundleURL.deletingLastPathComponent().standardizedFileURL.resolvingSymlinksInPath().path
let hash = SHA256.hash(data: Data(agentPath.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
let runtimeURL = URL(fileURLWithPath: "/tmp/wfs-\(getuid())-\(hash)", isDirectory: true)
let socketURL = runtimeURL.appendingPathComponent("collector.sock")

func permissionName(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "not_determined"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .authorizedAlways, .authorizedWhenInUse: return "authorized"
    @unknown default: return "unknown"
    }
}

func band(_ value: CWChannelBand) -> String {
    switch value {
    case .band2GHz: return "2.4 GHz"
    case .band5GHz: return "5 GHz"
    case .band6GHz: return "6 GHz"
    default: return "Unknown"
    }
}

final class Collector: NSObject, NSApplicationDelegate, CLLocationManagerDelegate {
    let location = CLLocationManager()
    var window: NSWindow!
    var statusLabel: NSTextField!
    var allowButton: NSButton!
    var socketFD: Int32 = -1
    var pending = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        location.delegate = self
        buildWindow()
        do { try startSocket() }
        catch {
            statusLabel.stringValue = "Collector could not start: \(error.localizedDescription)"
        }
        updateStatus()
        window.center()
        if !CommandLine.arguments.contains("--background") {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 500, height: 265), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = appID
        window.isReleasedWhenClosed = false
        let root = NSView(frame: window.contentView!.bounds)
        window.contentView = root
        let title = NSTextField(labelWithString: "Show nearby Wi-Fi names")
        title.font = NSFont.systemFont(ofSize: 22, weight: .regular)
        title.frame = NSRect(x: 28, y: 207, width: 440, height: 30)
        root.addSubview(title)
        let description = NSTextField(wrappingLabelWithString: "macOS requires Location Services access to reveal Wi-Fi network names and access-point identifiers. Wi-FiSense does not save your location when scanning.")
        description.font = NSFont.systemFont(ofSize: 13)
        description.textColor = .secondaryLabelColor
        description.frame = NSRect(x: 28, y: 144, width: 440, height: 48)
        root.addSubview(description)
        statusLabel = NSTextField(wrappingLabelWithString: "Checking permission…")
        statusLabel.font = NSFont.systemFont(ofSize: 12)
        statusLabel.frame = NSRect(x: 28, y: 91, width: 440, height: 42)
        root.addSubview(statusLabel)
        allowButton = NSButton(title: "Allow location access…", target: self, action: #selector(requestPermission))
        allowButton.bezelStyle = .rounded
        allowButton.frame = NSRect(x: 28, y: 35, width: 185, height: 32)
        root.addSubview(allowButton)
        let settings = NSButton(title: "Open Location Settings", target: self, action: #selector(openSettings))
        settings.bezelStyle = .rounded
        settings.frame = NSRect(x: 220, y: 35, width: 190, height: 32)
        root.addSubview(settings)
    }

    func updateStatus() {
        let name = permissionName(location.authorizationStatus)
        switch name {
        case "authorized": statusLabel.stringValue = "Location access is allowed. Return to Wi-FiSense and scan again."
        case "denied": statusLabel.stringValue = "Location access is denied. Enable WiFiSense Collector in Location Services settings."
        case "restricted": statusLabel.stringValue = "Location access is restricted by this Mac's settings."
        default: statusLabel.stringValue = "Location access has not yet been granted. Click Allow location access to ask macOS."
        }
        allowButton.isEnabled = name == "not_determined"
    }

    @objc func requestPermission() {
        guard location.authorizationStatus == .notDetermined else { updateStatus(); return }
        pending = true
        location.requestAlwaysAuthorization()
        updateStatus()
    }
    @objc func openSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices") { NSWorkspace.shared.open(url) }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        pending = false
        updateStatus()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil); return true
    }
    func applicationWillTerminate(_ notification: Notification) {
        if socketFD >= 0 { close(socketFD); unlink(socketURL.path) }
    }

    func startSocket() throws {
        try FileManager.default.createDirectory(at: runtimeURL, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        var info = stat()
        guard lstat(runtimeURL.path, &info) == 0, (info.st_mode & S_IFMT) == S_IFDIR, info.st_uid == getuid() else {
            throw NSError(domain: "WiFiSense", code: 2, userInfo: [NSLocalizedDescriptionKey: "the private socket directory is not owned by this user"])
        }
        chmod(runtimeURL.path, 0o700)
        let path = socketURL.path
        guard path.utf8.count < MemoryLayout.size(ofValue: sockaddr_un().sun_path) else { throw NSError(domain: "WiFiSense", code: 1, userInfo: [NSLocalizedDescriptionKey: "project path is too long for the local socket"]) }
        // Only remove an abandoned socket. Never displace a running collector.
        if FileManager.default.fileExists(atPath: path) {
            let test = socket(AF_UNIX, SOCK_STREAM, 0)
            var existing = sockaddr_un(); existing.sun_family = sa_family_t(AF_UNIX)
            withUnsafeMutableBytes(of: &existing.sun_path) { destination in
                path.utf8CString.withUnsafeBytes { source in destination.copyBytes(from: source) }
            }
            let connected = withUnsafePointer(to: &existing) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(test, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
            }
            close(test)
            if connected == 0 { throw NSError(domain: "WiFiSense", code: 3, userInfo: [NSLocalizedDescriptionKey: "a collector is already running"]) }
            unlink(path)
        }
        socketFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard socketFD >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        withUnsafeMutableBytes(of: &address.sun_path) { destination in
            path.utf8CString.withUnsafeBytes { source in destination.copyBytes(from: source) }
        }
        let result = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(socketFD, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        guard result == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        chmod(path, 0o600)
        guard listen(socketFD, 8) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }
            while self.socketFD >= 0 {
                let client = accept(self.socketFD, nil, nil)
                if client < 0 { break }
                DispatchQueue.global(qos: .utility).async { self.handle(client) }
            }
        }
    }

    func handle(_ client: Int32) {
        defer { close(client) }
        var timeout = timeval(tv_sec: 5, tv_usec: 0)
        _ = setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        var bytes = [UInt8](repeating: 0, count: 512)
        let count = recv(client, &bytes, bytes.count, 0)
        guard count > 0 else { return }
        let command = String(decoding: bytes.prefix(count), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        var auth = "unknown"
        DispatchQueue.main.sync { auth = permissionName(self.location.authorizationStatus) }
        var reply: [String: Any] = ["location_authorization": auth, "collector": "native_app"]
        switch command {
        case "permissions": break
        case "status", "scan":
            guard let iface = CWWiFiClient.shared().interface() else { reply["error"] = "No Wi-Fi interface found."; sendJSON(reply, client); return }
            if command == "status" {
                let rssi = iface.rssiValue()
                guard rssi < 0 else { reply["error"] = "No connected Wi-Fi signal is available."; sendJSON(reply, client); return }
                reply["interface"] = iface.interfaceName ?? "Wi-Fi"; reply["rssi"] = rssi
                let noise = iface.noiseMeasurement()
                if noise < 0 && noise >= -150 { reply["noise_dbm"] = noise; reply["snr_db"] = rssi - noise }
                let rate = iface.transmitRate(); if rate > 0 { reply["transmit_mbps"] = rate }
                if let s = iface.ssid() { reply["ssid"] = s }
                if let b = iface.bssid() { reply["bssid"] = b }
                if let c = iface.wlanChannel() { reply["channel"] = c.channelNumber; reply["band"] = band(c.channelBand) }
            } else {
                do {
                    let found = try iface.scanForNetworks(withName: nil)
                    reply["networks"] = found.map { n -> [String: Any] in
                        var row: [String: Any] = [:]
                        if n.rssiValue < 0 && n.rssiValue >= -120 { row["rssi"] = n.rssiValue }
                        if let c = n.wlanChannel { row["channel"] = c.channelNumber; row["band"] = band(c.channelBand) }
                        if let s = n.ssid { row["ssid"] = s }; if let b = n.bssid { row["bssid"] = b }
                        return row
                    }
                } catch { reply["error"] = "Wi-Fi scan failed: \(error.localizedDescription)" }
            }
        default: reply["error"] = "Unknown collector request."
        }
        sendJSON(reply, client)
    }
    func sendJSON(_ value: [String: Any], _ fd: Int32) {
        var noSigPipe: Int32 = 1
        _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, socklen_t(MemoryLayout<Int32>.size))
        guard let data = try? JSONSerialization.data(withJSONObject: value), var line = String(data: data, encoding: .utf8) else { return }
        line += "\n"
        line.withCString { ptr in _ = send(fd, ptr, strlen(ptr), 0) }
    }
}

let application = NSApplication.shared
let delegate = Collector()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
