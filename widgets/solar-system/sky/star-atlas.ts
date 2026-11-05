
/**
 * ORBITAL — NASA Deep Star Maps 2020
 *
 * Master image: 65536 × 32768 (64K)
 * Projection: equirectangular / ICRF J2000
 *
 * Coordinates below refer to the original image.
 * The renderer will convert them to sphere geometry.
 */

export const STAR_ATLAS = {
  source: "NASA Deep Star Maps 2020",
  sourceUrl: "https://svs.gsfc.nasa.gov/4851/",
  masterWidth: 65536,
  masterHeight: 32768,
  tileSize: 2048,

  // Always visible after the initial scene loads.
  baseTexture: "/textures/space/starmap-8k.webp",

  // Higher-resolution levels, streamed on demand.
  levels: {
    16: { width: 16384, height: 8192 },
    32: { width: 32768, height: 16384 },
    64: { width: 65536, height: 32768 },
  },
} as const;

export type StarAtlasLevel =
  keyof typeof STAR_ATLAS.levels;

export type StarTile = {
  level: StarAtlasLevel;
  column: number;
  row: number;
};

export function getStarTileGrid(
  level: StarAtlasLevel,
) {
  const { width, height } = STAR_ATLAS.levels[level];
  const { tileSize } = STAR_ATLAS;

  return {
    columns: width / tileSize,
    rows: height / tileSize,
  };
}

export function getStarTileUrl(tile: StarTile): string {
  const grid = getStarTileGrid(tile.level);

  if (
    !Number.isInteger(tile.column) ||
    !Number.isInteger(tile.row) ||
    tile.column < 0 ||
    tile.column >= grid.columns ||
    tile.row < 0 ||
    tile.row >= grid.rows
  ) {
    throw new RangeError("Invalid star atlas tile");
  }

  return (
    `/textures/space/tiles/${tile.level}k/` +
    `${tile.row}/${tile.column}.webp`
  );
}

/**
 * UV bounds of one tile.
 *
 * Image rows start at the top.
 * Three.js UV coordinates start at the bottom.
 */
export function getStarTileUV(tile: StarTile) {
  const grid = getStarTileGrid(tile.level);

  return {
    uMin: tile.column / grid.columns,
    uMax: (tile.column + 1) / grid.columns,
    vMin: 1 - (tile.row + 1) / grid.rows,
    vMax: 1 - tile.row / grid.rows,
  };
}

/**
 * Celestial bounds of a tile.
 *
 * NASA map:
 * - 0h right ascension at image center
 * - Right ascension increases toward image left
 * - +90° declination at image top
 */
export function getStarTileCelestialBounds(
  tile: StarTile,
) {
  const grid = getStarTileGrid(tile.level);

  const normalizeDegrees = (value: number) =>
    ((value % 360) + 360) % 360;

  const left = tile.column / grid.columns;
  const right = (tile.column + 1) / grid.columns;

  return {
    raLeft: normalizeDegrees(180 - left * 360),
    raRight: normalizeDegrees(180 - right * 360),

    decTop: 90 - (tile.row / grid.rows) * 180,
    decBottom:
      90 - ((tile.row + 1) / grid.rows) * 180,
  };
}
