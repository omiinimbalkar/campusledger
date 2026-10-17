require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { google } = require('googleapis');

const app = express();
app.use(express.json({ limit: '1mb' }));
const dbFile = path.resolve(process.env.DATABASE_FILE || './data/ledger.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Database(dbFile);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const seeds = [
  ['CS-2022-014','Aarav Mehta','aarav.mehta@campus.edu','Computer Science','B.Tech Computer Science',2022,'Active'],
  ['CS-2022-027','Diya Kapoor','diya.kapoor@campus.edu','Computer Science','B.Tech Computer Science',2022,'Active'],
  ['IT-2021-008','Kabir Shah','kabir.shah@campus.edu','Information Technology','B.Tech Information Technology',2021,'Graduated'],
  ['EC-2023-031','Anaya Rao','anaya.rao@campus.edu','Electronics','B.Tech Electronics',2023,'Active'],
  ['CS-2022-039','Rohan Iyer','rohan.iyer@campus.edu','Computer Science','B.Tech Computer Science',2022,'On leave']
];
if (db.prepare('SELECT count(*) n FROM students').get().n === 0) {
  const insert = db.prepare('INSERT INTO students(roll_no,full_name,email,department,program,admission_year,status) VALUES(?,?,?,?,?,?,?)');
  const addSample = db.transaction(() => seeds.forEach(s => insert.run(...s)));
  addSample();
  const ids = db.prepare('SELECT student_id FROM students ORDER BY student_id').all();
  const education = db.prepare('INSERT INTO education_records(student_id,level,institution,passing_year,marks) VALUES(?,?,?,?,?)');
  for (const s of ids) { education.run(s.student_id,'SSC','Sample Public School',2020,94.2); education.run(s.student_id,'HSC','Sample Public School',2022,91.6); }
  const sem = db.prepare('INSERT INTO semesters(student_id,semester_no,academic_year,sgpa,cgpa) VALUES(?,?,?,?,?)');
  for (const s of ids) {
    const scores=[8.1,8.45,7.82,8.62,8.91,9.05];let total=0;
    scores.forEach((sgpa,i)=>{total+=sgpa;sem.run(s.student_id,i+1,i<2?'2022–23':i<4?'2023–24':'2024–25',sgpa,total/(i+1));});
  }
  const addSubject=db.prepare(`INSERT INTO subjects(semester_id,subject_code,subject_name,credits,theory_marks,internal_marks,external_marks,lab_marks)
    SELECT semester_id,?,?,?,?,?,?,? FROM semesters WHERE student_id=? AND semester_no=6`);
  const sampleSubjects=[['CS601','Database Systems',4,87,26,61,92],['CS602','Artificial Intelligence',4,83,25,58,null],['CS603','Computer Networks',3,81,24,57,null],['CS604L','DBMS Laboratory',2,90,27,63,94]];
  for(const s of ids)for(const x of sampleSubjects)addSubject.run(...x,s.student_id);
  db.prepare("INSERT INTO gap_years(student_id,start_year,end_year,reason) VALUES(?,2023,2024,'Academic break')").run(ids[4].student_id);
  db.prepare("INSERT INTO seminars(student_id,seminar_type,title,event_date,organizer,participation,achievement) VALUES(?, 'Internal','Emerging Trends in AI','2025-02-12','Computer Science Department','Presented','Best presentation')").run(ids[0].student_id);
  db.prepare("INSERT INTO seminars(student_id,seminar_type,title,event_date,organizer) VALUES(?, 'External','National Student Research Forum','2025-01-18','University Network')").run(ids[0].student_id);
  db.prepare("INSERT INTO activities(student_id,category,title,activity_date,organizer,achievement) VALUES(?, 'Technical','Smart India Hackathon','2025-01-18','Innovation Cell','Finalist')").run(ids[0].student_id);
  db.prepare("INSERT INTO activities(student_id,category,title,activity_date,organizer) VALUES(?, 'Co-curricular','Campus literary week','2024-11-12','Literary Society')").run(ids[0].student_id);
}

