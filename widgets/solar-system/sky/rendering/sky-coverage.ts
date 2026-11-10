/** Missing neighbours around an occupied page. Longitude wraps; latitude clamps. */
export function coverageEdgeMask(
  data: Float32Array,
  width: number,
  rowOffset: number,
  columns: number,
  x: number,
  y: number,
) {
  let mask = 0;
  const rows = columns / 2;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = (x + dx + columns) % columns;
      const ny = Math.max(0, Math.min(rows - 1, y + dy));
      if (data[((rowOffset + ny) * width + nx) * 4] === 0)
        mask |= 1 << ((dy + 1) * 3 + dx + 1);
    }
  }
  return mask;
}
