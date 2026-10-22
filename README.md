# Zyngram Campus Hub

A role-aware, responsive full-stack learning hub built as a Day 17 project. The app has separate Student, Trainer, Campus Coordinator, and Administration portals, a React UI, an Express API, and MongoDB.

> **Scope:** This is a working project prototype, not a production campus system. Development-only sample access intentionally bypasses passwords and is disabled in production. No real trainee records, passwords, or API secrets are committed.

## Run it locally

Requirements: Node.js 20.19+ or 22.12+, npm, and Windows PowerShell.

```powershell
npm install
```

Start the local MongoDB service shown in MongoDB Compass, copy the example environment file, then start the app:

```powershell
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The Express API runs on `http://localhost:3001`; the app connects to `mongodb://localhost:27017/` and creates/uses the `zyngram_campus_hub` database and its collections on first start. `MONGODB_URI` and `MONGODB_DATABASE` in `.env` can override these local defaults.

The first `npm run dev` generates a random, persistent local `SESSION_SECRET` in `.env` if it is blank. This keeps development sign-ins valid across API restarts; if you already have an open session when the key is first generated, sign in once again. Keep `.env` private and use a separately managed secret in production.

To stop the local app, press **Ctrl+C** in the terminal running `npm run dev`; this stops both the API and frontend. MongoDB runs separately as a Windows service or Docker container, so stopping/restarting the app does not erase saved records. To check the Windows service, use `Get-Service MongoDB`; start or stop it from an elevated PowerShell only when needed. Keep the same `MONGODB_URI` and `MONGODB_DATABASE` in `.env` when restarting.

The development server, production server, account tools, and tests all use the MongoDB backend. The older SQLite prototype is not used by `npm run dev` or `npm start`; its separate database does not contain MongoDB demo accounts.

The local MongoDB database is initialized with indexed collections and non-destructive sample records on first startup. `npm run seed` can initialize a blank development database. Sample records use fictional `.example.test` identities; do not use real student information for the assignment demo.

The sign-in screen offers a **sample-data / development-only** option for each role so the prototype can be explored immediately. It is not a production authentication method. The trainer portal also lets you choose a trainer profile before entering that account's password. An administrator can add accounts and issue one-time password setup invitations from User management. In local development, the app returns a setup link to the administrator; in production, it emails the link through the configured SMTP service or, if SMTP is not configured, returns a link for the administrator to share privately. Links expire after 48 hours and are single-use.

Students can choose **New student? Create a ZIN ID** from the Student sign-in page. They submit their name and password; the app generates a unique, name-based ZIN ID and `@zyngram.com` login email. The ID is shown immediately, but the account cannot sign in until an admin approves the request in User management. Passwords are stored as salted hashes and are never shown to admins. SMTP plus `ADMIN_NOTIFICATION_EMAIL` enables an admin notification; the request remains in the queue if email is unavailable.

For a fictional production demo dataset, an administrator can open **User management → Add demo data** and confirm the import. This adds missing demo student/trainer/coordinator profiles, three sample courses, one task per demo student, and two announcements without overwriting existing accounts or records. The admin account is not replaced. Demo accounts are created without passwords and cannot sign in until an administrator sets up credentials; the `.example.test` addresses are non-deliverable and must be replaced with reachable addresses before sending invitations. The import is repeat-safe and writes to the configured application database through the authenticated backend.

Run `npm run seed` to initialize the configured development database if needed. It uses the same MongoDB settings as the application, does not delete or overwrite existing data, and is disabled in production.

