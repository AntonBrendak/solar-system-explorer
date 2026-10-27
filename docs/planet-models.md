# Object scenes

`PlanetVisual` is the shared entry point for the hero, selector, cards and lab. The loading mechanism has no Earth-specific branches. Object content lives in `data/planets.ts`; its optional scenes live in `components/planets/registry.ts`.

| File | Responsibility |
| --- | --- |
| `components/planets/PlanetVisual.tsx` | Defer WebGL until after paint, keep a cache of visited objects, show artwork until the first prepared frame |
| `components/planets/PlanetStage.tsx` | One persistent Canvas per visual frame, camera, controls, progressive replacement and GPU preparation |
| `components/planets/types.ts` | Shared scene and registry contracts |
| `lib/idle-task.ts` | Cancellable scheduling and yields between texture uploads |
| `hooks/useSceneMotion.ts` | Pause, tab visibility and reduced motion |
| `components/planetPreview/EarthPreview.tsx` | Full Earth geometry and weather layers; no Canvas |
| `components/planets/LiteEarth.tsx` | Lightweight Earth geometry and two 1K textures; no Canvas or weather requests |
| `components/earth/EarthEnvironment.tsx` | Shared sunlight and lighting for both Earth versions |
| `data/earth-textures.ts` | Runtime texture URLs |

## Register any object

Write client components that return Three objects, not another Canvas. A scene receives `PlanetSceneProps`: `active` and `animate`. Honor both when updating animation or doing frame work. Center the object around the origin with a radius near 2, or scale its scene group to fit.

```tsx
import { lazy } from "react";

// Entry in components/planets/registry.ts, matching the catalog ID:
mars: {
  Scene: lazy(() => import("@/components/planetPreview/MarsScene")),
  PreviewScene: lazy(() => import("@/components/planetPreview/MarsPreviewScene")),
  Environment: lazy(() => import("@/components/planetPreview/MarsEnvironment")),
},
```

`Scene` is the detailed version. `PreviewScene` is optional: it appears first and is used exclusively in selector thumbnails. `Environment` is an optional wrapper receiving `PlanetEnvironmentProps`: scene props plus `children` and `lighting`. Keep object-specific context available in both lighting modes, but enable its physical scene lights only when `lighting === "scene"`. The shared stage supplies front and fill lights in `"studio"` mode for readable selector previews. Without an environment wrapper, the stage supplies default lighting. Keep lighting outside the individual geometry scenes so preparation and replacement use the same lighting setup. Optional `credits` and `rings` are also configured in the registry.

Use React Suspense-compatible loaders, such as `useLoader`, for cached textures. The stage uploads scene material textures and shader-uniform textures one at a time during idle turns, then calls `compileAsync`. Avoid hooks that synchronously upload every texture on mount. Dispose owned resources only on unmount; loader cache assets must stay reusable.

## Presentation and resource lifetime

| Presentation | Rendering and motion |
| --- | --- |
| `hero` | Preview, then full scene in the same Canvas; slow camera orbit and dragging |
| `thumbnail` | Preview scene only, rotating around its Y axis; artwork if no preview is registered |
| `card` | Preview, then full scene in the card frame; slow camera orbit |
| `lab` | The same progressive scene with orbit dragging |

A frame creates its Canvas only when a registered scene is needed, after the interface paints. All visited scenes remain mounted in that Canvas. Inactive objects are invisible and receive `active=false`; if no cached scene is selected, the entire render loop stops. Returning to a prepared object reuses its geometries, materials, camera and GPU textures. The cache is released when the containing frame/page unmounts. Each selector preview has its own small Canvas; it never mounts the detailed scene or its weather subscriptions.

During initial loading only the artwork is visible. After the first prepared Canvas frame, the artwork is hidden. A detailed scene is prepared invisibly while the preview remains visible; an atomic visibility switch replaces the preview and removes its geometry. There is no opacity crossfade between versions. Shader compilation uses the parallel compilation extension where available; individual WebGL uploads still run on the browser's rendering thread, with idle yields between them.

The image spin layer stays mounted so existing GSAP targets remain valid, but it is hidden while a prepared scene is active. Models are siblings of that layer and never receive its 2D rotation. Canvas measurements use layout dimensions (`offsetSize`) so CSS hover/entrance scaling cannot enlarge the drawing buffer beyond its container and crop it. All picker objects share the same hover/focus scale and glow. The global motion control also governs the selector previews.

## Earth runtime assets

Run `node scripts/prepare-earth-runtime.mjs` after changing source maps. It creates bounded runtime assets in `public/textures/earth/runtime/`: a 4K surface/night map, 2K material maps and a cloud fallback. Original source files remain available. The cloud fallback uses `cloudsLive.png` when supplied, otherwise `earthClouds.jpg`. Live cloud refresh and disposal still belong to `EarthClouds`.

Run `npm run lint`, `npm run typecheck` and `npm run build`. Validate deferred loading, one visible model, preview/full replacement, return-to-object resource reuse, selector axis rotation, pause, reduced motion, mobile layout and fallback behavior.
