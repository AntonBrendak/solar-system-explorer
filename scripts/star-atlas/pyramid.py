"""Disk-backed pyramid. Never assembles a full-resolution RGB image."""
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
from PIL import Image
from photometry import linear, srgb

CORE, GUTTER = 2048, 2

def tile_path(root, level, row, col):
    return Path(root) / str(level) / str(row) / f"{col}.npy"

def save_linear(root, level, row, col, rgb):
    path = tile_path(root, level, row, col)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Linear uint16 scratch limits disk use to ~13 GiB and contributes < 1/65535 absolute error.
    np.save(path, np.rint(np.clip(rgb, 0, 1) * 65535).astype(np.uint16), allow_pickle=False)

def read_linear(root, level, row, col):
    return np.load(tile_path(root, level, row, col), mmap_mode="r", allow_pickle=False)

def downsample(image, factor):
    h, w, channels = image.shape
    return image.reshape(h // factor, factor, w // factor, factor, channels).mean(axis=(1, 3), dtype=np.float32)

def parent(root, level, row, col):
    rgb = np.empty((CORE, CORE, 3), dtype=np.float32)
    for dy in range(2):
        for dx in range(2):
            child = read_linear(root, level * 2, row * 2 + dy, col * 2 + dx)
            part = downsample(np.asarray(child, dtype=np.float32) / 65535, 2)
            rgb[dy * 1024:(dy + 1) * 1024, dx * 1024:(dx + 1) * 1024] = part
    save_linear(root, level, row, col, rgb)

def encode_tile(scratch, output, level, row, col):
    columns, rows = level // 2, level // 4
    data = np.empty((CORE + 4, CORE + 4, 3), dtype=np.uint16)
    # Gather the same global linear pyramid at all nine neighbouring pieces, wrapping RA only.
    for dy, ys, sy in [(-1, slice(0, 2), slice(-2, None)), (0, slice(2, -2), slice(None)), (1, slice(-2, None), slice(0, 2))]:
        for dx, xs, sx in [(-1, slice(0, 2), slice(-2, None)), (0, slice(2, -2), slice(None)), (1, slice(-2, None), slice(0, 2))]:
            source = read_linear(scratch, level, min(rows - 1, max(0, row + dy)), (col + dx) % columns)
            block = source[sy, sx]
            if row + dy < 0: block = np.repeat(source[0:1, sx], 2, axis=0)
            if row + dy >= rows: block = np.repeat(source[-1:, sx], 2, axis=0)
            data[ys, xs] = block
    path = Path(output) / "tiles" / f"{level}k" / str(row) / f"{col}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(srgb(data.astype(np.float32) / 65535)).save(path, lossless=True, method=4, exact=True)
    return path

def make_base(scratch, output, width):
    # Sample area averages directly from the canonical 8K linear level, tile by tile.
    result = np.empty((width // 2, width, 3), dtype=np.uint8)
    factor = 8192 // width
    size = CORE // factor
    for row in range(2):
        for col in range(4):
            block = np.asarray(read_linear(scratch, 8, row, col), dtype=np.float32) / 65535
            result[row * size:(row + 1) * size, col * size:(col + 1) * size] = srgb(downsample(block, factor))
    path = Path(output) / ("reserve.webp" if width == 256 else f"base-{width // 1024}k.webp")
    if width == 8192:
        spec = oiio.ImageSpec(width,width//2,3,oiio.UINT8)
        spec.attribute("compression","lossless")
        spec.attribute("webp:method",0)
        output_image = oiio.ImageOutput.create(str(path))
        if not output_image or not output_image.open(str(path),spec): raise ValueError(oiio.geterror())
        try:
            for row in range(0,width//2,128):
                if not output_image.write_scanlines(row,row+128,0,result[row:row+128]): raise ValueError(output_image.geterror())
            if not output_image.close(): raise ValueError(output_image.geterror())
        finally: output_image.close()
    else:
        Image.fromarray(result).save(path, lossless=True, method=4, exact=True)
    return path
