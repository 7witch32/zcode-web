import assert from "node:assert/strict";
import test from "node:test";
import { ConnectionDeathDetector, startConnectionHeartbeat } from "../src/connectionHeartbeat.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("waitFor: condition not met in time");
    }
    await delay(5);
  }
}

test("ConnectionDeathDetector declares death after the configured consecutive failures", () => {
  const detector = new ConnectionDeathDetector(2);
  assert.equal(detector.onFailure(), false);
  assert.equal(detector.onFailure(), true);
});

test("ConnectionDeathDetector resets the strike count after a success", () => {
  const detector = new ConnectionDeathDetector(2);
  assert.equal(detector.onFailure(), false);
  detector.onSuccess();
  assert.equal(detector.onFailure(), false);
  assert.equal(detector.onFailure(), true);
});

test("startConnectionHeartbeat declares death after consecutive failed probes", async () => {
  let dead = false;
  const stop = startConnectionHeartbeat({
    ping: () => Promise.reject(new Error("probe failed")),
    onConnectionDead: () => {
      dead = true;
    },
    intervalMs: 5,
    timeoutMs: 50,
    failureRetryDelayMs: 5,
    failuresBeforeDeath: 2,
  });
  await waitFor(() => dead);
  stop();
});

test("startConnectionHeartbeat counts a hanging probe as a failure after the timeout", async () => {
  let dead = false;
  const stop = startConnectionHeartbeat({
    // Never settles — the shape of an RPC pushed into a zombie socket.
    ping: () => new Promise(() => {}),
    onConnectionDead: () => {
      dead = true;
    },
    intervalMs: 5,
    timeoutMs: 10,
    failureRetryDelayMs: 5,
    failuresBeforeDeath: 2,
  });
  await waitFor(() => dead);
  stop();
});

test("startConnectionHeartbeat keeps running while probes succeed", async () => {
  let probes = 0;
  let dead = false;
  const stop = startConnectionHeartbeat({
    ping: () => {
      probes += 1;
      return Promise.resolve("ok");
    },
    onConnectionDead: () => {
      dead = true;
    },
    intervalMs: 5,
    timeoutMs: 50,
    failuresBeforeDeath: 2,
  });
  await delay(40);
  assert.ok(probes >= 2, `expected several probes, got ${probes}`);
  assert.equal(dead, false);
  stop();
});

test("startConnectionHeartbeat probes immediately when the wake-up listener fires", async () => {
  let wakeListener: (() => void) | undefined;
  let dead = false;
  const stop = startConnectionHeartbeat({
    ping: () => Promise.reject(new Error("down")),
    onConnectionDead: () => {
      dead = true;
    },
    // Long enough that only the wake-up probe can drive the outcome in time.
    intervalMs: 60_000,
    timeoutMs: 20,
    failureRetryDelayMs: 5,
    failuresBeforeDeath: 2,
    onWakeUp: (listener) => {
      wakeListener = listener;
      return () => {
        wakeListener = undefined;
      };
    },
  });
  assert.ok(wakeListener, "wake-up subscription missing");
  wakeListener!();
  await waitFor(() => dead);
  stop();
});
