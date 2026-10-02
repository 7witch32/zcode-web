import assert from "node:assert/strict";
import test from "node:test";
import { connectViaSocket } from "../src/websocket.js";
import { createFakeSocket } from "./fakeSocket.js";

test("connectViaSocket fails closed: an in-flight call rejects when the socket closes", async () => {
  const socket = createFakeSocket();
  const accessor = connectViaSocket(socket);
  // The call is queued (the fake server never sends Initialize), then the transport
  // dies — this is the production shape of "Save pressed after the connection died".
  const pending = accessor.subagentsService.list({ workspacePath: "/tmp/fake-workspace" });
  socket.fireClose();
  await assert.rejects(pending, /WebSocket connection closed/);
});

test("connectViaSocket fails closed: a call after socket death rejects instead of hanging", async () => {
  const socket = createFakeSocket();
  const accessor = connectViaSocket(socket);
  socket.fireClose();
  await assert.rejects(
    accessor.subagentsService.list({ workspacePath: "/tmp/fake-workspace" }),
    (error: Error) => /WebSocket connection closed|disposed/.test(error.message),
  );
});
