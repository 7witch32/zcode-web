# iPhone Portrait Sidebar Fix — UI Specification

> **SUPERSEDED (2026-10-01):** the shipped behavior no longer overlays. The committed
> implementation (`WorkspaceShellLayout.tsx` uses `max-md:relative`) pushes the
> New Session/content area instead of overlaying it — see docs/LOCAL_PATCHES.md
> (PATCH-ZCODE-MOBILE-SIDEBAR) and docs/GLOBAL_SESSION_SIDEBAR_SPEC.md, which record
> user physical verification as resolved. This spec is kept for history only.

## Behavior
- Below 768px in WebUI, the workspace sidebar is an overlay.
- Phone layout starts with the sidebar closed so conversation uses full width.
- A top-left menu button toggles the existing sidebar state.
- Opening the sidebar overlays the conversation without resizing it.
- At 768px and above, existing sidebar behavior remains unchanged.

## Ownership and boundaries
- Sidebar visibility remains owned by the existing workspace sidebar state.
- WorkspaceShellLayout owns responsive layout presentation and phone auto-collapse.
- DesktopTopOverlay exposes the existing sidebar command on narrow WebUI.
- No backend, authentication, provider, model, session, Docker volume, or persistence behavior changes.

## Verification
- Agent checks cover phone, iPad, desktop regression, and session continuity.
- User verification remains required for visual/device confirmation.