const isText=(v,max=180)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
const num=(v,min,max)=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max;
const dateOk=v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v);
function apiError(res,e){console.error(e);const code=String(e.code||'');const msg=code==='SQLITE_CONSTRAINT_UNIQUE'?'A duplicate roll number, result or record already exists.':code.startsWith('SQLITE_CONSTRAINT_FOREIGNKEY')?'Referenced record does not exist.':code.startsWith('SQLITE_CONSTRAINT_CHECK')?'A value violates a database check constraint.':e.message||'Unexpected server error.';res.status(code.startsWith('SQLITE_CONSTRAINT')?409:500).json({error:msg});}
function wrap(fn){return(req,res)=>{try{fn(req,res)}catch(e){apiError(res,e)}}}

// Classroom demo accounts. Replace these with a real identity provider before deployment.
const demoUsers = [
  { username: process.env.DEMO_ADMIN_USERNAME || 'admin', password: process.env.DEMO_ADMIN_PASSWORD || 'admin123', role: 'admin' },
  { username: process.env.DEMO_STUDENT_USERNAME || 'student', password: process.env.DEMO_STUDENT_PASSWORD || 'student123', role: 'student', roll_no: 'CS-2022-014' }
];
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
function safeEqual(a,b){const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function signSession(payload){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',sessionSecret).update(body).digest('base64url');return `${body}.${sig}`}
function readSession(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ledger_session='))?.slice('ledger_session='.length);if(!token)return null;const [body,sig]=token.split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',sessionSecret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const session=JSON.parse(Buffer.from(body,'base64url').toString());return session.exp>Date.now()?session:null}catch{return null}}
function requireAdmin(req,res){if(req.user?.role!=='admin'){res.status(403).json({error:'This action is available to the admin account only.'});return false}return true}

app.post('/api/auth/login',wrap((req,res)=>{
 const {username,password}=req.body||{};const user=demoUsers.find(x=>safeEqual(x.username,username||'')&&safeEqual(x.password,password||''));
 if(!user)return res.status(401).json({error:'Incorrect username or password.'});
 const student=user.role==='student'?db.prepare('SELECT student_id,full_name FROM students WHERE roll_no=?').get(user.roll_no):null;
 if(user.role==='student'&&!student)return res.status(503).json({error:'The demo student record is missing from the database.'});
 const session={username:user.username,role:user.role,student_id:student?.student_id||null,exp:Date.now()+8*60*60*1000};
 res.setHeader('Set-Cookie',`ledger_session=${signSession(session)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
 res.json({username:session.username,role:session.role,student_id:session.student_id});
}));
app.get('/api/auth/me',(req,res)=>{const user=readSession(req);if(!user)return res.status(401).json({error:'Please sign in.'});res.json({username:user.username,role:user.role,student_id:user.student_id})});
app.post('/api/auth/logout',(_req,res)=>{res.setHeader('Set-Cookie','ledger_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.json({ok:true})});
app.use('/api',(req,res,next)=>{
 req.user=readSession(req);
 if(!req.user)return res.status(401).json({error:'Please sign in.'});
 if(req.method!=='GET'&&req.user.role!=='admin')return res.status(403).json({error:'The student account has read-only access.'});
 if(req.user.role==='student'&&req.path==='/sheets/sync')return res.status(403).json({error:'Sheets sync is available to the admin account only.'});
 if(req.user.role==='student'&&req.method==='GET'&&req.path==='/students'){
   const student=db.prepare('SELECT s.*,coalesce((SELECT cgpa FROM semesters sm WHERE sm.student_id=s.student_id ORDER BY semester_no DESC LIMIT 1),0) cgpa,(SELECT count(*) FROM activities a WHERE a.student_id=s.student_id) activity_count,(SELECT count(*) FROM seminars se WHERE se.student_id=s.student_id) seminar_count FROM students s WHERE s.student_id=?').get(req.user.student_id);
   return res.json(student?[student]:[]);
 }
 if(req.user.role==='student'&&req.method==='GET'&&req.path==='/stats'){
   const stats=db.prepare('SELECT (SELECT count(*) FROM students WHERE student_id=?) students,(SELECT count(*) FROM activities WHERE student_id=?) activities,(SELECT count(*) FROM seminars WHERE student_id=?) seminars,coalesce((SELECT cgpa FROM semesters WHERE student_id=? ORDER BY semester_no DESC LIMIT 1),0) cgpa').get(req.user.student_id,req.user.student_id,req.user.student_id,req.user.student_id);
   return res.json(stats);
 }
 if(req.user.role==='student'&&req.method==='GET'&&req.path==='/subjects'&&Number(req.query.student_id)!==Number(req.user.student_id))return res.status(403).json({error:'You can only view your own subjects.'});
 if(req.user.role==='student'&&req.method==='GET'&&/^\/students\/\d+$/.test(req.path)&&Number(req.path.split('/')[2])!==Number(req.user.student_id))return res.status(403).json({error:'You can only view your own student profile.'});
 next();
});

function sheetValues(){
  const rows=[['Record type','Student roll no','Student name','Category / level','Title / subject','Date / year','Achievement / participation','Marks / SGPA / CGPA','Certificate / institution']];
  const push=(type,r,values)=>rows.push([type,r.roll_no,r.full_name,...values]);
  for(const r of db.prepare('SELECT * FROM students ORDER BY full_name').all())push('Student',r,[r.department+' · '+r.program,r.admission_year,r.status,r.email,'']);
  for(const r of db.prepare('SELECT e.*,s.roll_no,s.full_name FROM education_records e JOIN students s USING(student_id)').all())push('Education',r,[r.level,r.institution,r.passing_year,'',r.marks,r.institution]);
  for(const r of db.prepare('SELECT g.*,s.roll_no,s.full_name FROM gap_years g JOIN students s USING(student_id)').all())push('Gap year',r,['',r.start_year+'–'+r.end_year,r.reason,'','']);
  for(const r of db.prepare('SELECT sm.*,s.roll_no,s.full_name FROM semesters sm JOIN students s USING(student_id)').all())push('Semester',r,['Semester '+r.semester_no,r.academic_year,'',`SGPA ${r.sgpa} · CGPA ${r.cgpa}`,'']);
  for(const r of db.prepare('SELECT su.*,sm.semester_no,s.roll_no,s.full_name FROM subjects su JOIN semesters sm USING(semester_id) JOIN students s USING(student_id)').all())push('Subject',r,[`Semester ${r.semester_no}`,r.subject_code+' '+r.subject_name,'',`Theory ${r.theory_marks??'—'} · Internal ${r.internal_marks??'—'} · External ${r.external_marks??'—'} · Practical ${r.practical_marks??'—'} · Lab ${r.lab_marks??'—'}`,'']);
  for(const r of db.prepare('SELECT se.*,s.roll_no,s.full_name FROM seminars se JOIN students s USING(student_id)').all())push('Seminar',r,[r.seminar_type,r.title,r.event_date,`${r.participation}${r.achievement?' · '+r.achievement:''}`,r.certificate_url]);
  for(const r of db.prepare('SELECT a.*,s.roll_no,s.full_name FROM activities a JOIN students s USING(student_id)').all())push('Activity',r,[r.category,r.title,r.activity_date,`${r.participation}${r.achievement?' · '+r.achievement:''}`,r.certificate_url]);
  return rows;
}
async function syncSheets(){
  const id=process.env.GOOGLE_SHEETS_ID,email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=process.env.GOOGLE_PRIVATE_KEY;
  if(!id||!email||!key)return {configured:false};
  const auth=new google.auth.GoogleAuth({credentials:{client_email:email,private_key:key.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']});
  const sheets=google.sheets({version:'v4',auth});
  await sheets.spreadsheets.values.update({spreadsheetId:id,range:'Ledger!A1',valueInputOption:'RAW',requestBody:{values:sheetValues()}});
  return {configured:true,rows:sheetValues().length-1};
}
function afterWrite(){syncSheets().catch(e=>console.error('Google Sheets sync failed:',e.message));}

app.get('/api/health',wrap((_req,res)=>res.json({ok:true,database:'sqlite'})));
app.get('/api/stats',wrap((_req,res)=>res.json({students:db.prepare('SELECT count(*) n FROM students').get().n,activities:db.prepare('SELECT count(*) n FROM activities').get().n,seminars:db.prepare('SELECT count(*) n FROM seminars').get().n,cgpa:db.prepare('SELECT round(avg(s.cgpa),2) n FROM semesters s WHERE s.semester_no=(SELECT max(x.semester_no) FROM semesters x WHERE x.student_id=s.student_id)').get().n||0})));
app.get('/api/students',wrap((req,res)=>{const q=`%${String(req.query.q||'').trim()}%`;res.json(db.prepare(`SELECT s.*,coalesce((SELECT cgpa FROM semesters sm WHERE sm.student_id=s.student_id ORDER BY semester_no DESC LIMIT 1),0) cgpa,
 (SELECT count(*) FROM activities a WHERE a.student_id=s.student_id) activity_count,(SELECT count(*) FROM seminars se WHERE se.student_id=s.student_id) seminar_count
 FROM students s WHERE s.full_name LIKE ? COLLATE NOCASE OR s.roll_no LIKE ? COLLATE NOCASE ORDER BY s.full_name`).all(q,q))}));
app.post('/api/students',wrap((req,res)=>{const b=req.body;if(!isText(b.roll_no,30)||!isText(b.full_name,120)||!isText(b.department,100)||!isText(b.program,120)||!num(b.admission_year,1990,2100))return res.status(400).json({error:'Roll number, student name, department, program and a valid admission year are required.'});const r=db.prepare('INSERT INTO students(roll_no,full_name,email,phone,department,program,admission_year) VALUES(?,?,?,?,?,?,?)').run(b.roll_no.trim(),b.full_name.trim(),b.email||null,b.phone||null,b.department.trim(),b.program.trim(),+b.admission_year);res.status(201).json({student_id:r.lastInsertRowid});afterWrite(res)}));
app.put('/api/students/:id',wrap((req,res)=>{const b=req.body;if(!isText(b.roll_no,30)||!isText(b.full_name,120)||!isText(b.department,100)||!isText(b.program,120)||!num(b.admission_year,1990,2100)||!['Active','Graduated','On leave'].includes(b.status))return res.status(400).json({error:'Check the student details and status.'});const r=db.prepare('UPDATE students SET roll_no=?,full_name=?,email=?,phone=?,department=?,program=?,admission_year=?,status=? WHERE student_id=?').run(b.roll_no.trim(),b.full_name.trim(),b.email||null,b.phone||null,b.department.trim(),b.program.trim(),+b.admission_year,b.status,req.params.id);if(!r.changes)return res.status(404).json({error:'Student not found.'});res.json({ok:true});afterWrite(res)}));
app.delete('/api/students/:id',wrap((req,res)=>{const r=db.prepare('DELETE FROM students WHERE student_id=?').run(req.params.id);if(!r.changes)return res.status(404).json({error:'Student not found.'});res.status(204).end();afterWrite(res)}));
app.get('/api/students/:id',wrap((req,res)=>{
 const student=db.prepare('SELECT * FROM students WHERE student_id=?').get(req.params.id);
 if(!student)return res.status(404).json({error:'Student not found.'});
 const semesters=db.prepare('SELECT * FROM semesters WHERE student_id=? ORDER BY semester_no').all(req.params.id)
  .map(s=>({...s,subjects:db.prepare('SELECT * FROM subjects WHERE semester_id=? ORDER BY subject_code').all(s.semester_id)}));
 res.json({
  student,
  education:db.prepare('SELECT * FROM education_records WHERE student_id=? ORDER BY level').all(req.params.id),
  gaps:db.prepare('SELECT * FROM gap_years WHERE student_id=? ORDER BY start_year').all(req.params.id),
  semesters,
  seminars:db.prepare('SELECT * FROM seminars WHERE student_id=? ORDER BY event_date DESC').all(req.params.id),
  activities:db.prepare('SELECT * FROM activities WHERE student_id=? ORDER BY activity_date DESC').all(req.params.id)
 });
}));
app.post('/api/students/:id/education',wrap((req,res)=>{const b=req.body;if(!['SSC','HSC','Diploma'].includes(b.level)||!num(b.passing_year,1980,2100)||!num(b.marks,0,100))return res.status(400).json({error:'Choose SSC, HSC or Diploma and enter a passing year and marks from 0 to 100.'});const r=db.prepare('INSERT INTO education_records(student_id,level,institution,passing_year,marks) VALUES(?,?,?,?,?) ON CONFLICT(student_id,level) DO UPDATE SET institution=excluded.institution,passing_year=excluded.passing_year,marks=excluded.marks').run(req.params.id,b.level,b.institution||null,+b.passing_year,+b.marks);res.status(201).json({ok:true});afterWrite(res)}));
app.post('/api/students/:id/gaps',wrap((req,res)=>{const b=req.body;if(!num(b.start_year,1990,2100)||!num(b.end_year,+b.start_year,2100))return res.status(400).json({error:'Gap years need valid start and end years (end must not be before start).'});const r=db.prepare('INSERT INTO gap_years(student_id,start_year,end_year,reason) VALUES(?,?,?,?)').run(req.params.id,+b.start_year,+b.end_year,b.reason||null);res.status(201).json({gap_id:r.lastInsertRowid});afterWrite(res)}));
app.delete('/api/gaps/:id',wrap((req,res)=>{const r=db.prepare('DELETE FROM gap_years WHERE gap_id=?').run(req.params.id);if(!r.changes)return res.status(404).json({error:'Gap record not found.'});res.status(204).end();afterWrite(res)}));
app.post('/api/students/:id/semesters',wrap((req,res)=>{const b=req.body;if(!num(b.semester_no,1,16)||!isText(b.academic_year,12)||!num(b.sgpa,0,10)||!Array.isArray(b.subjects)||b.subjects.length<1)return res.status(400).json({error:'Semester number, academic year, SGPA (0–10), and at least one subject are required.'});for(const s of b.subjects){if(!isText(s.subject_code,20)||!isText(s.subject_name,140)||!num(s.credits,.1,10))return res.status(400).json({error:'Each subject needs a code, name and credits above zero.'});for(const k of ['theory','internal','external','practical','lab']){const max=s[`${k}_max`]??(k==='internal'?30:k==='external'?70:100),mark=s[`${k}_marks`];if(!num(max,.1,1000)||(mark!==''&&mark!==null&&mark!==undefined&&!num(mark,0,+max)))return res.status(400).json({error:`${k} marks must be between 0 and the configured maximum (${max}).`});}}
 const tx=db.transaction(()=>{const prev=db.prepare('SELECT cgpa FROM semesters WHERE student_id=? ORDER BY semester_no DESC LIMIT 1').get(req.params.id);const count=db.prepare('SELECT count(*) n FROM semesters WHERE student_id=?').get(req.params.id).n;const cgpa=((Number(prev?.cgpa||0)*count)+Number(b.sgpa))/(count+1);const info=db.prepare('INSERT INTO semesters(student_id,semester_no,academic_year,sgpa,cgpa) VALUES(?,?,?,?,?)').run(req.params.id,+b.semester_no,b.academic_year.trim(),+b.sgpa,+cgpa);const insert=db.prepare(`INSERT INTO subjects(semester_id,subject_code,subject_name,credits,theory_marks,theory_max,internal_marks,internal_max,external_marks,external_max,practical_marks,practical_max,lab_marks,lab_max) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);for(const s of b.subjects)insert.run(info.lastInsertRowid,s.subject_code.trim(),s.subject_name.trim(),+s.credits,s.theory_marks||null,s.theory_max??100,s.internal_marks||null,s.internal_max??30,s.external_marks||null,s.external_max??70,s.practical_marks||null,s.practical_max??100,s.lab_marks||null,s.lab_max??100);return info.lastInsertRowid;});const semester_id=tx();res.status(201).json({semester_id});afterWrite(res)}));
