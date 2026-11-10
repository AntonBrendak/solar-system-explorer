import { CANCEL_GRACE_MS } from "../model/sky-config";
import {
  atlasLock,
  type SkyManifest,
  type SkyAsset,
} from "../model/sky-manifest";
import type { TileState } from "../model/sky-types";
import {
  createSkyBitmap,
  prepareSkyPixels,
  type DecodedPixels,
} from "./sky-decode";
import { fetchSkyAsset } from "./sky-fetch";
import {
  SkyRequestPolicy,
  SkyAssetError,
  isDetailKey,
  mainDecodeSession,
} from "./SkyRequestPolicy";
import { SkyWorkerClient, SkyWorkerUnavailable } from "./SkyWorkerClient";
import { SkyTileCache } from "./SkyTileCache";
import type { SkyMemory } from "./SkyMemory";

type Request = {
  key: string;
  controller: AbortController;
  asset: SkyAsset;
  state: TileState;
  wantedAt: number;
  viewGeneration: number;
  blob?: Blob;
  blobReservation: number;
};
type MainJob = { run(): void; cancel(): void };
type MainPreparation = {
  request: Request;
  bitmap: ImageBitmap;
  resolve(value: DecodedPixels): void;
  reject(error: unknown): void;
};

export class SkyTileLoader {
  readonly cache: SkyTileCache;
  readonly requests = new Map<string, Request>();
  readonly policy = new SkyRequestPolicy();
  error: string | null = null;
  blockedBy: string | null = null;
  private worker: SkyWorkerClient | null = null;
  private workerDecode = true;
  private decoding = false;
  private disposed = false;
  private fetches = 0;
  private metadataReservation: number;
  private protectedKeys: ReadonlySet<string> = new Set();
  private activeFetches = new Set<Request>();
  private decodingRequest: Request | null = null;
  private mainPreparation: MainPreparation | null = null;
  private mainJobs: MainJob[] = [];
  private decodePolicy;

  constructor(
    readonly manifest: SkyManifest,
    private memory: SkyMemory,
  ) {
    const metadata = memory.reserve(
      2 * 1024 * 1024,
      "manifest-and-request-metadata",
    );
    if (metadata === null)
      throw new Error("Sky manifest memory reservation unavailable");
    this.metadataReservation = metadata;
    this.cache = new SkyTileCache(memory);
    this.decodePolicy = mainDecodeSession(manifest.revision);
    if (typeof Worker !== "undefined") {
      try {
        this.worker = new SkyWorkerClient();
      } catch {
        this.worker = null;
      }
    }
  }
  get workerSupported() {
    return !!this.worker?.alive && this.workerDecode;
  }
  get detailStreamingEnabled() {
    return !this.decodePolicy.disabled;
  }
  get networkInFlight() {
    return this.fetches;
  }
  unavailable(key: string) {
    return (
      this.policy.unavailable(key) ||
      (isDetailKey(key) && !this.detailStreamingEnabled)
    );
  }
  setUseful(keys: ReadonlySet<string>) {
    this.protectedKeys = new Set(keys);
  }

