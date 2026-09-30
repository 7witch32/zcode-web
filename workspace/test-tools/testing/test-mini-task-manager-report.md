# Test Report — Mini Task Manager (End-to-End Agent Tool Test)

- **Date:** 2026-09-29
- **Project path:** `/workspace/test-tools`
- **Run command:** `npm start` → http://localhost:3000 (config: `MTM_PORT`, default 3000; `DATA_FILE`, default `./data/tasks.json`)
- **Environment:** Node v24.21.0 · npm 11.19.0 · Chromium 154.0.8037.57 (system) · Linux x64 (WSL2) · sandbox injects `PORT=3030`

## 1. Stack decision

Express 4 (API + static hosting) · JSON-file storage with atomic write · vanilla JS/CSS frontend (no build step, by design) · `node:test` for API tests · `puppeteer-core` driving the system Chromium for browser E2E · ESLint 9. Dependencies installed from the npm registry (verified working).

## 2. Tools tested and results

Every result below came from actual execution during this session — nothing was simulated.

### 2.1 Passed

| Tool / capability | How it was exercised | Result |
|---|---|---|
| Bash (terminal) | ~25 real commands: scaffolding checks, npm, find/grep, process inspection | ✅ worked throughout |
| Write (create files) | Created `package.json`, `src/storage.js`, `src/app.js`, `server.js`, `public/*`, `tests/*`, `README.md`, `.gitignore`, docs | ✅ all created correctly (verified by running them) |
| Edit (modify files) | 6 edits: `server.js` port fix, `src/app.js` DELETE + favicon, `tests/api.test.js` ×2, `public/index.html` favicon link | ✅ each edit verified by re-running tests |
| Read | Read background-task output log to diagnose server crash | ✅ |
| Search (Bash find/grep) | Located files, scanned for debug code/temp files, HTML element checks | ✅ |
| Agent (Explore subagent) | Delegated code search: POST route + validation location, filter logic, debug-leftover scan | ✅ accurate report (`src/app.js:36-45`, `public/app.js:76-80`, no debug leftovers in `src/`/`public/`) |
| TodoWrite | 11-item task plan maintained across the session | ✅ |
| npm install | Installed express, eslint, puppeteer-core, globals from registry | ✅ |
| Run dev server (background) | `node server.js` as a background task on port 3000 | ✅ |
| Process inspection | `ps aux` confirmed server PID; port checks via Node `net` | ✅ |
| Stop process (TaskStop) | Stopped old server instance before restart after code change | ✅ |
| API calls | Node `fetch` (curl is not installed): all 4 endpoints + validation + 404 paths + on-disk persistence | ✅ |
| Automated tests (`node --test`) | `npm test` | ✅ 9/9 pass |
| Lint (ESLint 9) | `npm run lint` | ✅ exit 0 |
| Browser/UI interaction | Puppeteer + Chromium: full workflow add → complete → filter (Completed, Active, All) → delete → empty states, plus client-side validation error | ✅ 22/22 checks |
| Console/network error checks | Puppeteer `console` (error), `pageerror`, `requestfailed`, `response ≥ 400` listeners | ✅ 0 errors / 0 failed requests in final run |
| Responsive UI | `setViewport(375×667)` + `getComputedStyle` assertions | ✅ app fits 375px, toolbar stacks |
| Root-cause debugging | Two minimal repro scripts against Chromium (204 vs 200 response) | ✅ confirmed root cause of ERR_ABORTED |

### 2.2 Failed / limitations (not silently skipped)

| Tool / capability | Finding |
|---|---|
| **git** (status/diff/init) | **Not testable — binary not installed** anywhere in the environment (verified via `which git` and filesystem search). `git status`/`git diff` cannot be run. A `.gitignore` was still prepared for when git is available. |
| **WebFetch** | **Cannot access localhost** — tool requires a public hostname ("WebFetch requires a public hostname"). Recorded as tool limitation; localhost HTTP covered by Node fetch + Puppeteer instead. |
| **MCP web_reader** | **Rejects localhost URLs** ("Please Enter the Correct URL Format"). Same limitation class as WebFetch. |
| **curl** | Not installed in the environment; substituted with Node's built-in `fetch` (documented, not a failure of the app). |
| **implement_plan.md / AGENT.md** | **Referenced files do not exist** — searched `/workspace`, `/root`, `/home`, `/tmp` (max depth 4); workspace was empty at start. Task requirement #4's tool list was used as the testing plan instead. The "Testing Protocol" of AGENT.md could therefore not be followed literally; the protocol file was created from the task description. |
| **Browser rendering of Thai text** | Screenshots show Thai task titles as tofu boxes (□□□□). Verified **not an app bug**: the typed Thai string round-trips byte-exact through DOM and API (code-point comparison, 12/12 chars match). Root cause is the container: `fc-list` shows only 6 fonts installed, **0 Thai fonts**, so headless Chromium has no Thai glyphs to draw. Fixing needs a system font package (e.g. `fonts-thai-tlwg`, requires root) or bundling a Thai webfont (`@font-face` Noto Sans Thai) — neither in scope. English/Latin rendering is unaffected. |

### 2.3 Not applicable / not exercised (with reasons)

