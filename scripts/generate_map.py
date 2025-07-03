#!/usr/bin/env python3
"""
generate_map.py: Fetch GPS data from DynamoDB and render an interactive map using Folium.
"""

import boto3
from decimal import Decimal
import folium


def fetch_locations(table_name: str, region: str = "us-east-1") -> list[dict]:
    """Scan the DynamoDB table and return a list of location dicts."""
    ddb = boto3.resource("dynamodb", region_name=region)
    table = ddb.Table(table_name)

    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    # Handle pagination
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))

    # Convert Decimal to float and pick relevant fields
    locations = []
    for item in items:
        try:
            locations.append({
                "deviceId": item["deviceId"],
                "lat": float(item["latitude"]),
                "lon": float(item["longitude"]),
                "timestamp": item.get("timestamp")
            })
        except KeyError:
            continue
    return locations


def create_map(
    locations: list[dict],
    output_file: str = "map.html",
    zoom_start: int = 12
) -> None:
    """Build and save an interactive map with CircleMarkers for each GPS point."""
    if not locations:
        print("No location data found.")
        return

    # Center map at average coordinates
    avg_lat = sum(loc["lat"] for loc in locations) / len(locations)
    avg_lon = sum(loc["lon"] for loc in locations) / len(locations)
    m = folium.Map(location=(avg_lat, avg_lon), zoom_start=zoom_start)

    for loc in locations:
        popup = f"{loc['deviceId']} @ {loc['timestamp']}"
        folium.CircleMarker(
            location=(loc["lat"], loc["lon"]),
            radius=5,
            popup=popup,
            weight=1,
            color="blue",
            fill=True,
            fill_opacity=0.7
        ).add_to(m)

    m.save(output_file)
    print(f"Map saved to {output_file}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate an interactive map of GPS points stored in DynamoDB.")
    parser.add_argument("--table", default="transport-locations-dev", help="DynamoDB table name")
    parser.add_argument("--region", default="us-east-1", help="AWS region of the table")
    parser.add_argument("--output", default="map.html", help="Output HTML file for the map")
    parser.add_argument("--zoom", type=int, default=12, help="Initial zoom level")
    args = parser.parse_args()

    locs = fetch_locations(args.table, args.region)
    create_map(locs, output_file=args.output, zoom_start=args.zoom)
