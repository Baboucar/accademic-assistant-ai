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
 * NEW: Stream a question to the backend /api/chat/stream endpoint.
 * Returns an async generator that yields chunks of text.
 */
export async function* streamQuestion(question) {
    const r = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
    });

    if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`API error ${r.status}: ${text}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    yield data;
                } catch (e) {
                    console.warn('Failed to parse SSE data:', line);
                }
            }
        }
    }
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