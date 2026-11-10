export type MapMarkerBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
};

/** Markers fade away once the actual body is large enough to inspect. */
export function markerOpacity(radiusPixels: number): number {
  const progress = Math.max(0, Math.min(1, (radiusPixels - 10) / 20));
  return 1 - progress * progress * (3 - 2 * progress);
}

/** Connected screen-space groups, with a wider split threshold to avoid flicker. */
export function clusterMapMarkers<T extends MapMarkerBox>(
  markers: readonly T[],
  previousGroups: readonly (readonly string[])[] = [],
): T[][] {
  const parents = markers.map((_, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) index = parents[index];
    return index;
  };
  for (let a = 0; a < markers.length; a++) {
    for (let b = a + 1; b < markers.length; b++) {
      const first = markers[a];
      const second = markers[b];
      const wereTogether = previousGroups.some(
        (group) => group.includes(first.id) && group.includes(second.id),
      );
      const gap = wereTogether ? 22 : 10;
      if (
        Math.abs(first.x - second.x) < (first.width + second.width) / 2 + gap &&
        Math.abs(first.y - second.y) < (first.height + second.height) / 2 + gap
      )
        parents[root(b)] = root(a);
    }
  }
  const groups = new Map<number, T[]>();
  markers.forEach((marker, index) => {
    const key = root(index);
    const group = groups.get(key) ?? [];
    group.push(marker);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) =>
    group.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)),
  );
}
