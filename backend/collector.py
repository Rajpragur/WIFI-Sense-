"""Bridge to the user's native, per-session macOS Wi-Fi collector."""
import hashlib
import json
import os
import socket
import stat
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLLECTOR_DIR = ROOT / 'collector'
APP = COLLECTOR_DIR / 'WiFiSense Collector.app'
LEGACY = COLLECTOR_DIR / 'wifisense-collector'
SOCKET_DIR = Path('/tmp') / f"wfs-{os.getuid()}-{hashlib.sha256(str(COLLECTOR_DIR.resolve()).encode()).hexdigest()[:16]}"
SOCKET = SOCKET_DIR / 'collector.sock'
_lock = threading.Lock()
_last_start = 0.0


def collector_ready():
    return (APP / 'Contents' / 'MacOS' / 'WiFiSenseCollector').is_file()


def native_request(mode, timeout=25):
    if mode not in ('status', 'scan', 'permissions'):
        raise ValueError('Invalid collector command')
    # Do not talk to a socket in a symlink or a directory owned by someone else.
    try:
        info = SOCKET_DIR.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise OSError('Unsafe collector socket directory')
        sock_info = SOCKET.lstat()
        if not stat.S_ISSOCK(sock_info.st_mode) or sock_info.st_uid != os.getuid():
            raise OSError('Unsafe collector socket')
    except FileNotFoundError:
        raise ConnectionError('Native Wi-Fi collector is not running')
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(timeout)
        client.connect(str(SOCKET))
        client.sendall((mode + '\n').encode('ascii'))
        data = bytearray()
        while b'\n' not in data:
            chunk = client.recv(65536)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > 1024 * 1024:
                raise ValueError('Collector response too large')
    parsed = json.loads(data)
    if not isinstance(parsed, dict):
        raise ValueError('Invalid collector response')
    return parsed


def start_collector(visible=False):
    global _last_start
    if sys.platform != 'darwin' or not collector_ready():
        return False
    with _lock:
        if not visible and time.monotonic() - _last_start < 10:
            return False
        _last_start = time.monotonic()
        args = ['open'] + ([] if visible else ['-g']) + [str(APP)]
        if not visible:
            args += ['--args', '--background']
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            return False
        return result.returncode == 0


def collect(mode):
    try:
        return native_request(mode)
    except (OSError, ValueError):
        pass
    if start_collector():
        for _ in range(16):
            time.sleep(.15)
            try:
                return native_request(mode)
            except (OSError, ValueError):
                pass
    # Keep core monitoring functional even if the app bundle cannot launch.
    if mode == 'permissions':
        return {'collector': 'unavailable', 'location_authorization': 'unknown'}
    if not LEGACY.exists():
        raise RuntimeError('The macOS Wi-Fi collector is not built. Run ./setup.sh.')
    try:
        result = subprocess.run([str(LEGACY), mode], capture_output=True, text=True, timeout=25)
        data = json.loads(result.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise RuntimeError('The macOS Wi-Fi collector is unavailable.')
    if not isinstance(data, dict):
        raise RuntimeError('Invalid response from the Wi-Fi collector.')
    return {**data, 'collector': 'legacy_cli', 'location_authorization': 'unknown'}
