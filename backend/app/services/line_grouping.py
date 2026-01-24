def aggregate_items(items):
    """
    Aggregate multiple invoice line items into one.
    Used when vendor line grouping = Yes.
    """
    if not items:
        return {}

    first_item = items[0]

    def safe_float(v):
        if v is None:
            return 0.0
        if isinstance(v, (int, float)):
            return float(v)
        try:
            return float(str(v).replace(",", "").replace("$", "").strip())
        except:
            return 0.0

    total_quantity = 0.0
    total_unit_price = 0.0
    total_amount = 0.0

    for item in items:
        total_quantity += safe_float(item.get("quantity", {}).get("value"))
        total_unit_price += safe_float(item.get("unit_price", {}).get("value"))
        total_amount += safe_float(item.get("amount", {}).get("value"))

    aggregated = {
        "description": {
            "value": first_item.get("description", {}).get("value") or "Aggregated Items",
            "source": "aggregation",
            "confidence": 1.0
        },
        "quantity": {"value": total_quantity},
        "unit_price": {"value": total_unit_price},
        "amount": {"value": total_amount},
        "item_code": first_item.get("item_code", {"value": None}),
        "unit_of_measure": first_item.get("unit_of_measure", {"value": None}),
        "discount": {"value": 0.0},
        "tax_rate": {"value": 0.0},
        "tax_amount": {"value": 0.0},
        "gross_amount": {"value": total_amount}
    }

    return aggregated