To configure email delivery, set `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, and `ADMIN_NOTIFICATION_EMAIL` for an SMTP mailbox that you control. For Gmail, enable 2-Step Verification and create an App Password; keep it private and never commit it or paste it into chat. The example environment file intentionally contains no mailbox or password. Restart the app after changing local `.env`, or update the production host's secret settings and redeploy. `APP_BASE_URL` must be the public HTTPS app URL in production. If SMTP is not configured, student requests remain visible in the admin queue and the app reports that the notification was not sent. Approval works without SMTP; an administrator can generate a one-time setup link from User management and share it privately whether SMTP is unconfigured or email delivery fails.

To set a credential interactively for a sample account; characters are not echoed:

```powershell
npm run set-password -- student
npm run set-password -- trainer
npm run set-password -- coordinator
npm run set-password -- admin
npm run set-password -- trainer arjun.trainer@example.test
npm run set-password -- trainer neha.trainer@example.test
```

Choose a password of at least 12 characters. The application stores a salted scrypt hash, never the plaintext password. Supplying an email targets that specific account; without one, the command targets the first seeded account for the role. The three fictional local trainer accounts are Priya Nair (`priya.demo@example.test`), Arjun Rao (`arjun.trainer@example.test`), and Neha Varma (`neha.trainer@example.test`). Each trainer sees courses and related learner activity assigned to their account.

The sample trainer-to-course assignments are Priya — Full Stack Web Development, Arjun — Digital Marketing, and Neha — Finance Fundamentals. These are fictional demonstration courses, not a live Zyngram catalogue.

To provision the requested local demo students with one-time generated credentials, run `npm run create-demo-students`. It creates the 15 named `.example.test` accounts in the configured development database, stores only salted password hashes, and prints each password once. The script refuses to run in production or when any of those email addresses already exist.

To give local demo students a submit-ready assignment, run `npm run assign-student-work`. It assigns a practical project from Full Stack Web Development, Digital Marketing, or Finance Fundamentals to each student without existing open work, preserves submitted work, and records the assignment in the audit log. Students submit a viewable HTTPS project link and an optional trainer note from Tasks & feedback. This script is disabled in production.

### Public deployment (Render + MongoDB Atlas)

The repository includes `render.yaml` for a Render web service. To deploy:

1. Create a MongoDB Atlas cluster and a database user scoped to the Campus Hub database. Restrict Atlas network access to the Render service's outbound IP addresses; do not publish the database credentials or connection string.
2. Push this project to a private GitHub repository and create a Render Blueprint from it.
3. In Render, set `MONGODB_URI` to the Atlas connection string, `BOOTSTRAP_ADMIN_EMAIL` to the administrator's email, `BOOTSTRAP_ADMIN_PASSWORD` to a unique password of 12–200 characters, and `APP_BASE_URL` to the public HTTPS service URL. Configure `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, and `MAIL_FROM` using a trusted SMTP provider. Render generates `SESSION_SECRET`.
4. Deploy and verify `/api/health`. On an empty production database, the app creates only the administrator account and does not seed demo users or sample campus records.
5. After the first successful deploy, remove `BOOTSTRAP_ADMIN_PASSWORD` from Render's environment settings. Its salted scrypt hash remains in MongoDB.

If you also publish the frontend on Netlify, set its publish directory to `frontend/dist`. The included Netlify rewrite forwards `/api/*` requests to `https://zyngramcampushub.onrender.com`; update `frontend/public/_redirects` if your Render service uses a different hostname. Set Render's `APP_BASE_URL` to the public frontend URL used for invitation links.

If Render logs report `MongoServerError: bad auth : Authentication failed`, update `MONGODB_URI` in the Render service settings with the correct Atlas **database user** credentials (not your Atlas website login). Reset the database user's password in Atlas if needed, percent-encode reserved characters in the URI username or password, save the setting, and redeploy. Never paste the connection string into logs, chat, or source control. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md#mongodb-atlas-authentication-failure) for more checks.

The deployment template contains no cloud credentials. The Netlify frontend is publicly reachable, but as checked on 2026-10-21 its `/api/health` returned 404. The Render API health endpoint returned `{"status":"ok","app":"Zyngram Campus Hub demo"}`. The frontend rewrite in this repository still needs to be deployed before the Netlify-hosted app can be verified end to end.

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the deployment architecture, configuration, restart steps, verification report, and remaining live-deployment requirements.

