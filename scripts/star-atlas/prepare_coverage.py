"""Prepare an immutable 8K streaming supplement from the pinned encoded base."""
import hashlib
import io
import json
import os
from pathlib import Path
import zipfile

os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
import numpy as np
import OpenImageIO as oiio
import PIL
from PIL import Image
from PIL import features
from memory_budget import limit_memory

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "widgets/solar-system/sky/model"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_immutable(path, data):
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f"Immutable coverage content changed: {path.name}")
    else:
        path.write_bytes(data)


def main():
    limit_memory()
    lock = json.loads((MODEL / "sky-atlas.lock.json").read_text())
    original = ROOT / "public" / lock["root"].lstrip("/")
    manifest = json.loads((original / "manifest.json").read_text())
    asset = manifest["files"]["base-8k"]
    source_bytes = (original / asset["path"]).read_bytes()
    if digest(source_bytes) != asset["sha256"]:
        raise ValueError("8K source hash mismatch")
    del source_bytes
    parameters = {"algorithm": "encoded-8k-coverage-v2", "source": asset["sha256"],
                  "parentRevision": lock["revision"], "core": 2048, "gutter": 2,
                  "projection": manifest["projection"], "colorSpace": "srgb",
                  "orientation": "top-down", "encoding": "webp-lossless",
                  "numpy": np.__version__, "pillow": PIL.__version__, "libwebp": features.version("webp")}
    revision = digest(json.dumps(parameters, sort_keys=True).encode())
    prefix = f"textures/space/revisions/coverage/{revision}"
    output = ROOT / "public" / prefix
    output.mkdir(parents=True, exist_ok=True)
    source = oiio.ImageInput.open(str(original / asset["path"]))
    if not source or (source.spec().width, source.spec().height) != (8192, 4096):
        raise ValueError("Unexpected 8K source dimensions")
    files = {}
    for row in range(2):
        for column in range(4):
            ys = np.clip(np.arange(row * 2048 - 2, (row + 1) * 2048 + 2), 0, 4095)
            xs = np.arange(column * 2048 - 2, (column + 1) * 2048 + 2) % 8192
            tile = np.empty((2052, 2052, 3), dtype=np.uint8)
            for start in range(0, 2052, 128):
                selected = ys[start:start + 128]
                top, bottom = int(selected.min()), int(selected.max()) + 1
                stripe = source.read_scanlines(top, bottom, 0, 0, 3, oiio.UINT8)
                tile[start:start + len(selected)] = stripe[selected - top][:, xs]
            relative = f"tiles/8k/{row}/{column}.webp"
            path = output / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            encoded_tile = io.BytesIO()
            Image.fromarray(tile).save(encoded_tile, format="WEBP", lossless=True, method=6)
            write_immutable(path, encoded_tile.getvalue())
            with Image.open(path) as decoded:
                if not np.array_equal(np.asarray(decoded.convert("RGB")), tile):
                    raise ValueError("Post-codec coverage pixels differ from the source")
            data = path.read_bytes()
            files[f"8/{row}/{column}"] = {"path": relative, "sha256": digest(data),
                                           "bytes": len(data), "width": 2052, "height": 2052}
    source.close()
    coverage = {"schema": 1, "revision": revision, "parameters": parameters, "files": files,
                "validation": {"decodedPixelsMatchSource": True, "guttersMatchSource": True}}
    encoded = (json.dumps(coverage, sort_keys=True, indent=2) + "\n").encode()
    write_immutable(output / "manifest.json", encoded)
    name = f"sky-coverage-{revision}.zip"
    archive = ROOT / "artifacts" / name
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as bundle:
        for path in sorted(output.rglob("*")):
            if path.is_file():
                entry = zipfile.ZipInfo(f"{prefix}/{path.relative_to(output).as_posix()}", (1980, 1, 1, 0, 0, 0))
                entry.external_attr = 0o100644 << 16
                bundle.writestr(entry, path.read_bytes())
    supplement = {**coverage, "root": "/" + prefix, "manifestSha256": digest(encoded),
                  "archive": {"name": name, "releaseTag": f"sky-v2-{lock['revision']}",
                              "bytes": archive.stat().st_size,
                              "sha256": digest(archive.read_bytes())}}
    lock_bytes = (json.dumps(supplement, sort_keys=True, indent=2) + "\n").encode()
    (MODEL / "sky-coverage.lock.json").write_bytes(lock_bytes)
    lock["coverageLockSha256"] = digest(lock_bytes)
    (MODEL / "sky-atlas.lock.json").write_text(json.dumps(lock, sort_keys=True, indent=2) + "\n")
    print(f"Coverage {revision}: {len(files)} tiles, {archive.stat().st_size} archive bytes")


if __name__ == "__main__":
    main()
