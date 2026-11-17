import asyncio
import json
import sys
import unittest
from unittest.mock import patch
from route_trace import parse_hop, can_reverse, trace_events

class RouteTests(unittest.TestCase):
    def test_observed_hop_and_reply_rtt(self):
        hop = parse_hop(' 3  203.0.113.7  12.345 ms', '1.1.1.1')
        self.assertEqual((hop['hop'],hop['address'],hop['rtt_ms']), (3,'203.0.113.7',12.345))
        self.assertEqual(hop['status'],'response')
        self.assertFalse(hop['reached'])
    def test_timeout_and_destination(self):
        self.assertEqual(parse_hop(' 2  *','1.1.1.1')['status'],'no_response')
        self.assertTrue(parse_hop(' 4 1.1.1.1 4.1 ms','1.1.1.1')['reached'])
        self.assertFalse(parse_hop(' 4 1.1.1.1 4.1 ms !H','1.1.1.1')['reached'])
        self.assertIsNone(parse_hop('traceroute to 1.1.1.1', '1.1.1.1'))
    def test_private_addresses_are_not_sent_for_external_ptr(self):
        self.assertFalse(can_reverse('10.1.2.3'))
        self.assertTrue(can_reverse('1.1.1.1'))
    def test_missing_traceroute_gives_error_event(self):
        async def collect():
            with patch('route_trace.shutil.which', return_value=None):
                return [json.loads(x) async for x in trace_events('localhost','127.0.0.1',2)]
        self.assertEqual(asyncio.run(collect())[0]['type'],'error')


class RouteCancellationTests(unittest.IsolatedAsyncioTestCase):
    async def test_closing_stream_stops_running_traceroute(self):
        from types import SimpleNamespace
        class Stream:
            def __init__(self): self.calls=0
            async def readline(self):
                self.calls += 1
                if self.calls == 1:return b' 1  10.0.0.1  3.0 ms\n'
                await asyncio.Event().wait()
        class Process:
            def __init__(self): self.returncode=None;self.stdout=Stream();self.terminated=False
            def terminate(self):self.terminated=True;self.returncode=-15
            def kill(self):self.returncode=-9
            async def wait(self):return self.returncode
        process=Process()
        async def spawn(*args,**kwargs):return process
        with patch('route_trace.shutil.which',return_value='/usr/sbin/traceroute'),patch('route_trace.asyncio.create_subprocess_exec',side_effect=spawn):
            events=trace_events('1.1.1.1','1.1.1.1',8)
            self.assertEqual(json.loads(await events.__anext__())['type'],'start')
            self.assertEqual(json.loads(await events.__anext__())['type'],'hop')
            await events.aclose()
        self.assertTrue(process.terminated)

class RouteStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_hop_and_reverse_name_events_are_streamed(self):
        class Stream:
            def __init__(self):self.lines=iter([b'traceroute to 1.1.1.1\n', b' 1 1.1.1.1 7.5 ms\n', b''])
            async def readline(self):return next(self.lines)
        class Process:
            def __init__(self):self.stdout=Stream();self.returncode=None
            async def wait(self):self.returncode=0;return 0
        async def spawn(*args,**kwargs):return Process()
        async def reverse(address):return 'one.one.one.one'
        with patch('route_trace.shutil.which',return_value='/usr/sbin/traceroute'), patch('route_trace.asyncio.create_subprocess_exec',side_effect=spawn), patch('route_trace.reverse_lookup',side_effect=reverse):
            events=[json.loads(line) async for line in trace_events('one.one.one.one','1.1.1.1',2)]
        self.assertEqual([event['type'] for event in events],['start','hop','hostname','complete'])
        self.assertEqual(events[2]['hostname'],'one.one.one.one')
        self.assertTrue(events[-1]['reached'])

if __name__ == '__main__':unittest.main()
