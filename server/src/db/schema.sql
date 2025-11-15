PRAGMA journal_mode = WAL;

-- Main tables
CREATE TABLE IF NOT EXISTS timetable (
                                         id INTEGER PRIMARY KEY,
                                         dept TEXT,
                                         course_code TEXT,
                                         course_title TEXT,
                                         day TEXT,
                                         start_time TEXT,
                                         end_time TEXT,
                                         venue TEXT,
                                         lecturer TEXT,
                                         source_file TEXT,
                                         semester TEXT
);
CREATE INDEX IF NOT EXISTS idx_tt_day_dept ON timetable(day, dept);
CREATE INDEX IF NOT EXISTS idx_tt_course ON timetable(course_code);
CREATE INDEX IF NOT EXISTS idx_tt_semester ON timetable(semester);

CREATE TABLE IF NOT EXISTS calendar (
                                        id INTEGER PRIMARY KEY,
                                        date TEXT,
                                        title TEXT,
                                        description TEXT,
                                        source_file TEXT,
                                        semester TEXT
);
CREATE INDEX IF NOT EXISTS idx_cal_date ON calendar(date);
CREATE INDEX IF NOT EXISTS idx_cal_semester ON calendar(semester);

CREATE TABLE IF NOT EXISTS notices (
                                       id INTEGER PRIMARY KEY,
                                       date TEXT,
                                       title TEXT,
                                       body TEXT,
                                       source_file TEXT,
                                       semester TEXT
);
CREATE INDEX IF NOT EXISTS idx_notices_semester ON notices(semester);

-- Track which files are loaded
CREATE TABLE IF NOT EXISTS sources (
                                       id INTEGER PRIMARY KEY,
                                       source_file TEXT UNIQUE,
                                       type TEXT CHECK (type IN ('timetable','calendar','notices')),
    semester TEXT,
    ingested_at TEXT DEFAULT (datetime('now'))
    );
CREATE INDEX IF NOT EXISTS idx_sources_semester ON sources(semester);
