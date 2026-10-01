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
- Global rows retain live
  unning state instead of being flattened to idle.
- Runtime and pending-interaction changes propagate through the global workspace-event observer.
- Pinning a session keeps it visible in the global Pinned section, including sessions from other workspaces.
- Opening an already-discovered workspace does not create duplicate global rows.
- Existing workspace-scoped task/controller behavior remains unchanged.
- Approval commands continue through the existing owner/lease path.

### PATCH-ZCODE-IPAD-IPHONE-FOCUS-ZOOM

**Area:** mobile chat prompt focus behavior.

**Status:** active and physically verified by the user on iPhone/iPad.

**Source files:**

- packages/ui/src/styles.css
- packages/ui/src/LexicalChatInput.tsx (selector target)

**Protected behavior:**

- On touch/coarse-pointer devices, the editable chat prompt uses a 16px font size when focused.
- Prevents iOS Safari from automatically zooming the page when the prompt receives focus.
- Desktop typography and viewport zoom behavior are unchanged.
- No global user-scalable=no viewport restriction is used.

### PATCH-ZCODE-MOBILE-SIDEBAR

**Area:** mobile/iPhone Sidebar interaction and layout.

**Status:** active and physically verified by the user.

**Source files:**

- packages/ui/src/app-shell/WorkspaceShellLayout.tsx
- packages/ui/src/DesktopTopOverlayActionButton.tsx
- packages/ui/src/DesktopTopOverlay.tsx

**Protected behavior:**

- Portrait Sidebar toggle opens/closes reliably by touch.
- Left-edge finger swipe opens the existing Sidebar.
- Swipe starts near the left edge and uses horizontal-distance thresholds.
- Vertical scrolling remains usable.
- Mobile Sidebar pushes the New Session/content area instead of overlaying it.
- New Session keeps viewport-sized layout width instead of flex-shrinking.
- The toggle touch target is not covered by a full-height edge hit zone.
- Desktop behavior remains outside phone-specific rules.
- No second Sidebar, session, or state store is introduced.

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

One-off implementation plans, temporary test files, build logs, and generated output should not be kept as permanent project documentation.
