# Test: iPhone Sidebar Fix

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification | Status |
|---|---|---|---|---|---|
| iPhone Portrait initial view | UI | Sidebar hidden; chat uses full width | PASS: phone effect closes existing sidebar state | ⏳ | PASS* |
| iPhone Portrait menu | UI | ☰ opens sidebar overlay | PASS: Web toggle reuses onToggleSidebar | ⏳ | PASS* |
| iPhone Portrait overlay close | UI | Sidebar closes without layout break | PASS: same state toggle + absolute panel | ⏳ | PASS* |
| iPhone Portrait chat width | UI | Chat is not compressed by sidebar | PASS: sidebar absolute below 768px | ⏳ | PASS* |
| iPad Portrait | UI | Existing tablet behavior remains intact | PASS: mobile rule stops at 767px | ⏳ | PASS* |
| iPad Landscape | UI | No phone layout | PASS: max-md rule not active at 768px+ | ⏳ | PASS* |
| Desktop regression | UI | Existing sidebar behavior unchanged | PASS: desktop branch/classes unchanged | ⏳ | PASS* |
| Existing ZCode session | WS | Session state is not touched by UI change | PASS: no session/backend/data code changed | ⏳ | PASS* |

## Agent verification notes
- Phone breakpoint is explicitly below 768px via max-md/767px.
- Sidebar becomes position:absolute only on the phone breakpoint.
- The existing sidebar toggle handler is reused.
- No backend/session/provider/Docker data files are changed.

*PASS means static/code-level verification only; physical iPhone/iPad confirmation remains pending.