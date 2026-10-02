import assert from "node:assert/strict";
import test from "node:test";
import { useConfirmDialogStore } from "../src/store/confirmDialogStore.js";

function resetStore(): void {
  useConfirmDialogStore.setState({ pendingRequest: undefined, queuedRequests: [] });
}

test("requestChoice resolves with the user's choice via settleChoice", async () => {
  resetStore();
  const pending = useConfirmDialogStore.getState().requestChoice({ title: "first" });
  assert.equal(useConfirmDialogStore.getState().pendingRequest?.title, "first");
  useConfirmDialogStore.getState().settleChoice("confirm");
  assert.equal(await pending, "confirm");
  assert.equal(useConfirmDialogStore.getState().pendingRequest, undefined);
});

test("requestChoice queues behind an open dialog instead of silently dismissing", async () => {
  resetStore();
  const first = useConfirmDialogStore.getState().requestChoice({ title: "first" });
  const second = useConfirmDialogStore.getState().requestChoice({ title: "second" });
  assert.equal(useConfirmDialogStore.getState().pendingRequest?.title, "first");
  assert.equal(useConfirmDialogStore.getState().queuedRequests.length, 1);

  // 旧实现此处 second 会立刻以 "dismiss" 结算（调用方的操作被静默取消）；
  // 现在它必须仍然挂起，直到第一个弹窗结算并被晋升。
  useConfirmDialogStore.getState().settleChoice("confirm");
  assert.equal(await first, "confirm");
  assert.equal(useConfirmDialogStore.getState().pendingRequest?.title, "second");

  useConfirmDialogStore.getState().settleChoice("cancel");
  assert.equal(await second, "cancel");
  assert.equal(useConfirmDialogStore.getState().pendingRequest, undefined);
  assert.equal(useConfirmDialogStore.getState().queuedRequests.length, 0);
});

test("requestConfirmation maps the choice to a boolean", async () => {
  resetStore();
  const confirmed = useConfirmDialogStore.getState().requestConfirmation({ title: "delete?" });
  useConfirmDialogStore.getState().settleChoice("confirm");
  assert.equal(await confirmed, true);
});

test("dismissAllPending resolves the open dialog and every queued request", async () => {
  resetStore();
  const first = useConfirmDialogStore.getState().requestChoice({ title: "first" });
  const second = useConfirmDialogStore.getState().requestChoice({ title: "second" });
  const third = useConfirmDialogStore.getState().requestChoice({ title: "third" });
  useConfirmDialogStore.getState().dismissAllPending();
  assert.equal(await first, "dismiss");
  assert.equal(await second, "dismiss");
  assert.equal(await third, "dismiss");
  assert.equal(useConfirmDialogStore.getState().pendingRequest, undefined);
  assert.equal(useConfirmDialogStore.getState().queuedRequests.length, 0);
});

test("settleChoice with nothing pending is a no-op", () => {
  resetStore();
  useConfirmDialogStore.getState().settleChoice("confirm");
  assert.equal(useConfirmDialogStore.getState().pendingRequest, undefined);
  assert.equal(useConfirmDialogStore.getState().queuedRequests.length, 0);
});
