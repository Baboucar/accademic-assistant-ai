// ingest/parsers/pdf.js
import fs from 'fs';
import pdfParse from 'pdf-parse';

/* ----------------------------- helpers ----------------------------- */
const DAY_MAP = {
    MONDAY:'Mon', MONDAYS:'Mon',
    TUESDAY:'Tue', TUESDAYS:'Tue',
    WEDNESDAY:'Wed', WEDNESDAYS:'Wed',
    THURSDAY:'Thu', THURSDAYS:'Thu',
    FRIDAY:'Fri', FRIDAYS:'Fri',
    SATURDAY:'Sat', SATURDAYS:'Sat',
    SUNDAY:'Sun', SUNDAYS:'Sun'
};

function parseTimes(segment) {
    // accept digits, colon, dash, space, am/pm
    const cleaned = segment.replace(/[^0-9:\s\-–apm]/gi, '');
    const m = cleaned.match(/(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})/i);
    if (!m) return [null, null];
    const to24 = (t) => {
        const [h, min] = t.split(':').map(s => s.trim());
        return `${h.padStart(2,'0')}:${min}`;
    };
    return [to24(m[1]), to24(m[2])];
}

function normalizeVenue(s) {
    return s.replace(/\s*\n\s*/g,' ').replace(/\s{2,}/g,' ').trim();
}

const CODE_RE    = /[A-Z]{2,4}\s*\d{3}(?:\s*\/\s*[A-Z]{2,4}\s*\d{3})?/g;
const HEADER_RE  = /^(MONDAY|MONDAYS|TUESDAY|TUESDAYS|WEDNESDAY|WEDNESDAYS|THURSDAY|THURSDAYS|FRIDAY|FRIDAYS|SATURDAY|SATURDAYS|SUNDAY|SUNDAYS)\b.*?(\d{1,2}:\d{2}.*)$/i;
const SPLIT_COLS = (line) => line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);

function splitByCodes(merged) {
    const matches = [...merged.matchAll(CODE_RE)];
    if (matches.length <= 1) return [merged];
    const chunks = [];
    for (let idx = 0; idx < matches.length; idx++) {
        const start = matches[idx].index;
        const end = (idx + 1 < matches.length) ? matches[idx + 1].index : merged.length;
        chunks.push(merged.slice(start, end).trim());
    }
    return chunks;
}

/* --------------------- 1) Timetable PDF -> rows --------------------- */
/**
 * Returns array of rows:
 * [dept, course_code, course_title, day3, start_time, end_time, venue, lecturer]
 */
export async function parseTimetablePdf(pathToPdf, deptGuess='UNKNOWN') {
    const data = await pdfParse(fs.readFileSync(pathToPdf));
    const rawLines = data.text.split('\n');

    let day3 = null;
    let start_time = null;
    let end_time = null;
    const out = [];

    let i = 0;
    while (i < rawLines.length) {
        let line = rawLines[i].trim();
        if (!line) { i++; continue; }

        // header like: MONDAYS 08:30 - 11:00 ...
        const h = line.match(HEADER_RE);
        if (h) {
            day3 = DAY_MAP[h[1].toUpperCase()] || null;
            const [s,e] = parseTimes(line);
            start_time = s; end_time = e;
            i++; continue;
        }

        // skip obvious headers
        if (/^(s\/?n|code|title|lecturer|venue)\b/i.test(line)) { i++; continue; }
        if (/^\d+\s*$/.test(line)) { i++; continue; } // bare numbering

        // remove leading serial numbers like "12  ICT 202 …"
        line = line.replace(/^\d+\s+/, '');

        // must contain a course code
        if (!/[A-Z]{2,4}\s*\d{3}/.test(line)) { i++; continue; }

        // accumulate columns across wrapped lines until at least 4 cols or new header
        let merged = line;
        let parts = SPLIT_COLS(merged);
        while (parts.length < 4 && i + 1 < rawLines.length) {
            const next = rawLines[i+1].trim();
            if (HEADER_RE.test(next)) break;
            i++;
            merged = (merged + ' ' + next).replace(/\s{2,}/g,' ');
            parts = SPLIT_COLS(merged);
        }

        // split if multiple course codes are packed together
        const chunks = splitByCodes(merged);
        for (const chunk of chunks) {
            let p = SPLIT_COLS(chunk);

            // compact extras into venue tail
            if (p.length > 4) {
                const [code, title, lecturer, ...rest] = p;
                p = [code, title, lecturer, rest.join(' ')];
            }

            const [code, title, lecturer='', venueRaw=''] = p;
            if (!code || !/[A-Z]{2,4}\s*\d{3}/.test(code)) continue;
            const venue = normalizeVenue(venueRaw);

            // handle "CPS 416/ CPS 313" duplication
            const individualCodes = code.split('/').map(s => s.trim()).filter(Boolean);
            for (const c of individualCodes) {
                out.push([
                    deptGuess,
                    c,
                    title || '',
                    day3 || '',
                    start_time || '',
                    end_time || '',
                    venue,
                    lecturer
                ]);
            }
        }

        i++;
    }

    return out;
}

/* ---------------------- 2) Calendar PDF -> rows --------------------- */
/**
 * Returns array of rows: [dateISO, title, description]
 */
export async function parseCalendarPdf(pathToPdf){
    const buf = fs.readFileSync(pathToPdf);
    const data = await pdfParse(buf);
    const lines = data.text.split('\n').map(s => s.trim()).filter(Boolean);

    const rows = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (isLikelyDateLine(line)) {
            const iso = toISODate(line) || '';

            // title: next non-empty, non-date line
            let title = '';
            let j = i + 1;
            while (j < lines.length) {
                if (isLikelyDateLine(lines[j])) break;
                if (lines[j]) { title = lines[j]; j++; break; }
                j++;
            }

            // description: collect until next date or blank gap
            const descParts = [];
            while (j < lines.length) {
                const L = lines[j];
                if (!L) { j++; break; }
                if (isLikelyDateLine(L)) break;
                descParts.push(L);
                j++;
            }
            const description = descParts.join(' ').replace(/\s{2,}/g,' ').trim();

            if (iso || title) rows.push([ iso, title || '', description || '' ]);
            i = j;
            continue;
        }

        i++;
    }

    return rows;
}

/* ---------------------- calendar date helpers ---------------------- */
function toISODate(raw){
    if(!raw) return null;
    const s = raw.trim();

    // YYYY-MM-DD
    let m = s.match(/^20\d{2}-\d{2}-\d{2}$/);
    if (m) return s;

    // DD/MM/YYYY or D/M/YYYY
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})$/);
    if (m) {
        const [_, d, mo, y] = m;
        return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    // "DD Mon YYYY"
    const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(20\d{2})$/);
    if (m) {
        const [_, d, mon, y] = m;
        const mo = MONTHS[mon.slice(0,3).toLowerCase()];
        if (mo) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    // inline date inside line
    m = s.match(/(20\d{2}-\d{2}-\d{2})/);
    if (m) return m[1];

    return null;
}

function isLikelyDateLine(line){
    return !!toISODate(line) ||
        /\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/20\d{2}|\d{1,2}\s+[A-Za-z]{3,}\s+20\d{2})\b/.test(line);
}
