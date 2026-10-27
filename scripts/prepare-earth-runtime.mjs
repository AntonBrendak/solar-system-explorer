import sharp from "sharp";
import { access, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = new URL("../public/textures/earth/", import.meta.url);
const output = new URL("runtime/", source);
await mkdir(output, { recursive: true });

const maps = [
  ["earthDayOcean.png", "earth-day.webp", 4096, "webp"],
  ["earth_normal.png", "earth-normal.png", 2048, "png"],
  ["earth_roughness.png", "earth-roughness.png", 2048, "png"],
  ["earth_ocean_mask.png", "earth-ocean.png", 2048, "png"],
  ["earthNightmap.jpg", "earth-night.webp", 4096, "webp"],
];

for (const [input, name, width, format] of maps) {
  let image = sharp(fileURLToPath(new URL(input, source)))
    .resize(width, width / 2, { fit: "fill" });
  image = format === "webp"
    ? image.webp({ quality: 94, effort: 6 })
    : image.png({ compressionLevel: 9 });
  await image.toFile(fileURLToPath(new URL(name, output)));
}

let cloudSource = new URL("cloudsLive.png", source);
try { await access(cloudSource); }
catch { cloudSource = new URL("earthClouds.jpg", source); }
const { hasAlpha } = await sharp(fileURLToPath(cloudSource)).metadata();
const alpha = await sharp(fileURLToPath(cloudSource))
  .resize(2048, 1024)
  .extractChannel(hasAlpha ? "alpha" : "green")
  .png()
  .toBuffer();
await sharp({ create: { width: 2048, height: 1024, channels: 3, background: "white" } })
  .joinChannel(alpha)
  .webp({ quality: 94, alphaQuality: 100, effort: 6 })
  .toFile(fileURLToPath(new URL("clouds-fallback.webp", output)));

const inputBytes = (await Promise.all(maps.map(([name]) => stat(new URL(name, source)))))
  .reduce((sum, item) => sum + item.size, 0);
const outputBytes = (await Promise.all(maps.map(([, name]) => stat(new URL(name, output)))))
  .reduce((sum, item) => sum + item.size, 0);
console.log(`Surface/material/night maps: ${(inputBytes / 1048576).toFixed(1)} → ${(outputBytes / 1048576).toFixed(1)} MiB. Runtime assets prepared.`);
