export type RendererSample = {
  fps: number;
  frameMs: number | null;
  cpuMs: number | null;
  gpuMs: number | null;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
};

export type RendererTelemetrySink = {
  enabled: () => boolean;
  publish: (sample: RendererSample) => void;
};
