# ORBITAL — Solar System Explorer

[![CI](https://github.com/AntonBrendak/solar-system-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonBrendak/solar-system-explorer/actions/workflows/ci.yml)

A cinematic, interactive Solar System Explorer with an animated eight-planet homepage, a live 3D Earth, and a model laboratory. Built with Next.js App Router, React, TypeScript, Tailwind CSS v4, GSAP, Three.js, and React Three Fiber.

## Development

Use Node.js 22 (see `.nvmrc`) and npm:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. For a production preview, run `npm run build`, then `npm run start`.

| Route         | Experience                                                                        |
| ------------- | --------------------------------------------------------------------------------- |
| `/`           | Eight-planet explorer, animated hero, destination cards, and mission section      |
| `/planet-lab` | WebGL Earth preview with rotating surface, clouds, atmosphere, and orbit controls |

3D models require WebGL; artwork is used while loading and if WebGL is unavailable. Earth uses public cloud imagery and server routes for precipitation and lightning. No API keys are required. The optional NOAA lightning feed is supplied by `scripts/fetch-noaa-lightning.py`.

## Project structure

```text
app/
  globals.css                Ordered stylesheet imports
  layout.tsx                 Metadata and English document language
  page.tsx                   Thin route entry point
  planet-lab/page.tsx        3D Earth laboratory route
components/
  SolarHomepage.tsx          Main page composition
  solar/
    Logo.tsx                 Shared original logo
    SiteHeader.tsx           Desktop and mobile navigation
    Starfield.tsx            Original stars, nebulae, and grain
    HeroSection.tsx          Hero copy, planet stage, and planet information
    PlanetSelector.tsx       All eight planets and previous/next controls
    FeaturedDestinations.tsx Three original destination cards
    ExperienceSection.tsx   Experience copy and statistics
    SiteFooter.tsx           Footer and back-to-top link
  planets/                   Persistent Canvas, scene cache, preview/full registry
  planetPreview/
    EarthPreview.tsx         Full Earth scene content (uses the shared Canvas)
  earth/                     Atmosphere, clouds, and procedural ocean normal map
hooks/
  useSolarHomepage.ts        State, entrance/transition GSAP sequences, and handlers
  useAmbientMotion.ts       Continuous motion, pause, visibility, reduced motion
lib/
  solar-motion.ts           Scoped ambient GSAP timeline
data/
  planets.ts                 Original planet data and featured IDs
styles/
  base.css                   Shared typography, colors, and primitives
  header.css                 Header, logo, and mobile navigation
  hero.css                   Hero layout, planets, orbits, and ambient motion
  planet-selector.css        Destination selector and motion control
  sections.css               Featured cards, experience, and footer
  responsive.css             Original breakpoints and reduced-motion rules
public/
  planets/                   Local WebP artwork
  textures/earth/            Local Earth surface, cloud, and material textures
assets/earth/                Source maps for texture processing
scripts/                     Sharp-based texture preparation utilities
docs/
  architecture.md            Component ownership and refactoring conventions
```

The `@/` import alias resolves from the project root. See [the architecture guide](docs/architecture.md) for component responsibilities, animation contracts, and team review checks. See [planet visuals](docs/planet-models.md) to register another 3D object without editing page sections.

## Existing behavior

- Earth is selected initially; all eight planets can be selected.
- Selecting Earth displays the same 3D scene as `/planet-lab`, with live clouds, precipitation shading, night lights and a slow camera orbit. A lightweight preview upgrades inside the same Canvas. Selector previews rotate around their axes without loading detailed scenes.
- WebGL is deferred until after the interface paints. Visited scenes keep their GPU resources in one Canvas per display frame, so returning to a planet does not rebuild its model. Inactive scenes pause; texture preparation yields between uploads. Earth uses prepared runtime textures rather than the large source maps.
- Previous/next controls wrap between Mercury and Neptune.
- Featured cards select Mars, Saturn, or Neptune and return to the hero.
- “Explore all eight planets” starts with Mercury.
- Section links navigate within the original page.
- GSAP controls the entrance sequence, scroll reveals, planet transitions, and pointer parallax.
- Planets rotate continuously in the hero, selector, and destination cards. Separate spin layers preserve the existing hover and floating effects; Saturn's rings keep their orientation.
- The logo has rotating orbital rings, an orbiting satellite, and a pulsing core. Light particles follow the hero's orbit lines; the nebulae and planet halo drift and pulse.
- Statistics enter with a stagger; navigation links and primary buttons have hover/focus effects.
- The motion control pauses CSS, GSAP and the 3D render loop without resetting their positions. Hidden tabs and reduced motion also stop continuous 3D rendering.
- Planet artwork is local and requires no external image API.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

Check the page on desktop and mobile after visual changes. Next.js may generate `AGENTS.md` when starting the development server.

GitHub Actions runs the same checks for pushes to `main` and pull requests. The workflow builds before the standalone typecheck so Next.js can generate its local type declarations in a fresh checkout.

## Contributing

Create a feature branch, keep changes focused, and open a pull request against `main`. Follow [the architecture guide](docs/architecture.md) and run the validation commands before submitting. Include screenshots when changing the visual layout. Keep generated builds, dependencies, local editor settings, and environment files out of commits.

## Artwork and data

Illustrations are artistic interpretations, not scientific visualizations. Values are rounded, and known moon counts can change with new discoveries. The application uses the supplied dataset rather than a live astronomical API.
