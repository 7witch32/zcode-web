# Global Session Sidebar

## Product rule

The sidebar is a global session browser. On cold start it must show all active ZCode sessions persisted in `tasks-index.sqlite`, grouped by directory/workspace, without requiring the user to open that directory first.

## Data flow

```text
Tasks index (all workspaces)
        |
        +--> global active task list
        |
        +--> grouped structure / membership
        |
        v
Renderer joins task rows with live session activity
        |
        v
Sidebar grouped by workspace/directory
```

## Scope rules

- `includeAllWorkspaces=true` is used only by the global sidebar discovery path.
- Normal workspace-scoped task queries continue to use `workspaceScopes`.
- Deleted, archived, and pinned tasks remain excluded from the active grouped view.
- `workspaceIdentity` remains the identity key for remote workspaces; `workspacePath` remains the display/file-operation path.
- Opening a directory is not required merely to discover its existing sessions.

## Live status rules

- Live status (running phase, pendingInteraction) is runtime-authoritative and flows through the `"*"` workspace-event lane; live meta always wins over tasks-index DB rows during merges, and the merge has a single shared implementation (`mergeLiveMetaIntoItem` in `packages/ui/src/v4/globalTaskListLiveMeta.ts`).
- A row shows the running spinner only while the live meta itself says running (activity sidecar). Persisted DB `status=running` alone never spins — it may be a stale leftover from the last process death.
- Coverage is best-effort: live status exists only for workspaces the syncer has ingested since process start. Other directories' rows render from persisted state; the sidebar must not activate runtimes just to discover sessions.
- Live-meta state is reconciled on every (re)subscription: the syncer replays a fresh snapshot, so entries from a dead ingest never outlive a reconnect.

## Auto-archive

- Settings-driven task auto-archive triggers from grouped sidebar loads on both lanes. The global lane widens the QUERY to all indexed workspaces, but the archive set stays `workspaceScopes` (the open tabs) — sessions from unopened directories are never archived merely because the sidebar discovered them.

## Acceptance

1. Reload the Web UI with no historical project selected.
2. Sessions from previously used directories are visible in the sidebar.
3. Selecting a session from an unopened directory still opens/attaches the corresponding workspace through the existing navigation path.
4. Selecting a directory that is already open does not duplicate its sessions.
5. Docker restart/recreate does not reset or hide persisted sessions.
