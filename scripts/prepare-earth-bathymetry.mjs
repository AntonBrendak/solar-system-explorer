
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const dayPath = "public/textures/earth/earthDay.jpg";
const maskPath = "public/textures/earth/earth_ocean_mask.png";
const bathyPath = "assets/earth/earth_ocean_bathymetry.jpg";

const output = "public/textures/earth/earthDayOcean.png";

// Сила влияния батиметрии
const STRENGTH = 0.7;

const metadata = await sharp(dayPath).metadata();

const width = metadata.width;
const height = metadata.height;

if (!width || !height) {
  throw new Error("Не удалось прочитать earthDay.jpg");
}

// Проверяем пропорции карт
for (const path of [maskPath, bathyPath]) {
  const meta = await sharp(path).metadata();

  if (!meta.width || !meta.height) {
    throw new Error(`Ошибка изображения: ${path}`);
  }

  const ratio = meta.width / meta.height;
  const targetRatio = width / height;

  if (Math.abs(ratio - targetRatio) > 0.02) {
    throw new Error(
      `Несовместимые пропорции: ${path}`
    );
  }
}

// Загружаем карты в RGB-буферы
async function loadImage(path) {
  const { data, info } = await sharp(path)
    .resize(width, height)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new Error(`Ожидалось RGB: ${path}`);
  }

  return data;
}

const day = await loadImage(dayPath);
const mask = await loadImage(maskPath);
const bathy = await loadImage(bathyPath);

const result = Buffer.from(day);

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

for (let i = 0; i < result.length; i += 3) {
  // Маска: белое — вода, чёрное — суша
  const ocean = mask[i] / 255;

  if (ocean < 0.01) continue;

  // Яркость батиметрического изображения
  const brightness =
    (0.2126 * bathy[i] +
      0.7152 * bathy[i + 1] +
      0.0722 * bathy[i + 2]) / 255;

  // Небольшое изменение яркости океана
  const variation = (brightness - 0.5) * STRENGTH;

  const factor = 1 + variation * ocean;

  result[i] = clamp(day[i] * factor);
  result[i + 1] = clamp(day[i + 1] * factor);
  result[i + 2] = clamp(day[i + 2] * factor);
}

await mkdir("public/textures/earth", {
  recursive: true,
});

await sharp(result, {
  raw: {
    width,
    height,
    channels: 3,
  },
})
  .png()
  .toFile(output);

console.log("Created:", output);