| Tool | Reason |
|---|---|
| Build tooling | Project intentionally has no build step (vanilla JS); documented in README. Nothing to build. |
| WebSearch | No external information was needed to complete the task. |
| CronCreate/CronList/CronUpdate/CronDelete | Scheduling tools — irrelevant to this task and would leave persistent automations behind. |
| Workflow tools (CreateWorkflow, AmendWorkflow, …) | Not requested; no fan-out/multi-agent orchestration justified for a project this small. |
| AskUserQuestion / EnterPlanMode / ExitPlanMode | Autonomous run; planning happened inline per the task's required sequence. |
| Skill tool | No skills registered in this session. |
| SendMessage | No peer agent needed messaging; agent delegation covered by the Explore run. |
| OffPeakCreate/OffPeakList | No deferred work requested. |

## 3. Test results

| Suite | Command | Result |
|---|---|---|
| API tests | `npm test` | ✅ 9/9 passed, 0 failed (add, read, validation ×3, patch, 404s, delete, persistence) |
| Browser E2E | `node tests/e2e.mjs` | ✅ 22/22 checks passed, 0 failures (incl. 0 JS errors, 0 failed requests, responsive) |
| Lint | `npm run lint` | ✅ exit 0 |
| Build | — | N/A by design |
| Final re-run | all three suites re-executed after last fix | ✅ all green |

## 4. Issues found (all discovered by real execution)

1. **Server crash: `EADDRINUSE :::3030`** — the sandbox sets `PORT=3030` for its own supervisor, which already listens on 3030. `server.js` originally read `process.env.PORT`. **Fixed:** project-specific `MTM_PORT` env var (default 3000). Verified by restart + full smoke test.
2. **`npm test` failed: `Cannot find module …/tests`** — `node --test tests/` is not valid on Node 24 (treats the directory as a module). **Fixed:** script changed to `node --test` (auto-discovery). 9/9 pass.
3. **`DELETE` request showed `net::ERR_ABORTED` in Chromium** despite the deletion succeeding server-side. Root-caused with a minimal repro: Chromium 154 marks empty `204` responses over HTTP/1.1 keep-alive as aborted (fetch still resolves with 204). **Fixed:** API now returns `200 {deleted:true}`. Repro with 200 confirmed clean; E2E network checks now 0 failures. (Impact: without the fix, any real console/network monitor would flag failed DELETEs — exactly what this test vehicle is designed to catch.)
4. **`/favicon.ico` 404** — Chrome requests a favicon even without a link tag. **Fixed:** added `public/favicon.svg`, a `<link rel="icon">`, and a `/favicon.ico` route. E2E no longer sees any 4xx.
5. **ESLint failures** — (a) unused variable `t` in a test; (b) `tests/e2e.mjs` uses browser globals (`document`, `getComputedStyle`) inside `page.evaluate()` callbacks, so it needed `globals.browser` merged with node globals. **Fixed both; lint exit 0.**
6. **Temporary debug artifacts** — two `.repro-*.mjs` scripts created during root-cause analysis were deleted after use; final tree is clean (verified by `find`).

## 5. Remaining issues

- None known in the application. All suites pass.
- Environment limitations that cannot be fixed from within the session: `git` not installed (§2.2), WebFetch/web_reader cannot reach localhost (§2.2), `implement_plan.md`/`AGENT.md` missing (§2.2).
- Statuses left `⏳` in the protocol file require human verification (subjective visual quality; git commands if run on the user's own machine).

## 6. Commands used for testing (reference)

```bash
npm install                          # dependency install
npm start                            # dev server on :3000 (background task)
ps aux | grep "node server.js"       # process verification
node -e "…fetch…"                    # API smoke tests (curl unavailable)
npm test                             # 9 API tests (node --test)
npm run lint                         # ESLint 9
node tests/e2e.mjs                   # 22-check browser E2E (puppeteer-core + /usr/bin/chromium)
node /tmp/repro-204.mjs              # minimal repro: Chromium ERR_ABORTED on 204 (deleted after use)
find /workspace /root /home /tmp -name "implement_plan.md" -o -name "AGENT.md"   # missing-files check
grep -rn "console\.log\|debugger\|TODO\|FIXME" src/ public/                      # debug-code scan
```

## 7. Evidence pointers

- **Screenshots** (`testing/screenshots/`, captured and visually inspected by the Agent):
  - `empty-state-desktop.png` — first load, empty state + "0 items left"
  - `desktop-1024-tasks.png` — 3 tasks, middle one completed (checkbox + strikethrough)
  - `desktop-1024-filter-completed.png` — Completed filter showing only the completed task
  - `mobile-375.png` — 375px viewport: stacked toolbar, wrapped task titles
  - `thai-font-rendering-issue.png` — documents the container font limitation (Thai tofu boxes; data verified correct at code-point level)
- E2E output transcript (22 ✔ lines + "E2E PASSED: 0 failure(s)") — produced in session.
- API test summary (`tests 9 / pass 9 / fail 0`) — produced in session.
- Explore agent report — no debug leftovers in `src/`/`public/`.
- Final project tree — 13 files, no temp/debug artifacts; `node_modules/` excluded via `.gitignore`.

## 8. Protocol document

Per-test-case details, evidence and remaining `⏳` user-verification items:
[`testing/test-mini-task-manager.md`](./test-mini-task-manager.md)
