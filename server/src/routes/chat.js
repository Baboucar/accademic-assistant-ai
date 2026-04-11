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

async function answerWithModel(question, matches, stream = false) {
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
        stream: stream, // Add stream parameter
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
    
    // If streaming, return the response object for the caller to handle
    if (stream) {
        return r;
    }
    
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || 'I could not find it.';
}

// Original non-streaming endpoint
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

// NEW: Streaming endpoint
chat.post('/chat/stream', async (req, res) => {
    try {
        const question = String(req.body?.question || '');

        // 1) Extract slots with the LLM (same as above)
        const slots = await extractSlots(question);

        // 2) Normalise slots for our query layer (same as above)
        const course = slots.course_code || null;
        const titleKw = slots.title_kw || null;
        const dept = slots.dept || null;
        const day3 = slots.day || dayFromISO(slots.date_iso) || null;
        const time = slots.time || null;
        const lecturerKw = slots.lecturer_name || null;

        // 3) Query timetable (same as above)
        let matches = Queries.flexibleSearch({
            course,
            titleKw,
            lecturerKw,
            day3,
            dept,
            time,
            venueKw: null,
        });

        if ((!matches || matches.length === 0) && titleKw) {
            matches = Queries.fuzzyByTitle(titleKw);
        }

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Get streaming response from Groq
        const streamResponse = await answerWithModel(question, matches, true);
        
        // Send toolAnswer metadata first
        res.write(`data: ${JSON.stringify({ type: 'metadata', toolAnswer: { slots, matches } })}\n\n`);

        // Process the stream
        const reader = streamResponse.body;
        
        reader.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices?.[0]?.delta?.content;
                        if (content) {
                            res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            }
        });

        reader.on('end', () => {
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            res.end();
        });

        reader.on('error', (err) => {
            console.error('Stream error:', err);
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            res.end();
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e?.message || e) });
    }
});