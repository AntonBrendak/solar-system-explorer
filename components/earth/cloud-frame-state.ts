import type { Texture, Vector4 } from "three";

/** Две текстуры, которые сейчас смешивает EarthClouds. */
export type CloudFrameState = {
  from: Texture;
  to: Texture;
  blend: number;
  phase: number;
  /** At most four live cloud-local optical pulses, shared with the volume shader. */
  lightning?: Vector4[];
};