### Production-mode safety check

Production disables the demo-account list and demo login endpoint, requires a session-signing secret, enables secure cookies, and serves the built frontend:

```powershell
$env:NODE_ENV = 'production'
$env:SESSION_SECRET = '<provide a unique secret through your deployment secret manager>'
npm run build
npm start
```

Do not deploy the sample access workflow, development server, or local development database as a live student system. Before production, configure HTTPS, MongoDB backup/retention and restore drills, operational monitoring, and institutional privacy/security review.

### Security & access control

- API authorization is enforced server-side: students receive their own records and enrolled-course materials; trainers are scoped to assigned courses and learners; placement coordinators manage applications and placement-ready communications; administrative account, course, enrollment, and system-rule changes are admin-only. Dashboard and API announcement visibility use the same recipient/audience scope.
- Sign-in uses salted scrypt password hashes, constant-time hash comparison, HTTP-only `SameSite=Strict` cookies, and signed eight-hour sessions. Password setup and reset links are random, single-use, stored only as hashes, and expire after 48 hours and one hour respectively. Password reset and account role/email changes revoke existing sessions. Production reset mail requires the configured SMTP settings.
- Failed sign-ins are throttled by a hashed account identifier and client IP (8 attempts/account and 60/IP per 15-minute window); reset requests are throttled (5/account and 20/IP). Counters are stored in MongoDB with TTL cleanup so the limits are shared across application instances.
- Sensitive actions are recorded in the admin-only audit log, including exam grading outcomes, automatic and manual learning unlocks, placement decisions, account/role changes, and sign-in/password-reset events. Resume downloads are restricted to the applicant and authorized placement staff/admins; lesson files require an enrolled student or assigned trainer.
- API responses are marked `no-store`; production responses include a restrictive Content Security Policy and HSTS alongside anti-framing, MIME-sniffing, referrer, and permissions-policy headers.
- MongoDB backup tooling is an operational dependency, not part of the web application. For production, enable Atlas automated backups/point-in-time recovery and restrict backup access. Periodically create an encrypted archive and restore it only into an isolated staging database or cluster; never test `--drop` against production. With MongoDB Database Tools installed and connection strings supplied through environment variables/your secret manager:

```powershell
$archive = Join-Path $env:TEMP ("campus-hub-{0}.archive.gz" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
mongodump --uri="$env:MONGODB_URI" --db="$env:MONGODB_DATABASE" --archive="$archive" --gzip
mongorestore --uri="$env:RESTORE_TEST_MONGODB_URI" --archive="$archive" --gzip --nsFrom="$($env:MONGODB_DATABASE).*" --nsTo="$($env:MONGODB_DATABASE)_restore_test.*" --drop
```

Connect to the restore-test cluster with `mongosh`, verify that the restored database contains the expected collections and representative record counts (including `users`, `courses`, `exam_attempts`, `internship_applications`, `resume_files`, and `lesson_files`), then point a staging app at that restored database and verify `/api/health` and representative role-scoped workflows. Keep the archive outside the repository, protect it as student data, and remove the temporary restore database/archive under your retention policy. This repository environment does not include `mongodump`, `mongorestore`, or `mongosh`; a real backup/restore drill must be completed in the deployment environment before pilot launch.

## What works in this prototype

