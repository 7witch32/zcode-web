# iPhone verification checklist — Settings UI (PATCH-ZCODE-WEB-SETTINGS)

Deployment: zcode-web (Docker), iPhone Safari ~390px. Run after the rebuild that
introduced this patch. Desktop browsers must remain unchanged in every step marked
"desktop unchanged".

## Navigation (phone chip bar)

- [ ] Open Settings from the sidebar gear on iPhone: no 68px icon rail; a horizontal
      scrollable chip bar with full labels appears at the top (sticky while scrolling).
- [ ] Leading back arrow closes Settings and returns to the workspace (same as desktop).
- [ ] Every section reachable: General, Appearance, Model settings, Browser Use,
      Keyboard Shortcuts, Memory, Subagents, Plugins, MCP Servers, Skills, Commands,
      Hooks, Usage stats; dashed **Onboard** chip is last and opens the onboarding dialog.
- [ ] Active chip is highlighted; after reload Settings reopens on the last section.
- [ ] Desktop unchanged: icon rail / full sidebar as before (68px below lg, 268px at lg+).

## General section (phone layout)

- [ ] Every row stacks label above control; nothing clipped by card edges.
- [ ] Language / terminal shell / auto-archive selects span the row width (max 260px),
      no half-cut dropdowns.
- [ ] Data directory row shows the read-only "Managed by the server environment
      (ZCODE_DATA_BASE_DIR)" note — no Browse/Save buttons on web.
- [ ] Tap a text input (e.g. HTTP proxy): Safari does NOT auto-zoom the page
      (focus zoom guard). Desktop unchanged (14px text).

## Keyboard Shortcuts (touch + external keyboard)

- [ ] Hint visible on iPhone: "Recording needs a physical keyboard…".
- [ ] Table rows: two-line layout (command + scope / bindings + actions); command names
      readable; edit/clear buttons tappable (≥28px targets).
- [ ] Search bar wraps; the reset-all button drops to its own line when narrow.
- [ ] Tap a binding: recording state appears with a ✕ cancel button; tap ✕ cancels
      without any keyboard.
- [ ] With a Bluetooth keyboard connected: tap a binding, press a combo on the external
      keyboard → recorded, keycaps update, saved to the server.
- [ ] Cross-device: after recording on iPhone, reload the page in a desktop browser on
      the same server → the new binding is active there too (desktop app: per-machine).
- [ ] Menu-channel rows (New task, Open/Close workspace, zoom) remain greyed on web
      (expected: desktopOnly).

## Model settings (phone)

- [ ] Nested provider nav renders as a horizontal chip row with full labels above the
      detail pane; scrolls horizontally; no 32px icon-only buttons.
- [ ] Tapping a provider switches the detail pane; no accidental drag-reorder.
- [ ] Desktop unchanged: 224px sidebar + drag-reorder still work.

## P2 spots

- [ ] Model settings → reasoning levels: delete ✕ on a chip is visible on touch.
- [ ] MCP Servers: "Open authorization" button shows icon + text on iPhone.
- [ ] Migration section (if reachable): skipped/failed lists stack in one column.
- [ ] Plugin store detail: metadata labels sit above values, values readable.
- [ ] Skills detail dialog: fields in one column on phone.
- [ ] Saved workflows → args editor: horizontal scroll instead of clipped inputs.
- [ ] Usage → Coding Plan chart: tooltip stays inside the screen near the right edge.

## Persistence (rebuild safety)

- [ ] Change any setting (e.g. enable auto-archive), then rebuild the container:
      `docker compose build zcode && docker compose up -d zcode`.
- [ ] After recreate, the changed setting is still present (zcode-home volume).
- [ ] `docker volume ls` shows `zcode-docker_zcode-home`; /data volume untouched.
