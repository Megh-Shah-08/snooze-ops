"""
Unit tests for SnoozeOps core engine.
Tests profiling, statistical detectors, TabPFN/multivariate integration,
reproducible benchmark evaluation, and cryptographic audit trail.
"""

import os
import sys
import unittest
import pandas as pd
import numpy as np

# Add project root and backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from backend.profiler import profile_dataframe
from backend.detectors.statistical import detect_statistical_anomalies
from backend.detectors.tabpfn_detector import detect_multivariate_and_tabpfn
from backend.llm_janitor import LLMJanitor
from backend.evaluator import run_benchmark_evaluation
from backend.audit import apply_reviewed_corrections, generate_provenance_audit_report, calculate_sha256

class TestSnoozeOpsCore(unittest.TestCase):
    def setUp(self):
        # Create a small controlled test DataFrame
        self.sample_df = pd.DataFrame({
            "order_id": ["ORD-1", "ORD-2", "ORD-3", "ORD-4", "ORD-5", "ORD-6"],
            "product": ["Mouse", "Keyboard", "Cable", "Monitor", "Desk", "Cable"],
            "quantity": [2, -5, 1, 1, 3, 1],  # Row 1 has negative quantity
            "unit_price": [25.00, 75.00, 1499.00, 200.00, 150.00, 15.00],  # Row 2 has decimal slip
            "status": ["Delivered", "Shipped", "compelted", "Processing", "Delivered", "Delivered"]  # Row 2 has typo
        })

    def test_profiler(self):
        profile = profile_dataframe(self.sample_df)
        self.assertEqual(profile["total_rows"], 6)
        self.assertEqual(profile["total_columns"], 5)
        self.assertGreaterEqual(profile["hygiene_score"], 0.0)
        
        # Check column types detected
        col_types = {c["name"]: c["type"] for c in profile["columns"]}
        self.assertEqual(col_types["quantity"], "numeric")
        self.assertEqual(col_types["unit_price"], "numeric")
        self.assertEqual(col_types["product"], "string")

    def test_statistical_detectors(self):
        anomalies = detect_statistical_anomalies(self.sample_df)
        flagged_cols = [(a["row_index"], a["column"], a["detector"]) for a in anomalies]
        
        # Row 1 (quantity = -5) should be caught as negative domain violation
        neg_flags = [a for a in anomalies if a["row_index"] == 1 and a["column"] == "quantity"]
        self.assertTrue(len(neg_flags) > 0, "Failed to detect negative quantity")
        self.assertEqual(neg_flags[0]["severity"], "Critical")
        self.assertEqual(neg_flags[0]["suggested_action"], "CORRECT_VALUE")

        # Row 2 (unit_price = 1499.00 vs median 75.00) should be caught as decimal slip
        decimal_flags = [a for a in anomalies if a["row_index"] == 2 and a["column"] == "unit_price"]
        self.assertTrue(len(decimal_flags) > 0, "Failed to detect decimal slip")

        # Row 2 (status = 'compelted') should be caught as categorical typo
        typo_flags = [a for a in anomalies if a["row_index"] == 2 and a["column"] == "status"]
        self.assertTrue(len(typo_flags) > 0, "Failed to detect status typo")
        self.assertEqual(typo_flags[0]["proposed_value"], "Completed")

    def test_multivariate_fallback(self):
        anomalies, meta = detect_multivariate_and_tabpfn(self.sample_df, use_tabpfn_if_possible=False)
        self.assertIn("detector_used", meta)
        self.assertFalse(meta["tabpfn_active"])

    def test_deterministic_llm_janitor(self):
        janitor = LLMJanitor()
        raw_anomalies = detect_statistical_anomalies(self.sample_df)
        enhanced, meta = janitor._deterministic_fallback(raw_anomalies)
        
        self.assertEqual(len(enhanced), len(raw_anomalies))
        self.assertTrue(meta["is_fallback"])
        self.assertIn("Deterministic", meta["engine"])
        
        for item in enhanced:
            self.assertTrue(len(item["explanation"]) > 20, "Explanation should be informative and grounded")
            self.assertIn(item["suggested_action"], ["CORRECT_VALUE", "NULLIFY", "DROP_ROW", "FLAG_FOR_AUDIT"])

    def test_reproducible_benchmark_evaluation(self):
        benchmark_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "data", "ground_truth_test_data.csv"))
        res = run_benchmark_evaluation(benchmark_path, use_tabpfn=False)
        
        self.assertEqual(res["dataset_rows"], 100)
        self.assertEqual(res["known_anomalies"], 20)
        
        snoozeops = res["snoozeops"]
        baseline = res["baseline"]
        
        # Verify SnoozeOps dramatically outperforms naive 3-sigma baseline
        self.assertGreater(snoozeops["recall"], baseline["recall"])
        self.assertEqual(snoozeops["precision"], 1.0)
        self.assertEqual(snoozeops["recall"], 1.0)
        self.assertEqual(snoozeops["false_positives"], 0)
        self.assertGreater(snoozeops["runtime_ms"], 0)

    def test_audit_and_data_preservation(self):
        reviewed_actions = [
            {
                "row_index": 1,
                "column": "quantity",
                "action": "APPROVE",
                "suggested_action": "CORRECT_VALUE",
                "proposed_value": 5
            },
            {
                "row_index": 2,
                "column": "status",
                "action": "APPROVE",
                "suggested_action": "CORRECT_VALUE",
                "proposed_value": "Completed"
            }
        ]
        
        cleaned_df, audit_summary = apply_reviewed_corrections(self.sample_df, reviewed_actions)
        
        # Original df must be preserved unchanged
        self.assertEqual(self.sample_df.at[1, "quantity"], -5)
        self.assertEqual(self.sample_df.at[2, "status"], "compelted")
        
        # Cleaned df must reflect approved corrections
        self.assertEqual(cleaned_df.at[1, "quantity"], 5)
        self.assertEqual(cleaned_df.at[2, "status"], "Completed")
        
        # Provenance report test
        orig_csv = self.sample_df.to_csv(index=False)
        clean_csv = cleaned_df.to_csv(index=False)
        report = generate_provenance_audit_report(orig_csv, clean_csv, audit_summary)
        
        self.assertEqual(report["original_sha256"], calculate_sha256(orig_csv))
        self.assertEqual(report["cleaned_sha256"], calculate_sha256(clean_csv))
        self.assertNotEqual(report["original_sha256"], report["cleaned_sha256"])
        self.assertIn("SnoozeOps Data Cleaning & Provenance Audit Report", report["markdown_report"])


if __name__ == "__main__":
    unittest.main()
