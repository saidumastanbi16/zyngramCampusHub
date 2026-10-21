import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db-sqlite.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const production = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';

if (production && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Helper functions
function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return { ...safe, _id: safe.id, id: String(safe.id) };
}

async function currentUser(req) {
  try {
    const payload = jwt.verify(req.cookies.campus_session, secret, { issuer: 'zyngram-campus-hub' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    return publicUser(user);
  } catch {
    return null;
  }
}

async function requireUser(req, res, next) {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

const requireRoles = (...allowed) => (req, res, next) => {
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission to do that.' });
  }
  next();
};

function toApiDocument(document) {
  const { id, ...fields } = document;
  return { ...fields, _id: id, id: String(id) };
}

function recordAudit(actorId, action, entity, entityId, details = null) {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (actor_id, action, entity, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(actorId, action, entity, entityId, details);
}

function issueSession(user, res) {
  const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '8h', issuer: 'zyngram-campus-hub' });
  res.cookie('campus_session', token, {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  });
}

const roles = ['student', 'trainer', 'coordinator', 'admin'];

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'sqlite' }));

// Demo users (development only)
app.get('/api/demo-users', async (_req, res) => {
  if (production) return res.status(404).json({ error: 'Not found.' });
  const demoUsers = db.prepare('SELECT id, name, email, role, avatar FROM users ORDER BY role').all();
  res.json(demoUsers.map(user => ({ ...publicUser(user), roleLabel: user.role[0].toUpperCase() + user.role.slice(1) })));
});

