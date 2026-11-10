export type SkyFailureKind = "transient" | "permanent";

export class SkyAssetError extends Error {
  readonly kind: SkyFailureKind;
  readonly retryAfterMs: number;

  constructor(message: string, kind: SkyFailureKind, retryAfterMs = 0) {
    super(message);
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

export const isDetailKey = (key: string) => /^(16|32|64)\//.test(key);

/** A loader belongs to one immutable revision. Cancellation does not spend a retry. */
export class SkyRequestPolicy {
  private failures = new Map<
    string,
    { count: number; nextAt: number; terminal: boolean }
  >();
  readonly limit = 4;

  canRequest(key: string, now: number) {
    const state = this.failures.get(key);
    return !state || (!state.terminal && now >= state.nextAt);
  }

  unavailable(key: string) {
    return this.failures.get(key)?.terminal ?? false;
  }

  fail(key: string, error: unknown, now: number) {
    const previous = this.failures.get(key);
    const count = (previous?.count ?? 0) + 1;
    const permanent =
      error instanceof SkyAssetError && error.kind === "permanent";
    const terminal = permanent || count >= this.limit;
    const backoff = Math.min(30000, 1000 * 2 ** (count - 1));
    const retryAfter = error instanceof SkyAssetError ? error.retryAfterMs : 0;
    this.failures.set(key, {
      count,
      terminal,
      nextAt: terminal
        ? Infinity
        : now + Math.max(backoff, Math.min(300000, retryAfter)),
    });
  }
}

/** This latch survives renderer/context recreation and route remounts in the same JS session. */
export class SkyMainDecodePolicy {
  private slowCount = 0;
  disabled = false;
  record(key: string, mainThreadMs: number) {
    if (isDetailKey(key) && mainThreadMs > 2 && ++this.slowCount >= 2)
      this.disabled = true;
  }
}

const sessions = new Map<string, SkyMainDecodePolicy>();
export function mainDecodeSession(revision: string) {
  let policy = sessions.get(revision);
  if (!policy) {
    policy = new SkyMainDecodePolicy();
    sessions.set(revision, policy);
  }
  return policy;
}
