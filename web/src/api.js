// web/src/api.js

const API_BASE =
    import.meta.env.VITE_API_BASE?.replace(/\/+$/, '') ||
    'http://localhost:5051';

/**
 * Send a question to the backend /api/chat endpoint.
 * Returns: { answer, toolAnswer }
 */
export async function sendQuestion(question) {
    const r = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
    });

    if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`API error ${r.status}: ${text}`);
    }

    return r.json();
}

/**
 * Optional: get the list of timetable/calendar/notice sources.
 */
export async function listSources(type = 'timetable') {
    const r = await fetch(`${API_BASE}/api/tools/list_sources/${type}`);
    if (!r.ok) {
        throw new Error(`API error ${r.status}`);
    }
    return r.json(); // { sources: [...] }
}