- Four distinct portal entry points; each opens a role-labelled sign-in screen. Credential sign-in checks the selected portal, email or student ZIN ID, and salted password hash.
- Development-only sample access makes it possible to demonstrate every role without distributing credentials.
- Role-aware dashboard, courses, schedule and attendance, learner tasks and feedback, progress and certificates, announcements, campus services, support, and profile.
- Student self-registration generates a unique ZIN ID and saves a pending request with a salted password hash; it does not create a login account. Only an admin can approve or reject the request. Approval activates the student's account and credentials; only then can the student sign in with their ZIN ID or generated Zyngram email. Configure the admin recipient and SMTP sender in `.env` to receive request notifications.
- Trainer course-material learner pickers load the current course roster plus students with approved registrations and active credentials. Newly approved students appear automatically, and their first assigned practice task links them to that course.
- Role-specific navigation: students see personal learning and certificates, trainers get assigned learner submissions/progress, coordinators get campus monitoring and publishing, and administrators get user management, reports, and the activity log.
- Administrator dashboard has campus-wide account, course, coordinator, enrollment, and attendance summaries with shortcuts to user management, course/trainer assignments, student enrollment, exam pass-mark rules, placement workflow, reports, read-only access/system information, and the audit log. Course and enrollment changes are restricted to administrators and audited; account roles and cohorts are assigned and updated through user management.
- Administrators can create, update, and delete courses that have no linked learning activity or student records. Deletion is blocked when enrollments, lessons, tasks, exams, attendance, or other course activity exists, preserving student history. Trainers can delete their own lessons only when no learner completion record exists; uploaded lesson files are removed with the lesson.
- Admins and campus coordinators can use College pilot workspace to configure one college's name, location, academic year, pilot cohort, learner target, and placement-readiness goal. Its course-to-career view and launch milestones are computed from live course assignments, enrollments, lessons, exams, attendance, internship opportunities, and application records. The goal is a planning target, not a placement promise; configure your college details before presenting.
- Administrators can create and update courses, assign a trainer, enroll individual students or eligible students in a cohort, and revoke course access. Cohort enrollment previews the matching roster, skips active and legacy task-based course access, reactivates revoked enrollments, notifies newly enrolled students, and records one batch audit entry. Existing course/task associations are migrated into the enrollment roster without deleting learner work.
- Students can submit a validated HTTPS project link and a note. Trainers can review work from courses assigned to them and leave feedback; coordinators and admins have campus-wide review access.
- Admins can target announcements to all campus users, students, trainers, a cohort, a course, or internship-ready students; trainers can only publish to their assigned courses, and placement coordinators can target internship-ready students. Announcements support scheduled publication and expiry, with audience-scoped notifications.
- Notifications cover exam reminders and results, assignment deadlines, support conversations, announcements, and placement updates. Users can mark individual notifications or all notifications read.
- Students and staff can create persistent support tickets and reply in the private conversation. Admins can assign tickets to campus staff and record resolution notes; only the requester, admins, and assigned staff can access each thread. This stores tickets in MongoDB but does not send email or guarantee a response SLA.
- Trainers can record present/late/absent attendance for learners with tasks assigned to their course; coordinators/admins can record across courses. Records are unique per learner/course/date and staff changes are audited. Schedule dates remain illustrative.
- HTTP-only, SameSite session cookie, eight-hour signed sessions, salted scrypt password hashes, single-use password recovery, account/IP sign-in throttling, server-side role checks, request validation, MongoDB indexes, security headers, and audit entries for sign-in/sign-out, exam results and progression, placement decisions, invitations, password resets, task workflow, announcements, support-ticket changes, attendance entry, and account/role changes.
- Sample learner records in `example.test` only.

### Day 19 local MVP submission

For this assignment, **Trainee** maps to the existing Student/Candidate role. Student self-registration is approval-controlled: a trainee creates a ZIN ID and password, then waits for an admin to approve the request before the account can sign in. Other account types remain administrator-provisioned through User management and one-time setup links. The profile page allows users to update their display name; email, cohort, and role are controlled by an administrator.

**Demonstration path**

1. Start MongoDB, copy `.env.example` to `.env`, and run `npm install` followed by `npm run dev`.
2. Open the local Vite URL and choose Administration, then use development-only sample access for a quick demo or use a provisioned admin account.
3. Show User management to create a trainee account and issue its password setup link; invalid account inputs are rejected with visible messages. Show the Student portal and profile edit, then return to Administration.
4. Open Courses & batches to create, edit, and remove an unused course; attempt to remove an active course to demonstrate that the API protects learner history. Enroll one student or a cohort and show that non-admin accounts cannot use admin APIs.
5. In Course materials, publish and edit a lesson, remove a lesson without learner completions, and show that a completed lesson cannot be deleted.
6. Run `npm test` and `npm run build` to show the automated API checks, API-restart persistence test, and production frontend build.

