"""Asset validation is an explicit pipeline operation, never an application test hook."""
import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
import numpy as np
import OpenImageIO as oiio
from contextlib import closing
from PIL import Image
from photometry import linear, luminance
from pyramid import read_linear, downsample

def linear_tolerance(encoded):
    current = linear(encoded)
    high = linear(np.minimum(encoded.astype(np.int16) + 2, 255))
    low = linear(np.maximum(encoded.astype(np.int16) - 2, 0))
    return np.maximum(high - current, current - low)

def assert_browser_linear_values(encoded_reference, actual_linear):
    # Asymmetric sRGB steps become asymmetric linear intervals; never allow four steps.
    low = linear(np.maximum(encoded_reference.astype(np.int16) - 2, 0))
    high = linear(np.minimum(encoded_reference.astype(np.int16) + 2, 255))
    if np.any(actual_linear < low - 1e-7) or np.any(actual_linear > high + 1e-7):
        raise ValueError("Browser output exceeds the two-step sRGB8 linear tolerance")

def validate_pyramid(scratch):
    worst = 0.0
    # Check the pre-codec pyramid's area mapping and stored values. Stellar centroid
    # registration is measured separately from the decoded WebP files below.
    for level in (8, 16, 32):
        for row in range(level // 4):
            for col in range(level // 2):
                parent = read_linear(scratch, level, row, col)
                for dy in range(2):
                    for dx in range(2):
                        child = np.asarray(read_linear(scratch, level * 2, row * 2 + dy, col * 2 + dx), dtype=np.float32) / 65535
                        expected = downsample(child, 2)
                        actual = np.asarray(parent[dy*1024:(dy+1)*1024, dx*1024:(dx+1)*1024], dtype=np.float32) / 65535
                        error = float(np.max(np.abs(expected - actual)))
                        worst = max(worst, error)
                        if error > 2 / 65535: raise ValueError(f"Pyramid registration/colour mismatch at {level}/{row}/{col}")
    return {"linearPyramidMaxAbsoluteError": worst,
            "coordinateMapping": "validated 2x2 area mapping; this is not a stellar registration measurement"}

def validate_encoded(scratch, output):
    from pathlib import Path
    errors = []
    # Compare encoded levels on a common 64x32 angular grid (linear area averages).
    reference = np.empty((32, 64, 3), np.float32)
    with closing(oiio.ImageInput.open(str(Path(output)/"base-8k.webp"))) as image:
        for row in range(32):
            stripe = image.read_scanlines(row*128,(row+1)*128,0,0,3,oiio.UINT8)
            if stripe is None: raise ValueError(image.geterror())
            reference[row:row+1] = downsample(linear(stripe),128)
    base_luma = luminance(reference)
    for level in (16,32,64):
        samples = np.empty((32,64,3),np.float32)
        size = 128 // level
        for row in range(level//4):
            for col in range(level//2):
                with Image.open(Path(output)/"tiles"/f"{level}k"/str(row)/f"{col}.webp") as image:
                    tile = linear(np.asarray(image.crop((2,2,2050,2050))))
                block = downsample(tile,2048//size)
                samples[row*size:(row+1)*size,col*size:(col+1)*size] = block
        luma = luminance(samples)
        bright = base_luma >= .001
        relative = float(np.max(np.abs(luma[bright]/base_luma[bright]-1))) if bright.any() else 0
        dark = float(np.max(np.abs(luma[~bright]-base_luma[~bright]))) if (~bright).any() else 0
        if relative > .05 or dark > .0001: raise ValueError(f"Encoded brightness gate failed at {level}K: {relative:.3%}, dark {dark}")
        errors.append({"level":level,"maxRelativeLuminance":relative,"maxDarkAbsolute":dark})
    registration = validate_stellar_registration(output)
    if not registration["passed"]:
        raise ValueError(f"Post-codec stellar registration failed: {registration}")
    return {"brightness":errors, "stellarRegistration":registration}


class EncodedAtlasReader:
    """Bounded decoded-tile LRU and scanline base access. All samples come from encoded files."""
    def __init__(self, root, level, manifest=None, verified=None):
        from collections import OrderedDict
        from pathlib import Path
        self.root = Path(root)
        self.level = level
        self.width, self.height = level * 1024, level * 512
        self.cache = OrderedDict()
        self.cache_bytes = 0
        self.manifest = manifest
        self.verified = verified if verified is not None else set()
        self.base = None
        if level <= 8:
            path = self.asset(f"base-{level}k", f"base-{level}k.webp")
            self.base = oiio.ImageInput.open(str(path))
            if not self.base:
                raise ValueError(oiio.geterror())
            if (self.base.spec().width, self.base.spec().height, self.base.spec().nchannels) != (self.width, self.height, 3):
                self.base.close()
                raise ValueError("Encoded base dimensions/colour contract mismatch")

    def asset(self, key, relative):
        import hashlib
        path = self.root / relative
        if self.manifest is not None and key not in self.verified:
            expected = self.manifest["files"][key]
            if expected["path"] != relative or path.stat().st_size != expected["bytes"]:
                raise ValueError(f"Encoded asset metadata mismatch: {key}")
            with open(path,"rb") as stream:
                actual = hashlib.file_digest(stream,"sha256").hexdigest()
            if actual != expected["sha256"]:
                raise ValueError(f"Encoded asset SHA-256 mismatch: {key}")
            self.verified.add(key)
        return path

    def tile(self, row, column):
        key = (row,column)
        if key not in self.cache:
            path = self.asset(f"{self.level}/{row}/{column}", f"tiles/{self.level}k/{row}/{column}.webp")
            with Image.open(path) as image:
                if image.size != (2052,2052) or image.mode != "RGB":
                    raise ValueError("Encoded tile dimensions/colour contract mismatch")
                rgb = np.array(image)
            self.cache[key] = rgb
            self.cache_bytes += rgb.nbytes
            while self.cache_bytes > 96 * 1024**2:
                _, previous = self.cache.popitem(last=False)
                self.cache_bytes -= previous.nbytes
        self.cache.move_to_end(key)
        return self.cache[key]

    def read(self, x, y, width, height):
        xx = np.arange(x,x+width) % self.width
        yy = np.clip(np.arange(y,y+height),0,self.height-1)
        if self.base:
            top, bottom = int(yy.min()), int(yy.max())+1
            stripe = self.base.read_scanlines(top,bottom,0,0,3,oiio.UINT8)
            if stripe is None:
                raise ValueError(self.base.geterror())
            rgb = stripe[(yy-top)[:,None],xx[None,:],:]
        else:
            rgb = np.empty((height,width,3),np.uint8)
            for row in np.unique(yy//2048):
                ys = np.flatnonzero(yy//2048 == row)
                for col in np.unique(xx//2048):
                    xs = np.flatnonzero(xx//2048 == col)
                    source = self.tile(int(row),int(col))
                    rgb[np.ix_(ys,xs)] = source[(yy[ys]%2048+2)[:,None],(xx[xs]%2048+2)[None,:]]
        return luminance(linear(rgb))

    def close(self):
        if self.base:
            self.base.close()
        self.cache.clear()


def measure_star_displacements(reference, candidate, halo=8, limit=8):
    """Reference-selected isolated stars; never discard a match because its shift is large.

    Both arrays already use the same pixel-centred angular grid. Fit the local
    sky gradient from an aperture's border, then measure positive-flux centroids
    in the SAME 11x11 aperture. No image warping or fitted registration is applied.
    """
    if reference.shape != candidate.shape:
        raise ValueError("Registration grids differ")
    local = reference[1:-1,1:-1]
    maxima = np.ones(local.shape,dtype=bool)
    for dy in range(3):
        for dx in range(3):
            if (dy,dx) != (1,1):
                maxima &= local > reference[dy:dy+local.shape[0],dx:dx+local.shape[1]]
    maxima &= local > .003
    yy,xx = np.nonzero(maxima)
    yy,xx = yy+1,xx+1
    order = np.argsort(reference[yy,xx])[::-1]
    radius = 5
    gy,gx = np.mgrid[-radius:radius+1,-radius:radius+1]
    design = np.stack([np.ones(gx.size),gx.ravel(),gy.ravel()],axis=1)
    ring = (np.maximum(np.abs(gx),np.abs(gy)) == radius).ravel()
    fit = np.linalg.pinv(design[ring])

    def signal(image):
        background = (design @ (fit @ image.ravel()[ring])).reshape(image.shape)
        return np.maximum(image-background,0)

    def centroid(weights):
        total = float(weights.sum())
        if total <= 1e-8:
            return None
        return float((weights*gx).sum()/total),float((weights*gy).sum()/total)

    records = []
    selected = []
    eligible = ((xx >= halo) & (xx < reference.shape[1]-halo) &
                (yy >= halo) & (yy < reference.shape[0]-halo))
    order = order[eligible[order]]
    neighbourhood = ((gx*gx+gy*gy <= radius**2) & ((gx != 0) | (gy != 0)))
    # Batch only independent reference calculations; preserve descending peak order,
    # apertures, rejection criteria and candidate-independent feature selection.
    for start in range(0,len(order),256):
        indices = order[start:start+256]
        windows = reference[yy[indices,None,None]+gy,xx[indices,None,None]+gx]
        borders = windows.reshape(len(indices),-1)[:,ring]
        backgrounds = ((design @ (fit @ borders.T)).T).reshape(windows.shape)
        signals = np.maximum(windows-backgrounds,0)
        noise = np.median(np.abs(borders-np.median(borders,axis=1)[:,None]),axis=1)
        peaks = signals[:,radius,radius]
        flux = signals.sum(axis=(1,2))
        qualified = np.flatnonzero((peaks >= np.maximum(.003,8*noise)) & (flux >= .02))
        for local_index in qualified:
            index = indices[local_index]
            y,x = int(yy[index]),int(xx[index])
            if any((x-px)**2+(y-py)**2 < (2*radius+2)**2 for py,px in selected):
                continue
            window = windows[local_index]
            weights = signals[local_index]
            neighbours = maxima[y-radius-1:y+radius,x-radius-1:x+radius] & neighbourhood
            if np.any(window[neighbours] > float(window.min()) + .3*peaks[local_index]):
                continue
            first = centroid(weights)
            second_window = candidate[y-radius:y+radius+1,x-radius:x+radius+1]
            second_weights = signal(second_window)
            second = centroid(second_weights)
            ratio = float(second_weights.sum()) / max(float(weights.sum()),1e-8)
            if not .5 <= ratio <= 2:
                second = None
            selected.append((y,x))
            if first is None or second is None:
                records.append({"x":x,"y":y,"matched":False})
            else:
                dx,dy = second[0]-first[0],second[1]-first[1]
                records.append({"x":x,"y":y,"matched":True,"dx":dx,"dy":dy,"error":float(np.hypot(dx,dy))})
            if len(records) >= limit:
                return records
    return records


def registration_strata(width, height, block=512):
    """Visit the same angular grid tile-first so adjacent apertures reuse decoded images."""
    for tile_y in range(0,height,2048):
        for tile_x in range(0,width,2048):
            for y in range(tile_y,min(tile_y+2048,height),block):
                for x in range(tile_x,min(tile_x+2048,width),block):
                    yield x,y,min(block,width-x),min(block,height-y)


def validate_stellar_registration(output, manifest=None):
    """Spatially stratified, post-WebP-decode centroids at each adjacent pair's common resolution."""
    threshold, minimum, halo, block = .25, 32, 8, 512
    pairs = []
    verified = set()
    for low,high in ((2,4),(4,8),(8,16),(16,32),(32,64)):
        print(f"Registration: {low}K / {high}K",flush=True)
        coarse = EncodedAtlasReader(output,low,manifest,verified)
        fine = None
        measurements, unmatched, strata = [],0,0
        examples = []
        try:
            fine = EncodedAtlasReader(output,high,manifest,verified)
            for x,y,width,height in registration_strata(coarse.width,coarse.height,block):
                reference = coarse.read(x-halo,y-halo,width+2*halo,height+2*halo)
                decoded = fine.read(2*(x-halo),2*(y-halo),2*(width+2*halo),2*(height+2*halo))
                reduced = decoded.reshape(height+2*halo,2,width+2*halo,2).mean(axis=(1,3),dtype=np.float32)
                records = measure_star_displacements(reference,reduced,halo)
                strata += 1
                for record in records:
                    if not record["matched"]:
                        unmatched += 1
                    else:
                        measurements.append(record["error"])
                        if record["error"] > threshold and len(examples) < 20:
                            examples.append({**record,"x":record["x"]+x-halo,"y":record["y"]+y-halo})
        finally:
            coarse.close()
            if fine:
                fine.close()
        maximum = max(measurements) if measurements else None
        passed = len(measurements) >= minimum and unmatched == 0 and maximum is not None and maximum <= threshold
        pairs.append({"coarseLevel":low,"fineLevel":high,"commonWidth":low*1024,
                      "strata":strata,"matchedStars":len(measurements),"unmatchedStars":unmatched,
                      "maxErrorPixels":maximum,"p95ErrorPixels":float(np.percentile(measurements,95)) if measurements else None,
                      "passed":passed,"failedExamples":examples})
        print(f"Registration {low}K / {high}K: {len(measurements)} matches, "
              f"{unmatched} unmatched, max {maximum}, passed={passed}",flush=True)
    return {"method":"post-codec, linear-luminance, background-subtracted isolated-star centroids",
            "thresholdPixels":threshold,"minimumMatchedStarsPerPair":minimum,
            "sampling":{"blockPixels":block,"maxStarsPerBlock":8,"apertureRadius":5,"halo":halo,
                        "traversal":"tile-major; complete spatial grid","decodedTileCacheMiBPerReader":96},
            "pairs":pairs,"passed":all(pair["passed"] for pair in pairs)}


if __name__ == "__main__":
    from memory_budget import limit_memory
    limit_memory()
    import argparse
    import hashlib
    import json
    from pathlib import Path
    parser = argparse.ArgumentParser(description="Measure stellar registration in an existing immutable encoded revision")
    parser.add_argument("--encoded",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args = parser.parse_args()
    manifest_path = args.encoded/"manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    report = validate_stellar_registration(args.encoded,manifest)
    report["manifestSha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    report["revision"] = manifest["revision"]
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(f"Stellar registration: {'passed' if report['passed'] else 'FAILED'}; report: {args.output}")
    raise SystemExit(0 if report["passed"] else 1)
