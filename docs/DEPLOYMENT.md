# Day 20 — Campus Hub deployment guide

## Deployment status

**Live deployment: partially verified.** As checked on 2026-10-21, the Render service at `https://zyngramcampushub.onrender.com/api/health` returned `{"status":"ok","database":"mongodb"}`. Netlify had been returning an unrelated demo response because its rewrite targeted a different Render hostname. The rewrite now targets the actual service hostname; publish and verify the latest Netlify deploy and application flows before reporting the full deployment as operational.

## Architecture

```text
Browser (HTTPS)
    |
    v
Render Node web service
  - Express API
  - serves the built React/Vite frontend
  - /api/health health check
    |
    v
MongoDB Atlas
  - application records and indexes
  - persistent independently of Render restarts
```

`render.yaml` configures a Node web service, runs `npm ci && npm run build`, starts the server with `npm start`, and uses `/api/health` as its health check. Render terminates HTTPS. The Express service serves `frontend/dist` in production and handles `/api` requests on the same origin. Production session cookies are HTTP-only, secure, and SameSite strict.

## Provider setup

1. Push the project to a **private, authorized** GitHub repository. Confirm the repository root is the project directory; do not include `.env`, database files, or real personal data.
2. Create an Atlas cluster and a least-privilege database user scoped to the app database. Configure Atlas network access to the Render service's documented outbound IPs or the approved restricted network path. Do not use a public `0.0.0.0/0` allowlist for a production database.
3. Create a Render Blueprint from the private repository and set the environment values in the Render dashboard's secret settings. Never put secret values in this file, the repository, or a frontend `VITE_*` variable.
4. Use the generated Render HTTPS service URL for `APP_BASE_URL` unless an approved custom HTTPS domain is assigned.
5. Deploy and inspect the service logs and `/api/health`. The health response reports the service/database type but does not prove every application flow; perform the verification checklist below separately.
6. On a new empty production database, the application creates indexes and only the administrator account configured by the bootstrap values. It does not seed local demo accounts or sample records.
7. After the first successful administrator bootstrap, remove `BOOTSTRAP_ADMIN_PASSWORD` from Render settings. Preserve the administrator's access through the approved password manager. Do not submit the credential in the deliverables.

### Required environment settings

| Variable | Set in | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Render | Must be `production`. |
| `MONGODB_URI` | Render secret | Atlas connection URI; never expose in browser code or logs. |
| `MONGODB_DATABASE` | Render | Database name, e.g. `zyngram_campus_hub`. |
| `SESSION_SECRET` | Render secret | Render Blueprint generates this; keep it stable across restarts. |
| `APP_BASE_URL` | Render | Public HTTPS URL used to create invitation/reset links. |
| `BOOTSTRAP_ADMIN_EMAIL` | Render secret/settings | Approved administrator email for first-database initialization. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Render secret, first deploy only | Unique 12–200 character bootstrap password; remove after successful bootstrap. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE` | Render | SMTP transport settings. |
| `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | Render secrets/settings | SMTP account credentials and sender. |
| `ADMIN_NOTIFICATION_EMAIL` | Render settings | Approved administrator mailbox for student-registration request notifications. |

The Student sign-in page includes a **Request access** form. Submissions are stored in the administrator's **User management → Student registration requests** queue. When SMTP and `ADMIN_NOTIFICATION_EMAIL` are configured, the service emails the administrator; if email is unavailable, the saved request remains visible in that queue and the applicant is told the email was not sent. Approving a request creates a student account with no password; the administrator must then use **Send invitation** to deliver the one-time password setup link. Declining a request does not create an account.

To add the fictional demonstration records to the configured production database, sign in as administrator, open **User management**, choose **Add demo data**, and confirm. This admin-only API action runs on Render and uses the Render `MONGODB_URI`/`MONGODB_DATABASE` connection to Atlas; it does not use the developer workstation's local `.env` database. It inserts missing demo profiles, courses, assignments, and announcements without overwriting existing records. Passwords remain unset, so imported demo accounts cannot sign in until credentials are configured. `.example.test` addresses are non-deliverable. The import is safe to repeat.

The `.env.example` file contains blank secret/identity fields by design. For local use only, copy it to `.env` and use a local MongoDB URI. For production, set secrets only in the hosting provider's secret manager. Never copy a production `.env` into the repository.

### MongoDB Atlas authentication failure

If startup fails with `MongoServerError: bad auth : Authentication failed` (Atlas error code `8000`), Atlas was reached but rejected the credentials in `MONGODB_URI`. In the Atlas dashboard and Render service settings:

