"""
Generates rich dirty sample datasets in sample_data/ for easy user drag-and-drop testing.
"""

import os
import random
import numpy as np
import pandas as pd

def generate_saas_dataset(output_path: str):
    random.seed(555)
    np.random.seed(555)

    plans = {
        "Starter": 29.00,
        "Professional": 99.00,
        "Enterprise": 499.00
    }

    rows = []
    for i in range(60):
        plan = random.choice(list(plans.keys()))
        base_price = plans[plan]
        # Seats fluctuation
        seats = random.randint(1, 10) if plan != "Enterprise" else random.randint(10, 50)
        monthly_spend = round(base_price + (seats * random.uniform(5.0, 15.0)), 2)
        annual_contract_value = round(monthly_spend * 12, 2)
        tenure_months = random.randint(1, 48)
        support_tickets = random.randint(0, 6)
        nps_score = random.choice([8, 9, 10, 7, 6, 8, 9, None])
        status = random.choice(["Active", "At_Risk", "Renewed", "Pending"])
        signup_date = f"202{random.randint(3, 6)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}"
        email = f"lead_{i+1}@company{i+1}.io"

        rows.append({
            "customer_id": f"CUST-{10000+i}",
            "billing_email": email,
            "signup_date": signup_date,
            "plan_tier": plan,
            "licensed_seats": seats,
            "monthly_spend": monthly_spend,
            "annual_contract_value": annual_contract_value,
            "tenure_months": tenure_months,
            "support_tickets_opened": support_tickets,
            "satisfaction_nps": nps_score,
            "account_status": status
        })

    # Injected realistic spreadsheet anomalies:
    # 1. Decimal point shift error (entered 9900.00 instead of 99.00)
    rows[6]["monthly_spend"] = 9900.00
    rows[6]["annual_contract_value"] = round(rows[6]["monthly_spend"] * 12, 2)

    # 2. Negative tenure
    rows[12]["tenure_months"] = -14

    # 3. Impossible future signup date
    rows[19]["signup_date"] = "2042-08-15"

    # 4. Swapped / mathematical mismatch between monthly and annual
    rows[25]["annual_contract_value"] = 50.00  # Should be ~monthly * 12

    # 5. Invalid syntax email
    rows[31]["billing_email"] = "corrupt_email_address_without_at_symbol"

    # 6. Typo in plan tier
    rows[38]["plan_tier"] = "Enterprize_Legacy"

    # 7. Scale violation on NPS (scale 1-10)
    rows[44]["satisfaction_nps"] = 85.0

    # 8. Negative support tickets
    rows[50]["support_tickets_opened"] = -5

    # 9. Exact duplicate row
    rows[55] = dict(rows[54])

    df = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated SaaS Customer Metrics dirty dataset at {output_path} ({len(df)} rows)")

if __name__ == "__main__":
    generate_saas_dataset("sample_data/saas_customer_metrics_dirty.csv")
    generate_saas_dataset("backend/data/saas_customer_metrics_dirty.csv")
