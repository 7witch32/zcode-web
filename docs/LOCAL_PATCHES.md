# Local Patch Registry - ZCode Web

> Single source of truth for repository-local behavior that must survive upstream ZCode updates.

## Repository state

- Workspace: D:\\Drive\\MY\\viteWorkspace\\zcode-docker
- Runtime: Docker WebUI (zcode-web)
- Public WebUI: host port 3030
- Persistent application state: /data
- Docker control path: internal zcode-docker-api-proxy

## Active local patches

### PATCH-ZCODE-GLOBAL-SESSIONS

**Area:** global Sidebar session discovery and cross-session runtime status.

**Status:** active and verified on the current deployment.

**Source files:**

- packages/services/src/session/taskIndexRepo.ts
- packages/services/src/session/zcodeTaskListTypes.ts
- packages/services/src/session/zcodeTaskService.ts
- packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts
- packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts
- packages/ui/src/hooks/useGlobalTaskList.ts
- packages/ui/src/hooks/useGroupedTaskView.ts
- packages/ui/src/WorkspaceSidebar.tsx
- packages/ui/src/WorkspacePinnedTasksSection.tsx

**Protected behavior:**

- Persisted active sessions from historical/unopened workspaces appear in the global Sidebar after cold start.
- Global rows retain live running state instead of being flattened to idle: while the runtime meta says running, the row carries a running activity sidecar so the leading spinner renders (persisted DB status=running alone never spins — stale-run guard).
- Runtime and pending-interaction changes propagate through the global workspace-event observer; live-meta state is reconciled on every (re)subscription so a dead ingest cannot keep overriding DB rows.
- Pinning a session keeps it visible in the global Pinned section, including sessions from other workspaces.
- Opening an already-discovered workspace does not create duplicate global rows.
- Existing workspace-scoped task/controller behavior remains unchanged.
- Approval commands continue through the existing owner/lease path.
- Settings-driven task auto-archive triggers from grouped sidebar loads on BOTH lanes: the global lane widens the query to all indexed workspaces but the archive set stays `workspaceScopes` (the open tabs), so unopened directories are never archived behind the user's back.
- The window-controller live lane is desktop-only: `IPlatformService.platformKind === "web"` skips the controller registry entirely, so the web client never subscribes to the unregistered `window-controller` channel (the server used to log "Unknown channel: window-controller" on every page load; the direct zcode-task query fallback is the web behavior by design).

**Known limitations:**

- Live status only covers workspaces the syncer has ingested since process start; rows for other directories show persisted state (best-effort by design — the sidebar must not activate runtimes just to discover sessions).

### PATCH-ZCODE-WEB-SETTINGS

**Area:** Settings UI on the web deployment — persistence, phone layout, and touch interaction.

**Status:** active; phone layout verified via checklist (testing/test-iphone-settings.md), physical device verification pending.

**Source files:**

- docker-compose.yml (zcode-home volume → /home/node/.zcode)
- packages/shared/src/platform.ts (IPlatformService.platformKind)
- packages/web/src/main.tsx (createWebPlatform)
- packages/desktop/src/renderer/src/desktopPlatform.ts (createDesktopPlatform)
- packages/ui/src/hooks/useGlobalTaskList.ts (web gate for the window-controller lane)
- packages/ui/src/hooks/useIsCoarsePointerDevice.ts
- packages/ui/src/SettingsPage.tsx (SettingsSectionChipNav, phone grid)
- packages/ui/src/settings/SettingsPageParts.tsx (SettingsRow stacking)
- packages/ui/src/settingsPageHelpers.tsx (control widths, web storage row)
- packages/ui/src/settings/DataBaseDirControl.tsx
- packages/ui/src/styles.css (settings input focus-zoom guard)
- packages/ui/src/settings/settingsSectionChipItems.ts (+ test)
- packages/ui/src/settings/model-provider-section/SectionLayout.tsx, Navigation.tsx
- packages/ui/src/settings/ShortcutSettingsSection.tsx, ShortcutBindingRow.tsx, ShortcutSearchBar.tsx
- packages/ui/src/settings/McpSettingsSection.tsx, MigrationCandidatesCard.tsx, PluginStoreDetailView.tsx, SkillsSection.tsx, saved-workflows/SavedWorkflowArgsTable.tsx, usage-stats/CodingPlanUsageBarChart.tsx, model-provider-section/ProviderModelReasoningLevelEditor.tsx

