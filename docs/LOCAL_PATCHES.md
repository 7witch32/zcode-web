# Local Patch Registry — ZCode Docker

> Single source of truth for repository-local changes that must survive upstream ZCode updates.

## Current repository state

- Workspace: `D:\\Drive\\MY\\viteWorkspace\\zcode-docker`
- Runtime: Docker WebUI (`zcode-web`)
- Persistent state: `/data` must never be reset as part of these UI patches.
- This checkout currently has no `.git` directory, so Git history is not yet the patch source of truth.

## Patch inventory

### PATCH-ZCODE-IPHONE-SIDEBAR

**Area:** mobile/iPhone Sidebar interaction and layout.

**Status:** active and physically verified by the user on the current deployment.

**Source files:**
- `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
- `packages/ui/src/DesktopTopOverlayActionButton.tsx`
- `packages/ui/src/DesktopTopOverlay.tsx`

**Protected behavior:**
- Portrait Sidebar toggle opens/closes reliably by touch.
- Left-edge finger swipe opens the existing Sidebar.
- Swipe starts near the left edge and uses horizontal-distance thresholds.
- Vertical scrolling remains usable.
- Mobile Sidebar pushes the New Session/content area instead of overlaying it.
- New Session keeps viewport-sized layout width instead of flex-shrinking.
- The toggle touch target is not covered by a full-height edge hit zone.
- Mobile toggle wrapper is shifted inward by 12px (`max-md:left-3`).
- Desktop/iPad behavior remains outside phone-specific rules.
- No second Sidebar, session, or state store is introduced.

## Patch implementation details

### Responsive boundary and thresholds

- Phone breakpoint: `max-width: 767px`.
- Edge swipe starts only within the first `24px` from the left edge.
- Horizontal trigger: `48px`.
- Direction intent threshold: `12px`.
- Horizontal distance must dominate vertical movement before opening Sidebar.

### Sidebar state and mobile auto-collapse

`WorkspaceShellLayout.tsx` coordinates phone-specific gesture/layout behavior while the actual Sidebar visibility state remains in the existing application panel state.

The phone auto-collapse effect originally depended on `isSidebarVisible`. Opening the Sidebar changed that dependency and could cause the effect to run again and immediately close the Sidebar. The fix makes the effect respond to entering the phone breakpoint rather than every visibility change, and reads current visibility through `phoneSidebarVisibleRef`.

### Touch and pointer event handling

`DesktopTopOverlayActionButton.tsx` has an explicit `onTouchEnd` path that invokes the existing action and suppresses the following synthetic click. This avoids relying exclusively on mouse/click synthesis on iOS while preserving normal desktop click behavior.

`WorkspaceShellLayout.tsx` observes the edge swipe with React Touch Events on the workspace shell:
- `onTouchStart`
- `onTouchMove`
- `onTouchEnd`
- `onTouchCancel`

Pointer capture handlers remain as a fallback:
- `onPointerDownCapture`
- `onPointerMoveCapture`
- `onPointerUpCapture`
- `onPointerCancelCapture`

An earlier dedicated full-height left-edge hit zone was removed because its higher z-index overlapped and blocked the top-left Sidebar toggle. The shell-level touch path allows both the toggle and edge swipe to receive their correct events.

### Mobile Sidebar layout

The Sidebar was originally an absolute mobile overlay. It is now a normal flex child so opening it pushes the New Session/content area rather than covering it.

Closed Sidebar:
- mobile width becomes `0`;
- pointer interaction is disabled while hidden.

Open Sidebar:
- uses the configured Sidebar panel width;
- remains inside the workspace flex layout.

The main mobile content uses:
`max-md:min-w-[100vw] max-md:flex-none`

This preserves the normal viewport-sized New Session layout. The Sidebar consumes additional flex space and pushes the content beyond the visible viewport instead of shrinking the New Session UI into a narrow column.

### Toggle positioning

`DesktopTopOverlay.tsx` uses `max-md:left-3` for the mobile top overlay wrapper. This shifts the toggle inward by 12px, making the touch target easier to reach on a phone without changing desktop positioning.

## Detailed change history

### Initial investigation

The original phone problem was that the Sidebar button appeared but did not remain open in portrait mode, while a left-edge swipe gesture was also required.

The first root cause was the phone auto-collapse effect in `WorkspaceShellLayout.tsx`: its lifecycle depended on `isSidebarVisible`, so changing Sidebar visibility could rerun the effect and close the Sidebar again.

The first swipe implementation used pointer events with a 24px edge start zone, 48px trigger distance, horizontal-over-vertical intent, and pointer capture.

### Event-delivery hardening

The first physical verification showed that a successful Docker build was not enough: the user still could not open the Sidebar by portrait tap or left-edge swipe on the phone.

The next revision hardened event delivery by:
- adding direct touch activation to `DesktopTopOverlayActionButton.tsx`;
- moving the swipe fallback to pointer capture phase;
- preserving the 24px start and 48px trigger thresholds;
- ignoring interactive controls for the edge gesture;
- retaining `touch-pan-y` so normal vertical scrolling remains usable.

A later source inspection showed that iOS needed an explicit Touch Events path, so `touchstart`, `touchmove`, `touchend`, and `touchcancel` handling was added. The Pointer Events path remains as fallback.

### Mobile Sidebar push behavior — 2026-09-30

Physical iPhone verification confirmed that the edge swipe could open the Sidebar, but the Sidebar still overlaid the New Session/content area.

The corrective change converted the mobile Sidebar from an absolute overlay into a normal flex child. The first version used `min-width: 0` for the main content, but this caused New Session to shrink too aggressively.

### Preserve New Session size and restore toggle hit target — 2026-09-30

The next physical verification showed two concrete issues:

1. `min-width: 0` allowed the New Session area to flex-shrink.
2. A dedicated full-height edge hit zone had a higher z-index than the top-left toggle and intercepted its touch.

The final corrective behavior:
- mobile main content uses `min-width: 100vw` and `flex-none`;
- the overlapping full-height edge hit zone is removed;
- edge swipe Touch Events attach to the workspace shell;
- the toggle receives its own touch events;
- the mobile toggle wrapper is shifted inward by 12px.

The user subsequently confirmed the toggle position worked correctly. The current deployment was rebuilt and verified healthy without resetting `/data`.

## Verification history

### Earlier unsuccessful iterations

- Docker image builds and container health checks passed.
- WebUI returned HTTP 200.
- Targeted UI lint reported 0 errors with 6 existing warnings.
- Physical iPhone verification initially failed for both the portrait toggle and edge swipe.

The important lesson is that Docker build/runtime health does not constitute mobile interaction verification.

### Current verified revision

- Docker build: PASS.
- Container recreate: PASS.
- `zcode-web`: healthy.
- WebUI `http://localhost:3030/`: HTTP 200.
- Persistent `/data` and session state: not reset.
- Physical iPhone verification: edge swipe works; Sidebar layout pushes the New Session area; toggle touch target position was confirmed by the user.