**Student registration review flow:** optionally configure SMTP and `ADMIN_NOTIFICATION_EMAIL` for admin notifications; open Student portal → **New student? Create a ZIN ID**; submit the student's name and password; copy the generated ZIN ID shown on screen; sign in as admin and open User management → **Student registration requests**; approve the request. The student can then sign in with the ZIN ID or generated `@zyngram.com` email and the password they created. Before approval, login is blocked. If SMTP is unavailable, the request remains in the admin queue and the UI reports that no notification was sent.

**Known limitations to disclose:** this is a locally runnable prototype, not a live college deployment. Student requests do not grant access until an admin approves them; MongoDB must be installed and running locally (or be reachable at the configured URI); the demo-only sample access is disabled in production; schedule/sample learning data can be illustrative; email requires SMTP configuration; and public hosting, institutional privacy review, and a production backup/restore drill are not completed.

**Verification performed for the Day 19 checklist:** `npm test` covers successful and invalid login, account creation and input validation, role restrictions, profile updates, course and lesson create/update/delete workflows, and enrollment workflows. It starts the API against an isolated MongoDB database, creates a course, restarts the API process against the same database, confirms the course remains available, then drops the temporary test database. `npm run build` verifies the frontend production bundle. The app and MongoDB health endpoint should be checked locally after setup with `http://localhost:5173` (or the Vite URL printed at startup) and `http://localhost:3001/api/health`. This verifies application-restart persistence, not a MongoDB backup/restore drill.

| Assignment check | Result | Evidence |
|---|---|---|
| Responsive landing, role navigation, dashboard and profile | Pass | Running app screenshot; manual browser check |
| Registration/onboarding, login, invalid credentials and input validation | Pass | Admin-created trainee plus one-time setup flow; API tests |
| Role restrictions and profile update | Pass | API tests; profile update restricted to the signed-in user |
| Course/module create, read, update, and safe delete; lesson delete | Pass | Admin/trainer UI and API tests; linked learning history blocks deletion |
| MongoDB connection and saved record after API restart | Pass | Automated isolated MongoDB/API restart test |
| Automated tests and production frontend build | Pass | `npm test`, `npm run build`; results screenshot |
| Public deployment and production backup/restore | Not part of local MVP | Disclose as unfinished |

**Evidence screenshots:** [running application landing page](./docs/screenshots/campus-hub-landing.png) and [latest automated test results](./docs/screenshots/test-results.png). Capture a fresh dashboard/profile screenshot during the presentation if you need evidence from your own machine and current demo data.

## Project map

```text
frontend/
  index.html          Vite application entry point
  src/
    App.jsx           React portals, pages, navigation, forms, and workflows
    styles.css        Responsive visual system and accessible focus states
  public/             Static frontend assets
  vite.config.js      Frontend development server and production build
backend/
  server/
    index.js          Express routes, sessions, validation, role checks, audit
    db.js             MongoDB connection, collection indexes, environment-specific setup
    mailer.js         SMTP delivery for one-time account invitations
  scripts/            Backend maintenance and demo-data scripts
  test/               Backend API tests
  data/               Local backend data files
package.json          Root commands for running the frontend and backend together
render.yaml           Render deployment blueprint
docs/
  DESIGN_MODEL.md     Roles, data model, journeys, sitemap, and scope
  presentation.html   Eight-slide, browser-ready presentation
```

## Validate

```powershell
npm test
npm run build
```

See [the design and implementation blueprint](docs/DESIGN_MODEL.md) for the revised UI specification, role and module requirements, registration-to-service workflow diagram, data model, roadmap, and test gates. The [presentation deck](docs/presentation.html) contains the visual design and an eight-slide project walkthrough.