**Protected behavior:**

- Server-side `setting.json` lives on the `zcode-home` Docker volume, so all UI settings (task auto-archive, locale, proxies, shortcut bindings, interaction behavior, ...) survive container recreates. Never delete the `zcode-home` volume during rebuilds.
- Shortcut bindings are server-global on web: an edit from any device applies to every device connected to the same server after its next page load (no live push).
- On phones (<768px) the Settings page replaces the 68px icon rail with a horizontal scrollable chip bar (full labels, back button, Onboard chip at the end) built from the same `createSettingsPageConfig` output as the desktop sidebar; ≥768px is unchanged.
- `SettingsRow` stacks label above control below 640px; fixed-width controls (260/320px selects, data-dir control) shrink to the container instead of being clipped by the card.
- Settings inputs/textareas use `--text-mobile-input-safe` on coarse-pointer devices (no iOS focus zoom) via the `.zcode-settings-page` scope.
- The General → data directory row shows a read-only "managed by the server environment" note on web instead of Browse (no-op) / Save (server-side copy with no restart flow).
- Keyboard Shortcuts stays available on touch: record buttons remain enabled (iOS Safari delivers real keydown from a connected Bluetooth keyboard, same as Mac), with an external-keyboard hint and a tappable cancel button while recording; rows reflow to two lines below 768px.
- The model-provider nested nav becomes a horizontal chip scroller on phones; drag-reorder is disabled there (touch scroll wins), reorder stays desktop-only.
- P2 mobile fixes: hover-only chip delete is touch-visible, MCP authorization button label always visible, Migration/Plugin-store-details/Skills grids collapse on narrow screens, SavedWorkflowArgsTable scrolls horizontally, usage chart tooltip shrinks on phones.

**Known limitations:**

- Web menu-channel shortcuts (new task, open/close workspace, zoom) stay disabled by design: the web root fallback listener hard-codes Cmd/Ctrl+N and Cmd/Ctrl+O, so those rows render as desktopOnly.
- Shortcut edits do not live-push to other devices; each device picks them up on next page/settings load.
- Model-provider drag-reorder is unavailable on phones (sensor-free DnD to avoid fighting the chip scroller).
- `systemService.info` reports the server's home dir on web; the data-directory row therefore shows no path there — the effective root is the server's `ZCODE_DATA_BASE_DIR` (/data in this deployment).

### PATCH-ZCODE-WEB-CONN-LIVENESS

**Area:** web client RPC liveness — fail-closed on socket death, connection-lost recovery screen, zombie-connection heartbeat.

**Status:** active; root cause of "settings form stuck on Saving... forever" (e.g. Subagents save). Verified via unit tests + browser simulation (container restart mid-session).

**Source files:**

- packages/client/src/websocket.ts (connectViaSocket: socket close → ChannelClient.dispose)
- packages/client/src/connectionHeartbeat.ts (+ test)
- packages/client/src/index.ts (exports)
- packages/client/package.json (test script)
- packages/web/src/main.tsx (WebConnectionLostScreen, heartbeat wiring)

**Protected behavior:**

- When the WebSocket dies (close or error event), the `ChannelClient` is disposed, so every in-flight and subsequent RPC rejects immediately with "WebSocket connection closed" instead of hanging forever. UI awaits settle, `finally` blocks run, buttons un-stick, errors toast.
- The web app renders a connection-lost screen (en/zh/th) with a manual Reload button and auto-reload after 5s; if the server is still gone the reload lands on the bootstrap error screen, which never auto-reloads (no loop).
- A heartbeat probes `settingService.get()` every 15s (8s probe timeout) and declares death after 2 consecutive failures; a failed probe retries after 3s; returning to a visible tab probes immediately (`visibilitychange`), which catches the phone-unlock/laptop-wake zombie case within seconds.
- The heartbeat never fires the death path on a healthy server (probes are sub-millisecond; two 8s timeouts in a row means the transport is unusable).