## Upgrade and maintenance procedure

When a new ZCode upstream version/source is introduced:

1. Preserve the current source tree and this documentation.
2. Record the incoming upstream tag/commit/build identifier.
3. Inspect the three protected source files listed above.
4. Compare incoming changes against every protected behavior and implementation contract in this file.
5. If upstream changed the same sections, re-apply the local behavior deliberately rather than copying an old file wholesale.
6. Re-run the real phone Sidebar tests. A successful Docker build is not enough.
7. Rebuild and recreate only the application container; never delete/reset `/data`.
8. Verify container health and WebUI HTTP 200.
9. Update this file with the new upstream version, merge decision, source changes, and verification result.
10. If upstream provides an equivalent native fix, document that fact before removing the local patch.

## What requires a Sidebar regression check

- Changes to `WorkspaceShellLayout.tsx` around the workspace root, Sidebar, mobile breakpoint, touch/pointer handlers, or main content sizing.
- Changes to `DesktopTopOverlay.tsx` or `DesktopTopOverlayActionButton.tsx`.
- Global CSS/Tailwind changes affecting `max-md`, z-index, pointer-events, flex sizing, or touch behavior.
- Sidebar changes affecting width, positioning, or event handling.

## Verification checklist

| Check | Required result |
|---|---|
| Portrait toggle | Opens and closes Sidebar on real phone touch |
| Left-edge swipe | Starts within ~24px and swipes right ~48px+ |
| Vertical drag | Does not open Sidebar |
| Non-edge horizontal drag | Does not open Sidebar |
| Sidebar layout | Pushes New Session/content instead of overlaying it |
| New Session width | Remains normal viewport-sized; does not collapse |
| Toggle hit target | Receives touch reliably near top-left |
| Desktop/iPad | Existing Sidebar behavior remains intact |
| Docker health | `zcode-web` healthy |
| HTTP | WebUI returns 200 |
| Persistent state | `/data` and sessions remain intact |

## Related files

- `docs/SETUP_AND_PATCH_GUIDE.md` — end-to-end setup, build, patch, verification, and upstream update workflow.
- `docs/DOCKER_PROXY_PLAN.md` — Docker API Proxy design/reference.

One-off implementation plans, temporary test files, logs, generated output, and machine secrets should not be kept as permanent patch documentation.

## Important limitation of this checkout

Because `.git` is currently absent, this file is a behavioral patch ledger rather than a Git commit/diff ledger. Once the remote repository is initialized, preserve this file and use Git commits/branches to provide exact source-level history.
