#!/usr/bin/env python3
"""Reproduce an immutable Sky v2 revision from existing local WebP sources.

Reads canonical local sources and applies the asset publication gates before
activating a complete revision. Source import is a separate command.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import zipfile
import ctypes
import subprocess
import urllib.request
from contextlib import closing
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
import numpy as np
import OpenImageIO as oiio
import PIL
from PIL import Image
from PIL import features
from photometry import ALGORITHM, correction_field, correct, linear, sample_field
from pyramid import CORE, downsample, encode_tile, make_base, parent, read_linear, save_linear
from validate import validate_encoded, validate_pyramid

ROOT = Path(__file__).resolve().parents[2]
from memory_budget import limit_memory

def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def encoded_json(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode()

def main():
    limit_memory()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", action="store_true", help="Also produce a reproducible ZIP")
    parser.add_argument("--scratch", type=Path, default=ROOT / ".sky-atlas-cache")
    args = parser.parse_args()
    args.scratch = args.scratch.resolve()
    encoder, encoder_metadata = find_encoder()
    versions = {"python": sys.version.split()[0], "numpy": np.__version__, "pillow": PIL.__version__,
                "libwebp": features.version("webp"), "openimageio": oiio.VERSION_STRING}
    pinned = json.loads((Path(__file__).parent / "toolchain.lock.json").read_text())
    if versions != pinned:
        raise SystemExit(f"Pinned toolchain required: {pinned}; found {versions}")
    source = ROOT / "public/textures/space"
    reference = source / "starmap-8k.webp"
    inputs = [{"path": reference.relative_to(ROOT).as_posix(), "sha256": digest(reference)}]
    for row in range(16):
        for col in range(32):
            path = source / "tiles/64k" / str(row) / f"{col}.webp"
            with Image.open(path) as image:
                if image.size != (2052,2052) or image.mode != "RGB":
                    raise ValueError(f"Unexpected input contract: {path}")
            inputs.append({"path":path.relative_to(ROOT).as_posix(),"sha256":digest(path)})
    modules = {path.name: digest(path) for path in sorted(Path(__file__).parent.glob("*.py"))}
    recipe = {"schema":2,"algorithm":ALGORITHM,"versions":versions,"sources":inputs,"modules":modules,
              "projection":"equirectangular-ICRF-J2000","colorSpace":"srgb","orientation":"top-down",
              "core":2048,"gutter":2,"scratch":"linear RGB uint16; max quantisation error 1/65535",
              "encoding":{"format":"WebP","lossless":True,"method":4,"exact":True,
                          "base8k":{"lossless":False,"quality":98,"method":6,"lowMemory":True,"partitionLimit":100,
                                    "input":"mapped RGBA/PNG, 128-row stripes","backend":"cwebp"}},
              "largeBaseEncoder":encoder_metadata,
              "sourceAttribution":{"dataset":"NASA Deep Star Maps 2020","url":"https://svs.gsfc.nasa.gov/4851/"},
              "managedRamLimitMiB":512,"gainBounds":[.0625,16],"sampling":"pixel-centred area averages",
              "highlightProtection":"monotonic rational RGB-maximum shoulder, 254/255 sRGB headroom"}
    revision = hashlib.sha256(encoded_json(recipe)).hexdigest()
    output = source / "revisions/v2" / revision
    staging = args.scratch / "output"
    # Fixed scratch grid may be overwritten after an interrupted recipe. Every core/parent
    # is recomputed before validation; no partially prepared output is ever reused as a revision.
    scratch = args.scratch / "linear"
    if not output.exists():
        reusable = sum(path.stat().st_size for path in scratch.rglob("*.npy")) if scratch.exists() else 0
        if shutil.disk_usage(args.scratch.anchor).free + reusable < 18 * 1024**3:
            raise SystemExit("18 GiB scratch/output capacity is required (existing scratch counts towards it)")
        staging.mkdir(parents=True, exist_ok=True)
        stage_signature = hashlib.sha256(encoded_json({"sources":inputs,"photometry":modules["photometry.py"],
                                                       "pyramid":modules["pyramid.py"],"versions":versions})).hexdigest()
        gains, calibration, metadata = prepare_calibration(source,reference,args.scratch,stage_signature)
        # The files share known atlas coordinates; historical exposure/tonemapping cause remains unproven.
        audit = {"historicalBrightnessCause":"unproven: original EXR/transform provenance unavailable",
                 "inputProjectionEvidence":"canonical tile grid and project ICRF/J2000 coordinate contract",
                 "referenceMetadata":metadata,"registration":"no input warp; exact common pyramid mapping"}
        encoded_state_path = args.scratch / "encoded.json"
        encoded_state = json.loads(encoded_state_path.read_text()) if encoded_state_path.exists() else {}
        files = encoded_state.get("files",{}) if encoded_state.get("signature") == stage_signature else {}
        proof = encoded_state.get("validation",{})
        reusable_outputs = len(files) == 672 and proof.get("module") == modules["validate.py"] and \
            all((scratch/name).exists() and digest(scratch/name) == expected for name,expected in proof.get("baseCores",{}).items()) and \
            len(proof.get("baseCores",{})) == 8 and \
            all((staging/item["path"]).exists() and digest(staging/item["path"]) == item["sha256"] for item in files.values())
        if reusable_outputs:
            report = proof["report"]
            print("Reusing hash-verified encoded pyramid and its successful validation checkpoint",flush=True)
        else:
            report = prepare_linear_sources(source,scratch,args.scratch,stage_signature,gains)
            proof = {"module":modules["validate.py"],"report":report,
                     "baseCores":{path.relative_to(scratch).as_posix():digest(path) for path in sorted((scratch/"8").rglob("*.npy"))}}
        encoded_state_path.write_bytes(encoded_json({"signature":stage_signature,"files":files,"validation":proof}))
        for level in (16,32,64):
            for row in range(level//4):
                for col in range(level//2):
                    key = f"{level}/{row}/{col}"
                    previous = files.get(key)
                    if previous and (staging/previous["path"]).exists() and digest(staging/previous["path"]) == previous["sha256"]:
                        continue
                    path = encode_tile(scratch,staging,level,row,col)
                    files[key] = asset(path,staging,2052,2052)
                encoded_state_path.write_bytes(encoded_json({"signature":stage_signature,"files":files,"validation":proof}))
                print(f"Encoded {level}K row {row+1}/{level//4}",flush=True)
        for width in (256,2048,4096,8192):
            path = make_large_base(scratch,staging,encoder) if width == 8192 else make_base(scratch,staging,width)
            files["reserve" if width==256 else f"base-{width//1024}k"] = asset(path,staging,width,width//2)
        report.update(validate_encoded(scratch,staging))
        manifest = {**recipe,"revision":revision,"calibration":calibration,"audit":audit,"validation":report,"files":files}
        if any(digest(Path(__file__).parent/name) != expected for name,expected in modules.items()):
            raise ValueError("Pipeline source changed during preparation; rerun to pin a coherent recipe")
        if any(digest(ROOT/item["path"]) != item["sha256"] for item in inputs):
            raise ValueError("An input changed during preparation; revision will not be activated")
        (staging / "manifest.json").write_bytes(encoded_json(manifest))
        output.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staging,output)  # A partial revision is never externally addressable.
        # Keep the bounded scratch grid for explicit cleanup/reproduction; never delete user directories.
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for item in manifest["files"].values():
        if digest(output/item["path"]) != item["sha256"]: raise ValueError("Existing immutable revision is damaged")
    lock = {"schema":2,"revision":revision,"root":"/"+output.relative_to(ROOT/"public").as_posix(),
            "manifestSha256":digest(manifest_path),
            "stellarRegistration":"measured" if manifest["validation"].get("stellarRegistration",{}).get("passed") else "unverified"}
    if args.archive:
        archive = ROOT/"artifacts"/f"sky-v2-{revision}.zip"
        archive.parent.mkdir(exist_ok=True)
        pending_archive = archive.with_suffix(".zip.tmp")
        with zipfile.ZipFile(pending_archive,"w",compression=zipfile.ZIP_STORED) as bundle:
            for path in sorted(output.rglob("*")):
                if path.is_file():
                    info = zipfile.ZipInfo(path.relative_to(ROOT/"public").as_posix(),(1980,1,1,0,0,0))
                    bundle.writestr(info,path.read_bytes())
        os.replace(pending_archive,archive)
        lock["archive"] = {"bytes":archive.stat().st_size,"sha256":digest(archive)}
        print(f"Archive: {archive}",flush=True)
    lock_path = ROOT/"widgets/solar-system/sky/model/sky-atlas.lock.json"
    registration = manifest["validation"].get("stellarRegistration")
    if registration is not None:
        report = {**registration,"revision":revision,"manifestSha256":lock["manifestSha256"]}
        report_path = lock_path.with_name("sky-registration.json")
        pending_report = report_path.with_suffix(".json.tmp")
        pending_report.write_bytes(encoded_json(report)); os.replace(pending_report,report_path)
        lock["stellarRegistrationReportSha256"] = digest(report_path)
    temporary = lock_path.with_suffix(".tmp")
    temporary.write_bytes(encoded_json(lock)); os.replace(temporary,lock_path)
    print(f"Activated immutable Sky revision {revision}",flush=True)

def asset(path,root,width,height):
    return {"path":path.relative_to(root).as_posix(),"sha256":digest(path),"bytes":path.stat().st_size,
            "width":width,"height":height}

def make_large_base(scratch,output,encoder):
    """Avoid a second full 8K RGB image and the lossless encoder's large reference tables."""
    from photometry import srgb
    import gc
    import mmap
    gc.collect()
    if os.name == "nt":
        try: ctypes.CDLL("ucrtbase")._heapmin()
        except (AttributeError,OSError): pass
    path = output/"base-8k.webp"
    mapped_path = scratch.parent/"base-8k.rgbx"
    with open(mapped_path,"w+b") as stream:
        stream.truncate(8192*4096*4)
        pixels = mmap.mmap(stream.fileno(),0,access=mmap.ACCESS_WRITE)
        for row in range(0,4096,128):
            stripe = np.empty((128,8192,4),np.uint8)
            stripe[:,:,3] = 255
            for col in range(4):
                source = read_linear(scratch,8,row//2048,col)
                offset = row % 2048
                stripe[:,col*2048:(col+1)*2048,:3] = srgb(np.asarray(source[offset:offset+128],dtype=np.float32)/65535)
            pixels[row*8192*4:(row+128)*8192*4] = stripe.tobytes()
        del stripe, source
        image = Image.frombuffer("RGBA",(8192,4096),pixels,"raw","RGBA",0,1)
        png_path = scratch.parent/"base-8k-input.png"
        try: image.save(png_path,format="PNG",compress_level=1)
        finally: image.close(); pixels.close()
    result = subprocess.run([str(encoder),"-quiet","-q","98","-m","6","-low_memory",
                             "-partition_limit","100","-metadata","none","-noalpha",str(png_path),"-o",str(path)],
                            capture_output=True,text=True,timeout=180)
    if result.returncode: raise ValueError(f"Pinned cwebp failed: {result.stderr.strip()}")
    return path

def find_encoder():
    lock = json.loads((Path(__file__).parent/"encoder.lock.json").read_text())
    provided = os.environ.get("SKY_CWEBP") or shutil.which("cwebp")
    provenance = {"version":lock["version"]}
    if provided:
        binary = Path(provided)
    elif os.name == "nt":
        cache = ROOT/".sky-atlas-cache/tools"
        cache.mkdir(parents=True,exist_ok=True)
        binary = cache/lock["binary"]
        if not binary.exists() or digest(binary) != lock["binarySha256"]:
            archive = cache/"libwebp-1.6.0-windows-x64.zip"
            if not archive.exists() or digest(archive) != lock["sha256"]:
                with urllib.request.urlopen(lock["url"],timeout=30) as response, open(archive,"wb") as stream:
                    size = 0
                    while chunk := response.read(256*1024):
                        size += len(chunk)
                        if size > 8*1024**2: raise ValueError("Encoder archive exceeds its reservation")
                        stream.write(chunk)
            if digest(archive) != lock["sha256"]: raise ValueError("Encoder archive SHA-256 mismatch")
            with zipfile.ZipFile(archive) as bundle:
                data = bundle.read(lock["binary"])
            if hashlib.sha256(data).hexdigest() != lock["binarySha256"]: raise ValueError("Encoder binary SHA-256 mismatch")
            binary.parent.mkdir(parents=True,exist_ok=True)
            binary.write_bytes(data)
        provenance.update({"source":lock["url"],"archiveSha256":lock["sha256"]})
    else:
        raise SystemExit("Install cwebp 1.6.0 or set SKY_CWEBP to that executable")
    version = subprocess.run([str(binary),"-version"],capture_output=True,text=True,check=True,timeout=10).stdout.strip().splitlines()[0]
    if version != lock["version"]: raise ValueError(f"Expected cwebp {lock['version']}, found {version}")
    provenance["binarySha256"] = digest(binary)
    return binary,provenance

def prepare_linear_sources(source,scratch,cache,signature,gains):
    state_path = cache/"stages.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    reusable = state.get("signature") == signature and len(state.get("cores",{})) == 512
    if reusable:
        reusable = all((scratch/name).exists() and digest(scratch/name) == expected for name,expected in state["cores"].items())
    if not reusable:
        state_path.write_bytes(encoded_json({"signature":None}))
        for row in range(16):
            for col in range(32):
                with Image.open(source/"tiles/64k"/str(row)/f"{col}.webp") as image:
                    rgb = linear(np.asarray(image.crop((2,2,2050,2050))))
                save_linear(scratch,64,row,col,correct(rgb,sample_field(gains,col,row)))
                del rgb
            print(f"Corrected row {row+1}/16",flush=True)
        cores = {path.relative_to(scratch).as_posix():digest(path) for path in sorted((scratch/"64").rglob("*.npy"))}
        state_path.write_bytes(encoded_json({"signature":signature,"cores":cores}))
    for level in (32,16,8):
        for row in range(level//4):
            for col in range(level//2): parent(scratch,level,row,col)
        print(f"Linear pyramid {level}K ready",flush=True)
    return validate_pyramid(scratch)

def prepare_calibration(source,reference,cache,signature):
    record_path = cache/"calibration.json"
    field_path = cache/"correction.npy"
    if record_path.exists() and field_path.exists():
        record = json.loads(record_path.read_text())
        if record.get("signature") == signature and record.get("sha256") == digest(field_path):
            return np.load(field_path,allow_pickle=False),record["calibration"],record["metadata"]
    low = np.empty((512,1024,3),dtype=np.float32)
    for row in range(16):
        for col in range(32):
            with Image.open(source/"tiles/64k"/str(row)/f"{col}.webp") as image:
                rgb = linear(np.asarray(image.crop((2,2,2050,2050))))
            low[row*32:(row+1)*32,col*32:(col+1)*32] = downsample(rgb,64)
        print(f"Calibration row {row+1}/16",flush=True)
    del rgb
    ref = np.empty_like(low)
    with closing(oiio.ImageInput.open(str(reference))) as image:
        if (image.spec().width,image.spec().height) != (8192,4096): raise ValueError("Expected 8K photometric reference")
        metadata = {"oiioColorSpace":str(image.spec().getattribute("oiio:ColorSpace")),
                    "Orientation":str(image.spec().getattribute("Orientation"))}
        for row in range(16):
            block = image.read_scanlines(row*256,(row+1)*256,0,0,3,oiio.UINT8)
            if block is None: raise ValueError(image.geterror())
            ref[row*32:(row+1)*32] = downsample(linear(block),8)
    gains,calibration = correction_field(low,ref)
    np.save(field_path,gains,allow_pickle=False)
    record_path.write_bytes(encoded_json({"signature":signature,"sha256":digest(field_path),
                                         "calibration":calibration,"metadata":metadata}))
    return gains,calibration,metadata

if __name__ == "__main__": main()
