import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { parseExcelTimetable } from './parsers/excel.js';
import { parseCalendarPdf, parseTimetablePdf } from './parsers/pdf.js';
import { parseDocxNotice } from './parsers/docx.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT   = path.resolve(__dirname, '..');
const DATA   = path.join(ROOT, 'data');
const DB_PATH= path.join(ROOT, 'tmp', 'utg.db');
const SCHEMA = path.join(ROOT, 'server', 'src', 'db', 'schema.sql');

fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
const db = new Database(DB_PATH);
db.exec(fs.readFileSync(SCHEMA, 'utf8'));

// Optional: runtime add columns if older DB existed
try { db.exec(`ALTER TABLE timetable ADD COLUMN semester TEXT`); } catch {}
try { db.exec(`ALTER TABLE calendar  ADD COLUMN semester TEXT`); } catch {}
try { db.exec(`ALTER TABLE notices   ADD COLUMN semester TEXT`); } catch {}

// Semester tag (set via env or default)
const SEMESTER = process.env.SEMESTER || '2025-2026 S1';

// Upsert file into sources
const upsertSource = db.prepare(`
  INSERT INTO sources (source_file, type, semester)
  VALUES (@source_file, @type, @semester)
  ON CONFLICT(source_file) DO UPDATE SET semester=excluded.semester, ingested_at=datetime('now')
`);

// Clean per file
const delBySource = {
    timetable: db.prepare(`DELETE FROM timetable WHERE source_file = ?`),
    calendar:  db.prepare(`DELETE FROM calendar  WHERE source_file = ?`),
    notices:   db.prepare(`DELETE FROM notices   WHERE source_file = ?`)
};

// Inserts with semester
const insTT = db.prepare(`
  INSERT INTO timetable (dept,course_code,course_title,day,start_time,end_time,venue,lecturer,source_file,semester)
  VALUES (?,?,?,?,?,?,?,?,?,?)
`);
const insCal = db.prepare(`
  INSERT INTO calendar (date,title,description,source_file,semester)
  VALUES (?,?,?,?,?)
`);
const insN = db.prepare(`
  INSERT INTO notices (date,title,body,source_file,semester)
  VALUES (?,?,?, ?,?)
`);

function deptGuessFromName(f){
    const s=f.toLowerCase();
    if(s.includes('cs'))  return 'CS';
    if(s.includes('ins')) return 'INS';
    if(s.includes('ict')) return 'ICT';
    if(s.includes('tel')) return 'TEL';
    if(s.includes('cps')) return 'CPS';
    return 'UNKNOWN';
}

(async ()=>{
    const files = fs.existsSync(DATA) ? fs.readdirSync(DATA) : [];
    for (const base of files) {
        const f = path.join(DATA, base);

        if (/\.(xlsx|xls)$/i.test(base)) {
            upsertSource.run({ source_file: base, type: 'timetable', semester: SEMESTER });
            delBySource.timetable.run(base);

            const rows = parseExcelTimetable(f, deptGuessFromName(base));
            rows.forEach(r => insTT.run(...r, base, SEMESTER));
            console.log(`Excel: ${base} -> +${rows.length}`);

        } else if (/\.pdf$/i.test(base)) {
            if (base.toLowerCase().includes('calendar')) {
                upsertSource.run({ source_file: base, type: 'calendar', semester: SEMESTER });
                delBySource.calendar.run(base);

                const rows = await parseCalendarPdf(f);
                rows.forEach(r => insCal.run(...r, base, SEMESTER));
                console.log(`Calendar PDF: ${base} -> +${rows.length}`);
            } else {
                upsertSource.run({ source_file: base, type: 'timetable', semester: SEMESTER });
                delBySource.timetable.run(base);

                const rows = await parseTimetablePdf(f, deptGuessFromName(base));
                rows.forEach(r => insTT.run(...r, base, SEMESTER));
                console.log(`Timetable PDF: ${base} -> +${rows.length}`);
            }

        } else if (/\.docx$/i.test(base)) {
            upsertSource.run({ source_file: base, type: 'notices', semester: SEMESTER });
            delBySource.notices.run(base);

            const rows = await parseDocxNotice(f);
            rows.forEach(r => insN.run(...r, base, SEMESTER));
            console.log(`Notice DOCX: ${base} -> +${rows.length}`);

        } else {
            console.log(`Skipping ${base}`);
        }
    }
    console.log('Ingestion complete -> tmp/utg.db');
})();
