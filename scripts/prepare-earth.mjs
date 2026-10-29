import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const input = "assets/earth/earthSpecularMap.tif";
const output = "public/textures/earth_roughness.png";

await mkdir("public/textures", {
  recursive: true,
});

await sharp(input).greyscale().linear(-0.7, 217).png().toFile(output);

console.log("Earth roughness map created");
