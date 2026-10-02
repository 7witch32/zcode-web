/**
 * Connection liveness watchdog for long-lived client connections.
 *
 * A silently-dead transport (phone locked, laptop asleep, NAT idle drop) never
 * fires a close event, and the RPC layer has no per-request timeout, so any call
 * fired after the death would vanish and its promise would never settle (e.g. a
 * settings form stuck on "Saving..." forever). The heartbeat keeps light traffic
 * flowing — which also doubles as keepalive against NAT idle drops — and declares
 * the connection dead after N consecutive failed probes so the app can surface a
 * recovery path instead of hanging silently.
 *
 * This module stays DOM-free: the host app injects the wake-up subscription.
 */

export interface ConnectionHeartbeatOptions {
  /** Cheap, side-effect-free RPC used as the liveness probe. */
  ping: () => Promise<unknown>;
  /** Called once when the connection is declared dead. The heartbeat stops first. */
  onConnectionDead: () => void;
  /** Delay between probes while healthy. Default 15000ms. */
  intervalMs?: number;
  /** Per-probe timeout. Default 8000ms. */
  timeoutMs?: number;
  /** Consecutive failed probes required to declare death. Default 2. */
  failuresBeforeDeath?: number;
  /** Delay before the next probe after a failure. Default 3000ms. */
  failureRetryDelayMs?: number;
  /**
   * Subscribe to "user returned to the page" so a woken-up tab probes immediately
   * instead of waiting a full interval. Returns an unsubscribe function.
   */
  onWakeUp?: (listener: () => void) => () => void;
}

/** Pure strike counter so the death decision is unit-testable without timers. */
export class ConnectionDeathDetector {
  private consecutiveFailures = 0;

  constructor(private readonly failuresBeforeDeath: number) {}

  onSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /** Returns true when the connection should be declared dead. */
  onFailure(): boolean {
    this.consecutiveFailures += 1;
    return this.consecutiveFailures >= this.failuresBeforeDeath;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Heartbeat probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function startConnectionHeartbeat(options: ConnectionHeartbeatOptions): () => void {
  const intervalMs = options.intervalMs ?? 15_000;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const failureRetryDelayMs = options.failureRetryDelayMs ?? 3_000;
  const detector = new ConnectionDeathDetector(options.failuresBeforeDeath ?? 2);

  let stopped = false;
  let inFlight = false;
  let lastProbeFailed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeWakeUp: (() => void) | undefined;

  const stop = () => {
    stopped = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    unsubscribeWakeUp?.();
    unsubscribeWakeUp = undefined;
  };

  const schedule = () => {
    if (stopped) {
      return;
    }
    // A wake-up probe can complete while the regular timer is still pending;
    // always replace it so parallel timer chains cannot accumulate.
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(
      () => {
        void probe();
      },
      lastProbeFailed ? failureRetryDelayMs : intervalMs,
    );
  };

  const probe = async () => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    try {
      await withTimeout(options.ping(), timeoutMs);
      detector.onSuccess();
      lastProbeFailed = false;
    } catch {
      lastProbeFailed = true;
      if (detector.onFailure()) {
        stop();
        options.onConnectionDead();
      }
    } finally {
      inFlight = false;
    }
    schedule();
  };

  unsubscribeWakeUp =
    options.onWakeUp?.(() => {
      // A tab that just came back to the foreground is the classic zombie case
      // (phone locked / laptop asleep); probe now instead of waiting a full interval.
      void probe();
    }) ?? undefined;

  schedule();
  return stop;
}
