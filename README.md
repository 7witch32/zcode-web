# ZCode Web

A Docker-based ZCode backend with a persistent application data volume and local patches maintained separately from the upstream ZCode source.

## What this repository is

This repository is used to run ZCode as a Docker backend while keeping local changes reproducible across upstream updates.

Key goals:

- Run ZCode through Docker.
- Keep application state persistent in `/data`.
- Keep local fixes documented and easy to reapply after upstream updates.
- Provide mobile access through the existing ZCode web interface.

## Architecture overview

ZCode Web is deployed as a Docker-based backend. The browser/mobile client connects to the WebUI through the Windows host, while ZCode reaches Docker Desktop through an isolated internal API proxy.

```text
Browser / iPhone / iPad
        |
        | Tailscale (remote) or LAN (local)
        v
Windows host / Docker Desktop
        |
        | published port 3030
        v
+-------------------------------+
| zcode-web container            |
| ZCode WebUI + backend          |
|                                |
| /data  <- persistent volume    |
| /workspace <- local workspace  |
+---------------+---------------+
                |
                | DOCKER_HOST=tcp://docker-api-proxy:2375
                | internal Docker network only
                v
+-------------------------------+
| zcode-docker-api-proxy         |
| restricted Docker API proxy    |
+---------------+---------------+
                |
                | /var/run/docker.sock
                v
        Docker Desktop Engine
                |
                +-- project/test containers
```

### Request and execution flow

1. **Client access:** A browser or mobile device opens the ZCode WebUI. For remote access, traffic reaches the Windows host through Tailscale; Tailscale itself runs on the host rather than inside the ZCode container.
2. **WebUI/backend:** The `zcode-web` container publishes port `3030`. The client does not connect directly to the Docker API.
3. **Persistent state:** `/data` is backed by the `zcode-data` Docker volume, so recreating the application container does not intentionally erase ZCode state, sessions, or configuration stored there.
4. **Workspace:** `./workspace` is mounted at `/workspace` for the working files used by ZCode.
5. **Docker control:** When ZCode needs to create, inspect, start, stop, execute in, or otherwise manage Docker resources, its Docker client uses `DOCKER_HOST=tcp://docker-api-proxy:2375`.
6. **Isolation:** The API proxy is connected to the dedicated internal `docker-control` network and has **no published host port**. External LAN/Tailscale clients therefore cannot use the Docker API directly.
7. **Docker Desktop:** The proxy is the only service that mounts `/var/run/docker.sock`; it forwards only the Docker API capabilities enabled by its configuration to the Docker Desktop Engine.

This separation keeps the public ZCode access path (`3030`) independent from the Docker control path. The Docker API is intended to remain an internal container-to-container connection.
## What has been changed

This repository contains the local Docker deployment and the changes needed for the current ZCode Web setup:

- **Docker backend:** packaged ZCode as `zcode-web` with persistent `/data` and `/workspace` mounts.
- **Session persistence:** keeps the ZCode CLI session database under `/data` so container recreation does not lose session state.
- **Docker API access:** added a restricted internal Docker API Proxy so ZCode can manage Docker Desktop without exposing the Docker API to LAN/Tailscale clients.
- **Mobile Sidebar:** fixed iPhone/phone Sidebar toggle and left-edge swipe-to-open behavior, including correct push layout and protection against mobile flex shrinking.
- **Operational docs:** added setup/upgrade instructions and a maintained local-patch registry so these changes can be checked and reapplied after upstream updates.

For implementation details, affected source files, rationale, verification history, and upgrade guidance, see the documents below.
## Documentation

- [`docs/SETUP_AND_PATCH_GUIDE.md`](docs/SETUP_AND_PATCH_GUIDE.md) — complete setup, Docker deployment, patching, build, verification, and upgrade workflow.
- [`docs/LOCAL_PATCHES.md`](docs/LOCAL_PATCHES.md) — single source of truth for local patches, including rationale, affected files, implementation details, and protected behavior.
- [`docs/DOCKER_PROXY_PLAN.md`](docs/DOCKER_PROXY_PLAN.md) — Docker API Proxy plan and related design notes.

## Important: persistent data

Do **not** delete or reset the `/data` volume when rebuilding or updating the application container. The application container may be recreated; persistent application state must remain intact.

## Local patches

Local behavior that differs from upstream is documented in `docs/LOCAL_PATCHES.md`. Before updating the upstream ZCode source, review that file and verify whether each protected behavior is still required or has been implemented upstream.

The current maintained patch includes the iPhone/mobile Sidebar behavior, including portrait toggle support, left-edge swipe-to-open, correct Sidebar layout behavior, and protection against mobile flex shrinking.

## Quick start

For a fresh setup or an upstream update, follow:

[`docs/SETUP_AND_PATCH_GUIDE.md`](docs/SETUP_AND_PATCH_GUIDE.md)

The guide covers the full workflow rather than duplicating operational commands here.

## Repository maintenance

Keep the repository focused on durable source changes and documentation. One-off implementation plans, temporary test files, generated build output, logs, and secrets should not be kept as permanent project documentation.

When a local patch is changed:

1. Update `docs/LOCAL_PATCHES.md`.
2. Verify the affected behavior.
3. Rebuild/recreate only the application container as required.
4. Confirm the container is healthy and the web endpoint responds.
5. Commit the verified changes once Git is initialized for the repository.
