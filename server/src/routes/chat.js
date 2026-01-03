// server/src/routes/chat.js
import { Router } from 'express';
import { env } from '../env.js';
import { Queries } from '../db/queries.js';
import { extractSlots } from '../ai/slotExtractor.js';

export const chat = Router();

function dayFromISO(dateISO) {
    if (!dateISO) return null;
    const d = new Date(dateISO + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
}

// Try to derive a lecturer name from other columns when the lecturer column is empty.
// Many PDFs embed the lecturer inside the course title or even the course code cell.
function deriveLecturerFallback(row) {
    const fields = [row.lecturer, row.course_title, row.course_code, row.venue]
        .filter(Boolean)
        .join('  ');
    if (!fields) return '';

    // Common honorifics and a simple proper-name detector (2–4 capitalized words)
    const honorific = '(Mr\\.|Mrs\\.|Ms\\.|Dr\\.|Prof\\.)\\s*';
    const nameCore = '[A-Z][a-z]+';
    const namePat = new RegExp(`${honorific}?${nameCore}(?:\\s+${nameCore}){1,3}`);
    const m = fields.match(namePat);
    if (m) return m[0].replace(/\s{2,}/g, ' ').trim();
    return '';
}

// Map common acronyms/aliases to canonical course title keywords
function normalizeTitleKw(s) {
    if (!s) return s;
    const t = String(s).trim().toUpperCase();
    // Add more aliases here as needed
    if (t === 'AI') return 'Artificial Intelligence';
    // Data Communications and Network family
    if (t === 'DCN') return 'Data Communications and Network';
    // Normalize common DCN phrasing variants (plural/ampersand)
    if (/^DATA\s+COMMUNICATIONS?\s*(?:AND|&)\s*NETWORKS?$/i.test(s)) {
        return 'Data Communications and Network';
    }
    if (/^DATA\s+COMMUNICATIONS?\s*(?:AND|&)\s*NETWORKING$/i.test(s)) {
        return 'Data Communications and Network';
    }
    // If user writes just the short form of the course title, normalize to canonical
    if (t === 'DATA COMMUNICATIONS' || t === 'DATA COMMUNICATION') {
        return 'Data Communications and Network';
    }
    if (t === 'DATA COMMUNICATIONS AND NETWORKING' || t === 'DATA COMMUNICATION AND NETWORK') {
        return 'Data Communications and Network';
    }
    return s;
}

// Known acronym → full title mapping for better answers
const ACRONYM_MAP = {
    AI: 'Artificial Intelligence',
    DCN: 'Data Communications and Network',
};

// Lightweight heuristic parser to backfill slots when the LLM misses them
function extractHeuristics(question) {
    const q = String(question || '').toLowerCase();

    // day detection
    let day3 = null;
    if (/\bmonday\b/.test(q)) day3 = 'Mon';
    else if (/\btuesday\b/.test(q)) day3 = 'Tue';
    else if (/\bwednesday\b/.test(q)) day3 = 'Wed';
    else if (/\bthursday\b/.test(q)) day3 = 'Thu';
    else if (/\bfriday\b/.test(q)) day3 = 'Fri';
    else if (/\bsaturday\b/.test(q)) day3 = 'Sat';
    else if (/\bsunday\b/.test(q)) day3 = 'Sun';

    // department detection
    let dept = null;
    const mDept = q.match(/\b(cs|ins|ict|tel|cps)\b/i);
    if (mDept) dept = mDept[1].toUpperCase();

    // title keyword detection (common aliases)
    let title_kw = null;
    if (/\bai\b/.test(q) || /artificial\s+intelligence/i.test(question)) {
        title_kw = 'Artificial Intelligence';
    } else if (
        /(data\s+communication(s)?\s*(?:and|&)\s*network(s|ing)?)/i.test(question) ||
        /\bDCN\b/i.test(question)
    ) {
        title_kw = 'Data Communications and Network';
    }

    return { day: day3, dept, title_kw };
}

async function answerWithModel(question, matches, { stream = false } = {}) {
    const toolText = JSON.stringify(matches, null, 2);
    const system = `
You are a UTG timetable assistant.

You receive:
- The user's question.
- A JSON ARRAY of matching timetable rows (each row has dept, course_code, course_title, day, start_time, end_time, venue, lecturer, source_file).

Rules:
- Answer ONLY using the data in this JSON array.
- If the array is empty, reply exactly: "I could not find it."
- If the user asks "how many" or "how many courses", count the number of rows in the array
  and state that count explicitly, optionally followed by a short list.
- Otherwise, give a concise natural-language answer, including day, time range, venue, and lecturer
  whenever relevant.
- Do NOT invent any course, time, or lecturer that is not present in the JSON data.
 - When the user uses an acronym, expand it in your answer using the glossary below; prefer the full
   course title in your phrasing. For example, say "Artificial Intelligence" instead of just "AI".

Acronym glossary (authoritative):
${JSON.stringify(ACRONYM_MAP, null, 2)}
`;

    const body = {
        model: env.MODEL,
        temperature: 0.2,
        messages: [
            { role: 'system', content: system },
            {
                role: 'user',
                content: `Question: ${question}\n\nMatches JSON (array of rows):\n${toolText}`,
            },
        ],
    };

    // Use Node's built-in fetch (Undici) to get a Web ReadableStream so body.getReader() works
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(stream ? { ...body, stream: true } : body),
    });

    if (!r.ok) throw new Error(`Groq error ${r.status}: ${await r.text()}`);
    if (!stream) {
        const j = await r.json();
        return j.choices?.[0]?.message?.content?.trim() || 'I could not find it.';
    }
    // If stream=true, caller should handle the Response stream directly
    return r;
}

