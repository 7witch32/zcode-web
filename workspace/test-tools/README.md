# Mini Task Manager

A minimal todo web app (Express + JSON-file storage + vanilla JS frontend), built as an
end-to-end test vehicle for agent tooling. No build step required.

## Features

- Add / list / complete / delete tasks
- Filters: All / Active / Completed
- Remaining-items counter and empty states per filter
- REST API with input validation
- Automated API tests (`node --test`) and browser E2E tests (Puppeteer + system Chromium)
- ESLint

## Requirements

- Node.js >= 20
- Chromium (only for the E2E test; override the path with `CHROMIUM_PATH`)

## Install

```bash
npm install
```

## Run

```bash
npm start
# then open http://localhost:3000
```

Dev mode with auto-reload on file changes:

```bash
npm run dev
```

Configuration:

| Variable     | Default              | Purpose                                        |
| ------------ | -------------------- | ---------------------------------------------- |
| `MTM_PORT`   | `3000`               | HTTP port (not `PORT`, which sandboxes may set) |
| `DATA_FILE`  | `./data/tasks.json`  | JSON storage location                           |

## API

| Method   | Path               | Body / Result                                                                 |
| -------- | ------------------ | ------------------------------------------------------------------------------ |
| `GET`    | `/api/tasks`       | → `200 { "tasks": [...] }`                                                     |
| `POST`   | `/api/tasks`       | `{ "title": "..." }` → `201` task; `400` on invalid title                       |
| `PATCH`  | `/api/tasks/:id`   | `{ "title"?, "completed"? }` → `200` updated task; `400`/`404` on bad input      |
| `DELETE` | `/api/tasks/:id`   | → `200 { "deleted": true }`; `404` if unknown (a 200 body is used because Chromium marks empty 204 responses over keep-alive as `net::ERR_ABORTED`) |

Task shape: `{ id, title, completed, createdAt }`. Titles are trimmed, must be non-empty
and at most 200 characters. Data persists to the JSON file with atomic write (tmp + rename).

## Test

```bash
npm test          # API tests (node:test), 9 tests
node tests/e2e.mjs # browser E2E against its own server instance, 22 checks
```

The E2E script starts its own server on an ephemeral port with a temp data file, drives
the real UI (add → complete → filter → delete), checks console/page/network errors and
verifies the mobile (375px) responsive layout.

## Lint

```bash
npm run lint
```

## Project layout

```
server.js            entry point (reads MTM_PORT, starts the app)
src/app.js           Express app + API routes + validation
src/storage.js       JSON-file storage (load/save/CRUD)
public/              static frontend (index.html, styles.css, app.js, favicon.svg)
tests/api.test.js    API tests (node:test)
tests/e2e.mjs        browser E2E (puppeteer-core + system Chromium)
testing/             test protocol and report documents
```
