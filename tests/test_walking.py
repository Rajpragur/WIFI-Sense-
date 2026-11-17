import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from test_live import module
from walking import walking_map, local_metres

class WalkingTests(unittest.TestCase):
    def setUp(self):
        with module.db() as conn:
            conn.execute('DELETE FROM walk_sessions')

    def test_unsurveyed_area_remains_blank(self):
        result = walking_map([{'x_m': 5, 'y_m': 5, 'rssi': -50}], 'floorplan', width=20, height=20, radius=2)
        self.assertGreater(len(result['cells']), 0)
        self.assertLess(len(result['cells']), result['columns'] * result['rows'] / 4)
        self.assertTrue(all(cell['rssi'] == -50 for cell in result['cells']))

    def test_map_expands_when_route_moves(self):
        start = [{'x_m':0, 'y_m':0, 'rssi':-50}]
        first = walking_map(start, 'location', radius=10)
        later = walking_map(start + [{'x_m':80, 'y_m':10, 'rssi':-75}], 'location', radius=10)
        self.assertGreater(later['bounds']['max_x'], first['bounds']['max_x'])
        self.assertGreater(later['sampled_area_m2'], first['sampled_area_m2'])

    def test_gps_projection_uses_origin(self):
        x, y = local_metres(25, 85.001, 25, 85)
        self.assertGreater(x, 90)
        self.assertLess(x, 110)
        self.assertEqual(y, 0)

    def test_capture_keeps_first_gps_origin(self):
        walk = module.create_walk(module.WalkSession(name='Test GPS walk', mode='location'))
        with patch.object(module, 'agent', return_value={'rssi':-65, 'interface':'en0'}):
            a = module.capture_walk(walk['id'], module.WalkCapture(latitude=25, longitude=85, accuracy_m=5, position_timestamp=datetime.now(timezone.utc)))
            b = module.capture_walk(walk['id'], module.WalkCapture(latitude=25.0001, longitude=85.0001, accuracy_m=5, position_timestamp=datetime.now(timezone.utc)))
        self.assertEqual((a['x_m'], a['y_m']), (0,0))
        self.assertGreater(b['x_m'], 0)
        self.assertGreater(b['y_m'], 0)
        session = module.get_walk(walk['id'])
        self.assertEqual(session['origin_lat'], 25)
        self.assertEqual(len(session['samples']), 2)

    def test_stale_gps_is_rejected_before_radio_capture(self):
        walk = module.create_walk(module.WalkSession(name='Stale GPS', mode='location'))
        with patch.object(module, 'agent') as radio:
            with self.assertRaises(module.HTTPException) as error:
                module.capture_walk(walk['id'], module.WalkCapture(latitude=25, longitude=85, accuracy_m=5, position_timestamp=datetime.now(timezone.utc) - timedelta(minutes=2)))
        self.assertEqual(error.exception.status_code, 422)
        radio.assert_not_called()
        self.assertEqual(len(module.get_walk(walk['id'])['samples']), 0)

    def test_indoor_selection_uses_physical_dimensions(self):
        walk = module.create_walk(module.WalkSession(name='Floor', mode='floorplan', width_m=20, height_m=10))
        with patch.object(module, 'agent', return_value={'rssi':-55}):
            point = module.capture_walk(walk['id'], module.WalkCapture(x=.25, y=.2))
        self.assertEqual(point['x_m'], 5)
        self.assertEqual(point['y_m'], 8)
        self.assertIsNone(point['latitude'])

if __name__ == '__main__':
    unittest.main()
