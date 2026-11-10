import { SKY_USABLE } from "../model/sky-config";

/** Counts owned buffers and conservative decoder reservations, never browser RSS. */
export class SkyMemory {
  private next = 0;
  private reservations = new Map<number, { bytes: number; label: string }>();
  get bytes() {
    return [...this.reservations.values()].reduce(
      (sum, item) => sum + item.bytes,
      0,
    );
  }
  reserve(bytes: number, label: string): number | null {
    if (bytes < 0 || this.bytes + bytes > SKY_USABLE) return null;
    const id = ++this.next;
    this.reservations.set(id, { bytes, label });
    return id;
  }
  release(id: number) {
    this.reservations.delete(id);
  }
  owns(id: number) {
    return this.reservations.has(id);
  }
}
