import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_public_bundle import PROFILES, _balanced_rows, _joint_pairs


class PublicBundleTest(unittest.TestCase):
    def test_public_profile_keeps_group_evidence_for_all_evidence_types(self):
        profile = PROFILES["public"]
        self.assertEqual(profile["feature_examples_per_group"], 1)
        self.assertEqual(profile["joint_examples_per_group"], 1)
        self.assertEqual(profile["coactivation_examples_per_group"], 1)

    def test_balanced_rows_keep_each_group_and_sampling_mode(self):
        rows = [
            {"id": 0, "group": "en", "selection_kind": "strongest"},
            {"id": 1, "group": "en", "selection_kind": "strongest"},
            {"id": 2, "group": "de", "selection_kind": "random_present"},
            {"id": 3, "group": "fr", "selection_kind": "near_boundary"},
            {"id": 4, "group": "de", "selection_kind": "strongest"},
        ]

        kept = _balanced_rows(rows, first=1, per_group=1, per_mode=1)
        groups = {row["group"] for row in kept}
        modes = {row["selection_kind"] for row in kept}

        self.assertEqual(groups, {"en", "de", "fr"})
        self.assertEqual(modes, {"strongest", "random_present", "near_boundary"})
        self.assertEqual(len({row["id"] for row in kept}), len(kept))

    def test_balanced_rows_keep_evidence_for_each_signed_pole(self):
        rows = [
            {"id": 0, "pole": "positive"},
            {"id": 1, "pole": "positive"},
            {"id": 2, "pole": "negative"},
        ]

        kept = _balanced_rows(rows, first=1)

        self.assertEqual({row["pole"] for row in kept}, {"positive", "negative"})
        self.assertEqual([row["id"] for row in kept], [0, 2])

    def test_negative_joint_pairs_follow_the_negative_elicitation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "elicitation_negative.json").write_text(json.dumps({"edges": [
                {"px": 3, "cy": 7, "l2": 1.2},
                {"px": 3, "cy": 8, "l2": -0.4},
            ]}))

            pairs = _joint_pairs(
                root, "elicitation_negative.json", include_conditional=False)

            self.assertEqual(pairs, {(3, 7)})


if __name__ == "__main__":
    unittest.main()
