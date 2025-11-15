

# **UTG Academic Assistant**

The **UTG Academic Assistant** is a file-driven, locally controlled AI system designed for the University of The Gambia (UTG).
It allows students and lecturers to ask natural-language questions about:

* Course timetables
* Lecturers and the classes they teach
* Daily schedules
* Venues, times, departments, and more

All answers come strictly from **local timetable files** (PDF/Excel/DOCX) that the system ingests and stores in SQLite.
AI is provided through an **open model on Groq**, ensuring fast, accurate, hallucination-free responses.

---

## **Project Structure**

```text
utg-academic-assistant/
├── data/          # Raw timetable files (PDF / Excel / DOCX)
├── ingest/        # Ingestion script + file parsers
├── server/        # Node.js API (Express + SQLite + Groq)
├── tmp/           # Auto-generated SQLite DB (utg.db)
└── web/           # Vue 3 + Vite front-end chat interface
```

---

## **Requirements**

* **Node.js 20+**
* **Groq API key** (free tier works perfectly)
* macOS or Linux recommended (Windows also works)

---

## **1. Installation & Setup**

From the project root:

### **Install dependencies**

```bash
npm --prefix ingest install
npm --prefix server install
cd web && npm install && cd ..
```

---

### **Create your `.env` file (inside `/server`)**

```bash
cd server
cat > .env <<EOF
GROQ_API_KEY=your_groq_key_here
MODEL=llama-3.3-70b-versatile
ORIGIN=*
EOF
cd ..
```

---

### **Add timetable files**

Place your PDF/Excel/DOCX files in:

```
./data/
```

Example:

```
data/timetable.pdf
data/calendar.pdf
data/notices.docx
```

---

## **2. Build the SQLite database**

This reads everything under `data/` and generates:

```
tmp/utg.db
```

Run:

```bash
node ingest/ingest.js
```

You should see output like:

```
Timetable PDF: timetable.pdf -> +89
Ingestion complete -> tmp/utg.db
```

---

## **3. Run the API Server**

```bash
npm --prefix server run dev
```

Expected:

```
API on :5051
```

Health check:

```bash
curl http://localhost:5051/api/health
```

Example chat query:

```bash
curl -sS -X POST http://localhost:5051/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"Who is teaching AI?"}'
```

---

## **4. Run the Front-End (Vue 3)**

```bash
cd web
npm run dev
```

Then open:

```
http://localhost:5173
```

You can now ask questions like:

* **“Who teaches Intelligent Systems?”**
* **“Which courses is Baboucarr Drammeh teaching?”**
* **“How many courses is Pa Sulay Jobe teaching on Monday?”**
* **“Show Monday schedule for CS.”**

The system automatically interprets natural language and queries the local database.

---

## **5. Notes**

* The system is **fully file-based**:
  To update a semester, simply replace files in `data/` and run:

  ```bash
  node ingest/ingest.js
  ```

* All responses are **grounded** in the SQLite database.
  The model is instructed *not to hallucinate* and never invents schedules.

* No sensitive data is sent to third parties; only timetable text is used for interpretation.

---

## **Future Improvements (Planned)**

We are continuously enhancing the system. Here are confirmed upcoming upgrades:

### **1.Better PDF extraction**

Improve messy rows (e.g., lecturers embedded in course_code).

### **2.Admin dashboard for uploads**

A web UI in Vue to upload/remove PDF/Excel files without touching folders.

### **3. Real-time text streaming**

Live typing animation during AI responses (optional toggle).

### **4. Advanced search tools**

* “Show conflicts for lecturer X”
* “Show free rooms on Thursday”
* “Give me all courses in the morning”
* “Compare schedules for two departments”

### **5. Semester/version tracking**

Automatically support:

* Semester 1
* Semester 2
* Summer school

### **6. Better lecturer/course mapping**

AI-assisted correction of PDF parsing errors.

---



