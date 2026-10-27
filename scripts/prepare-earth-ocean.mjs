
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const input = "assets/earth/earthSpecularMap.tif";

const output = "public/textures/earth_ocean_mask.png";

await mkdir("public/textures", {
  recursive: true,
});

await sharp(input)
  .greyscale()
  .png({
    compressionLevel: 9,
  })
  .toFile(output);

console.log("Ocean mask created!");
