export function mapLoadingProgress(input: {
  models: number;
  modelTotal: number;
  sky: number;
  skyTotal: number;
  ready: boolean;
}) {
  if (input.ready) return 100;
  const models = Math.min(1, input.models / Math.max(1, input.modelTotal));
  const sky = Math.min(1, input.sky / Math.max(1, input.skyTotal));
  return Math.min(99, Math.floor(20 * models + 80 * sky));
}
