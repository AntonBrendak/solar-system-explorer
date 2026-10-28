import {
  DataTexture,
  RGBAFormat,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
} from "three";

export function createOceanNormalMap(size = 128) {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;

      // Несколько волн разного направления
      const nx =
        0.22 * Math.sin(3 * u + 2 * v) +
        0.12 * Math.sin(7 * u - 3 * v);

      const ny =
        0.22 * Math.cos(4 * v - u) +
        0.12 * Math.cos(5 * v + 2 * u);

      // Нормализуем направление поверхности
      const length = Math.hypot(nx, ny, 1);

      const index = (y * size + x) * 4;

      data[index] = ((nx / length) * 0.5 + 0.5) * 255;
      data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      data[index + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      data[index + 3] = 255;
    }
  }

  const texture = new DataTexture(
    data,
    size,
    size,
    RGBAFormat
  );

  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  texture.repeat.set(10, 5);

  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;

  texture.needsUpdate = true;

  return texture;
}