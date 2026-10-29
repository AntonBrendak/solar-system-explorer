/**
 * Download and prepare CC BY 4.0 textures for Saturn.
 * Run from the repository root: node scripts/prepare-saturn.mjs
 * Requires sharp (already installed in solar-system-explorer).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const output = path.join(process.cwd(), 'public', 'textures', 'saturn');
const sources = {
  surface: [
    'https://www.solarsystemscope.com/textures/download/8k_saturn.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/1/1e/Solarsystemscope_texture_8k_saturn.jpg',
  ],
  rings: [
    'https://www.solarsystemscope.com/textures/download/8k_saturn_ring_alpha.png',
    'https://upload.wikimedia.org/wikipedia/commons/2/29/Solarsystemscope_texture_8k_saturn_ring_alpha.png',
  ],
};

async function downloadImage(urls, label) {
  let lastError;
  for (const url of urls) {
    try {
      console.log(`Downloading ${label}: ${url}`);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(45_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SaturnTexturePreparer/1.0)',
          Accept: 'image/jpeg,image/png,image/*;q=0.8',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Downloaded content is not a valid image');
      }
      return { bytes, metadata, url };
    } catch (error) {
      lastError = error;
      console.warn(`  Failed: ${error.message}`);
    }
  }
  throw new Error(`Cannot download ${label}: ${lastError?.message}`);
}

async function main() {
  await mkdir(output, { recursive: true });

  const surface = await downloadImage(sources.surface, 'Saturn surface');
  if (surface.metadata.width < 4000 || surface.metadata.height < 2000) {
    throw new Error(`Unexpected Saturn map size: ${surface.metadata.width}x${surface.metadata.height}`);
  }
  const surfacePath = path.join(output, 'saturnMap.jpg');
  // Save original 4096x2048 JPEG, without an extra recompression pass.
  await writeFile(surfacePath, surface.bytes);
  await sharp(surface.bytes)
    .resize({ width: 1024, height: 512, fit: 'fill' })
    .webp({ quality: 82, effort: 6 })
    .toFile(path.join(output, 'saturn-lite.webp'));

  const rings = await downloadImage(sources.rings, 'Saturn rings with alpha');
  if (!rings.metadata.hasAlpha || rings.metadata.width < 8000) {
    throw new Error(`Invalid ring map: expected a transparent 8192px radial strip; got ${rings.metadata.width}x${rings.metadata.height}, hasAlpha=${rings.metadata.hasAlpha}`);
  }
  // Each X column represents a ring radius. Reducing the almost-redundant
  // height saves GPU memory; keep alpha and sharp radial detail in X.
  await sharp(rings.bytes)
    .resize({ width: 4096, height: 64, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, 'saturn-ring.png'));
  await sharp(rings.bytes)
    .resize({ width: 1024, height: 16, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, 'saturn-ring-lite.png'));

  await writeFile(path.join(output, 'ATTRIBUTION.md'), `# Saturn textures\n\nOriginal author: Solar System Scope.\nSource: https://www.solarsystemscope.com/textures/\nLicense: Creative Commons Attribution 4.0 International (CC BY 4.0).\nLicense text: https://creativecommons.org/licenses/by/4.0/\n\n- Saturn globe: 8k_saturn.jpg, ${surface.metadata.width}x${surface.metadata.height}; original file saved as saturnMap.jpg. A 1024x512 WebP preview was derived.\n- Saturn rings: 8k_saturn_ring_alpha.png, ${rings.metadata.width}x${rings.metadata.height}; resized to 4096x64 and 1024x16 PNG with alpha.\n\nBoth textures were prepared from the linked originals and remain attributed to Solar System Scope.\n`, 'utf8');

  console.log('\nSaved files:');
  for (const filename of ['saturnMap.jpg', 'saturn-lite.webp', 'saturn-ring.png', 'saturn-ring-lite.png', 'ATTRIBUTION.md']) {
    console.log('  ' + path.join(output, filename));
  }
  console.log('\nIMPORTANT: map rings using the horizontal UV coordinate for radius; do not wrap them around a sphere.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
