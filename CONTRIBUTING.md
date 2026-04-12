

# **CONTRIBUTING.md**

# Contributing to UTG Academic Assistant

Thank you for your interest in contributing to the UTG Academic Assistant project.

This system provides a file-driven, locally controlled AI assistant that helps students and lecturers access timetables and academic information in natural language.
Contributions from developers, designers, researchers, and students are welcome.

---

# Project Setup

## 1. Fork the Repository

Click **Fork** on GitHub and clone your fork:

```bash
git clone https://github.com/<your-username>/utg-academic-assistant.git
cd utg-academic-assistant
```

## 2. Install Dependencies

### Ingest (file parsing)

```bash
npm --prefix ingest install
```

### Server (Node API)

```bash
npm --prefix server install
```

### Web (Vue front-end)

```bash
cd web
npm install
cd ..
```

## 3. Environment Variables

Inside the `/server` folder, create a `.env` file:

```
GROQ_API_KEY=your_key_here
MODEL=llama-3.3-70b-versatile
ORIGIN=*
# Admin Basic Auth for /api/admin/* endpoints
ADMIN_USER=admin
ADMIN_PASS=change_me
```

Notes:
- Do NOT commit `.env` files to the repository.
- The admin endpoints return 503 until `ADMIN_USER` and `ADMIN_PASS` are set.

## 4. Add Timetable Files

Place PDF, Excel, or DOCX files inside:

```
/data
```

## 5. Build the Database

Run the ingestion script:

```bash
node ingest/ingest.js
```

You should see a summary of rows extracted.

## 6. Start Services

### Backend API

```bash
npm --prefix server run dev
```

### Frontend

```bash
cd web
npm run dev
```

Open:

```
http://localhost:5173/        # Chat UI
http://localhost:5173/admin   # Admin dashboard (link also in header)
```

---

# Testing Your Changes

### Test ingestion results

```bash
sqlite3 tmp/utg.db "SELECT COUNT(*) FROM timetable;"
```

### Test the API

```bash
curl -X POST http://localhost:5051/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Who teaches AI?"}'
```

### Test the UI

Open the local Vite URL (usually [http://localhost:5173](http://localhost:5173)).

Chat controls in the web UI:

- Copy any message (pill button under each bubble)
- Edit your last question (moves text back to the input and removes the last exchange)
- Stop streaming (AbortController)
- Retry last question
- Keyboard: Enter to send, Shift+Enter for newline

---

# Coding Guidelines

### JavaScript / Node

* Use ES modules (`import` / `export`)
* Use async/await consistently
* Keep functions small and maintainable
* Avoid unnecessary console logs
* Use Node's global `fetch` (Undici) for HTTP; do not add `node-fetch`
* Prefer centralized error handling via Express error middleware
* Keep streaming code SSE-compatible (ReadableStream with `body.getReader()`)

### Vue 3

* Use `<script setup>`
* Keep components focused and reusable
* Use composable functions for shared logic
* Use Vue Router for navigation (routes: `/` for Chat, `/admin` for Admin)
* Support the theme toggle (Light/Dark/System); theme preference persists in `localStorage`

### SQLite Database

* Keep schema flat and simple
* Add indexes for frequently used fields
* Store only structured, cleaned data

### Ingestion

* Parsers should be deterministic
* Remove noise and formatting inconsistencies
* Avoid storing raw unprocessed PDF text

### Security & Secrets

* Never commit API keys or `.env` files
* Validate and sanitize user input at the API layer
* Keep admin credentials strong; rotate when needed

---

# Pull Request Guidelines

Before submitting a PR:

1. Provide a clear description of the change
2. Keep PRs small and focused on one issue
3. Update documentation where needed
4. Ensure the following still work:

    * ingestion
    * server API
    * front-end UI
5. Use descriptive commit messages
6. Manually verify:
   - Chat streaming works (send a question, try Stop/Retry)
   - Copy/Edit buttons behave as expected
   - Admin route loads and endpoints work when credentials are set
   - Ingestion still builds `tmp/utg.db`

Branching & commits:

- Branch from `main` using `feature/<short-name>` or `fix/<short-name>`
- Keep commits small and logically grouped; prefer imperative style, e.g. `feat(web): add copy/edit pill buttons`

---

# Suggested Areas for Contribution

The following are areas where contributions are especially valuable:

### 1. Improved PDF Parsing

* Extract course titles, lecturers, venues, departments more reliably
* Handle inconsistent formatting
* Support additional timetable styles

### 2. Admin Dashboard for File Management

* Upload new timetable files from the browser
* Remove old files
* Trigger ingestion from the UI
* View currently ingested sources

### 3. Lecturer and Course Queries

Add support for:

* “Which courses does this lecturer teach?”
* “How many courses is this lecturer teaching today?”
* “List all course conflicts for a lecturer or venue”

### 4. Advanced Search Capabilities

Examples:

* Free rooms for a given time
* Morning/evening classes
* Schedule comparisons across departments

### 5. Better Slot Extraction

Improve interpretation of:

* Lecturer names
* Course titles (two-word titles like “Intelligent Systems”)
* Departments
* Date and time detection

### 6. Multiple Semester Support

* Store a semester or academic year label
* Switch timetables from the UI

### 7. Docker Support

Create `docker-compose` for:

* ingestion
* API server
* front-end

### 8. Front-End Improvements

* Dark/Light theme refinements and persistence
* Better mobile responsiveness
* Improved layouts and typography

---

# Developer Workflow (Quick Reference)

1. Install deps: `npm --prefix ingest i && npm --prefix server i && (cd web && npm i && cd ..)`
2. Prepare `.env` in `/server` (see above)
3. Put files in `data/` and run: `node ingest/ingest.js`
4. Start API: `npm --prefix server run dev`
5. Start web: `cd web && npm run dev`
6. Test: open `http://localhost:5173` (Chat) and `http://localhost:5173/admin` (Admin)
7. When submitting a PR, include a brief test plan in the description

---

# Asking Questions or Reporting Issues

Please open an issue on GitHub describing:

* The problem
* How to reproduce it
* Sample files (if applicable)

Issues will be reviewed promptly.

---

# Thank You

Your contribution helps create a modern, accessible, and free academic assistant for UTG students and lecturers. The project is open-source so that anyone in The Gambia or beyond can improve, extend, or adapt it.

