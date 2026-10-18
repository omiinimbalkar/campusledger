# Campus Ledger

A responsive student academic and campus activity ledger built as a DBMS mini-project. It combines a browser GUI, an Express API, a normalized SQLite database, role-based demo sign-in, and optional one-way Google Sheets export.

## Contents

- [Project overview](#project-overview)
- [Requirements and startup](#requirements-and-startup)
- [Demo accounts and roles](#demo-accounts-and-roles)
- [Using the application](#using-the-application)
- [How the application works](#how-the-application-works)
- [Database design](#database-design)
- [Google Sheets export](#google-sheets-export)
- [Deploy to Render](#deploy-to-render)
- [Vercel and GitHub Pages options](#vercel-and-github-pages-options)
- [Database location and direct updates](#database-location-and-direct-updates)
- [API overview](#api-overview)
- [Known limits and deployment checklist](#known-limits-and-deployment-checklist)
- [Database tests](#database-tests)

## Project overview

Administrators can manage student profiles, previous education, semester results and subjects, academic gap years, seminars, and activities. Students sign in to view their own profile in read-only mode. The dashboard includes name/roll-number search, SGPA/CGPA progression, gap-year markers, subject-mark tables, and separate portfolio categories.

| Area | Implementation |
| --- | --- |
| User interface | HTML, CSS and browser JavaScript in `public/` |
| Web server and API | Node.js and Express in `server.js` |
| Database | SQLite via `better-sqlite3`; schema in `schema.sql` |
| Spreadsheet export | Google Sheets API, optional and one-way |

## Requirements and startup

Requirements: Node.js 18 or newer and npm. No separate database server is required.

From the project folder:

```powershell
npm install
npm start
```

Open <http://localhost:3000>. For development with automatic Node restart, use `npm run dev`.

The app creates `data/ledger.db` on first launch and inserts sample data when the student table is empty. Keep this file to preserve changes. To reset the demo, stop the server and remove the database file; the next start will create and seed a fresh database.

## Demo accounts and roles

| Role | Username | Password | Access |
| --- | --- | --- | --- |
| Admin | `admin` | `admin123` | Search and manage all students and records; request Sheets sync |
| Student | `student` | `student123` | View the sample student profile for roll `CS-2022-014`; read-only |

Use **Sign out** to switch accounts. The server enforces these role restrictions for API requests as well as hiding edit controls in the student view.

These fixed credentials are for a local class demonstration only. They are public defaults, use no password hashing, and are not suitable for a public deployment. Optional account overrides are documented in `.env.example`.

## Using the application

1. Sign in. The Admin account opens the student roster; the Student account opens its linked student profile.
2. As Admin, search by student name or roll number and select a student.
3. Use **Add student**, **Edit profile**, and **Delete** to manage profiles. Deleting a student also deletes their dependent ledger records.
4. Use **Overview** to review education, CGPA, semesters and gap years. The chart plots SGPA and CGPA, with markers for recorded gaps.
5. Use **Academics** to add semester results and subjects. Subject rows store theory, internal, external, practical and lab marks with configured maximums.
6. Use **Seminars** to separate Internal and External events. Use **Activities** to separate Technical, Co-curricular and Extracurricular records.
7. As Student, browse the same academic and portfolio information for the linked profile. Editing, deleting and roster search are unavailable.

The user/technical report is available in the app at `/report.html`.

## How the application works

### Basic view

Think of the project as three parts:

1. **Web page:** You sign in, search, open tabs, and submit forms in the browser.
2. **Server:** The Express app receives requests, checks the account role and validates submitted information.
3. **Database:** SQLite stores the student and portfolio records in `data/ledger.db`.

When the page loads, it asks the server for the current sign-in state. Admin can search the roster and manage records. Student can read only the profile linked to that demo account. After a save, the page requests fresh data and updates the visible profile.

### Request and save flow

For example, when Admin adds a semester:

1. The browser collects the semester, SGPA, and subject/mark fields from the form.
2. Browser JavaScript sends a JSON request to the Express API with the session cookie.
3. The server verifies that the signed-in role is Admin and checks required fields, score ranges, and subject values.
4. The server writes the semester and its subjects to SQLite in one transaction. If a subject insert fails, the semester transaction rolls back.
5. SQLite foreign keys and `CHECK`/`UNIQUE` constraints enforce the schema rules.
6. The server returns success or a readable error. The browser refreshes the student's profile and shows a confirmation or error message.
7. If Google Sheets is configured, a successful GUI/API write starts a one-way snapshot export. SQLite remains the saved source if Google sync fails.

### Advanced structure

- `public/index.html` defines the dashboard and forms. `public/styles.css` handles layout and responsive styling. `public/app.js` manages UI state, form submissions, and API calls.
- `server.js` serves the static page, authenticates demo sessions, enforces Admin/Student permissions, validates inputs, runs SQL queries, and handles Google Sheets export.
- `schema.sql` defines relational tables, keys, indexes, cascades, allowed categories, uniqueness rules, and score/year constraints.
- `data/ledger.db` stores the persistent SQLite database. On an empty database, the server creates sample student and activity records.
- Authentication uses a signed, HTTP-only session cookie with an eight-hour expiry. The demo account definitions are in `server.js` and can be overridden with the `DEMO_*` environment variables. This is classroom authentication, not a production user-management system.
- Spreadsheet sync is initiated by app/API writes or the Admin sync button. Direct SQL writes do not notify the application, and sheet edits are never imported back into SQLite.

## Database design

The schema is defined in [`schema.sql`](schema.sql). SQLite is the relational database and source of truth. The tables separate students, optional advisors, education records, gap years, semesters, subjects, seminars and activities. Related rows use primary and foreign keys rather than duplicating student profiles.

- `education_records` stores SSC (10th), HSC (12th), or Diploma with one row per student and level.
- `semesters` stores one result per student and semester number; `subjects` stores each subject's assessment marks and links to its semester.
- `seminars` stores Internal/External records; `activities` stores Technical/Co-curricular/Extracurricular records.
- Deleting a student cascades to dependent records. Deleting a semester cascades to its subjects. Deleting an optional advisor sets the student advisor reference to `NULL`.
- Unique and `CHECK` constraints enforce unique roll numbers/emails and result keys, valid years/statuses/categories, positive credits, marks within configured maxima, and SGPA/CGPA in the 0–10 range.
- Semester and subject insertion is transactional. The API validates input and returns readable errors; SQLite constraints remain the final integrity check.

SGPA is entered with each semester. The app calculates CGPA using the previous CGPA and the newly entered SGPA; it does not calculate SGPA from individual subject marks.

## Google Sheets export

Export is optional. To configure it:

1. Create a Google Cloud service account and enable the Google Sheets API.
2. Create a spreadsheet with a worksheet named **Ledger** and share it with the service-account email as an editor.
3. Copy `.env.example` to `.env` and set `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY`.
4. Put escaped `\\n` line breaks in the private key, then restart the server.
5. Sign in as Admin and use the **Google Sheets** button to request an immediate sync.

When configured, successful GUI/API writes also start a background snapshot sync. If Google is unavailable, the SQLite write remains saved; use the button to retry. Each sync replaces the **Ledger** tab with a complete current snapshot. Put manual notes in another tab.

This integration is one-way: edits in the spreadsheet never update SQLite. Direct SQL changes do not automatically trigger sync; click the Sheets button after a direct edit. Do not commit `.env` or share the service-account private key.

## Deploy to Render

The server is a Node/Express web service, so deploy it as a **Web Service**, not as a static site. The steps below use Render; the same storage requirement applies on other hosts. Render's filesystem is temporary unless a persistent disk is attached. Persistent disks are available on paid web services, so a free service without persistent storage is not appropriate for keeping this SQLite database across redeploys. See Render's [Node/Express deployment guide](https://render.com/docs/deploy-node-express-app) and [persistent disk documentation](https://render.com/docs/disks).

### 1. Prepare the project for GitHub

Create a GitHub repository, then run these commands from the project folder (replace the URL with your repository URL):

```powershell
git init
git add .
git commit -m "Prepare Campus Ledger for deployment"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

The `.gitignore` excludes `.env`, `node_modules`, logs, and local database files. Confirm `.env` and `data/ledger.db` are not staged before pushing. If you want the hosted app to start with the sample data, Render will create and seed a new database on first launch. To carry over real local records, make a separate database backup and transfer it to the mounted disk before using the hosted app.

### 2. Create the web service

In the Render Dashboard, choose **New → Web Service**, connect the GitHub repository, and set:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/` |

The server reads the host-provided `PORT` environment variable.

### 3. Attach persistent SQLite storage

Add a persistent disk to the service with this mount path:

```text
/opt/render/project/src/data
```

Set this environment variable in Render:

```text
DATABASE_FILE=/opt/render/project/src/data/ledger.db
```

Only files under the disk mount path persist, so keeping `DATABASE_FILE` inside that directory is essential. Pick a disk size suitable for your data; disk size cannot be reduced later.

### 4. Configure secrets and optional Sheets export

Add these in the Render service's **Environment** settings. Generate a long random `SESSION_SECRET`, and replace the public demo passwords before sharing the URL:

```text
SESSION_SECRET=<long random secret>
DEMO_ADMIN_USERNAME=admin
DEMO_ADMIN_PASSWORD=<new admin password>
DEMO_STUDENT_USERNAME=student
DEMO_STUDENT_PASSWORD=<new student password>
```

For Sheets export, also add `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY`. Keep secret values in the Render dashboard, not in GitHub or `render.yaml`.

### 5. Deploy and confirm persistence

Click **Create Web Service**. When the deployment is live, open the Render URL, sign in, and check the dashboard. Add a temporary test record, restart or redeploy the service, and confirm the record remains. Remove the temporary record afterward. Review the Render logs if startup fails.

Future pushes to the connected branch can trigger new deploys. Keep the persistent disk attached and retain backups of the database. Do not treat the demo login as production authentication; use managed users and secure password storage before relying on this for real student records.

## Vercel and GitHub Pages options

### GitHub repository versus GitHub Pages

A **GitHub repository** stores and versions the project code. You can connect that repository to a host such as Render or Vercel. Creating a repository by itself does not run the application.

**GitHub Pages** publishes static HTML, CSS and JavaScript. This project also needs the Express API and a writable database, so publishing `public/` to Pages alone will not provide working login, data operations or Sheets sync. GitHub describes Pages as a static-site hosting service in its [official documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

To use GitHub Pages only as a static project showcase, create a repository, push the code, then open **Settings → Pages** and choose the publishing branch/folder. The live app features that call `/api/...` will not work there; do not publish real student data or secrets.

### Vercel

Vercel can deploy Express as a serverless Function; see [Express on Vercel](https://vercel.com/docs/frameworks/backend/express). The current app is not ready for a complete Vercel deployment because it writes to a local SQLite file. A Vercel Function does not provide the persistent writable database file this app needs, and Vercel documents object storage or a database for persisted writes in its [file storage guidance](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions). Also, Vercel serves files in `public/` itself and does not use this app's `express.static()` middleware in the same way.

To deploy the **full app** on Vercel, first migrate the database layer from SQLite to a hosted PostgreSQL service, adapt the schema and queries, and verify the API/session behavior for serverless requests. Then push the project to GitHub, import the repository from Vercel, configure the database and app secrets as environment variables, deploy, and test login plus create/read/update/delete operations. Keep Google service-account credentials in Vercel's environment settings, never in the repository.

### Which route to choose

- **Keep the current SQLite implementation:** GitHub repository for source + Render Web Service + persistent disk, following [Deploy to Render](#deploy-to-render).
- **Use Vercel:** GitHub repository + Vercel + hosted PostgreSQL, after the required database migration.
- **Use GitHub Pages:** static showcase only; it cannot host this project's complete backend/database app.

## Database location and direct updates

The default file is [`data/ledger.db`](data/ledger.db). To change it, set `DATABASE_FILE` in `.env`. Open the file with a SQLite tool such as DB Browser for SQLite or a VS Code SQLite extension to browse tables and rows. `schema.sql` describes the table structure.

For direct SQL maintenance, stop the server, back up the database, and use a SQLite client. Enable foreign keys in that connection with `PRAGMA foreign_keys = ON`. Direct SQL bypasses API validation and automatic Sheets sync. Restart the server after editing, then use Admin's Sheets button if an export is needed. Do not edit the database file while the app is running.

## API overview

The browser calls the Express API under `/api`. Main routes include:

- Authentication: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Students: `GET /api/students?q=...`, `POST/PUT/DELETE /api/students`, `GET /api/students/:id`
- Student records: `POST /api/students/:id/education`, `/gaps`, `/semesters`, `/seminars`, `/activities`
- Portfolio maintenance: `PUT/DELETE /api/seminars/:id` and `/api/activities/:id`
- Statistics and export: `GET /api/stats`, `POST /api/sheets/sync`

The Student role is limited to its linked profile and read-only requests. Admin is required for writes and Sheets sync.

## Known limits and deployment checklist

- SQLite is used instead of PostgreSQL/MySQL.
- Google Sheets credentials are optional; direct database edits need a manual sync, and spreadsheet changes are not imported.
- Demo credentials are public and are not production authentication.
- Before hosting publicly, add managed user accounts and securely hashed passwords, use HTTPS, configure a strong stable `SESSION_SECRET`, protect Google credentials, and choose a synchronization strategy for direct database writes.

## Database tests

Run `npm test` to execute the database integrity tests using an isolated temporary database. They cover duplicate keys, invalid marks/SGPA, student and semester cascade deletes, and advisor `ON DELETE SET NULL` behavior.
