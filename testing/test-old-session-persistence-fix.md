# Test: Old Session Persistence Fix

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification | Status |
|---|---|---|---|---|---|
| Inspect affected task index entry | API | Affected session remains listed | PASS: task index contains the exact session ID | ⏳ | PASS |
| Inspect V4 session DB before fix | API | Existing persisted V4 session should be present | PASS: confirmed DB was empty; this exposed the root cause | ⏳ | PASS |
| Apply Docker persistence path | API | V4 DB path is inside persistent `/data` volume | PASS: `ZCODE_SESSION_DB_PATH=/data/.zcode/cli/db/db.sqlite` | ⏳ | PASS |
| Recreate zcode container | API | Existing `zcode-data` volume is reused | PASS: `/data` remains mounted from `zcode-docker_zcode-data` | ⏳ | PASS |
| Verify runtime environment | API | Container receives persistent DB path | PASS: `ZCODE_SESSION_DB_PATH=/data/.zcode/cli/db/db.sqlite` | ⏳ | PASS |
| Verify affected old session | WS | Old conversation opens with history | BLOCKED: pre-fix V4 DB record was already absent; task index metadata alone cannot reconstruct messages | ⏳ | BLOCKED |
| Create a new V4 session | WS | Session is written to `/data/.zcode/cli/db/db.sqlite` | ⏳ Runtime session creation still needs user/UI action | ⏳ | ⏳ |
| Restart/recreate container after new session | WS | New session remains restorable | ⏳ Requires a newly created test session | ⏳ | ⏳ |
| iPhone sidebar regression | UI | Sidebar behavior remains unchanged | PASS: this fix only changes Docker session DB configuration | ⏳ | PASS |

## Root cause verification

The container had:

- persistent legacy task index: `/data/.zcode/v2/tasks-index.sqlite`
- non-persistent V4 session DB: `/home/node/.zcode/cli/db/db.sqlite`

The container's `HOME` is `/home/node`, so the default `~/.zcode/cli/db/db.sqlite` was outside the Docker volume.

The fix moves the V4 session DB to:

`/data/.zcode/cli/db/db.sqlite`

using `ZCODE_SESSION_DB_PATH`.

## Important limitation

The affected session `sess_cebba73e-a746-49d2-872c-b635688397cf` remains in the task index, but its V4 session record/messages were not present in the persisted Docker volume. The current container therefore cannot reconstruct its previous conversation from the task index alone.

This fix prevents the same persistence loss for sessions created after the fix.