1. Confirm the URI is for the correct cluster and that its username/password belong to an Atlas **database user** with access to the configured database. The Atlas website account password is not a database-user password.
2. Reset the database user's password in Atlas if uncertain, then update the `MONGODB_URI` secret in Render with the new connection string.
3. Percent-encode reserved characters in the URI username and password (for example, `@` becomes `%40`). Do not share the credentials or paste the URI into chat, logs, or source control.
4. Save the Render environment change and redeploy/restart the service so the process reads the updated secret.

If credentials are confirmed but the error changes to a connection timeout, check Atlas Network Access and the service's allowed outbound addresses separately. Network access problems typically produce a timeout, not an authentication-failed response.

### Netlify frontend with Render API

This app's frontend calls `/api/*` on its own origin. When publishing `frontend/dist` on Netlify, `frontend/public/_redirects` proxies those requests to the Render service at `https://zyngramcampushub.onrender.com`. If the Render hostname differs, update that redirect target before deploying. Set Render's `APP_BASE_URL` to the Netlify public URL if Netlify is the user-facing site so invitation links open the correct frontend. The Netlify frontend cannot pass its health check while the Render API is unavailable.

## Database initialization, persistence, and restart

There is no separate SQL migration command. On startup, `backend/server/db.js` connects to MongoDB, creates/ensures indexes, applies the documented legacy status normalization, and bootstraps an administrator only when the users collection is empty. Existing records are not replaced by sample records in production.

To restart or redeploy, use the Render dashboard's service restart/deploy controls after updating settings or an authorized source revision. Keep `MONGODB_URI`, `MONGODB_DATABASE`, and `SESSION_SECRET` unchanged across ordinary restarts. Verify `/api/health`, then sign in and confirm a test record remains. Do not test persistence by deleting the service or database. Configure Atlas backup/restore according to the approved retention policy before production use.

## Verification checklist

Run these checks against the **deployed HTTPS URL** and record date, URL, result, and evidence. Do not report an unchecked item as passed.

- [ ] HTTPS page loads and application assets render.
- [ ] `/api/health` responds successfully.
- [ ] Approved administrator sign-in works; unauthenticated administration requests are denied.
- [ ] Approved candidate/student sign-in works; role-restricted routes reject unauthorized roles.
- [ ] Student access requests appear in the administrator queue; approve/decline actions work, and configured email notification reaches the approved mailbox.
- [ ] Profile update persists after sign-out/sign-in.
- [ ] Implemented course/module management flow persists when used by an authorized role.
- [ ] Invalid input returns a validation error; unauthenticated API requests return `401` and disallowed role requests return `403`.
- [ ] Create a synthetic record, restart/redeploy the web service, then verify the record remains in Atlas.
- [ ] Production demo/sample-access endpoint is unavailable.
- [ ] Review response/log output for accidental secret exposure; confirm no real customer or employee records were used.

### Local checks actually run for this workspace

| Check | Result |
| --- | --- |
| `npm test` | **Passed** — 2 test suites, 2 tests, 0 failures. Covers role boundaries, profile validation/update, API flows, and persistence across an API process restart against the configured local MongoDB test database. |
| `npm run build` | **Passed** — Vite production build completed. |
| Deployed HTTPS URL / hosted database | **Not run** — no authorized host service or Atlas URI is configured in this workspace. |
| Live approved-account sign-in / hosted persistence | **Not run** — requires the authorized deployment and synthetic approved accounts. |

## Known limitations and demonstration

- There is currently no live application URL, connected repository/host service, or hosted Atlas database configured by this workspace.
- The application labels its learner role **Student** or **Candidate**, not “Trainee”; use the project's actual role labels in the demonstration.
- A fresh production database begins with only the bootstrap administrator and no local sample courses or accounts. Create approved synthetic test users and required course records through authorized application flows before demonstrating learner/trainer features.
- Registration approval notifications require valid SMTP settings. Configure and test a mailbox controlled by the authorized operator before claiming this flow works in production.
- File uploads are stored as MongoDB documents. Review Atlas storage limits and approved file-retention policy before production-scale use.
- This prototype deployment is not a substitute for formal privacy, security, backup/restore, monitoring, and operational approval.

Demonstrate in this order: public portal selection → sign in with an approved synthetic candidate account → dashboard and profile update → sign out → sign in with the approved administrator/trainer account → demonstrate only the features permitted to that role → confirm persistence after service restart → show the recorded test report. Share credentials only through the approved credential channel, not in this document.
