# 📊 SnoozeOps Sample Datasets

This directory contains realistic sample datasets with controlled, defensible anomalies designed for testing **SnoozeOps**.

---

## 📁 Available Datasets

| File | Rows | Category | Injected Anomalies to Test |
|---|---|---|---|
| **`saas_customer_metrics_dirty.csv`** | 60 | SaaS & Subscriptions | Decimal point shift ($9,900/mo spend), negative tenure (-14 mo), future signup date (2042), monthly vs annual formula mismatch, corrupt email, NPS scale violation (85/10), duplicate records. |
| **`ecommerce_orders_dirty.csv`** | 45 | E-Commerce Retail | Decimal slip ($1,499 USB-C cable vs $14.99), negative return quantity (-4), status typos (`compelted`), future order dates (`2039-12-31`), formula errors ($Qty \times Price \ne Total$), exact duplicate rows. |
| **`patient_records_dirty.csv`** | 40 | Healthcare / Vitals | Biologically impossible age (320), negative BMI (-24.5), BP sensor spike (850 mmHg), blood group typos (`O++`), negative fasting glucose. |
| **`ground_truth_test_data.csv`** | 100 | Benchmark Evaluation | 20 labeled ground-truth anomalies + 80 clean rows used by the **Reproducible Benchmark** to measure live Precision, Recall, and F1. |

---

## 🚀 How to Test in SnoozeOps

1. **Option A: Drag & Drop via Web UI**
   - Open [http://localhost:3001](http://localhost:3001) or [https://snooze-ops-frontend.onrender.com](https://snooze-ops-frontend.onrender.com).
   - Click **Upload Custom CSV** and select any file from this folder.
   
2. **Option B: One-Click Quick Load**
   - Use the sample buttons in the top bar to instantly load and inspect anomalies without uploading.
