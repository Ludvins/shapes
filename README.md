# Shapes

Cooperative hidden-hand deduction card game prototype.

## Current Scope

- Pure TypeScript game engine.
- Local web debug prototype.
- Two-player shared draft row.
- Objective cards and scoring.
- Local browser persistence.
- Multiplayer room server with redacted player views, room version checks, SSE updates, and JSON-file room persistence.

## Commands

```bash
npm install
npm run test
npm run build
npm run dev
```

Run the server after building:

```bash
npm --workspace apps/server run start
```

Server default:

```text
http://127.0.0.1:8787
```

For LAN testing, bind both servers to all interfaces:

```bash
HOST=0.0.0.0 PORT=8787 npm --workspace apps/server run start
HOST=0.0.0.0 PORT=4175 npm run serve:dist
```

On Windows PowerShell:

```powershell
$env:HOST="0.0.0.0"; $env:PORT="8787"; npm --workspace apps/server run start
$env:HOST="0.0.0.0"; $env:PORT="4175"; npm run serve:dist
```

The server persists rooms to `data/rooms.json` by default. Override with `SHAPES_ROOMS_FILE=/path/to/rooms.json`.

Static preview after build:

```bash
npm run serve:dist
```

Static app default:

```text
http://127.0.0.1:4175
```

## Deployment

Frontend:

- `.github/workflows/pages.yml` builds `apps/web` and deploys `apps/web/dist` to GitHub Pages.
- Set the GitHub repository variable `VITE_DEFAULT_SERVER_URL` to the deployed server URL, for example `https://shapes-server.onrender.com`.

Backend:

- `render.yaml` defines a Render web service for `apps/server`.
- Render supplies `PORT`; `HOST=0.0.0.0` is set in the service config.
- The included free-tier config stores rooms at `/tmp/shapes-rooms.json`; use a persistent disk or external database for longer playtests.
- Create it from the Render dashboard with **New > Blueprint**, pick this repo, and accept the `shapes-server` service from `render.yaml`.
- After the first deploy, open `https://your-service.onrender.com/health`; it should return `{ "ok": true, ... }`.
- Put that Render URL in the GitHub repo variable `VITE_DEFAULT_SERVER_URL`, then run the Pages workflow.

Invite links use query parameters:

```text
/?mode=online&server=https://shapes-server.onrender.com&room=HEX-154
```

## Server API

```text
GET  /health
POST /rooms
GET  /rooms/:roomId?playerId=:roomPlayerId
POST /rooms/:roomId/join
POST /rooms/:roomId/start
POST /rooms/:roomId/actions
GET  /rooms/:roomId/view?playerId=:roomPlayerId
GET  /rooms/:roomId/events?playerId=:roomPlayerId
```

Room responses use redacted client views. Active rooms do not return full `gameState` through the web API; each player receives a `gameView` with their own hand identities hidden and teammate hands visible.
