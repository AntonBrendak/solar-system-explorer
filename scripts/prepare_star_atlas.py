#!/usr/bin/env python3
"""ORBITAL | One-command NASA Deep Star Maps 2020 downloader and tile builder.

Downloads official celestial-coordinate (not *_gal) NASA EXR images for
8K, 16K, 32K and 64K, then produces:

  public/textures/space/starmap-8k.webp
  public/textures/space/tiles/{16,32,64}k/{row}/{column}.webp

Each high-resolution tile has a 2048x2048 data area and a 2-pixel gutter on
all sides. The eventual Three.js renderer MUST crop that gutter in UV space.
Source EXRs are stored outside the Next.js project by default on Windows.

Setup (once, using the virtual environment already created for this task):
  .\\.venv-atlas\\Scripts\\python.exe -m pip install requests OpenImageIO numpy Pillow

Run all levels in order (single command):
  .\\.venv-atlas\\Scripts\\python.exe scripts/prepare_star_atlas.py

Try just one tile before the multi-GB download:
  .\\.venv-atlas\\Scripts\\python.exe scripts/prepare_star_atlas.py --only 16 --limit 1

The script keeps complete downloads and completed images on error/restart;
it never disables TLS certificate verification, and never fakes progress.
"""

from __future__ import annotations

import argparse
import math
import os
from pathlib import Path
import re
import shutil
import sys
import time
from typing import Any

try:
    import numpy as np
    from PIL import Image
    import OpenImageIO as oiio
    import requests
except ImportError as exc:
    raise SystemExit(
        "A Python package is missing. Run this once:\n"
        "  .\\.venv-atlas\\Scripts\\python.exe -m pip install requests OpenImageIO numpy Pillow\n"
        f"Details: {exc}"
    ) from exc

# Source: https://svs.gsfc.nasa.gov/4851/
NASA_ROOT = "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851"
EXPECTED: dict[int, tuple[int, int]] = {
    8: (8192, 4096),
    16: (16384, 8192),
    32: (32768, 16384),
    64: (65536, 32768),
}
# Conservative thresholds for detecting unfinished downloads; not exact checksums.
MIN_SOURCE_BYTES = {8: 100_000_000, 16: 350_000_000, 32: 1_000_000_000, 64: 3_000_000_000}
TILE = 2048
CHUNK = 1024 * 1024  # Network requests: stream in 1 MiB chunks.
STRIP = 128  # Image processing: decode at most 128 rows in each strip.
EXR_MAGIC = b"\x76\x2f\x31\x01"


def mib(value: int) -> str:
    return f"{value / 1048576:,.1f} MiB"


def valid_exr_header(path: Path) -> bool:
    try:
        with path.open("rb") as f:
            return f.read(4) == EXR_MAGIC
    except OSError:
        return False


def source_complete(path: Path, level: int) -> bool:
    return (
        path.is_file()
        and path.stat().st_size >= MIN_SOURCE_BYTES[level]
        and valid_exr_header(path)
    )


