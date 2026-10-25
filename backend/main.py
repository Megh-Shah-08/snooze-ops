"""
SnoozeOps FastAPI Backend.
Powers data profiling, statistical/TabPFN anomaly detection, Gemma LLM janitor fixes,
reproducible benchmarking, and cryptographic audit export.
"""

import os
import sys
import io
import time
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np

# Add current directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from profiler import profile_dataframe
from detectors.statistical import detect_statistical_anomalies
from detectors.tabpfn_detector import detect_multivariate_and_tabpfn
from llm_janitor import LLMJanitor
from evaluator import run_benchmark_evaluation
from audit import apply_reviewed_corrections, generate_provenance_audit_report

app = FastAPI(
    title="SnoozeOps API",
    description="You snooze. Your data gets cleaned. AI Data Janitor for Hacktoberfest 2026.",
    version="1.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

janitor = LLMJanitor()

SAMPLE_DATASETS = {
    "ecommerce": {
        "id": "ecommerce",
        "name": "E-Commerce Retail Orders (Dirty)",
        "filename": "ecommerce_orders_dirty.csv",
        "description": "45 rows of transactional data containing decimal slips ($1499 USB cables), negative returns, typos in status, and total mismatches.",
        "category": "Retail & E-Commerce"
    },
    "patient": {
        "id": "patient",
        "name": "Clinical Patient Records (Dirty)",
        "filename": "patient_records_dirty.csv",
        "description": "40 rows of medical vital statistics with impossible age (320), negative BMIs, sensor spikes (850 mmHg BP), and non-standard blood groups.",
        "category": "Healthcare & Life Sciences"
    },
    "ground_truth": {
        "id": "ground_truth",
        "name": "Seeded Benchmark Dataset (Ground Truth)",
        "filename": "ground_truth_test_data.csv",
        "description": "100 rows containing 20 pre-labeled real anomalies for reproducible Precision/Recall/F1 evaluation.",
        "category": "Evaluation Benchmark"
    }
}


class AnalyzeRequest(BaseModel):
    csv_content: Optional[str] = None
    sample_id: Optional[str] = None
    use_tabpfn: bool = False

class ApplyFixesRequest(BaseModel):
    original_csv: str
    reviewed_actions: List[Dict[str, Any]]
    dataset_name: Optional[str] = "Dataset"

class ConfigRequest(BaseModel):
    provider: str
    endpoint: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    enable_tabpfn: Optional[bool] = None


def df_to_json_records(df: pd.DataFrame, max_rows: Optional[int] = None) -> List[Dict[str, Any]]:
    target = df.head(max_rows) if max_rows else df
    # Convert to object dtype first so None is not converted back to float('nan')
    clean = target.astype(object).where(pd.notnull(target), None)
    return clean.to_dict(orient="records")


def sanitize_json_val(val: Any) -> Any:
    if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
        return None
    return val


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SnoozeOps Backend",
        "timestamp": time.time(),
        "model_config": janitor.get_status()
    }


@app.get("/api/samples")
def list_samples():
    return list(SAMPLE_DATASETS.values())


