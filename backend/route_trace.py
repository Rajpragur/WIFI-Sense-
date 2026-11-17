"""Bounded IPv4 traceroute, streamed as observed hops and optional PTR names."""
import asyncio
import contextlib
import ipaddress
import json
import re
import shutil

HOP_LINE = re.compile(r'^\s*(\d+)\s+(.*)$')
IPV4 = re.compile(r'(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])')
RTT = re.compile(r'(\d+(?:\.\d+)?)\s*ms\b', re.IGNORECASE)
PTR_NAME = re.compile(r'(?=.{1,253}$)[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?\.?$')


def parse_hop(line, destination):
    match = HOP_LINE.match(line.strip())
    if not match:
        return None
    number, rest = int(match.group(1)), match.group(2)
    addr = None
    for candidate in IPV4.findall(rest):
        try:
            addr = str(ipaddress.IPv4Address(candidate))
            break
        except ValueError:
            continue
    time_match = RTT.search(rest)
    indication = re.search(r'![A-Za-z0-9]+', rest)
    return {'hop': number, 'address': addr, 'rtt_ms': float(time_match.group(1)) if time_match else None,
            'status': 'response' if addr else 'no_response',
            'reached': addr == destination and not indication,
            'note': indication.group(0) if indication else None, 'hostname': None}


def can_reverse(address):
    # Avoid submitting internal addresses to an external resolver.
    try:
        return ipaddress.IPv4Address(address).is_global
    except ValueError:
        return False


async def stop_process(process):
    if process and process.returncode is None:
        with contextlib.suppress(ProcessLookupError):
            process.terminate()
        try:
            await asyncio.wait_for(process.wait(), 1)
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                process.kill()
            await process.wait()


async def reverse_lookup(address):
    dig = shutil.which('dig')
    if not dig or not can_reverse(address):
        return None
    process = None
    try:
        process = await asyncio.create_subprocess_exec(dig, '+short', '+time=1', '+tries=1', '-x', address,
                                                       stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        output, _ = await asyncio.wait_for(process.communicate(), timeout=2)
        if process.returncode != 0:
            return None
        lines = output.decode('utf-8', errors='replace').splitlines()
        for line in reversed(lines):
            hostname = line.strip().rstrip('.')
            if PTR_NAME.fullmatch(hostname):
                return hostname
        return None
    except (asyncio.TimeoutError, OSError):
        return None
    finally:
        await stop_process(process)


def encode_event(value):
    return json.dumps(value, separators=(',', ':')) + '\n'


async def trace_events(target, destination, max_hops=16):
    executable = shutil.which('traceroute')
    if not executable:
        yield encode_event({'type': 'error', 'message': 'The system traceroute utility is not available.'})
        return
    queue = asyncio.Queue()
    process = None
    ptr_tasks = []
    lookup_by_address = {}
    reached = False
    hops = 0

    async def lookup(hop, address):
        task = lookup_by_address.get(address)
        if task is None:
            task = asyncio.create_task(reverse_lookup(address))
            lookup_by_address[address] = task
        name = await task
        if name:
            await queue.put({'type': 'hostname', 'hop': hop, 'address': address, 'hostname': name})

    async def produce():
        nonlocal process, reached, hops
        try:
            await queue.put({'type': 'start', 'target': target, 'address': destination, 'max_hops': max_hops, 'protocol': 'IPv4 ICMP'})
            process = await asyncio.create_subprocess_exec(executable, '-n', '-I', '-m', str(max_hops), '-q', '1', '-w', '1', destination,
                                                           stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            async def consume():
                nonlocal reached, hops
                while True:
                    line = await process.stdout.readline()
                    if not line:
                        break
                    hop = parse_hop(line.decode('utf-8', errors='replace'), destination)
                    if not hop:
                        continue
                    hops += 1
                    reached = reached or hop['reached']
                    await queue.put({'type': 'hop', **hop})
                    if hop['address'] and can_reverse(hop['address']):
                        ptr_tasks.append(asyncio.create_task(lookup(hop['hop'], hop['address'])))
                status = await process.wait()
                if ptr_tasks:
                    await asyncio.gather(*ptr_tasks, return_exceptions=True)
                if hops == 0:
                    await queue.put({'type': 'error', 'message': 'Traceroute produced no hop results. Check network access and system permissions.'})
                elif status != 0:
                    await queue.put({'type': 'error', 'message': 'Traceroute stopped early after reporting some hops.'})
                else:
                    await queue.put({'type': 'complete', 'reached': reached, 'hops': hops, 'exit_code': status})
            await asyncio.wait_for(consume(), timeout=max_hops * 3 + 10)
        except asyncio.TimeoutError:
            await queue.put({'type': 'error', 'message': 'Traceroute exceeded its time limit. Try fewer hops.'})
        except OSError:
            await queue.put({'type': 'error', 'message': 'Could not start the system traceroute utility.'})
        finally:
            await stop_process(process)
            for task in ptr_tasks:
                if not task.done():task.cancel()
            for task in lookup_by_address.values():
                if not task.done():task.cancel()
            if ptr_tasks or lookup_by_address:
                await asyncio.gather(*ptr_tasks, *lookup_by_address.values(), return_exceptions=True)
            await queue.put(None)

    producer = asyncio.create_task(produce())
    try:
        while True:
            event = await queue.get()
            if event is None:
                break
            yield encode_event(event)
    finally:
        if not producer.done():producer.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await producer
