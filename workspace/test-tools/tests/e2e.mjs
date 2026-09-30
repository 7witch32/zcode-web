// Browser E2E verification for Mini Task Manager.
// Runs a real Chromium (system binary) against a real server instance,
// drives the UI workflow and asserts no console/page/network errors occur.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createApp } from "../src/app.js";

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✔ ${name}`);
  } else {
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

async function startServer() {
  const dataFile = path.join(os.tmpdir(), `mtm-e2e-${process.pid}-${Date.now()}.json`);
  const app = createApp({ dataFile });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://localhost:${server.address().port}`;
  const cleanup = async () => {
    server.close();
    await fs.rm(dataFile, { force: true });
  };
  return { base, cleanup };
}

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

async function waitForItems(page, selector, count) {
  await page.waitForFunction(
    (sel, n) => document.querySelectorAll(sel).length === n,
    { timeout: 5000 },
    selector,
    count,
  );
}

async function run() {
  const { base, cleanup } = await startServer();

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("requestfailed", (request) =>
      failedRequests.push(`${request.url()} ${request.failure()?.errorText}`),
    );
    page.on("response", (response) => {
      if (response.status() >= 400) failedRequests.push(`${response.url()} HTTP ${response.status()}`);
    });

    console.log("\n[1] Open app");
    await page.goto(base, { waitUntil: "networkidle0" });
    check("page loads", page.url().startsWith(base));
    check("h1 shows Mini Task Manager", (await page.$eval("h1", (el) => el.textContent)).includes("Mini Task Manager"));
    const emptyHidden = await page.$eval("#empty-state", (el) => el.hidden);
    const listEmpty = (await page.$$("#task-list .task")).length === 0;
    check("empty state visible on first load", !emptyHidden && listEmpty);
    const emptyText = await page.$eval("#empty-state", (el) => el.textContent);
    check("empty state message mentions no tasks", /no tasks/i.test(emptyText), emptyText);

    console.log("\n[2] Add task");
    await page.type("#new-task-title", "Buy groceries");
    await page.click("#add-button");
    await waitForItems(page, "#task-list .task", 1);
    const title = await page.$eval("#task-list .task .task-title", (el) => el.textContent);
    check("task appears in list", title === "Buy groceries", title);
    const inputCleared = await page.$eval("#new-task-title", (el) => el.value === "");
    check("input cleared after add", inputCleared);
    const counter1 = await page.$eval("#items-left", (el) => el.textContent);
    check("counter shows 1 item left", counter1 === "1 item left", counter1);
    check("empty state hidden after add", await page.$eval("#empty-state", (el) => el.hidden));

    console.log("\n[3] Empty-title add shows validation error");
    await page.click("#add-button");
    const errVisible = await page.$eval("#form-error", (el) => !el.hidden && el.textContent.length > 0);
    check("client-side validation error shown", errVisible);

    console.log("\n[4] Complete task via checkbox");
    await page.click("#task-list .task .task-toggle");
    await page.waitForFunction(
      () => document.querySelector("#task-list .task")?.classList.contains("completed"),
      { timeout: 5000 },
    );
    const counter2 = await page.$eval("#items-left", (el) => el.textContent);
    check("counter shows 0 items left after completing", counter2 === "0 items left", counter2);

    console.log("\n[5] Filter: Completed");
    await page.click('.filter[data-filter="completed"]');
    await waitForItems(page, "#task-list .task", 1);
    const completedVisible = await page.$eval("#task-list .task .task-title", (el) => el.textContent);
    check("completed task visible under Completed filter", completedVisible === "Buy groceries");

    console.log("\n[6] Filter: Active (task hidden there)");
    await page.click('.filter[data-filter="active"]');
    await page.waitForFunction(() => !document.querySelector("#task-list .task"), { timeout: 5000 });
    const activeEmpty = await page.$eval("#empty-state", (el) => el.hidden === false);
    const activeEmptyText = await page.$eval("#empty-state", (el) => el.textContent);
    check("Active filter shows its empty state", activeEmpty && /no active/i.test(activeEmptyText), activeEmptyText);

    console.log("\n[7] Delete task from Completed filter");
    await page.click('.filter[data-filter="completed"]');
    await waitForItems(page, "#task-list .task", 1);
    await page.click("#task-list .task .task-delete");
    await page.waitForFunction(() => !document.querySelector("#task-list .task"), { timeout: 5000 });
    const afterDeleteEmpty = await page.$eval("#empty-state", (el) => !el.hidden);
    check("task disappears and empty state returns", afterDeleteEmpty);

    console.log("\n[8] Second task + All filter + delete there");
    await page.click('.filter[data-filter="all"]');
    await page.type("#new-task-title", "Second task");
    await page.click("#add-button");
    await waitForItems(page, "#task-list .task", 1);
    await page.click("#task-list .task .task-delete");
    await page.waitForFunction(() => !document.querySelector("#task-list .task"), { timeout: 5000 });
    const allEmptyText = await page.$eval("#empty-state", (el) => el.textContent);
    check("All-filter empty state after deleting last task", /no tasks yet/i.test(allEmptyText), allEmptyText);

    console.log("\n[9] Responsive layout (mobile viewport)");
    await page.setViewport({ width: 375, height: 667 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const mobile = await page.evaluate(() => {
      const app = document.querySelector(".app");
      const toolbar = document.querySelector(".toolbar");
      const rect = app.getBoundingClientRect();
      return {
        fitsViewport: rect.width <= 375,
        toolbarDirection: getComputedStyle(toolbar).flexDirection,
      };
    });
    check("app fits 375px viewport", mobile.fitsViewport, `width=${mobile.fitsViewport}`);
    check("toolbar stacks vertically on mobile", mobile.toolbarDirection === "column", mobile.toolbarDirection);
    await page.setViewport({ width: 1024, height: 768 });

    console.log("\n[10] Health checks");
    check("no JavaScript page errors", pageErrors.length === 0, pageErrors.join("; "));
    check("no console errors", consoleErrors.length === 0, consoleErrors.join("; "));
    check("no failed network requests", failedRequests.length === 0, failedRequests.join("; "));
  } finally {
    if (browser) await browser.close();
    await cleanup();
  }

  console.log(
    `\n${failures.length === 0 ? "E2E PASSED" : "E2E FAILED"}: ${failures.length} failure(s)`,
  );
  if (failures.length > 0) process.exit(1);
}

run().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
