"""
SnoozeOps Data Profiler.
Profiles columns, types, missing rates, duplicates, and statistical distributions.
"""

import math
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

def safe_round(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)
    except (ValueError, TypeError):
        return None

def profile_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    total_rows = len(df)
    total_cols = len(df.columns)
    
    if total_rows == 0:
        return {
            "total_rows": 0,
            "total_columns": 0,
            "duplicate_rows": 0,
            "total_cells": 0,
            "total_missing_cells": 0,
            "hygiene_score": 100.0,
            "columns": []
        }

    # Count exact duplicates (excluding ground-truth metadata columns if present)
    data_cols = [c for c in df.columns if not c.startswith("_")]
    duplicate_rows = int(df.duplicated(subset=data_cols).sum())
    total_cells = total_rows * len(data_cols)
    total_missing = int(df[data_cols].isnull().sum().sum())
    
    columns_profile = []
    
    for col in data_cols:
        series = df[col]
        null_count = int(series.isnull().sum())
        null_pct = round((null_count / total_rows) * 100, 2)
        unique_count = int(series.nunique(dropna=True))
        
        # Determine logical data type
        col_type = "string"
        stats = {}
        distribution = []
        
        # Check if numeric
        numeric_series = pd.to_numeric(series.dropna(), errors="coerce")
        valid_numeric_count = numeric_series.notnull().sum()
        
        # If over 80% of non-null values can be parsed as numbers
        non_null_count = total_rows - null_count
        if non_null_count > 0 and (valid_numeric_count / non_null_count) >= 0.8:
            col_type = "numeric"
            valid_nums = numeric_series.dropna()
            if len(valid_nums) > 0:
                q1 = float(valid_nums.quantile(0.25))
                median = float(valid_nums.median())
                q3 = float(valid_nums.quantile(0.75))
                iqr = q3 - q1
                mean = float(valid_nums.mean())
                std = float(valid_nums.std()) if len(valid_nums) > 1 else 0.0
                min_val = float(valid_nums.min())
                max_val = float(valid_nums.max())
                skew = float(valid_nums.skew()) if len(valid_nums) > 2 and not math.isnan(valid_nums.skew()) else 0.0
                
                # Distribution histogram bins (10 bins)
                try:
                    counts, bin_edges = np.histogram(valid_nums, bins=min(10, max(2, len(valid_nums.unique()))))
                    distribution = [
                        {
                            "bin_start": safe_round(bin_edges[i]),
                            "bin_end": safe_round(bin_edges[i+1]),
                            "count": int(counts[i])
                        }
                        for i in range(len(counts))
                    ]
                except Exception:
                    distribution = []
                
                stats = {
                    "min": safe_round(min_val),
                    "max": safe_round(max_val),
                    "mean": safe_round(mean),
                    "median": safe_round(median),
                    "std": safe_round(std),
                    "q1": safe_round(q1),
                    "q3": safe_round(q3),
                    "iqr": safe_round(iqr),
                    "skewness": safe_round(skew)
                }
        else:
            # Check if datetime
            try:
                date_parsed = pd.to_datetime(series.dropna(), format="mixed", errors="coerce")
                if date_parsed.notnull().sum() / max(1, non_null_count) >= 0.8:
                    col_type = "datetime"
                    stats = {
                        "min": str(date_parsed.min()),
                        "max": str(date_parsed.max())
                    }
            except Exception:
                pass
                
            if col_type == "string":
                # Check top frequent categories
                top_vals = series.value_counts(dropna=True).head(5)
                distribution = [
                    {"label": str(k), "count": int(v)} for k, v in top_vals.items()
                ]
                stats = {
                    "top_value": str(top_vals.index[0]) if len(top_vals) > 0 else None,
                    "top_frequency": int(top_vals.iloc[0]) if len(top_vals) > 0 else 0
                }

        columns_profile.append({
            "name": col,
            "type": col_type,
            "null_count": null_count,
            "null_percentage": null_pct,
            "unique_count": unique_count,
            "stats": stats,
            "distribution": distribution
        })

    # Hygiene score calculation (penalize missingness and duplicates)
    missing_ratio = (total_missing / max(1, total_cells))
    dup_ratio = (duplicate_rows / max(1, total_rows))
    hygiene_score = max(0.0, min(100.0, round(100.0 - (missing_ratio * 40.0 + dup_ratio * 30.0), 1)))

    return {
        "total_rows": total_rows,
        "total_columns": len(data_cols),
        "duplicate_rows": duplicate_rows,
        "total_cells": total_cells,
        "total_missing_cells": total_missing,
        "hygiene_score": hygiene_score,
        "columns": columns_profile
    }
