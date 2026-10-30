# ORBITAL — Digital Observatory

A bilingual Solar System atlas built with Next.js, React, TypeScript, next-intl, GSAP and React Three Fiber. Eight animated planet cards open a fullscreen observatory with detailed stories, comparable characteristics and interactive 3D models. Textures progressively reach their highest supported source resolution, including genuine 8K maps, without requiring a quality selector.
 open https://orbital-observatory.antonheardstone.workers.dev to see
## Development

Use Node.js 22 or newer and npm 10. The project uses ES modules.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Production uses `npm run build` followed by `npm run start`. No account, database or API key is required.

## Source map

| Directory                  | Responsibility                                                   |
| -------------------------- | ---------------------------------------------------------------- |
| `app/`                     | Route composition, metadata and thin HTTP adapters               |
| `widgets/observatory/`     | Page sections, gallery and detail presentation                   |
| `features/explorer/`       | Selection, browser history, dialog lifecycle and planet selector |
| `features/planet-viewer/`  | Shared Canvas, scene cache, resource ownership and planet scenes |
| `features/ephemeris/`      | Live coordinate presentation                                     |
| `features/localization/`   | Language picker                                                  |
| `features/motion/`         | GSAP decorations and interaction effects                         |
| `features/weather/server/` | NOAA, EUMETSAT and NASA response processing                      |
| `entities/planet/`         | Planet IDs, numeric catalog and astronomical positions           |
| `shared/`                  | Domain-independent UI, browser helpers and global styles         |
| `i18n/`, `messages/`       | Locale resolution, typed messages and RU/EN copy                 |
| `scripts/`                 | Asset preparation and optional weather ingestion                 |
| `public/`                  | Textures, artwork, licensed fonts and attribution                |
| `tests/`                   | Architecture, catalog, weather, cache and browser checks         |

Import features through their public `index.ts` modules. Keep scene files, shaders, textures metadata and orientation calculations together under `features/planet-viewer/scenes/<planet>/`.

See [architecture](docs/architecture.md) for dependency rules and collaboration, and [planet models](docs/planet-models.md) for renderer ownership and extension instructions.

## Runtime behavior

- Mercury is the initial Full model. `/?lang=en&focus=mercury&planet=saturn` restores locale, focus and an open detail view.
- The native fullscreen dialog preserves browser history, keyboard focus, camera interaction and reduced-motion preferences. The language picker appears only on the main page.
- One Canvas serves visible previews and a bounded cache of prepared Full scenes. At most two Full scenes are retained, subject to a device-aware 96/160/384 MiB texture estimate; one active model may exceed that budget.
- Detail upgrades automatically through 1K/2K/4K/8K as supported by the source and GPU. The previous level stays visible during preparation; slower connections start smaller and upgrade more slowly. A context-loss recovery lowers the session ceiling. Failed loads can be retried or recover when the planet is revisited.
- Planet positions are computed for the current date. Texture maps are based on spacecraft imagery; lighting, cloud volume and weather effects include artistic interpretation.
- Optional weather sources fail gracefully. The page and local planet maps remain usable when an upstream service is unavailable.
- `/planet-lab` redirects to Earth details.

## Cloudflare deployment

The standard Next.js development and production scripts remain available. The separate vinext build runs the same application on Cloudflare Workers:

```sh
npm run build:vinext
npm run start:vinext
npm run deploy:vinext
```

See [Cloudflare deployment](docs/cloudflare.md) for runtime bindings, asset limits and deployment checks. Localized titles, descriptions, canonical URLs and Open Graph images update with the selected language. Set `ORBITAL_SITE_URL` for a custom public origin; otherwise the request host is used.

## Validation

```sh
npm test
npm run lint
npm run build
npm run typecheck
npm run test:e2e
```

Browser tests run production on port 3100, using installed Chrome locally. CI installs Chromium with `npx playwright install --with-deps chromium`. Screenshots, failure traces and renderer measurements are written under ignored `test-results/`.

Tests protect module boundaries, translation parity, scientific catalog values, recoverable weather failures, scene reuse, resource limits, placement, localization, history, accessibility and motion controls. Renderer measurements are regression checks; they do not establish performance on every GPU.

## Assets and sources

Characteristics consistently use equatorial diameter and sidereal rotation from the [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/). Each planet links to its sources. Models do not share a physical distance or size scale.

Inter and Manrope are self-hosted with OFL licenses in `public/fonts/`. `node scripts/prepare-fonts.mjs` regenerates the font files and explicit Latin/Cyrillic Unicode ranges. Global CSS is imported directly by `app/layout.tsx`; keep local styles out of Tailwind's CSS import resolver. No external font requests occur at runtime.

`npm run prepare:textures` regenerates the sized WebP variants and their manifest from the retained originals. `npm run prepare:og` regenerates the localized share artwork. Sources below 8K are not upscaled; the 8K level uses their highest genuine resolution.

Texture attribution remains alongside the corresponding assets. Legacy `styles/base.css` and `styles/responsive.css` are unimported historical files; they are not part of the current design system.