def download_exr(level: int, directory: Path, attempts: int) -> Path:
    """Resume a .part download, verify response range and basic file integrity."""
    filename = f"starmap_2020_{level}k.exr"
    url = f"{NASA_ROOT}/{filename}"
    directory.mkdir(parents=True, exist_ok=True)
    final = directory / filename
    partial = directory / f"{filename}.part"

    if source_complete(final, level):
        print(f"  Reusing NASA source: {final} ({mib(final.stat().st_size)})")
        return final

    # A previous curl command might have left an incomplete final-named file.
    if final.exists():
        if partial.exists():
            if final.stat().st_size > partial.stat().st_size:
                partial.unlink()
                final.replace(partial)
            else:
                final.unlink()
        else:
            final.replace(partial)

    print(f"  Download: {url}")
    with requests.Session() as session:
        session.headers.update({"User-Agent": "ORBITAL-StarAtlas/1.0 (NASA-SVS-open-data)"})
        for attempt in range(1, attempts + 1):
            offset = partial.stat().st_size if partial.exists() else 0
            headers = {"Range": f"bytes={offset}-"} if offset else {}
            try:
                with session.get(url, headers=headers, stream=True, timeout=(30, 180)) as resp:
                    if resp.status_code == 416 and offset:
                        # The partial may already be complete; leave it for verification.
                        if source_complete(partial, level):
                            partial.replace(final)
                            return final
                        raise RuntimeError("Server rejected resume offset (HTTP 416)")
                    resp.raise_for_status()

                    if offset and resp.status_code == 206:
                        value = resp.headers.get("Content-Range", "")
                        match = re.fullmatch(r"bytes\s+(\d+)-(\d+)/(\d+|\*)", value)
                        if not match or int(match.group(1)) != offset:
                            raise RuntimeError(f"Unexpected Content-Range for resumed file: {value!r}")
                        mode = "ab"
                        total = int(match.group(3)) if match.group(3) != "*" else None
                    elif resp.status_code == 200:
                        if offset:
                            print("  Server ignored Range; restarting this file from byte zero.")
                        mode = "wb"
                        total = int(resp.headers.get("Content-Length", "0")) or None
                        offset = 0
                    else:
                        raise RuntimeError(f"Unexpected HTTP {resp.status_code}")

                    if total is not None and total < MIN_SOURCE_BYTES[level]:
                        raise RuntimeError(f"Response is suspiciously small ({mib(total)})")

                    downloaded = offset
                    last_print = 0.0
                    with partial.open(mode) as out:
                        for part in resp.iter_content(chunk_size=CHUNK):
                            if not part:
                                continue
                            out.write(part)
                            downloaded += len(part)
                            now = time.monotonic()
                            if now - last_print >= 1.0:
                                info = (
                                    f"{mib(downloaded)} / {mib(total)} ({downloaded * 100 / total:.1f}%)"
                                    if total else mib(downloaded)
                                )
                                print(f"\r  Downloaded: {info}      ", end="", flush=True)
                                last_print = now
                    print(f"\r  Downloaded: {mib(downloaded)}" + " " * 35)

                    if total is not None and downloaded != total:
                        raise RuntimeError(f"Incomplete transfer: {mib(downloaded)} of {mib(total)}")
                    if not source_complete(partial, level):
                        raise RuntimeError("Downloaded file is too short or does not have an EXR header")
                    partial.replace(final)
                    print(f"  Saved: {final}")
                    return final
            except (requests.RequestException, OSError, RuntimeError) as exc:
                print(f"\n  Download attempt {attempt}/{attempts} failed: {exc}")
                if attempt >= attempts:
                    raise RuntimeError(
                        f"Could not download {filename}. The partial file is kept at {partial}. "
                        "If Python also reports SSL/TLS errors, check proxy/firewall or "
                        "download from https://svs.gsfc.nasa.gov/4851/ in a browser. "
                        "TLS verification has NOT been disabled."
                    ) from exc
                time.sleep(min(3 * attempt, 15))
    raise AssertionError("Unreachable")


def cache_read(
    cache: Any, path: Path, x0: int, x1: int, y0: int, y1: int
) -> np.ndarray:
    """Read a small horizontal strip from the EXR, preserving source RGB."""
    roi = oiio.ROI(x0, x1, y0, y1, 0, 1, 0, 3)
    pixels = cache.get_pixels(str(path), 0, 0, roi)
    if pixels is None:
        raise RuntimeError(f"OpenImageIO cannot read {x0}:{x1}, {y0}:{y1}: {cache.geterror()}")
    values = np.asarray(pixels)
    wanted = (y1 - y0, x1 - x0, 3)
    if values.shape != wanted:
        raise RuntimeError(f"Unexpected pixel shape {values.shape}, expected {wanted}")
    return values


def read_wrapped_strip(
    cache: Any, path: Path, width: int, height: int,
    x: int, y: int, columns: int, rows: int,
) -> np.ndarray:
    """Horizontal seam wraps; at poles repeat the first/last image scanline."""
    if not (-TILE <= x < width + TILE):
        raise ValueError(f"Unexpected tile x coordinate {x}")
    y_start = max(0, y)
    y_end = min(height, y + rows)
    top = max(0, -y)
    bottom = max(0, y + rows - height)
    if y_end <= y_start:
        raise ValueError("Entire strip falls outside source image")

    x_mod = x % width
    n_first = min(columns, width - x_mod)
    pieces = [cache_read(cache, path, x_mod, x_mod + n_first, y_start, y_end)]
    if n_first < columns:
        pieces.append(cache_read(cache, path, 0, columns - n_first, y_start, y_end))
    values = np.concatenate(pieces, axis=1) if len(pieces) > 1 else pieces[0]
    if top or bottom:
        values = np.pad(values, ((top, bottom), (0, 0), (0, 0)), mode="edge")
    if values.shape != (rows, columns, 3):
        raise RuntimeError(f"Invalid padded strip shape: {values.shape}")
    return values


