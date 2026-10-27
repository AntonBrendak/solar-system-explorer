# ORBITAL — Solar System Explorer

[![CI](https://github.com/AntonBrendak/solar-system-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonBrendak/solar-system-explorer/actions/workflows/ci.yml)

A cinematic, interactive Solar System Explorer with an animated eight-planet homepage and a separate 3D Earth laboratory. Built with Next.js App Router, React, TypeScript, Tailwind CSS v4, GSAP, Three.js, and React Three Fiber.

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

The 3D laboratory requires a browser with WebGL support. No API keys or backend services are required.

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
  planetPreview/
    EarthPreview.tsx         WebGL canvas, Earth surface, lighting, orbit controls
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

The `@/` import alias resolves from the project root. See [the architecture guide](docs/architecture.md) for component responsibilities, animation contracts, and team review checks.

## Existing behavior

- Earth is selected initially; all eight planets can be selected.
- Previous/next controls wrap between Mercury and Neptune.
- Featured cards select Mars, Saturn, or Neptune and return to the hero.
- “Explore all eight planets” starts with Mercury.
- Section links navigate within the original page.
- GSAP controls the entrance sequence, scroll reveals, planet transitions, and pointer parallax.
- Planets rotate continuously in the hero, selector, and destination cards. Separate spin layers preserve the existing hover and floating effects; Saturn's rings keep their orientation.
- The logo has rotating orbital rings, an orbiting satellite, and a pulsing core. Light particles follow the hero's orbit lines; the nebulae and planet halo drift and pulse.
- Statistics enter with a stagger; navigation links and primary buttons have hover/focus effects.
- The motion control pauses CSS and GSAP ambient animations without resetting their positions. Hidden tabs pause GSAP loops; reduced-motion changes disable them immediately.
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
