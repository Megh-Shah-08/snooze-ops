"""
Reproducible Benchmark Evaluator for SnoozeOps.
Executes live evaluation on a seeded ground-truth dataset against a Naive 3-Sigma Baseline.
Computes real Precision, Recall, F1, False Positives, and Latency (ms).
"""

import time
import os
import sys
from typing import Dict, Any, List
import pandas as pd
import numpy as np

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    from detectors.statistical import detect_statistical_anomalies
    from detectors.tabpfn_detector import detect_multivariate_and_tabpfn
except ImportError:
    from backend.detectors.statistical import detect_statistical_anomalies
    from backend.detectors.tabpfn_detector import detect_multivariate_and_tabpfn

def evaluate_baseline_zscore(df: pd.DataFrame, ground_truth: List[int]) -> Dict[str, Any]:
    """
    Standard Naive 3-Sigma Z-Score Detector.
    Only checks numeric columns for |(x - mean) / std| > 3.0.
    """
    start_time = time.perf_counter()
    data_cols = [c for c in df.columns if not c.startswith("_")]
    numeric_df = df[data_cols].select_dtypes(include=[np.number])
    
    flagged_rows = set()
    for col in numeric_df.columns:
        s = numeric_df[col].dropna()
        if len(s) > 3:
            mean = s.mean()
            std = s.std()
            if std > 1e-6:
                z = (s - mean).abs() / std
                outliers = s[z > 3.0].index.tolist()
                flagged_rows.update(outliers)
                
    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    # Compute metrics
    tp = sum(1 for idx in flagged_rows if idx < len(ground_truth) and ground_truth[idx] == 1)
    fp = sum(1 for idx in flagged_rows if idx < len(ground_truth) and ground_truth[idx] == 0)
    total_positives = sum(ground_truth)
    fn = total_positives - tp
    tn = len(ground_truth) - total_positives - fp
    
    precision = round(tp / max(1, (tp + fp)), 4)
    recall = round(tp / max(1, (tp + fn)), 4)
    f1 = round(2 * (precision * recall) / max(1e-6, (precision + recall)), 4) if (precision + recall) > 0 else 0.0
    
    return {
        "name": "Naive 3-Sigma Baseline",
        "description": "Standard standard-deviation z-score (|z| > 3.0) without domain bounds, MAD, or categorical checks.",
        "flagged_count": len(flagged_rows),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "runtime_ms": elapsed_ms,
        "flagged_indices": sorted(list(flagged_rows))
    }


def evaluate_snoozeops_engine(df: pd.DataFrame, ground_truth: List[int], use_tabpfn: bool = False) -> Dict[str, Any]:
    """
    SnoozeOps Hybrid Janitor Engine.
    Combines Modified Z-score (MAD), Tukey's IQR fences, domain range constraints,
    categorical typo resolution, and TabPFN / multivariate residuals.
    """
    start_time = time.perf_counter()
    
    # Run statistical & domain detectors
    stat_anomalies = detect_statistical_anomalies(df)
    
    # Run TabPFN / multivariate detector
    multi_anomalies, multi_meta = detect_multivariate_and_tabpfn(df, use_tabpfn_if_possible=use_tabpfn)
    
    all_anomalies = stat_anomalies + multi_anomalies
    flagged_rows = set(item["row_index"] for item in all_anomalies if item["row_index"] < len(ground_truth))
    
    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    # Compute metrics
    tp = sum(1 for idx in flagged_rows if ground_truth[idx] == 1)
    fp = sum(1 for idx in flagged_rows if ground_truth[idx] == 0)
    total_positives = sum(ground_truth)
    fn = total_positives - tp
    tn = len(ground_truth) - total_positives - fp
    
    precision = round(tp / max(1, (tp + fp)), 4)
    recall = round(tp / max(1, (tp + fn)), 4)
    f1 = round(2 * (precision * recall) / max(1e-6, (precision + recall)), 4) if (precision + recall) > 0 else 0.0
    
    return {
        "name": "SnoozeOps Hybrid Engine",
        "description": "Multi-tier detector: Robust MAD Z-scores, Tukey Fences, TabPFN/Multivariate Residuals, Domain Logic & Typo Matching.",
        "flagged_count": len(flagged_rows),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "runtime_ms": elapsed_ms,
        "tabpfn_active": multi_meta.get("tabpfn_active", False),
        "multivariate_detector": multi_meta.get("detector_used", ""),
        "flagged_indices": sorted(list(flagged_rows))
    }


def run_benchmark_evaluation(dataset_path: str = "backend/data/ground_truth_test_data.csv", use_tabpfn: bool = False) -> Dict[str, Any]:
    """
    Runs the reproducible benchmark on the seeded test dataset.
    """
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Benchmark dataset not found at {dataset_path}")
        
    df = pd.read_csv(dataset_path)
    if "_is_ground_truth_anomaly" not in df.columns:
        raise ValueError("Benchmark dataset must contain '_is_ground_truth_anomaly' column")
        
    ground_truth = df["_is_ground_truth_anomaly"].tolist()
    total_samples = len(df)
    total_anomalies = sum(ground_truth)
    
    baseline_results = evaluate_baseline_zscore(df, ground_truth)
    snoozeops_results = evaluate_snoozeops_engine(df, ground_truth, use_tabpfn=use_tabpfn)
    
    # Compute relative gains
    recall_gain = round((snoozeops_results["recall"] - baseline_results["recall"]) * 100, 1)
    f1_gain = round((snoozeops_results["f1_score"] - baseline_results["f1_score"]) * 100, 1)
    
    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataset_name": "Seeded Ground-Truth Benchmark (100 rows, 20 injected anomalies)",
        "dataset_rows": total_samples,
        "known_anomalies": total_anomalies,
        "clean_rows": total_samples - total_anomalies,
        "baseline": baseline_results,
        "snoozeops": snoozeops_results,
        "comparison": {
            "recall_improvement_pct": recall_gain,
            "f1_improvement_pct": f1_gain,
            "false_positive_reduction": baseline_results["false_positives"] - snoozeops_results["false_positives"],
            "summary": (
                f"SnoozeOps achieved {round(snoozeops_results['recall']*100, 1)}% recall vs "
                f"{round(baseline_results['recall']*100, 1)}% baseline (a {recall_gain:+0.1f}% gain) "
                f"while maintaining {round(snoozeops_results['precision']*100, 1)}% precision and {snoozeops_results['runtime_ms']}ms latency."
            )
        }
    }