**Known limitations:**

- Between connection death and detection there is a bounded blind window (close event: immediate; zombie: up to ~2 probe cycles) — a save fired inside that window settles as an error toast once detection lands, or the page reloads; the request itself is never delivered server-side (no partial write, by design of the RPC layer).
- `connectViaProtocol` (protocol-only, no socket) still cannot fail closed — it has no close signal; all web/WS paths go through `connectViaSocket`.
- Desktop IPC transport (`getDelayedChannel`) is a separate architecture and intentionally untouched.

### PATCH-ZCODE-SETTINGS-FAILURE-FEEDBACK

**Area:** Settings surface failure handling — confirm-dialog queueing, load-failure error UI, and save-failure feedback.

**Status:** active; fixes found by the settings pending-state/confirm-dialog audit (companion to PATCH-ZCODE-WEB-CONN-LIVENESS: after RPCs reject instead of hanging, rejections must be visible and must not strand UI states).

**Source files:**

- packages/ui/src/store/confirmDialogStore.ts (+ test)
- packages/ui/src/ConfirmDialog.tsx (host unmount → dismissAllPending)
- packages/ui/src/settings/usePluginUninstall.ts (confirmUninstall try/finally)
- packages/ui/src/store/mcpStore.ts (lastLoadError, persist rethrow, awaited delete)
- packages/ui/src/store/pluginManagementStoreLoading.ts (error cleared on successful load)
- packages/ui/src/settings/McpSettingsSection.tsx (load-error banner + Retry; save/delete toasts)
- packages/ui/src/SettingsPage.tsx (runToastableSettingsActionAsync; usage provider error/retry wiring)
- packages/ui/src/settings/UsageStatsSection.tsx, usage-stats/CodingPlanUsagePanel.tsx (provider-settings error branch)
- packages/ui/src/settings/PluginsSection.tsx (store error banner)
- packages/ui/src/settings/ShortcutSettingsSection.tsx (persist failure toast + refresh resync)

**Protected behavior:**

- A confirm request arriving while another dialog is open is QUEUED and shown after the current one settles — never silently resolved as "dismiss" (which used to cancel saves/deletes/model picks with no feedback).
- ConfirmDialogHost unmount settles all pending+queued requests as "dismiss", so callers can never hang and later dialogs can never be poisoned.
- MCP config load failure renders a visible error + Retry (manual refresh) instead of an endless loading spinner; `lastLoadError` is cleared at each load attempt and set only for real failures (remote-disconnect timing errors stay excluded).
- MCP save/delete rejections surface as toasts and keep the form/row in place: `persistScopedChange` rethrows, `deleteScopedMcpServer` awaits persist before removing the row locally; preload fire-and-forget callers keep their own `.catch`.
- Plugin store load/operation failures render an error banner in PluginsSection (previously looked like "no plugins installed"); a successful reload clears the banner.
- Provider-settings read failure on Usage → Coding Plan shows an error + Retry state (error is no longer bucketed as loading, which previously showed the loading empty state forever); other consumers of the same flag are unchanged.
- Generic settings switches/save buttons toast "could not be saved" on rejection while still reverting to the true state (the wrapper rethrows so trailing setState stays skipped); the data-directory change keeps its own dedicated error UI and does not double-toast.
- Shortcut binding persist failures toast and refresh the settings store so optimistic UI resyncs to the server truth.

**Known limitations:**

- The toastable wrapper rethrows after toasting, so `void`-called handlers still produce a console-level unhandled rejection (invisible to users; matches the pre-existing pattern in this surface).

### PATCH-ZCODE-IPAD-IPHONE-FOCUS-ZOOM

**Area:** mobile chat prompt focus behavior.

**Status:** active and physically verified by the user on iPhone/iPad.

**Source files:**

