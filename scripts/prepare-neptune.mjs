import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://www.solarsystemscope.com/textures/download/2k_neptune.jpg";

const OUT = new URL("../public/textures/neptune/", import.meta.url);

const W = 8192;
const H = 4096;

await mkdir(OUT, { recursive: true });

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(`Neptune download failed: ${response.status}`);
}

const source = Buffer.from(await response.arrayBuffer());

await writeFile(fileURLToPath(new URL("neptune-source.jpg", OUT)), source);

// Upscale the source without introducing artificial latitude bands.
const { data, info } = await sharp(source)
  .resize(W, H, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

if (info.channels !== 3) {
  throw new Error("Expected RGB texture");
}

// Apply restrained color correction without procedural latitude bands.
for (let i = 0; i < data.length; i += 3) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  const saturation = 0.82;
  const brightness = 1.04;

  const rgb = [r, g, b];

  for (let c = 0; c < 3; c++) {
    const balanced = luminance + (rgb[c] - luminance) * saturation;

    data[i + c] = Math.max(0, Math.min(255, Math.round(balanced * brightness)));
  }
}

// Blend the longitude seam while preserving source detail.
const seamWidth = 96;

for (let y = 0; y < H; y++) {
  for (let c = 0; c < 3; c++) {
    const leftEdge = y * W * 3 + c;
    const rightEdge = (y * W + W - 1) * 3 + c;

    const common = Math.round((data[leftEdge] + data[rightEdge]) * 0.5);

    for (let x = 0; x < seamWidth; x++) {
      const t = x / Math.max(seamWidth - 1, 1);
      const smooth = t * t * (3 - 2 * t);
      const weight = 1 - smooth;

      const li = (y * W + x) * 3 + c;
      const ri = (y * W + W - 1 - x) * 3 + c;

      data[li] = Math.round(data[li] * (1 - weight) + common * weight);

      data[ri] = Math.round(data[ri] * (1 - weight) + common * weight);
    }
  }
}

const fullPath = fileURLToPath(new URL("neptune-8k.webp", OUT));

await sharp(data, {
  raw: {
    width: W,
    height: H,
    channels: 3,
  },
})
  .webp({ quality: 94, effort: 5 })
  .toFile(fullPath);

await sharp(data, {
  raw: {
    width: W,
    height: H,
    channels: 3,
  },
})
  .resize(1024, 512, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  })
  .webp({ quality: 88, effort: 5 })
  .toFile(fileURLToPath(new URL("neptune-lite.webp", OUT)));

await writeFile(
  fileURLToPath(new URL("ATTRIBUTION.md", OUT)),
  [
    "# Neptune textures",
    "",
    "Base texture: Solar System Scope",
    "https://www.solarsystemscope.com/textures/",
    "License: CC BY 4.0",
    "",
    "Derived files:",
    "- neptune-8k.webp",
    "- neptune-lite.webp",
    "",
    "Only mild color correction and seam repair applied.",
    "No procedural latitude bands baked into the texture.",
  ].join("\n"),
  "utf8",
);

console.log("Neptune textures regenerated successfully.");
