import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStorage } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TITLE_MAX_LENGTH = 200;

function validateTitle(raw) {
  if (typeof raw !== "string") return "title must be a string";
  const title = raw.trim();
  if (title.length === 0) return "title must not be empty";
  if (title.length > TITLE_MAX_LENGTH) {
    return `title must be at most ${TITLE_MAX_LENGTH} characters`;
  }
  return null;
}

export function createApp({ dataFile } = {}) {
  const app = express();
  const storage = createStorage({ dataFile });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/favicon.ico", (_req, res) => {
    res.type("image/svg+xml").sendFile(path.join(__dirname, "..", "public", "favicon.svg"));
  });

  app.get("/api/tasks", async (_req, res) => {
    const tasks = await storage.list();
    res.json({ tasks });
  });

  app.post("/api/tasks", async (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "request body must be a JSON object" });
    }
    const titleError = validateTitle(body.title);
    if (titleError) return res.status(400).json({ error: titleError });
    const task = await storage.add({ title: body.title.trim() });
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "request body must be a JSON object" });
    }
    const hasTitle = "title" in body;
    const hasCompleted = "completed" in body;
    if (!hasTitle && !hasCompleted) {
      return res
        .status(400)
        .json({ error: "provide at least one of: title (string), completed (boolean)" });
    }
    if (hasTitle) {
      const titleError = validateTitle(body.title);
      if (titleError) return res.status(400).json({ error: titleError });
    }
    if (hasCompleted && typeof body.completed !== "boolean") {
      return res.status(400).json({ error: "completed must be a boolean" });
    }
    const patch = {};
    if (hasTitle) patch.title = body.title.trim();
    if (hasCompleted) patch.completed = body.completed;
    const task = await storage.update(req.params.id, patch);
    if (!task) return res.status(404).json({ error: "task not found" });
    res.json(task);
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const removed = await storage.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: "task not found" });
    // Chromium marks empty 204 responses over keep-alive as net::ERR_ABORTED,
    // so respond with a small 200 body instead.
    res.json({ deleted: true });
  });

  return app;
}
