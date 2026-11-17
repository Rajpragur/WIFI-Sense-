from __future__ import annotations
import ipaddress
import asyncio
import json
import os
import re
import shutil
from contextlib import contextmanager
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from analysis import analyze
from walking import local_metres, walking_map
from packet_probe import resolve_ipv4, single_probe
from collector import collect, collector_ready, start_collector
from route_trace import trace_events

ROOT = Path(__file__).resolve().parent.parent
DB = Path(os.environ.get('WIFISENSE_DB', ROOT / 'wifisense.db'))
app = FastAPI(title='Wi-FiSense', version='1.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'], allow_methods=['*'], allow_headers=['*'])


@contextmanager
def db():
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    try:
        with conn:
            yield conn
    finally:
        conn.close()

with db() as conn:
    conn.executescript('''CREATE TABLE IF NOT EXISTS surveys (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, floorplan TEXT, demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS measurements (id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scans (survey_id TEXT PRIMARY KEY REFERENCES surveys(id) ON DELETE CASCADE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS live_samples (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS walk_sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, created_at TEXT NOT NULL, floorplan TEXT, width_m REAL NOT NULL, height_m REAL NOT NULL, origin_lat REAL, origin_lon REAL);
    CREATE TABLE IF NOT EXISTS walk_samples (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES walk_sessions(id) ON DELETE CASCADE, data TEXT NOT NULL);''')

