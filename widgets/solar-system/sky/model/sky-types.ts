export type SkyLevel = 8 | 16 | 32 | 64;
export type DetailLevel = Exclude<SkyLevel, 8>;
export type PageCore = 1024 | 512 | 256;
export type TileState =
  | "Requested"
  | "Decoded"
  | "Upload queued"
  | "GPU uploaded"
  | "Published"
  | "Visible"
  | "Cancelled"
  | "Failed"
  | "Retiring"
  | "Free";

/** All coordinates use the immutable, top-down ICRF/J2000 atlas. */
export type SkyRegion = { level: SkyLevel; column: number; row: number };
export type NetworkTile = SkyRegion & { level: DetailLevel; id: string };
export type GpuPage = {
  tile: NetworkTile;
  x: number;
  y: number;
  core: PageCore;
  id: string;
};
export type LodTransitionGroup = {
  id: string;
  region: SkyRegion;
  target: DetailLevel;
  tiles: NetworkTile[];
  pages: GpuPage[];
  currentCoverage:
    { kind: "base" } | { kind: "pages"; pageIds: readonly string[] };
};
export type UploadIdentity = {
  atlasRevision: string;
  contextGeneration: number;
  poolGeneration: number;
  slotGeneration: number;
  upload: number;
  reservation: number;
};
export type SkyMetrics = {
  revision: string;
  profile: number;
  base: number;
  cpuBytes: number;
  gpuBytes: number;
  slots: number;
  used: number;
  requests: number;
  viewGeneration: number;
  uploadMs: number;
  cpuPeakMs: number;
  shaderCompileMs: number | null;
  warmupMs: number | null;
  skyGpuMs: number | null;
  state: string;
  error: string | null;
};
