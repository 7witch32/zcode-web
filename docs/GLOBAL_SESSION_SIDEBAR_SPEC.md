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

## Acceptance

1. Reload the Web UI with no historical project selected.
2. Sessions from previously used directories are visible in the sidebar.
3. Selecting a session from an unopened directory still opens/attaches the corresponding workspace through the existing navigation path.
4. Selecting a directory that is already open does not duplicate its sessions.
5. Docker restart/recreate does not reset or hide persisted sessions.
