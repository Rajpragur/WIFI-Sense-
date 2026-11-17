"""Failure handling, live sample persistence and throughput argument tests."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parents[1] / 'backend'
sys.path.insert(0, str(BACKEND))
_TEMP = tempfile.TemporaryDirectory()
_previous = os.environ.get('WIFISENSE_DB')
os.environ['WIFISENSE_DB'] = str(Path(_TEMP.name) / 'test.db')
spec = importlib.util.spec_from_file_location('wifisense_test_main', BACKEND / 'main.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
if _previous is None:
    del os.environ['WIFISENSE_DB']
else:
    os.environ['WIFISENSE_DB'] = _previous

class LiveTests(unittest.TestCase):
    def setUp(self):
        with module.db() as conn:
            conn.execute('DELETE FROM live_samples')

    def test_records_actual_agent_fields_and_history_order(self):
        with patch.object(module, 'agent', side_effect=[{'rssi': -61, 'noise_dbm': -95, 'snr_db': 34}, {'rssi': -63}]):
            first = module.live()
            second = module.live()
        self.assertEqual(first['current']['noise_dbm'], -95)
        self.assertEqual([x['rssi'] for x in second['history']], [-61, -63])
        self.assertIn('timestamp', second['current'])

    def test_disconnected_radio_never_creates_fake_reading(self):
        with patch.object(module, 'agent', return_value={'rssi': 0}):
            with self.assertRaises(module.HTTPException) as error:
                module.live()
        self.assertEqual(error.exception.status_code, 503)
        with module.db() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM live_samples').fetchone()[0], 0)

    def test_agent_failure_does_not_replay_old_data_as_live(self):
        with patch.object(module, 'agent', side_effect=module.HTTPException(503, 'Radio unavailable')):
            with self.assertRaises(module.HTTPException):
                module.live()

    def test_throughput_receiver_rates_and_reverse_flag(self):
        outputs = [SimpleNamespace(returncode=0, stdout=json.dumps({'end': {'sum_received': {'bits_per_second': rate}}})) for rate in (10_000_000, 20_000_000)]
        with patch.object(module.shutil, 'which', return_value='/test/iperf3'), patch.object(module.subprocess, 'run', side_effect=outputs) as process:
            result = module.throughput(module.ThroughputRequest(target='127.0.0.1', duration=1))
        self.assertEqual(result['upload_mbps'], 10)
        self.assertEqual(result['download_mbps'], 20)
        self.assertNotIn('-R', process.call_args_list[0].args[0])
        self.assertIn('-R', process.call_args_list[1].args[0])

    def test_no_5ghz_score_masquerades_as_24ghz(self):
        response = module.channel_analysis([module.Network(channel=44, band='5 GHz', rssi=-45)])
        self.assertEqual(response['scores'], [])
        self.assertIsNone(response['recommended_channel'])

if __name__ == '__main__':
    unittest.main()
