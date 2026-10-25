"""
Live integration test against running FastAPI backend.
"""

import json
import urllib.request

def test_api():
    base = "http://127.0.0.1:8000"

    # 1. Health
    h = json.loads(urllib.request.urlopen(f"{base}/api/health").read().decode())
    print(f"[OK] Health check: {h['status']} | Engine: {h['model_config']['model']}")

    # 2. Samples
    s = json.loads(urllib.request.urlopen(f"{base}/api/samples").read().decode())
    print(f"[OK] Samples retrieved: {len(s)} sample datasets available")

    # 3. Analyze Ecommerce
    req = urllib.request.Request(
        f"{base}/api/analyze",
        data=json.dumps({"sample_id": "ecommerce"}).encode(),
        headers={"Content-Type": "application/json"}
    )
    res = json.loads(urllib.request.urlopen(req).read().decode())
    print(f"[OK] Analyze Ecommerce: {res['anomalies_count']} anomalies flagged in {res['runtime_ms']}ms")
    print(f"     Example flag: Row {res['anomalies'][0]['row_index']} ({res['anomalies'][0]['column']}) = {res['anomalies'][0]['original_value']} -> Proposed: {res['anomalies'][0]['proposed_value']}")

    # 4. Benchmark evaluation
    req2 = urllib.request.Request(
        f"{base}/api/evaluate",
        data=b"",
        headers={"Content-Type": "application/json"}
    )
    res2 = json.loads(urllib.request.urlopen(req2).read().decode())
    snoozeops_res = res2["evaluation"]["snoozeops"]
    baseline_res = res2["evaluation"]["baseline"]
    print(f"[OK] Live Benchmark: SnoozeOps Recall: {snoozeops_res['recall']*100}% vs Baseline {baseline_res['recall']*100}%")
    print(f"     Precision: {snoozeops_res['precision']*100}%, False Positives: {snoozeops_res['false_positives']}, Runtime: {snoozeops_res['runtime_ms']}ms")

    # 5. Apply Fixes and generate audit trail
    sample_csv = urllib.request.urlopen(f"{base}/api/samples/ecommerce").read().decode()
    sample_csv_text = json.loads(sample_csv)["csv_content"]
    fixes_payload = {
        "original_csv": sample_csv_text,
        "reviewed_actions": [
            {
                "row_index": res["anomalies"][0]["row_index"],
                "column": res["anomalies"][0]["column"],
                "action": "APPROVE",
                "suggested_action": res["anomalies"][0]["suggested_action"],
                "proposed_value": res["anomalies"][0]["proposed_value"]
            }
        ],
        "dataset_name": "E-Commerce Retail Orders (Dirty)"
    }
    req3 = urllib.request.Request(
        f"{base}/api/apply-fixes",
        data=json.dumps(fixes_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    res3 = json.loads(urllib.request.urlopen(req3).read().decode())
    print(f"[OK] Applied Fixes & Provenance Report:")
    print(f"     Raw SHA-256:     {res3['audit_report']['original_sha256']}")
    print(f"     Cleaned SHA-256: {res3['audit_report']['cleaned_sha256']}")
    print(f"     Total Changes:   {res3['audit_report']['metrics']['approved_modifications']}")
    print("ALL API CHECKS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_api()
