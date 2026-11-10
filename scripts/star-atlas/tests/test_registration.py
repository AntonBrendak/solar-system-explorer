"""Synthetic subpixel centroid registration checks."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from validate import measure_star_displacements, registration_strata


class RegistrationTest(unittest.TestCase):
    def test_tile_major_traversal_preserves_every_spatial_sample_once(self):
        for width,height in [(2048,1024),(8192,4096),(32768,16384),(2345,1789)]:
            actual = list(registration_strata(width,height))
            expected = {(x,y,min(512,width-x),min(512,height-y))
                        for y in range(0,height,512) for x in range(0,width,512)}
            self.assertEqual(set(actual),expected)
            self.assertEqual(len(actual),len(expected))

    @staticmethod
    def star(dx=0, dy=0):
        yy, xx = np.mgrid[:64, :64]
        background = .0001 + xx * .000001 + yy * .000002
        return background + .3 * np.exp(-((xx-31.2-dx)**2+(yy-30.4-dy)**2)/(2*.9**2))

    def test_recovers_real_subpixel_shift(self):
        records = measure_star_displacements(self.star(), self.star(.1, -.08))
        self.assertEqual(len(records), 1)
        self.assertAlmostEqual(records[0]["dx"], .1, delta=.015)
        self.assertAlmostEqual(records[0]["dy"], -.08, delta=.015)

    def test_large_shift_is_measured_instead_of_filtered_out(self):
        records = measure_star_displacements(self.star(), self.star(.5, 0))
        self.assertEqual(len(records), 1)
        self.assertTrue(records[0]["matched"])
        self.assertGreater(records[0]["error"], .25)

    def test_missing_star_is_an_unmatched_failure(self):
        records = measure_star_displacements(self.star(), np.zeros((64,64)))
        self.assertEqual(len(records), 1)
        self.assertFalse(records[0]["matched"])


if __name__ == "__main__":
    unittest.main()
