# Sky v2

Sky lives in `widgets/solar-system/sky/`. `SkySystem` owns context recovery;
`SkyTileScheduler` orchestrates the loader, bounded decoded cache, GPU pool,
projection-aware selector and two page tables. `SkySphere` owns the single
opaque draw and the warmed, stable shader. Sky does not add a postprocessing
or output colour pass: `SunBloom` continues to own `EffectComposer → OutputPass`.

## Preparing and transporting the assets

For a clean checkout, install Python 3.11 or newer and restore the pinned
GitHub Release. This uses the standard library; the image-processing toolchain
below is needed only when generating a new revision.

```sh
npm run restore:sky
```

The release tag is `sky-v2-<revision>` and its asset is
`sky-v2-<revision>.zip`. The archive's byte length and SHA-256 are pinned in
`model/sky-atlas.lock.json`. CI restores it before the production build.
A [published release for the current revision](https://github.com/AntonBrendak/solar-system-explorer/releases/tag/sky-v2-fafbe0927e770783d1e9ff33a91211beb21515ff1ed2d34f6b0ff2eb2199951e)
contains the immutable archive and its separate measured registration report.
A second pinned `sky-coverage-<revision>.zip` asset contains eight lossless
8K streaming tiles. `restore:sky` restores both archives; the original 865 MiB
archive and registration proof remain unchanged. The coverage lock is itself
hashed by the main lock, and the build verifies every supplement file.
A local archive under `artifacts/` is reused, or can be selected explicitly:

```sh
npm run restore:sky -- --archive /path/to/sky-v2-<revision>.zip
```

Restoration verifies the archive, manifest and each file before atomically
installing a complete revision. An existing valid revision is retained;
damaged existing data fails with an error instead of being overwritten.

Install the exact Python/tool versions in `scripts/star-atlas/toolchain.lock.json`
and `requirements.txt`. The existing `.venv-atlas` is used automatically;
`SKY_ATLAS_PYTHON` can select another interpreter.

The large-base encoder is cwebp 1.6.0. On Windows its official distribution
is fetched into the ignored tool cache and verified against `encoder.lock.json`
before execution. Other platforms can install that version or set `SKY_CWEBP`.
The native executable's hash and encoding options are pinned in the manifest.

```sh
npm run prepare:sky -- --archive
```

This is an explicit resource preparation command, not part of a build. It reads
the 512 existing 64K WebP tiles and the existing 8K reference without changing
them or downloading originals. Linear luminance calibration uses a bounded,
periodic low-frequency correction field and a monotonic highlight shoulder
which scales RGB together. Linear uint16 scratch files bound quantisation
error and avoid assembling the 64K image in RAM. Processing is single threaded;
the preparation process enforces a 512 MiB native allocation limit.

The command validates the common pixel-centre pyramid and encoded interlevel
brightness before atomically publishing an immutable revision and updating
`model/sky-atlas.lock.json`. The manifest records source and output hashes,
algorithm/module/tool versions, coordinate/colour contracts, correction
parameters and validation results. The historical brightness discrepancy's
cause remains unproven because the original EXR/transform provenance is absent.
No independent spatial warp is applied or inferred from brightness samples.

Detailed tiles, the reserve and 2K/4K bases use lossless WebP. The 8K base uses
WebP quality 98 with 128-row input stripes to keep its encoder within the
process-group memory limit. Its low-memory and partition-limit settings are
explicit; its encoded interlevel brightness is gated as well.

Generated resources are ignored by Git. The archive contains the complete
`textures/space/revisions/v2/<revision>/` tree, including its manifest. Upload
it as the asset of its corresponding GitHub Release before pushing code that
pins a new revision. Use `restore:sky` on another checkout; the lock and
application code go in Git.
The ordinary build checks the pinned revision's completeness and manifest hash;
it never silently regenerates images. Runtime additionally verifies each
download's length and SHA-256 before decoding. Incomplete revisions cannot be
activated. Scratch data remains in `.sky-atlas-cache/` for reproducibility and
can be removed explicitly when no preparation command is running.

## Runtime contracts

- Coordinates are top-down equirectangular ICRF/J2000. The existing celestial
  transform, camera centring and atlas reflection are preserved.
- A `NetworkTile` is 2048² useful pixels plus two-pixel gutters. GPU page
  profiles have **physical** sizes 1028², 516² and 260². Linear page filtering
  uses neither mipmaps nor anisotropy. Limits use both `MAX_TEXTURE_SIZE` and
  `MAX_ARRAY_TEXTURE_LAYERS`.
- A spatial transition region is one complete network tile, containing 4, 16
  or 64 physical pages, respectively. Its angular extent stays the same across
  page profiles. The selector conservatively intersects
  spherical regions with actual projection planes, including view offsets.
  The full source/target peak must fit the fixed pool before a group starts.
  Coverage selection counts complete intersecting tiles and retained ancestors.
  A separate density goal permits local refinement after coarser coverage;
  it does not pretend the whole view can fit the highest level.
- Revisions and context/pool/slot/upload/reservation identities are strict.
  `viewGeneration` is advisory. A still-useful tile adopts a new view without
  restarting its request; cancellation waits 500 ms outside the current guard
  region. The guard extends a quarter logical tile on each side.
- Requested → Decoded → Upload queued → GPU uploaded → Published → Visible.
  There are at most three fetches, one decode and one heavy page upload per
  frame. Buffers have one owner; bitmaps close in `finally`. Without worker
  support, detail decoding waits for 400 ms of camera stillness.
- An upload's `onUpdate` runs after Three r186's actual upload commands.
  Only then is its fence created. Nonblocking polls distinguish timeouts,
  failures and completion. Backing slices and decoded inputs remain protected
  until completion. A whole prepared page table has its own upload fence and
  becomes visible only at a frame boundary. Readers retire through fences.
- One spatial group blends for 400 ms. Coarser ancestors remain resident for
  spatial blending at exposed coverage edges. Same-level page joins remain
  fully detailed; missing edge/corner neighbours feather into the nearest
  prepared ancestor in linear RGB. A 256×128 reserve remains resident through resource
  swaps; context loss uses HTML with that image and the always-available home
  link, then recreates GPU resources from the retained, valid CPU cache.

## Budgets and scheduling

Sky starts with independent CPU/GPU ceilings of 256 MiB, each including 15%
safety reserve. After four seconds of bootstrap, coarse device hints permit
512 MiB when device memory is at least 8 GiB, concurrency is at least eight,
Save-Data is off, and WebGL supports 8K textures and at least 256 array layers.
Unknown or constrained devices keep 256 MiB. These are declared application
allowances, not free-VRAM estimates or successful-allocation benchmarks.
GPU model names are not inspected. A positive FPS does not prove free memory.
`?diagnostics=1&skyMemory=1024` explicitly enables the bounded experimental
1 GiB profile; 256 and 512 are also accepted. The shared map/preview allowance
increases with an admitted larger profile and falls back when its owner exits.
The ledgers account for the entire fixed pool, CPU backing array,
both page tables, bases and base mipmaps, compressed responses, decoder peak,
decoded cache and temporary coexistence. Global GPU admission includes the
other models, postprocessing and preview context. Renderer counters and JS
heap diagnostics are separate from those reservations; ordinary Web APIs do
not expose exact browser-process or driver allocations.

Pool sizing uses at most 75% of the combined application allowance after
subtracting existing leases, including Sky's safety reserve. The remaining
25% covers model transitions and unallocated headroom. Ordinary browser APIs
cannot report free VRAM; neither renderer limits nor `deviceMemory` supply it.
The app therefore never claims to allocate 70% of a visitor's free VRAM.
Base selection prefers the same headroom, but admits a
2K base when it fits the actual shared budget even if a whole detail group
does not fit alongside it. Main-base selection waits until the Sun and
all 17 initial Lite models/previews have registered their resource leases;
allocation order cannot hide their mandatory footprint. This is memory
admission, independent of FPS.

Once its upload/warmup fence completes, a main base becomes GPU-only: its
decoded CPU buffer is released and its mip chain stays resident. Recovery
reacquires that immutable source through the loader. The small reserve keeps
its CPU pixels. Pool sizing reserves decoder space and twice the manifest's
largest compressed network tile, so queued responses cannot deadlock decoding.

The permanent full-sphere base prefers 4K and falls back to 2K according to
physical limits and decode peak. An 8K virtual level supplies the first whole-view
streaming target instead of occupying 170.7 MiB with a mipmapped 8K base.
A smaller base or the permanent reserve remains valid under hard limits.

Postprocessing storage is capped at the smaller of 192 MiB and one quarter
of the shared GPU budget. Multisampling requires the stricter 96 MiB / one-eighth
allowance so it cannot prevent camera-directed refinement. It is disabled first; only if resolved
buffers still exceed the cap is their pixel ratio reduced. This keeps a large
viewport from consuming Sky's mandatory base allowance.

`ViewportCoverageBudget` selects the highest complete-view level that fits
the working set, all retained ancestors and a separate complete-tile transition
reserve. Visible coverage at 8K precedes 16K coverage. Screen height, DPR and
effective FOV determine the whole-view goal;
the projected camera centre ranks candidates within that policy. Any intersecting
tile is eligible without full viewport containment. Partially prepared higher
coverage levels remain hidden until the whole view is covered, then the complete
view blends for 400 ms. Once that baseline is complete, the camera direction
may refine locally up to four times its source width, capped at 64K. A parent
must be resident before a local child is requested. Baseline coverage and
readers stay protected; a peripheral refinement yields only to a higher-priority
replacement, avoiding repeated eviction/download cycles in a stationary view.
Diagnostics show ready/target coverage, the allocation ceiling, visible detail
and the 64K whole-view page peak including ancestors and transition headroom.
The diagnostics distinguish CPU pressure, physical pool capacity, transition
headroom, shader cost and the configured quality ceiling. These decisions are
independent of another scene component's FPS.

Physical pool capacity derives from this viewport's selected working set,
one transition tile and a bounded refinement/look-ahead cache: the larger of two
network tiles and 25% of the working set, clamped by available headroom and both memory
ledgers and the shared map allowance.
The capacity also anticipates the next whole-view level's page peak, within
the same hard admission limits; free bytes must not be stranded behind a pool
sized only for the already-published level. Offscreen residency follows the current
viewport cache target; it cannot consume transition slots. The array does not
grow by probing available memory, and no second full backing array is created
during an active replacement. The larger profile is admitted before the first
array allocation, so CPU backing storage does not temporarily double.

Reproduce the 8K supplement using the pinned toolchain:

```sh
python scripts/star-atlas/prepare_coverage.py
```

The command reads the existing encoded 8K base in scanline blocks under the
512 MiB process-family limit. Lossless tiles and gutters must match their source
pixels after decoding. Tool versions and the source hash identify the immutable
revision, and fixed ZIP metadata makes its archive reproducible. No NASA source
download or recalibration of the existing 16K/32K/64K revision occurs.

Scene overload pauses uploads, copying and new decodes while preserving shown
LOD. It never attributes another object's slowdown to Sky. Submission time
over 2 ms pauses for at least 250 ms and decreases upload frequency; sustained
slow submissions switch physical profile only after camera stillness, through
the reserve and fenced retirement. Work is chunked into at most 256 KiB and
a 1 ms main-thread allowance. An already-started WebGL call is not preemptible.
GPU draw samples reserve separate frames so the full-renderer and Sky queries
cannot nest; disjoint samples are discarded. These measurements restrict new
transitions, without an automatic FPS-driven LOD decrease.

Startup waits for the base, compiled/offscreen-warmed shader, all 17 initial
models/previews, the highest budget-admitted whole-view Sky level and the admitted
camera-centre refinement, including GPU/table fences and final blends. Bootstrap
streaming may finish under the loader even when the hidden scene has slow frames;
native upload backoff still applies. A terminal tile failure selects
the prepared lower complete-view level so startup cannot wait forever.
The collapsed FPS control contains map, preview and Sky diagnostics. React
does not subscribe to per-frame camera, queue, table or blend changes.

## Failure and frame admission policy

An immutable tile's SHA-256/length mismatch, decode corruption, or permanent
HTTP status stops automatic requests immediately. Network failures and
408/425/429/5xx responses have at most four failed attempts, with 1/2/4 second
backoff and bounded Retry-After handling. Cancellation spends no attempt.
A terminal child suppresses its whole unpublished transition group; its
already visible parent stays resident and other groups can continue.

Fetch, bounded response copying, SHA-256 and decoding run in one Worker when
available. RPC aborts retain their reservations until worker acknowledgement.
Without a Worker, response copies enter the same frame queue; bitmap waiting
is asynchronous and Canvas preparation runs only while the camera is idle.
Two detail preparations longer than 2 ms latch detailed streaming off for
the JS session/revision, including context recreation. The measured interval
excludes time spent awaiting ImageBitmap. Existing visible detail is retained.

There is one absolute deadline created at the start of each Sky tick. Coverage
scans, group construction, queued fallback work, page-table preparation and
page copying resume against that deadline across frames. They never restart
independent 1 ms allowances. Indivisible native submissions can exceed it;
their actual cost is recorded and no further preparation starts in that frame.
The FPS panel exposes Sky CPU peak, compile wait and warmup-to-GPU-ready time.
Compilation uses compileAsync; the warmup draw waits for frame admission.

## Post-codec stellar registration

The legacy `pixelCentreRegistrationError` field only described the known
2x2 coordinate mapping. It did not measure stellar displacement. The immutable
manifest/archive is preserved byte-for-byte; its zero is not used as acceptance.
The current lock records `stellarRegistration: measured` and pins the SHA-256
of [the actual report](../widgets/solar-system/sky/model/sky-registration.json).
That report identifies both the revision and its exact manifest hash. The build
gate verifies this binding before accepting the separate proof. Future prepared
revisions also embed the result in their manifest.

On 2026-11-10 all five adjacent pairs passed: 21,824 qualified stars, no
unmatched stars and a maximum displacement of 0.114383 common-resolution
pixels, below the 0.25-pixel limit. This is a spatially stratified measurement.
The pinned report below records the measured samples and per-level errors.

The separate command below decodes the existing WebP assets and compares
adjacent 2K/4K/8K/16K/32K/64K levels on a common linear-luminance pixel grid:

```sh
npm run validate:sky-registration
```

It uses spatially stratified isolated-star samples, local background-plane
subtraction and intensity centroids in the same 11x11 aperture. It reports
matched/unmatched counts, measured shifts, maximum/P95 error and failing
coordinates. No fitted warp or assumed zero is used. Fewer than 32 matches
per pair, an unmatched qualified star, or a shift over 0.25 common-resolution
pixels fails the gate. The report identifies the exact source manifest hash.
Both the checker and full generation use the 512 MiB process-family limit.
Future preparation gates immutable publication on this actual measurement.

The checker batches independent reference-aperture calculations in groups of
256, preserving selection order, thresholds and centroid definitions. Local
blend checks use the same 11x11 maxima neighbourhood. No samples or LOD pairs
are skipped to reduce its runtime. The complete grid is visited tile-first;
each reader keeps at most 96 MiB of decoded tiles within the 512 MiB process
limit, avoiding repeated decoding when apertures cross file boundaries.

Production asset rules include revisions and exclude the retired original
tile pyramid; canonical source files remain available to local preparation.

## Acceptance checks

### Image formation

The sphere is a rasterisation proxy. Atlas coordinates are reconstructed per
fragment from the local ray direction, avoiding vertex-UV distortion of star
positions and shapes. GPU regression probes compare ordinary, oblique and polar
views against an independent inverse-projection reference.

The coherent coverage floor remains visible during minification. A continuous
1-to-16-tap linear-light footprint filter samples it across page boundaries;
quadrature weights change smoothly without a discrete tap-count brightness step.
Higher detail uses registered adjacent pyramid levels according to pixel footprint.
Screen-centred resolution zones inherit resident parents' coverage envelopes.
Their radius follows the admitted viewport cache with 250 ms smoothing. Missing
coverage is feathered over up to 96 screen pixels, capped at one eighth of a
logical network tile so small detailed regions keep a fully sharp interior. Occupied neighbours
at the same level have no feather. Longitude wraps and latitude clamps. Sampling
and transitions stay linear, followed by the existing OutputPass.

Startup prioritises the admitted central detail chain before peripheral upgrades.
An aimed child can reclaim peripheral refinements while protecting its required
parent and the coherent floor. Diagnostics distinguish resident LOD from the
detail selected by screen-space filtering.

Loading progress assigns 20% to the Sun/models/previews and 80% to Sky work.
The latter includes streamed response bytes, decoding, confirmed GPU pages,
page-table publication and real blend completion. Updates share the Sky frame
deadline, are throttled, and remain monotonic. Only actual scene readiness permits
100%; the loader still waits for every required preview. This measures completed
work rather than predicting remaining download time.

### Full-sphere acceptance

1. Rotate continuously, across RA wrap and poles, with camera view offsets:
   useful requests survive view changes and downloads remain deduplicated.
2. Compare the same transition region under all three physical profiles;
   reject a partial group or an insufficient source/target peak.
3. Delay/fail upload and table fences; cancel or lose context during every
   lifecycle stage. No stale identity may publish or overwrite a live reader.
4. Overload planets/previews: Sky streaming pauses but shown quality remains.
5. Compare browser output in linear RGB. Per-channel tolerance is the linear
   interval corresponding to ±2 sRGB8 steps, not byte equality.
6. Check encoded interlevel brightness (≤5% where luminance ≥0.001, absolute
   ≤0.0001 below it), common-resolution star registration (≤0.25 pixel),
   colours and bright-star detail. Inspect the complete publication/recovery
   sequence visually, including the HTML fallback and home navigation.

Resource generation does not establish browser performance or successful
application acceptance checks.
