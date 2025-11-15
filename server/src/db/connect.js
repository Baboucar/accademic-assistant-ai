// server/src/db/connect.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT   = path.resolve(__dirname, '../../..');
const DB_PATH= path.join(ROOT, 'tmp', 'utg.db');

// 1) open DB + WAL
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 2) create base tables (idempotent). Include semester columns for fresh DBs.
db.exec(`
CREATE TABLE IF NOT EXISTS timetable (
  id INTEGER PRIMARY KEY,
  dept TEXT,
  course_code TEXT,
  course_title TEXT,
  day TEXT,
  start_time TEXT,
  end_time TEXT,
  venue TEXT,
  lecturer TEXT,
  source_file TEXT,
  semester TEXT
);
CREATE TABLE IF NOT EXISTS calendar (
  id INTEGER PRIMARY KEY,
  date TEXT,
  title TEXT,
  description TEXT,
  source_file TEXT,
  semester TEXT
);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY,
  date TEXT,
  title TEXT,
  body TEXT,
  source_file TEXT,
  semester TEXT
);
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  source_file TEXT UNIQUE,
  type TEXT CHECK (type IN ('timetable','calendar','notices')),
  semester TEXT,
  ingested_at TEXT DEFAULT (datetime('now'))
);
`);

// 3) one-time migrations: add missing columns if DB was created before semester existed
for (const t of ['timetable','calendar','notices']) {
    try { db.exec(`ALTER TABLE ${t} ADD COLUMN semester TEXT`); } catch {}
}

// 4) indexes (guard each so old DBs won’t explode)
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_tt_day_dept ON timetable(day, dept)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_tt_course   ON timetable(course_code)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_tt_semester ON timetable(semester)`); } catch {}

try { db.exec(`CREATE INDEX IF NOT EXISTS idx_cal_date     ON calendar(date)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_cal_semester ON calendar(semester)`); } catch {}

try { db.exec(`CREATE INDEX IF NOT EXISTS idx_notices_semester ON notices(semester)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sources_semester ON sources(semester)`); } catch {}
