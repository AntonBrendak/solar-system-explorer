# Architecture

ORBITAL separates route composition, user interactions, domain data and rendering infrastructure. Folder placement follows ownership; generic root-level component and helper collections are avoided.

## Dependency direction

```text
app → widgets → features → entities
          ↓         ↓          ↓
                  shared
```

`i18n/` owns locale configuration and message access. `messages/` owns translated product copy. Domain entities do not import localization infrastructure.

| Layer              | Allowed project dependencies                                              |
| ------------------ | ------------------------------------------------------------------------- |
| `app/`             | Widgets, feature entry points, weather server handlers, entities and i18n |
| `widgets/`         | Feature public APIs, entities, i18n and shared primitives                 |
| `features/<name>/` | Its own internals, entities, i18n and shared primitives                   |
| `entities/`        | Entities and domain-independent shared helpers                            |
| `shared/`          | Other shared modules only                                                 |

Features do not import sibling features or page widgets. Compose independent features in the observatory widget. Cross-module imports use `@/`; colocated internals use relative paths. `npm test` resolves both styles and checks static imports, re-exports and lazy imports. ESLint provides immediate feedback for forbidden layers, private feature imports, runtime console output and debugger statements.

## Module ownership

### Page composition

`app/page.tsx` resolves initial URL state and localized metadata, then renders the observatory. `app/layout.tsx` owns locale, font preloads and direct global CSS imports. `proxy.ts` resolves the language query, then the cookie, then Russian.

`widgets/observatory/` owns the header, hero, gallery, cards, fullscreen details and footer. Each section has a CSS Module. Shared typography and actions use `shared/ui/presentation.module.css`; design tokens, reset and the fluid page gutter live in `shared/styles/`.

### Feature APIs

| Entry point              | Public responsibility                                                          |
| ------------------------ | ------------------------------------------------------------------------------ |
| `features/explorer`      | Explorer state, dialog lifecycle and focus selector                            |
| `features/planet-viewer` | `PlanetViewport`, `PlanetCanvasProvider`, `usePlanetCanvas`, `getPlanetVisual` |
| `features/ephemeris`     | Current planetary coordinate readout                                           |
| `features/localization`  | Animated language picker                                                       |
| `features/motion`        | Scoped GSAP ambient and interaction motion                                     |

Use public entry points from widgets. Do not import a feature's `model/`, `ui/` or scene internals from the page. Tests may inspect internal contracts directly. Weather handlers are explicit server entry points rather than a barrel that eagerly loads every upstream processor.

### Renderer

`features/planet-viewer/` has three internal areas:

- `ui/`: DOM targets, Canvas host, Drei Views, error/fallback handling and prepared-frame presentation.
- `model/`: Cache policy and state, resource accounting, texture ownership and scene contracts. It does not import UI or planet scenes.
- `scenes/`: Lazy registration and one folder per planet, including Full/Lite geometry, environments, shaders and orientation calculations.

One Canvas persists across the page and native dialog. Full scene lifetime belongs to `useSceneCache`, independently of viewport mounts. Views follow the current DOM target. Update the View portal's local store when its size changes; its inherited `setSize` function would resize the entire Canvas. See [renderer contracts](planet-models.md).

### Server weather

`app/api/**/route.ts` contains HTTP method adapters and Next.js route configuration. `features/weather/server/` owns upstream requests, response validation, portable PNG transformation and local NOAA file access. PNG processing uses JavaScript rather than a native binary, so the same handler runs on Workers. Preserve `runtime` and `dynamic` exports in route files, where Next.js can statically analyze them.

Cloud and lightning effects stop requests when their scene is inactive. Recoverable upstream failures return 502/503 or retain the last usable local map without repeated console warnings. CLI preparation tools may report progress and errors; runtime modules do not print diagnostics. Optional render diagnostics are available through an explicit URL flag.

The optional `scripts/fetch-noaa-lightning.py` ingester writes ignored `data/noaa-lightning.json`. An absent or stale file produces an empty lightning fallback. The cyclones and raw precipitation endpoints remain available; unused legacy rendering overlays have been removed.

## State and interaction

`features/explorer/model/useExplorer.ts` owns locale, selected detail planet, focused hero planet, pause state, card origin and browser history. Gallery filtering stays local to the gallery.

The URL uses `?lang=en&focus=mercury` and adds `planet=saturn` for details. Opening pushes history; detail navigation replaces that entry. Closing retains the most recently explored focus. Back/Forward restores URL state.

`usePlanetDialog` owns `showModal()`, entry/exit motion, scroll locking and focus restoration. The Canvas provider moves the existing host into the browser top layer, then restores it before dialog removal. This preserves the React renderer and WebGL context. Keep controls, close and navigation reachable on narrow screens.

## Localization and motion

RU/EN catalogs have identical typed keys, ICU messages and locale-aware numbers. Use `useTranslations`, `useFormatter` and `usePlanetStory`; avoid locale-dependent copy embedded in components. The language picker exists only in the main header. Font faces declare explicit Unicode ranges and load from local assets. `i18n/page-metadata.ts` shares localized metadata between server generation and client locale transitions; the client updates existing head entries without duplicating server-streamed tags.

GSAP is imported only by browser effects, avoiding module-level timers in the Workers runtime. Its lifetime and interaction delegation live in `features/motion/model/`. Stable `data-motion-*` selectors decouple timelines from CSS Module names. Ambient motion pauses for user preference, hidden tabs and open dialogs; reduced motion removes animated decoration. These animations do not transform the WebGL model or View.

Frame state stays in refs; React state describes interaction and loading transitions. Reuse `AnimatedTabs`, `IconButton`, `MotionReveal`, `MetricCard` and `ErrorBoundary` instead of duplicating behavior.

## Working conventions

- Write documentation, code comments, error messages and CLI output in English. Product copy belongs in the bilingual catalogs; language names retain their native spelling.
- Keep comments for coordinate conventions, resource ownership and non-obvious constraints. Remove decorative banners and descriptions that merely repeat the code.
- Agree on public props and module ownership before parallel work. UI, scientific catalog, individual planet scenes and weather processing can be changed independently.
- Add a feature public export only when another module needs it. Do not flatten shader helpers or cache internals into a global utility collection.
- Keep generated assets and attribution together. Temporary reports, screenshots, downloaded weather data and traces remain outside tracked source files.

## Validation

Run the commands in [README](../README.md#validation). `npm test` checks layer boundaries, catalogs, date-driven positions, cache ownership and quiet weather fallbacks. Browser tests cover one Canvas, all eight models, cached revisits, dialog transfers, responsive layout, keyboard/focus behavior, RU/EN fonts, reduced motion and WebGL fallback.

Performance checks wait for Full quality, compare model pixels against its tracked viewport, traverse every planet twice and compare actual Three.js resource counts with resident scene resources. The JSON report is saved in the test's output directory. Texture bytes are estimates, not exact driver VRAM measurements; validate performance on target hardware before making FPS claims.

## Deployment

Next.js/Turbopack remains the normal local workflow. `vite.config.ts` and `wrangler.jsonc` provide a separate vinext/Cloudflare build, with a KV data-cache binding and an asset binding. See [Cloudflare deployment](cloudflare.md). Keep generated `dist/`, `.vinext/` and `.wrangler/` output out of Git. CI validates both builds.
