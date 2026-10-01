import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PushSubscriptionStore } from "../src/push/pushSubscriptionStore.ts";

test("push subscription store persists, updates, and revokes devices", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-push-test-"));
  const path = join(root, "subscriptions.json");
  try {
    const store = new PushSubscriptionStore(path);
    const first = await store.upsert({
      endpoint: "https://push.example.test/device-1",
      keys: { p256dh: "public-key", auth: "auth-key" },
      deviceName: "iPhone",
    });
    assert.equal((await store.list()).length, 1);
    assert.equal(first.deviceName, "iPhone");

    await store.upsert({
      deviceId: first.deviceId,
      endpoint: "https://push.example.test/device-2",
      keys: { p256dh: "public-key-2", auth: "auth-key-2" },
    });
    assert.equal((await store.list())[0]?.endpoint, "https://push.example.test/device-2");

    assert.equal(await store.revoke(first.deviceId), true);
    assert.equal((await store.list()).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});