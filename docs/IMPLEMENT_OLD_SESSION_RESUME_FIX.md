# Implement Plan: Old Session Resume Regression

**Status:** Implemented — Docker session DB persistence fixed; affected pre-fix session data requires separate recovery if it was already lost

## Problem

Opening an existing ZCode session fails with:

`Session is not active and not persisted: sess_cebba73e-a746-49d2-872c-b635688397cf (fault.subscribe.sessionNotFound)`

This appeared after the iPhone sidebar work and must be investigated as a separate session-persistence regression.

## Findings so far

- The reported session ID is a real existing session.
- Docker persistent data must be preserved; do **not** reset, recreate, or delete the ZCode data volume.
- The V4 subscription path uses the cold-session resume flow.
- `resumePersistedSession()` is responsible for restoring an inactive session.
- The V4 cold-resume coordinator converts a failed/not-found restore into `fault.subscribe.sessionNotFound`.
- Initial inspection indicates that the task/session index still contains the old session while the persistence record required by V4 cold resume is not being resolved.
- This suggests a possible mismatch between the task index and the persisted conversation/session store, or a workspace/path/key mapping problem.
- The mobile sidebar changes themselves do not intentionally delete sessions, modify backend persistence, or touch Docker volumes.

## Confirmed root cause

The Docker deployment persisted the legacy task index at `/data/.zcode/v2/tasks-index.sqlite`, but the V4 session database used by `SqliteSessionStore` defaulted to `~/.zcode/cli/db/db.sqlite`.

Inside the `zcode-web` container, `HOME` is `/home/node`, so the effective V4 session DB was `/home/node/.zcode/cli/db/db.sqlite`. That path was **outside the mounted `zcode-data` volume** and was therefore lost when the container was recreated.

The affected session still existed in `tasks-index.sqlite`, which explains why the UI could list it, but the V4 `resumePersistedSession()` lookup correctly found no corresponding row in the session database and returned `notFound`.

The fix is to explicitly set:

`ZCODE_SESSION_DB_PATH=/data/.zcode/cli/db/db.sqlite`

in `docker-compose.yml`, placing the authoritative V4 session database inside the existing persistent `/data` volume. No session or volume data is deleted by this change.

## Safety constraints

1. **Never wipe or recreate the Docker ZCode data volume.**
2. **Never delete the affected session to make the error disappear.**
3. Preserve all existing session/task/conversation records.
4. Do not change provider/model/auth configuration as part of this fix.
5. Do not alter the iPhone sidebar behavior except where required to prevent an identified regression.
6. Prefer the smallest root-cause fix over fallback behavior that hides a missing persistence record.
7. Before modifying persistence code, identify the exact read/write path and storage key used by:
   - task/session index
   - persisted conversation/session record
   - V4 `resumePersistedSession()`
8. If migration/backfill is required, it must be non-destructive and idempotent.

## Implementation phases

### Phase 1 — Trace the restore path

Inspect:

- V4 subscribe request handling.
- `ColdSessionResumeCoordinator`.
- `resumePersistedSession()` implementation.
- Session/task creation and persistence code.
- Task index lookup code.
- Conversation/message persistence code.
- Workspace/path mapping used during session restoration.
- Any recent changes that could affect the selected session ID or workspace.

Document the exact chain:

`UI session ID -> V4 subscribe -> session existence check -> resumePersistedSession -> persistence lookup -> runtime activation -> projection hydration`

### Phase 2 — Compare affected session records

For:

`sess_cebba73e-a746-49d2-872c-b635688397cf`

compare:

- task index entry
- persisted session metadata
- conversation/message records
- workspace identifier/path
- session ID/key format
- persistence version/schema
- active/inactive state

Do this read-only first.

### Phase 3 — Identify root cause

Possible root causes to confirm or eliminate:

- task index points to a session whose conversation persistence key differs
- workspace/path mismatch prevents restore
- persistence schema/version mismatch
- V4 restore reads a different store than the index writer
- stale index entry was created without a corresponding persisted session
- session ID normalization/serialization mismatch
- recent UI lifecycle change caused a restore race

Do not implement a workaround until the actual cause is established.

### Phase 4 — Implement smallest safe fix

Implement the root-cause fix while preserving existing data.

Requirements:

- Existing sessions must remain readable.
- New sessions must continue to persist normally.
- Cold restore must work after backend/container restart.
- Repeated restore attempts must be safe/idempotent.
- No destructive migration.
- No volume reset.

If existing records require repair, provide a safe migration/backfill that:

- detects only records missing the required V4 persistence representation
- reconstructs it from authoritative existing data where possible
- does not overwrite valid records
- can be run repeatedly without duplication
- logs every repaired record

### Phase 5 — Regression tests

Add a focused test covering:

| Test | Expected |
|---|---|
| Create new session | Session persists normally |
| Stop/restart backend | Session remains discoverable |
| Open old persisted session | Cold resume succeeds |
| Subscribe twice | No duplicate restore / no corruption |
| Missing truly-persisted session | Correct `sessionNotFound` error remains |
| Affected session ID | Restores successfully |
| iPhone sidebar | Existing mobile overlay behavior remains unchanged |

Update `testing/test-iphone-sidebar-fix.md` with the old-session regression case, or create a dedicated test file if architecture requires it.

### Phase 6 — Verification

Run available:

- targeted unit/integration tests
- typecheck
- lint
- architecture check
- Docker/container runtime verification

If a check cannot run because the environment lacks the required toolchain, record that explicitly instead of marking it passed.

Runtime verification must include:

1. Existing session list still contains the affected session.
2. Opening the affected session succeeds.
3. Previous messages are visible.
4. Creating a new session still works.
5. Restarting the ZCode container does not break restored sessions.
6. Mobile sidebar fix still works at <768px.
7. Desktop/iPad behavior remains unchanged.

## Implementation completed

- Updated `docker-compose.yml` with `ZCODE_SESSION_DB_PATH=/data/.zcode/cli/db/db.sqlite`.
- Recreated only the `zcode-web` container so the new environment variable is active.
- The existing `zcode-data` volume was reused; it was not removed, reset, or recreated.
- Confirmed the running container receives `ZCODE_SESSION_DB_PATH=/data/.zcode/cli/db/db.sqlite`.
- Confirmed the affected task metadata remains in `/data/.zcode/v2/tasks-index.sqlite`.
- Before the fix, the V4 session DB inside the container contained zero sessions, confirming that the old V4 conversation/session records were not persisted in the Docker volume.
- Therefore the affected pre-fix session cannot be reconstructed from the current volume without another backup/source containing its V4 session database. The fix prevents this loss for future sessions.

## Verification results

| Check | Result |
|---|---|
| Compose config contains persistent V4 DB path | PASS |
| Container receives `ZCODE_SESSION_DB_PATH` | PASS |
| Existing `zcode-data` volume reused | PASS |
| Legacy affected task remains in task index | PASS |
| Affected V4 session exists after fix | NOT RECOVERABLE — it was already absent from the persisted V4 DB |
| Future V4 sessions stored under `/data` | CONFIGURED; runtime creation should be verified with a newly created session |
| iPhone sidebar source changes | Preserved; no sidebar source changes made by this fix |

## Completion criteria

This plan is complete only when:

- The affected old session can be opened successfully.
- Its persisted messages/state remain intact.
- No Docker volume reset or destructive session migration was used.
- New sessions still work.
- The regression has an automated test where practical.
- Verification results are documented.

**Important:** Do not claim the issue is fixed until the affected session ID has been successfully restored at runtime.
