import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "public/og");
await mkdir(output, { recursive: true });
const planet = await sharp(path.join(root, "public/planets/earth.webp"))
  .resize(570, 570, { fit: "contain" })
  .png()
  .toBuffer();
for (const locale of ["en", "ru"]) {
  const words =
    locale === "en"
      ? [
          "Real worlds.",
          "Remarkable detail.",
          "An interactive planetary observatory",
        ]
      : [
          "Реальные миры.",
          "Мельчайшие детали.",
          "Интерактивная обсерватория планет",
        ];
  const background = Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g"><stop stop-color="#193a55"/><stop offset="1" stop-color="#070b11"/></radialGradient></defs><rect width="1200" height="630" fill="#070b11"/><ellipse cx="925" cy="320" rx="480" ry="450" fill="url(#g)"/><g fill="none" stroke="#8cafcf" opacity=".18"><ellipse cx="890" cy="325" rx="365" ry="220" transform="rotate(-35 890 325)"/><ellipse cx="890" cy="325" rx="430" ry="270" transform="rotate(-35 890 325)"/></g><g font-family="Arial, sans-serif"><text x="64" y="92" fill="#e8f2fa" font-size="30" font-weight="700" letter-spacing="5">ORBITAL.</text><text x="64" y="278" fill="#edf4fa" font-size="53" letter-spacing="-2">${words[0]}</text><text x="64" y="345" fill="#9bb7cd" font-size="45" letter-spacing="-2">${words[1]}</text><text x="66" y="400" fill="#9cabbc" font-size="18">${words[2]}</text><path d="M64 510H500" stroke="#8cafcf" opacity=".25"/><text x="64" y="553" fill="#a5c8df" font-size="13" letter-spacing="3">8 WORLDS  /  UP TO 8K</text></g></svg>`,
  );
  await sharp(background)
    .composite([{ input: planet, left: 635, top: 33 }])
    .png()
    .toFile(path.join(output, `orbital-${locale}.png`));
}
console.log("Prepared localized Open Graph images.");
