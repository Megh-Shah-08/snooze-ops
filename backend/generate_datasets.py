"""
Dataset Generator for SnoozeOps.
Creates realistic dirty sample datasets and a seeded ground-truth evaluation benchmark dataset.
"""

import os
import random
import numpy as np
import pandas as pd

def generate_ecommerce_dataset(output_path: str):
    random.seed(42)
    np.random.seed(42)

    categories = {
        "Electronics": [("Wireless Mouse", 29.99), ("Mechanical Keyboard", 89.99), ("USB-C Cable", 14.99), ("Noise-Canceling Headphones", 149.99)],
        "Office": [("Ergonomic Desk Chair", 249.99), ("Desk Lamp", 34.50), ("Notebook 3-Pack", 12.00), ("Gel Pens (Pack of 10)", 8.99)],
        "Apparel": [("Cotton T-Shirt", 19.99), ("Denim Jeans", 59.99), ("Running Shoes", 79.99), ("Fleece Hoodie", 45.00)]
    }

    rows = []
    order_id_counter = 1001

    all_products = []
    for cat, prods in categories.items():
        for pname, price in prods:
            all_products.append((cat, pname, price))

    for i in range(45):
        cat, pname, base_price = random.choice(all_products)
        qty = random.randint(1, 5)
        # Slight price fluctuation
        unit_price = round(base_price * random.uniform(0.95, 1.05), 2)
        total = round(qty * unit_price, 2)
        status = random.choice(["Delivered", "Shipped", "Processing", "Cancelled"])
        date = f"2026-09-{random.randint(1, 28):02d}"
        email = f"customer{i+1}@example.com"
        rating = random.choice([4.0, 4.5, 5.0, 3.5, None])

        rows.append({
            "order_id": f"ORD-{order_id_counter}",
            "customer_email": email,
            "order_date": date,
            "category": cat,
            "product_name": pname,
            "quantity": qty,
            "unit_price": unit_price,
            "total_amount": total,
            "order_status": status,
            "customer_rating": rating
        })
        order_id_counter += 1

    # Inject specific realistic anomalies:
    # 1. Decimal point slip on unit price
    rows[4]["unit_price"] = 1499.00  # USB-C Cable for 1499.00 instead of ~14.99
    rows[4]["total_amount"] = round(rows[4]["quantity"] * 1499.00, 2)

    # 2. Negative quantity (return accidentally logged as sale)
    rows[9]["quantity"] = -4
    rows[9]["total_amount"] = -4 * rows[9]["unit_price"]

    # 3. Typo in status
    rows[14]["order_status"] = "compelted"

    # 4. Swapped / mismatched total (mathematical inconsistency)
    rows[18]["quantity"] = 2
    rows[18]["unit_price"] = 29.99
    rows[18]["total_amount"] = 599.80  # Off by factor of 10

    # 5. Impossible future date
    rows[22]["order_date"] = "2039-12-31"

    # 6. Malformed email
    rows[27]["customer_email"] = "invalid_email_at_nowhere"

    # 7. Exact duplicate row
    rows[31] = dict(rows[30])

    # 8. Outlier rating
    rows[35]["customer_rating"] = 55.0  # Scale is 1-5

    # 9. Rare invalid category
    rows[40]["category"] = "Automotive_Parts_Experimental"

    df = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated E-Commerce dirty dataset at {output_path} ({len(df)} rows)")


def generate_patient_dataset(output_path: str):
    random.seed(101)
    np.random.seed(101)

    rows = []
    blood_types = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

    for i in range(40):
        age = random.randint(18, 85)
        sys_bp = int(np.random.normal(120, 15))
        dia_bp = int(np.random.normal(80, 10))
        bmi = round(float(np.random.normal(26.5, 4.0)), 1)
        glucose = int(np.random.normal(100, 20))
        blood_group = random.choice(blood_types)
        smoker = random.choice(["Yes", "No", "Former"])

        rows.append({
            "patient_id": f"PT-{2000+i}",
            "age": age,
            "systolic_bp": sys_bp,
            "diastolic_bp": dia_bp,
            "bmi": bmi,
            "fasting_glucose": glucose,
            "blood_group": blood_group,
            "smoker_status": smoker
        })

    # Injected anomalies:
    rows[3]["age"] = 320  # Impossible age
    rows[8]["bmi"] = -24.5  # Negative BMI
    rows[15]["systolic_bp"] = 850  # Sensor malfunction
    rows[21]["blood_group"] = "O++"  # Typo
    rows[28]["fasting_glucose"] = -15  # Negative glucose
    rows[34]["smoker_status"] = "sometimes_vapes"  # Non-standard enum

    df = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated Patient dirty dataset at {output_path} ({len(df)} rows)")


