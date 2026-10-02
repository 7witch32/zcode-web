# Test: iPhone Sidebar Fix

| Step/Test Case                                    | Type (UI/API/WS) | Expected Result                                                                               | Agent Verification                                                      | User Verification | Status  |
| ------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------- | ------- |
| iPhone Portrait initial view                      | UI               | Sidebar hidden; chat uses full width                                                          | PASS: phone effect closes existing sidebar state                        | ⏳                | PASS\*  |
| iPhone Portrait menu                              | UI               | ☰ opens sidebar (push layout)                                                                | PASS: Web toggle reuses onToggleSidebar                                 | ⏳                | PASS\*  |
| iPhone Portrait sidebar close                     | UI               | Sidebar closes without layout break                                                           | PASS: same state toggle + push layout                                   | ⏳                | PASS\*  |
| iPhone Portrait chat width                        | UI               | Chat is not compressed by sidebar                                                             | PASS: content keeps min-w-[100vw] below 768px                           | ⏳                | PASS\*  |
| Drag from hamburger toggle (top-left)             | UI               | Exactly ONE toggle (no double-toggle)                                                         | PASS: interactive-element guard on touch path + render-body ref sync    | ⏳                | PASS\*  |
| Edge swipe opens sidebar (modern iOS)             | UI               | Opens once; pointer path is the only active gesture system                                    | PASS: touch path gated behind `window.PointerEvent`                     | ⏳                | PASS\*  |
| Swipe left over open sidebar closes it            | UI               | Closes once; vertical scroll inside the sidebar never closes                                  | PASS: shared threshold decision (phoneSidebarSwipe.test.ts)             | ⏳                | PASS\*  |
| Swipe ending on a session row                     | UI               | Sidebar closes; the row underneath is NOT activated                                           | PASS: one-shot click guard (onClickCapture)                             | ⏳                | PASS\*  |
| Selecting a session on phone                      | UI               | Sidebar closes and the session opens in the content area                                      | PASS: close hook in handleSelectTaskInChat (breakpoint+visibility refs) | ⏳                | PASS\*  |
| Auto-archive on grouped sidebar load              | API              | Stale completed tasks of OPEN workspaces archive per settings; unopened directories untouched | PASS: runWorkspaceTaskAutoArchive runs on both lanes                    | ⏳                | PASS\*  |
| iOS system edge-back from screen edge             | UI               | System gesture may win; sidebar must not half-open or double-fire                             | Known limitation — verify which gesture wins on device                  | ⏳                | PENDING |
| Persisted sidebar width wider than phone viewport | UI               | Sidebar clamped to 100vw, no overflow                                                         | PASS: max-md:max-w-[100vw]                                              | ⏳                | PASS\*  |
| Resize separator on phone                         | UI               | Not visible, not draggable                                                                    | PASS: max-md:hidden + phone guard in resize start                       | ⏳                | PASS\*  |
| Cross-project session running                     | WS               | Spinner shows on sidebar rows of unopened projects; stops on completion                       | PASS: live-meta sidecar merge (globalTaskListLiveMeta.test.ts)          | ⏳                | PASS\*  |
| Waiting badge survives list reload                | WS               | pendingInteraction badge not reverted by reload                                               | PASS: reload merges latest live meta (globalTaskListLiveMeta.test.ts)   | ⏳                | PASS\*  |
| iPad Portrait                                     | UI               | Existing tablet behavior remains intact                                                       | PASS: phone rules stop below 768px                                      | ⏳                | PASS\*  |
| iPad Landscape                                    | UI               | No phone layout                                                                               | PASS: max-md rule not active at 768px+                                  | ⏳                | PASS\*  |
| Desktop regression                                | UI               | Existing sidebar behavior unchanged                                                           | PASS: desktop branch/classes unchanged                                  | ⏳                | PASS\*  |
| Existing ZCode session                            | WS               | Session state is not touched by UI change                                                     | PASS: no session/backend/data code changed                              | ⏳                | PASS\*  |

## Agent verification notes

- Phone breakpoint is `max-md` (width < 768px) in CSS and `PHONE_SIDEBAR_MEDIA_QUERY` in JS — keep them in sync.
- Phone sidebar is a PUSH layout (relative, in the flex flow), not an overlay: opening it displaces the content column.
- The existing sidebar toggle handler is reused; edge swipe is a threshold toggle (start ≤ 24px, trigger ≥ 48px, tilt rejected).
- One gesture system per device: PointerEvent path is primary; the legacy touch path only runs when `window.PointerEvent` is unavailable.
- Known limitation: the 24px edge-swipe start zone overlaps the iOS system edge-back gesture; web content cannot intercept it. Verify on device which gesture wins.
- Swipe-to-close starts anywhere over the open sidebar (including rows/buttons) and suppresses the click that follows it; selecting a session also closes the sidebar.
- No backend/session/provider/Docker data files are changed.

\*PASS means static/code-level verification only; physical iPhone/iPad confirmation remains pending.
