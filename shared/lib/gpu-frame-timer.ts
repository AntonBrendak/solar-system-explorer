type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
const drawFrames = new WeakMap<WebGL2RenderingContext, boolean>();

/** Called before frame telemetry. A context has one TIME_ELAPSED query target. */
export function coordinateGpuFrameTimers(
  gl: WebGL2RenderingContext,
  drawOnly: boolean,
) {
  drawFrames.set(gl, drawOnly);
}

/** Non-blocking WebGL2 timer queries. No synchronous finish/readback or busy waits.
 * https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
 */
export function createGpuFrameTimer(
  gl: WebGL2RenderingContext,
  scope: "frame" | "draw" = "frame",
) {
  const extension = gl.getExtension(
    "EXT_disjoint_timer_query_webgl2",
  ) as TimerExtension | null;
  let query: WebGLQuery | null = null;
  let running = false;
  let latest: number | null = null;
  const discard = () => {
    if (running && extension && !gl.isContextLost())
      gl.endQuery(extension.TIME_ELAPSED_EXT);
    if (query) gl.deleteQuery(query);
    running = false;
    query = null;
  };
  return {
    begin() {
      if ((drawFrames.get(gl) ?? false) !== (scope === "draw")) return;
      if (!extension || query || gl.isContextLost()) return;
      if (gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return;
      query = gl.createQuery();
      if (!query) return;
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      running = true;
    },
    end() {
      if (!running || !extension) return;
      if (!gl.isContextLost()) gl.endQuery(extension.TIME_ELAPSED_EXT);
      running = false;
    },
    poll() {
      if (!extension || gl.isContextLost()) {
        discard();
        latest = null;
        return latest;
      }
      if (!query) return latest;
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        discard();
        latest = null;
        return latest;
      }
      if (
        query &&
        !running &&
        gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
      ) {
        latest =
          Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1_000_000;
        discard();
      }
      return latest;
    },
    dispose: discard,
  };
}
