# Test: Settings Agent Capabilities Fix

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification |
|---|---|---|---|---|
| Open Settings -> Plugins on Docker Web | UI | Page leaves loading/connecting state and shows plugin content or empty state | ⏳ | ⏳ |
| Open Settings -> Skills | UI | Skills list/empty state renders and controls are usable | ⏳ | ⏳ |
| Open Settings -> Commands | UI | Commands list/empty state renders and New/Refresh controls work | ⏳ | ⏳ |
| Open Settings -> Subagents | UI | Subagent list loads for the active /workspace target | ⏳ | ⏳ |
| Open Settings -> Hooks | UI | Hook list leaves connecting state and renders controls | ⏳ | ⏳ |
| Open Settings -> Memory | UI | Memory setting responds; no indefinite loading | ⏳ | ⏳ |
| Open Settings -> MCP | UI | Existing MCP behavior remains functional | ⏳ | ⏳ |
| Docker Web unresolved Docker target | WS | Capability settings use the base host instead of a disconnected remote proxy | PASS (source inspection) | ⏳ |
| SSH/WSL unresolved remote target | WS | Existing remote-waiting/fail-closed behavior remains unchanged | PASS (source inspection) | ⏳ |
| Backend capability channels | API/WS | skills/plugin-management/subagents/commands/hooks/memory channels are registered | PASS (Docker log) | N/A |
| Subagent workspace path | API | subagents.list receives /workspace instead of an empty path | PASS (source inspection) | ⏳ |
| Typecheck | API | pnpm typecheck passes | BLOCKED: pnpm/corepack unavailable on R7 host | N/A |
| Lint | API | pnpm lint passes | BLOCKED: pnpm/corepack unavailable on R7 host | N/A |
| Docker Web build | API | Image builds successfully | PASS — compose build exit code 0 | N/A |
| Container deployment | API | zcode-web recreates and starts | PASS — container started | N/A |
| Runtime health | API | zcode-web reports healthy | PASS | N/A |
| HTTP smoke test | API | Web root returns HTTP 200 | PASS | N/A |
| Session DB persistence path | API | DB path is under /data | PASS | N/A |