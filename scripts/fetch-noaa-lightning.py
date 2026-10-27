#!/usr/bin/env python3
"""Read recent NOAA GOES GLM flashes and export them for Next.js.

Uses in-memory NetCDF decoding (no temporary files, Windows-friendly).
"""

import argparse
import json
import math
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

import numpy as np
import requests
from netCDF4 import Dataset

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "noaa-lightning.json"
SATELLITES = (18, 19)
WINDOW_MINUTES = 10
UPDATE_SECONDS = 60
TIMEOUT = (10, 30)

session = requests.Session()
# Key -> (file start time, parsed flashes); reuse recent downloads.
cache = {}


def utc_now():
    return datetime.now(timezone.utc)


def filename_start(key):
    match = re.search(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})", key)
    if not match:
        return None
    year, day, hour, minute, second = map(int, match.groups())
    try:
        return datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(
            days=day - 1, hours=hour, minutes=minute, seconds=second
        )
    except ValueError:
        return None


def list_hour(bucket, prefix):
    """List an S3 public bucket prefix without AWS credentials."""
    keys = []
    continuation = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if continuation:
            params["continuation-token"] = continuation

        response = session.get(f"https://{bucket}.s3.amazonaws.com/", params=params, timeout=TIMEOUT)
        response.raise_for_status()
        root = ET.fromstring(response.content)

        for item in root.findall(".//{*}Contents"):
            key = item.findtext("{*}Key")
            if key and key.endswith(".nc"):
                keys.append(key)

        continuation = root.findtext("{*}NextContinuationToken")
        if not continuation:
            break
    return keys


def recent_files(satellite, now):
    bucket = f"noaa-goes{satellite}"
    keys = set()
    for hours_back in (0, 1):
        hour = now - timedelta(hours=hours_back)
        prefix = (
            f"GLM-L2-LCFA/{hour.year}/"
            f"{hour.timetuple().tm_yday:03d}/{hour.hour:02d}/"
        )
        keys.update(list_hour(bucket, prefix))

    cutoff = now - timedelta(minutes=WINDOW_MINUTES)
    selected = []
    for key in keys:
        start = filename_start(key)
        if start is not None and cutoff <= start <= now + timedelta(seconds=30):
            selected.append((start, key))
    return sorted(selected)


def parse_file(satellite, key, start):
    bucket = f"noaa-goes{satellite}"
    url = f"https://{bucket}.s3.amazonaws.com/{quote(key, safe='/')}"
    response = session.get(url, timeout=TIMEOUT)
    response.raise_for_status()

    flashes = []
    # netCDF4 supports opening an existing dataset from bytes in memory.
    with Dataset("glm-in-memory.nc", mode="r", memory=response.content) as ds:
        latitudes = ds.variables["flash_lat"][:]
        longitudes = ds.variables["flash_lon"][:]
        quality_var = ds.variables.get("flash_quality_flag")
        quality = quality_var[:] if quality_var is not None else None

        for i, (lat, lon) in enumerate(zip(latitudes, longitudes)):
            if np.ma.is_masked(lat) or np.ma.is_masked(lon):
                continue
            if quality is not None:
                flag = quality[i]
                if np.ma.is_masked(flag) or int(flag) != 0:
                    continue

            lat, lon = float(lat), float(lon)
            if not (
                math.isfinite(lat) and math.isfinite(lon)
                and -90 <= lat <= 90 and -180 <= lon <= 180
            ):
                continue

            # Simple seam selection to reduce double counting in overlap.
            if satellite == 18 and lon >= -106.1:
                continue
            if satellite == 19 and lon < -106.1:
                continue

            flashes.append({
                "id": f"goes{satellite}-{Path(key).stem}-{i}",
                "source": f"GOES-{satellite}",
                "lat": lat,
                "lon": lon,
                "observedWindowStart": start.isoformat(),
            })
    return flashes


def update():
    now = utc_now()
    cutoff = now - timedelta(minutes=WINDOW_MINUTES)

    # Avoid indefinitely accumulating old results in the worker.
    for cache_key, (start, _) in list(cache.items()):
        if start < cutoff:
            del cache[cache_key]

    errors = []
    successful_files = 0
    newest_observation = None
    source_status = {}

    for satellite in SATELLITES:
        name = f"GOES-{satellite}"
        try:
            files = recent_files(satellite, now)
        except Exception as exc:
            errors.append(f"{name} listing: {exc}")
            source_status[name] = "unavailable"
            continue

        if not files:
            errors.append(f"{name}: no files in the past {WINDOW_MINUTES} minutes")
            source_status[name] = "no_recent_files"
            continue

        sat_success = 0
        for start, key in files:
            cache_key = (satellite, key)
            if cache_key not in cache:
                try:
                    cache[cache_key] = (start, parse_file(satellite, key, start))
                except Exception as exc:
                    errors.append(f"{name} {Path(key).name}: {exc}")
                    continue
            sat_success += 1
            successful_files += 1
            if newest_observation is None or start > newest_observation:
                newest_observation = start

        source_status[name] = "ok" if sat_success else "read_failed"

    if successful_files == 0:
        # Keep the last successful JSON if the providers are temporarily down.
        raise RuntimeError("No readable recent files; previous JSON kept. " + "; ".join(errors[:3]))

    records = []
    for (satellite, key), (start, flashes) in cache.items():
        if start >= cutoff and source_status.get(f"GOES-{satellite}") == "ok":
            records.extend(flashes)

    payload = {
        "source": "NOAA GOES GLM",
        "updatedAt": now.isoformat(),
        "observedThrough": newest_observation.isoformat() if newest_observation else None,
        "observationType": "optical_flash",
        "windowMinutes": WINDOW_MINUTES,
        "sources": source_status,
        "flashes": records,
        "errors": errors[:20],
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = OUTPUT.with_suffix(".tmp")
    temporary_output.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temporary_output.replace(OUTPUT)
    print(
        f"[{now.strftime('%H:%M:%S UTC')}] "
        f"{len(records)} flashes, {successful_files} files, "
        f"sources={source_status}, errors={len(errors)}",
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser(description="Fetch GOES-18/19 lightning data")
    parser.add_argument("--watch", action="store_true", help="Update every 60 seconds")
    args = parser.parse_args()

    while True:
        try:
            update()
        except (requests.RequestException, OSError, ValueError, RuntimeError, KeyError) as exc:
            print(f"NOAA error: {exc}", flush=True)
        except Exception as exc:
            print(f"Unexpected error: {type(exc).__name__}: {exc}", flush=True)

        if not args.watch:
            break
        try:
            time.sleep(UPDATE_SECONDS)
        except KeyboardInterrupt:
            print("Stopped")
            break


if __name__ == "__main__":
    main()
