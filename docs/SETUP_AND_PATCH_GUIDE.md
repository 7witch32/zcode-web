# ZCode Web — Setup & Local Patch Guide

## 1. Purpose

This is the single operational guide for taking the project from the official ZCode source repository to this Docker deployment, applying local fixes, building it, and maintaining those fixes across upstream updates.

Detailed patch registry: `docs/LOCAL_PATCHES.md`.

## 2. Get the official source

```powershell
git clone <OFFICIAL_ZCODE_REPOSITORY_URL> zcode-web
Set-Location zcode-web
git rev-parse HEAD
git describe --tags --always
```

Record the exact upstream tag/commit before applying local changes.

## 3. Create the local deployment branch

```powershell
git switch -c local/zcode-web
git add -A
git commit -m "chore: baseline upstream ZCode source"
```

Do not commit unrelated or secret files.

## 4. Prepare Docker deployment

Keep the Docker-specific files required by this deployment, including `Dockerfile` and `docker-compose.yml`.

The service should expose port `3030`, persist application state under `/data`, and use the existing `/workspace` mount.

## 5. Apply local patches

Use `docs/LOCAL_PATCHES.md` as the authoritative and complete patch registry.

For each patch, inspect the current upstream source first. If upstream already contains an equivalent fix, do not duplicate it. Otherwise re-apply the documented local behavior deliberately.

The current iPhone Sidebar patch protects portrait touch toggle, left-edge swipe, Sidebar push layout, New Session viewport sizing, and the mobile toggle hit target. The exact source-level implementation and history are all in `LOCAL_PATCHES.md`.

Do not create a second Sidebar or second session/state store.

## 6. Build and start

```powershell
docker compose build zcode
docker compose up -d zcode
docker compose ps
docker compose logs --tail=200 zcode
```

Expected WebUI: `http://localhost:3030`

## 7. Persistent-state rule

Source/UI patches must never require deleting or resetting `/data`.

Normal source updates should recreate only the application container when necessary:

```powershell
docker compose up -d --force-recreate zcode
```

Do not use destructive Docker volume commands during normal upgrades.

## 8. Verify patches

On a real phone in portrait:

1. Tap Sidebar toggle; confirm open and close.
2. Start a finger within about 24px of the left edge and swipe right at least about 48px; confirm Sidebar opens.
3. Drag vertically; confirm normal scrolling.
4. Open Sidebar; confirm New Session/content is pushed rather than overlaid.
5. Confirm New Session keeps normal viewport width.
6. Confirm the toggle is easy to touch.

Also verify desktop/tablet behavior, container health, HTTP 3030, and persistent sessions/configuration.

## 9. Commit verified changes

```powershell
git status
git diff
git add -A
git commit -m "fix: preserve local ZCode Web patches"
```

Optionally tag a known-good deployment:

```powershell
git tag zcode-web-known-good-<version>
```

## 10. Future upstream upgrades

Before upgrading:

```powershell
git status
git add -A
git commit -m "chore: checkpoint before upstream update"
```

Bring in the new upstream tag/commit, then inspect every protected file against `docs/LOCAL_PATCHES.md`.

After re-applying or reconciling patches: build, recreate the application container without deleting `/data`, verify health/WebUI, run the real iPhone Sidebar tests, update `LOCAL_PATCHES.md` with the merge/verification result, and commit.

## 11. Permanent documentation

Keep the repository focused. One-off implementation plans, temporary test files, logs, generated output, and machine secrets do not belong in the permanent docs.

Permanent operational docs:

- `README.md` — repository overview and entry point.
- `docs/SETUP_AND_PATCH_GUIDE.md` — this end-to-end guide.
- `docs/LOCAL_PATCHES.md` — complete local patch registry and history.
- `docs/DOCKER_PROXY_PLAN.md` — Docker proxy reference.

## 12. First remote push

After creating an empty remote repository:

```powershell
git remote add origin <YOUR_REPOSITORY_URL>
git branch -M main
git push -u origin main
```

Do not commit or push secrets, Docker volumes, `.env` files, or runtime state.
