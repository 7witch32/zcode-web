# Test: Workspace Spawn Fallback

## Purpose
Verify Docker Agent sessions remain usable when a historical session references a workspace directory that no longer exists.

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification |
|---|---|---|---|---|
| 1. Container starts with fallback configured | API | `ZCODE_AGENT_SPAWN_FALLBACK_CWD=/workspace` | ✅ Verified | ⏳ |
| 2. Persistent workspace mount exists | API | `/workspace` is a directory | ✅ Verified | ⏳ |
| 3. Missing requested cwd resolves to fallback | API | Resolver returns `/workspace`, `usedFallback=true` | ✅ Verified | ⏳ |
| 4. TypeScript typecheck | API | Exit code 0 | ✅ Verified | ⏳ |
| 5. Docker image rebuild | API | Image builds successfully | ✅ Verified | ⏳ |
| 6. Container recreated and healthy | API | `zcode-web` is healthy | ✅ Verified | ⏳ |
| 7. Open existing historical session | UI/WS | Session loads and Agent can start despite missing historical cwd | ⏳ | ⏳ |
| 8. Send a new message in that session | UI/WS | Message is accepted and Agent responds | ⏳ | ⏳ |
| 9. Create a new session | UI/WS | New session starts normally | ⏳ | ⏳ |

## Implementation
- Reused the existing `resolveZCodeAgentSpawnCwd` validation/fallback mechanism.
- Docker HTTP entrypoint now wires `ZCODE_AGENT_SPAWN_FALLBACK_CWD` into Services.
- Docker Compose sets the fallback to the persistent `/workspace` mount.

## 2026-10-01 status
- The compose/entry-http wiring was briefly removed during an unrelated-change cleanup and has been
  **restored** after review confirmed this fix was deliberate and previously verified.
- Rows 1, 2, 5, 6 are re-verified on the restored deployment (fallback env present in the container,
  image rebuilt, `zcode-web` healthy).
- Rows 7-9 still require user verification with a historical session whose workspace directory no
  longer exists.
