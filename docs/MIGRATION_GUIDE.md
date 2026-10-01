# ZCode Docker — Installation / Migration Guide

## 1. Scope

This guide installs the Docker-only ZCode WebUI from this repository on a different machine and preserves the important behavior fixed for Start Plan.

Target architecture:

Browser -> ZCode container -> WebUI / Agent / Provider / Chromium

The host can expose port 3030 through LAN or Tailscale. Tailscale should stay on the host rather than being installed inside the container unless there is a specific reason to change that architecture.

## 2. What must be moved

Recommended:

1. The ZCode source repository at the required commit/version.
2. Dockerfile and docker-compose.yml.
3. The source fix in packages/server/src/entry-http.ts.
4. The related helper packages/server/src/stdioDeviceMid.ts.
5. workspace/ only if the projects/files stored there are intended to move.
6. Any documented non-secret configuration required by the deployment.

Do not blindly copy the old Docker volume to a new machine if a clean device identity is desired. A new machine should normally generate its own deviceMid through server startup.

## 3. Secrets and account state

Do not put Z.ai passwords, OAuth tokens, JWTs, API keys, or session cookies into Git or documentation.

If the existing deployment has authenticated state inside the zcode-data volume, decide explicitly whether that account/session state should be migrated. For a clean installation, create a new empty Docker data volume and log in/configure the account on the new machine.

A migrated data volume may carry machine/account-specific state, so it should not be treated as a portable application package.

## 4. Host prerequisites

Install:

- Docker Engine or Docker Desktop with Compose support.
- Git if cloning the repository.
- Sufficient disk space for the Docker image, dependencies, Chromium, and persistent data.
- Network access from the host to the required ZCode/Z.ai services.

Windows Docker Desktop is supported by the current compose layout. Linux is also suitable for Docker; verify the host's Docker/Compose installation before starting.

## 5. Obtain the repository

Clone or copy the repository to the new machine.

Before building, verify these files exist:

- Dockerfile
- docker-compose.yml
- packages/server/src/entry-http.ts
- packages/server/src/stdioDeviceMid.ts
- docs/SETUP_AND_PATCH_GUIDE.md

Confirm that entry-http.ts calls ensureRemoteServerDeviceMid() before createLocalServices().

## 6. Optional authentication token

The compose file supports ZCODE_SERVER_AUTH_TOKEN.

If remote access is exposed beyond localhost/LAN, configure an authentication token rather than leaving the service unauthenticated.

Do not commit the token to the repository.

## 7. Build the Docker image

From the repository root:

docker compose build zcode

Then create/start the container:

docker compose up -d zcode

Important: docker compose build creates an image, not the running container. The container is created by docker compose up -d.

## 8. Verify the container

Run:

docker compose ps

Then inspect logs:

docker compose logs --tail=200 zcode

The expected server listens on 0.0.0.0:3030.

Open:

http://localhost:3030

For another device on the LAN/Tailscale network, use the host's reachable address and port 3030, subject to firewall/authentication settings.

## 9. Verify persistent storage and deviceMid

The compose file mounts:

zcode-data:/data

and sets:

ZCODE_DATA_BASE_DIR=/data

After first startup, verify the device state inside the container:

docker compose exec zcode sh -lc 'cat /data/.zcode/v2/telemetry-state.json'

The file should contain a non-empty UUID-like deviceMid.

If it is absent, do not proceed to Start Plan troubleshooting yet. First check server startup logs and confirm the HTTP entrypoint is running ensureRemoteServerDeviceMid().

## 10. Configure Start Plan

Open the WebUI and complete normal account/provider configuration.

Primary project validation uses:

- Provider: account:zai-start-plan
- Model: GLM-5.3-Flash

Do not manually manufacture an X-Device-Mid value. Let the server create and persist its own identity.

## 11. Validate the Start Plan flow

Test in this order:

1. Open WebUI.
2. Confirm login/account configuration.
3. Open the model selector.
4. Confirm Start Plan models can be resolved.
5. Send a simple request.
6. Send a second independent request.
7. Check container logs for billing/model errors.

A single successful UI load is not enough. The acceptance target is successful billing/model resolution followed by repeated model requests.

