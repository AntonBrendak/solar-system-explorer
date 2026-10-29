import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const input = "assets/earth/earthNormalMap.tif";
const output = "public/textures/earth/earth_normal.png";

await mkdir("public/textures", {
  recursive: true,
});

const metadata = await sharp(input).metadata();

if (metadata.channels < 3) {
  throw new Error("The normal map must contain RGB channels.");
}

const result = await sharp(input)
  .png({
    compressionLevel: 9,
    palette: false,
  })
  .toFile(output);

console.log(`Normal Map converted: ${result.width}x${result.height}`);
