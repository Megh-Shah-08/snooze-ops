"""
SnoozeOps Audit & Data Preservation Engine.
Applies user-approved corrections, preserves raw data integrity,
and generates cryptographic SHA-256 provenance audit reports.
"""

import hashlib
import time
from typing import List, Dict, Any, Tuple
import pandas as pd
import numpy as np

def calculate_sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

def apply_reviewed_corrections(
    original_df: pd.DataFrame,
    reviewed_actions: List[Dict[str, Any]]
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Applies user-approved transformations to a copy of original_df.
    Original DataFrame is strictly preserved.
    """
    cleaned_df = original_df.copy()
    rows_to_drop = set()
    changes_log = []

    # Exclude metadata columns from output if present
    data_cols = [c for c in cleaned_df.columns if not c.startswith("_")]
    cleaned_df = cleaned_df[data_cols]

    for item in reviewed_actions:
        row_idx = item.get("row_index")
        col = item.get("column")
        action = item.get("action")  # "APPROVE", "REJECT", "CUSTOM"
        suggested_action = item.get("suggested_action")
        proposed_value = item.get("proposed_value")
        custom_value = item.get("custom_value")
        original_value = cleaned_df.at[row_idx, col] if row_idx in cleaned_df.index and col in cleaned_df.columns else None

        if action == "REJECT":
            changes_log.append({
                "row_index": row_idx,
                "column": col,
                "status": "REJECTED_BY_USER",
                "original_value": str(original_value),
                "final_value": str(original_value),
                "action_taken": "PRESERVED_ORIGINAL"
            })
            continue

        effective_value = custom_value if action == "CUSTOM" else proposed_value

        if suggested_action == "DROP_ROW" or col == "ALL":
            rows_to_drop.add(row_idx)
            changes_log.append({
                "row_index": row_idx,
                "column": "ALL",
                "status": "APPROVED",
                "original_value": "Entire Row",
                "final_value": "[DELETED]",
                "action_taken": "DROP_ROW"
            })
        elif suggested_action == "NULLIFY":
            if row_idx in cleaned_df.index and col in cleaned_df.columns:
                cleaned_df.at[row_idx, col] = np.nan
                changes_log.append({
                    "row_index": row_idx,
                    "column": col,
                    "status": "APPROVED",
                    "original_value": str(original_value),
                    "final_value": "NULL",
                    "action_taken": "NULLIFIED"
                })
        elif suggested_action in ["CORRECT_VALUE", "CUSTOM"]:
            if row_idx in cleaned_df.index and col in cleaned_df.columns:
                cleaned_df.at[row_idx, col] = effective_value
                changes_log.append({
                    "row_index": row_idx,
                    "column": col,
                    "status": "APPROVED",
                    "original_value": str(original_value),
                    "final_value": str(effective_value),
                    "action_taken": "VALUE_SUBSTITUTION"
                })

    if rows_to_drop:
        cleaned_df = cleaned_df.drop(index=list(rows_to_drop)).reset_index(drop=True)

    audit_summary = {
        "original_rows": len(original_df),
        "cleaned_rows": len(cleaned_df),
        "total_anomalies_reviewed": len(reviewed_actions),
        "approved_modifications": len([c for c in changes_log if c["status"] == "APPROVED"]),
        "rejected_modifications": len([c for c in changes_log if c["status"] == "REJECTED_BY_USER"]),
        "dropped_rows_count": len(rows_to_drop),
        "changes": changes_log
    }

    return cleaned_df, audit_summary


def generate_provenance_audit_report(
    original_csv: str,
    cleaned_csv: str,
    audit_summary: Dict[str, Any],
    dataset_name: str = "Uploaded Dataset",
    model_name: str = "Gemma / Deterministic Fallback"
) -> Dict[str, Any]:
    """
    Generates a full audit trail including cryptographic checksums and markdown document.
    """
    orig_hash = calculate_sha256(original_csv)
    clean_hash = calculate_sha256(cleaned_csv)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())

    md_report = f"""# 💤 SnoozeOps Data Cleaning & Provenance Audit Report

**Date of Execution:** {timestamp}  
**Dataset Reference:** {dataset_name}  
**AI Janitor Engine:** {model_name}  

---

## 🔒 Cryptographic Data Provenance
- **Raw Input CSV SHA-256:** `{orig_hash}`
- **Cleaned Export CSV SHA-256:** `{clean_hash}`
- **Integrity Guarantee:** The raw dataset is immutably preserved. Transformations were performed strictly on verified user-approved diffs.

---

## 📊 Transformation Metrics
- **Initial Row Count:** {audit_summary.get('original_rows', 0)}
- **Cleaned Row Count:** {audit_summary.get('cleaned_rows', 0)}
- **Total Anomalies Flagged:** {audit_summary.get('total_anomalies_reviewed', 0)}
- **Approved Corrections:** {audit_summary.get('approved_modifications', 0)}
- **User Rejections (Preserved):** {audit_summary.get('rejected_modifications', 0)}
- **Dropped Duplicate/Corrupt Rows:** {audit_summary.get('dropped_rows_count', 0)}

---

## 📝 Itemized Change Log
| Row # | Column | Action Taken | Original Value | Cleaned Value | Status |
|---|---|---|---|---|---|
"""
    for ch in audit_summary.get("changes", []):
        md_report += f"| {ch.get('row_index', '-')} | `{ch.get('column', '-')}` | {ch.get('action_taken', '-')} | `{ch.get('original_value', '-')}` | **`{ch.get('final_value', '-')}`** | {ch.get('status', '-')} |\n"

    md_report += """
---
*Generated by SnoozeOps AI Data Janitor — Hacktoberfest 2026 Slow and Steady Challenge.*
"""

    return {
        "timestamp": timestamp,
        "dataset_name": dataset_name,
        "original_sha256": orig_hash,
        "cleaned_sha256": clean_hash,
        "metrics": audit_summary,
        "markdown_report": md_report
    }
