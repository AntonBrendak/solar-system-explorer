import type { DecodedPixels } from "./sky-decode";
import type { SkyMemory } from "./SkyMemory";

export type CachedPixels = DecodedPixels & {
  reservation: number;
  touched: number;
};

export class SkyTileCache {
  readonly entries = new Map<string, CachedPixels>();
  constructor(private memory: SkyMemory) {}
  get(key: string) {
    const value = this.entries.get(key);
    if (value) value.touched = performance.now();
    return value;
  }
  put(key: string, value: CachedPixels) {
    this.delete(key);
    this.entries.set(key, value);
  }
  delete(key: string) {
    const value = this.entries.get(key);
    if (value) this.memory.release(value.reservation);
    this.entries.delete(key);
  }
  trim(protectedKeys: ReadonlySet<string>, maxBytes = 32 * 1024 * 1024) {
    let bytes = [...this.entries.entries()].reduce(
      (sum, [key, entry]) =>
        sum + (protectedKeys.has(key) ? 0 : entry.data.byteLength),
      0,
    );
    for (const [key, entry] of [...this.entries].sort(
      (a, b) => a[1].touched - b[1].touched,
    )) {
      if (bytes <= maxBytes) break;
      if (protectedKeys.has(key)) continue;
      bytes -= entry.data.byteLength;
      this.delete(key);
    }
  }
  dispose() {
    for (const key of this.entries.keys()) this.delete(key);
  }
}