def to_srgb(pixels: np.ndarray, exposure: float) -> Image.Image:
    """One fixed HDR -> sRGB transform shared by all resolutions."""
    rgb = np.array(pixels, dtype=np.float32, copy=True)
    np.nan_to_num(rgb, copy=False, nan=0.0, posinf=1e6, neginf=0.0)
    np.maximum(rgb, 0.0, out=rgb)
    rgb *= exposure
    # Reinhard tone-mapping; consistent across 8/16/32/64K sources.
    rgb /= (1.0 + rgb)
    lo = rgb <= 0.0031308
    rgb[lo] *= 12.92
    rgb[~lo] = 1.055 * np.power(rgb[~lo], 1 / 2.4) - 0.055
    rgb8 = np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(rgb8, "RGB")


def save_atomic(image: Image.Image, destination: Path, quality: int, method: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_name(destination.name + ".tmp")
    try:
        image.save(temp, format="WEBP", quality=quality, method=method)
        if temp.stat().st_size == 0:
            raise RuntimeError(f"Empty WebP output: {temp}")
        temp.replace(destination)
    finally:
        temp.unlink(missing_ok=True)


def output_valid(path: Path, dimensions: tuple[int, int]) -> bool:
    if not path.is_file() or path.stat().st_size == 0:
        return False
    try:
        with Image.open(path) as image:
            return image.format == "WEBP" and image.size == dimensions
    except (OSError, ValueError):
        return False


def build_image(
    cache: Any, source: Path, width: int, height: int,
    col: int, row: int, gutter: int, exposure: float,
) -> Image.Image:
    """Only one output image is built at a time; HDR strips stay <=128 rows."""
    span = TILE + gutter * 2
    output = Image.new("RGB", (span, span))
    x = col * TILE - gutter
    for dest_y in range(0, span, STRIP):
        h = min(STRIP, span - dest_y)
        y = row * TILE - gutter + dest_y
        strip = read_wrapped_strip(cache, source, width, height, x, y, span, h)
        rgb = to_srgb(strip, exposure)
        output.paste(rgb, (0, dest_y))
        rgb.close()
    return output


def build_base(
    cache: Any, source: Path, out_dir: Path, quality: int,
    method: int, exposure: float, force: bool,
) -> None:
    output = out_dir / "starmap-8k.webp"
    width, height = EXPECTED[8]
    if not force and output_valid(output, (width, height)):
        print(f"  Base 8K exists: {output}")
        return
    base = Image.new("RGB", (width, height))
    try:
        for y in range(0, height, STRIP):
            h = min(STRIP, height - y)
            # Full image strip: decoded memory bound by 8192 * 128 pixels.
            values = cache_read(cache, source, 0, width, y, y + h)
            rgb = to_srgb(values, exposure)
            base.paste(rgb, (0, y))
            rgb.close()
            print(f"\r  Building base 8K: {100 * (y + h) / height:.1f}%", end="", flush=True)
        print()
        save_atomic(base, output, quality, method)
        print(f"  Saved: {output} ({mib(output.stat().st_size)})")
    finally:
        base.close()


def build_tiles(
    cache: Any, source: Path, level: int, out_dir: Path,
    gutter: int, quality: int, method: int, exposure: float,
    force: bool, limit: int | None,
) -> None:
    width, height = EXPECTED[level]
    cols, rows = width // TILE, height // TILE
    total = cols * rows
    done, new = 0, 0
    for row in range(rows):
        for col in range(cols):
            output = out_dir / "tiles" / f"{level}k" / str(row) / f"{col}.webp"
            if not force and output_valid(output, (TILE + 2 * gutter, TILE + 2 * gutter)):
                done += 1
                continue
            img = build_image(cache, source, width, height, col, row, gutter, exposure)
            try:
                save_atomic(img, output, quality, method)
            finally:
                img.close()
            done += 1
            new += 1
            print(f"  {level}K: {done}/{total} tiles ({100 * done / total:.1f}%) — {output}", flush=True)
            if limit is not None and new >= limit:
                print(f"  Test/limit reached after {new} new tile(s); rerun without --limit to finish.")
                return
    print(f"  {level}K complete: {done}/{total} tiles; {new} new.")


def convert_exr(
    source: Path, level: int, out_dir: Path, gutter: int, quality: int,
    method: int, exposure: float, force: bool, limit: int | None,
) -> None:
    cache = oiio.ImageCache()
    cache.attribute("max_memory_MB", 256.0)
    cache.attribute("autotile", 64)
    try:
        source = source.resolve()
        spec = cache.get_imagespec(str(source))
        if spec is None:
            raise RuntimeError(f"OpenImageIO cannot open {source}: {cache.geterror()}")
        if (spec.width, spec.height) != EXPECTED[level] or spec.nchannels < 3:
            raise RuntimeError(
                f"Wrong EXR image geometry: {spec.width}x{spec.height} ({spec.nchannels} channels); "
                f"expected {EXPECTED[level][0]}x{EXPECTED[level][1]} (at least 3 channels)."
            )
        print(f"  Source verified: {spec.width}x{spec.height}, {spec.nchannels} channels")
        if level == 8:
            build_base(cache, source, out_dir, quality, method, exposure, force)
        else:
            build_tiles(cache, source, level, out_dir, gutter, quality, method, exposure, force, limit)
    finally:
        oiio.ImageCache.destroy(cache)


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--source-dir", type=Path,
        default=Path("C:/NASA") if os.name == "nt" else Path(".nasa-star-atlas"),
        help="Folder for original NASA EXRs (default on Windows: C:\\NASA)",
    )
    parser.add_argument("--out", type=Path, default=Path("public/textures/space"))
    parser.add_argument("--only", type=str, default="8,16,32,64", help="Comma-separated levels: 8,16,32,64")
    parser.add_argument("--limit", type=int, default=None, help="Create at most N new tiles per level (testing)")
    parser.add_argument("--quality", type=int, default=92, help="WebP quality 1–100 (default 92)")
    parser.add_argument("--method", type=int, default=4, help="WebP encoder effort 0–6 (default 4)")
    parser.add_argument("--exposure", type=float, default=1.0, help="Fixed HDR exposure, shared by all levels")
    parser.add_argument("--gutter", type=int, default=2, help="Border pixels on each side of a tile (default 2)")
    parser.add_argument("--attempts", type=int, default=4, help="Network attempts per source")
    parser.add_argument("--force-tiles", action="store_true", help="Rebuild all outputs even if present")
    parser.add_argument("--download-only", action="store_true", help="Download files without converting them")
    parser.add_argument("--delete-sources", action="store_true", help="Delete NASA EXRs only after each level is fully built")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done without downloading")
    args = parser.parse_args()
    try:
        args.levels = [int(x.strip()) for x in args.only.split(",")]
    except ValueError:
        parser.error("--only must be comma-separated numbers, e.g. 8,16,32,64")
    if not args.levels or any(level not in EXPECTED for level in args.levels) or len(args.levels) != len(set(args.levels)):
        parser.error("--only must contain distinct levels from 8,16,32,64")
    args.levels.sort()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be >= 1")
    if not 1 <= args.quality <= 100 or not 0 <= args.method <= 6:
        parser.error("--quality must be 1..100 and --method must be 0..6")
    if not math.isfinite(args.exposure) or not 0 < args.exposure <= 32:
        parser.error("--exposure must be within (0,32]")
    if not 0 <= args.gutter <= 8:
        parser.error("--gutter must be in 0..8")
    if args.attempts < 1:
        parser.error("--attempts must be >=1")
    if args.download_only and args.delete_sources:
        parser.error("--download-only and --delete-sources cannot be combined")
    if args.limit and args.delete_sources:
        parser.error("Cannot delete sources after a partial --limit test")
    return args


