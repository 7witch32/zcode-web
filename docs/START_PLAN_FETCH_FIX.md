# Start Plan Fetch Failed — Fix Record

## Status

Resolved in Docker/HTTP mode on 2026-09-29.

The WebUI can now fetch Start Plan billing/entitlement data and the previous Start Plan Fetch failed / upstream parameter error blocker is resolved.

## Symptom

After login, Start Plan could authenticate but the model selector could not resolve Start Plan models. The billing request was rejected upstream with HTTP 400 / parameter error.

Relevant request:
https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=3.14.4

No CAPTCHA bypass, token replay, browser fingerprint spoofing, or CAPTCHA solver was added.

## Root cause

Docker/HTTP mode did not initialize the server's deviceMid.

Desktop/stdio flows already had device identity initialization, but the HTTP entrypoint could start services without first creating telemetry-state.json. The Start Plan billing/balance request needs the device identity as X-Device-Mid. Without it, the upstream service returned parameter error, which prevented Start Plan entitlement/model resolution.

## Code change

File:
packages/server/src/entry-http.ts

The HTTP entrypoint now imports and calls ensureRemoteServerDeviceMid() before provider/service initialization.

The initializer reuses the existing implementation in packages/server/src/stdioDeviceMid.ts and ultimately the shared ensureDeviceMid implementation. This keeps the device identity format and storage behavior consistent with the existing runtime.

## Why initialization must happen early

Initialization is performed before createLocalServices() so that any initial/background Start Plan billing refresh can already see the device identity.

The identity is stored under the configured ZCode data directory. In Docker this is mounted as /data and persisted by the Docker volume zcode-data.

## Verification evidence

After rebuilding/recreating the container:

1. /data/.zcode/v2/telemetry-state.json exists.
2. The file contains a generated UUID deviceMid.
3. Server logs show the billing/balance request completing successfully.
4. The request uses the app_version=3.14.4 billing URL.
5. The response reports success: true and code: 0.
6. The previous Start Plan fetch/model-resolution blocker is no longer observed.
7. The historical CAPTCHA/security-check block is no longer encountered in the successful flow.

## Important distinction

The successful result demonstrates that the current server-side flow no longer blocks this Docker setup with the previous CAPTCHA/security failure. It is not a guarantee that CAPTCHA can never appear for every account, version, IP, or future release.

The project deliberately does not contain a CAPTCHA bypass.

## Docker runtime used

The repository Docker Compose service is zcode, with container name zcode-web.

- Web port: 3030:3030
- Persistent data: zcode-data:/data
- Workspace: ./workspace:/workspace
- Server host: 0.0.0.0
- Data base directory: /data

## Revalidation checklist

- [ ] Image builds successfully.
- [ ] Container starts and remains healthy.
- [ ] WebUI opens on port 3030.
- [ ] telemetry-state.json is created after startup.
- [ ] deviceMid is non-empty.
- [ ] Start Plan login/configuration succeeds.
- [ ] Start Plan billing/model fetch succeeds.
- [ ] At least two model requests succeed.
- [ ] Existing persistent state survives a container restart.

## Related implementation files

- docs/SETUP_AND_PATCH_GUIDE.md
- docker-compose.yml
- Dockerfile
- packages/server/src/entry-http.ts
- packages/server/src/stdioDeviceMid.ts
- AGENTS.md
