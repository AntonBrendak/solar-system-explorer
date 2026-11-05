
import {
  PerspectiveCamera,
  Vector3,
} from "three";

import {
  getStarTileGrid,
  type StarAtlasLevel,
  type StarTile,
} from "./star-atlas";

export type StarTileSelection = {
  level: StarAtlasLevel;
  tiles: StarTile[];
};

type Viewport = {
  width: number;
  height: number;
  pixelRatio: number;
};

const TAU = Math.PI * 2;
const MAX_VISIBLE_TILES = 24;

/**
 * Choose sky resolution based on screen pixel density,
 * rather than distance from the Sun or planets.
 */
function selectLevel(
  camera: PerspectiveCamera,
  viewport: Viewport,
): StarAtlasLevel {
  const verticalFov =
    (camera.getEffectiveFOV() * Math.PI) / 180;

  const aspect =
    viewport.width / Math.max(1, viewport.height);

  const horizontalFov =
    2 * Math.atan(
      Math.tan(verticalFov / 2) * aspect,
    );

  const screenPixels =
    viewport.width * viewport.pixelRatio;

  const requiredWidth =
    (screenPixels * TAU) / horizontalFov;

  if (requiredWidth > 32768) return 64;
  if (requiredWidth > 16384) return 32;

  return 16;
}

/**
 * Match the orientation of Three.js SphereGeometry.
 *
 * Tiles use the same equirectangular UV coordinates
 * as the base star sphere.
 */
function tileDirection(
  column: number,
  row: number,
  columns: number,
  rows: number,
): Vector3 {
  const phi =
    ((column + 0.5) / columns) * TAU;

  const theta =
    ((row + 0.5) / rows) * Math.PI;

  return new Vector3(
    -Math.cos(phi) * Math.sin(theta),
    Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Return visible tiles, ordered by proximity
 * to the center of the camera view.
 *
 * The selection is conservative near tile borders.
 * The base 8K sphere always covers the entire sky.
 */
export function selectVisibleStarTiles(
  camera: PerspectiveCamera,
  viewport: Viewport,
): StarTileSelection {
  const level = selectLevel(camera, viewport);
  const { columns, rows } = getStarTileGrid(level);

  const forward = new Vector3();
  camera.getWorldDirection(forward);

  const verticalFov =
    (camera.getEffectiveFOV() * Math.PI) / 180;

  const aspect =
    viewport.width / Math.max(1, viewport.height);

  const horizontalFov =
    2 * Math.atan(
      Math.tan(verticalFov / 2) * aspect,
    );

  // Angular radius of the camera's view rectangle.
  const viewRadius = Math.atan(
    Math.hypot(
      Math.tan(horizontalFov / 2),
      Math.tan(verticalFov / 2),
    ),
  );

  const candidates: {
    tile: StarTile;
    priority: number;
  }[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const direction = tileDirection(
        column,
        row,
        columns,
        rows,
      );

      const theta =
        ((row + 0.5) / rows) * Math.PI;

      // Conservative half-diagonal of the tile.
      const tileRadius = Math.hypot(
        Math.PI / (2 * rows),
        (Math.PI / columns) * Math.sin(theta),
      );

      const priority = forward.dot(direction);

      const limit = Math.cos(
        Math.min(
          Math.PI,
          viewRadius + tileRadius + 0.06,
        ),
      );

      if (priority < limit) continue;

      candidates.push({
        tile: { level, column, row },
        priority,
      });
    }
  }

  candidates.sort(
    (a, b) => b.priority - a.priority,
  );

  return {
    level,
    tiles: candidates
      .slice(0, MAX_VISIBLE_TILES)
      .map((candidate) => candidate.tile),
  };
}