// Demo login (development only)
app.post('/api/auth/demo', async (req, res) => {
  if (production) return res.status(404).json({ error: 'Not found.' });
  const { role } = req.body;
  if (!roles.includes(role)) return res.status(400).json({ error: 'Choose a valid demo role.' });
  
  const user = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(role);
  if (!user) return res.status(404).json({ error: 'Demo user not found.' });
  
  await issueSession(user, res);
  recordAudit(user.id, 'demo.sign_in', 'session', user.id);
  res.json({ user: publicUser(user) });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Enter a valid campus email and password.' });
  }

  if (!roles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  if (!user || user.role !== role) {
    return res.status(401).json({ error: 'Email or password is incorrect for this portal.' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Email or password is incorrect for this portal.' });
  }

  issueSession(user, res);
  recordAudit(user.id, 'sign_in', 'session', user.id);
  res.json({ user: publicUser(user) });
});

// Logout
app.post('/api/auth/logout', requireUser, async (req, res) => {
  recordAudit(req.user.id, 'sign_out', 'session', req.user.id);
  res.clearCookie('campus_session', { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
  res.json({ ok: true });
});

// Get current session
app.get('/api/auth/session', async (req, res) => res.json({ user: await currentUser(req) }));

app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));

// Dashboard
app.get('/api/dashboard', requireUser, async (req, res) => {
  const user = req.user;
  
  // Get courses
  let courseFilter = '';
  const params = [];
  if (user.role === 'trainer') {
    courseFilter = 'WHERE trainer_id = ?';
    params.push(user.id);
  }
  const courses = db.prepare(`SELECT * FROM courses ${courseFilter} ORDER BY next_session`).all(...params);
  
  // Get tasks
  let taskFilter = '';
  const taskParams = [];
  if (user.role === 'student') {
    taskFilter = 'WHERE learner_id = ?';
    taskParams.push(user.id);
  } else if (user.role === 'trainer') {
    const courseIds = courses.map(c => c.id);
    if (courseIds.length > 0) {
      taskFilter = `WHERE course_id IN (${courseIds.map(() => '?').join(',')})`;
      taskParams.push(...courseIds);
    }
  }
  const tasks = db.prepare(`SELECT * FROM tasks ${taskFilter} ORDER BY due_date`).all(...taskParams);
  
  // Get attendance
  let attendanceFilter = '';
  const attendanceParams = [];
  if (user.role === 'student') {
    attendanceFilter = 'WHERE user_id = ?';
    attendanceParams.push(user.id);
  } else if (user.role === 'trainer') {
    const courseIds = courses.map(c => c.id);
    if (courseIds.length > 0) {
      attendanceFilter = `WHERE course_id IN (${courseIds.map(() => '?').join(',')})`;
      attendanceParams.push(...courseIds);
    }
  }
  const attendance = db.prepare(`SELECT * FROM attendance ${attendanceFilter} ORDER BY session_date DESC`).all(...attendanceParams);
  
  // Get announcements
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY published_at DESC LIMIT 3').all();
  
  // Get stats
  const learnerCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('student').count;
  
  let stats = {
    courses: courses.length,
    pendingTasks: tasks.filter(t => t.status !== 'complete').length,
    learners: learnerCount
  };
  
  let system = null;
  let userCounts = null;
  
  if (user.role === 'admin') {
    const trainerCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('trainer').count;
    const coordinatorCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('coordinator').count;
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin').count;
    
    userCounts = {
      students: learnerCount,
      trainers: trainerCount,
      coordinators: coordinatorCount,
      admins: adminCount
    };
    
    system = {
      environment: production ? 'Production' : 'Development prototype',
      database: 'SQLite connected',
      sessionHours: 8
    };
  }
  
  res.json({
    user,
    courses: courses.map(toApiDocument),
    tasks: tasks.map(toApiDocument),
    attendance: attendance.length ? Math.round((attendance.filter(a => a.status === 'present').length / attendance.length) * 100) : 0,
    announcements: announcements.map(toApiDocument),
    stats,
    ...(user.role === 'admin' ? { userCounts, system } : {})
  });
});

// Get courses
app.get('/api/courses', requireUser, (req, res) => {
  let filter = '';
  const params = [];
  if (req.user.role === 'trainer') {
    filter = 'WHERE trainer_id = ?';
    params.push(req.user.id);
  }
  const courses = db.prepare(`SELECT * FROM courses ${filter} ORDER BY title`).all(...params);
  res.json(courses.map(toApiDocument));
});

// Get tasks
app.get('/api/tasks', requireUser, (req, res) => {
  let filter = '';
  const params = [];
  if (req.user.role === 'student') {
    filter = 'WHERE learner_id = ?';
    params.push(req.user.id);
  }
  const tasks = db.prepare(`SELECT * FROM tasks ${filter} ORDER BY due_date`).all(...params);
  res.json(tasks.map(toApiDocument));
});

// Get attendance
app.get('/api/attendance', requireUser, (req, res) => {
  let filter = '';
  const params = [];
  if (req.user.role === 'student') {
    filter = 'WHERE user_id = ?';
    params.push(req.user.id);
  }
  const attendance = db.prepare(`SELECT * FROM attendance ${filter} ORDER BY session_date DESC`).all(...params);
  res.json(attendance.map(toApiDocument));
});

// Get announcements
app.get('/api/announcements', requireUser, (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY published_at DESC').all();
  res.json(announcements.map(toApiDocument));
});

// Create announcement (coordinator/admin only)
app.post('/api/announcements', requireUser, requireRoles('coordinator', 'admin'), (req, res) => {
  const { title, body, audience, category } = req.body;
  
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required.' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO announcements (title, body, audience, category, publisher_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title, body, audience || 'all', category || 'general', req.user.id);
  
  recordAudit(req.user.id, 'announcement.create', 'announcement', result.lastInsertRowid);
  res.status(201).json(toApiDocument({ ...req.body, id: result.lastInsertRowid, publisher_id: req.user.id, published_at: new Date().toISOString() }));
});

// Get users (admin only)
app.get('/api/users', requireUser, requireRoles('admin'), (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, cohort, avatar, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users.map(publicUser));
});

// Create user (admin only)
app.post('/api/users', requireUser, requireRoles('admin'), async (req, res) => {
  const { name, email, role, cohort, avatar } = req.body;
  
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required.' });
  }
  
  if (!roles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  
  try {
    const stmt = db.prepare(`
      INSERT INTO users (name, email, role, cohort, avatar)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email.toLowerCase(), role, cohort || null, avatar || null);
    
    recordAudit(req.user.id, 'user.create', 'user', result.lastInsertRowid);
    res.status(201).json(publicUser({ id: result.lastInsertRowid, name, email, role, cohort, avatar }));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ error: 'Email already exists.' });
    }
    throw error;
  }
});

// Get audit logs (admin only)
app.get('/api/audit', requireUser, requireRoles('admin'), (req, res) => {
  const logs = db.prepare(`
    SELECT a.*, u.name as actor_name
    FROM audit_logs a
    JOIN users u ON a.actor_id = u.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all();
  res.json(logs.map(log => ({ ...log, id: String(log.id), actor_id: String(log.actor_id) })));
});

// Support tickets
app.get('/api/support', requireUser, (req, res) => {
  let filter = '';
  const params = [];
  if (req.user.role !== 'admin') {
    filter = 'WHERE user_id = ?';
    params.push(req.user.id);
  }
  const tickets = db.prepare(`SELECT * FROM support_tickets ${filter} ORDER BY created_at DESC`).all(...params);
  res.json(tickets.map(toApiDocument));
});

app.post('/api/support', requireUser, (req, res) => {
  const { topic, message } = req.body;
  
  if (!topic || !message) {
    return res.status(400).json({ error: 'Topic and message are required.' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO support_tickets (user_id, topic, message)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(req.user.id, topic, message);
  
  recordAudit(req.user.id, 'support.create', 'support_ticket', result.lastInsertRowid);
  res.status(201).json(toApiDocument({ ...req.body, id: result.lastInsertRowid, user_id: req.user.id, status: 'open', created_at: new Date().toISOString() }));
});

app.patch('/api/support/:id', requireUser, requireRoles('admin'), (req, res) => {
  const { status } = req.body;
  
  if (!['open', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  
  const stmt = db.prepare('UPDATE support_tickets SET status = ?, updated_at = datetime("now") WHERE id = ?');
  stmt.run(status, req.params.id);
  
  recordAudit(req.user.id, 'support.update', 'support_ticket', req.params.id);
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Database: backend/database/campus.db`);
});
