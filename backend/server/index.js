import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { Binary } from 'mongodb';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { client, databasePromise } from './db.js';
import { invitationMailConfigured, sendInvitationEmail } from './mailer.js';

const app = express();
const db = await databasePromise;
const port = Number(process.env.PORT || 3001);
const production = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (production && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be set in production.');
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET is unset; using an ephemeral development-only signing key.');

const users = db.collection('users');
const courses = db.collection('courses');
const liveCourses = db.collection('live_courses');
const liveCourseEnrollments = db.collection('live_course_enrollments');
const tasks = db.collection('tasks');
const lessons = db.collection('lessons');
const lessonFiles = db.collection('lesson_files');
const lessonProgress = db.collection('lesson_progress');
const classSessions = db.collection('class_sessions');
const studentReadiness = db.collection('student_readiness');
const mockInterviews = db.collection('mock_interviews');
const attendance = db.collection('attendance');
const announcements = db.collection('announcements');
const auditLog = db.collection('audit_log');
const supportTickets = db.collection('support_tickets');
const exams = db.collection('exams');
const examAttempts = db.collection('exam_attempts');
const courseCertificates = db.collection('course_certificates');
const internships = db.collection('internships');
const internshipApplications = db.collection('internship_applications');
const learningWeeks = db.collection('learning_weeks');
const studentProgress = db.collection('student_progress');
const notifications = db.collection('notifications');
const resumeFiles = db.collection('resume_files');
const appSettings = db.collection('app_settings');
const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const lessonUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const defaultExamPassMark = 70;
const roles = ['student', 'trainer', 'coordinator', 'admin'];

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

function publicUser(user) {
  if (!user) return null;
  const { password_hash, invite_token_hash, invite_expires_at, _id, ...safe } = user;
  return { ...safe, _id, id: String(_id) };
}
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function invitationUrl(token) {
  const baseUrl = process.env.APP_BASE_URL || (production ? '' : 'http://localhost:5173');
  if (!baseUrl) throw new Error('APP_BASE_URL must be configured before issuing production invitations.');
  const parsed = new URL(baseUrl);
  if (production && parsed.protocol !== 'https:') throw new Error('APP_BASE_URL must use HTTPS in production.');
  parsed.searchParams.set('invite', token);
  return parsed.toString();
}
function toApiDocument(document) {
  const { _id, ...fields } = document;
  return { ...fields, id: String(_id) };
}
async function currentUser(req) {
  let payload;
  try {
    payload = jwt.verify(req.cookies.campus_session, secret, { issuer: 'zyngram-campus-hub' });
  } catch {
    return null;
  }
  const user = await users.findOne({ _id: payload.sub });
  return publicUser(user);
}
async function requireUser(req, res, next) {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}
const requireRoles = (...allowed) => (req, res, next) => {
  if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
  next();
};
const recordAudit = (actor, action, entity, entityId, details) => auditLog.insertOne({
  actor_id: actor, action, entity, entity_id: entityId, ...(details ? { details } : {}), created_at: new Date().toISOString()
});
async function createNotification(userId, type, title, message, entityId, dedupeKey) {
  try {
    await notifications.insertOne({
    _id: `notice-${crypto.randomUUID()}`, user_id: userId, type, title, message,
      entity_id: entityId || null, dedupe_key: dedupeKey, read_at: null, created_at: new Date().toISOString()
    });
  } catch (error) {
    if (error.code === 11000 && dedupeKey) return;
    throw error;
  }
}
export async function runUpcomingExamReminders(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcoming = await exams.find({ exam_date: { $gte: today, $lte: tomorrow }, reminder_sent_at: { $exists: false } }).toArray();
  for (const exam of upcoming) {
    const learnerIds = await tasks.distinct('learner_id', { course_id: exam.course_id });
    await Promise.all(learnerIds.map((learnerId) => createNotification(
      learnerId,
      'exam_reminder',
      'Weekly exam reminder',
      `${exam.title} is scheduled for ${exam.exam_date}. Duration: ${exam.duration_minutes || 30} minutes. Review the syllabus and instructions before starting.`,
      exam._id,
      `exam-reminder:${exam._id}`
    )));
    await exams.updateOne({ _id: exam._id, reminder_sent_at: { $exists: false } }, { $set: { reminder_sent_at: now.toISOString() } });
  }
}
async function addCourseNames(records) {
  const ids = [...new Set(records.map((record) => record.course_id).filter(Boolean))];
  const rows = await courses.find({ _id: { $in: ids } }, { projection: { title: 1 } }).toArray();
  const names = new Map(rows.map((course) => [course._id, course.title]));
  return records.map((record) => ({ ...toApiDocument(record), course_title: names.get(record.course_id) || 'Learning path' }));
}
async function listTasks(user) {
  if (user.role === 'student') {
    const records = await addCourseNames(await tasks.find({ learner_id: user._id }).sort({ due_date: 1 }).toArray());
    const reviewers = await users.find({ _id: { $in: [...new Set(records.map((task) => task.reviewed_by).filter(Boolean))] } }, { projection: { name: 1 } }).toArray();
    const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer._id, reviewer.name]));
    return records.map((task) => ({
      ...task,
      ...(task.status === 'changes_requested' ? { review_status: 'changes_requested', status: 'in_review' } : {}),
      reviewer_name: reviewerNames.get(task.reviewed_by) || null
    }));
  }
  let records;
  if (user.role === 'trainer') {
    const assigned = await courses.find({ trainer_id: user._id }, { projection: { _id: 1 } }).toArray();
    records = await tasks.find({ course_id: { $in: assigned.map((course) => course._id) } }).sort({ due_date: 1 }).toArray();
  } else {
    records = await tasks.find({}).sort({ due_date: 1 }).toArray();
  }
  const learnerIds = [...new Set(records.map((task) => task.learner_id).filter(Boolean))];
  const learners = await users.find({ _id: { $in: learnerIds } }, { projection: { name: 1 } }).toArray();
  const learnerNames = new Map(learners.map((learner) => [learner._id, learner.name]));
  return (await addCourseNames(records)).map((task) => ({
    ...task,
    ...(task.status === 'changes_requested' ? { review_status: 'changes_requested', status: 'in_review' } : {}),
    learner_name: learnerNames.get(task.learner_id) || 'Student'
  }));
}
async function refreshStudentProgress(learnerId, courseId, updatedAt = new Date().toISOString()) {
  const courseExams = await exams.find({ course_id: courseId, status: 'published' }).sort({ week_number: 1 }).toArray();
  const passedAttempts = await examAttempts.find({ learner_id: learnerId, exam_id: { $in: courseExams.map((exam) => exam._id) }, passed: true }, { projection: { exam_id: 1 } }).toArray();
  const passed = new Set(passedAttempts.map((attempt) => attempt.exam_id));
  const completedWeeks = courseExams.filter((exam) => passed.has(exam._id)).map((exam) => exam.week_number);
  const currentWeek = courseExams.find((exam) => !passed.has(exam._id))?.week_number || (courseExams.at(-1)?.week_number || 0) + 1;
  const existing = await studentProgress.findOne({ learner_id: learnerId, course_id: courseId });
  await studentProgress.updateOne({ learner_id: learnerId, course_id: courseId }, {
    $set: {
      current_week: Math.min(currentWeek, existing?.unlocked_week || currentWeek),
      unlocked_week: Math.max(currentWeek, existing?.unlocked_week || 1),
      completed_weeks: completedWeeks, updated_at: updatedAt
    },
    $setOnInsert: { _id: `progress-${crypto.randomUUID()}`, created_at: updatedAt }
  }, { upsert: true });
}
async function issueCourseCertificate(learnerId, courseId) {
  const [course, requiredExams, requiredLessons] = await Promise.all([
    courses.findOne({ _id: courseId }),
    exams.find({ course_id: courseId, status: 'published' }, { projection: { _id: 1 } }).toArray(),
    lessons.find({ course_id: courseId, status: 'published' }, { projection: { _id: 1 } }).toArray()
  ]);
  if (!course || !requiredExams.length || !requiredLessons.length) return null;
  const [passedAttempts, completedLessons, learner] = await Promise.all([
    examAttempts.find({ learner_id: learnerId, exam_id: { $in: requiredExams.map((exam) => exam._id) }, passed: true }, { projection: { exam_id: 1, attempted_at: 1 } }).toArray(),
    lessonProgress.find({ learner_id: learnerId, lesson_id: { $in: requiredLessons.map((lesson) => lesson._id) } }, { projection: { lesson_id: 1, completed_at: 1 } }).toArray(),
    users.findOne({ _id: learnerId }, { projection: { name: 1 } })
  ]);
  const passedExamIds = new Set(passedAttempts.map((attempt) => attempt.exam_id));
  const completedLessonIds = new Set(completedLessons.map((lesson) => lesson.lesson_id));
  if (!requiredExams.every((exam) => passedExamIds.has(exam._id)) || !requiredLessons.every((lesson) => completedLessonIds.has(lesson._id))) return null;
  const completionDates = [...passedAttempts.map((attempt) => attempt.attempted_at), ...completedLessons.map((lesson) => lesson.completed_at)].sort();
  const certificate = {
    _id: `cert-${learnerId}-${courseId}`, learner_id: learnerId, learner_name: learner?.name || 'Learner',
    course_id: courseId, course_title: course.title, issued_at: completionDates.at(-1) || new Date().toISOString()
  };
  try {
    await courseCertificates.updateOne({ learner_id: learnerId, course_id: courseId }, { $setOnInsert: certificate }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return courseCertificates.findOne({ learner_id: learnerId, course_id: courseId });
}
async function issueSession(user, res) {
  const token = jwt.sign({ sub: user._id }, secret, { expiresIn: '8h', issuer: 'zyngram-campus-hub' });
  res.cookie('campus_session', token, {
    httpOnly: true, secure: production, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/'
  });
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'mongodb' }));
app.get('/api/demo-users', async (_req, res) => {
  if (production) return res.status(404).json({ error: 'Not found.' });
  const demoUsers = await users.find({}, { projection: { password_hash: 0 } }).sort({ role: 1 }).toArray();
  res.json(demoUsers.map((user) => ({ ...publicUser(user), roleLabel: user.role[0].toUpperCase() + user.role.slice(1) })));
});
app.post('/api/auth/demo', async (req, res) => {
  if (production) return res.status(404).json({ error: 'Not found.' });
  const parsed = z.object({ role: z.enum(roles) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid demo role.' });
  const user = await users.findOne({ role: parsed.data.role });
  if (!user) return res.status(404).json({ error: 'Demo user not found.' });
  await issueSession(user, res);
  await recordAudit(user._id, 'demo.sign_in', 'session', user._id);
  res.json({ user: publicUser(user) });
});
app.post('/api/auth/login', async (req, res) => {
  const parsed = z.object({
    role: z.enum(roles),
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(200)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid campus email and password.' });
  const user = await users.findOne({ email: parsed.data.email.toLowerCase() });
  const encoded = user?.password_hash || '';
  const [algorithm, salt, hash] = encoded.split('$');
  let passwordMatches = false;
  if (algorithm === 'scrypt' && salt && hash) {
    const actual = crypto.scryptSync(parsed.data.password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    passwordMatches = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  if (!user || user.role !== parsed.data.role || !passwordMatches) {
    return res.status(401).json({ error: 'Email or password is incorrect for this portal.' });
  }
  await issueSession(user, res);
  await recordAudit(user._id, 'sign_in', 'session', user._id);
  res.json({ user: publicUser(user) });
});
app.post('/api/auth/accept-invite', async (req, res) => {
  const parsed = z.object({
    token: z.string().min(32).max(200),
    password: z.string().min(12).max(200)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Use your valid invitation and a password between 12 and 200 characters.' });

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const now = new Date();
  const pendingUser = await users.findOne({
    invite_token_hash: tokenHash,
    invite_expires_at: { $gt: now },
    password_hash: null
  });
  if (!pendingUser) return res.status(400).json({ error: 'This invitation is invalid, expired, or already used. Ask your administrator for a new link.' });

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = `scrypt$${salt}$${crypto.scryptSync(parsed.data.password, salt, 64).toString('hex')}`;
  const result = await users.updateOne({
    _id: pendingUser._id,
    invite_token_hash: tokenHash,
    invite_expires_at: { $gt: now },
    password_hash: null
  }, {
    $set: { password_hash: passwordHash, credential_set_at: now.toISOString() },
    $unset: { invite_token_hash: '', invite_expires_at: '' }
  });
  if (!result.modifiedCount) return res.status(400).json({ error: 'This invitation is invalid, expired, or already used. Ask your administrator for a new link.' });
  await recordAudit(pendingUser._id, 'user.accept_invitation', 'user', pendingUser._id);
  res.clearCookie('campus_session', { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
  res.json({ ok: true });
});
app.post('/api/auth/logout', requireUser, async (req, res) => {
  await recordAudit(req.user._id, 'sign_out', 'session', req.user._id);
  res.clearCookie('campus_session', { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
  res.json({ ok: true });
});
app.get('/api/auth/session', async (req, res) => res.json({ user: await currentUser(req) }));
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));
app.get('/api/dashboard', requireUser, async (req, res) => {
  const user = req.user;
  const courseFilter = user.role === 'trainer' ? { trainer_id: user._id } : {};
  const courseRows = await courses.find(courseFilter).sort({ next_session: 1 }).toArray();
  const trainerIds = [...new Set(courseRows.map((course) => course.trainer_id).filter(Boolean))];
  const trainers = await users.find({ _id: { $in: trainerIds } }, { projection: { name: 1 } }).toArray();
  const trainerNames = new Map(trainers.map((trainer) => [trainer._id, trainer.name]));
  const courseList = courseRows.map((course) => ({ ...toApiDocument(course), trainer_name: trainerNames.get(course.trainer_id) || 'Campus trainer' }));
  const courseIds = courseRows.map((course) => course._id);
  const attendanceFilter = user.role === 'student' ? { user_id: user._id }
    : user.role === 'trainer' ? { course_id: { $in: courseIds } } : {};
  const attended = await attendance.find(attendanceFilter).toArray();
  const taskList = await listTasks(user);
  const notices = await announcements.find({}).sort({ published_at: -1 }).limit(3).toArray();
  const learnerCount = await users.countDocuments({ role: 'student' });
  const visibleLearnerCount = user.role === 'trainer'
    ? new Set([...taskList.map((task) => task.learner_id), ...attended.map((record) => record.user_id)]).size
    : learnerCount;
  let trainerStats = {};
  if (user.role === 'trainer') {
    const examIds = await exams.distinct('_id', { course_id: { $in: courseIds }, status: 'published' });
    const attempts = await examAttempts.find({ exam_id: { $in: examIds } }).sort({ attempted_at: -1 }).toArray();
    const latestByLearnerExam = new Map();
    for (const attempt of attempts) {
      const key = `${attempt.learner_id}:${attempt.exam_id}`;
      if (!latestByLearnerExam.has(key)) latestByLearnerExam.set(key, attempt);
    }
    const supportLearners = new Set([
      ...attended.filter((record) => record.status === 'absent').map((record) => record.user_id),
      ...[...latestByLearnerExam.values()].filter((attempt) => attempt.passed === false).map((attempt) => attempt.learner_id)
    ]);
    trainerStats = {
      pendingEvaluations: taskList.filter((task) => task.status === 'in_review').length,
      upcomingClasses: await classSessions.countDocuments({ course_id: { $in: courseIds }, starts_at: { $gte: new Date().toISOString() } }),
      studentsNeedingSupport: supportLearners.size
    };
  }
  const [trainerCount, coordinatorCount, adminCount] = user.role === 'admin'
    ? await Promise.all([
      users.countDocuments({ role: 'trainer' }),
      users.countDocuments({ role: 'coordinator' }),
      users.countDocuments({ role: 'admin' })
    ])
    : [undefined, undefined, undefined];
  res.json({
    user,
    courses: courseList,
    attendance: attended.length ? Math.round((attended.filter((record) => record.status === 'present').length / attended.length) * 100) : 0,
    tasks: taskList,
    announcements: notices.map(toApiDocument),
    stats: {
      courses: courseList.length,
      pendingTasks: taskList.filter((task) => task.status !== 'complete').length,
      learners: visibleLearnerCount,
      ...(user.role === 'trainer' ? trainerStats : {}),
      ...(user.role === 'admin' ? { userCounts: { students: learnerCount, trainers: trainerCount, coordinators: coordinatorCount, admins: adminCount } } : {})
    },
    ...(user.role === 'admin' ? {
      system: {
        environment: production ? 'Production' : 'Development prototype',
        database: 'MongoDB connected',
        sessionHours: 8
      }
    } : {})
  });
});
app.get('/api/courses', requireUser, async (req, res) => {
  const filter = req.user.role === 'trainer' ? { trainer_id: req.user._id } : {};
  const list = await courses.find(filter).sort({ title: 1 }).toArray();
  const trainers = await users.find({ _id: { $in: list.map((course) => course.trainer_id).filter(Boolean) } }, { projection: { name: 1 } }).toArray();
  const names = new Map(trainers.map((trainer) => [trainer._id, trainer.name]));
  res.json(list.map((course) => ({ ...toApiDocument(course), trainer_name: names.get(course.trainer_id) || 'Campus trainer' })));
});
app.get('/api/live-courses', requireUser, async (req, res) => {
  const filter = req.user.role === 'student'
    ? { status: 'published' }
    : req.user.role === 'trainer' ? { trainer_id: req.user._id } : {};
  const rows = await liveCourses.find(filter).sort({ starts_at: 1 }).toArray();
  const registrations = req.user.role === 'student'
    ? await liveCourseEnrollments.find({ learner_id: req.user._id, live_course_id: { $in: rows.map((course) => course._id) } }, { projection: { live_course_id: 1 } }).toArray()
    : [];
  const enrolledIds = new Set(registrations.map((registration) => registration.live_course_id));
  const trainers = await users.find({ _id: { $in: [...new Set(rows.map((course) => course.trainer_id))] } }, { projection: { name: 1 } }).toArray();
  const trainerNames = new Map(trainers.map((trainer) => [trainer._id, trainer.name]));
  const now = Date.now();
  res.json(rows.map((course) => {
    const enrolled = enrolledIds.has(course._id);
    const liveNow = new Date(course.starts_at).getTime() <= now && new Date(course.ends_at).getTime() > now;
    const canJoin = Boolean(course.meeting_url && liveNow && (req.user.role !== 'student' || enrolled));
    const ended = new Date(course.ends_at).getTime() <= now;
    const canWatchRecording = Boolean(course.recording_url && ended && (req.user.role !== 'student' || enrolled));
    const { meeting_url, recording_url, ...publicCourse } = toApiDocument(course);
    return {
      ...publicCourse, trainer_name: trainerNames.get(course.trainer_id) || 'Campus trainer',
      is_enrolled: enrolled, is_live: liveNow, can_join: canJoin,
      ...((canJoin || req.user.role !== 'student') && meeting_url ? { meeting_url } : {}),
      ...(canWatchRecording ? { recording_url, recording_available: true } : {})
    };
  }));
});
app.post('/api/live-courses', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(4).max(120), category: z.string().trim().min(2).max(50),
    description: z.string().trim().min(20).max(1000), level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    duration: z.string().trim().min(2).max(40), startsAt: z.string().datetime(), endsAt: z.string().datetime(),
    capacity: z.number().int().min(1).max(500), meetingUrl: z.string().url().max(1000).optional()
  }).safeParse(req.body);
  if (!parsed.success || new Date(parsed.data?.endsAt || 0) <= new Date(parsed.data?.startsAt || 0) || (parsed.data.meetingUrl && !parsed.data.meetingUrl.startsWith('https://'))) {
    return res.status(400).json({ error: 'Provide valid live course details, a future session window, seat limit, and HTTPS meeting link.' });
  }
  const now = new Date().toISOString();
  const offering = {
    _id: `live-course-${crypto.randomUUID()}`, title: parsed.data.title, category: parsed.data.category,
    description: parsed.data.description, level: parsed.data.level, duration: parsed.data.duration,
    starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, capacity: parsed.data.capacity,
    enrolled_count: 0, trainer_id: req.user._id, status: 'published',
    ...(parsed.data.meetingUrl ? { meeting_url: parsed.data.meetingUrl } : {}), created_at: now, updated_at: now
  };
  await liveCourses.insertOne(offering);
  await recordAudit(req.user._id, 'live_course.publish', 'live_course', offering._id);
  res.status(201).json({ ...toApiDocument(offering), trainer_name: req.user.name, is_enrolled: false, is_live: false, can_join: false });
});
app.post('/api/live-courses/:id/enroll', requireUser, requireRoles('student'), async (req, res) => {
  const now = new Date().toISOString();
  if (await liveCourseEnrollments.findOne({ live_course_id: req.params.id, learner_id: req.user._id })) {
    return res.status(409).json({ error: 'You are already registered for this live course.' });
  }
  const reserved = await liveCourses.updateOne({
    _id: req.params.id, status: 'published', ends_at: { $gt: now },
    $expr: { $lt: [{ $ifNull: ['$enrolled_count', 0] }, '$capacity'] }
  }, { $inc: { enrolled_count: 1 }, $set: { updated_at: now } });
  if (!reserved.modifiedCount) return res.status(409).json({ error: 'Registration is closed or all seats are filled.' });
  const registration = { _id: `live-enrollment-${crypto.randomUUID()}`, live_course_id: req.params.id, learner_id: req.user._id, enrolled_at: now };
  try {
    await liveCourseEnrollments.insertOne(registration);
  } catch (error) {
    await liveCourses.updateOne({ _id: req.params.id }, { $inc: { enrolled_count: -1 } });
    if (error.code === 11000) return res.status(409).json({ error: 'You are already registered for this live course.' });
    throw error;
  }
  const offering = await liveCourses.findOne({ _id: req.params.id });
  await createNotification(offering.trainer_id, 'live_course_enrollment', 'New live-course registration', `${req.user.name} registered for ${offering.title}.`, offering._id);
  await recordAudit(req.user._id, 'live_course.enroll', 'live_course', offering._id);
  res.status(201).json({ ok: true, enrolled_at: now });
});
app.patch('/api/live-courses/:id/recording', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({ recordingUrl: z.string().url().max(1000) }).safeParse(req.body);
  if (!parsed.success || !parsed.data.recordingUrl.startsWith('https://')) return res.status(400).json({ error: 'Provide a valid HTTPS recording link.' });
  const offering = await liveCourses.findOne({ _id: req.params.id, trainer_id: req.user._id });
  if (!offering) return res.status(404).json({ error: 'Live course not found in your hosted sessions.' });
  if (new Date(offering.ends_at).getTime() > Date.now()) return res.status(409).json({ error: 'The class recording can be published after the live session ends.' });
  const updatedAt = new Date().toISOString();
  await liveCourses.updateOne({ _id: offering._id }, { $set: { recording_url: parsed.data.recordingUrl, recording_published_at: updatedAt, updated_at: updatedAt } });
  await recordAudit(req.user._id, 'live_course.recording.publish', 'live_course', offering._id);
  res.json({ ok: true, recording_published_at: updatedAt });
});
app.get('/api/lessons', requireUser, async (req, res) => {
  const courseIds = req.user.role === 'student'
    ? await tasks.distinct('course_id', { learner_id: req.user._id })
    : (await courses.find(req.user.role === 'trainer' ? { trainer_id: req.user._id } : {}, { projection: { _id: 1 } }).toArray()).map((course) => course._id);
  const progressRows = req.user.role === 'student'
    ? await studentProgress.find({ learner_id: req.user._id, course_id: { $in: courseIds } }).toArray()
    : [];
  const unlockedWeeks = new Map(progressRows.map((progress) => [progress.course_id, progress.unlocked_week || 1]));
  const filter = { course_id: { $in: courseIds }, ...(req.user.role === 'student' ? { status: 'published' } : {}) };
  if (req.query.courseId && courseIds.includes(req.query.courseId)) filter.course_id = req.query.courseId;
  if (req.query.week) filter.week_number = Number(req.query.week);
  const lessonRows = await lessons.find(filter).sort({ course_id: 1, week_number: 1, position: 1 }).toArray();
  const rows = req.user.role === 'student'
    ? lessonRows.filter((lesson) => lesson.week_number <= (unlockedWeeks.get(lesson.course_id) || 1))
    : lessonRows;
  const completions = req.user.role === 'student'
    ? await lessonProgress.find({ learner_id: req.user._id, lesson_id: { $in: rows.map((lesson) => lesson._id) } }).toArray()
    : [];
  const completed = new Set(completions.map((item) => item.lesson_id));
  res.json(rows.map((lesson) => ({ ...toApiDocument(lesson), completed: completed.has(lesson._id) })));
});
app.post('/api/lessons', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({
    courseId: z.string().min(1), title: z.string().trim().min(3).max(120), description: z.string().trim().max(1500).default(''),
    weekNumber: z.number().int().min(1).max(52), position: z.number().int().min(1).max(100).default(1),
    resources: z.array(z.object({ type: z.enum(['video', 'pdf', 'note', 'link']), title: z.string().trim().min(1).max(100), url: z.string().url().max(1000) })).max(20).default([])
  }).safeParse(req.body);
  if (!parsed.success || parsed.data.resources.some((resource) => !resource.url.startsWith('https://'))) return res.status(400).json({ error: 'Provide lesson details and secure HTTPS resource links.' });
  const course = await courses.findOne({ _id: parsed.data.courseId, trainer_id: req.user._id });
  if (!course) return res.status(404).json({ error: 'Course not found in your assigned courses.' });
  const lesson = { _id: `lesson-${crypto.randomUUID()}`, course_id: course._id, title: parsed.data.title, description: parsed.data.description,
    week_number: parsed.data.weekNumber, position: parsed.data.position, resources: parsed.data.resources, status: 'published', created_by: req.user._id, created_at: new Date().toISOString() };
  await lessons.insertOne(lesson);
  const learnerIds = await tasks.distinct('learner_id', { course_id: course._id });
  await Promise.all(learnerIds.map((learnerId) => createNotification(learnerId, 'lesson', 'New course lesson', `${lesson.title} is available in Week ${lesson.week_number}.`, lesson._id)));
  await recordAudit(req.user._id, 'lesson.create', 'lesson', lesson._id);
  res.status(201).json({ ...toApiDocument(lesson), course_title: course.title, completed: false });
});
app.patch('/api/lessons/:id', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(3).max(120).optional(), description: z.string().trim().max(1500).optional(), resources: z.array(z.object({ type: z.enum(['video', 'pdf', 'note', 'link']), title: z.string().trim().min(1).max(100), url: z.string().max(1000).refine((value) => value.startsWith('https://') || value.startsWith('/api/lessons/')) })).max(20).optional() }).safeParse(req.body);
  if (!parsed.success || parsed.data.resources?.some((resource) => !resource.url.startsWith('https://') && !resource.url.startsWith('/api/lessons/'))) return res.status(400).json({ error: 'Provide valid lesson details and secure resource links.' });
  const lesson = await lessons.findOne({ _id: req.params.id });
  if (!lesson || !await courses.findOne({ _id: lesson.course_id, trainer_id: req.user._id })) return res.status(404).json({ error: 'Lesson not found in your assigned courses.' });
  await lessons.updateOne({ _id: lesson._id }, { $set: { ...parsed.data, updated_at: new Date().toISOString() } });
  await recordAudit(req.user._id, 'lesson.update', 'lesson', lesson._id);
  res.json({ ok: true });
});
app.post('/api/lessons/:id/upload', requireUser, requireRoles('trainer'), lessonUpload.single('file'), async (req, res) => {
  const lesson = await lessons.findOne({ _id: req.params.id });
  if (!lesson || !await courses.findOne({ _id: lesson.course_id, trainer_id: req.user._id })) return res.status(404).json({ error: 'Lesson not found in your assigned courses.' });
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF, video, or text note up to 15 MB.' });
  const allowed = ['application/pdf', 'video/mp4', 'video/webm', 'text/plain'];
  if (!allowed.includes(req.file.mimetype) || (req.file.mimetype === 'application/pdf' && req.file.buffer.subarray(0, 5).toString() !== '%PDF-')) {
    return res.status(400).json({ error: 'Supported lesson files are valid PDFs, MP4/WebM videos, or plain text notes.' });
  }
  const type = req.file.mimetype === 'application/pdf' ? 'pdf' : req.file.mimetype.startsWith('video/') ? 'video' : 'note';
  const file = { _id: `lesson-file-${crypto.randomUUID()}`, lesson_id: lesson._id, filename: req.file.originalname.slice(0, 120),
    content_type: req.file.mimetype, data: new Binary(req.file.buffer), size: req.file.size, created_at: new Date().toISOString() };
  await lessonFiles.insertOne(file);
  const resource = { type, title: file.filename, url: `/api/lessons/${lesson._id}/resources/${file._id}` };
  await lessons.updateOne({ _id: lesson._id }, { $push: { resources: resource }, $set: { updated_at: file.created_at } });
  await recordAudit(req.user._id, 'lesson.resource.upload', 'lesson', lesson._id, { type, size: file.size });
  res.status(201).json(resource);
});
app.get('/api/lessons/:id/resources/:fileId', requireUser, async (req, res) => {
  const lesson = await lessons.findOne({ _id: req.params.id, status: 'published' });
  if (!lesson) return res.status(404).json({ error: 'Lesson resource not found.' });
  const course = await courses.findOne({ _id: lesson.course_id });
  if (req.user.role === 'student') {
    const [task, progress] = await Promise.all([
      tasks.findOne({ learner_id: req.user._id, course_id: lesson.course_id }),
      studentProgress.findOne({ learner_id: req.user._id, course_id: lesson.course_id })
    ]);
    if (!task || lesson.week_number > (progress?.unlocked_week || 1)) return res.status(404).json({ error: 'Lesson resource not found.' });
  }
  if (req.user.role === 'trainer' && course?.trainer_id !== req.user._id) return res.status(404).json({ error: 'Lesson resource not found in your assigned courses.' });
  const file = await lessonFiles.findOne({ _id: req.params.fileId, lesson_id: lesson._id });
  if (!file) return res.status(404).json({ error: 'Lesson file not found.' });
  res.setHeader('Content-Type', file.content_type);
  res.setHeader('Content-Disposition', `inline; filename="${file.filename.replaceAll('"', '')}"`);
  res.send(file.data.value());
});
app.post('/api/lessons/:id/complete', requireUser, requireRoles('student'), async (req, res) => {
  const lesson = await lessons.findOne({ _id: req.params.id, status: 'published' });
  if (!lesson || !await tasks.findOne({ learner_id: req.user._id, course_id: lesson.course_id })) return res.status(404).json({ error: 'Lesson not found in your learning paths.' });
  const progress = await studentProgress.findOne({ learner_id: req.user._id, course_id: lesson.course_id });
  if (lesson.week_number > (progress?.unlocked_week || 1)) return res.status(423).json({ error: 'Pass the earlier exam or ask your trainer for an authorized unlock.' });
  const completedAt = new Date().toISOString();
  await lessonProgress.updateOne({ learner_id: req.user._id, lesson_id: lesson._id }, {
    $set: { course_id: lesson.course_id, completed_at: completedAt },
    $setOnInsert: { _id: `lesson-progress-${crypto.randomUUID()}`, created_at: completedAt }
  }, { upsert: true });
  await issueCourseCertificate(req.user._id, lesson.course_id);
  await recordAudit(req.user._id, 'lesson.complete', 'lesson', lesson._id);
  res.json({ ok: true, completed_at: completedAt });
});
app.post('/api/tasks', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({ courseId: z.string().min(1), learnerId: z.string().min(1), title: z.string().trim().min(3).max(120), description: z.string().trim().min(5).max(1500), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.body);
  if (!parsed.success || !isCalendarDate(parsed.data?.dueDate || '')) return res.status(400).json({ error: 'Enter a valid course task, student, and due date.' });
  const course = await courses.findOne({ _id: parsed.data.courseId, trainer_id: req.user._id });
  const learner = await users.findOne({ _id: parsed.data.learnerId, role: 'student' });
  if (!course || !learner || !await tasks.findOne({ course_id: course._id, learner_id: learner._id })) return res.status(404).json({ error: 'Student or course is not in your assigned scope.' });
  const task = { _id: `task-${crypto.randomUUID()}`, learner_id: learner._id, course_id: course._id, title: parsed.data.title,
    description: parsed.data.description, due_date: parsed.data.dueDate, status: 'todo', created_by: req.user._id, created_at: new Date().toISOString() };
  await tasks.insertOne(task);
  await createNotification(learner._id, 'assignment', 'New practice task', `${task.title} is due ${task.due_date}.`, task._id);
  await recordAudit(req.user._id, 'task.assign', 'task', task._id);
  res.status(201).json({ ...toApiDocument(task), course_title: course.title });
});
app.get('/api/class-sessions', requireUser, async (req, res) => {
  const courseIds = req.user.role === 'student'
    ? await tasks.distinct('course_id', { learner_id: req.user._id })
    : (await courses.find(req.user.role === 'trainer' ? { trainer_id: req.user._id } : {}, { projection: { _id: 1 } }).toArray()).map((course) => course._id);
  const rows = await classSessions.find({ course_id: { $in: courseIds } }).sort({ starts_at: 1 }).toArray();
  const courseNames = new Map((await courses.find({ _id: { $in: courseIds } }, { projection: { title: 1 } }).toArray()).map((course) => [course._id, course.title]));
  res.json(rows.map((session) => ({ ...toApiDocument(session), course_title: courseNames.get(session.course_id) || 'Course' })));
});
app.post('/api/class-sessions', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({ courseId: z.string().min(1), topic: z.string().trim().min(3).max(160), startsAt: z.string().datetime(), endsAt: z.string().datetime(), meetingUrl: z.string().url().max(1000), makeUp: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success || !parsed.data.meetingUrl.startsWith('https://') || new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) return res.status(400).json({ error: 'Provide a valid class topic, time range, and secure meeting link.' });
  const course = await courses.findOne({ _id: parsed.data.courseId, ...(req.user.role === 'trainer' ? { trainer_id: req.user._id } : {}) });
  if (!course) return res.status(404).json({ error: 'Course not found in your authorized scope.' });
  const session = { _id: `session-${crypto.randomUUID()}`, course_id: course._id, topic: parsed.data.topic, starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt, meeting_url: parsed.data.meetingUrl, make_up: parsed.data.makeUp, created_by: req.user._id, created_at: new Date().toISOString() };
  await classSessions.insertOne(session);
  const learnerIds = await tasks.distinct('learner_id', { course_id: course._id });
  await Promise.all(learnerIds.map((learnerId) => createNotification(learnerId, 'class', 'Class scheduled', `${session.topic} starts ${session.starts_at}.`, session._id)));
  await recordAudit(req.user._id, 'class_session.create', 'class_session', session._id);
  res.status(201).json({ ...toApiDocument(session), course_title: course.title });
});
app.get('/api/attendance', requireUser, async (req, res) => {
  let records;
  if (req.user.role === 'student') {
    records = await attendance.find({ user_id: req.user._id }).sort({ session_date: -1 }).toArray();
  } else if (req.user.role === 'trainer') {
    const assigned = await courses.find({ trainer_id: req.user._id }, { projection: { _id: 1 } }).toArray();
    records = await attendance.find({ course_id: { $in: assigned.map((course) => course._id) } }).sort({ session_date: -1 }).toArray();
  } else {
    records = await attendance.find({}).sort({ session_date: -1 }).toArray();
  }
  const withCourses = await addCourseNames(records);
  if (req.user.role === 'student') return res.json(withCourses);
  const learnerIds = [...new Set(records.map((record) => record.user_id))];
  const learners = await users.find({ _id: { $in: learnerIds } }, { projection: { name: 1 } }).toArray();
  const names = new Map(learners.map((learner) => [learner._id, learner.name]));
  res.json(withCourses.map((record) => ({ ...record, learner_name: names.get(record.user_id) || 'Learner' })));
});
app.get('/api/attendance/roster', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({
    courseId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).safeParse(req.query);
  if (!parsed.success || !isCalendarDate(parsed.data?.date || '')) {
    return res.status(400).json({ error: 'Choose a course and valid session date.' });
  }
  const course = await courses.findOne({ _id: parsed.data.courseId });
  if (!course || (req.user.role === 'trainer' && course.trainer_id !== req.user._id)) {
    return res.status(404).json({ error: 'Course not found in your authorized scope.' });
  }
  const taskLearners = await tasks.distinct('learner_id', { course_id: course._id });
  const learners = await users.find({ _id: { $in: taskLearners }, role: 'student' }, {
    projection: { name: 1, avatar: 1, cohort: 1 }
  }).sort({ name: 1 }).toArray();
  const existing = await attendance.find({
    course_id: course._id,
    session_date: parsed.data.date,
    user_id: { $in: learners.map((learner) => learner._id) }
  }).toArray();
  const attendanceByLearner = new Map(existing.map((record) => [record.user_id, record.status]));
  res.json({
    course: { id: course._id, title: course.title },
    date: parsed.data.date,
    learners: learners.map((learner) => ({
      id: learner._id,
      name: learner.name,
      avatar: learner.avatar,
      cohort: learner.cohort,
      status: attendanceByLearner.get(learner._id) || 'unmarked'
    }))
  });
});
app.post('/api/attendance', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({
    courseId: z.string().min(1),
    sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    records: z.array(z.object({
      userId: z.string().min(1),
      status: z.enum(['present', 'late', 'absent'])
    })).min(1).max(500)
  }).safeParse(req.body);
  if (!parsed.success || !isCalendarDate(parsed.data?.sessionDate || '')) {
    return res.status(400).json({ error: 'Choose a valid course, session date, and attendance status for at least one learner.' });
  }
  const learnerIds = parsed.data.records.map((record) => record.userId);
  if (new Set(learnerIds).size !== learnerIds.length) {
    return res.status(400).json({ error: 'Each learner can appear only once in an attendance submission.' });
  }
  const course = await courses.findOne({ _id: parsed.data.courseId });
  if (!course || (req.user.role === 'trainer' && course.trainer_id !== req.user._id)) {
    return res.status(404).json({ error: 'Course not found in your authorized scope.' });
  }
  const taskLearners = await tasks.distinct('learner_id', { course_id: course._id });
  if (learnerIds.some((id) => !taskLearners.includes(id))) {
    return res.status(400).json({ error: 'Attendance can only be recorded for learners on this course roster.' });
  }
  const now = new Date().toISOString();
  await attendance.bulkWrite(parsed.data.records.map(({ userId, status }) => ({
    updateOne: {
      filter: { user_id: userId, course_id: course._id, session_date: parsed.data.sessionDate },
      update: { $set: { status, recorded_by: req.user._id, updated_at: now }, $setOnInsert: { _id: `att-${crypto.randomUUID()}` } },
      upsert: true
    }
  })));
  await recordAudit(req.user._id, 'attendance.record', 'course', course._id);
  res.json({ ok: true, recorded: parsed.data.records.length });
});
app.get('/api/progress', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const courseFilter = req.user.role === 'trainer' ? { trainer_id: req.user._id } : {};
  const assignedCourses = await courses.find(courseFilter, { projection: { _id: 1 } }).toArray();
  const courseIds = assignedCourses.map((course) => course._id);
  const [taskRecords, attendanceRecords] = await Promise.all([
    tasks.find({ course_id: { $in: courseIds } }).toArray(),
    attendance.find({ course_id: { $in: courseIds } }).toArray()
  ]);
  const examRows = await exams.find({ course_id: { $in: courseIds }, status: 'published' }).toArray();
  const examById = new Map(examRows.map((exam) => [exam._id, exam]));
  const attemptRecords = await examAttempts.find({ exam_id: { $in: examRows.map((exam) => exam._id) } }).sort({ attempted_at: -1 }).toArray();
  const learnerIds = [...new Set([
    ...taskRecords.map((task) => task.learner_id),
    ...attendanceRecords.map((record) => record.user_id),
    ...attemptRecords.map((attempt) => attempt.learner_id)
  ])];
  const learners = await users.find(
    { _id: { $in: learnerIds }, role: 'student' },
    { projection: { name: 1, cohort: 1, avatar: 1 } }
  ).sort({ name: 1 }).toArray();
  const learnerReports = learners.map((learner) => {
    const learnerTasks = taskRecords.filter((task) => task.learner_id === learner._id);
    const learnerAttendance = attendanceRecords.filter((record) => record.user_id === learner._id);
    const learnerAttempts = attemptRecords.filter((attempt) => attempt.learner_id === learner._id);
    const completedTasks = learnerTasks.filter((task) => task.status === 'complete').length;
    const presentRecords = learnerAttendance.filter((record) => record.status === 'present').length;
    const weakTopics = new Set();
    for (const attempt of learnerAttempts.filter((item) => item.passed === false)) {
      const exam = examById.get(attempt.exam_id);
      exam?.questions?.forEach((question, index) => {
        if (question.topic) weakTopics.add(question.topic);
        else if (exam.questions.length) weakTopics.add(`${exam.title} · Question ${index + 1}`);
      });
    }
    const gradedAttempts = learnerAttempts.filter((attempt) => attempt.score !== null && attempt.score !== undefined);
    return {
      id: String(learner._id),
      name: learner.name,
      cohort: learner.cohort,
      avatar: learner.avatar,
      course_ids: [...new Set(learnerTasks.map((task) => task.course_id))],
      task_count: learnerTasks.length,
      completed_tasks: completedTasks,
      pending_tasks: learnerTasks.filter((task) => task.status !== 'complete').length,
      task_progress: learnerTasks.length ? Math.round((completedTasks / learnerTasks.length) * 100) : 0,
      attendance_records: learnerAttendance.length,
      present_records: presentRecords,
      absent_records: learnerAttendance.filter((record) => record.status === 'absent').length,
      attendance_rate: learnerAttendance.length ? Math.round((presentRecords / learnerAttendance.length) * 100) : 0,
      exam_attempt_count: learnerAttempts.length,
      exam_passed_count: learnerAttempts.filter((attempt) => attempt.passed === true).length,
      average_exam_score: gradedAttempts.length ? Math.round(gradedAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / gradedAttempts.length) : null,
      exam_results: learnerAttempts.map((attempt) => ({ exam_title: examById.get(attempt.exam_id)?.title || 'Weekly exam', week_number: examById.get(attempt.exam_id)?.week_number, score: attempt.score, marks: attempt.marks, total_marks: attempt.total_marks, passed: attempt.passed, grading_status: attempt.grading_status, attempt_number: attempt.attempt_number, attempted_at: attempt.attempted_at })),
      weak_topics: [...weakTopics]
    };
  });
  const taskCount = taskRecords.length;
  const completedTasks = taskRecords.filter((task) => task.status === 'complete').length;
  const presentRecords = attendanceRecords.filter((record) => record.status === 'present').length;
  const examPassed = attemptRecords.filter((attempt) => attempt.passed === true).length;
  const needingSupport = learnerReports.filter((learner) => learner.weak_topics.length || learner.absent_records > 0 || learner.attendance_rate < 75).length;
  res.json({
    learners: learnerReports,
    summary: {
      learner_count: learnerReports.length,
      task_count: taskCount,
      completed_tasks: completedTasks,
      attendance_records: attendanceRecords.length,
      present_records: presentRecords,
      attendance_rate: attendanceRecords.length ? Math.round((presentRecords / attendanceRecords.length) * 100) : 0,
      exam_attempts: attemptRecords.length,
      exams_passed: examPassed,
      students_needing_support: needingSupport
    }
  });
});
app.get('/api/tasks', requireUser, async (req, res) => res.json(await listTasks(req.user)));
app.post('/api/tasks/:id/submit', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({ submissionUrl: z.string().trim().url().max(500), note: z.string().trim().max(1000).optional().default('') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid HTTPS project link (up to 500 characters).' });
  if (!parsed.data.submissionUrl.startsWith('https://')) return res.status(400).json({ error: 'Use a secure HTTPS project link.' });
  const task = await tasks.findOne({ _id: req.params.id, learner_id: req.user._id, status: { $in: ['todo', 'in_review', 'changes_requested'] } });
  if (!task) return res.status(404).json({ error: 'This task is no longer open for submissions.' });
  await tasks.updateOne({ _id: task._id }, { $set: {
    submission_url: parsed.data.submissionUrl, submission_note: parsed.data.note, status: 'in_review', updated_at: new Date().toISOString()
  } });
  await recordAudit(req.user._id, 'task.submit', 'task', task._id);
  res.json((await listTasks(req.user)).find((record) => record.id === task._id));
});
app.post('/api/tasks/:id/feedback', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({ feedback: z.string().trim().min(1).max(2000), status: z.enum(['in_review', 'changes_requested', 'complete']).default('complete') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Feedback is required and must be under 2,000 characters.' });
  const task = await tasks.findOne({ _id: req.params.id });
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (req.user.role === 'trainer' && !await courses.findOne({ _id: task.course_id, trainer_id: req.user._id })) {
    return res.status(404).json({ error: 'Task not found in your assigned courses.' });
  }
  const reviewedAt = new Date().toISOString();
  await tasks.updateOne({ _id: task._id }, { $set: {
    feedback: parsed.data.feedback, status: parsed.data.status, reviewed_by: req.user._id,
    reviewed_at: reviewedAt, updated_at: reviewedAt
  } });
  await recordAudit(req.user._id, 'task.feedback', 'task', task._id);
  res.json({ ok: true });
});
app.get('/api/exams', requireUser, async (req, res) => {
  const courseFilter = req.user.role === 'trainer' ? { trainer_id: req.user._id } : {};
  const courseIds = req.user.role === 'student'
    ? await tasks.distinct('course_id', { learner_id: req.user._id })
    : (await courses.find(courseFilter, { projection: { _id: 1 } }).toArray()).map((course) => course._id);
  const examFilter = { course_id: { $in: courseIds }, ...(req.user.role === 'student' ? { status: 'published' } : {}) };
  const rows = await exams.find(examFilter).sort({ course_id: 1, week_number: 1 }).toArray();
  const courseNames = new Map((await courses.find({ _id: { $in: courseIds } }, { projection: { title: 1 } }).toArray()).map((course) => [course._id, course.title]));
  const attemptFilter = req.user.role === 'student'
    ? { learner_id: req.user._id, exam_id: { $in: rows.map((exam) => exam._id) } }
    : { exam_id: { $in: rows.map((exam) => exam._id) } };
  const attempts = await examAttempts.find(attemptFilter).sort({ attempted_at: -1 }).toArray();
  const passSetting = await appSettings.findOne({ key: 'exam_pass_mark' });
  const passMark = passSetting?.value ?? defaultExamPassMark;
  const learners = req.user.role === 'student' ? [] : await users.find({ _id: { $in: [...new Set(attempts.map((attempt) => attempt.learner_id))] } }, { projection: { name: 1 } }).toArray();
  const learnerNames = new Map(learners.map((learner) => [learner._id, learner.name]));
  const safeAttempts = attempts.map((attempt) => ({ ...toApiDocument(attempt), learner_name: learnerNames.get(attempt.learner_id) }));
  res.json(rows.map((exam) => ({
    ...toApiDocument(exam), course_title: courseNames.get(exam.course_id) || 'Course',
    questions: (exam.questions || []).map(({ prompt, options, type, marks }) => ({ prompt, options, type, marks })),
    pass_mark: exam.pass_mark ?? passMark, retake_allowed: exam.retake_allowed !== false,
    locked: req.user.role === 'student' && rows.some((previous) => previous.course_id === exam.course_id && previous.week_number < exam.week_number && !attempts.some((attempt) => attempt.exam_id === previous._id && attempt.passed)),
    attempts: safeAttempts.filter((attempt) => attempt.exam_id === exam._id && (req.user.role !== 'student' || attempt.learner_id === req.user._id))
  })));
});
app.get('/api/exam-settings', requireUser, async (_req, res) => {
  const setting = await appSettings.findOne({ key: 'exam_pass_mark' });
  res.json({ passMark: setting?.value ?? defaultExamPassMark });
});
app.patch('/api/exam-settings', requireUser, requireRoles('admin'), async (req, res) => {
  const parsed = z.object({ passMark: z.number().int().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Pass mark must be a whole percentage from 1 to 100.' });
  await appSettings.updateOne({ key: 'exam_pass_mark' }, { $set: { value: parsed.data.passMark, updated_by: req.user._id, updated_at: new Date().toISOString() } }, { upsert: true });
  await recordAudit(req.user._id, 'exam.pass_mark.update', 'setting', 'exam_pass_mark');
  res.json({ passMark: parsed.data.passMark });
});
app.get('/api/learning-progress', requireUser, requireRoles('student'), async (req, res) => {
  const courseIds = await tasks.distinct('course_id', { learner_id: req.user._id });
  const courseRows = await courses.find({ _id: { $in: courseIds } }).toArray();
  const publishedExams = await exams.find({ course_id: { $in: courseIds }, status: 'published' }).toArray();
  const weeks = await learningWeeks.find({ course_id: { $in: courseIds }, exam_id: { $in: publishedExams.map((exam) => exam._id) } }).sort({ course_id: 1, week_number: 1 }).toArray();
  const examsById = new Map(publishedExams.map((exam) => [exam._id, exam]));
  const attempts = await examAttempts.find({ learner_id: req.user._id, exam_id: { $in: [...examsById.keys()] } }).sort({ attempted_at: -1 }).toArray();
  const courseProgress = await Promise.all(courseRows.map(async (course) => {
    const courseWeeks = weeks.filter((week) => week.course_id === course._id);
    const completed = courseWeeks.filter((week) => attempts.some((attempt) => attempt.exam_id === week.exam_id && attempt.passed));
    const current = courseWeeks.find((week) => !completed.some((done) => done._id === week._id));
    const savedProgress = await studentProgress.findOne({ learner_id: req.user._id, course_id: course._id });
    return {
      course_id: course._id, course_title: course.title, current_week: Math.max(current?.week_number || 1, savedProgress?.unlocked_week || 1),
      unlocked_week: Math.max(savedProgress?.unlocked_week || 1, current?.week_number || (courseWeeks.length ? Math.max(...courseWeeks.map((week) => week.week_number)) + 1 : 1)),
      manual_override: savedProgress?.manual_override || null,
      completed_weeks: completed.map((week) => week.week_number),
      completion_percent: courseWeeks.length ? Math.round((completed.length / courseWeeks.length) * 100) : 0,
      weeks: courseWeeks.map((week) => {
        const exam = examsById.get(week.exam_id);
        const weekAttempts = attempts.filter((attempt) => attempt.exam_id === week.exam_id);
        const passed = weekAttempts.some((attempt) => attempt.passed);
        const locked = week.week_number > (savedProgress?.unlocked_week || current?.week_number || 1);
        return { ...toApiDocument(week), exam_title: exam?.title || week.title, locked, passed, attempts: weekAttempts.map(({ score, passed: didPass, attempted_at, attempt_number }) => ({ score, passed: didPass, attempted_at, attempt_number })) };
      })
    };
  }));
  res.json(courseProgress);
});
app.post('/api/exams', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({
    courseId: z.string().min(1), title: z.string().trim().min(3).max(120), weekNumber: z.number().int().min(1).max(52),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    durationMinutes: z.number().int().min(1).max(300).default(30), totalMarks: z.number().min(1).max(10000).default(100),
    syllabus: z.string().trim().max(2000).optional().default(''), instructions: z.string().trim().max(1000).optional().default(''),
    practiceMaterials: z.string().trim().max(1000).optional().default(''), retakeAllowed: z.boolean().default(true),
    maxAttempts: z.number().int().min(1).max(20).nullable().optional().default(null), status: z.enum(['draft', 'published']).default('published'),
    questions: z.array(z.object({
      type: z.enum(['single', 'multiple', 'descriptive']).default('single'),
      prompt: z.string().trim().min(5).max(1000), options: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
      correctOption: z.number().int().min(0).max(5).nullable().optional().default(null),
      correctOptions: z.array(z.number().int().min(0).max(5)).max(6).default([]),
      marks: z.number().min(0.5).max(10000).optional()
    }).superRefine((question, context) => {
      if (question.type !== 'descriptive' && question.options.length < 2) context.addIssue({ code: 'custom', message: 'MCQ questions need at least two options.' });
      if (question.type === 'single' && (question.correctOption === null || question.correctOption >= question.options.length)) context.addIssue({ code: 'custom', message: 'Choose the correct option.' });
      if (question.type === 'multiple' && (!question.correctOptions.length || question.correctOptions.some((option) => option >= question.options.length))) context.addIssue({ code: 'custom', message: 'Choose one or more valid correct options.' });
    })).min(1).max(50)
  }).safeParse(req.body);
  const examDate = parsed.data?.examDate || parsed.data?.dueDate;
  if (!parsed.success || !examDate || !isCalendarDate(examDate) || parsed.data?.questions.some((question) => question.type !== 'descriptive' && (question.type === 'multiple' ? question.correctOptions.some((option) => option >= question.options.length) : question.correctOption >= question.options.length))) {
    return res.status(400).json({ error: 'Enter a valid weekly exam, schedule, and answer choices.' });
  }
  const questions = parsed.data.questions.map((question) => ({ ...question, marks: question.marks ?? parsed.data.totalMarks / parsed.data.questions.length }));
  if (Math.abs(questions.reduce((sum, question) => sum + question.marks, 0) - parsed.data.totalMarks) > 0.01) {
    return res.status(400).json({ error: 'Question marks must add up to the exam total.' });
  }
  const course = await courses.findOne({ _id: parsed.data.courseId, trainer_id: req.user._id });
  if (!course) return res.status(404).json({ error: 'Course not found in your assigned courses.' });
  const exam = {
    _id: `exam-${crypto.randomUUID()}`, course_id: course._id, title: parsed.data.title,
    week_number: parsed.data.weekNumber, due_date: examDate, exam_date: examDate,
    duration_minutes: parsed.data.durationMinutes, total_marks: parsed.data.totalMarks,
    status: parsed.data.status, retake_allowed: parsed.data.retakeAllowed, max_attempts: parsed.data.maxAttempts,
    pass_mark: (await appSettings.findOne({ key: 'exam_pass_mark' }))?.value ?? defaultExamPassMark,
    syllabus: parsed.data.syllabus, instructions: parsed.data.instructions, practice_materials: parsed.data.practiceMaterials,
    questions,
    created_by: req.user._id, created_at: new Date().toISOString()
  };
  try { await exams.insertOne(exam); } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'A weekly exam already exists for this course and week.' });
    throw error;
  }
  await learningWeeks.updateOne({ course_id: course._id, week_number: exam.week_number }, {
    $set: { title: exam.title, syllabus: exam.syllabus, instructions: exam.instructions, practice_materials: exam.practice_materials, exam_id: exam._id, updated_at: exam.created_at },
    $setOnInsert: { _id: `week-${crypto.randomUUID()}`, course_id: course._id, week_number: exam.week_number, created_at: exam.created_at }
  }, { upsert: true });
  const learnerIds = await tasks.distinct('learner_id', { course_id: course._id });
  if (exam.status === 'published') await Promise.all(learnerIds.map((learnerId) => createNotification(learnerId, 'exam', 'New weekly exam', `${exam.title} is scheduled for ${examDate}.`, exam._id)));
  await recordAudit(req.user._id, 'exam.create', 'exam', exam._id);
  res.status(201).json({ ...toApiDocument(exam), course_title: course.title, questions: exam.questions.map(({ prompt, options }) => ({ prompt, options })), attempts: [] });
});
app.patch('/api/exams/:id/publish', requireUser, requireRoles('trainer'), async (req, res) => {
  const exam = await exams.findOne({ _id: req.params.id, created_by: req.user._id, status: 'draft' });
  if (!exam || !await courses.findOne({ _id: exam.course_id, trainer_id: req.user._id })) return res.status(404).json({ error: 'Draft not found in your assigned courses.' });
  const publishedAt = new Date().toISOString();
  await exams.updateOne({ _id: exam._id, status: 'draft' }, { $set: { status: 'published', published_at: publishedAt } });
  const learnerIds = await tasks.distinct('learner_id', { course_id: exam.course_id });
  await Promise.all(learnerIds.map((learnerId) => createNotification(learnerId, 'exam', 'New weekly exam', `${exam.title} is scheduled for ${exam.exam_date}.`, exam._id)));
  await recordAudit(req.user._id, 'exam.publish', 'exam', exam._id);
  res.json({ ok: true, published_at: publishedAt });
});
app.post('/api/exams/:id/attempt', requireUser, requireRoles('student'), async (req, res) => {
  const exam = await exams.findOne({ _id: req.params.id });
  if (!exam || exam.status !== 'published' || !await tasks.findOne({ learner_id: req.user._id, course_id: exam.course_id })) return res.status(404).json({ error: 'Exam not found in your learning paths.' });
  const previousAttempts = await examAttempts.countDocuments({ exam_id: exam._id, learner_id: req.user._id });
  if ((exam.retake_allowed === false && previousAttempts > 0) || (exam.max_attempts && previousAttempts >= exam.max_attempts)) return res.status(409).json({ error: 'The allowed attempts for this exam have been used.' });
  const earlierExams = await exams.find({ course_id: exam.course_id, status: 'published', week_number: { $lt: exam.week_number } }, { projection: { _id: 1 } }).toArray();
  const passedEarlier = new Set((await examAttempts.find({ learner_id: req.user._id, exam_id: { $in: earlierExams.map((item) => item._id) }, passed: true }, { projection: { exam_id: 1 } }).toArray()).map((attempt) => attempt.exam_id));
  const progress = await studentProgress.findOne({ learner_id: req.user._id, course_id: exam.course_id });
  if (earlierExams.some((previous) => !passedEarlier.has(previous._id)) && exam.week_number > (progress?.unlocked_week || 1)) return res.status(423).json({ error: 'Pass the earlier weekly exams to unlock this level.' });
  const answerSchema = z.union([z.number().int().min(0).max(5), z.array(z.number().int().min(0).max(5)), z.string().trim().max(5000)]);
  const parsed = z.object({ answers: z.array(answerSchema).length(exam.questions.length) }).safeParse(req.body);
  if (!parsed.success || parsed.data.answers.some((answer, index) => {
    const question = exam.questions[index];
    return question.type === 'descriptive' ? typeof answer !== 'string' || !answer.trim()
      : question.type === 'multiple' ? !Array.isArray(answer) || answer.some((option) => option >= question.options.length)
        : typeof answer !== 'number' || answer >= question.options.length;
  })) {
    return res.status(400).json({ error: 'Answer every question using one of its available choices.' });
  }
  const objectiveQuestions = exam.questions.filter((question) => question.type !== 'descriptive');
  const automaticMarks = exam.questions.reduce((total, question, index) => {
    if (question.type === 'descriptive') return total;
    const answer = parsed.data.answers[index];
    const correct = question.type === 'multiple'
      ? Array.isArray(answer) && [...answer].sort().join(',') === [...question.correctOptions].sort().join(',')
      : answer === question.correctOption;
    return total + (correct ? question.marks : 0);
  }, 0);
  const passSetting = await appSettings.findOne({ key: 'exam_pass_mark' });
  const passMark = exam.pass_mark ?? passSetting?.value ?? defaultExamPassMark;
  const hasDescriptive = exam.questions.some((question) => question.type === 'descriptive');
  const objectiveTotal = objectiveQuestions.reduce((total, question) => total + question.marks, 0);
  const score = hasDescriptive ? null : Math.round((automaticMarks / objectiveTotal) * 100);
  const awardedMarks = hasDescriptive ? null : Math.round((score / 100) * exam.total_marks * 100) / 100;
  const attemptNumber = previousAttempts + 1;
  const attempt = {
    _id: `attempt-${crypto.randomUUID()}`, exam_id: exam._id, learner_id: req.user._id,
    answers: parsed.data.answers, total_questions: exam.questions.length,
    score, automatic_marks: automaticMarks, marks: awardedMarks,
    total_marks: exam.total_marks, pass_mark: passMark, attempt_number: attemptNumber,
    passed: hasDescriptive ? null : score >= passMark, grading_status: hasDescriptive ? 'pending_review' : 'graded',
    attempted_at: new Date().toISOString()
  };
  await examAttempts.insertOne(attempt);
  if (!hasDescriptive) {
    await refreshStudentProgress(req.user._id, exam.course_id, attempt.attempted_at);
    if (attempt.passed) await issueCourseCertificate(req.user._id, exam.course_id);
    await createNotification(req.user._id, 'exam_result', `${attempt.passed ? 'Exam passed' : 'Exam failed'}`, `${exam.title}: ${score}% (${automaticMarks}/${exam.total_marks} marks). ${attempt.passed ? 'The next level is unlocked.' : `Review the practice materials and retry; ${passMark}% is required.`}`, exam._id);
  } else {
    await createNotification(exam.created_by, 'exam_review', 'Descriptive exam needs grading', `${req.user.name} submitted ${exam.title}.`, attempt._id);
  }
  await recordAudit(req.user._id, 'exam.submit', 'exam', exam._id);
  res.json({ score, marks: attempt.marks, automaticMarks, totalMarks: exam.total_marks, passMark, passed: attempt.passed, pendingReview: hasDescriptive, total: exam.questions.length, attemptNumber, attempted_at: attempt.attempted_at });
});
app.post('/api/exams/attempts/:id/grade', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({ descriptiveMarks: z.number().min(0), feedback: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid descriptive score and feedback.' });
  const attempt = await examAttempts.findOne({ _id: req.params.id, grading_status: 'pending_review' });
  const exam = attempt && await exams.findOne({ _id: attempt.exam_id });
  if (!attempt || !exam || !await courses.findOne({ _id: exam.course_id, trainer_id: req.user._id })) return res.status(404).json({ error: 'Submission not found in your assigned courses.' });
  const descriptiveMaximum = exam.questions.filter((question) => question.type === 'descriptive').reduce((sum, question) => sum + question.marks, 0);
  if (parsed.data.descriptiveMarks > descriptiveMaximum) return res.status(400).json({ error: `Descriptive score cannot exceed ${descriptiveMaximum} marks.` });
  const marks = attempt.automatic_marks + parsed.data.descriptiveMarks;
  const score = Math.round((marks / exam.total_marks) * 100);
  const passed = score >= attempt.pass_mark;
  const reviewedAt = new Date().toISOString();
  await examAttempts.updateOne({ _id: attempt._id, grading_status: 'pending_review' }, { $set: {
    marks, descriptive_marks: parsed.data.descriptiveMarks, score, passed, feedback: parsed.data.feedback,
    grading_status: 'graded', graded_by: req.user._id, graded_at: reviewedAt
  } });
  await refreshStudentProgress(attempt.learner_id, exam.course_id, reviewedAt);
  if (passed) await issueCourseCertificate(attempt.learner_id, exam.course_id);
  await createNotification(attempt.learner_id, 'exam_result', `${passed ? 'Exam passed' : 'Exam failed'}`, `${exam.title}: ${score}% (${marks}/${exam.total_marks}). Trainer feedback: ${parsed.data.feedback}`, exam._id);
  await recordAudit(req.user._id, 'exam.grade', 'exam_attempt', attempt._id, { descriptive_marks: parsed.data.descriptiveMarks, passed, feedback: parsed.data.feedback });
  res.json({ marks, totalMarks: exam.total_marks, score, passed, gradedAt: reviewedAt });
});
app.patch('/api/student-progress/:courseId/unlock', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({ learnerId: z.string().min(1), unlockedWeek: z.number().int().min(1).max(52), reason: z.string().trim().min(10).max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a student, week number, and reason of at least 10 characters.' });
  const course = await courses.findOne({ _id: req.params.courseId, trainer_id: req.user._id });
  if (!course || !await tasks.findOne({ learner_id: parsed.data.learnerId, course_id: course._id })) return res.status(404).json({ error: 'Student or course is not in your assigned scope.' });
  const now = new Date().toISOString();
  const manualOverride = { reason: parsed.data.reason, trainer_id: req.user._id, trainer_name: req.user.name, unlocked_at: now };
  await studentProgress.updateOne({ learner_id: parsed.data.learnerId, course_id: course._id }, {
    $set: { unlocked_week: parsed.data.unlockedWeek, current_week: parsed.data.unlockedWeek, manual_override: manualOverride, updated_at: now },
    $setOnInsert: { _id: `progress-${crypto.randomUUID()}`, completed_weeks: [], created_at: now }
  }, { upsert: true });
  await recordAudit(req.user._id, 'student_progress.manual_unlock', 'student_progress', `${parsed.data.learnerId}:${course._id}`, { learner_id: parsed.data.learnerId, course_id: course._id, unlocked_week: parsed.data.unlockedWeek, reason: parsed.data.reason });
  await createNotification(parsed.data.learnerId, 'level_unlock', 'Learning level unlocked', `Your trainer unlocked Week ${parsed.data.unlockedWeek} in ${course.title}. Reason: ${parsed.data.reason}`, course._id);
  res.json({ ok: true, ...manualOverride, unlocked_week: parsed.data.unlockedWeek });
});
app.get('/api/certificates', requireUser, requireRoles('student'), async (req, res) => {
  const courseIds = await tasks.distinct('course_id', { learner_id: req.user._id });
  await Promise.all(courseIds.map((courseId) => issueCourseCertificate(req.user._id, courseId)));
  const certificates = await courseCertificates.find({ learner_id: req.user._id }).sort({ issued_at: -1 }).toArray();
  res.json(certificates.map(toApiDocument));
});
app.get('/api/internships', requireUser, async (req, res) => {
  const placementStaff = ['coordinator', 'admin'].includes(req.user.role);
  const filter = req.user.role === 'trainer' ? { course_id: { $in: (await courses.find({ trainer_id: req.user._id }, { projection: { _id: 1 } }).toArray()).map((course) => course._id) } } : {};
  const rows = await internships.find(filter).sort({ apply_by: 1 }).toArray();
  const applications = req.user.role === 'student'
    ? await internshipApplications.find({ learner_id: req.user._id, internship_id: { $in: rows.map((item) => item._id) } }).toArray()
    : placementStaff ? await internshipApplications.find({ internship_id: { $in: rows.map((item) => item._id) } }).sort({ applied_at: -1 }).toArray() : [];
  const learners = req.user.role === 'student' ? [] : await users.find({ _id: { $in: [...new Set(applications.map((item) => item.learner_id))] } }, { projection: { name: 1 } }).toArray();
  const names = new Map(learners.map((learner) => [learner._id, learner.name]));
  const courseNames = new Map((await courses.find({ _id: { $in: rows.map((item) => item.course_id).filter(Boolean) } }, { projection: { title: 1 } }).toArray()).map((course) => [course._id, course.title]));
  res.json(rows.map((item) => ({ ...toApiDocument(item), course_title: courseNames.get(item.course_id) || 'All courses',
    application: req.user.role === 'student' ? (() => {
      const application = applications.find((record) => record.internship_id === item._id);
      return application ? { id: String(application._id), status: application.status, applied_at: application.applied_at, has_resume: Boolean(application.resume_id) } : null;
    })() : undefined,
    applications: !placementStaff ? undefined : applications.filter((application) => application.internship_id === item._id).map((application) => ({ ...toApiDocument(application), learner_name: names.get(application.learner_id) || 'Student', resume_url: `/api/internships/applications/${application._id}/resume` }))
  })));
});
app.post('/api/internships', requireUser, requireRoles('coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(3).max(120), organization: z.string().trim().min(2).max(120),
    description: z.string().trim().min(10).max(1500), applyBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    courseId: z.string().optional().default(''), skills: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    stipend: z.string().trim().max(80).default('Not specified'), duration: z.string().trim().max(80).default('Flexible'),
    eligibility: z.string().trim().max(500).default('Open to enrolled students'),
    type: z.enum(['internship', 'placement']).optional().default('internship'),
    stage: z.enum(['screening', 'interview', 'offer', 'closed']).optional().default('screening'),
    location: z.string().trim().min(2).max(120).optional().default('Remote'),
    workMode: z.enum(['Remote', 'Hybrid', 'On-site']).optional().default('Remote'),
    salary: z.string().trim().max(80).optional().default('Not specified')
  }).safeParse(req.body);
  if (!parsed.success || !isCalendarDate(parsed.data?.applyBy || '')) return res.status(400).json({ error: 'Enter a valid internship and application deadline.' });
  const course = parsed.data.courseId ? await courses.findOne({ _id: parsed.data.courseId }) : null;
  if (parsed.data.courseId && !course) return res.status(404).json({ error: 'Course not found.' });
  const item = { _id: `intern-${crypto.randomUUID()}`, title: parsed.data.title, organization: parsed.data.organization,
    description: parsed.data.description, apply_by: parsed.data.applyBy, course_id: course?._id || null,
    skills: parsed.data.skills, stipend: parsed.data.stipend, duration: parsed.data.duration, eligibility: parsed.data.eligibility,
    type: parsed.data.type, stage: parsed.data.stage, location: parsed.data.location, work_mode: parsed.data.workMode, salary: parsed.data.salary,
    created_by: req.user._id, created_at: new Date().toISOString() };
  await internships.insertOne(item);
  await recordAudit(req.user._id, 'internship.create', 'internship', item._id);
  res.status(201).json({ ...toApiDocument(item), course_title: course?.title || 'All courses', applications: [] });
});
app.patch('/api/internships/:id/stage', requireUser, requireRoles('coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({ stage: z.enum(['screening', 'interview', 'offer', 'closed']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid placement stage.' });
  const item = await internships.findOne({ _id: req.params.id });
  if (!item) return res.status(404).json({ error: 'Opportunity not found.' });
  await internships.updateOne({ _id: item._id }, { $set: { stage: parsed.data.stage, updated_at: new Date().toISOString() } });
  await recordAudit(req.user._id, 'internship.stage_update', 'internship', item._id, { stage: parsed.data.stage });
  res.json({ ok: true, stage: parsed.data.stage });
});
app.post('/api/internships/:id/apply', requireUser, requireRoles('student'), resumeUpload.single('resume'), async (req, res) => {
  const item = await internships.findOne({ _id: req.params.id });
  if (!item) return res.status(404).json({ error: 'Internship opportunity not found.' });
  if (item.apply_by < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'The application deadline has passed.' });
  if (!req.file) return res.status(400).json({ error: 'Attach your resume as a PDF file, up to 5 MB.' });
  if (req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ error: 'Resume must be a valid PDF file.' });
  }
  const appliedAt = new Date().toISOString();
  const application = { _id: `application-${crypto.randomUUID()}`, internship_id: item._id, learner_id: req.user._id, status: 'applied', applied_at: appliedAt, resume_id: `resume-${crypto.randomUUID()}` };
  await resumeFiles.insertOne({ _id: application.resume_id, application_id: application._id, filename: 'resume.pdf', content_type: 'application/pdf', data: new Binary(req.file.buffer), size: req.file.size, created_at: appliedAt });
  try { await internshipApplications.insertOne(application); } catch (error) {
    await resumeFiles.deleteOne({ _id: application.resume_id });
    if (error.code === 11000) return res.status(409).json({ error: 'You already applied for this internship.' });
    throw error;
  }
  await createNotification(item.created_by, 'internship_application', 'New internship application', `${req.user.name} applied for ${item.title}.`, application._id);
  await recordAudit(req.user._id, 'internship.apply', 'internship', item._id);
  const { resume_id, ...safeApplication } = application;
  res.status(201).json({ ...toApiDocument(safeApplication), has_resume: true });
});
app.patch('/api/internships/applications/:id', requireUser, requireRoles('coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({ status: z.enum(['under_review', 'shortlisted', 'selected', 'rejected']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid application status.' });
  const application = await internshipApplications.findOne({ _id: req.params.id });
  const item = application && await internships.findOne({ _id: application.internship_id });
  if (!application || !item) {
    return res.status(404).json({ error: 'Application not found in your authorized scope.' });
  }
  const reviewedAt = new Date().toISOString();
  await internshipApplications.updateOne({ _id: application._id }, { $set: { status: parsed.data.status, reviewed_by: req.user._id, reviewed_at: reviewedAt } });
  await createNotification(application.learner_id, 'internship_status', 'Internship application updated', `Your application for ${item.title} is now ${parsed.data.status.replace('_', ' ')}.`, application._id);
  await recordAudit(req.user._id, 'internship.review', 'internship_application', application._id);
  res.json({ ok: true });
});
app.get('/api/internships/applications/:id/resume', requireUser, async (req, res) => {
  const application = await internshipApplications.findOne({ _id: req.params.id });
  if (!application) return res.status(404).json({ error: 'Application not found.' });
  if (req.user.role === 'student' && application.learner_id !== req.user._id) return res.status(404).json({ error: 'Resume not found.' });
  if (req.user.role !== 'student' && !['coordinator', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to view this resume.' });
  const file = await resumeFiles.findOne({ _id: application.resume_id });
  if (!file) return res.status(404).json({ error: 'Resume file not found.' });
  res.setHeader('Content-Type', file.content_type);
  res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
  res.send(file.data.value());
});
app.get('/api/readiness', requireUser, async (req, res) => {
  const courseIds = req.user.role === 'student'
    ? await tasks.distinct('course_id', { learner_id: req.user._id })
    : (await courses.find(req.user.role === 'trainer' ? { trainer_id: req.user._id } : {}, { projection: { _id: 1 } }).toArray()).map((course) => course._id);
  const taskRows = await tasks.find({ course_id: { $in: courseIds }, ...(req.user.role === 'student' ? { learner_id: req.user._id } : {}) }, { projection: { course_id: 1, learner_id: 1 } }).toArray();
  const pairs = [...new Map(taskRows.map((task) => [`${task.learner_id}:${task.course_id}`, { learner_id: task.learner_id, course_id: task.course_id }])).values()];
  const [readinessRows, courseRows, learnerRows] = await Promise.all([
    studentReadiness.find({ course_id: { $in: courseIds }, ...(req.user.role === 'student' ? { learner_id: req.user._id } : {}) }).toArray(),
    courses.find({ _id: { $in: courseIds } }, { projection: { title: 1 } }).toArray(),
    users.find({ _id: { $in: [...new Set(pairs.map((pair) => pair.learner_id))] } }, { projection: { name: 1, avatar: 1 } }).toArray()
  ]);
  const readiness = new Map(readinessRows.map((row) => [`${row.learner_id}:${row.course_id}`, row]));
  const courseNames = new Map(courseRows.map((course) => [course._id, course.title]));
  const learners = new Map(learnerRows.map((learner) => [learner._id, learner]));
  res.json(pairs.map((pair) => ({
    ...(readiness.has(`${pair.learner_id}:${pair.course_id}`) ? toApiDocument(readiness.get(`${pair.learner_id}:${pair.course_id}`)) : {}),
    learner_id: pair.learner_id, learner_name: learners.get(pair.learner_id)?.name || 'Student', avatar: learners.get(pair.learner_id)?.avatar,
    course_id: pair.course_id, course_title: courseNames.get(pair.course_id) || 'Course',
    readiness_status: readiness.get(`${pair.learner_id}:${pair.course_id}`)?.readiness_status || 'not_assessed'
  })));
});
app.post('/api/readiness/resume', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({ courseId: z.string().min(1), resumeUrl: z.string().url().max(1000) }).safeParse(req.body);
  if (!parsed.success || !parsed.data.resumeUrl.startsWith('https://')) return res.status(400).json({ error: 'Provide a secure HTTPS link to your resume.' });
  const course = await courses.findOne({ _id: parsed.data.courseId });
  if (!course || !await tasks.findOne({ learner_id: req.user._id, course_id: course._id })) return res.status(404).json({ error: 'Course not found in your learning paths.' });
  const now = new Date().toISOString();
  await studentReadiness.updateOne({ learner_id: req.user._id, course_id: course._id }, {
    $set: { resume_url: parsed.data.resumeUrl, resume_status: 'submitted', updated_at: now },
    $setOnInsert: { _id: `readiness-${crypto.randomUUID()}`, readiness_status: 'in_progress', skills: [], created_at: now }
  }, { upsert: true });
  const trainer = await users.findOne({ _id: course.trainer_id });
  if (trainer) await createNotification(trainer._id, 'resume_review', 'Resume submitted for review', `${req.user.name} submitted a resume for ${course.title}.`, req.user._id);
  await recordAudit(req.user._id, 'readiness.resume.submit', 'student_readiness', `${req.user._id}:${course._id}`);
  res.json({ ok: true, resume_status: 'submitted' });
});
app.patch('/api/readiness/:learnerId', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({
    courseId: z.string().min(1), readinessStatus: z.enum(['in_progress', 'needs_support', 'ready_for_recommendation']),
    score: z.number().int().min(0).max(100), skills: z.array(z.string().trim().min(1).max(80)).max(30),
    feedback: z.string().trim().min(5).max(1500), resumeStatus: z.enum(['pending', 'reviewed', 'changes_requested']).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a valid readiness assessment and feedback.' });
  const course = await courses.findOne({ _id: parsed.data.courseId, trainer_id: req.user._id });
  if (!course || !await tasks.findOne({ learner_id: req.params.learnerId, course_id: course._id })) return res.status(404).json({ error: 'Student or course is not in your assigned scope.' });
  const now = new Date().toISOString();
  const update = { readiness_status: parsed.data.readinessStatus, score: parsed.data.score, skills: parsed.data.skills,
    feedback: parsed.data.feedback, reviewed_by: req.user._id, reviewed_at: now, updated_at: now,
    ...(parsed.data.resumeStatus ? { resume_status: parsed.data.resumeStatus } : {}) };
  await studentReadiness.updateOne({ learner_id: req.params.learnerId, course_id: course._id }, {
    $set: update, $setOnInsert: { _id: `readiness-${crypto.randomUUID()}`, course_id: course._id, learner_id: req.params.learnerId, created_at: now }
  }, { upsert: true });
  await createNotification(req.params.learnerId, 'readiness_feedback', 'Internship readiness updated', `${course.title}: ${parsed.data.readinessStatus.replaceAll('_', ' ')}. ${parsed.data.feedback}`, course._id);
  await recordAudit(req.user._id, 'readiness.review', 'student_readiness', `${req.params.learnerId}:${course._id}`, { score: parsed.data.score, readiness_status: parsed.data.readinessStatus, feedback: parsed.data.feedback });
  res.json({ ok: true });
});
app.get('/api/mock-interviews', requireUser, async (req, res) => {
  const courseIds = req.user.role === 'student'
    ? await tasks.distinct('course_id', { learner_id: req.user._id })
    : (await courses.find(req.user.role === 'trainer' ? { trainer_id: req.user._id } : {}, { projection: { _id: 1 } }).toArray()).map((course) => course._id);
  const filter = { course_id: { $in: courseIds }, ...(req.user.role === 'student' ? { learner_id: req.user._id } : {}) };
  const sessions = await mockInterviews.find(filter).sort({ starts_at: 1 }).toArray();
  const courseNames = new Map((await courses.find({ _id: { $in: courseIds } }, { projection: { title: 1 } }).toArray()).map((course) => [course._id, course.title]));
  const learnerNames = req.user.role === 'student' ? new Map() : new Map((await users.find({ _id: { $in: [...new Set(sessions.map((session) => session.learner_id))] } }, { projection: { name: 1 } }).toArray()).map((learner) => [learner._id, learner.name]));
  res.json(sessions.map((session) => ({ ...toApiDocument(session), course_title: courseNames.get(session.course_id) || 'Course', learner_name: learnerNames.get(session.learner_id) })));
});
app.post('/api/mock-interviews', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({ courseId: z.string().min(1), learnerId: z.string().min(1), topic: z.string().trim().min(3).max(120), startsAt: z.string().datetime(), meetingUrl: z.string().url().max(1000) }).safeParse(req.body);
  if (!parsed.success || !parsed.data.meetingUrl.startsWith('https://')) return res.status(400).json({ error: 'Provide a course, learner, interview topic, date, and secure meeting link.' });
  const course = await courses.findOne({ _id: parsed.data.courseId, trainer_id: req.user._id });
  if (!course || !await tasks.findOne({ learner_id: parsed.data.learnerId, course_id: course._id })) return res.status(404).json({ error: 'Student or course is not in your assigned scope.' });
  const interview = { _id: `mock-${crypto.randomUUID()}`, course_id: course._id, learner_id: parsed.data.learnerId, topic: parsed.data.topic,
    starts_at: parsed.data.startsAt, meeting_url: parsed.data.meetingUrl, created_by: req.user._id, created_at: new Date().toISOString() };
  await mockInterviews.insertOne(interview);
  await createNotification(parsed.data.learnerId, 'mock_interview', 'Mock interview scheduled', `${interview.topic} is scheduled for ${interview.starts_at}.`, interview._id);
  await recordAudit(req.user._id, 'mock_interview.schedule', 'mock_interview', interview._id);
  res.status(201).json(toApiDocument(interview));
});
app.get('/api/notifications', requireUser, async (req, res) => {
  const rows = await notifications.find({ user_id: req.user._id }).sort({ created_at: -1 }).limit(100).toArray();
  res.json(rows.map(toApiDocument));
});
app.patch('/api/notifications/:id/read', requireUser, async (req, res) => {
  const result = await notifications.updateOne({ _id: req.params.id, user_id: req.user._id }, { $set: { read_at: new Date().toISOString() } });
  if (!result.matchedCount) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ ok: true });
});
app.get('/api/announcements', requireUser, async (req, res) => {
  let filter = {};
  if (req.user.role === 'student') {
    const courseIds = await tasks.distinct('course_id', { learner_id: req.user._id });
    filter = { $or: [{ course_id: { $exists: false } }, { course_id: null }, { course_id: { $in: courseIds } }] };
  } else if (req.user.role === 'trainer') {
    const courseIds = await courses.distinct('_id', { trainer_id: req.user._id });
    filter = { $or: [{ course_id: { $exists: false } }, { course_id: null }, { course_id: { $in: courseIds } }] };
  }
  res.json((await announcements.find(filter).sort({ published_at: -1 }).toArray()).map(toApiDocument));
});
app.get('/api/support', requireUser, async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { user_id: req.user._id };
  const tickets = await supportTickets.find(filter).sort({ created_at: -1 }).limit(100).toArray();
  const requesterIds = [...new Set(tickets.map((ticket) => ticket.user_id))];
  const requesters = await users.find({ _id: { $in: requesterIds } }, { projection: { name: 1, role: 1 } }).toArray();
  const requesterById = new Map(requesters.map((person) => [person._id, person]));
  res.json(tickets.map((ticket) => ({
    ...toApiDocument(ticket),
    requester_name: requesterById.get(ticket.user_id)?.name || 'Campus user',
    requester_role: requesterById.get(ticket.user_id)?.role || 'unknown'
  })));
});
app.post('/api/support', requireUser, async (req, res) => {
  const parsed = z.object({
    topic: z.enum(['Learning & coursework', 'Schedule & attendance', 'Account access', 'Campus services', 'Something else']),
    message: z.string().trim().min(10).max(2000)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a topic and provide a message between 10 and 2,000 characters.' });
  const ticket = {
    _id: `sup-${crypto.randomUUID()}`,
    user_id: req.user._id,
    ...parsed.data,
    status: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await supportTickets.insertOne(ticket);
  await recordAudit(req.user._id, 'support.create', 'support_ticket', ticket._id);
  res.status(201).json({ ...toApiDocument(ticket), requester_name: req.user.name, requester_role: req.user.role });
});
app.patch('/api/support/:id', requireUser, requireRoles('admin'), async (req, res) => {
  const parsed = z.object({ status: z.enum(['open', 'in_progress', 'resolved']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid support-ticket status.' });
  const ticket = await supportTickets.findOne({ _id: req.params.id });
  if (!ticket) return res.status(404).json({ error: 'Support request not found.' });
  await supportTickets.updateOne({ _id: ticket._id }, {
    $set: { status: parsed.data.status, updated_at: new Date().toISOString() }
  });
  await recordAudit(req.user._id, 'support.update', 'support_ticket', ticket._id);
  res.json({ ok: true });
});
app.post('/api/announcements', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(1000),
    audience: z.string().trim().min(1).max(80), category: z.string().trim().min(1).max(40), courseId: z.string().optional().default('')
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Add a title, message, audience and category within the stated limits.' });
  const course = parsed.data.courseId ? await courses.findOne({ _id: parsed.data.courseId, ...(req.user.role === 'trainer' ? { trainer_id: req.user._id } : {}) }) : null;
  if (req.user.role === 'trainer' && !course) return res.status(404).json({ error: 'Choose one of your assigned courses for this announcement.' });
  if (parsed.data.courseId && !course) return res.status(404).json({ error: 'Course not found.' });
  const { courseId, ...fields } = parsed.data;
  const notice = { _id: `a-${crypto.randomUUID()}`, ...fields, ...(course ? { course_id: course._id } : {}), published_at: new Date().toISOString().slice(0, 10), publisher_id: req.user._id };
  await announcements.insertOne(notice);
  const learnerIds = course ? await tasks.distinct('learner_id', { course_id: course._id }) : (await users.find({ role: 'student' }, { projection: { _id: 1 } }).toArray()).map((learner) => learner._id);
  await Promise.all(learnerIds.map((learnerId) => createNotification(learnerId, 'announcement', 'New campus announcement', notice.title, notice._id)));
  await recordAudit(req.user._id, 'announcement.publish', 'announcement', notice._id);
  res.status(201).json(toApiDocument(notice));
});
app.get('/api/profile', requireUser, async (req, res) => res.json({ user: req.user, courses: await courses.countDocuments() }));
app.get('/api/users', requireUser, requireRoles('admin'), async (_req, res) => {
  const allUsers = await users.find({}, { projection: { name: 1, email: 1, role: 1, cohort: 1, avatar: 1, created_at: 1, password_hash: 1 } }).sort({ role: 1, name: 1 }).toArray();
  res.json(allUsers.map((user) => ({ ...publicUser(user), account_status: user.password_hash ? 'active' : 'setup required' })));
});
app.post('/api/users', requireUser, requireRoles('admin'), async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    role: z.enum(roles),
    cohort: z.string().trim().min(2).max(100)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, campus email, role, and cohort.' });
  const person = {
    _id: `u-${crypto.randomUUID()}`,
    ...parsed.data,
    email: parsed.data.email.toLowerCase(),
    avatar: parsed.data.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    password_hash: null
  };
  try {
    await users.insertOne(person);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'An account already uses that email address.' });
    throw error;
  }
  await recordAudit(req.user._id, 'user.create', 'user', person._id);
  res.status(201).json(publicUser(person));
});
app.post('/api/users/:id/invite', requireUser, requireRoles('admin'), async (req, res) => {
  const person = await users.findOne({ _id: req.params.id, password_hash: null });
  if (!person) return res.status(404).json({ error: 'Account not found or credentials have already been set.' });
  if (production && !invitationMailConfigured()) {
    return res.status(503).json({ error: 'Production invitation email is not configured. Set the SMTP environment variables before sending invitations.' });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let url;
  try {
    url = invitationUrl(token);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const invitation = await users.updateOne({ _id: person._id, password_hash: null }, {
    $set: { invite_token_hash: tokenHash, invite_expires_at: expiresAt }
  });
  if (!invitation.modifiedCount) return res.status(404).json({ error: 'Account credentials were set before the invitation could be issued.' });
  try {
    if (production || invitationMailConfigured()) await sendInvitationEmail({ email: person.email, name: person.name, invitationUrl: url });
  } catch (error) {
    await users.updateOne({ _id: person._id, invite_token_hash: tokenHash }, {
      $unset: { invite_token_hash: '', invite_expires_at: '' }
    });
    console.error('Invitation delivery failed:', error);
    return res.status(503).json({ error: 'The invitation could not be delivered. Verify SMTP settings and try again.' });
  }
  await recordAudit(req.user._id, 'user.invite', 'user', person._id);
  res.json({
    ok: true,
    expires_at: expiresAt.toISOString(),
    ...(production || invitationMailConfigured() ? {} : { development_invitation_url: url })
  });
});
app.get('/api/audit', requireUser, requireRoles('admin'), async (_req, res) => {
  const entries = await auditLog.find({}).sort({ created_at: -1 }).limit(100).toArray();
  const actors = await users.find({ _id: { $in: [...new Set(entries.map((entry) => entry.actor_id))] } }, { projection: { name: 1, role: 1 } }).toArray();
  const names = new Map(actors.map((actor) => [actor._id, actor]));
  res.json(entries.map((entry) => ({ ...toApiDocument(entry), actor: names.get(entry.actor_id)?.name || 'Campus user', role: names.get(entry.actor_id)?.role || 'unknown' })));
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.field === 'file' ? 'Lesson file must be no larger than 15 MB.' : 'Resume must be a PDF file no larger than 5 MB.' });
  console.error('Request failed:', error);
  res.status(500).json({ error: 'The request could not be completed. Please try again.' });
});

if (production) {
  const { resolve } = await import('node:path');
  app.use(express.static(resolve('frontend/dist')));
  app.get('*path', (_req, res) => res.sendFile(resolve('frontend/dist/index.html')));
}
if (process.env.NODE_ENV !== 'test') {
  runUpcomingExamReminders().catch((error) => console.error('Exam reminder job failed:', error));
  const reminderTimer = setInterval(() => runUpcomingExamReminders().catch((error) => console.error('Exam reminder job failed:', error)), 15 * 60 * 1000);
  reminderTimer.unref();
  app.listen(port, () => console.log(`Campus Hub API listening on http://localhost:${port}`));
}

export { app, client, db };
