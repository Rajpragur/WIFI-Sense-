import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from test_live import module
from packet_probe import single_probe, resolve_ipv4

class PacketProbeTests(unittest.TestCase):
    def test_reply_has_real_observed_fields(self):
        output = '64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.147 ms\n'
        with patch('packet_probe.subprocess.run', return_value=SimpleNamespace(stdout=output, returncode=0)) as runner:
            reply = single_probe('127.0.0.1')
        self.assertEqual((reply['rtt_ms'], reply['ttl'], reply['reply_bytes']), (.147, 64, 64))
        self.assertEqual(reply['status'], 'reply')
        self.assertEqual(runner.call_args.args[0][-1], '127.0.0.1')
    def test_no_reply_is_not_a_fabricated_rtt(self):
        output='1 packets transmitted, 0 packets received, 100.0% packet loss\n'
        with patch('packet_probe.subprocess.run', return_value=SimpleNamespace(stdout=output, returncode=2)):
            reply = single_probe('192.0.2.1')
        self.assertEqual(reply['status'], 'no_reply')
        self.assertIsNone(reply['rtt_ms'])
    def test_local_deadline_is_no_reply(self):
        with patch('packet_probe.subprocess.run', side_effect=subprocess.TimeoutExpired('ping', 5)):
            self.assertEqual(single_probe('192.0.2.1')['status'], 'no_reply')
    def test_invalid_or_malicious_target_is_rejected(self):
        with self.assertRaises(module.HTTPException):
            single_probe('-bad')
        with self.assertRaises(Exception):
            module.PacketTarget(target='1.1.1.1;evil')
    def test_dns_selects_ipv4_and_handles_failure(self):
        with patch('packet_probe.socket.getaddrinfo', return_value=[(2,2,17,'',('127.0.0.1',0))]):
            self.assertEqual(resolve_ipv4('localhost'), '127.0.0.1')
        with patch('packet_probe.socket.getaddrinfo', side_effect=__import__('socket').gaierror):
            with self.assertRaises(module.HTTPException):resolve_ipv4('missing.example')

if __name__ == '__main__':unittest.main()
