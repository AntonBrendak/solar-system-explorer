export type DecodedPixels = {
  data: Uint8Array;
  width: number;
  height: number;
  mainThreadMs: number;
};
export class SkyDecodeUnsupported extends Error {}

/** Same contract for bases and pages. Never relies on implicit bitmap colour conversion. */
export async function decodeSky(blob: Blob): Promise<DecodedPixels> {
  return prepareSkyPixels(await createSkyBitmap(blob));
}

export function createSkyBitmap(blob: Blob) {
  if (typeof createImageBitmap !== "function")
    return Promise.reject(
      new SkyDecodeUnsupported("ImageBitmap decoding is unavailable"),
    );
  return createImageBitmap(blob, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
    imageOrientation: "none",
  });
}

/** Indivisible Canvas operations are measured separately from the asynchronous bitmap wait. */
export function prepareSkyPixels(bitmap: ImageBitmap): DecodedPixels {
  const started = performance.now();
  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  let pixels: Omit<DecodedPixels, "mainThreadMs">;
  try {
    canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : Object.assign(document.createElement("canvas"), {
            width: bitmap.width,
            height: bitmap.height,
          });
    const context = canvas.getContext("2d", {
      alpha: false,
      colorSpace: "srgb",
      willReadFrequently: true,
    }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    const attributes = context as typeof context & {
      getContextAttributes?: () => { colorSpace?: string };
    };
    if (
      !context ||
      attributes?.getContextAttributes?.().colorSpace !== "srgb"
    ) {
      throw new SkyDecodeUnsupported(
        "Explicit sRGB Canvas decoding is unavailable",
      );
    }
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height, {
      colorSpace: "srgb",
    });
    // The opaque sRGB canvas returns alpha 255 without a per-pixel main-thread loop.
    pixels = {
      data: new Uint8Array(image.data.buffer),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
  return { ...pixels, mainThreadMs: performance.now() - started };
}
