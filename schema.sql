PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS advisors (
  advisor_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 1 AND 120),
  email TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS students (
  student_id INTEGER PRIMARY KEY,
  roll_no TEXT NOT NULL UNIQUE CHECK(length(trim(roll_no)) BETWEEN 1 AND 30),
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 1 AND 120),
  email TEXT UNIQUE,
  phone TEXT,
  department TEXT NOT NULL,
  program TEXT NOT NULL,
  admission_year INTEGER NOT NULL CHECK(admission_year BETWEEN 1990 AND 2100),
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Graduated','On leave')),
  advisor_id INTEGER REFERENCES advisors(advisor_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS education_records (
  education_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK(level IN ('SSC','HSC','Diploma')),
  institution TEXT,
  passing_year INTEGER CHECK(passing_year BETWEEN 1980 AND 2100),
  marks REAL CHECK(marks BETWEEN 0 AND 100),
  UNIQUE(student_id, level)
);
CREATE TABLE IF NOT EXISTS gap_years (
  gap_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  start_year INTEGER NOT NULL CHECK(start_year BETWEEN 1990 AND 2100),
  end_year INTEGER NOT NULL CHECK(end_year BETWEEN start_year AND 2100),
  reason TEXT,
  UNIQUE(student_id, start_year, end_year)
);
CREATE TABLE IF NOT EXISTS semesters (
  semester_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  semester_no INTEGER NOT NULL CHECK(semester_no BETWEEN 1 AND 16),
  academic_year TEXT NOT NULL,
  sgpa REAL NOT NULL CHECK(sgpa BETWEEN 0 AND 10),
  cgpa REAL NOT NULL CHECK(cgpa BETWEEN 0 AND 10),
  UNIQUE(student_id, semester_no)
);
CREATE TABLE IF NOT EXISTS subjects (
  subject_id INTEGER PRIMARY KEY,
  semester_id INTEGER NOT NULL REFERENCES semesters(semester_id) ON DELETE CASCADE,
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  credits REAL NOT NULL CHECK(credits > 0 AND credits <= 10),
  theory_max REAL NOT NULL DEFAULT 100 CHECK(theory_max > 0),
  theory_marks REAL CHECK(theory_marks BETWEEN 0 AND theory_max),
  internal_max REAL NOT NULL DEFAULT 30 CHECK(internal_max > 0),
  internal_marks REAL CHECK(internal_marks BETWEEN 0 AND internal_max),
  external_max REAL NOT NULL DEFAULT 70 CHECK(external_max > 0),
  external_marks REAL CHECK(external_marks BETWEEN 0 AND external_max),
  practical_max REAL NOT NULL DEFAULT 100 CHECK(practical_max > 0),
  practical_marks REAL CHECK(practical_marks BETWEEN 0 AND practical_max),
  lab_max REAL NOT NULL DEFAULT 100 CHECK(lab_max > 0),
  lab_marks REAL CHECK(lab_marks BETWEEN 0 AND lab_max),
  UNIQUE(semester_id, subject_code)
);
CREATE TABLE IF NOT EXISTS seminars (
  seminar_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  seminar_type TEXT NOT NULL CHECK(seminar_type IN ('Internal','External')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
  event_date TEXT,
  organizer TEXT,
  participation TEXT NOT NULL DEFAULT 'Attended' CHECK(participation IN ('Attended','Presented','Organized')),
  achievement TEXT,
  certificate_url TEXT,
  UNIQUE(student_id, seminar_type, title, event_date)
);
CREATE TABLE IF NOT EXISTS activities (
  activity_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('Technical','Co-curricular','Extracurricular')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
  activity_date TEXT,
  organizer TEXT,
  participation TEXT NOT NULL DEFAULT 'Participated' CHECK(participation IN ('Participated','Volunteered','Organized')),
  achievement TEXT,
  certificate_url TEXT,
  UNIQUE(student_id, category, title, activity_date)
);
CREATE INDEX IF NOT EXISTS idx_semester_progress ON semesters(student_id, semester_no);
CREATE INDEX IF NOT EXISTS idx_seminars_student ON seminars(student_id, event_date);
CREATE INDEX IF NOT EXISTS idx_activities_student ON activities(student_id, activity_date);