def generate_ground_truth_benchmark(output_path: str):
    """
    Seeded dataset of 100 rows with clear ground-truth labels for benchmark evaluation.
    Contains 20 controlled anomalies and 80 clean rows.
    """
    random.seed(777)
    np.random.seed(777)

    rows = []
    labels = []  # 1 if row has anomaly, 0 if clean
    anomaly_types = []

    for i in range(100):
        # Base realistic features
        units = random.randint(1, 10)
        cost_per_unit = round(random.uniform(10.0, 50.0), 2)
        discount_rate = round(random.choice([0.0, 0.05, 0.10, 0.15, 0.20]), 2)
        net_revenue = round(units * cost_per_unit * (1.0 - discount_rate), 2)
        region = random.choice(["North", "South", "East", "West"])
        satisfaction_score = round(random.uniform(3.0, 5.0), 1)
        status = random.choice(["Active", "Pending", "Completed"])

        is_anomaly = 0
        anomaly_desc = "Clean"

        # Inject anomalies at specific indices (20 total)
        if i == 5:
            units = -8
            is_anomaly = 1
            anomaly_desc = "Negative quantity"
        elif i == 11:
            cost_per_unit = 4999.00  # Extreme decimal slip
            is_anomaly = 1
            anomaly_desc = "Decimal slip outlier"
        elif i == 17:
            discount_rate = 1.85  # Discount > 100%
            is_anomaly = 1
            anomaly_desc = "Out-of-bounds discount"
        elif i == 23:
            net_revenue = round(net_revenue * 10, 2)  # Discrepancy between units*cost*(1-disc) and revenue
            is_anomaly = 1
            anomaly_desc = "Mathematical discrepancy"
        elif i == 29:
            satisfaction_score = 48.0  # Scale is 1-5
            is_anomaly = 1
            anomaly_desc = "Scale violation"
        elif i == 35:
            region = "Northwest_Antarctica"  # Rare / invalid category
            is_anomaly = 1
            anomaly_desc = "Invalid category"
        elif i == 41:
            status = "completid"  # Typo
            is_anomaly = 1
            anomaly_desc = "Categorical typo"
        elif i == 47:
            cost_per_unit = -12.50  # Negative cost
            is_anomaly = 1
            anomaly_desc = "Negative price"
        elif i == 53:
            satisfaction_score = -1.0  # Negative score
            is_anomaly = 1
            anomaly_desc = "Negative rating"
        elif i == 59:
            units = 500  # Extreme volume outlier (30x median)
            is_anomaly = 1
            anomaly_desc = "Volume spike outlier"
        elif i == 65:
            discount_rate = -0.15  # Negative discount
            is_anomaly = 1
            anomaly_desc = "Negative discount rate"
        elif i == 71:
            net_revenue = -450.0  # Negative revenue
            is_anomaly = 1
            anomaly_desc = "Negative revenue"
        elif i == 77:
            status = "UNKNOWN_CODE_99"
            is_anomaly = 1
            anomaly_desc = "Invalid code"
        elif i == 83:
            cost_per_unit = 0.001  # Absurdly low cost near zero
            is_anomaly = 1
            anomaly_desc = "Zero cost anomaly"
        elif i == 89:
            satisfaction_score = 10.0  # Out of range 1-5
            is_anomaly = 1
            anomaly_desc = "Out of range rating"
        elif i == 93:
            # Duplicate of row 92
            units = rows[-1]["units"]
            cost_per_unit = rows[-1]["cost_per_unit"]
            discount_rate = rows[-1]["discount_rate"]
            net_revenue = rows[-1]["net_revenue"]
            region = rows[-1]["region"]
            satisfaction_score = rows[-1]["satisfaction_score"]
            status = rows[-1]["status"]
            is_anomaly = 1
            anomaly_desc = "Duplicate record"
        elif i == 95:
            units = 0  # Zero units order with revenue
            net_revenue = 150.0
            is_anomaly = 1
            anomaly_desc = "Zero units with non-zero revenue"
        elif i == 97:
            cost_per_unit = 1800.0
            is_anomaly = 1
            anomaly_desc = "Extreme price outlier"
        elif i == 98:
            region = "N/A_CORRUPT"
            is_anomaly = 1
            anomaly_desc = "Corrupted region"
        elif i == 99:
            discount_rate = 0.99  # 99% discount anomalous
            is_anomaly = 1
            anomaly_desc = "Near 100% discount"

        row = {
            "record_id": f"REC-{5000+i}",
            "units": units,
            "cost_per_unit": cost_per_unit,
            "discount_rate": discount_rate,
            "net_revenue": net_revenue,
            "region": region,
            "satisfaction_score": satisfaction_score,
            "status": status,
            "_is_ground_truth_anomaly": is_anomaly,
            "_anomaly_type": anomaly_desc
        }
        rows.append(row)

    df = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated Ground Truth Benchmark at {output_path} (100 rows, 20 anomalies)")


if __name__ == "__main__":
    generate_ecommerce_dataset("backend/data/ecommerce_orders_dirty.csv")
    generate_patient_dataset("backend/data/patient_records_dirty.csv")
    generate_ground_truth_benchmark("backend/data/ground_truth_test_data.csv")
