# ZCode Web

A Docker-based ZCode backend with persistent application state, a restricted internal Docker API proxy, and local WebUI patches maintained separately from upstream ZCode.

## Architecture overview

`	ext
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
`

The client-facing path is port 3030. The Docker API remains internal to the Docker network; LAN/Tailscale clients do not connect to the Docker API directly. Tailscale runs on the Windows host rather than inside the ZCode container.

## Current local behavior

- **Persistent sessions:** ZCode session data is stored under /data so application-container recreation does not intentionally erase state.
- **Global Sidebar sessions:** persisted sessions from unopened workspaces are discoverable from the global Sidebar after cold start.
- **Cross-session live status:** sessions running or waiting for interaction remain visibly up to date while another workspace/session is open.
- **Global pinned sessions:** pinning a session keeps it visible in the global Pinned section even when it belongs to another workspace.
- **iPhone/iPad focus:** the chat prompt uses a touch-device 16px editable font boundary to prevent iOS Safari focus zoom.
- **Mobile Sidebar:** portrait touch toggle, left-edge swipe-to-open, push layout, and viewport-sized New Session behavior are preserved.
- **Docker API proxy:** ZCode can manage Docker Desktop through the restricted internal proxy without publishing the Docker API.

## Documentation

- docs/LOCAL_PATCHES.md - source of truth for protected local behavior and upgrade checks.
- docs/GLOBAL_SESSION_SIDEBAR_SPEC.md - architecture/specification for global session discovery.
- docs/SETUP_AND_PATCH_GUIDE.md - setup, Docker deployment, build, verification, and upstream update workflow.
- docs/DOCKER_PROXY_PLAN.md - Docker API Proxy design/reference.

## Important: persistent data

Do **not** delete or reset the /data volume when rebuilding or updating the application container. The application container may be recreated; persistent application state must remain intact.

## Quick start

For a fresh setup or upstream update, follow docs/SETUP_AND_PATCH_GUIDE.md. The guide covers the full operational workflow rather than duplicating commands here.

## Repository maintenance

Keep the repository focused on durable source changes and documentation. Remove one-off implementation plans, temporary test files, generated build output, logs, and secrets before committing.

When a protected local behavior changes:

1. Update docs/LOCAL_PATCHES.md.
2. Verify the affected behavior.
3. Rebuild/recreate only the application container as required.
4. Confirm the container is healthy and the WebUI endpoint responds.
5. Commit the verified changes.
