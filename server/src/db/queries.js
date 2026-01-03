import { db } from './connect.js';

export const Queries = {
    // other methods like findNextClass, getDaySchedule, etc. stay unchanged ...

    flexibleSearch({ course, titleKw, lecturerKw, day3, dept, time, venueKw }) {
        const where = [];
        const params = [];

        // Combined searchable blob for fuzzy text matching
        const SEARCH_BLOB = `UPPER(
        COALESCE(course_code,'')  || ' ' ||
        COALESCE(course_title,'') || ' ' ||
        COALESCE(lecturer,'')     || ' ' ||
        COALESCE(venue,'')
      )`;

        // 1) Course code — most specific. If we have this, we rely primarily on it.
        if (course) {
            // allow combined codes e.g. "CPS 416/ CPS 313 Intelligent Systems..."
            where.push(`REPLACE(UPPER(course_code),' ','') LIKE ?`);
            params.push(`%${course.toUpperCase()}%`);
        }

        // Whitelist of short title tokens we still want to match (e.g., acronyms)
        const SHORT_TITLE_TOKENS = new Set(['AI', 'DCN']); // include DCN (Data Communications and Network)

        // Title aliases: some courses appear with dual names in the PDF like
        // "Intelligent Systems/ Artificial Intelligence". When the user says
        // "AI" we normalize to "Artificial Intelligence" in the route layer,
        // but to be robust we OR-match common aliases here too.
        function expandTitleAliases(s) {
            if (!s) return [];
            const u = String(s).trim().toUpperCase();
            // Use arrays of alias phrases (not tokenized yet)
            if (u === 'ARTIFICIAL INTELLIGENCE' || u === 'AI') {
                return ['ARTIFICIAL INTELLIGENCE', 'INTELLIGENT SYSTEMS'];
            }
            if (u === 'INTELLIGENT SYSTEMS') {
                return ['INTELLIGENT SYSTEMS', 'ARTIFICIAL INTELLIGENCE'];
            }
            // Data Communications and Network family (and variants/acronym)
            const dcnSet = new Set([
                'DATA COMMUNICATIONS AND NETWORK',
                'DATA COMMUNICATIONS AND NETWORKS',
                'DATA COMMUNICATION AND NETWORK',
                'DATA COMMUNICATION AND NETWORKS',
                'DATA COMMUNICATIONS AND NETWORKING',
                'DATA COMMUNICATIONS',
                'DATA COMMUNICATION',
                'DCN',
            ]);
            if (dcnSet.has(u)) {
                return [
                    'DATA COMMUNICATIONS AND NETWORK',
                    'DATA COMMUNICATIONS AND NETWORKS',
                    'DATA COMMUNICATION AND NETWORK',
                    'DATA COMMUNICATION AND NETWORKS',
                    'DATA COMMUNICATIONS AND NETWORKING',
                    'DATA COMMUNICATIONS',
                    'DATA COMMUNICATION',
                ];
            }
            return [s];
        }

        // 2) Title keywords — ONLY when we do NOT already have a course code.
        // (Prevents "Intelligent Systems" from matching every "... Systems" course.)
        if (!course && titleKw) {
            const phrases = expandTitleAliases(titleKw);
            const orGroups = [];

            for (const phrase of phrases) {
                const tokens = String(phrase)
                    .toUpperCase()
                    .replace(/[^A-Z0-9\s]/g, ' ')
                    .split(/\s+/)
                    .filter((w) => w.length >= 3 || SHORT_TITLE_TOKENS.has(w));
                if (!tokens.length) continue;
                // Build an AND group for this phrase
                const andParts = [];
                for (const tok of tokens) {
                    andParts.push(`(${SEARCH_BLOB} LIKE ?)`);
                    params.push(`%${tok}%`);
                }
                orGroups.push(`(${andParts.join(' AND ')})`);
            }

            if (orGroups.length) {
                where.push(`(${orGroups.join(' OR ')})`);
            }
        }

        // 3) Lecturer keyword — search across the combined blob, because in many rows
        // the lecturer name is embedded in course_code text from the PDF.
        if (lecturerKw) {
            const ltoks = String(lecturerKw)
                .toUpperCase()
                .replace(/[^A-Z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length >= 3);

            for (const tok of ltoks) {
                where.push(`(${SEARCH_BLOB} LIKE ?)`);
                params.push(`%${tok}%`);
            }
        }

        // 4) Venue keyword (optional)
        if (venueKw) {
            const vtoks = String(venueKw)
                .toUpperCase()
                .replace(/[^A-Z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length >= 3);

            for (const tok of vtoks) {
                where.push(`(${SEARCH_BLOB} LIKE ?)`);
                params.push(`%${tok}%`);
            }
        }

        // 5) Department filter
        if (dept) {
            where.push(`UPPER(dept) = ?`);
            params.push(dept.toUpperCase());
        }

        // 6) Day filter
        if (day3) {
            where.push(`UPPER(SUBSTR(day,1,3)) = ?`);
            params.push(day3.toUpperCase());
        }

        // 7) Time filter — classes that cover a given time
        if (time) {
            where.push(`(start_time <= ? AND end_time >= ?)`);
            params.push(time, time);
        }

        const sql = `
      SELECT id, dept, course_code, course_title, day, start_time, end_time, venue, lecturer, source_file
      FROM timetable
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE UPPER(SUBSTR(day,1,3))
        WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
        WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 WHEN 'SUN' THEN 7 ELSE 9 END,
        start_time ASC,
        course_code ASC
      LIMIT 50
    `;

        return db.prepare(sql).all(...params);
    },

    // Basic fuzzy match by course title (with fallback across code/lecturer too)
    fuzzyByTitle(titleKw) {
        if (!titleKw) return [];
        // Allow known short acronyms like "AI"
        const SHORT_TITLE_TOKENS = new Set(['AI', 'DCN']);

        function expandTitleAliases(s) {
            if (!s) return [];
            const u = String(s).trim().toUpperCase();
            if (u === 'ARTIFICIAL INTELLIGENCE' || u === 'AI') {
                return ['ARTIFICIAL INTELLIGENCE', 'INTELLIGENT SYSTEMS'];
            }
            if (u === 'INTELLIGENT SYSTEMS') {
                return ['INTELLIGENT SYSTEMS', 'ARTIFICIAL INTELLIGENCE'];
            }
            const dcnSet = new Set([
                'DATA COMMUNICATIONS AND NETWORK',
                'DATA COMMUNICATIONS AND NETWORKS',
                'DATA COMMUNICATION AND NETWORK',
                'DATA COMMUNICATION AND NETWORKS',
                'DATA COMMUNICATIONS AND NETWORKING',
                'DATA COMMUNICATIONS',
                'DATA COMMUNICATION',
                'DCN',
            ]);
            if (dcnSet.has(u)) {
                return [
                    'DATA COMMUNICATIONS AND NETWORK',
                    'DATA COMMUNICATIONS AND NETWORKS',
                    'DATA COMMUNICATION AND NETWORK',
                    'DATA COMMUNICATION AND NETWORKS',
                    'DATA COMMUNICATIONS AND NETWORKING',
                    'DATA COMMUNICATIONS',
                    'DATA COMMUNICATION',
                ];
            }
            return [s];
        }

        const phrases = expandTitleAliases(titleKw);
        const whereGroups = [];
        const params = [];
        for (const phrase of phrases) {
            const toks = String(phrase)
                .toUpperCase()
                .replace(/[^A-Z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length >= 3 || SHORT_TITLE_TOKENS.has(w));
            if (!toks.length) continue;
            const andParts = [];
            for (const t of toks) {
                andParts.push(`(UPPER(
        COALESCE(course_code,'')  || ' ' ||
        COALESCE(course_title,'') || ' ' ||
        COALESCE(lecturer,'')     || ' '
      )) LIKE ?`);
                params.push(`%${t}%`);
            }
            whereGroups.push(`(${andParts.join(' AND ')})`);
        }

        if (!whereGroups.length) return [];

        const SEARCH_BLOB = `UPPER(
        COALESCE(course_code,'')  || ' ' ||
        COALESCE(course_title,'') || ' ' ||
        COALESCE(lecturer,'')     || ' '
      )`;

        const where = [`(${whereGroups.join(' OR ')})`];

        const sql = `
      SELECT id, dept, course_code, course_title, day, start_time, end_time, venue, lecturer, source_file
      FROM timetable
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE UPPER(SUBSTR(day,1,3))
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 WHEN 'SUN' THEN 7 ELSE 9 END,
        start_time ASC,
        course_code ASC
      LIMIT 50
    `;
        return db.prepare(sql).all(...params);
    },

    // keep your existing searchNotices, listSources, etc.
};