- packages/ui/src/styles.css
- packages/ui/src/LexicalChatInput.tsx (selector target)
- packages/ui/src/SettingsPage.tsx (`.zcode-settings-page` scope, see PATCH-ZCODE-WEB-SETTINGS)

**Protected behavior:**

- On touch/coarse-pointer devices, the editable chat prompt uses a 16px font size when focused (via the `--text-mobile-input-safe` design token, per DESIGN.md).
- The same guard covers `input`/`textarea` inside the Settings page (`.zcode-settings-page`), so proxy paths, terminal font, marketplace URL, MCP/hook forms etc. do not trigger iOS focus zoom either.
- Prevents iOS Safari from automatically zooming the page when the prompt receives focus.
- Desktop typography and viewport zoom behavior are unchanged.
- No global user-scalable=no viewport restriction is used.

### PATCH-ZCODE-MOBILE-SIDEBAR

**Area:** mobile/iPhone Sidebar interaction and layout.

**Status:** active and physically verified by the user.

**Source files:**

- packages/ui/src/app-shell/WorkspaceShellLayout.tsx
- packages/ui/src/app-shell/phoneSidebarSwipe.ts
- packages/ui/src/DesktopTopOverlayActionButton.tsx
- packages/ui/src/DesktopTopOverlay.tsx

**Protected behavior:**

- Portrait Sidebar toggle opens/closes reliably by touch.
- Left-edge finger swipe opens the existing Sidebar.
- Swipe left over the open Sidebar closes it; a click synthesized right after that swipe is suppressed once, so closing never also activates the row under the finger.
- Selecting/opening a session (including from cross-project groups) closes the phone Sidebar so the content takes focus.
- Swipe starts near the left edge and uses horizontal-distance thresholds with tilt rejection (vertical scrolling never toggles).
- Vertical scrolling remains usable.
- Mobile Sidebar pushes the New Session/content area instead of overlaying it.
- New Session keeps viewport-sized layout width instead of flex-shrinking.
- The toggle touch target is not covered by a full-height edge hit zone.
- Desktop behavior remains outside phone-specific rules.
- No second Sidebar, session, or state store is introduced.

**Known limitations / implementation notes:**

- The JS phone breakpoint (`PHONE_SIDEBAR_MEDIA_QUERY`) must stay in sync with Tailwind's `max-md` variant (width < 768px).
- One gesture system per device: the PointerEvent path is primary; the legacy touch path only runs where `window.PointerEvent` is unavailable. Single-toggle safety relies on pointerup firing before touchend plus the render-body ref sync in WorkspaceShellLayout (see comment there).
- The edge-swipe start zone (first 24px) overlaps the iOS system edge-back gesture; web content cannot intercept it, so the system gesture may win at the very screen edge. Verify on device.
- Sidebar width is clamped to the viewport on phones and the resize separator is hidden there.
- Closing an open sidebar on workspace switch is intentional (each workspace starts with the sidebar closed on phones).

### PATCH-ZCODE-WEB-PUSH-NOTIFICATIONS

**Area:** server-authoritative Web Push notifications for iPhone/iPad Home Screen web apps.

**Status:** active and physically verified by the user (Test push displays on iPhone, 2026-10-01).

**Source files:**

- packages/server/src/push/webPushService.ts
- packages/server/src/push/pushSubscriptionStore.ts
- packages/server/src/http.ts (push routes, sw.js/manifest no-cache, .webmanifest MIME)
- packages/services/src/notifications/notificationEventService.ts
- packages/services/src/notifications/notificationEventBus.ts
- packages/services/src/node.ts (notification service wiring)
- packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts (terminal/interaction events, markSessionActive)
- packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts (markSessionActive call)
- packages/shared/src/notification-events.ts
- packages/ui/src/lib/webPushNotifications.ts
- packages/ui/src/settingsPageHelpers.tsx (push settings row)
- packages/web/public/sw.js
- packages/web/public/manifest.webmanifest
- packages/web/public/icons/ (192/512/apple-touch-icon)
- packages/web/index.html (manifest link, apple-touch-icon)
- packages/web/src/main.tsx (SW registration with updateViaCache: "none")
- docker-compose.yml (ZCODE*PUSH*\* env vars)