class Survey(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    floorplan: Optional[str] = Field(default=None, max_length=5000000)
    @field_validator('floorplan')
    @classmethod
    def valid_image(cls, v):
        if v and not re.match(r'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$', v):
            raise ValueError('Use a PNG, JPEG, or WebP image.')
        return v

class Measurement(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    rssi: float = Field(ge=-120, le=-1)
    label: str = Field(default='', max_length=100)
    ssid: Optional[str] = Field(default=None, max_length=100)
    bssid: Optional[str] = Field(default=None, max_length=32)
    channel: Optional[int] = Field(default=None, ge=1, le=233)
    latency_ms: Optional[float] = Field(default=None, ge=0, le=60000)
    jitter_ms: Optional[float] = Field(default=None, ge=0, le=60000)
    loss_percent: Optional[float] = Field(default=None, ge=0, le=100)
    download_mbps: Optional[float] = Field(default=None, ge=0)
    upload_mbps: Optional[float] = Field(default=None, ge=0)
    ping_target: Optional[str] = Field(default=None, max_length=253)
    throughput_target: Optional[str] = Field(default=None, max_length=253)
    source: str = Field(default='manual', max_length=30)

class Network(BaseModel):
    ssid: Optional[str] = Field(default=None, max_length=100)
    bssid: Optional[str] = Field(default=None, max_length=32)
    rssi: Optional[int] = Field(default=None, ge=-120, le=-1)
    channel: Optional[int] = Field(default=None, ge=1, le=233)
    band: Optional[str] = Field(default=None, max_length=20)

class PingRequest(BaseModel):
    target: str = '1.1.1.1'
    count: int = Field(default=4, ge=2, le=10)
    @field_validator('target')
    @classmethod
    def valid_target(cls, v):
        try:
            ipaddress.ip_address(v)
        except ValueError:
            if not re.fullmatch(r'(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', v):
                raise ValueError('Enter a valid hostname or IP address.')
        return v

class PacketTarget(BaseModel):
    target: str = Field(min_length=1, max_length=253)
    @field_validator('target')
    @classmethod
    def valid_target(cls, value):
        return PingRequest.valid_target(value)

class TraceRequest(PacketTarget):
    max_hops: int = Field(default=16, ge=1, le=30)

class PacketAddress(BaseModel):
    address: str = Field(min_length=7, max_length=15)

class ThroughputRequest(PingRequest):
    port: int = Field(default=5201, ge=1, le=65535)
    duration: int = Field(default=3, ge=1, le=10)

def get_survey(sid):
    with db() as conn:
        row = conn.execute('SELECT * FROM surveys WHERE id=?', (sid,)).fetchone()
        if not row:
            raise HTTPException(404, 'Survey not found')
        points = [json.loads(r['data']) for r in conn.execute('SELECT data FROM measurements WHERE survey_id=? ORDER BY rowid', (sid,))]
        scan = conn.execute('SELECT data FROM scans WHERE survey_id=?', (sid,)).fetchone()
    metadata = dict(row)
    metadata.pop('demo', None)  # Retain the legacy database column, not synthetic UI details.
    return {**metadata, 'measurements': points, 'networks': json.loads(scan['data']) if scan else []}

@app.get('/api/surveys')
def list_surveys():
    with db() as conn:
        return [dict(r) for r in conn.execute('SELECT id,name,created_at FROM surveys ORDER BY created_at DESC')]

@app.post('/api/surveys', status_code=201)
def create_survey(body: Survey):
    sid = str(uuid4())
    with db() as conn:
        conn.execute('INSERT INTO surveys VALUES (?,?,?,?,0)', (sid, body.name.strip(), datetime.now(timezone.utc).isoformat(), body.floorplan))
    return get_survey(sid)

@app.get('/api/surveys/{sid}')
def survey(sid: str):
    return get_survey(sid)

@app.delete('/api/surveys/{sid}', status_code=204)
def delete_survey(sid: str):
    get_survey(sid)
    with db() as conn:
        conn.execute('DELETE FROM surveys WHERE id=?', (sid,))

@app.post('/api/surveys/{sid}/measurements', status_code=201)
def add_measurement(sid: str, body: Measurement):
    get_survey(sid)
    point = body.model_dump() | {'id': str(uuid4()), 'created_at': datetime.now(timezone.utc).isoformat()}
    with db() as conn:
        conn.execute('INSERT INTO measurements VALUES (?,?,?)', (point['id'], sid, json.dumps(point)))
    return point

@app.delete('/api/surveys/{sid}/measurements/{mid}', status_code=204)
def delete_measurement(sid: str, mid: str):
    with db() as conn:
        cur = conn.execute('DELETE FROM measurements WHERE survey_id=? AND id=?', (sid, mid))
        if cur.rowcount == 0:
            raise HTTPException(404, 'Measurement not found')

@app.put('/api/surveys/{sid}/networks')
def save_networks(sid: str, networks: list[Network]):
    get_survey(sid)
    if len(networks) > 1000:
        raise HTTPException(400, 'Too many networks')
    with db() as conn:
        conn.execute('INSERT OR REPLACE INTO scans VALUES (?,?)', (sid, json.dumps([n.model_dump() for n in networks])))
    return {'count': len(networks)}

@app.get('/api/surveys/{sid}/analysis')
def survey_analysis(sid: str):
    s = get_survey(sid)
    return analyze(s['measurements'], s['networks'])

@app.get('/api/agent/{mode}')
def agent(mode: str):
    if mode not in ('status', 'scan', 'permissions'):
        raise HTTPException(404, 'Unknown agent command')
    try:
        data = collect(mode)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    if data.get('error'):
        raise HTTPException(503, data['error'])
    return data

@app.post('/api/collector/open')
def open_collector():
    if not collector_ready():
        raise HTTPException(503, 'The native collector is not built. Run ./setup.sh.')
    if not start_collector(visible=True):
        raise HTTPException(503, 'Could not open the native collector. Open it from the project collector folder.')
    return {'opened': True}

@app.post('/api/channels')
def channel_analysis(networks: list[Network]):
    if len(networks) > 1000:
        raise HTTPException(400, 'Too many networks')
    result = analyze([], [n.model_dump() for n in networks])
    return {'scores': result['channel_scores'], 'recommended_channel': result['recommended_channel']}

@app.get('/api/health')
def health():
    return {'status': 'ok', 'agent_ready': collector_ready() or (ROOT / 'collector' / 'wifisense-collector').exists(),
            'iperf_ready': shutil.which('iperf3') is not None, 'storage': 'SQLite', 'mode': 'local'}

@app.get('/api/live')
def live():
    reading = agent('status')
    rssi = reading.get('rssi')
    if not isinstance(rssi, (int, float)) or not -120 <= rssi < 0:
        raise HTTPException(503, 'No connected Wi-Fi signal. Connect this Mac to Wi-Fi and try again.')
    sample = {**reading, 'timestamp': datetime.now(timezone.utc).isoformat()}
    with db() as conn:
        conn.execute('INSERT INTO live_samples(data) VALUES (?)', (json.dumps(sample),))
        conn.execute('DELETE FROM live_samples WHERE id NOT IN (SELECT id FROM live_samples ORDER BY id DESC LIMIT 1000)')
        history = [json.loads(row['data']) for row in conn.execute('SELECT data FROM live_samples ORDER BY id DESC LIMIT 120')][::-1]
    return {'current': sample, 'history': history, 'interval_seconds': 3}

@app.post('/api/packet-lab/resolve')
def packet_resolve(body: PacketTarget):
    return {'target': body.target, 'address': resolve_ipv4(body.target)}

@app.post('/api/route-trace')
async def route_trace(body: TraceRequest):
    try:
        address = await asyncio.wait_for(asyncio.to_thread(resolve_ipv4, body.target), timeout=8)
    except asyncio.TimeoutError:
        raise HTTPException(504, 'DNS resolution timed out. Try an IPv4 address.')
    return StreamingResponse(trace_events(body.target, address, body.max_hops),
                             media_type='application/x-ndjson', headers={'Cache-Control':'no-store', 'X-Accel-Buffering':'no'})

@app.post('/api/packet-lab/probe')
def packet_probe(body: PacketAddress):
    return single_probe(body.address)

@app.post('/api/ping')
def ping(body: PingRequest):
    try:
        result = subprocess.run(['ping', '-c', str(body.count), body.target], capture_output=True, text=True, timeout=20)
    except (subprocess.TimeoutExpired, OSError) as e:
        raise HTTPException(503, f'Ping unavailable: {type(e).__name__}')
    samples = [float(x) for x in re.findall(r'time[=<]([0-9.]+)\s*ms', result.stdout)]
    loss_match = re.search(r'([\d.]+)% packet loss', result.stdout)
    if not samples and not loss_match:
        raise HTTPException(400, 'Ping failed: verify the target and network access.')
    return {'target': body.target, 'sent': body.count, 'received': len(samples),
            'latency_ms': round(mean(samples), 2) if samples else None,
            'jitter_ms': round(mean([abs(b-a) for a,b in zip(samples,samples[1:])]), 2) if len(samples)>1 else None,
            'loss_percent': float(loss_match.group(1)) if loss_match else round(100*(body.count-len(samples))/body.count, 1)}

@app.post('/api/throughput')
def throughput(body: ThroughputRequest):
    executable = shutil.which('iperf3')
    if not executable:
        raise HTTPException(503, 'iperf3 is not installed. Install it on this machine and start an iperf3 server on the test target.')
    results = {}
    for direction in ('upload', 'download'):
        cmd = [executable, '-c', body.target, '-p', str(body.port), '-t', str(body.duration), '-J']
        if direction == 'download':
            cmd.append('-R')
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=body.duration + 15)
            output = json.loads(result.stdout)
        except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as exc:
            raise HTTPException(503, f'iperf3 failed: {type(exc).__name__}')
        if result.returncode or output.get('error'):
            raise HTTPException(503, f"iperf3 {direction} test failed: {output.get('error', 'check server and network')}")
        received = output.get('end', {}).get('sum_received', {}).get('bits_per_second')
        if not isinstance(received, (int, float)) or received < 0:
            raise HTTPException(503, 'iperf3 did not return a valid receiver throughput.')
        results[direction + '_mbps'] = round(received / 1_000_000, 2)
    return {'target': body.target, 'port': body.port, 'duration': body.duration, **results}

class WalkSession(Survey):
    mode: str = 'location'
    width_m: float = Field(default=20, ge=1, le=1000)
    height_m: float = Field(default=15, ge=1, le=1000)
    @field_validator('mode')
    @classmethod
    def valid_mode(cls, value):
        if value not in ('location', 'floorplan'):
            raise ValueError('Choose automatic location or a floor plan.')
        return value

class WalkCapture(BaseModel):
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    accuracy_m: Optional[float] = Field(default=None, ge=0, le=50)
    position_timestamp: Optional[datetime] = None
    x: Optional[float] = Field(default=None, ge=0, le=1)
    y: Optional[float] = Field(default=None, ge=0, le=1)


def get_walk(sid):
    with db() as conn:
        row = conn.execute('SELECT * FROM walk_sessions WHERE id=?', (sid,)).fetchone()
        if not row:
            raise HTTPException(404, 'Walking survey not found')
        points = [json.loads(item['data']) for item in conn.execute('SELECT data FROM walk_samples WHERE session_id=? ORDER BY rowid', (sid,))]
    return {**dict(row), 'samples': points}

@app.get('/api/walks')
def list_walks():
    with db() as conn:
        return [dict(row) for row in conn.execute('SELECT id,name,mode,created_at FROM walk_sessions ORDER BY created_at DESC')]

@app.post('/api/walks', status_code=201)
def create_walk(body: WalkSession):
    sid = str(uuid4())
    with db() as conn:
        conn.execute('INSERT INTO walk_sessions VALUES (?,?,?,?,?,?,?,NULL,NULL)',
                     (sid, body.name.strip(), body.mode, datetime.now(timezone.utc).isoformat(), body.floorplan, body.width_m, body.height_m))
    return get_walk(sid)

@app.get('/api/walks/{sid}')
def walk(sid: str, radius: float = 5):
    if not 1 <= radius <= 30:
        raise HTTPException(422, 'Coverage radius must be between 1 and 30 metres.')
    session = get_walk(sid)
    return {**session, 'map': walking_map(session['samples'], session['mode'], session['width_m'], session['height_m'], radius)}

@app.post('/api/walks/{sid}/capture', status_code=201)
def capture_walk(sid: str, body: WalkCapture):
    session = get_walk(sid)
    if len(session['samples']) >= 10000:
        raise HTTPException(409, 'This session has 10,000 samples. Start a new session to keep recording.')
    if session['mode'] == 'location':
        if any(value is None for value in (body.latitude, body.longitude, body.accuracy_m, body.position_timestamp)):
            raise HTTPException(422, 'A fresh device location and accuracy estimate are required.')
        if body.position_timestamp.tzinfo is None or abs((datetime.now(timezone.utc) - body.position_timestamp).total_seconds()) > 20:
            raise HTTPException(422, 'The location fix is stale. Wait for a fresh location before recording.')
    elif body.x is None or body.y is None:
        raise HTTPException(422, 'Select your current position on the floor plan.')
    reading = agent('status')
    if not isinstance(reading.get('rssi'), (int, float)) or not -120 <= reading['rssi'] < 0:
        raise HTTPException(503, 'No connected Wi-Fi signal is available.')
    with db() as conn:
        # Re-read origin inside the transaction to keep concurrent captures in
        # one coordinate frame. Lock the write transaction before choosing it.
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT * FROM walk_sessions WHERE id=?', (sid,)).fetchone()
        if not row:
            raise HTTPException(404, 'Walking survey not found')
        if session['mode'] == 'location':
            origin_lat = row['origin_lat'] if row['origin_lat'] is not None else body.latitude
            origin_lon = row['origin_lon'] if row['origin_lon'] is not None else body.longitude
            conn.execute('UPDATE walk_sessions SET origin_lat=?,origin_lon=? WHERE id=?', (origin_lat, origin_lon, sid))
            x_m, y_m = local_metres(body.latitude, body.longitude, origin_lat, origin_lon)
        else:
            x_m, y_m = body.x * session['width_m'], (1 - body.y) * session['height_m']
        point = {**reading, 'id': str(uuid4()), 'timestamp': datetime.now(timezone.utc).isoformat(),
                 'x_m': round(x_m, 3), 'y_m': round(y_m, 3), 'latitude': body.latitude,
                 'longitude': body.longitude, 'accuracy_m': body.accuracy_m,
                 'position_timestamp': body.position_timestamp.isoformat() if body.position_timestamp else None,
                 'position_source': 'device location' if session['mode'] == 'location' else 'floor-plan selection'}
        conn.execute('INSERT INTO walk_samples VALUES (?,?,?)', (point['id'], sid, json.dumps(point)))
    return point

@app.delete('/api/walks/{sid}', status_code=204)
def delete_walk(sid: str):
    get_walk(sid)
    with db() as conn:
        conn.execute('DELETE FROM walk_sessions WHERE id=?', (sid,))
