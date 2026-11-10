# Cloudflare deployment

The same App Router source runs locally through Next.js and on Cloudflare Workers through vinext. The Cloudflare path preserves `proxy.ts`, server-rendered localization, route handlers and the interactive client renderer.

## Commands

```sh
npm ci
npm run restore:sky
npm run build:vinext
npm run start:vinext
npm run deploy:vinext
```

`start:vinext` uses the built Worker with Wrangler. `dev:vinext` starts the Vite development environment on port 3001. The original `dev`, `build` and `start` commands continue to use Next.js/Turbopack.

Authenticate with `npx wrangler login` before the first deployment. The Worker name and bindings are defined in `wrangler.jsonc`; deployment uses the generated `dist/server/wrangler.json`. Wrangler may provision the declared KV namespace on the first deployment. Never commit OAuth credentials, API tokens or local Wrangler state.

## Runtime configuration

- `ASSETS` serves the compiled client, fonts, posters, share artwork and sized texture maps.
- `VINEXT_KV_CACHE` persists the data cache used for upstream weather requests.
- `nodejs_compat` supplies the Node APIs required by the runtime.
- `ORBITAL_SITE_URL` optionally sets the canonical public origin. When absent, metadata uses the incoming host. Copy `.env.example` for local configuration; set a Worker variable for a custom domain.

Static asset routes bypass the application Worker. `public/.assetsignore` excludes archival texture originals, while retaining runtime tiers, lightweight previews and attribution. Workers accepts at most 25 MiB per static asset; texture tests enforce that limit. `npm run prepare:textures` and `npm run prepare:og` regenerate committed runtime assets before the application build.

The Solar System map publishes only its pinned immutable Sky revision under `/textures/space/revisions/v2/<revision>/`. Restore the [release archive](sky.md#preparing-and-transporting-the-assets) before building. The original star tiles and reference base are preparation inputs and remain excluded by `.assetsignore`.

The observatory automatically upgrades to the highest genuine source resolution its GPU supports. The Solar System map additionally limits Full models by projected size, network/device signals and a conservative decoded-texture budget. It waits for a selected globe to remain at least 64 pixels in radius for one second, then upgrades tiers after the shared policy delay while retaining the prepared model. 8K remains available when the screen size and budget justify it. No quality selector is exposed.

Map startup waits for all orbital Lite models and navigation previews; a failed model completes its own gate with a local fallback. Losing the preview renderer does not fail the main map. Full-model failures retain Lite and can be retried by zooming out and back in.

The map samples ephemerides adaptively, from once per real-time second up to 20 times per second at high simulation rates. Render frames use cubic Hermite positions and unwrapped axial rotation; seeks calculate a fresh frame immediately. At the highest rates this remains an interpolated visualization. The NASA ICRF/J2000 atlas is transformed into the same ecliptic-of-date frame as the planets. The Sun uses the shared simulation date and pause state.

A collapsed FPS button in the top-right corner opens separate map and preview counters. Demand-rendered previews report zero FPS while idle. Frame interval and CPU timing are separate from asynchronous GPU timer queries; unsupported or disjoint queries display an unavailable value. The implementation follows the [WebGL2 timer-query specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/). Counters publish only to the diagnostics panel while open.

One resource coordinator accounts for texture objects per WebGL context, so a shared texture uploaded to both Canvas renderers counts twice. Its combined map/preview allowance is twice the existing device texture allowance. It includes Lite, current and pending Full models, the sky, Sun halos and postprocessing textures plus estimated multisample/depth storage. Full admission happens before GPU upload. Optional sky tiles yield in LRU order, with the pinned base sky covering evicted detail; visible models are protected. Essential startup resources can exceed the limit rather than breaking the map, and then further Full allocation is refused. The panel shows actual renderer object counts alongside the shared byte estimate; this is not a measurement of driver VRAM. Unowned decoded planet-texture batches also have a 64 MiB LRU allowance.

New model tiers remain hidden during upload and shader compilation. A preparation callback selects the next tier in one React commit. A per-renderer draw fence selects exactly one prepared layer before rendering, also covering Lite-to-Full handoffs between the DOM and R3F React roots and fallback after a Full failure. `?diagnostics=1` exposes `window.__ORBITAL_MAP_RESOURCES__.snapshot()` for resource and per-frame presentation regression checks.

Sky startup waits for its prepared base and warmed shader. Detail requests do not extend that gate. Missing or deferred detail retains the prepared parent/base; permanent integrity failures suppress retries, and transient failures use bounded backoff. Context loss switches to an HTML fallback with home navigation while resources recover.

## Weather and images

The precipitation mask uses portable JavaScript PNG processing. It does not require native `sharp` binaries on Workers; `sharp` remains a development dependency for asset preparation. External services can return recoverable 502 responses, and local maps remain usable.

The optional Python NOAA ingester writes a local ignored file. A Worker cannot run that local background process; its NOAA route returns the documented empty/stale fallback until an external ingestion/storage integration is supplied. EUMETSAT and NASA requests remain independent.

Cloudflare Images is not required or provisioned. Local posters are already WebP; the runtime serves them through the supported image fallback path.

## Validation and publication

Run `npm test`, `npm run lint`, `npm run build`, `npm run typecheck` and `npm run build:vinext`.

`typecheck` regenerates Next.js route types before checking the source, so it also works after vinext has generated its own route declarations in `.next/types/`.

Run the browser suite against production Next.js, then validate the built Worker with:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:8787 npm run test:e2e
```

Use equivalent environment-variable syntax on PowerShell. Test the published URL after deployment: HTTP 200, both languages, localized canonical/share metadata, posters/fonts, genuine 8K assets, dialog navigation, retry behavior, `/robots.txt` and `/sitemap.xml`. Never substitute a guessed domain for the deployment-returned public URL.
