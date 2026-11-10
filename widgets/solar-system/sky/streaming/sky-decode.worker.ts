import { decodeSky, SkyDecodeUnsupported } from "./sky-decode";
import { fetchSkyAsset } from "./sky-fetch";
import { SkyAssetError } from "./SkyRequestPolicy";
import type { SkyAsset } from "../model/sky-manifest";

type Job =
  | { id: number; type: "fetch"; url: string; asset: SkyAsset }
  | { id: number; type: "decode"; blob: Blob }
  | { id: number; type: "cancel" };
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const controllers = new Map<number, AbortController>();
scope.onmessage = async ({ data: job }) => {
  if (job.type === "cancel") {
    controllers.get(job.id)?.abort();
    return;
  }
  const controller = new AbortController();
  controllers.set(job.id, controller);
  try {
    if (job.type === "fetch") {
      const blob = await fetchSkyAsset(
        job.url,
        job.asset,
        controller.signal,
        undefined,
        (loaded) => scope.postMessage({ id: job.id, loaded }),
      );
      controller.signal.throwIfAborted();
      scope.postMessage({ id: job.id, result: blob });
    } else {
      if (typeof OffscreenCanvas === "undefined")
        throw new SkyDecodeUnsupported("Worker Canvas is unavailable");
      const pixels = await decodeSky(job.blob);
      controller.signal.throwIfAborted();
      scope.postMessage({ id: job.id, result: pixels }, [pixels.data.buffer]);
    }
  } catch (error) {
    scope.postMessage({
      id: job.id,
      error: error instanceof Error ? error.message : String(error),
      kind: controller.signal.aborted
        ? "cancelled"
        : error instanceof SkyDecodeUnsupported
          ? "unsupported"
          : error instanceof SkyAssetError
            ? error.kind
            : job.type === "fetch"
              ? "transient"
              : "permanent",
      retryAfterMs: error instanceof SkyAssetError ? error.retryAfterMs : 0,
    });
  } finally {
    controllers.delete(job.id);
  }
};
