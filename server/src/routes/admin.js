import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db/connect.js';

export const admin = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const DATA = path.join(ROOT, 'data');

fs.mkdirSync(DATA, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, DATA),
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/[^\w.\-+]/g, '_');
        cb(null, safe);
    }
});
const upload = multer({ storage });

admin.get('/sources', (req, res) => {
    try {
        const rows = db.prepare(`
      SELECT type, source_file, semester, ingested_at 
      FROM sources ORDER BY ingested_at DESC
    `).all();
        res.json({ sources: rows });
    } catch {
        res.json({ sources: [] });
    }
});

admin.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { type = 'timetable', semester = '', reingest = '1' } = req.body;
        const base = req.file?.filename;
        if (!base) return res.status(400).json({ error: 'file is required' });
        if (!['timetable','calendar','notices'].includes(type)) {
            return res.status(400).json({ error: 'bad type' });
        }

        db.prepare(`
      INSERT INTO sources (source_file, type, semester)
      VALUES (?, ?, ?)
      ON CONFLICT(source_file) DO UPDATE SET semester=excluded.semester, ingested_at=datetime('now')
    `).run(base, type, semester || null);

        if (reingest === '1') {
            const { spawn } = await import('node:child_process');
            const env = { ...process.env, SEMESTER: semester || process.env.SEMESTER || '', ONLY_FILE: base };
            spawn(process.execPath, ['ingest/ingest.js'], { cwd: ROOT, env });
        }

        res.json({ ok: true, file: base, type, semester: semester || null });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'upload failed' });
    }
});

admin.delete('/source/:file', (req, res) => {
    const file = req.params.file;
    if (!file) return res.status(400).json({ error: 'file required' });

    const delTT = db.prepare(`DELETE FROM timetable WHERE source_file=?`);
    const delCal= db.prepare(`DELETE FROM calendar  WHERE source_file=?`);
    const delNo = db.prepare(`DELETE FROM notices   WHERE source_file=?`);
    const delSrc= db.prepare(`DELETE FROM sources   WHERE source_file=?`);

    const changes = delTT.run(file).changes + delCal.run(file).changes + delNo.run(file).changes;
    delSrc.run(file);

    if (req.query.deleteFile === '1') {
        try { fs.unlinkSync(path.join(DATA, file)); } catch {}
    }
    res.json({ ok: true, removed_rows: changes, file });
});

admin.post('/reingest', async (req, res) => {
    const { file, semester } = req.body || {};
    try {
        const { spawn } = await import('node:child_process');
        const env = { ...process.env, SEMESTER: semester || process.env.SEMESTER || '' };
        if (file) env.ONLY_FILE = file;
        spawn(process.execPath, ['ingest/ingest.js'], { cwd: ROOT, env });
        res.json({ ok: true, started: true, file: file || null, semester: env.SEMESTER || null });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'reingest failed' });
    }
});
