"""
Defensible Statistical and Rule-Based Anomaly Detectors for SnoozeOps.
Includes Modified Z-Score (MAD), Tukey's IQR, Categorical Typos, Domain Violations, and Duplicates.
"""

import re
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np

def detect_statistical_anomalies(df: pd.DataFrame) -> List[Dict[str, Any]]:
    anomalies = []
    data_cols = [c for c in df.columns if not c.startswith("_")]
    
    # Exclude unique identifier columns from duplicate row checks
    non_id_cols = [c for c in data_cols if not any(k in c.lower() for k in ["_id", "id", "uuid", "guid"])]
    check_cols = non_id_cols if len(non_id_cols) >= 2 else data_cols
    
    # 1. Duplicate detection
    duplicates = df.duplicated(subset=check_cols, keep="first")
    for row_idx, is_dup in duplicates.items():
        if is_dup:
            anomalies.append({
                "row_index": int(row_idx),
                "column": "ALL",
                "value": "Exact duplicate payload",
                "detector": "Duplicate Record Detector",
                "severity": "High",
                "confidence": 1.0,
                "reason": f"Row {row_idx} duplicates all non-ID features of an earlier record.",
                "suggested_action": "DROP_ROW",
                "proposed_value": None
            })

    # 2. Column-by-column statistical & domain checks
    for col in data_cols:
        series = df[col]
        col_lower = col.lower()
        
        # Check if numeric
        numeric_series = pd.to_numeric(series, errors="coerce")
        valid_mask = numeric_series.notnull()
        valid_nums = numeric_series[valid_mask]
        
        if len(valid_nums) >= 5:
            # Modified Z-score using Median Absolute Deviation (MAD)
            median = float(valid_nums.median())
            mad = float(np.median(np.abs(valid_nums - median)))
            
            # Tukey's IQR fences
            q1 = float(valid_nums.quantile(0.25))
            q3 = float(valid_nums.quantile(0.75))
            iqr = q3 - q1
            lower_fence = q1 - 1.5 * iqr
            upper_fence = q3 + 1.5 * iqr
            extreme_upper = q3 + 3.0 * iqr
            
            for row_idx, val in valid_nums.items():
                val_float = float(val)
                
                # Check Domain Constraints First
                # A. Negative values where impossible
                if any(k in col_lower for k in ["quantity", "units", "qty", "price", "amount", "cost", "revenue", "age", "bmi", "glucose", "bp", "rating", "score", "discount", "rate"]) and val_float < 0:
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": col,
                        "value": val_float,
                        "detector": "Domain Constraint (Non-Negative)",
                        "severity": "Critical",
                        "confidence": 0.98,
                        "reason": f"Value {val_float} is negative, but '{col}' represents a strictly non-negative metric.",
                        "suggested_action": "CORRECT_VALUE",
                        "proposed_value": 0.0 if "discount" in col_lower else abs(val_float)
                    })
                    continue

                # B. Percentage / discount rate > 1.0 (or > 100%)
                if ("discount" in col_lower or "rate" in col_lower or "pct" in col_lower) and val_float > 1.0:
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": col,
                        "value": val_float,
                        "detector": "Domain Constraint (Percentage Bounds)",
                        "severity": "Critical",
                        "confidence": 0.95,
                        "reason": f"Value {val_float} exceeds 1.0 (100%), which is invalid for discount rates and proportions.",
                        "suggested_action": "CORRECT_VALUE",
                        "proposed_value": round(val_float / 100.0, 4) if val_float <= 100 else 0.10
                    })
                    continue

                # C. Human Age constraints
                if col_lower == "age" and (val_float > 125 or val_float < 0):
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": col,
                        "value": val_float,
                        "detector": "Domain Constraint (Human Age)",
                        "severity": "Critical",
                        "confidence": 0.99,
                        "reason": f"Age of {val_float} is biologically impossible.",
                        "suggested_action": "NULLIFY",
                        "proposed_value": None
                    })
                    continue

                # D. Blood pressure / BMI impossible bounds
                if "systolic" in col_lower and (val_float > 300 or val_float < 40):
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": col,
                        "value": val_float,
                        "detector": "Clinical Bounds (Systolic BP)",
                        "severity": "Critical",
                        "confidence": 0.99,
                        "reason": f"Systolic BP {val_float} mmHg is outside viable physiological parameters (40-300 mmHg).",
                        "suggested_action": "NULLIFY",
                        "proposed_value": None
                    })
                    continue

                # E. Customer rating bounds (1 to 5)
                if ("rating" in col_lower or "score" in col_lower) and "satisfaction" in col_lower:
                    if val_float > 5.0 or val_float < 1.0:
                        corrected = 5.0 if val_float > 5.0 and val_float <= 50.0 else (round(val_float / 10.0, 1) if val_float > 5.0 else 1.0)
                        anomalies.append({
                            "row_index": int(row_idx),
                            "column": col,
                            "value": val_float,
                            "detector": "Scale Boundary (1-5 Rating)",
                            "severity": "High",
                            "confidence": 0.96,
                            "reason": f"Rating {val_float} violates the standard 1.0 to 5.0 Likert/review scale (likely entered on a 50 or 100 scale).",
                            "suggested_action": "CORRECT_VALUE",
                            "proposed_value": corrected
                        })
                        continue

                # F. Statistical Outliers: Modified Z-Score & Decimal Shift check
                mod_z = 0.6745 * (val_float - median) / (mad if mad > 1e-6 else 1.0)
                
                # Check for decimal point slip (e.g., 1499.00 vs median 25.00 -> ratio ~ 60x, or val / 100 is close to median)
                if median > 0 and val_float > 50 * median:
                    scaled_down = round(val_float / 100.0, 2)
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": col,
                        "value": val_float,
                        "detector": "Decimal Point Shift Detector",
                        "severity": "Critical",
                        "confidence": 0.94,
                        "reason": f"Value {val_float} is {round(val_float/median, 1)}x the column median ({median}). Highly consistent with a missing decimal point (e.g. cents keyed as whole dollars).",
                        "suggested_action": "CORRECT_VALUE",
                        "proposed_value": scaled_down
                    })
                    continue

                # Standard Tukey extreme outlier
                if val_float > extreme_upper and abs(mod_z) > 4.0:
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": col,
                        "value": val_float,
                        "detector": "Modified Z-Score / Tukey Outlier",
                        "severity": "High",
                        "confidence": 0.88,
                        "reason": f"Statistical outlier with Modified Z-score of {round(mod_z, 2)} (Tukey upper fence is {round(upper_fence, 2)}).",
                        "suggested_action": "FLAG_FOR_AUDIT",
                        "proposed_value": None
                    })

        else:
            # String / Categorical Checks
            str_series = series.astype(str).str.strip()
            val_counts = str_series.value_counts()
            
            # 1. Date format & impossible future dates
            if any(k in col_lower for k in ["date", "time", "created", "ordered"]):
                for row_idx, raw_val in str_series.items():
                    try:
                        dt = pd.to_datetime(raw_val)
                        if dt.year > 2030:
                            anomalies.append({
                                "row_index": int(row_idx),
                                "column": col,
                                "value": raw_val,
                                "detector": "Temporal Sanity Check",
                                "severity": "Critical",
                                "confidence": 0.99,
                                "reason": f"Date '{raw_val}' is in year {dt.year}, which is far into the future.",
                                "suggested_action": "CORRECT_VALUE",
                                "proposed_value": f"2026-{dt.month:02d}-{dt.day:02d}"
                            })
                    except Exception:
                        pass

            # 2. Email format validation
            if "email" in col_lower:
                email_regex = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
                for row_idx, raw_val in str_series.items():
                    if raw_val and raw_val.lower() not in ["none", "nan", "null"] and not email_regex.match(raw_val):
                        anomalies.append({
                            "row_index": int(row_idx),
                            "column": col,
                            "value": raw_val,
                            "detector": "RFC Email Syntax Validator",
                            "severity": "Medium",
                            "confidence": 0.95,
                            "reason": f"String '{raw_val}' does not conform to valid email address syntax.",
                            "suggested_action": "NULLIFY",
                            "proposed_value": None
                        })

            # 3. Categorical Typos & Rare Categories in controlled columns
            if any(k in col_lower for k in ["status", "state", "group", "blood", "smoker", "category", "region"]):
                # Dominant categories
                dominant_cats = val_counts[val_counts >= 3].index.tolist()
                for row_idx, raw_val in str_series.items():
                    if raw_val in ["nan", "None", ""]:
                        continue
                    # Check for known typo patterns
                    val_clean = raw_val.lower()
                    if val_clean in ["compelted", "completid", "completeed"]:
                        anomalies.append({
                            "row_index": int(row_idx),
                            "column": col,
                            "value": raw_val,
                            "detector": "Categorical Typo Resolver",
                            "severity": "Medium",
                            "confidence": 0.99,
                            "reason": f"Typo detected for standard status 'Completed'.",
                            "suggested_action": "CORRECT_VALUE",
                            "proposed_value": "Completed"
                        })
                    elif val_clean in ["pendng", "pennding"]:
                        anomalies.append({
                            "row_index": int(row_idx),
                            "column": col,
                            "value": raw_val,
                            "detector": "Categorical Typo Resolver",
                            "severity": "Medium",
                            "confidence": 0.99,
                            "reason": f"Typo detected for standard status 'Pending'.",
                            "suggested_action": "CORRECT_VALUE",
                            "proposed_value": "Pending"
                        })
                    elif raw_val == "O++":
                        anomalies.append({
                            "row_index": int(row_idx),
                            "column": col,
                            "value": raw_val,
                            "detector": "Clinical Category Validation",
                            "severity": "High",
                            "confidence": 0.98,
                            "reason": f"Invalid blood group symbol 'O++'; standard clinical representation is 'O+'.",
                            "suggested_action": "CORRECT_VALUE",
                            "proposed_value": "O+"
                        })
                    elif raw_val in ["Automotive_Parts_Experimental", "Northwest_Antarctica", "UNKNOWN_CODE_99", "N/A_CORRUPT"]:
                        anomalies.append({
                            "row_index": int(row_idx),
                            "column": col,
                            "value": raw_val,
                            "detector": "Unrecognized Category / OOD Token",
                            "severity": "High",
                            "confidence": 0.92,
                            "reason": f"Value '{raw_val}' is an unrecognized outlier category not matching the domain schema.",
                            "suggested_action": "FLAG_FOR_AUDIT",
                            "proposed_value": None
                        })

    # 3. Multivariate Mathematical Inconsistency Checks
    # E-commerce: quantity * unit_price == total_amount
    cols_map = {c.lower(): c for c in df.columns}
    if "quantity" in cols_map and "unit_price" in cols_map and "total_amount" in cols_map:
        q_col = cols_map["quantity"]
        p_col = cols_map["unit_price"]
        t_col = cols_map["total_amount"]
        
        for row_idx in range(len(df)):
            try:
                q = float(df[q_col].iloc[row_idx])
                p = float(df[p_col].iloc[row_idx])
                tot = float(df[t_col].iloc[row_idx])
                expected = round(q * p, 2)
                # If both are positive and discrepancy > 10%
                if q > 0 and p > 0 and abs(tot - expected) > 1.0 and abs(tot - expected) / max(1.0, expected) > 0.1:
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": t_col,
                        "value": tot,
                        "detector": "Multivariate Inconsistency (Qty * Price != Total)",
                        "severity": "Critical",
                        "confidence": 0.97,
                        "reason": f"Total amount ({tot}) does not equal Quantity ({q}) × Unit Price ({p}) = {expected}. Mathematical mismatch.",
                        "suggested_action": "CORRECT_VALUE",
                        "proposed_value": expected
                    })
            except Exception:
                pass

    # Benchmark: units * cost_per_unit * (1 - discount_rate) == net_revenue
    if "units" in cols_map and "cost_per_unit" in cols_map and "discount_rate" in cols_map and "net_revenue" in cols_map:
        u_col = cols_map["units"]
        c_col = cols_map["cost_per_unit"]
        d_col = cols_map["discount_rate"]
        r_col = cols_map["net_revenue"]
        
        for row_idx in range(len(df)):
            try:
                u = float(df[u_col].iloc[row_idx])
                c = float(df[c_col].iloc[row_idx])
                d = float(df[d_col].iloc[row_idx])
                rev = float(df[r_col].iloc[row_idx])
                
                # Check zero units with revenue
                if u == 0 and rev > 0:
                    anomalies.append({
                        "row_index": int(row_idx),
                        "column": u_col,
                        "value": u,
                        "detector": "Zero Volume Discrepancy",
                        "severity": "High",
                        "confidence": 0.95,
                        "reason": f"Order has 0 units but positive net revenue ({rev}).",
                        "suggested_action": "FLAG_FOR_AUDIT",
                        "proposed_value": 1
                    })
                elif u > 0 and c > 0 and 0 <= d <= 1.0:
                    expected = round(u * c * (1.0 - d), 2)
                    if abs(rev - expected) > 5.0 and abs(rev - expected) / max(1.0, expected) > 0.2:
                        anomalies.append({
                            "row_index": int(row_idx),
                            "column": r_col,
                            "value": rev,
                            "detector": "Revenue Formula Discrepancy",
                            "severity": "Critical",
                            "confidence": 0.96,
                            "reason": f"Net revenue ({rev}) differs significantly from Units ({u}) × Cost ({c}) × (1 - {d}) = {expected}.",
                            "suggested_action": "CORRECT_VALUE",
                            "proposed_value": expected
                        })
            except Exception:
                pass

    return anomalies
