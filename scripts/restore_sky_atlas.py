"""Restore the pinned Sky release without regenerating images."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "AntonBrendak/solar-system-explorer"
CHUNK = 1024 * 1024


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_tree(root, manifest, manifest_hash):
    if digest(root / "manifest.json") != manifest_hash:
        raise ValueError("Installed Sky manifest differs from the lock")
    for asset in manifest["files"].values():
        path = root / asset["path"]
        if (
            path.is_symlink()
            or path.stat().st_size != asset["bytes"]
            or digest(path) != asset["sha256"]
        ):
            raise ValueError(f"Installed Sky asset differs from the manifest: {asset['path']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--archive", type=Path,
        help="Use a local archive instead of downloading the GitHub Release",
    )
    parser.add_argument("--coverage", action="store_true", help="Restore the pinned 8K supplement")
    args = parser.parse_args()
    lock_path = ROOT / "widgets/solar-system/sky/model" / ("sky-coverage.lock.json" if args.coverage else "sky-atlas.lock.json")
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    revision = lock["revision"]
    if not re.fullmatch(r"[a-f0-9]{64}", revision):
        raise ValueError("Invalid locked revision")
    metadata = lock.get("archive")
    if (
        not metadata
        or not re.fullmatch(r"[a-f0-9]{64}", metadata.get("sha256", ""))
        or metadata["bytes"] <= 0
    ):
        raise ValueError("No pinned archive; prepare:sky -- --archive is required")
    name = metadata.get("name", f"sky-v2-{revision}.zip")
    archive = args.archive.resolve() if args.archive else ROOT / "artifacts" / name
    if not archive.exists():
        if args.archive:
            raise FileNotFoundError(archive)
        archive.parent.mkdir(parents=True, exist_ok=True)
        url = (
            f"https://github.com/{REPOSITORY}/releases/download/"
            f"{metadata.get('releaseTag', f'sky-v2-{revision}')}/{name}"
        )
        pending = archive.with_suffix(".zip.part")
        print(f"Downloading {url}", flush=True)
        try:
            with urllib.request.urlopen(url, timeout=60) as response, pending.open("wb") as output:
                size = 0
                while chunk := response.read(CHUNK):
                    size += len(chunk)
                    if size > metadata["bytes"]:
                        raise ValueError("Archive exceeds the locked length")
                    output.write(chunk)
            if (
                pending.stat().st_size != metadata["bytes"]
                or digest(pending) != metadata["sha256"]
            ):
                raise ValueError("Downloaded Sky archive failed length/SHA-256 verification")
            os.replace(pending, archive)
        finally:
            pending.unlink(missing_ok=True)
    if (
        archive.stat().st_size != metadata["bytes"]
        or digest(archive) != metadata["sha256"]
    ):
        raise ValueError("Local Sky archive failed length/SHA-256 verification")
    prefix = f"textures/space/revisions/{'coverage' if args.coverage else 'v2'}/{revision}/"
    if lock["root"] != "/" + prefix.rstrip("/"):
        raise ValueError("Locked revision path is invalid")
    destination = ROOT / "public" / prefix.rstrip("/")
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        by_name = {entry.filename: entry for entry in entries}
        manifest_name = prefix + "manifest.json"
        if (
            len(by_name) != len(entries)
            or manifest_name not in by_name
            or by_name[manifest_name].file_size > CHUNK
        ):
            raise ValueError("Archive contains duplicates or an invalid manifest")
        manifest_bytes = bundle.read(manifest_name)
        if hashlib.sha256(manifest_bytes).hexdigest() != lock["manifestSha256"]:
            raise ValueError("Archived manifest hash mismatch")
        manifest = json.loads(manifest_bytes)
        if (
            manifest.get("schema") != (1 if args.coverage else 2)
            or manifest.get("revision") != revision
            or len(manifest["files"]) != (8 if args.coverage else 676)
        ):
            raise ValueError("Archived revision is incomplete or incompatible")
        expected = {manifest_name: {"bytes": len(manifest_bytes)}}
        for asset in manifest["files"].values():
            relative = PurePosixPath(asset["path"])
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or "\\" in asset["path"]
                or ":" in asset["path"]
            ):
                raise ValueError("Unsafe path in manifest")
            name = prefix + relative.as_posix()
            if name in expected:
                raise ValueError("Duplicate asset path in manifest")
            expected[name] = asset
        if set(expected) != set(by_name):
            raise ValueError("Archive contains missing or unexpected files")
        for name, entry in by_name.items():
            if (
                entry.is_dir()
                or stat.S_ISLNK(entry.external_attr >> 16)
                or entry.file_size != expected[name]["bytes"]
            ):
                raise ValueError(f"Invalid archive entry: {name}")
        if destination.exists():
            verify_tree(destination, manifest, lock["manifestSha256"])
            print(f"Sky {revision[:12]} is already complete", flush=True)
            return
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=f".{revision}-", dir=destination.parent) as staging:
            root = Path(staging) / "revision"
            root.mkdir()
            for name in expected:
                target = root / name.removeprefix(prefix)
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(name) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output, CHUNK)
            verify_tree(root, manifest, lock["manifestSha256"])
            os.replace(root, destination)
    print(f"Restored immutable Sky {revision[:12]}", flush=True)


if __name__ == "__main__":
    main()
