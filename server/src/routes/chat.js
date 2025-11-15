// server/src/routes/chat.js
import { Router } from 'express';
import fetch from 'node-fetch';
import { env } from '../env.js';
import { Queries } from '../db/queries.js';
import { extractSlots } from '../ai/slotExtractor.js';

export const chat = Router();

function dayFromISO(dateISO) {
    if (!dateISO) return null;
    const d = new Date(dateISO + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
}

async function answerWithModel(question, matches) {
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

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!r.ok) throw new Error(`Groq error ${r.status}: ${await r.text()}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || 'I could not find it.';
}

chat.post('/chat', async (req, res) => {
    try {
        const question = String(req.body?.question || '');

        // 1) Extract slots with the LLM
        const slots = await extractSlots(question);

        // 2) Normalise slots for our query layer
        const course = slots.course_code || null;
        const titleKw = slots.title_kw || null;
        const dept = slots.dept || null;
        const day3 = slots.day || dayFromISO(slots.date_iso) || null;
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

        // 4) Answer from matches
        const answer = await answerWithModel(question, matches);

        res.json({ answer, toolAnswer: { slots, matches } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e?.message || e) });
    }
});
