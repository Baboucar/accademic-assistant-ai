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
 * Stream a question to the backend. Calls onChunk(text) as tokens arrive.
 * Returns a promise that resolves with the final toolAnswer when stream ends.
 */
export async function sendQuestionStream(question, onChunk, opts = {}) {
    const { signal } = opts;
    const r = await fetch(`${API_BASE}/api/chat?stream=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal,
    });
    if (!r.ok || !r.body) {
        const text = await r.text().catch(() => '');
        throw new Error(`API error ${r.status}: ${text}`);
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalTool = null;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\n\n/);
        buffer = parts.pop() || '';
        for (const part of parts) {
            const lines = part
                .split('\n')
                .map(l => l.replace(/^data:\s?/, '').trim())
                .filter(Boolean);
            for (const payload of lines) {
                try {
                    const obj = JSON.parse(payload);
                    if (obj.event === 'chunk' && obj.text) {
                        onChunk?.(obj.text);
                    } else if (obj.event === 'tool') {
                        finalTool = obj.toolAnswer || null;
                    }
                } catch {
                    // ignore
                }
            }
        }
    }
    return finalTool;
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

// ---------------- Admin API (Basic Auth) ----------------
function authHeader(creds) {
    if (!creds?.user || !creds?.pass) return {};
    const token = btoa(`${creds.user}:${creds.pass}`);
    return { Authorization: `Basic ${token}` };
}

export async function adminListSources(creds) {
    const r = await fetch(`${API_BASE}/api/admin/sources`, {
        headers: { ...authHeader(creds) },
    });
    if (!r.ok) throw new Error(`Admin error ${r.status}`);
    return r.json();
}

export async function adminUploadFile(creds, file, { type = 'timetable', semester = '', reingest = '1' } = {}) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    fd.append('semester', semester);
    fd.append('reingest', reingest);
    const r = await fetch(`${API_BASE}/api/admin/upload`, {
        method: 'POST',
        headers: { ...authHeader(creds) },
        body: fd,
    });
    if (!r.ok) throw new Error(`Admin upload error ${r.status}`);
    return r.json();
}

export async function adminDeleteSource(creds, file, deleteFile = false) {
    const r = await fetch(`${API_BASE}/api/admin/source/${encodeURIComponent(file)}?deleteFile=${deleteFile ? '1' : '0'}`, {
        method: 'DELETE',
        headers: { ...authHeader(creds) },
    });
    if (!r.ok) throw new Error(`Admin delete error ${r.status}`);
    return r.json();
}

export async function adminReingest(creds, { file = '', semester = '' } = {}) {
    const r = await fetch(`${API_BASE}/api/admin/reingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(creds) },
        body: JSON.stringify({ file, semester }),
    });
    if (!r.ok) throw new Error(`Admin reingest error ${r.status}`);
    return r.json();
}
