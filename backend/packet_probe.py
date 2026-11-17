"""Observe ordinary IPv4 ICMP echo probes through the system ping utility.

The application is not a packet sniffer. The operating system creates each
packet, and we parse only the utility's own diagnostic output.
"""
import ipaddress
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone

from fastapi import HTTPException


def resolve_ipv4(target):
    try:
        results = socket.getaddrinfo(target, None, family=socket.AF_INET, type=socket.SOCK_DGRAM)
    except socket.gaierror:
        raise HTTPException(400, 'Could not resolve an IPv4 address for this target. Check the hostname or try an IPv4 address.')
    addresses = list(dict.fromkeys(item[4][0] for item in results))
    if not addresses:
        raise HTTPException(400, 'This target has no IPv4 address. The packet lab currently supports IPv4 only.')
    return addresses[0]


def single_probe(address):
    try:
        ipaddress.IPv4Address(address)
    except ValueError:
        raise HTTPException(422, 'Enter a valid IPv4 address.')
    # macOS uses milliseconds for -W, Linux uses seconds. A hard deadline
    # bounds even unusual platform / network behavior.
    deadline = '2000' if sys.platform == 'darwin' else '2'
    started = datetime.now(timezone.utc).isoformat()
    try:
        result = subprocess.run(['ping', '-n', '-c', '1', '-W', deadline, address], capture_output=True, text=True, timeout=5)
    except subprocess.TimeoutExpired:
        return {'address': address, 'started_at': started, 'status': 'no_reply', 'rtt_ms': None, 'ttl': None, 'reply_bytes': None, 'icmp_sequence': None, 'note': 'No reply received before the local deadline.'}
    except OSError:
        raise HTTPException(503, 'The system ping utility is unavailable.')
    output = result.stdout
    reply = re.search(r'(\d+) bytes from ([^\s:]+):.*?icmp_seq[= ](\d+).*?ttl[= ](\d+).*?time([=<])\s*([\d.]+)\s*ms', output, re.IGNORECASE)
    if reply:
        size, responder, seq, ttl, relation, rtt = reply.groups()
        return {'address': address, 'started_at': started, 'status': 'reply', 'rtt_ms': float(rtt),
                'rtt_relation': relation, 'ttl': int(ttl), 'reply_bytes': int(size), 'icmp_sequence': int(seq), 'responder': responder}
    if re.search(r'\b1 packets? transmitted,\s*0 (?:packets? )?received', output, re.IGNORECASE):
        return {'address': address, 'started_at': started, 'status': 'no_reply', 'rtt_ms': None, 'ttl': None, 'reply_bytes': None, 'icmp_sequence': None, 'note': 'No echo reply received.'}
    raise HTTPException(502, 'The system ping failed. Check the target and network connection.')
