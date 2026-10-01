# iPhone Portrait Sidebar Fix — Recovery Plan

**Status:** Implemented — verification pending user device check
**Date:** 2026-09-30
**Project:** ZCode Docker/WebUI

## 1. Background

The ZCode WebUI previously had a successful iPhone Portrait sidebar fix. The user
personally tested the result and confirmed that the behavior worked in practice.

The current repository source was freshly loaded from upstream, so the React/CSS
changes from that tested fix are no longer present. This plan is for reconstructing
that known-good behavior rather than redesigning the feature from scratch.

## 2. Known-good behavior to restore

### iPhone Portrait
- Sidebar is hidden by default.
- A hamburger/menu (☰) control opens the sidebar.
- Sidebar opens as an overlay instead of consuming chat width.
- Chat remains effectively full-width while the sidebar is closed.
- Sidebar can be closed and the chat returns to the normal full-width layout.

### iPad
- Use a separate responsive breakpoint/behavior from iPhone Portrait.
- Do not automatically apply the narrow-phone layout to every tablet width.

### Desktop
- Preserve the existing Desktop sidebar behavior.
- The mobile fix must not change normal Desktop layout or interaction.

## 3. Recovery strategy

1. Inspect the current React component tree and identify the sidebar/layout owner.
2. Locate the current sidebar state, toggle controls, responsive classes/styles,
and layout containers.
3. Search the repository history/source for remnants or patterns that can identify
the previous implementation.
4. Reconstruct the smallest React/CSS change that reproduces the previously tested
behavior.
5. Keep the implementation scoped to the responsive UI layer; avoid unrelated
backend, authentication, provider, or session changes.

## 4. Implementation constraints

- Do not redesign the sidebar unnecessarily.
- Prefer a local component/layout change over broad global CSS overrides.
- Preserve existing Desktop behavior.
- Keep iPhone Portrait and iPad breakpoints explicit and independently testable.
- Do not modify ZCode backend session logic.
- Do not modify provider/model/account state.

## 5. Session/data safety

This task must not perform any operation that resets persistent ZCode state.

Strictly avoid:
- deleting `/data`
- deleting or recreating the Docker data volume
- changing `deviceMid`
- resetting authentication/session state
- changing provider credentials/configuration
- destructive Docker commands such as `docker compose down -v`

React/CSS changes should remain isolated from the persistent session/data layer.

## 6. Verification plan

After implementation, test the following separately:

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification | Status |
|---|---|---|---|---|---|
| iPhone Portrait initial view | UI | Sidebar hidden; chat uses full width | ⏳ | ⏳ | ⏳ |
| iPhone Portrait menu | UI | ☰ opens sidebar overlay | ⏳ | ⏳ | ⏳ |
| iPhone Portrait overlay close | UI | Sidebar closes without layout break | ⏳ | ⏳ | ⏳ |
| iPhone Portrait chat width | UI | Chat is not compressed by sidebar | ⏳ | ⏳ | ⏳ |
| iPad Portrait | UI | Intended tablet behavior remains intact | ⏳ | ⏳ | ⏳ |
| iPad Landscape | UI | No unintended phone layout | ⏳ | ⏳ | ⏳ |
| Desktop regression | UI | Existing sidebar behavior unchanged | ⏳ | ⏳ | ⏳ |
| Existing ZCode session | WS | Session remains available after UI changes | ⏳ | ⏳ | ⏳ |

## 7. Execution status

Implementation has been completed as a responsive UI-only change. No backend,
authentication, provider/model, session, Docker volume, or persistent state changes
were made.

Files added/updated for the implementation and verification:
- `docs/IPHONE_SIDEBAR_FIX_SPEC.md`
- `testing/test-iphone-sidebar-fix.md`
- `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
- `packages/ui/src/DesktopTopOverlay.tsx`

The automated verification record remains open for device-level user confirmation
on iPhone/iPad and for any environment checks unavailable on the current host.