def main() -> int:
    args = get_args()
    print("ORBITAL / NASA Deep Star Maps 2020")
    print("  Official source: https://svs.gsfc.nasa.gov/4851/")
    print(f"  Levels: {', '.join(str(x) + 'K' for x in args.levels)}")
    print(f"  EXR sources: {args.source_dir.resolve()}")
    print(f"  WebP outputs: {args.out.resolve()}")
    print(f"  Quality: {args.quality}; gutter: {args.gutter}px; exposure: {args.exposure}")
    print("  Sources are several GB in total. Run --only 8 for a smaller initial pass.")
    if args.dry_run:
        for level in args.levels:
            count = 1 if level == 8 else (EXPECTED[level][0] // TILE) * (EXPECTED[level][1] // TILE)
            print(f"  {level}K: {count} output image(s), source {MIN_SOURCE_BYTES[level] / 1e9:.1f} GB minimum")
        return 0

    for level in args.levels:
        print(f"\n=== {level}K ===", flush=True)
        source = download_exr(level, args.source_dir, args.attempts)
        if args.download_only:
            continue
        convert_exr(
            source, level, args.out, args.gutter, args.quality,
            args.method, args.exposure, args.force_tiles, args.limit,
        )
        if args.delete_sources:
            source.unlink()
            print(f"  Removed source EXR (requested): {source}")
    print("\nDone. Existing files will be reused on the next run.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nStopped. All completed files and partial downloads are preserved.", file=sys.stderr)
        sys.exit(130)
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)
