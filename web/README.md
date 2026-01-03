# UTG Academic Assistant — Web UI

This is the Vue 3 + Vite front‑end for the UTG Academic Assistant. It provides a lightweight chat interface to query the local timetable database exposed by the Node/Express server.

## Run

```
npm install
npm run dev
```

Open http://localhost:5173

## Features

- Dark/Light theme toggle (with system preference fallback and persistence)
- Router‑based navigation with a dedicated Admin route (`/admin`)
- Streaming chat UI (Server‑Sent Events)
- Controls:
  - Copy any message (per‑message pill button)
  - Edit your last question (moves text back to the input and removes last exchange)
  - Stop streaming (AbortController)
  - Retry last question
  - Keyboard: Enter to send, Shift+Enter for newline

## Config

The API base defaults to `http://localhost:5051`. You can override via Vite env:

```
VITE_API_BASE=http://localhost:5051
```

Create a `.env` file in the project root or start with `VITE_API_BASE` in your shell.

## Notes

- The Admin route is available at `/admin` but is not shown as a primary tab. Use the header link.
- Theme selection is stored in `localStorage` under `theme` (values: `light`, `dark`, `system`).