app.get('/api/subjects',wrap((req,res)=>{res.json(db.prepare('SELECT su.*,sm.semester_no,s.full_name,s.roll_no FROM subjects su JOIN semesters sm USING(semester_id) JOIN students s USING(student_id) WHERE s.student_id=? ORDER BY sm.semester_no,su.subject_code').all(req.query.student_id))}));
app.post('/api/students/:id/seminars',wrap((req,res)=>{const b=req.body;if(!['Internal','External'].includes(b.seminar_type)||!isText(b.title)||!dateOk(b.event_date)||!['Attended','Presented','Organized'].includes(b.participation||'Attended'))return res.status(400).json({error:'Enter a title, seminar type, valid date and participation.'});const r=db.prepare('INSERT INTO seminars(student_id,seminar_type,title,event_date,organizer,participation,achievement,certificate_url) VALUES(?,?,?,?,?,?,?,?)').run(req.params.id,b.seminar_type,b.title.trim(),b.event_date||null,b.organizer||null,b.participation||'Attended',b.achievement||null,b.certificate_url||null);res.status(201).json({seminar_id:r.lastInsertRowid});afterWrite(res)}));
app.post('/api/students/:id/activities',wrap((req,res)=>{const b=req.body;if(!['Technical','Co-curricular','Extracurricular'].includes(b.category)||!isText(b.title)||!dateOk(b.activity_date)||!['Participated','Volunteered','Organized'].includes(b.participation||'Participated'))return res.status(400).json({error:'Enter an activity title, category, valid date and participation.'});const r=db.prepare('INSERT INTO activities(student_id,category,title,activity_date,organizer,participation,achievement,certificate_url) VALUES(?,?,?,?,?,?,?,?)').run(req.params.id,b.category,b.title.trim(),b.activity_date||null,b.organizer||null,b.participation||'Participated',b.achievement||null,b.certificate_url||null);res.status(201).json({activity_id:r.lastInsertRowid});afterWrite(res)}));
for(const [route,table,key] of [['seminars','seminars','seminar_id'],['activities','activities','activity_id']]){
 app.put(`/api/${route}/:id`,wrap((req,res)=>{const b=req.body;const seminar=route==='seminars';const type=seminar?b.seminar_type:b.category;const allowed=seminar?['Internal','External']:['Technical','Co-curricular','Extracurricular'];const part=seminar?['Attended','Presented','Organized']:['Participated','Volunteered','Organized'];if(!allowed.includes(type)||!isText(b.title)||!dateOk(seminar?b.event_date:b.activity_date)||!part.includes(b.participation))return res.status(400).json({error:'Check the record title, category, date and participation.'});const r=seminar?db.prepare('UPDATE seminars SET seminar_type=?,title=?,event_date=?,organizer=?,participation=?,achievement=?,certificate_url=? WHERE seminar_id=?').run(type,b.title.trim(),b.event_date||null,b.organizer||null,b.participation,b.achievement||null,b.certificate_url||null,req.params.id):db.prepare('UPDATE activities SET category=?,title=?,activity_date=?,organizer=?,participation=?,achievement=?,certificate_url=? WHERE activity_id=?').run(type,b.title.trim(),b.activity_date||null,b.organizer||null,b.participation,b.achievement||null,b.certificate_url||null,req.params.id);if(!r.changes)return res.status(404).json({error:'Record not found.'});res.json({ok:true});afterWrite(res)}));
 app.delete(`/api/${route}/:id`,wrap((req,res)=>{const r=db.prepare(`DELETE FROM ${table} WHERE ${key}=?`).run(req.params.id);if(!r.changes)return res.status(404).json({error:'Record not found.'});res.status(204).end();afterWrite(res)}));
}
app.post('/api/sheets/sync',async(req,res)=>{try{const result=await syncSheets();if(!result.configured)return res.status(400).json({error:'Configure the Google Sheets credentials and spreadsheet ID in .env first.'});res.json({ok:true,...result})}catch(e){res.status(502).json({error:`Google Sheets sync failed: ${e.message}`})}});
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const port=process.env.PORT||3000;
if(require.main===module)app.listen(port,()=>console.log(`Student Ledger running at http://localhost:${port}`));
module.exports={app,db};
