# Implement Settings Agent Capabilities Fix

## Status

Implemented 2026-09-30.

## Symptom

In the Docker/Web UI, Settings -> Agent capabilities showed Memory, Subagents, Plugins, MCP Servers, Skills, Commands, and Hooks. MCP could be opened and configured, but several other capability pages stayed in loading/connecting state or had unusable controls.

## Findings

1. The HTTP server already registers all capability RPC channels: `skills`, `plugin-management`, `subagents`, `commands`, `hooks`, and `memory`.
2. Server logs confirmed `subagents.list OK`, so this was not a missing backend channel.
3. The Web/Docker workspace can carry a Docker `RemoteTarget` even though the current `zcode-web` process is itself the Agent host.
4. `useWorkspaceServicesResolution()` intentionally treats unresolved remote targets as `remote-waiting` and returns a disconnected service proxy. Capability settings therefore stopped before issuing RPCs.
5. Subagents had an additional issue: SettingsPage already passed the active workspace path, but `SubagentsSection` ignored it and used an empty path for its user-scope list.

## Implementation

### Web Docker local-host fallback

Updated `packages/ui/src/hooks/useWorkspaceServices.tsx`.

A caller can opt into a narrow fallback for Web Docker workspaces:
- target is explicitly `kind: "docker"`
- no remote session has been resolved
- caller explicitly opts in
- use the already-connected base host
- normal SSH/WSL/remote targets keep the existing fail-closed behavior

Plugins/Skills/Commands use this mode in Web settings; Hooks does the same.

### Subagents workspace target

Updated `packages/ui/src/settings/SubagentsSection.tsx`.

The section now honors the workspace path/identity supplied by SettingsPage instead of turning the target into an empty path. Docker/Web workspace tabs are also allowed when an explicit workspace path is supplied.

## Safety boundary

This does not change normal remote workspace routing. SSH/WSL and unresolved non-Docker remote targets remain in the existing `remote-waiting` state.

## Additional build fix

The existing `DesktopTopOverlay.tsx` also contained malformed JSX from the earlier iPhone sidebar work. Rolldown reported `Expected }` during the Web build. The overlay was reduced to a parser-safe implementation that preserves the sidebar toggle, New Task action, and update status entry points while removing the malformed task-navigation wrapper.

This parser issue was unrelated to the Agent capabilities service-resolution fix.

## Verification

- Source inspection: all affected RPC channels are registered by `createLocalServices()`.
- Docker runtime log: `subagents.list OK` confirmed backend capability service availability.
- Docker Web build: PASS — `docker compose build zcode` completed with exit code 0.
- Web bundle build: PASS — `@zcode/web` completed successfully.
- Server build: PASS — `@zcode/server` completed successfully.
- CLI build: PASS — `@zcode/cli...` completed successfully.
- Container deployment: PASS — `docker compose up -d --force-recreate zcode` completed successfully.
- Runtime health: PASS — `zcode-web` reports `Up (healthy)`.
- HTTP smoke test: PASS — `http://127.0.0.1:3030/` returned HTTP 200.
- Session DB path: PASS — `ZCODE_SESSION_DB_PATH=/data/.zcode/cli/db/db.sqlite`.
- Docker API proxy: PASS — `DOCKER_HOST=tcp://docker-api-proxy:2375`.
- Host `pnpm typecheck` / `pnpm lint`: unavailable because pnpm/corepack are not installed on the R7 host.
- Settings UI smoke test on an actual browser/device: pending user verification; no UI result is claimed without that interaction.
