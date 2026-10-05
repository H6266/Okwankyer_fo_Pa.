import unittest

from training.create_splits import balance_report, create_splits


class CreateSplitsTests(unittest.TestCase):
    def setUp(self):
        self.examples = [
            {"speaker_id": f"speaker-{i}", "intent": "SEND_MONEY", "language": "en"}
            for i in range(20)
        ]

    def test_missing_real_speaker_id_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "real speaker_id"):
            create_splits([{"intent": "SEND_MONEY"}])

    def test_splits_are_deterministic_and_speaker_disjoint(self):
        first = create_splits(self.examples, seed=17)
        second = create_splits(self.examples, seed=17)
        self.assertEqual(first, second)
        speakers = [{row["speaker_id"] for row in part} for part in first]
        self.assertFalse(speakers[0] & speakers[1])
        self.assertFalse(speakers[0] & speakers[2])
        self.assertFalse(speakers[1] & speakers[2])

    def test_report_counts_samples_and_speakers(self):
        splits = create_splits(self.examples, seed=17)
        report = balance_report(dict(zip(("train", "val", "test"), splits)))
        self.assertEqual(sum(item["samples"] for item in report.values()), 20)
        self.assertEqual(sum(item["speakers"] for item in report.values()), 20)


if __name__ == "__main__":
    unittest.main()