  want(key: string, viewGeneration: number, now: number, deadline = Infinity) {
    if (
      this.disposed ||
      performance.now() >= deadline ||
      this.unavailable(key) ||
      this.cache.get(key)
    )
      return;
    const existing = this.requests.get(key);
    if (existing) {
      existing.wantedAt = now;
      existing.viewGeneration = viewGeneration;
      return;
    }
    if (this.fetches >= 3 || !this.policy.canRequest(key, now)) return;
    const asset = this.manifest.files[key];
    if (!asset) return;
    const decodePeak = asset.width * asset.height * 12;
    if (this.memory.bytes + asset.bytes * 2 + decodePeak > this.memory.limit) {
      this.cache.trim(this.protectedKeys, 0);
      if (
        this.memory.bytes + asset.bytes * 2 + decodePeak >
        this.memory.limit
      ) {
        this.blockedBy = "Blocked by CPU budget";
        return;
      }
    }
    if (performance.now() >= deadline) return;
    const reservation = this.memory.reserve(asset.bytes * 2, `fetch:${key}`);
    if (reservation === null) {
      this.blockedBy = "Blocked by CPU budget";
      return;
    }
    this.blockedBy = null;
    const request: Request = {
      key,
      asset,
      controller: new AbortController(),
      state: "Requested",
      wantedAt: now,
      viewGeneration,
      blobReservation: reservation,
    };
    this.requests.set(key, request);
    this.fetches++;
    this.activeFetches.add(request);
    void this.fetch(request).finally(() => {
      this.fetches--;
      this.activeFetches.delete(request);
      if (request.state === "Cancelled" || this.disposed) this.release(request);
    });
  }

  private async fetch(request: Request) {
    try {
      const url = request.asset.path.startsWith("/")
        ? request.asset.path
        : `${atlasLock.root}/${request.asset.path}`;
      const blob = this.worker?.alive
        ? await this.worker.run<Blob>(
            { type: "fetch", url, asset: request.asset },
            request.controller.signal,
          )
        : await fetchSkyAsset(
            url,
            request.asset,
            request.controller.signal,
            (work) => this.scheduleMain(work, request.controller.signal),
          );
      if (request.controller.signal.aborted || this.disposed) {
        this.release(request);
        return;
      }
      request.blob = blob;
    } catch (error) {
      this.fail(request, error);
      this.release(request);
    }
  }