**Protected behavior:**

- Task terminal/interaction transitions produce notification events at the authoritative task-index boundary, not from renderer observation.
- Push delivery requires ZCODE_PUSH_ENABLED=true plus VAPID env vars; all /api/push/\* routes require server auth (503 when auth is unset).
- sw.js and manifest are always served with Cache-Control: no-cache (a 1-year immutable cache previously kept devices on a stale service worker forever).
- sw.js parses PushMessageData.text() synchronously per current spec (legacy Promise-returning implementations are also tolerated); payload rejected over 3500 bytes.
- The service worker reports push lifecycle (push_received/payload_invalid/notification_shown/show_failed) back to POST /api/push/diagnostic; the last report is shown per device in Settings.
- Notifications are gated on the Home Screen web app for Apple mobile devices; VAPID rotation requires re-adding the Home Screen app.

### PATCH-ZCODE-WEB-AUTH-SCREEN

**Area:** web UI server-token authentication flow.

**Status:** active on the current deployment (HTTPS via Tailscale).

**Source files:**

- packages/server/src/http.ts (/auth/bootstrap route, token cookie, timingSafeEqual, per-IP failure throttle, startup warning without token)
- packages/web/src/main.tsx (WebServerAuthScreen, ensureWebServerAuthenticated, ?token= auto-submit)

**Protected behavior:**

- When ZCODE*SERVER_AUTH_TOKEN is set, /api/* and /ws\_ require the zcode_lite_token cookie or ?token= query.
- The auth screen posts the token once to /auth/bootstrap; the token is kept only in an HttpOnly cookie (never localStorage or logs).
- The token cookie carries Secure only on HTTPS requests; plain-HTTP LAN access still completes authentication.
- Opening the site with ?token=<server token> auto-authenticates and strips the token from the URL.
- Failed bootstrap attempts are throttled per IP (10 failures → 60s block) and compared in constant time.

## Verification requirements

For changes touching these patches:

1. Run formatting for changed source files.
2. Run TypeScript typecheck.
3. Run lint and distinguish existing warnings from new errors.
4. Rebuild/recreate zcode-web when source changes are deployed.
5. Verify zcode-web is healthy and http://localhost:3030/ returns HTTP 200.
6. Physically verify mobile interactions on iPhone/iPad when the change affects touch, focus, or layout behavior.
7. Never reset or delete /data during rebuild/recreate.

## Current verification record

The latest deployment containing the global session/status changes, mobile focus-zoom fix, and global pinned-session fix was rebuilt and recreated successfully.

- Typecheck: PASS.
- Lint: PASS with 0 errors and existing warnings.
- Formatting: PASS.
- Docker image rebuild: PASS.
- zcode-web: healthy.
- WebUI HTTP 200: PASS.
- User physical verification: both reported bugs are resolved.

## Upgrade guidance

Before updating the upstream ZCode source:

1. Review this registry and docs/GLOBAL_SESSION_SIDEBAR_SPEC.md.
2. Inspect overlapping upstream changes in the listed source files.
3. Re-apply protected behavior deliberately if upstream has not replaced it natively.
4. Re-run the relevant physical iPhone/iPad checks.
5. Rebuild/recreate only the application container; never delete/reset /data.
6. Update this registry if behavior or source ownership changes.

## Related documentation

- docs/GLOBAL_SESSION_SIDEBAR_SPEC.md - durable architecture/specification for global session discovery.
- docs/SETUP_AND_PATCH_GUIDE.md - setup, build, verification, and upgrade workflow.
- docs/DOCKER_PROXY_PLAN.md - Docker API Proxy design/reference.
- docs/PUSH_NOTIFICATION_SETUP.md / \_TROUBLESHOOTING.md / \_ARCHITECTURE.md / \_ISSUE_HISTORY.md - web push design, operations, and debugging history.

One-off implementation plans, temporary test files, build logs, and generated output should not be kept as permanent project documentation.
