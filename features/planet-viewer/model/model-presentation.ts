import type { Object3D } from "three";

type LayerState = {
  prepared: boolean;
  visible: boolean;
  fallback: boolean;
  priority: number;
};
type Layer = { root: Object3D; state: () => LayerState };

/** DOM and R3F use separate React roots. Resolve their handoff together immediately
 * before drawing, so an outer Lite state update cannot lag one rendered frame.
 */
export function createModelPresentation() {
  const renderers = new WeakMap<
    object,
    { frame: number; groups: Map<string, Set<Layer>> }
  >();
  return {
    register(
      renderer: object,
      id: string,
      root: Object3D,
      state: Layer["state"],
    ) {
      let runtime = renderers.get(renderer);
      if (!runtime) {
        runtime = { frame: -1, groups: new Map() };
        renderers.set(renderer, runtime);
      }
      const group = runtime.groups.get(id) ?? new Set<Layer>();
      const layer = { root, state };
      group.add(layer);
      runtime.groups.set(id, group);
      return () => {
        root.visible = false;
        group.delete(layer);
        if (!group.size) runtime.groups.delete(id);
      };
    },
    flush(renderer: object, frame: number) {
      const runtime = renderers.get(renderer);
      if (!runtime || runtime.frame === frame) return;
      runtime.frame = frame;
      for (const group of runtime.groups.values()) {
        let chosen: Layer | null = null;
        let priority = -Infinity;
        for (const layer of group) {
          const state = layer.state();
          if (!state.prepared || (!state.visible && !state.fallback)) continue;
          const score = state.visible ? state.priority : -1;
          if (score > priority) {
            chosen = layer;
            priority = score;
          }
        }
        for (const layer of group) layer.root.visible = layer === chosen;
      }
    },
  };
}

export const modelPresentation = createModelPresentation();
