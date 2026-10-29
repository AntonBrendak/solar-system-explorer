import type { Texture, Vector4 } from "three";

/** The two textures currently blended by EarthClouds. */
export type CloudFrameState = {
  from: Texture;
  to: Texture;
  blend: number;
  phase: number;
  /** At most four live cloud-local optical pulses, shared with the volume shader. */
  lightning?: Vector4[];
};