chat.post('/chat', async (req, res) => {
    try {
        const question = String(req.body?.question || '');
        const isStream = String(req.query.stream || '').toLowerCase() === '1';

        // 1) Extract slots with the LLM
        const slots = await extractSlots(question);

        // 1b) Heuristic backfill for common patterns the LLM may miss
        const heur = extractHeuristics(question);

        // 2) Normalise slots for our query layer (LLM has priority, then heuristics)
        const course = slots.course_code || null;
        const titleKw = normalizeTitleKw(slots.title_kw || heur.title_kw || null);
        const dept = (slots.dept || heur.dept || null);
        const day3 = (slots.day || dayFromISO(slots.date_iso) || heur.day || null);
        const time = slots.time || null;
        const lecturerKw = slots.lecturer_name || null;

        // 3) Query timetable
        let matches = Queries.flexibleSearch({
            course,
            titleKw,
            lecturerKw,
            day3,
            dept,
            time,
            venueKw: null,
        });

        // Fallback fuzzy search if strict search found nothing but we do have a title keyword
        if ((!matches || matches.length === 0) && titleKw) {
            matches = Queries.fuzzyByTitle(titleKw);
        }

        // Enrich missing lecturer from other fields where possible
        if (Array.isArray(matches) && matches.length) {
            matches = matches.map((r) => {
                if (!r.lecturer || String(r.lecturer).trim() === '') {
                    const guess = deriveLecturerFallback(r);
                    if (guess) return { ...r, lecturer: guess };
                }
                return r;
            });
        }

        // 4) Answer from matches
        if (!isStream) {
            const answer = await answerWithModel(question, matches);
            return res.json({ answer, toolAnswer: { slots, matches } });
        }

        // Streaming mode: proxy Groq stream and also emit tool info at end
        const groqResp = await answerWithModel(question, matches, { stream: true });
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = groqResp.body.getReader();
        const decoder = new TextDecoder('utf-8');

        function sse(data) {
            res.write(`data: ${data}\n\n`);
        }

        // Groq streams in OpenAI SSE format: lines starting with "data: {json}"
        let buffer = '';
        const pump = () => reader.read().then(({ value, done }) => {
            if (done) {
                sse(JSON.stringify({ event: 'done' }));
                // send tool info at the end for debugging
                sse(JSON.stringify({ event: 'tool', toolAnswer: { slots, matches } }));
                return res.end();
            }
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split(/\n\n/);
            buffer = parts.pop() || '';
            for (const part of parts) {
                const line = part.trim();
                if (!line) continue;
                // part may contain multiple lines starting with data:
                const lines = line.split('\n').map(l => l.replace(/^data:\s?/, ''));
                for (const payload of lines) {
                    if (payload === '[DONE]') continue;
                    try {
                        const json = JSON.parse(payload);
                        const delta = json.choices?.[0]?.delta?.content || '';
                        if (delta) sse(JSON.stringify({ event: 'chunk', text: delta }));
                    } catch {
                        // pass-through if not JSON
                    }
                }
            }
            return pump();
        });
        pump();
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e?.message || e) });
    }
});
