# Test Protocol — Mini Task Manager

- **Project path:** `/workspace/test-tools`
- **Run command:** `npm start` (http://localhost:3000)
- **Automated tests:** `npm test` (API), `node tests/e2e.mjs` (browser E2E)
- **Lint:** `npm run lint`
- **Date:** 2026-09-29
- **Environment:** Node v24.21.0, npm 11.19.0, Chromium 154.0.8037.57, Linux (WSL2), sandbox sets `PORT=3030` (project uses `MTM_PORT`)

Status legend: `✅` = verified by Agent via real execution (evidence in "Agent Verification") · `⏳` = pending user verification (requires human/visual judgement or the user's own machine).

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification | Status |
|---|---|---|---|---|---|
| Open app at `/` | UI | Page loads, title "Mini Task Manager", empty state visible | Chromium loaded page; h1 correct; empty state visible with "No tasks yet…" message | Open http://localhost:3000 and confirm the page renders | ✅ |
| Static assets served | API/UI | `/styles.css`, `/app.js`, `/favicon.svg` return 200 with correct content types | GET each: 200 `text/css`, `application/javascript`, `image/svg+xml` | — | ✅ |
| Add task (valid title) | UI | Task appears in list, input clears, counter shows "1 item left" | Typed "Buy groceries", clicked Add: task rendered, input cleared, counter "1 item left" | Add a task and watch it appear | ✅ |
| Add task via API | API | `POST /api/tasks` → 201 with `{id,title,completed:false,createdAt}` | curl-equivalent via Node fetch: 201 + correct shape; persists to JSON file on disk | — | ✅ |
| Read tasks via API | API | `GET /api/tasks` → 200 `{tasks:[...]}` | 200 with created task listed (fresh store returns `{tasks:[]}`) | — | ✅ |
| Add with empty/whitespace title | UI | Client-side validation error shown, no request-side crash | Clicked Add on empty input: `#form-error` visible with message | Try clicking Add with an empty input | ✅ |
| Add with empty/non-string title via API | API | `POST` → 400 `{error}` for `""`, `"   "`, `42`, `null`, missing | All 5 variants returned 400 with error messages | — | ✅ |
| Title > 200 chars via API | API | `POST` → 400 | 201-char title returned 400 | — | ✅ |
| Complete task (checkbox) | UI | Item gets completed style, counter → "0 items left" | Clicked checkbox: `.completed` class applied, counter "0 items left"; PATCH confirmed server-side | Tick a task's checkbox | ✅ |
| Update completed state via API | API | `PATCH /api/tasks/:id {completed:true}` → 200, persisted | 200 with `completed:true`; GET reflects change; also PATCH title → 200 | — | ✅ |
| Filter: Completed | UI | Only completed tasks shown | Task visible under Completed filter after completing it | Click each filter tab and compare lists | ✅ |
| Filter: Active | UI | Only uncompleted tasks shown; per-filter empty state when none | Active filter showed empty state "No active tasks." | Click each filter tab and compare lists | ✅ |
| Delete task via UI | UI | Task disappears; empty state returns | Clicked Delete: list empty again, "No completed tasks." empty state shown | Delete a task and confirm it disappears | ✅ |
| Delete task via API | API | `DELETE /api/tasks/:id` → 200 `{deleted:true}`; 404 for unknown id | 200 on delete; 404 on unknown UUID; GET after delete returns empty list | — | ✅ |
| Empty state (initial) | UI | Visible with helpful message on first load | Verified "No tasks yet. Add your first one above!" | Open app with no tasks | ✅ |
| Empty state (per filter) | UI | Message adapts to current filter | All/Active/Completed variants all asserted in E2E | Switch filters with empty lists | ✅ |
| Remaining-items counter | UI | Counts uncompleted tasks, singular/plural correct | "1 item left" → "0 items left" transitions verified | Add/complete tasks and watch counter | ✅ |
| JavaScript errors | UI | None in console | Puppeteer `console`/`pageerror` listeners: 0 errors during full workflow | Open DevTools console while using the app | ✅ |
| Failed API requests | UI/API | None | Puppeteer `requestfailed` + `response>=400` listeners: 0 during full workflow | Open DevTools Network tab while using the app | ✅ |
| Responsive layout (mobile 375px) | UI | App fits viewport; toolbar stacks vertically | Viewport 375×667: `.app` width ≤ 375, toolbar `flex-direction: column` | Resize browser to phone width | ✅ |
| Data persistence | API | Tasks survive in `data/tasks.json` (atomic tmp+rename write) | Test asserts on-disk JSON matches created task | Restart `npm start` and confirm tasks remain | ✅ |
| Automated API test suite | API | `npm test` passes | 9/9 pass (`node --test`), exit code 0 | — | ✅ |
| Browser E2E suite | UI | `node tests/e2e.mjs` passes | 22/22 checks pass, exit code 0 | — | ✅ |
| Lint | — | `npm run lint` clean | Exit code 0 | — | ✅ |
| Build | — | N/A by design (vanilla JS, no build step — documented in README) | No build configured; not applicable | — | N/A |
| Git status/diff | — | Would show working-tree state | **Not testable:** `git` binary is not installed in this environment (verified with `which git`; not present system-wide). Recorded as tool limitation. | Run `git status`/`git diff` if you have git locally | ⏳ |
| Subjective visual quality | UI | App looks correct and polished to a human | Agent can only assert DOM/CSS properties, not aesthetics | Review the visual design yourself | ⏳ |

## Notes

- **Browser use (extra verification):** the Agent drove the live app with headless Chromium and captured desktop (1024px) and mobile (375px) screenshots, then visually inspected them. Screenshots confirmed correct layout, filters, counter and completed styling. One rendering caveat: Thai titles display as tofu boxes because the container has **no Thai fonts** (`fc-list`: 6 fonts total, 0 Thai) — the underlying data is correct (DOM and API round-trip match exactly at code-point level). Recorded as an environment limitation in the report, not an app bug.
- `implement_plan.md` and `AGENT.md` referenced in the task do **not exist** in the workspace (searched `/workspace`, `/root`, `/home`, `/tmp`). The tool list from task requirement #4 was used as the testing plan instead; this is recorded as a limitation in the report.
- The full E2E workflow required by the task — *Open app → Add task → Verify task appears → Complete task → Filter Completed → Delete task → Verify task disappears* — is covered by E2E steps [1]–[7] above.
