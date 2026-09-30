# ZCode Docker

A Docker-based ZCode backend with a persistent application data volume and local patches maintained separately from the upstream ZCode source.

## What this repository is

This repository is used to run ZCode as a Docker backend while keeping local changes reproducible across upstream updates.

Key goals:

- Run ZCode through Docker.
- Keep application state persistent in `/data`.
- Keep local fixes documented and easy to reapply after upstream updates.
- Provide mobile access through the existing ZCode web interface.

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