  /** Cancellation and fence ownership are mandatory; all preparation shares the caller's deadline. */
  tick(
    useful: ReadonlySet<string>,
    viewGeneration: number,
    now: number,
    mayWork: boolean,
    idle: boolean,
    deadline = Infinity,
  ) {
    this.setUseful(useful);
    for (const request of this.requests.values()) {
      if (this.unavailable(request.key)) {
        this.cancel(request.key);
        continue;
      }
      if (useful.has(request.key)) {
        request.wantedAt = now;
        request.viewGeneration = viewGeneration;
      } else if (
        now - request.wantedAt > CANCEL_GRACE_MS &&
        request.state === "Requested"
      )
        this.cancel(request.key);
    }
    if (!mayWork || performance.now() >= deadline) return;
    this.cache.trim(useful);
    while (this.mainJobs.length && performance.now() < deadline)
      this.mainJobs.shift()!.run();
    if (performance.now() >= deadline) return;
    if (this.mainPreparation) {
      if (!idle) return;
      const job = this.mainPreparation;
      this.mainPreparation = null;
      try {
        const pixels = prepareSkyPixels(job.bitmap);
        this.decodePolicy.record(job.request.key, pixels.mainThreadMs);
        if (this.decodePolicy.disabled) {
          this.error =
            "Detail streaming disabled for this session after repeated slow main-thread decodes";
          job.reject(new SkyAssetError(this.error, "permanent"));
          for (const request of this.requests.values())
            if (isDetailKey(request.key)) this.cancel(request.key);
        } else job.resolve(pixels);
      } catch (error) {
        job.reject(error);
      }
      return; // Canvas work is indivisible; no further preparation may start in this frame.
    }
    if (this.decoding || (!this.workerSupported && !idle)) return;
    const request = [...this.requests.values()].find(
      (item) =>
        item.blob && !item.controller.signal.aborted && useful.has(item.key),
    );
    if (!request || performance.now() >= deadline) return;
    const reservation = this.memory.reserve(
      request.asset.width * request.asset.height * 12,
      `decode:${request.key}`,
    );
    if (reservation === null) {
      this.blockedBy = "Blocked by CPU budget";
      this.cache.trim(useful, 0);
      return;
    }
    this.blockedBy = null;
    this.decoding = true;
    this.decodingRequest = request;
    let retryOnMain = false;
    void this.decode(request)
      .then((pixels) => {
        if (this.disposed || request.controller.signal.aborted) return;
        if (
          !(pixels.data instanceof Uint8Array) ||
          pixels.data.byteLength !==
            request.asset.width * request.asset.height * 4 ||
          pixels.width !== request.asset.width ||
          pixels.height !== request.asset.height
        ) {
          throw new SkyAssetError(
            "Sky decoded dimensions mismatch",
            "permanent",
          );
        }
        this.memory.release(reservation);
        const owned = this.memory.reserve(
          pixels.data.byteLength,
          `pixels:${request.key}`,
        );
        if (owned === null)
          throw new SkyAssetError(
            "Sky decoded reservation unavailable",
            "transient",
          );
        request.state = "Decoded";
        this.cache.put(request.key, {
          ...pixels,
          reservation: owned,
          touched: now,
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof SkyWorkerUnavailable &&
          !request.controller.signal.aborted &&
          !this.disposed
        ) {
          this.workerDecode = false;
          retryOnMain = true;
          return;
        }
        this.fail(
          request,
          error instanceof SkyAssetError
            ? error
            : new SkyAssetError(
                error instanceof Error ? error.message : String(error),
                "permanent",
              ),
        );
      })
      .finally(() => {
        this.memory.release(reservation);
        if (!retryOnMain || request.controller.signal.aborted || this.disposed)
          this.release(request);
        this.decoding = false;
        this.decodingRequest = null;
      });
  }

  private decode(request: Request): Promise<DecodedPixels> {
    if (this.workerSupported)
      return this.worker!.run(
        { type: "decode", blob: request.blob! },
        request.controller.signal,
      );
    return new Promise((resolve, reject) => {
      void createSkyBitmap(request.blob!).then((bitmap) => {
        if (this.disposed || request.controller.signal.aborted) {
          bitmap.close();
          reject(new DOMException("Sky decode cancelled", "AbortError"));
          return;
        }
        this.mainPreparation = { request, bitmap, resolve, reject };
      }, reject);
    });
  }

  private scheduleMain<T>(work: () => T, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const cleanup = () => signal.removeEventListener("abort", cancel);
      const job: MainJob = {
        run: () => {
          cleanup();
          try {
            resolve(work());
          } catch (error) {
            reject(error);
          }
        },
        cancel: () => cancel(),
      };
      const cancel = () => {
        cleanup();
        const index = this.mainJobs.indexOf(job);
        if (index >= 0) this.mainJobs.splice(index, 1);
        reject(new DOMException("Sky fetch cancelled", "AbortError"));
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.mainJobs.push(job);
    });
  }
  cancel(key: string) {
    const request = this.requests.get(key);
    if (!request) return;
    request.state = "Cancelled";
    request.controller.abort();
    if (this.mainPreparation?.request === request) {
      this.mainPreparation.bitmap.close();
      this.mainPreparation.reject(
        new DOMException("Sky decode cancelled", "AbortError"),
      );
      this.mainPreparation = null;
    }
    if (!this.activeFetches.has(request) && this.decodingRequest !== request)
      this.release(request);
  }
  private fail(request: Request, error: unknown) {
    if (request.controller.signal.aborted || this.disposed) return;
    request.state = "Failed";
    this.error = error instanceof Error ? error.message : String(error);
    this.policy.fail(request.key, error, performance.now());
  }
  private release(request: Request) {
    this.memory.release(request.blobReservation);
    request.blob = undefined;
    if (this.requests.get(request.key) === request)
      this.requests.delete(request.key);
  }
  dispose() {
    this.disposed = true;
    for (const request of this.requests.values()) this.cancel(request.key);
    this.worker?.dispose();
    for (const job of [...this.mainJobs]) job.cancel();
    this.cache.dispose();
    this.memory.release(this.metadataReservation);
  }
}
