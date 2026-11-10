/** Fixed Cinematic profile: one antialiased core and an analytic halo in the same pass. */
export const CINEMATIC_ORBIT_STYLE = {
  opacity: 0.26,
  activeOpacity: 0.58,
  coreWidth: 1.2,
  activeCoreWidth: 1.4,
  ribbonWidth: 3.4,
  activeRibbonWidth: 6.4,
  hitWidth: 12,
  waveDuration: 24,
  renderOrder: 10,
} as const;

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** Suppress crowded, edge-on paths while preserving a useful active trajectory. */
export function orbitOpacity({
  elevation,
  radiusPixels,
  highlight,
  dimmed,
  opacity = CINEMATIC_ORBIT_STYLE.opacity,
}: {
  elevation: number;
  radiusPixels: number;
  highlight: number;
  dimmed: boolean;
  opacity?: number;
}): number {
  const angle = smoothstep(0.025, 0.24, Math.abs(elevation));
  const spacing = smoothstep(5, 28, radiusPixels);
  // A collapsed ellipse would draw its front/back arcs on top of one another.
  const minorAxis = smoothstep(0.75, 4, radiusPixels * Math.abs(elevation));
  const passiveVisibility = minorAxis * (0.18 + angle * 0.82);
  // Keep the selected trajectory readable even when its projected ellipse collapses.
  const visibility =
    spacing *
    Math.max(passiveVisibility, 0.3 * Math.max(0, Math.min(1, highlight)));
  const base = opacity * (dimmed ? 0.12 : 1);
  return (
    (base + (CINEMATIC_ORBIT_STYLE.activeOpacity - base) * highlight) *
    visibility
  );
}
