"""Create aligned Mercury normal + displacement textures from a single DEM.

Example:
 python scripts/prepare-mercury-maps.py assets/mercury/mercury-dem.tif --shift180

Output: mercury-normal-8k.png, mercury-height-8k.png and Lite variants.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.fill import fillnodata
from PIL import Image
from scipy.ndimage import gaussian_filter

MERCURY_RADIUS_M = 2_439_700.0
# Full scientific elevation range from the user's MESSENGER DEM.
MIN_ELEVATION_M = -10_740.0
MAX_ELEVATION_M = 8_906.0


def read_dem(path: Path, width: int) -> np.ndarray:
    height = width // 2
    with rasterio.open(path) as src:
        dem = src.read(
            1,
            out_shape=(height, width),
            resampling=Resampling.bilinear,
            masked=True,
        ).astype(np.float32)
        print(f"DEM: {src.width}x{src.height}, nodata={src.nodata}")

    invalid = np.ma.getmaskarray(dem) | ~np.isfinite(dem.data)
    if invalid.all():
        raise RuntimeError("The DEM contains no valid elevations")

    fill_value = float(np.median(dem.data[~invalid]))
    values = np.array(dem.filled(fill_value), dtype=np.float32)
    values[~np.isfinite(values)] = fill_value

    holes = int(np.count_nonzero(invalid))
    if holes:
        print(f"Missing DEM samples: {holes:,} ({100 * holes / invalid.size:.2f}%)")
        # 1 = valid, 0 = interpolate. Never set missing cells to elevation zero.
        values = fillnodata(
            values,
            mask=(~invalid).astype(np.uint8),
            max_search_distance=128,
            smoothing_iterations=1,
        ).astype(np.float32)
        values[~np.isfinite(values)] = fill_value

    # Small smoothing removes resampling / NoData boundaries, not crater rims.
    values = gaussian_filter(values, sigma=0.65, mode=("nearest", "wrap"))
    return values


def build_height(dem_m: np.ndarray) -> np.ndarray:
    """8-bit runtime map, neutral (no color-space) with consistent global range."""
    normalized = (dem_m - MIN_ELEVATION_M) / (
        MAX_ELEVATION_M - MIN_ELEVATION_M
    )
    return np.round(np.clip(normalized, 0.0, 1.0) * 255).astype(np.uint8)


def build_normals(dem_m: np.ndarray, strength: float) -> np.ndarray:
    """OpenGL tangent-space normals; image +Y points down, UV +V points north."""
    h, w = dem_m.shape
    dx_m = (np.roll(dem_m, -1, axis=1) - np.roll(dem_m, 1, axis=1)) * 0.5
    dy_m = (np.roll(dem_m, -1, axis=0) - np.roll(dem_m, 1, axis=0)) * 0.5
    dy_m[0] = dem_m[1] - dem_m[0]
    dy_m[-1] = dem_m[-1] - dem_m[-2]

    lat = (0.5 - (np.arange(h, dtype=np.float32) + 0.5) / h) * np.pi
    meters_per_x = (2.0 * np.pi * MERCURY_RADIUS_M / w) * np.maximum(
        np.cos(lat), 0.20
    )
    meters_per_y = np.pi * MERCURY_RADIUS_M / h

    nx = -dx_m / meters_per_x[:, None] * strength
    ny = dy_m / meters_per_y * strength
    length = np.sqrt(nx * nx + ny * ny + 1.0)

    result = np.empty((h, w, 3), dtype=np.uint8)
    result[:, :, 0] = np.clip(np.round((nx / length * 0.5 + 0.5) * 255), 0, 255)
    result[:, :, 1] = np.clip(np.round((ny / length * 0.5 + 0.5) * 255), 0, 255)
    result[:, :, 2] = np.clip(np.round((1.0 / length * 0.5 + 0.5) * 255), 0, 255)
    return result


def save_pair(
    dem_m: np.ndarray,
    outdir: Path,
    label: str,
    strength: float,
) -> None:
    Image.fromarray(build_height(dem_m), mode="L").save(
        outdir / f"mercury-height-{label}.png"
    )
    Image.fromarray(build_normals(dem_m, strength), mode="RGB").save(
        outdir / f"mercury-normal-{label}.png"
    )
    print(f"Saved {label}: height and normal ({dem_m.shape[1]}x{dem_m.shape[0]})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tiff", type=Path)
    parser.add_argument("--shift180", action="store_true")
    parser.add_argument("--width", type=int, default=8192)
    parser.add_argument("--strength", type=float, default=1.6)
    parser.add_argument(
        "--output", type=Path, default=Path("public/textures/mercury")
    )
    args = parser.parse_args()
    if args.width < 64 or args.width % 2:
        parser.error("--width must be an even integer >= 64")

    args.output.mkdir(parents=True, exist_ok=True)
    dem = read_dem(args.tiff, args.width)
    if args.shift180:
        dem = np.roll(dem, dem.shape[1] // 2, axis=1)
        print("Applied 180-degree shift to BOTH maps")

    # Full: both textures use exactly the same DEM and geographic orientation.
    save_pair(dem, args.output, "8k", args.strength)

    # Lite: reduce the repaired DEM first, then derive both maps from that.
    lite = np.asarray(
        Image.fromarray(dem, mode="F").resize(
            (1024, 512), resample=Image.Resampling.BILINEAR
        ),
        dtype=np.float32,
    )
    save_pair(lite, args.output, "lite", args.strength)

    # The grayscale height map is 8-bit for predictable browser decoding.
    # displacement = pixel/255 * scale + bias, so elevation 0 m maps to no shift.
    scale = 2.0 * (MAX_ELEVATION_M - MIN_ELEVATION_M) / MERCURY_RADIUS_M
    bias = 2.0 * MIN_ELEVATION_M / MERCURY_RADIUS_M
    print(f"Use displacementScale={scale:.6f}, displacementBias={bias:.6f}")
    print("Texture colorSpace: NoColorSpace for height and normal")


if __name__ == "__main__":
    main()
