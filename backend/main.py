from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI , Query
import httpx
from collections import  Counter
import math
from datetime import datetime, timezone, date

app = FastAPI(title = "UK Wind Forecast API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ELEXON_ACTUALS_URL = (
    "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream"
)

@app.get("/")
def home():
    return {"message": "UK Wind Forecast API is running"}

@app.get("/health")
def health():
    return {"status" : "healthy"}



@app.get("/actuals")
async def get_actuals():
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            ELEXON_ACTUALS_URL,
            params={
                "settlementDateFrom": "2026-01-01",
                "settlementDateTo": "2026-01-01",
                "fuelType": ["WIND"],
            },
        )
        response.raise_for_status()
        data = response.json()

    if data is None:
        data = []

    return {
        "count": len(data),
        "data": data,
    }


ELEXON_FORECAST_URL = (
    "https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream"
)




@app.get("/forecasts")
async def get_forecasts():
    cutoff = "2026-01-01T00:00:00Z"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            ELEXON_FORECAST_URL,
            params={
                "publishDateTimeFrom": "2025-12-30T00:00:00Z",
                "publishDateTimeTo": cutoff,
            },
        )
        response.raise_for_status()
        records = response.json() or []

    # Keep forecasts targeting January 1, published before delivery.
    candidates = [
        record for record in records
        if record.get("startTime", "").startswith("2026-01-01")
        and record.get("publishTime", "") < cutoff
    ]

    # Find the latest available publication time.
    if candidates:
        latest_publish_time = max(
            record["publishTime"] for record in candidates
        )
        data = [
            record for record in candidates
            if record.get("publishTime") == latest_publish_time
        ]
    else:
        latest_publish_time = None
        data = []

    return {
        "count": len(data),
        "selected_publish_time": latest_publish_time,
        "data": data,
    }


@app.get("/accuracy")
async def get_accuracy(day: date = Query(default=date(2026, 1, 1))):
    day = day.isoformat()
    cutoff = f"{day}T00:00:00Z"

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch actual wind generation for January 1.
        actual_response = await client.get(
            ELEXON_ACTUALS_URL,
            params={
                "settlementDateFrom": day,
                "settlementDateTo": day,
                "fuelType": ["WIND"],
            },
        )
        actual_response.raise_for_status()
        actual_records = actual_response.json() or []

        # Fetch forecasts published before the delivery day.
        forecast_response = await client.get(
            ELEXON_FORECAST_URL,
            params={
                "publishDateTimeFrom": "2025-12-30T00:00:00Z",
                "publishDateTimeTo": cutoff,
            },
        )
        forecast_response.raise_for_status()
        forecast_records = forecast_response.json() or []

    # Select the latest eligible forecast publication.
    candidates = [
        record for record in forecast_records
        if record.get("startTime", "").startswith(day)
        and record.get("publishTime", "") < cutoff
    ]

    if not candidates:
        return {"error": "No eligible forecasts found"}

    latest_publish_time = max(
        record["publishTime"] for record in candidates
    )

    forecasts = {
        record["startTime"]: float(record["generation"])
        for record in candidates
        if record.get("publishTime") == latest_publish_time
        and record.get("generation") is not None
    }

    # Group actual half-hour readings into hourly averages.
    actual_groups = {}

    for record in actual_records:
        start_time = record.get("startTime")
        generation = record.get("generation")

        if not start_time or generation is None:
            continue

        hour = start_time[:13] + ":00:00Z"
        actual_groups.setdefault(hour, []).append(float(generation))

    actuals = {
        hour: sum(values) / len(values)
        for hour, values in actual_groups.items()
    }

    # Compare only hours available in both datasets.
    comparisons = []

    for hour, forecast in sorted(forecasts.items()):
        if hour not in actuals:
            continue

        actual = actuals[hour]
        error = forecast - actual

        comparisons.append({
            "startTime": hour,
            "forecast": round(forecast, 2),
            "actual": round(actual, 2),
            "error": round(error, 2),
            "absolute_error": round(abs(error), 2),
        })

    if not comparisons:
        return {
            "error": "No matching hourly forecast and actual records",
            "forecast_publish_time": latest_publish_time,
            "actual_records": len(actual_records),
        }

    errors = [item["error"] for item in comparisons]
    absolute_errors = [abs(error) for error in errors]

    mae = sum(absolute_errors) / len(errors)
    rmse = math.sqrt(
        sum(error ** 2 for error in errors) / len(errors)
    )

    nonzero_actuals = [
        item for item in comparisons if item["actual"] != 0
    ]

    mape = (
        sum(
            abs(item["forecast"] - item["actual"])
            / abs(item["actual"]) * 100
            for item in nonzero_actuals
        ) / len(nonzero_actuals)
        if nonzero_actuals else None
    )

    # Calculate average forecast and actual generation.
    average_forecast = sum(
        item["forecast"] for item in comparisons
    ) / len(comparisons)

    average_actual = sum(
        item["actual"] for item in comparisons
    ) / len(comparisons)

    return {
        "date": day,
        "forecast_publish_time": latest_publish_time,
        "matched_hours": len(comparisons),
        "average_forecast_mw": round(average_forecast, 2),
        "average_actual_mw": round(average_actual, 2),
        "mae_mw": round(mae, 2),
        "rmse_mw": round(rmse, 2),
        "mape_percent": round(mape, 2) if mape is not None else None,
        "comparisons": comparisons,
    }
