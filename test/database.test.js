const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('SQLite constraints preserve uniqueness, mark ranges, cascade and set-null rules', () => {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ledger-test-'));
  process.env.DATABASE_FILE=path.join(folder,'test.db');
  const {db}=require('../server');
  try {
    const advisor=db.prepare('INSERT INTO advisors(full_name,email) VALUES(?,?)').run('Test Advisor','advisor@test.local');
    const student=db.prepare(`INSERT INTO students(roll_no,full_name,department,program,admission_year,advisor_id) VALUES(?,?,?,?,?,?)`).run('TEST-1','Test Student','Computer Science','B.Tech',2024,advisor.lastInsertRowid);
    assert.throws(()=>db.prepare('INSERT INTO students(roll_no,full_name,department,program,admission_year) VALUES(?,?,?,?,?)').run('TEST-1','Duplicate','CS','B.Tech',2024),/UNIQUE constraint failed/);
    const sem=db.prepare('INSERT INTO semesters(student_id,semester_no,academic_year,sgpa,cgpa) VALUES(?,?,?,?,?)').run(student.lastInsertRowid,1,'2024–25',8,8);
    assert.throws(()=>db.prepare('INSERT INTO semesters(student_id,semester_no,academic_year,sgpa,cgpa) VALUES(?,?,?,?,?)').run(student.lastInsertRowid,1,'2024–25',8,8),/UNIQUE constraint failed/);
    assert.throws(()=>db.prepare('INSERT INTO subjects(semester_id,subject_code,subject_name,credits,theory_marks) VALUES(?,?,?,?,?)').run(sem.lastInsertRowid,'T1','Theory',3,101),/CHECK constraint failed/);
    assert.throws(()=>db.prepare('INSERT INTO semesters(student_id,semester_no,academic_year,sgpa,cgpa) VALUES(?,?,?,?,?)').run(student.lastInsertRowid,2,'2024–25',10.1,10),/CHECK constraint failed/);
    db.prepare('INSERT INTO education_records(student_id,level,passing_year,marks) VALUES(?,?,?,?)').run(student.lastInsertRowid,'SSC',2020,90);
    db.prepare('INSERT INTO subjects(semester_id,subject_code,subject_name,credits) VALUES(?,?,?,?)').run(sem.lastInsertRowid,'T1','Theory',3);
    db.prepare('DELETE FROM advisors WHERE advisor_id=?').run(advisor.lastInsertRowid);
    assert.equal(db.prepare('SELECT advisor_id FROM students WHERE student_id=?').get(student.lastInsertRowid).advisor_id,null,'ON DELETE SET NULL clears the optional advisor reference');
    db.prepare('DELETE FROM students WHERE student_id=?').run(student.lastInsertRowid);
    assert.equal(db.prepare('SELECT count(*) n FROM education_records WHERE student_id=?').get(student.lastInsertRowid).n,0,'student deletion cascades to education');
    assert.equal(db.prepare('SELECT count(*) n FROM semesters WHERE student_id=?').get(student.lastInsertRowid).n,0,'student deletion cascades to semesters');
    assert.equal(db.prepare('SELECT count(*) n FROM subjects WHERE semester_id=?').get(sem.lastInsertRowid).n,0,'semester deletion cascades to subjects');
  } finally {db.close();delete require.cache[require.resolve('../server')];delete process.env.DATABASE_FILE;fs.rmSync(folder,{recursive:true,force:true});}
});
