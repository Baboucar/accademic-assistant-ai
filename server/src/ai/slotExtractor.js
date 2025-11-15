// server/src/ai/slotExtractor.js
import fetch from 'node-fetch';
import { env } from '../env.js';

/**
 * Use the Groq model to extract structured slots from a natural-language question.
 *
 * We keep this logic as simple as possible and let the LLM do the heavy lifting.
 * The rest of the app just consumes the slots.
 */

const SYSTEM_PROMPT = `
You are a slot-filling assistant for the UTG Academic Assistant.
You MUST respond with ONLY a single JSON object, no commentary.

Your job: read the user's question about timetables / lecturers / classes,
and produce a JSON object with this schema:

{
  "intent": "who_teaches" | "when_is" | "where_is" | "schedule_day" | "next_class" | "generic",
  "course_code": string | null,       // e.g. "ICT202", "INS404"
  "title_kw": string | null,          // short course title keywords, e.g. "Artificial Intelligence"
  "dept": string | null,              // "CS", "INS", "CPS", "TEL", etc.
  "day": string | null,               // 3-letter English weekday e.g. "Mon", "Tue"
  "date_iso": string | null,          // YYYY-MM-DD if user gives a specific date
  "time": string | null,              // HH:MM 24h if user mentions explicit time
  "lecturer_name": string | null      // full name of lecturer if question mentions them
}

Guidelines:

- "intent":
  - If the user asks who teaches something → "who_teaches"
  - If they ask when or "what time" → "when_is"
  - If they ask where / which room / venue → "where_is"
  - If they ask for schedule on a day → "schedule_day"
  - If they ask for next upcoming class → "next_class"
  - Otherwise → "generic"

- course_code:
  - Use compact format without spaces, e.g. "ICT202", "INS404", "CPS416".
  - If the question includes a code like "ICT 202" or "CPS 416/ CPS 313",
    pick the most relevant code and normalize to no spaces. Example:
      "ICT 202"   → "ICT202"
      "CPS 416/ CPS 313" → "CPS416"
  - If no code is mentioned, leave it null.

- title_kw:
  - Short phrase of the course name, e.g. "Artificial Intelligence", "Web Programming II".
  - If the question uses a short label like "AI" for Artificial Intelligence, set "title_kw":"AI".
  - If the question is purely about a lecturer (e.g. "Which courses is Baboucarr teaching?"),
    you can leave title_kw null.

- dept:
  - Department code if explicitly mentioned, e.g. "CS", "INS", "CPS", "TEL". Otherwise null.

- day:
  - If the question says Monday, Tuesday, etc., map to 3-letter English form:
    "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun".
  - For "today" or "tomorrow", you may leave null (the backend can resolve relative if needed).

- date_iso:
  - If the user gives a full date like "2025-11-03", copy it exactly here.
  - Otherwise null.

- time:
  - If the user gives a specific clock time like "11:30", "8:30", "14:00",
    normalize to 24h "HH:MM" format.
  - Otherwise null.

- lecturer_name:
  - If the question mentions a lecturer (e.g. "Baboucarr Drammeh", "Mr. Baboucarr Drammeh"),
    extract their full name as it appears, without the title:
      "Mr. Baboucarr Drammeh" → "Baboucarr Drammeh"
      "Pa Sulay Jobe" → "Pa Sulay Jobe"
  - If no lecturer is mentioned, use null.

Examples:

Q: "Who is teaching AI?"
→ {
  "intent": "who_teaches",
  "course_code": null,
  "title_kw": "AI",
  "dept": null,
  "day": null,
  "date_iso": null,
  "time": null,
  "lecturer_name": null
}

Q: "Show Monday schedule for CS."
→ {
  "intent": "schedule_day",
  "course_code": null,
  "title_kw": null,
  "dept": "CS",
  "day": "Mon",
  "date_iso": null,
  "time": null,
  "lecturer_name": null
}

Q: "How many courses is Baboucarr Drammeh teaching on Monday?"
→ {
  "intent": "generic",
  "course_code": null,
  "title_kw": null,
  "dept": null,
  "day": "Mon",
  "date_iso": null,
  "time": null,
  "lecturer_name": "Baboucarr Drammeh"
}

Return ONLY valid JSON, no extra text.
`;

export async function extractSlots(question) {
    const body = {
        model: env.MODEL,
        temperature: 0,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: String(question || '') },
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

    if (!r.ok) {
        throw new Error(`Groq slotExtractor error ${r.status}: ${await r.text()}`);
    }

    const j = await r.json();
    let txt = j.choices?.[0]?.message?.content?.trim() || '{}';

    // Some models occasionally wrap JSON in ```json ```; strip that.
    txt = txt.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    let parsed;
    try {
        parsed = JSON.parse(txt);
    } catch (e) {
        // Fallback: very defensive
        return {
            intent: 'generic',
            course_code: null,
            title_kw: null,
            dept: null,
            day: null,
            date_iso: null,
            time: null,
            lecturer_name: null,
        };
    }

    // ---- Normalisation ----
    if (parsed?.course_code) {
        parsed.course_code = String(parsed.course_code)
            .toUpperCase()
            .replace(/\s+/g, '');
    } else {
        parsed.course_code = null;
    }

    if (parsed?.day) {
        parsed.day = String(parsed.day).slice(0, 3);
    } else {
        parsed.day = null;
    }

    if (parsed?.title_kw) {
        parsed.title_kw = String(parsed.title_kw).trim();
    } else {
        parsed.title_kw = null;
    }

    if (parsed?.dept) {
        parsed.dept = String(parsed.dept).toUpperCase();
    } else {
        parsed.dept = null;
    }

    if (parsed?.time) {
        parsed.time = String(parsed.time).padStart(5, '0');
    } else {
        parsed.time = null;
    }

    if (parsed?.lecturer_name) {
        // Strip common titles
        let name = String(parsed.lecturer_name)
            .replace(/\b(Mr|Mrs|Ms|Dr|Prof)\.?\s+/gi, '')
            .trim();
        parsed.lecturer_name = name || null;
    } else {
        parsed.lecturer_name = null;
    }

    // ---- UTG-specific mappings ----
    // Map "AI" / "Artificial Intelligence" / "Intelligent Systems" to CPS416
    const titleUpper = (parsed.title_kw || '').toUpperCase();
    if (!parsed.course_code && parsed.title_kw) {
        if (
            titleUpper === 'AI' ||
            titleUpper.includes('ARTIFICIAL INTELLIGENCE') ||
            titleUpper.includes('INTELLIGENT SYSTEMS')
        ) {
            parsed.course_code = 'CPS416';
            if (!parsed.dept) parsed.dept = 'CPS';
        }
    }

    return {
        intent: parsed.intent || 'generic',
        course_code: parsed.course_code,
        title_kw: parsed.title_kw,
        dept: parsed.dept,
        day: parsed.day,
        date_iso: parsed.date_iso || null,
        time: parsed.time,
        lecturer_name: parsed.lecturer_name,
    };
}
