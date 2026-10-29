import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const sources = [
  ["mercury", "surface", "mercury/mercuryMap.jpg", false],
  ["mercury", "height", "mercury/mercury-height-8k.png", true],
  ["mercury", "normal", "mercury/mercury-normal-8k.png", true],
  ["venus", "clouds", "venus/venus-clouds-4k.jpg", false],
  ["earth", "surface", "earth/runtime/earth-day.webp", false],
  ["earth", "normal", "earth/runtime/earth-normal.png", true],
  ["earth", "roughness", "earth/runtime/earth-roughness.png", true],
  ["earth", "ocean", "earth/runtime/earth-ocean.png", true],
  ["earth", "night", "earth/runtime/earth-night.webp", false],
  ["earth", "clouds", "earth/runtime/clouds-fallback.webp", false],
  ["mars", "surface", "mars/mars-8k.jpg", false],
  ["mars", "height", "mars/mars-height-8k.png", true],
  ["mars", "normal", "mars/mars-normal-8k.png", true],
  ["jupiter", "surface", "jupiter/jupiterMap.jpg", false],
  ["saturn", "surface", "saturn/saturnMap.jpg", false],
  ["saturn", "rings", "saturn/saturn-ring.png", true],
  ["uranus", "surface", "uranus/uranus-8k.webp", false],
  ["neptune", "surface", "neptune/neptune-8k.webp", false],
];
const tiers = { "1k": 1024, "2k": 2048, "4k": 4096, "8k": 8192 };
const manifest = {};
sharp.cache(false);
for (const [planet, name, source, lossless] of sources) {
  const input = path.join(root, "public/textures", source);
  const sourceTime = (await stat(input)).mtimeMs;
  const original = await sharp(input).metadata();
  const entry = {};
  const directory = path.join(root, "public/textures/runtime", planet);
  await mkdir(directory, { recursive: true });
  for (const [tier, width] of Object.entries(tiers)) {
    const desiredWidth = Math.min(width, original.width);
    const reused = Object.values(entry).find(
      (asset) => asset.width === desiredWidth,
    );
    if (reused) {
      entry[tier] = reused;
      continue;
    }
    const output = path.join(directory, `${name}-${tier}.webp`);
    const existing = await stat(output).catch(() => null);
    if (!existing || existing.mtimeMs < sourceTime) {
      await sharp(input)
        .resize({ width: desiredWidth, withoutEnlargement: true })
        .webp({ quality: width >= 4096 ? 90 : 86, lossless, effort: 5 })
        .toFile(output);
    }
    if ((await stat(output)).size > 25 * 1024 * 1024) {
      await sharp(input)
        .resize({ width: desiredWidth })
        .webp({ nearLossless: true, quality: 96, effort: 6 })
        .toFile(output);
    }
    const metadata = await sharp(output).metadata();
    entry[tier] = {
      url: `/textures/runtime/${planet}/${name}-${tier}.webp`,
      width: metadata.width,
      height: metadata.height,
      bytes: (await stat(output)).size,
    };
  }
  manifest[`/textures/${source}`] = entry;
}
await writeFile(
  path.join(root, "features/planet-viewer/model/texture-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Prepared ${sources.length} texture maps from 1K to their original resolution, up to 8K.`,
);
