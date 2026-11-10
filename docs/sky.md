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
- A spatial transition region has four logical children, containing 16, 64 or
  256 physical pages, respectively. The selector conservatively intersects
  spherical regions with actual projection planes, including view offsets.
  The full source/target peak must fit the fixed pool before a group starts.
  Coverage selection counts complete angular groups, including offscreen child
  pages. A separate density goal permits local refinement after coarser coverage;
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
- One spatial group blends for 400 ms. Parents remain visible until complete
  target coverage exists. A 256×128 reserve remains resident through resource
  swaps; context loss uses HTML with that image and the always-available home
  link, then recreates GPU resources from the retained, valid CPU cache.

## Budgets and scheduling

Sky has independent CPU/GPU ceilings of 256 MiB, each including 15% safety
reserve. The ledgers account for the entire fixed pool, CPU backing array,
both page tables, bases and base mipmaps, compressed responses, decoder peak,
decoded cache and temporary coexistence. Global GPU admission includes the
other models, postprocessing and preview context. Renderer counters and JS
heap diagnostics are separate from those reservations; ordinary Web APIs do
not expose exact browser-process or driver allocations.

Base selection and pool sizing leave one quarter of the combined map budget
unallocated for a Full-model transition. This matches the Full-model policy's
peak allowance and prevents a pinned Sky pool from exhausting the space needed
to prepare the next model tier. Main-base selection waits until the Sun and
all 17 initial Lite models/previews have registered their resource leases;
allocation order cannot hide their mandatory footprint. This is memory
admission, independent of FPS.

Once its upload/warmup fence completes, a main base becomes GPU-only: its
decoded CPU buffer is released and its mip chain stays resident. Recovery
reacquires that immutable source through the loader. The small reserve keeps
its CPU pixels. Pool sizing reserves decoder space and twice the manifest's
largest compressed network tile, so queued responses cannot deadlock decoding.

Bases are admitted from 8K/4K/2K according to physical limits, decode peak and
group headroom. With the current RGBA8 Canvas decode path, the conservative
8K decode peak exceeds the CPU cap, so it is rejected rather than silently
breaking the budget. A smaller base or the permanent reserve remains valid.

Scene overload pauses uploads, copying and new decodes while preserving shown
LOD. It never attributes another object's slowdown to Sky. Submission time
over 2 ms pauses for at least 250 ms and decreases upload frequency; sustained
slow submissions switch physical profile only after camera stillness, through
the reserve and fenced retirement. Work is chunked into at most 256 KiB and
a 1 ms main-thread allowance. An already-started WebGL call is not preemptible.
GPU draw samples reserve separate frames so the full-renderer and Sky queries
cannot nest; disjoint samples are discarded. These measurements restrict new
transitions, without an automatic FPS-driven LOD decrease.

Startup waits for the base, compiled/offscreen-warmed shader and all 17 initial
models/previews. Detailed tile requests do not extend the initial loader.
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
See [validation](validation.md) for the execution matrix and limitations.

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
