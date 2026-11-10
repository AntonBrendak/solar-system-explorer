import type { SolarMapFocus } from "../model/types";
import type { MapMarkerBox } from "./marker-layout";

export type MapObjectId = Exclude<SolarMapFocus, null>;
export type ProjectedMarker = MapMarkerBox & {
  id: MapObjectId;
  opacity: number;
};
export type MarkerSnapshot = {
  groups: ProjectedMarker[][];
  width: number;
  height: number;
};
const EMPTY: MarkerSnapshot = { groups: [], width: 0, height: 0 };

/** Only the overlay subscribes; moving the camera does not rerender the scene/page. */
export function createMarkerStore() {
  let snapshot = EMPTY;
  let focused: MapObjectId | null = null;
  let hovered: MapObjectId | null = null;
  const listeners = new Set<() => void>();
  return {
    getFocused: () => focused,
    getHovered: () => hovered,
    setFocused(id: MapObjectId | null) {
      focused = id;
    },
    setHovered(id: MapObjectId | null) {
      hovered = id;
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next: MarkerSnapshot) {
      const same =
        next.width === snapshot.width &&
        next.height === snapshot.height &&
        next.groups.length === snapshot.groups.length &&
        next.groups.every((group, index) => {
          const previous = snapshot.groups[index];
          return (
            group.length === previous.length &&
            group.every(
              (marker, i) =>
                marker.id === previous[i].id &&
                Math.abs(marker.x - previous[i].x) < 0.5 &&
                Math.abs(marker.y - previous[i].y) < 0.5 &&
                Math.abs(marker.opacity - previous[i].opacity) < 0.01,
            )
          );
        });
      if (same) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}
export type MarkerStore = ReturnType<typeof createMarkerStore>;
