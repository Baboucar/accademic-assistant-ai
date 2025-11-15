// Lightweight slot parser (regex-lite) so your import works right now.
// Exports: parseQuestion, resolveRelativeDay

const DAY_ALIASES = {
    MONDAY:'Mon', TUESDAY:'Tue', WEDNESDAY:'Wed', THURSDAY:'Thu', FRIDAY:'Fri', SATURDAY:'Sat', SUNDAY:'Sun',
    MON:'Mon', TUE:'Tue', TUES:'Tue', WED:'Wed', THU:'Thu', THUR:'Thu', FRI:'Fri', SAT:'Sat', SUN:'Sun',
    TODAY:'__TODAY__', TOMORROW:'__TOMORROW__'
};

function pickDay3(q) {
    const m = q.match(/\b(Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:rs|rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?|today|tomorrow)\b/i);
    if (!m) return null;
    const k = m[0].toUpperCase();
    return DAY_ALIASES[k] || null;
}

function pickDateISO(q){
    const m = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    return m ? m[1] : null;
}

function pickTime(q){
    const m = q.match(/\b(\d{1,2}:\d{2})\b/);
    return m ? m[1].padStart(5,'0') : null;
}

function pickCourseCode(q){
    const m = q.match(/[A-Z]{2,4}\s*\d{3}(?:\s*\/\s*[A-Z]{2,4}\s*\d{3})?/i);
    return m ? m[0].toUpperCase().replace(/\s+/g,'') : null; // ICT202
}

function pickDept(q){
    const m = q.match(/\b(CS|INS|ICT|EEE|MATH|TEL|CPS)\b/i);
    return m ? m[0].toUpperCase() : null;
}

// Helpers for course title keyword
const STOP_PREFIX = /^(who|what|when|where|which|is|are|the|about|on|in|for|of|to|please|kindly)\s+/i;
const STOP_DAY = /\b(mon|tue|tues|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

function cleanupTail(s){
    let t = (s || '').trim();
    t = t.replace(/^[?!.]+|[?!.]+$/g,'').trim();
    t = t.replace(/^(who|what|when|where|which|is|are|the|about|on|in|for|of|to|please|kindly)\s+/i,'').trim();
    t = t.replace(/\b(is|are)\s+teaching\s+/i,'').trim();
    t = t.split(/\s+on\s+/i)[0].trim(); // drop trailing "on Monday"
    t = t.replace(/\b(mon|tue|tues|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,'').trim();
    t = t.replace(/\s{2,}/g,' ').trim();
    if (/^ai$/i.test(t)) t = 'Artificial Intelligence';
    return t && t.length >= 2 ? t : null;
}


function pickTitleKeyword(q){
    const quoted = q.match(/"([^"]{2,})"/);
    if (quoted) return cleanupTail(quoted[1]);

    let m = q.match(/\bteach(?:ing)?\s+([A-Za-z0-9 .&/-]{2,})$/i);
    if (m) return cleanupTail(m[1]);

    m = q.match(/\b(?:when|where|time|class|course|of|for|in)\s+([A-Za-z0-9 .&/-]{2,})$/i);
    if (m) return cleanupTail(m[1]);

    const tail = q.replace(/[?!.]/g,'').split(/\s+/).slice(-6).join(' ');
    return cleanupTail(tail);
}

function detectIntent(q){
    const s = q.toLowerCase();
    if (/who.*teach|lecturer|instructor/.test(s)) return 'who_teaches';
    if (/when|time/.test(s)) return 'when_is';
    if (/where|venue|room|hall|theatre|theater/.test(s)) return 'where_is';
    if (/schedule|classes|timetable|what.*on/.test(s)) return 'schedule_day';
    if (/next class|next.*lecture|what's next|what is next/.test(s)) return 'next_class';
    return 'generic';
}

export function parseQuestion(q){
    const intent   = detectIntent(q);
    const course   = pickCourseCode(q);
    const dept     = pickDept(q);
    const day3     = pickDay3(q);
    const dateISO  = pickDateISO(q);
    const time     = pickTime(q);
    const titleKw  = course ? null : pickTitleKeyword(q);
    return { intent, course, dept, day3, dateISO, time, titleKw };
}

export function resolveRelativeDay(day3){
    if (!day3 || (day3 !== '__TODAY__' && day3 !== '__TOMORROW__')) return day3;
    const base = new Date();
    if (day3 === '__TOMORROW__') base.setDate(base.getDate()+1);
    const d = base.toLocaleDateString('en-GB',{ weekday:'short' });
    return d;
}
