# Frontend structure

## Scope

The English-language ORBITAL homepage keeps its original visual composition and planet-selection behavior. Continuous motion was expanded at the user's request. Further structural cleanup should preserve the current layout, animation behavior, and content.

## Ownership

| Area                                                                            | Owner file                     |
| ------------------------------------------------------------------------------- | ------------------------------ |
| Route                                                                           | `app/page.tsx`                 |
| Document metadata and language                                                  | `app/layout.tsx`               |
| Page composition                                                                | `components/SolarHomepage.tsx` |
| Selection, mobile menu, motion state, refs, GSAP timelines and pointer handlers | `hooks/useSolarHomepage.ts`    |
| Shared planet content                                                           | `data/planets.ts`              |
| Page sections and visual elements                                               | `components/solar/`            |
| Ordered stylesheet entry point                                                  | `app/globals.css`              |
| Base styles, header, hero, selector, editorial sections, breakpoints            | `styles/`                      |

`SolarHomepage` is the client boundary. Child components receive typed props. The hook owns the existing shared state and animation refs so selecting a planet updates the hero, its information, and the selector together. `SolarHomepageState` supplies the existing prop types via `Pick`; imports of this type are erased at build time.

## Animation contracts

GSAP selectors rely on the original `data-nav`, `data-hero-*`, `data-planet-stage`, `data-side-info`, and `data-reveal` attributes. Keep these attributes, their classes, and the rendered element hierarchy intact. The hook scopes animations to the root `main` element.

CSS animates the starfield and gentle vertical planet drift. GSAP handles the entrance sequence, scroll reveals, planet transitions, and pointer parallax in `useSolarHomepage`. The separate `useAmbientMotion` hook owns the continuous timeline from `lib/solar-motion.ts`, including planet spins, logo orbits, moving orbit particles, nebula drift, and halo/core pulses.

The hero's `.planet-drift` and `.planet-spin` wrappers isolate CSS floating from GSAP rotation. Card `.feature-spin` wrappers isolate rotation from the existing image hover transforms; thumbnail rotation targets the inner image. Avoid animating the same transform from both CSS and GSAP. Saturn's ring elements stay outside the spin wrappers.

Ambient timelines use `gsap.matchMedia` for live reduced-motion updates and revert on cleanup. The pause control and hidden-tab handling pause the existing timeline instead of recreating it, retaining each element's position. Keep the `motion-paused` CSS class and GSAP pause state synchronized. Never pause the global GSAP timeline: it would also freeze navigation and reveal transitions.

## Style organization

`app/globals.css` imports the fonts and Tailwind first, followed by base styles, header, hero, planet selector, editorial sections, and responsive rules. Keep that order so breakpoint overrides apply last. Local planet assets remain in `public/planets/`.

## Review checklist

Run `npm run lint`, `npm run typecheck`, and `npm run build`. For structural changes, compare the rendered markup and animation statements with the previous version. In a browser, check all eight selections, previous/next wraparound, featured-card selection and return scroll, section links, pause/resume, mobile navigation, and reduced motion.

Keep design changes and new functionality out of structural cleanup. The original page has no account, search, favorites, comparison, or backend data layer.
