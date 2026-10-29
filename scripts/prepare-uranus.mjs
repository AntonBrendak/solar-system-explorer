import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://play.solarsystemscope.com/textures/download/2k_uranus.jpg";

const outDir = new URL("../public/textures/uranus/", import.meta.url);

await mkdir(outDir, { recursive: true });

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(`Failed to download Uranus texture: ${response.status}`);
}

const buffer = Buffer.from(await response.arrayBuffer());

await writeFile(
  fileURLToPath(new URL("uranus-source.jpg", outDir)),
  buffer
);

const fullWidth = 8192;
const fullHeight = 4096;
const seamBlend = 32;

// База 8K
const base = sharp(buffer).resize(fullWidth, fullHeight, {
  fit: "fill",
  kernel: sharp.kernel.lanczos3,
});

const raw = await base
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const pixels = raw.data;
const channels = raw.info.channels;
const width = raw.info.width;
const height = raw.info.height;

// Делаем плавное совпадение левого и правого краёв.
for (let y = 0; y < height; y++) {
  for (let x = 0; x < seamBlend; x++) {
    const t = x / Math.max(seamBlend - 1, 1);

    const leftIndex =
      (y * width + x) * channels;

    const rightIndex =
      (y * width + (width - seamBlend + x)) * channels;

    for (let c = 0; c < channels; c++) {
      const left = pixels[leftIndex + c];
      const right = pixels[rightIndex + c];

      const mixed =
        Math.round(left * (1 - t) + right * t);

      pixels[leftIndex + c] = mixed;
      pixels[rightIndex + c] = mixed;
    }
  }
}

await sharp(pixels, {
  raw: {
    width,
    height,
    channels,
  },
})
  .webp({ quality: 96, effort: 6 })
  .toFile(fileURLToPath(new URL("uranus-8k.webp", outDir)));

await sharp(buffer)
  .resize(1024, 512, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  })
  .webp({ quality: 90, effort: 6 })
  .toFile(fileURLToPath(new URL("uranus-lite.webp", outDir)));

await writeFile(
  fileURLToPath(new URL("ATTRIBUTION.md", outDir)),
  [
    "# Uranus texture",
    "",
    "Source: Solar System Scope",
    "License: CC BY 4.0",
    "https://www.solarsystemscope.com/textures/",
    "",
    "Derived files:",
    "- uranus-8k.webp",
    "- uranus-lite.webp",
  ].join("\n"),
  "utf8"
);

console.log("Uranus textures prepared:");
console.log(" - public/textures/uranus/uranus-8k.webp");
console.log(" - public/textures/uranus/uranus-lite.webp");