@app.get("/api/samples/{sample_id}")
def get_sample(sample_id: str):
    if sample_id not in SAMPLE_DATASETS:
        raise HTTPException(status_code=404, detail="Sample dataset not found")
        
    info = SAMPLE_DATASETS[sample_id]
    filepath = os.path.join(current_dir, "data", info["filename"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Sample file not found at {filepath}")
        
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    df = pd.read_csv(io.StringIO(content))
    return {
        "info": info,
        "csv_content": content,
        "rows_count": len(df),
        "columns": list(df.columns),
        "preview": df_to_json_records(df, 10)
    }


@app.post("/api/profile")
def profile_data(payload: AnalyzeRequest):
    content = payload.csv_content
    if payload.sample_id:
        if payload.sample_id not in SAMPLE_DATASETS:
            raise HTTPException(status_code=404, detail="Sample dataset not found")
        filepath = os.path.join(current_dir, "data", SAMPLE_DATASETS[payload.sample_id]["filename"])
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

    if not content:
        raise HTTPException(status_code=400, detail="No CSV content or sample_id provided")

    try:
        df = pd.read_csv(io.StringIO(content))
        profile = profile_dataframe(df)
        return {
            "success": True,
            "profile": profile,
            "preview_rows": df_to_json_records(df, 50)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


@app.post("/api/analyze")
async def analyze_data(payload: AnalyzeRequest):
    content = payload.csv_content
    dataset_name = "Uploaded CSV"
    
    if payload.sample_id:
        if payload.sample_id not in SAMPLE_DATASETS:
            raise HTTPException(status_code=404, detail="Sample dataset not found")
        dataset_name = SAMPLE_DATASETS[payload.sample_id]["name"]
        filepath = os.path.join(current_dir, "data", SAMPLE_DATASETS[payload.sample_id]["filename"])
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

    if not content:
        raise HTTPException(status_code=400, detail="No CSV content or sample_id provided")

    start_time = time.perf_counter()
    try:
        df = pd.read_csv(io.StringIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {str(e)}")

    # 1. Profile dataset
    profile = profile_dataframe(df)

    # 2. Run statistical & rule detectors
    stat_anomalies = detect_statistical_anomalies(df)

    # 3. Run TabPFN / multivariate anomaly detector
    multi_anomalies, multi_meta = detect_multivariate_and_tabpfn(df, use_tabpfn_if_possible=payload.use_tabpfn)

    raw_anomalies = stat_anomalies + multi_anomalies

    # 4. Run LLM Janitor for grounded explanations & safe fixes
    enhanced_anomalies, model_meta = await janitor.explain_and_propose_fixes(
        raw_anomalies,
        df_context={"columns_summary": profile["columns"]}
    )

    # Sanitize anomalies values for JSON compliance
    for a in enhanced_anomalies:
        a["original_value"] = sanitize_json_val(a.get("original_value"))
        a["proposed_value"] = sanitize_json_val(a.get("proposed_value"))

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        "success": True,
        "dataset_name": dataset_name,
        "runtime_ms": elapsed_ms,
        "profile": profile,
        "anomalies_count": len(enhanced_anomalies),
        "anomalies": enhanced_anomalies,
        "tabpfn_metadata": multi_meta,
        "model_metadata": model_meta,
        "preview_rows": df_to_json_records(df, 100)
    }


@app.post("/api/evaluate")
def evaluate_benchmark(use_tabpfn: bool = False):
    """
    Runs live reproducible evaluation on the seeded ground-truth benchmark dataset.
    """
    try:
        benchmark_path = os.path.join(current_dir, "data", "ground_truth_test_data.csv")
        results = run_benchmark_evaluation(benchmark_path, use_tabpfn=use_tabpfn)
        return {
            "success": True,
            "evaluation": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark error: {str(e)}")


@app.post("/api/apply-fixes")
def apply_fixes(payload: ApplyFixesRequest):
    """
    Applies user-approved actions, generates cleaned CSV, and produces provenance audit report.
    """
    try:
        original_df = pd.read_csv(io.StringIO(payload.original_csv))
        cleaned_df, audit_summary = apply_reviewed_corrections(original_df, payload.reviewed_actions)
        
        # Serialize cleaned CSV
        cleaned_csv = cleaned_df.to_csv(index=False)
        
        # Generate full provenance audit report
        audit_report = generate_provenance_audit_report(
            original_csv=payload.original_csv,
            cleaned_csv=cleaned_csv,
            audit_summary=audit_summary,
            dataset_name=payload.dataset_name or "Processed Dataset",
            model_name=janitor.provider
        )

        return {
            "success": True,
            "cleaned_csv": cleaned_csv,
            "cleaned_preview": df_to_json_records(cleaned_df, 50),
            "audit_report": audit_report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apply fixes failed: {str(e)}")


@app.get("/api/config")
def get_config():
    return janitor.get_status()


@app.post("/api/config")
def update_config(payload: ConfigRequest):
    janitor.update_config(
        provider=payload.provider,
        endpoint=payload.endpoint,
        api_key=payload.api_key,
        model=payload.model
    )
    if payload.enable_tabpfn is not None:
        os.environ["ENABLE_TABPFN"] = "1" if payload.enable_tabpfn else "0"
        
    return {
        "success": True,
        "updated_config": janitor.get_status(),
        "tabpfn_enabled": os.getenv("ENABLE_TABPFN", "0") == "1"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
