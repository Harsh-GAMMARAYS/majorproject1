# Manual Run Instructions

This file covers the manual startup flow for the app after the recent study-room and PostgreSQL changes.

## Current Assumptions

- Project root: `/home/gamma/majorproject1`
- Python virtualenv: `.venv`
- Frontend lives in `frontend/`
- App PostgreSQL container is expected on port `5433`
- Existing unrelated PostgreSQL on `5432` may already be in use on your machine

## One-Time Setup

### 1. Start Docker Desktop

Make sure Docker Desktop is running before using `docker compose`.

### 2. Start PostgreSQL for this app

Run from the project root:

```bash
POSTGRES_PORT=5433 docker compose up -d postgres
```

This app uses:

```bash
postgresql://postgres:postgres@localhost:5433/majorproject1
```

### 3. Activate the virtual environment

```bash
cd /home/gamma/majorproject1
source .venv/bin/activate
```

### 4. Load environment variables

If you already have `.env`, load it:

```bash
source .env
```

Then set the room database explicitly:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/majorproject1
```

### 5. Ensure WebSocket support is installed

Study rooms require a WebSocket backend for live sync. If you have not refreshed dependencies after the auth and room changes, run:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

## Start The Servers Manually

Open three terminals.

### Terminal 1: Inference Server

```bash
cd /home/gamma/majorproject1
source .venv/bin/activate
source .env 2>/dev/null || true
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/majorproject1
.venv/bin/python -m uvicorn src.InferenceServer:app --host 0.0.0.0 --port 8000 --reload
```

Expected health check:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

### Terminal 2: Backend API

```bash
cd /home/gamma/majorproject1
source .venv/bin/activate
source .env 2>/dev/null || true
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/majorproject1
.venv/bin/python -m uvicorn src.server:app --host 0.0.0.0 --port 5000 --reload
```

Expected health check:

```bash
curl http://127.0.0.1:5000/health
```

Expected response:

```json
{"status":"healthy"}
```

### Terminal 3: Frontend

```bash
cd /home/gamma/majorproject1/frontend
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open in browser:

- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:5000/docs`

## Stop The Servers

Use `Ctrl+C` in each terminal where the server is running.

To stop only this app's PostgreSQL container:

```bash
POSTGRES_PORT=5433 docker compose stop postgres
```

## Quick Smoke Test

### Core App

1. Open `http://localhost:3000`
2. Upload 1 or 2 files
3. Wait for files to become `processed`
4. Test:
   - query
   - deep query
   - knowledge graph
   - summarize
   - outline
   - FAQ
   - quiz
   - flashcards

### Study Rooms

1. Open `/rooms`
2. Create a room
3. Open the same room in another browser/incognito window
4. Join using a different name
5. Verify:
   - shared chat sync
   - room context file sync
   - room query / deep query sync
   - room artifact sync
   - reconnect restores room state

## Common Issues

### Port `5432` already in use

Use `5433` as documented above. This repo is already configured to work with that through `DATABASE_URL`.

### Frontend starts but backend fails

Usually one of:

- `DATABASE_URL` not exported
- PostgreSQL container not running
- dependencies not installed in `.venv`

### Inference server fails on model loading

Check:

- `GROQ_API_KEY` is present in `.env`
- local model dependencies were installed successfully
- first-time model downloads may take time

### Study rooms work poorly or fail

Check:

- backend is using `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/majorproject1`
- `/rooms` endpoints are visible in `http://localhost:5000/docs`
- WebSocket path is reachable:
  - `ws://localhost:5000/rooms/{room_id}/ws?token={access_token}`

### `Unsupported upgrade request` or room socket returns `404`

This means `uvicorn` is running without a supported WebSocket backend.

Fix it with:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

or directly:

```bash
.venv/bin/python -m pip install websockets
```
