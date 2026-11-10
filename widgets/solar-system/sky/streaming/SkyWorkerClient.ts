import { SkyAssetError, type SkyFailureKind } from "./SkyRequestPolicy.ts";

export class SkyWorkerUnavailable extends Error {}
type Reply = {
  id: number;
  result?: unknown;
  error?: string;
  kind?: SkyFailureKind | "unsupported" | "cancelled";
  retryAfterMs?: number;
};

/** One worker, three concurrent fetches, one caller-controlled decode. Abort settles on worker acknowledgement. */
export class SkyWorkerClient {
  private worker: Worker;
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      cleanup(): void;
    }
  >();
  alive = true;

  constructor() {
    this.worker = new Worker(
      new URL("./sky-decode.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      job.cleanup();
      if (!data.error) job.resolve(data.result);
      else if (data.kind === "unsupported")
        job.reject(new SkyWorkerUnavailable(data.error));
      else if (data.kind === "cancelled")
        job.reject(new DOMException(data.error, "AbortError"));
      else
        job.reject(
          new SkyAssetError(
            data.error,
            data.kind ?? "permanent",
            data.retryAfterMs,
          ),
        );
    };
    this.worker.onerror = () =>
      this.dispose(new SkyWorkerUnavailable("Sky worker failed"));
    this.worker.onmessageerror = () =>
      this.dispose(new SkyWorkerUnavailable("Sky worker message failed"));
  }

  run<T>(message: object, signal: AbortSignal): Promise<T> {
    if (!this.alive)
      return Promise.reject(
        new SkyWorkerUnavailable("Sky worker is unavailable"),
      );
    if (signal.aborted) return Promise.reject(signal.reason);
    const id = ++this.next;
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        if (!this.alive) return;
        try {
          this.worker.postMessage({ type: "cancel", id });
        } catch {
          this.dispose(
            new SkyWorkerUnavailable("Sky worker cancellation failed"),
          );
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        cleanup: () => signal.removeEventListener("abort", abort),
      });
      try {
        this.worker.postMessage({ ...message, id });
      } catch {
        this.dispose(
          new SkyWorkerUnavailable("Sky worker could not accept a job"),
        );
      }
    });
  }

  dispose(error = new SkyWorkerUnavailable("Sky worker disposed")) {
    this.alive = false;
    this.worker.onmessage =
      this.worker.onerror =
      this.worker.onmessageerror =
        null;
    this.worker.terminate();
    for (const job of this.pending.values()) {
      job.cleanup();
      job.reject(error);
    }
    this.pending.clear();
  }
}
