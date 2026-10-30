# Planet renderer contracts

## Source ownership

```text
features/planet-viewer/
  index.ts                Public API for widgets
  model/                  Cache, resources, texture ownership and contracts
  ui/                     Canvas host, viewports, views and staged readiness
  scenes/
    registry.ts           Lazy registration and source credits
    <planet>/             Scene, environment, shaders and orientation helpers
```

For example, Earth geometry, clouds, lightning, texture metadata and solar calculations belong together in `scenes/earth/`. A planet-specific calculation does not belong in a generic root `lib/` directory.

## View and scene lifetime

`PlanetCanvasProvider` owns the persistent renderer host, active viewport registration and top-layer relocation. `useSceneCache` owns Full-scene lifetime; `scene-cache.ts` defines the LRU policy. `PlanetViewport` owns visibility, error-only poster fallback and the current DOM target. Startup and offscreen viewports do not request flat planet images: the first visual is the lightweight 3D preview with small local textures, retained while Full detail prepares.

Cards mount lightweight `ViewportScene` previews while visible. `SharedPlanetCanvas` retains Full views keyed by planet until eviction. Returning to a cached planet changes its target without remounting the prepared model. Camera controls reconnect to that target. Each View has its own scene, camera and lighting; root Canvas dimensions must remain equal to the browser viewport.

`PlanetStage` supplies progressive preparation and separate first-frame/Full-quality readiness. It uploads textures across idle turns, calls `compileAsync`, then reveals the model only after a prepared frame. Preview/Full replacement is atomic. `shared/ui/ErrorBoundary` is reused for scene and renderer failures.

The native dialog moves the same Canvas host into the browser top layer. Cleanup restores the host before removing the dialog. Keep the actual DOM target in its intended layout region; the Canvas host does not consume pointer events.

## Cache and resource policy

At most two Full scenes are retained. The RGBA8-equivalent texture budget is 96 MiB for a reported device memory of at most 2 GB, 160 MiB for at most 4 GB, and 384 MiB otherwise. Evict inactive scenes oldest first. One active model may exceed the budget alone: current 8K Mercury and Mars maps estimate approximately 512 MiB each. An oversized inactive model is released; a same-commit hero/dialog transfer preserves its active ownership.

The estimate uses source width, height, four bytes per pixel and generated mipmaps. It excludes geometry, framebuffers, driver overhead and format-specific allocation differences. Visible lightweight cards are outside the Full-cache budget. Decoded loader images may remain in CPU memory after GPU eviction; the budget is not a total process-memory limit.

Use `model/useSceneTexture` for loader maps. It counts mounted consumers and disposes GPU allocations after the last consumer unmounts. It avoids eager uploads of originals when a scene renders owned clones. Dispose clones and procedural resources in their owning component. R3F disposes declarative geometry and materials; do not duplicate that disposal through stale refs.

Inactive scenes stop frame work, controls and weather polling. Weather effects abort requests and release transient maps when deactivated. Continuous rendering stops for reduced motion, explicit pause, hidden tabs and no active views. Manual controls may request frames while paused.

## Progressive texture detail

`PreparedModel` owns a single prepared resource group and its first rendered frame. `PlanetStage` keeps the current Full tier mounted while preparing the next tier. Once ready, the next group replaces it atomically; the old group releases its GPU resources. Camera and controls remain outside these groups.

`texture-quality.ts` selects a lightweight starting tier from memory and network capabilities. All devices continue toward the highest level supported by their GPU and the actual source: 1K → 2K → 4K → 8K. Screen size does not impose a permanent lower ceiling. Slow networks and Save-Data increase the interval between upgrades. Upgrades stop while the view is inactive or the document is hidden. Visitors do not choose quality.

`texture-manifest.json` maps original model URLs to generated runtime variants. `scripts/prepare-planet-tiers.mjs` resizes without enlargement, encodes WebP, and records actual dimensions/encoded byte sizes. Color maps are compressed; data maps remain lossless except when near-lossless compression is necessary to stay below Cloudflare's 25 MiB per-file limit. Original sources are retained.

Mercury, Mars, Uranus and Neptune have genuine 8K source maps. Earth, Venus, Jupiter and Saturn use their highest available source dimensions, currently up to 4K. Do not manufacture 8K detail by enlarging a smaller source.

A transition temporarily retains two adjacent tiers. The cache budget is a retention budget, not a hard peak-allocation limit. Context loss clears prepared scene ownership and lowers the texture ceiling for the restored session. An 8K allocation may therefore recover at 4K when the GPU cannot sustain it.

`useSceneTexture` tracks failed loader batches. Retry clears only failed suspense-loader entries. A failed higher tier leaves the last working tier interactive; retry and revisiting the planet resume preparation. Fatal preview errors have their own resettable boundary and poster fallback.

## Scene contract

Scenes receive `active` and `animate`. Honor them for frame work. Environments also receive `children` and `lighting`:

- `studio` uses shared preview lighting.
- `scene` enables the planet's physical lighting.

Keep required planet context available in both modes. Return Three objects, never another Canvas. Center models near the origin with radius close to 2. Saturn receives a presentation scale adjustment for its rings. Adaptive DPR starts at no more than 1.5 and drops on sustained performance decline.

Keep scene uniforms and astronomical coordinate conventions explicit. Update shared vectors in place when materials retain their references. Use UTC-derived time when returning to a scene must preserve phase.

## Adding or changing a planet

1. Add IDs and numeric metadata under `entities/planet/`.
2. Add matching story keys in both message catalogs.
3. Put geometry, shaders, environment, texture metadata and orientation helpers in `scenes/<planet>/`.
4. Register lazy Scene, PreviewScene, Environment and credits in `scenes/registry.ts`.
5. Prepare assets through `scripts/`, retaining source attribution and licenses.
6. Run architecture/catalog tests and the complete validation commands in [README](../README.md#validation).

Verify Full readiness, rings, dragging, pause, reduced motion, fallback, cached return, offscreen return and resource release. Avoid changing resource ownership and shader behavior in the same refactor unless required.

## Scientific data and Earth weather

The numeric catalog uses NASA NSSDCA equatorial diameters and sidereal rotation consistently. Negative periods display as positive durations with a retrograde label. Astronomical calculations and numeric values stay separate from translated presentation.

Run `node scripts/prepare-earth-runtime.mjs` after changing Earth source maps. The IR-derived cloud source has a bright high-latitude background and [mirrored poles](https://github.com/matteason/live-cloud-maps#limitations). Cloud and lightning coverage transitions to an artistic local map between 40 and 60 degrees. Polar clouds are not live measurements.

`features/weather/server/` processes external observations. Cloud volume, lightning timing and several atmospheric effects are simulations, not forecasts. Keep the model usable with local maps when external data is unavailable.

## Diagnostics

Add `diagnostics=1` to expose `window.__ORBITAL_RENDERER__.snapshot()`. It reports Canvas dimensions, actual Three.js texture/geometry/program counts, resident textures, estimated bytes, Full-cache entries, preparation counts by texture tier and up to 50 activation timings. It adds no product UI or console output.

Browser tests save `renderer-resource-samples.json`, verify cached revisits without repeated preparation, check root Canvas dimensions and pixel placement, and compare resource counts across two complete planet cycles. The viewport also exposes `data-render-ready` after a drawn frame, plus `data-texture-tier`, `data-texture-target` and `data-texture-state` for staged readiness assertions. These tests detect regressions; they do not measure exact VRAM or guarantee hardware FPS.
