"""Build Mars height and tangent-space normal maps from NASA MOLA MEGDR.

Input: 32 ppd MOLA topography .img + matching ENVI .hdr file (or a GeoTIFF).

Example:
    python scripts/prepare-mars-maps.py assets/mars/megt90n000fb.img --shift180

Output: 8K height/normal, 1K height/normal, metadata in public/textures/mars.

Requires: numpy, scipy, Pillow; rasterio optional for GeoTIFF.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

MARS_RADIUS_M = 3_389_500.0  # mean radius; MOLA topography is referenced to the areoid
HEIGHT_MIN_M = -12_000.0
HEIGHT_MAX_M = 24_000.0
OUTPUT_WIDTH = 8192
LITE_WIDTH = 1024


def parse_envi_header(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing ENVI header beside IMG: {path}")
    contents = path.read_text(encoding="latin-1")
    fields = {}
    for key, value in re.findall(r"^\s*([^=\n]+?)\s*=\s*([^\n]+)", contents, flags=re.MULTILINE):
        fields[key.strip().lower()] = value.strip().strip("{} ")
    for required in ("samples", "lines", "data type", "byte order"):
        if required not in fields:
            raise ValueError(f"ENVI header missing {required}: {path}")
    return fields


def load_mola(path: Path, width: int) -> tuple[np.ndarray, np.ndarray, dict]:
    """Read DEM as float32, with a separate validity mask, then resize both together."""
    if path.suffix.lower() in (".tif", ".tiff"):
        import rasterio
        from rasterio.enums import Resampling
        with rasterio.open(path) as src:
            print(f"TIFF: {src.width} x {src.height}, nodata={src.nodata}")
            out_h = width // 2
            # Weighted interpolation avoids bleeding NoData into valid heights.
            values = src.read(1, masked=True).astype(np.float32)
            arr = np.ma.filled(values, 0.0)
            valid = ~np.ma.getmaskarray(values)
            meta = {"source_width": src.width, "source_height": src.height, "nodata": src.nodata}
    else:
        hdr = parse_envi_header(path.with_suffix(".hdr"))
        types = {1: "u1", 2: "i2", 3: "i4", 4: "f4", 5: "f8", 12: "u2", 13: "u4"}
        code = int(hdr["data type"])
        if code not in types:
            raise ValueError(f"Unsupported ENVI data type {code}")
        byte_order = ">" if int(hdr["byte order"]) == 1 else "<"
        dtype = np.dtype(byte_order + types[code])
        rows = int(hdr["lines"])
        columns = int(hdr["samples"])
        offset = int(hdr.get("header offset", "0"))
        print(f"MOLA IMG: {columns} x {rows}, dtype={dtype}, offset={offset}")
        raw = np.memmap(path, dtype=dtype, mode="r", offset=offset, shape=(rows, columns))
        nodata = float(hdr.get("data ignore value", "-32768"))
        valid = np.asarray((raw != nodata) & np.isfinite(raw))
        arr = np.where(valid, raw, 0).astype(np.float32)
        meta = {"source_width": columns, "source_height": rows, "nodata": nodata}

    if arr.shape[1] != 2 * arr.shape[0]:
        print("WARNING: source is not a 2:1 equirectangular map. Check its projection.")

    if not valid.any():
        raise RuntimeError("No valid heights in DEM")
    data = arr[valid]
    print(f"Valid source elevation: {float(data.min()):.1f} to {float(data.max()):.1f} m")
    print(f"Valid source coverage: {100.0 * valid.mean():.3f}%")

    # PIL 'F' images resample 32-bit floats without quantising the elevation.
    # Resample values and coverage separately to avoid interpolation towards NoData.
    size = (width, width // 2)
    numerator = np.asarray(Image.fromarray(arr).resize(size, Image.Resampling.BILINEAR), dtype=np.float32)
    denominator = np.asarray(Image.fromarray(valid.astype(np.float32)).resize(size, Image.Resampling.BILINEAR), dtype=np.float32)
    del arr
    good = denominator > 0.01
    dem = np.divide(numerator, denominator, out=np.zeros_like(numerator), where=good)
    del numerator, denominator
    if not good.all():
        invalid = ~good
        print(f"Interpolating {int(invalid.sum()):,} missing output pixels")
        # Nearest valid neighbour, never a fabricated zero elevation.
        nearest = distance_transform_edt(invalid, return_distances=False, return_indices=True)
        dem[invalid] = dem[tuple(indices[invalid] for indices in nearest)]
        del nearest
    return dem, good, meta


def save_maps(dem: np.ndarray, width: int, dest: Path, normal_strength: float) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    height_norm = np.clip((dem - HEIGHT_MIN_M) / (HEIGHT_MAX_M - HEIGHT_MIN_M), 0.0, 1.0)
    clipped = np.count_nonzero((dem < HEIGHT_MIN_M) | (dem > HEIGHT_MAX_M))
    if clipped:
        print(f"WARNING: {clipped:,} pixels exceed the height map range and will be clamped")

    # Browser-loaded 16-bit grayscale PNG is not reliably exposed as 16-bit
    # displacementMap across Three/WebGL implementations. Use an 8-bit PNG.
    Image.fromarray(np.round(height_norm * 255).astype(np.uint8), "L").save(dest / "mars-height-8k.png")
    Image.fromarray(np.round(height_norm * 255).astype(np.uint8), "L").resize(
        (LITE_WIDTH, LITE_WIDTH // 2), Image.Resampling.LANCZOS
    ).save(dest / "mars-height-lite.png")
    del height_norm

    # Smooth subpixel noise lightly, but keep actual MOLA elevations.
    smooth = gaussian_filter(dem, sigma=(0.65, 0.65), mode=("nearest", "wrap"))
    h, w = smooth.shape
    latitude = (np.pi / 2) - (np.arange(h, dtype=np.float32) + 0.5) * (np.pi / h)
    dx_m = (2 * np.pi * MARS_RADIUS_M / w) * np.maximum(np.cos(latitude), 0.03)
    dy_m = np.pi * MARS_RADIUS_M / h

    # Input image rows: north to south. Increasing texture V points north.
    slope_u = (np.roll(smooth, -1, axis=1) - np.roll(smooth, 1, axis=1)) / (2 * dx_m[:, None])
    slope_v = np.empty_like(smooth)
    slope_v[1:-1] = (smooth[:-2] - smooth[2:]) / (2 * dy_m)
    slope_v[0] = (smooth[0] - smooth[1]) / dy_m
    slope_v[-1] = (smooth[-2] - smooth[-1]) / dy_m
    del smooth

    nx = -normal_strength * slope_u
    ny = -normal_strength * slope_v
    del slope_u, slope_v
    nz = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    nx *= nz
    ny *= nz
    normal = np.empty((h, w, 3), dtype=np.uint8)
    normal[..., 0] = np.round((nx * 0.5 + 0.5) * 255).astype(np.uint8)
    normal[..., 1] = np.round((ny * 0.5 + 0.5) * 255).astype(np.uint8)
    normal[..., 2] = np.round((nz * 0.5 + 0.5) * 255).astype(np.uint8)
    del nx, ny, nz
    Image.fromarray(normal, "RGB").save(dest / "mars-normal-8k.png")
    Image.fromarray(normal, "RGB").resize(
        (LITE_WIDTH, LITE_WIDTH // 2), Image.Resampling.LANCZOS
    ).save(dest / "mars-normal-lite.png")

    scale = 2.0 * (HEIGHT_MAX_M - HEIGHT_MIN_M) / MARS_RADIUS_M
    bias = 2.0 * HEIGHT_MIN_M / MARS_RADIUS_M
    metadata = {
        "source": "NASA PDS MGS MOLA MEGDR topography",
        "height_min_m": HEIGHT_MIN_M,
        "height_max_m": HEIGHT_MAX_M,
        "radius_m": MARS_RADIUS_M,
        "displacementScale": scale,
        "displacementBias": bias,
        "normal_strength_multiplier": normal_strength,
    }
    (dest / "mars-map-params.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Wrote height + normal maps to {dest}")
    print(f"Physical displacementScale={scale:.7f}; displacementBias={bias:.7f}")
    print("For first visual test use 0.5 * each value; Lite may disable displacement.")


def main() -> None:
    parser = argparse.ArgumentParser(description="NASA MOLA DEM to Mars height and normal maps")
    parser.add_argument("source", type=Path)
    parser.add_argument("--shift180", action="store_true", help="Shift 0..360E DEM to a -180..180 texture convention")
    parser.add_argument("--flip-x", action="store_true", help="Flip longitude orientation when the source texture requires it")
    parser.add_argument("--width", type=int, default=OUTPUT_WIDTH, help="Output width; default 8192 (2:1)")
    parser.add_argument("--normal-strength", type=float, default=2.0)
    parser.add_argument("--output", type=Path, default=Path("public/textures/mars"))
    args = parser.parse_args()
    if args.width % 2 or args.width < 32:
        parser.error("--width must be even and >= 32")
    if args.normal_strength <= 0:
        parser.error("--normal-strength must be positive")
    dem, _, source_meta = load_mola(args.source, args.width)
    if args.flip_x:
        dem = np.flip(dem, axis=1).copy()
    if args.shift180:
        dem = np.roll(dem, dem.shape[1] // 2, axis=1)
    print("Source metadata:", source_meta)
    save_maps(dem, args.width, args.output, args.normal_strength)


if __name__ == "__main__":
    main()
