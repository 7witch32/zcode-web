import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";

async function startServer(t) {
  const dataFile = path.join(os.tmpdir(), `mtm-test-${process.pid}-${Date.now()}.json`);
  const app = createApp({ dataFile });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://localhost:${server.address().port}`;
  t.after(() => {
    server.close();
    return fs.rm(dataFile, { force: true });
  });
  return base;
}

async function createTask(base, title) {
  const response = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

test("GET /api/tasks returns an empty list on a fresh store", async (t) => {
  const base = await startServer(t);
  const response = await fetch(`${base}/api/tasks`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tasks: [] });
});

test("POST /api/tasks adds a task and GET returns it", async (t) => {
  const base = await startServer(t);
  const created = await createTask(base, "write tests");
  assert.equal(created.title, "write tests");
  assert.equal(created.completed, false);
  assert.match(created.id, /^[0-9a-f-]{36}$/);

  const response = await fetch(`${base}/api/tasks`);
  const { tasks } = await response.json();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, created.id);
});

test("POST /api/tasks validation rejects empty, whitespace and non-string titles", async (t) => {
  const base = await startServer(t);
  for (const title of ["", "   ", 42, null, undefined]) {
    const response = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    assert.equal(response.status, 400, `expected 400 for title=${JSON.stringify(title)}`);
    const body = await response.json();
    assert.ok(body.error.length > 0);
  }
});

test("POST /api/tasks validation rejects titles over 200 characters", async (t) => {
  const base = await startServer(t);
  const response = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "x".repeat(201) }),
  });
  assert.equal(response.status, 400);
});

test("PATCH /api/tasks/:id updates completed state and title", async (t) => {
  const base = await startServer(t);
  const task = await createTask(base, "patch me");

  const completed = await fetch(`${base}/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).completed, true);

  const renamed = await fetch(`${base}/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "patched" }),
  });
  assert.equal(renamed.status, 200);
  const updated = await renamed.json();
  assert.equal(updated.title, "patched");
  assert.equal(updated.completed, true);
});

test("PATCH /api/tasks/:id validation rejects bad payloads", async (t) => {
  const base = await startServer(t);
  const task = await createTask(base, "validate patch");

  const empty = await fetch(`${base}/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(empty.status, 400);

  const badCompleted = await fetch(`${base}/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: "yes" }),
  });
  assert.equal(badCompleted.status, 400);
});

test("PATCH and DELETE /api/tasks/:id return 404 for unknown ids", async (t) => {
  const base = await startServer(t);
  const missing = "00000000-0000-4000-8000-000000000000";

  const patch = await fetch(`${base}/api/tasks/${missing}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(patch.status, 404);

  const remove = await fetch(`${base}/api/tasks/${missing}`, { method: "DELETE" });
  assert.equal(remove.status, 404);
});

test("DELETE /api/tasks/:id removes the task", async (t) => {
  const base = await startServer(t);
  const task = await createTask(base, "delete me");

  const removed = await fetch(`${base}/api/tasks/${task.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { deleted: true });

  const response = await fetch(`${base}/api/tasks`);
  const { tasks } = await response.json();
  assert.equal(tasks.length, 0);
});

test("tasks persist to the JSON data file", async () => {
  const dataFile = path.join(os.tmpdir(), `mtm-persist-${process.pid}-${Date.now()}.json`);
  const app = createApp({ dataFile });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://localhost:${server.address().port}`;
  try {
    const created = await createTask(base, "persisted");
    const onDisk = JSON.parse(await fs.readFile(dataFile, "utf8"));
    assert.equal(onDisk.length, 1);
    assert.equal(onDisk[0].id, created.id);
  } finally {
    server.close();
    await fs.rm(dataFile, { force: true });
  }
});
