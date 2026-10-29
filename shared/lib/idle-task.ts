/** Schedule nonessential work after the interface has had a chance to paint. */
export function afterPaint(task: () => void) {
  let cancelled = false;
  let nextFrame = 0;
  let cancelIdle = () => {};
  const firstFrame = window.requestAnimationFrame(() => {
    nextFrame = window.requestAnimationFrame(() => {
      cancelIdle = whenIdle(() => {
        if (!cancelled) task();
      });
    });
  });
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(nextFrame);
    cancelIdle();
  };
}

function whenIdle(task: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 32);
  return () => window.clearTimeout(id);
}

/** Yield between GPU uploads; abort pending work when a scene becomes inactive. */
export function idleTurn(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const cancel = whenIdle(() => {
      signal.removeEventListener("abort", abort);
      resolve(true);
    });
    function abort() {
      cancel();
      resolve(false);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
