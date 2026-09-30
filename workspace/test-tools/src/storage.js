import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_DATA_FILE = path.join(process.cwd(), "data", "tasks.json");

export function createStorage({ dataFile = process.env.DATA_FILE || DEFAULT_DATA_FILE } = {}) {
  let tasks = null;

  async function load() {
    if (tasks) return tasks;
    try {
      const raw = await fs.readFile(dataFile, "utf8");
      const parsed = JSON.parse(raw);
      tasks = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      tasks = [];
    }
    return tasks;
  }

  async function save() {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(tasks, null, 2), "utf8");
    await fs.rename(tmp, dataFile);
  }

  return {
    dataFile,

    async list() {
      return [...(await load())];
    },

    async add({ title }) {
      const all = await load();
      const task = {
        id: crypto.randomUUID(),
        title,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      all.push(task);
      await save();
      return task;
    },

    async update(id, patch) {
      const all = await load();
      const task = all.find((t) => t.id === id);
      if (!task) return null;
      if (typeof patch.title === "string") task.title = patch.title.trim();
      if (typeof patch.completed === "boolean") task.completed = patch.completed;
      await save();
      return { ...task };
    },

    async remove(id) {
      const all = await load();
      const index = all.findIndex((t) => t.id === id);
      if (index === -1) return false;
      all.splice(index, 1);
      await save();
      return true;
    },

    async reset() {
      tasks = [];
      await save();
    },
  };
}
