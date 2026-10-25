# 💤 SnoozeOps

> **You snooze. Your data gets cleaned.**  
> *An open-source AI data janitor that detects suspicious spreadsheet data, explains anomalies, and prepares safe, reviewable fixes.*  
> Built for the **Hacktoberfest 2026 Open-Source AI Challenge: Slow and Steady**.

[![Tests](https://img.shields.io/badge/tests-6%20passed-emerald)](./tests/test_core.py)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.139-009688)](https://fastapi.tiangolo.com)
[![TabPFN](https://img.shields.io/badge/TabPFN-v9.2.0-blue)](https://github.com/automl/TabPFN)
[![Gemma](https://img.shields.io/badge/Model-Gemma%202-indigo)](https://huggingface.co/google/gemma-2-2b-it)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 🌟 Overview

Data cleaning is repetitive, error-prone, and slow. Teams waste hours auditing messy CSVs for typos, decimal slips, reversed signs, and broken formulas.

**SnoozeOps** is an autonomous AI data-quality assistant designed for spreadsheet and CSV inspection. It runs defensible multi-tier statistical checks, TabPFN tabular prediction residuals, and open-weight models (Gemma) to ground each anomaly in plain English, prepare safe reviewable corrections, and export a clean CSV accompanied by an immutable cryptographic SHA-256 provenance audit log.

---

## 🚀 Key Features & Workflow

1. **Instant Profiling & Ingestion**:
   - Upload any CSV or launch 1-click built-in datasets:
     - 🛒 **E-Commerce Retail Orders** (decimal slips, negative return quantities, broken formula sums, status typos).
     - 🏥 **Clinical Patient Records** (impossible human ages, negative BMIs, sensor spikes, non-standard blood groups).
     - 🎯 **Ground-Truth Benchmark** (100 rows, 20 seeded anomalies for reproducible evaluation).
   - Generates column-by-column missing rates, distributions, cardinality, and hygiene scores.

2. **Defensible Anomaly Detection Engine**:
   - **Modified Z-Score (MAD)**: Median Absolute Deviation is robust to extreme outliers where standard variance breaks down.
   - **Tukey’s Fences (IQR)**: Interquartile Range boundary detection for distribution outliers.
   - **Domain & Scale Constraints**: Automatically identifies negative quantities/prices, impossible ages ($>125$), non-viable clinical metrics, and out-of-bounds review scales ($>5.0$).
   - **Decimal Slip Detector**: Flags currency and metric values exceeding 50× median consistent with omitted decimal points ($1499.00 vs $14.99).
   - **Categorical Typo Resolver**: Detects high-concentration category typos (e.g., `compelted` $\to$ `Completed`, `O++` $\to$ `O+`).
   - **Mathematical & Formula Inconsistencies**: Detects discrepancies between related columns ($Quantity \times UnitPrice \ne TotalAmount$).
   - **Exact & Payload Duplicates**: Flags identical records while preserving distinct entities.
   - **TabPFN Residual Modeling**: When enabled, uses TabPFN (Prior-Data Fitted Network) to fit tabular relationships and compute conditional prediction residuals ($>3.0\sigma$).

3. **Grounded Explanations & Safe Proposed Fixes**:
   - Powered by open-weight models (Gemma 2 via local Ollama, Groq, or Hugging Face Inference API).
   - **Transparent Fallback**: When LLM or network is unconfigured or offline, SnoozeOps uses a transparent deterministic reasoning janitor that is **explicitly labeled** as `Deterministic Janitor Engine (Rule-Based)`. Live inference is never faked.

4. **Human-in-the-Loop Review & Data Preservation**:
   - Review each flagged anomaly with side-by-side diffs.
   - **One-click Approve, Custom Edit, or Reject**.
   - Bulk approval actions by severity (`Critical`, `High`, `Medium`, `Low`).
   - The raw dataset is immutably preserved.

5. **Cryptographic Provenance & Audit Report**:
   - Computes SHA-256 checksums of the original CSV and the cleaned export.
   - Generates an itemized Markdown Audit Report documenting every accepted, edited, and rejected change.

6. **Reproducible Benchmark Evaluator**:
   - Evaluates a seeded 100-row ground-truth dataset with 20 pre-labeled anomalies live in real-time.
   - Directly compares the **Naive 3-Sigma Baseline** against **SnoozeOps Hybrid Engine**:
     - **Recall**: SnoozeOps **100.0%** vs Baseline **35.0%** (**+65.0% gain**)
     - **Precision**: **100.0%**
     - **False Positives**: **0**
     - **Measured Latency**: **~300-400 ms**

---

## 🔒 Data Privacy Architecture

- **Zero Data Egress Mode**: When using the default Deterministic Engine or local Ollama, all data processing, profiling, and fixing happens 100% locally on your machine.
- **External API Mode**: If configured with Groq or Hugging Face, only minimal anonymized cell snippets and statistical context are transmitted. Raw datasets never leave your perimeter.

---

## 🛠️ Architecture & Tech Stack

```
snooze-ops/
├── backend/
│   ├── main.py                    # FastAPI server & REST API
│   ├── profiler.py                # Column profiling & distribution binning
│   ├── llm_janitor.py             # Gemma integration & deterministic fallback
│   ├── evaluator.py               # Reproducible benchmark suite
│   ├── audit.py                   # Transformations & SHA-256 provenance reports
│   ├── detectors/
│   │   ├── statistical.py         # MAD, IQR, domain logic, typos, duplicates
│   │   └── tabpfn_detector.py     # TabPFN regressor residuals & Isolation Forest
│   └── data/                      # Seeded sample datasets
├── frontend/
│   ├── src/app/page.tsx           # Interactive Next.js 14 App Router UI
│   ├── src/app/layout.tsx         # Root layout & metadata
│   └── next.config.mjs            # API proxy rewrites
└── tests/
    ├── test_core.py               # 6 unit tests covering all modules
    └── test_api_live.py           # End-to-end live API verification
```

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons.
- **Backend**: Python 3.11, FastAPI, Uvicorn, Pandas, Scikit-learn, TabPFN.
- **AI Models**: Google Gemma 2 (2B / 9B), TabPFN (Prior-Data Fitted Network).

---

## ⚡ Quick Start & Setup

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Backend Setup

```bash
# Clone the repository
git clone https://github.com/your-username/snooze-ops.git
cd snooze-ops

# Install backend dependencies
pip install fastapi uvicorn pandas scikit-learn tabpfn httpx

# Start the FastAPI server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The API will be live at `http://127.0.0.1:8000`. API docs available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup

In a new terminal:
```bash
cd frontend

# Install frontend dependencies
npm install

# Start the development server
npm run dev
```

Open `http://localhost:3000` (or `http://localhost:3001` if 3000 is occupied).

---

## 🧪 Running the Tests

Execute the unit test suite:
```bash
python -m unittest tests/test_core.py
```

Execute live API integration test:
```bash
python tests/test_api_live.py
```

All 6 core logic tests verify profiling accuracy, statistical detector boundaries, TabPFN/multivariate integration, deterministic LLM fallback, reproducible benchmark metrics, and cryptographic SHA-256 data preservation.

---

## ⚖️ Model & License Notes

- **SnoozeOps Codebase**: Licensed under the **MIT License**.
- **Gemma**: Google open-weights model governed by the [Gemma Terms of Use](https://ai.google.dev/gemma/terms).
- **TabPFN**: Prior-data fitted network for tabular data ([TabPFN GitHub](https://github.com/automl/TabPFN)).