## 12. Verify the fix after restart

Restart the container:

docker compose restart zcode

Then check:

docker compose logs --tail=200 zcode

and reopen the WebUI.

The persistent deviceMid should remain available because /data is backed by the named Docker volume.

## 13. Clean installation vs full migration

### Clean installation

Use when moving to a new computer and you want fresh local state:

1. Copy/clone source.
2. Build image.
3. Run docker compose up -d zcode.
4. Let the server create a new deviceMid.
5. Log in again.
6. Configure provider/model.
7. Test Start Plan.

This is the recommended default for a different machine.

### Full state migration

Use only when you intentionally need existing ZCode sessions/configuration.

The zcode-data Docker volume contains persistent application state. Back it up and restore it deliberately rather than copying arbitrary Docker internals.

After restoring, verify that:

- the container can read /data;
- telemetry-state.json is valid;
- account/session state is still valid;
- Start Plan billing/model fetch works;
- no machine-specific state causes authentication problems.

Never copy secrets into source files just to make migration easier.

## 14. Workspace migration

The repository maps:

./workspace -> /workspace

Any project the agent should operate on must therefore be placed in the host workspace directory, or the compose mount must be intentionally changed.

Verify with:

docker compose exec zcode sh -lc 'pwd && ls -la /workspace'

The container working directory should be /workspace.

## 15. Remote access through Tailscale

The current architecture expects Tailscale on the host.

Do not add a second Tailscale client inside the ZCode container merely to make remote access work.

Expose/allow the host's TCP port 3030 as appropriate, then connect from the remote browser using the host's Tailscale address.

If the service is exposed beyond a trusted network, configure ZCODE_SERVER_AUTH_TOKEN and appropriate firewall controls.

## 16. Troubleshooting

### Start Plan Fetch failed

First check:

docker compose logs --tail=500 zcode

Then verify /data/.zcode/v2/telemetry-state.json and its deviceMid.

If the device identity is missing, verify the HTTP entrypoint contains ensureRemoteServerDeviceMid() before service creation.

### HTTP 400 parameter error

Confirm the request reaches the Start Plan billing endpoint with the expected app version and that deviceMid has been initialized.

Do not add a CAPTCHA bypass or fabricate security parameters.

### CAPTCHA / security verification appears again

Record the exact version, provider, model, HTTP status, upstream error code, request timing, and relevant container logs.

Do not implement CAPTCHA solving, token replay, fingerprint spoofing, or a proxy intended to evade the security control.

### Container starts but WebUI is blank

Check docker compose ps and docker compose logs --tail=300 zcode.

Then verify port 3030 and static root /app/web-dist.

### Container cannot see project files

Verify the compose mount ./workspace:/workspace and confirm the container working directory is /workspace.

### State disappears after restart

Check docker volume ls and verify the service contains zcode-data:/data.

Do not use an anonymous container filesystem for ZCode state.

## 17. Migration acceptance checklist

- [ ] Repository/version verified.
- [ ] Start Plan deviceMid fix present.
- [ ] Docker image builds.
- [ ] Container starts.
- [ ] WebUI opens.
- [ ] /data persists.
- [ ] telemetry-state.json exists.
- [ ] deviceMid is non-empty.
- [ ] /workspace is accessible.
- [ ] Agent server starts.
- [ ] Chromium/browser runtime is available.
- [ ] Start Plan login/configuration succeeds.
- [ ] Start Plan model selector resolves models.
- [ ] First model request succeeds.
- [ ] Second model request succeeds.
- [ ] Restart preserves state.
- [ ] Remote access works if enabled.
- [ ] No secrets were committed.

## 18. Version note

The repository baseline commit (8627594) began from a v3.14.3 source snapshot, while the successful runtime evidence recorded during the fix uses app_version=3.14.4.

When reproducing this deployment, keep the source version, Docker image version, and observed app_version aligned and record them in deployment notes. Do not claim that one version's behavior proves another version's behavior.

## 19. Final principle

The important portability requirement is not copying a particular machine's CAPTCHA/session state. It is carrying forward the server-side initialization fix so that every fresh Docker/HTTP deployment creates its own valid deviceMid before Start Plan services initialize.
