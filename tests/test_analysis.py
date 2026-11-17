import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from analysis import idw, analyze

class AnalysisTests(unittest.TestCase):
    def test_exact_and_midpoint(self):
        points = [{'x':0.,'y':0.,'rssi':-40}, {'x':1.,'y':0.,'rssi':-80}]
        self.assertEqual(idw(points, 0, 0), -40)
        self.assertEqual(idw(points, .5, 0), -60)
    def test_duplicates_not_leaked_in_cross_validation(self):
        pts = [{'x':0.,'y':0.,'rssi':-40}, {'x':0.,'y':0.,'rssi':-40}, {'x':.5,'y':0.,'rssi':-80}, {'x':1.,'y':0.,'rssi':-80}]
        self.assertEqual(analyze(pts,[])['mae'],30)
    def test_no_measurements_or_scans(self):
        result=analyze([],[])
        self.assertIsNone(result['weak_percent'])
        self.assertIsNone(result['candidate'])
        self.assertIsNone(result['recommended_channel'])
    def test_far_cells_remain_unknown_and_weak_fraction_is_mapped_area(self):
        result=analyze([{'x':.5,'y':.5,'rssi':-90}],[])
        self.assertLess(result['mapped_percent'], 100)
        self.assertTrue(any(cell['rssi'] is None for cell in result['grid']))
        self.assertEqual(result['weak_percent'], 100)
    def test_cross_validation_requires_three_distinct_locations(self):
        pts=[{'x':0.,'y':0.,'rssi':-40},{'x':0.,'y':0.,'rssi':-41},{'x':1.,'y':1.,'rssi':-80}]
        self.assertIsNone(analyze(pts,[])['mae'])
    def test_channel_overlap(self):
        networks=[{'band':'2.4 GHz','channel':6,'rssi':-50}, {'band':'5 GHz','channel':1,'rssi':-30}]
        result=analyze([],networks)
        self.assertEqual(result['recommended_channel'],1)
        self.assertGreater(result['channel_scores'][1]['score'],result['channel_scores'][0]['score'])
    def test_weak_area_candidate(self):
        result=analyze([{'x':.5,'y':.5,'rssi':-90}],[])
        self.assertEqual(result['weak_percent'],100)
        self.assertIsNotNone(result['candidate'])

if __name__ == '__main__': unittest.main()
