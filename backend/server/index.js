import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { Binary } from 'mongodb';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { client, databasePromise } from './db.js';
import { initializeApiManagement, registerApiManagement } from './api-management.js';
import { provisionDemoData } from './demo-data.js';
import { invitationMailConfigured, sendInvitationEmail, sendStudentRegistrationNotification } from './mailer.js';

const app = express();
const db = await databasePromise;
await initializeApiManagement(db);
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
const events = db.collection('events');
const lostFoundItems = db.collection('lost_found_items');
const marketplaceListings = db.collection('marketplace_listings');
const studyGroups = db.collection('study_groups');
const studyGroupMessages = db.collection('study_group_messages');
const auditLog = db.collection('audit_log');
const supportTickets = db.collection('support_tickets');
const studentRegistrationRequests = db.collection('student_registration_requests');
const clubMembershipRequests = db.collection('club_membership_requests');
const exams = db.collection('exams');
const examAttempts = db.collection('exam_attempts');
const courseCertificates = db.collection('course_certificates');
const internships = db.collection('internships');
const internshipApplications = db.collection('internship_applications');
const learningWeeks = db.collection('learning_weeks');
const studentProgress = db.collection('student_progress');
const notifications = db.collection('notifications');
const profileChangeRequests = db.collection('profile_change_requests');
const resumeFiles = db.collection('resume_files');
const studentResumeFiles = db.collection('student_resume_files');
const appSettings = db.collection('app_settings');
const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const lessonUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
await notifications.createIndex(
  { user_id: 1, dedupe_key: 1 },
  { unique: true, partialFilterExpression: { dedupe_key: { $type: 'string' } } }
);
await clubMembershipRequests.createIndex({ club_id: 1, applicant_id: 1 }, { unique: true });
const defaultExamPassMark = 70;
const roles = ['student', 'trainer', 'coordinator', 'admin'];
const campusClubs = [
  { id: 'club-coding', name: 'Coding Society', category: 'Technology', description: 'Build projects, practice programming, and learn from other developers.', meeting_day: 'Wednesdays · 4:00 PM', location: 'Innovation Lab', member_count: 28, contact_email: 'coding.club@example.test' },
  { id: 'club-robotics', name: 'Robotics Club', category: 'Technology', description: 'Explore robotics, electronics, and hands-on engineering challenges.', meeting_day: 'Fridays · 3:30 PM', location: 'Engineering Workshop', member_count: 19, contact_email: 'robotics.club@example.test' },
  { id: 'club-literary', name: 'Literary Circle', category: 'Arts & culture', description: 'Share stories, discuss books, and experiment with creative writing.', meeting_day: 'Tuesdays · 4:00 PM', location: 'Library Seminar Room', member_count: 16, contact_email: 'literary.club@example.test' },
  { id: 'club-arts', name: 'Arts & Culture Collective', category: 'Arts & culture', description: 'Celebrate campus creativity through music, art, and cultural events.', meeting_day: 'Thursdays · 4:30 PM', location: 'Student Activity Hall', member_count: 24, contact_email: 'arts.club@example.test' },
  { id: 'club-green', name: 'Green Campus', category: 'Community', description: 'Bring students together for sustainability projects and campus clean-ups.', meeting_day: 'Mondays · 3:30 PM', location: 'Campus Garden', member_count: 21, contact_email: 'green.club@example.test' },
  { id: 'club-entrepreneurs', name: 'Entrepreneurship Cell', category: 'Career & business', description: 'Explore startup ideas, business skills, and student-led ventures.', meeting_day: 'Saturdays · 11:00 AM', location: 'Learning Hub, Room 2', member_count: 18, contact_email: 'ecell@example.test' }
];
const campusMapLocations = [
  { id: 'loc-academic', name: 'Academic Block', category: 'Academic', description: 'Classrooms, teaching spaces, and the campus administration office.', hours: 'Monday–Saturday · 8:00 AM–6:00 PM', accessibility: 'Step-free main entrance and lift access.', icon: 'Academic', x: 28, y: 29 },
  { id: 'loc-library', name: 'Campus Library', category: 'Library', description: 'Books, quiet study areas, and research support.', hours: 'Monday–Saturday · 8:30 AM–8:00 PM', accessibility: 'Accessible entrance and ground-floor study area.', icon: 'Library', x: 63, y: 30 },
  { id: 'loc-dining', name: 'Campus Dining Hall', category: 'Dining', description: 'Canteen and shared seating for students and staff.', hours: 'Monday–Saturday · 8:00 AM–5:00 PM', accessibility: 'Step-free entrance.', icon: 'Dining', x: 41, y: 68 },
  { id: 'loc-transit', name: 'Main Gate & Bus Stop', category: 'Transit', description: 'Main campus entrance and designated campus bus pickup point.', hours: 'Campus access · 7:00 AM–8:00 PM', accessibility: 'Accessible drop-off area at the gate.', icon: 'Transit', x: 17, y: 81 },
  { id: 'loc-wellness', name: 'Student Wellness Center', category: 'Wellness', description: 'First-aid desk and private student support room.', hours: 'Monday–Friday · 9:00 AM–5:00 PM', accessibility: 'Ground floor; ask reception for assistance.', icon: 'Wellness', x: 19, y: 49 },
  { id: 'loc-cafe', name: 'Learning Hub Café', category: 'Cafe', description: 'Coffee, light refreshments, and informal study seating.', hours: 'Monday–Saturday · 9:00 AM–6:00 PM', accessibility: 'Step-free entrance and accessible seating.', icon: 'Cafe', x: 75, y: 58 }
];
const libraryCatalog = [
  { id: 'book-web-foundations', title: 'Foundations of Web Development', author: 'Mira Sen', category: 'Technology', isbn: '978-1-55555-010-1', shelf: 'Technology · T-12', total_copies: 4, available_copies: 3 },
  { id: 'book-ui-design', title: 'Practical Interface Design', author: 'Rohan Mehta', category: 'Design', isbn: '978-1-55555-010-2', shelf: 'Design · D-04', total_copies: 3, available_copies: 1 },
  { id: 'book-data-thinking', title: 'Data Thinking for Beginners', author: 'Anika Rao', category: 'Technology', isbn: '978-1-55555-010-3', shelf: 'Technology · T-18', total_copies: 3, available_copies: 0 },
  { id: 'book-business-basics', title: 'Business and Finance Essentials', author: 'Dev Patel', category: 'Business', isbn: '978-1-55555-010-4', shelf: 'Business · B-09', total_copies: 2, available_copies: 2 },
  { id: 'book-writing', title: 'Clear Writing for Research', author: 'Leela Das', category: 'Research', isbn: '978-1-55555-010-5', shelf: 'Research · R-03', total_copies: 2, available_copies: 1 },
  { id: 'book-marketing', title: 'The Student Guide to Digital Marketing', author: 'Kabir Shah', category: 'Business', isbn: '978-1-55555-010-6', shelf: 'Business · B-15', total_copies: 3, available_copies: 2 },
  { id: 'book-robotics', title: 'Robotics: A Hands-on Introduction', author: 'Tara Iyer', category: 'Engineering', isbn: '978-1-55555-010-7', shelf: 'Engineering · E-07', total_copies: 2, available_copies: 1 },
  { id: 'book-learning', title: 'Learning Skills for University', author: 'Nikhil Kumar', category: 'Study skills', isbn: '978-1-55555-010-8', shelf: 'Study skills · S-02', total_copies: 3, available_copies: 3 }
];
const roomBookings = db.collection('room_bookings');
await roomBookings.createIndex(
  { room_id: 1, date: 1, slot: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' } }
);
const bookableRooms = [
  { id: 'innovation-lab', name: 'Innovation Lab', type: 'Lab' },
  { id: 'computer-lab', name: 'Computer Lab', type: 'Lab' },
  { id: 'seminar-room-a', name: 'Seminar Room A', type: 'Study room' },
  { id: 'seminar-room-b', name: 'Seminar Room B', type: 'Study room' },
  { id: 'project-room', name: 'Project Room', type: 'Study room' }
];
const librarySeatBookings = db.collection('library_seat_bookings');
await librarySeatBookings.createIndex(
  { seat_id: 1, date: 1, slot: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' } }
);
const bookableLibrarySeats = [
  ...Array.from({ length: 6 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return { id: `quiet-${number}`, name: `Quiet desk ${number}`, zone: 'Quiet study' };
  }),
  ...Array.from({ length: 6 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return { id: `group-${number}`, name: `Study desk ${number}`, zone: 'Collaborative study' };
  })
];
const courseReviews = db.collection('course_reviews');
await courseReviews.createIndex({ course_id: 1, user_id: 1 }, { unique: true });
const transportUpdates = db.collection('transport_updates');
await transportUpdates.createIndex({ status: 1, created_at: -1 });
const campusTransportRoutes = [
  { id: 'north-route', code: 'NORTH', name: 'North Gate Shuttle', description: 'Connects the north residential area with the campus.', service_days: 'Monday–Saturday', frequency: 'Every 30 minutes', stops: [{ name: 'North Gate', time: '07:30' }, { name: 'Student Housing', time: '07:40' }, { name: 'Main Campus Gate', time: '08:00' }, { name: 'Library', time: '08:08' }] },
  { id: 'east-route', code: 'EAST', name: 'East District Shuttle', description: 'A direct connection from the east transit stop to campus.', service_days: 'Monday–Saturday', frequency: 'Every 45 minutes', stops: [{ name: 'East Transit Stop', time: '07:35' }, { name: 'Community Centre', time: '07:48' }, { name: 'Main Campus Gate', time: '08:05' }, { name: 'Academic Block', time: '08:12' }] },
  { id: 'campus-loop', code: 'LOOP', name: 'Campus Loop', description: 'An accessible loop between key campus facilities.', service_days: 'Monday–Saturday', frequency: 'Every 20 minutes', stops: [{ name: 'Main Campus Gate', time: '08:00' }, { name: 'Academic Block', time: '08:06' }, { name: 'Campus Library', time: '08:12' }, { name: 'Dining Hall', time: '08:18' }] }
];
const canteenMenuByDay = {
  Monday: [
    { id: 'mon-breakfast', category: 'Breakfast', name: 'Idli with sambar', description: 'Steamed idli served with sambar and coconut chutney.', price: 45, vegetarian: true, serving_time: '8:00–10:30 AM', available: true },
    { id: 'mon-lunch', category: 'Lunch', name: 'Vegetable thali', description: 'Seasonal vegetables, dal, rice, roti, and curd.', price: 95, vegetarian: true, serving_time: '12:00–2:30 PM', available: true },
    { id: 'mon-special', category: 'Lunch special', name: 'Chicken rice bowl', description: 'Spiced chicken with rice and fresh salad.', price: 125, vegetarian: false, serving_time: '12:00–2:30 PM', available: true },
    { id: 'mon-snack', category: 'Snacks', name: 'Masala dosa', description: 'Crisp dosa with potato masala and chutneys.', price: 65, vegetarian: true, serving_time: '3:00–5:00 PM', available: true }
  ],
  Tuesday: [
    { id: 'tue-breakfast', category: 'Breakfast', name: 'Poha with peanuts', description: 'Light flattened rice with curry leaves and peanuts.', price: 40, vegetarian: true, serving_time: '8:00–10:30 AM', available: true },
    { id: 'tue-lunch', category: 'Lunch', name: 'Paneer pulao', description: 'Mildly spiced rice with paneer and cucumber raita.', price: 100, vegetarian: true, serving_time: '12:00–2:30 PM', available: true },
    { id: 'tue-special', category: 'Lunch special', name: 'Egg curry meal', description: 'Egg curry with steamed rice and seasonal vegetables.', price: 105, vegetarian: false, serving_time: '12:00–2:30 PM', available: true },
    { id: 'tue-snack', category: 'Snacks', name: 'Vegetable sandwich', description: 'Toasted sandwich with vegetables and mint chutney.', price: 55, vegetarian: true, serving_time: '3:00–5:00 PM', available: true }
  ],
  Wednesday: [
    { id: 'wed-breakfast', category: 'Breakfast', name: 'Upma with chutney', description: 'Warm semolina upma with vegetables and chutney.', price: 40, vegetarian: true, serving_time: '8:00–10:30 AM', available: true },
    { id: 'wed-lunch', category: 'Lunch', name: 'Dal khichdi', description: 'Rice and lentils cooked with mild spices, served with curd.', price: 80, vegetarian: true, serving_time: '12:00–2:30 PM', available: true },
    { id: 'wed-special', category: 'Lunch special', name: 'Grilled chicken wrap', description: 'Grilled chicken, vegetables, and mint yogurt dressing.', price: 115, vegetarian: false, serving_time: '12:00–2:30 PM', available: true },
    { id: 'wed-snack', category: 'Snacks', name: 'Samosa and chai', description: 'Two vegetable samosas with a cup of tea.', price: 45, vegetarian: true, serving_time: '3:00–5:00 PM', available: true }
  ],
  Thursday: [
    { id: 'thu-breakfast', category: 'Breakfast', name: 'Pongal with chutney', description: 'Rice and lentil pongal with pepper and curry leaves.', price: 45, vegetarian: true, serving_time: '8:00–10:30 AM', available: true },
    { id: 'thu-lunch', category: 'Lunch', name: 'Chole with rice', description: 'Chickpea curry with rice, salad, and pickle.', price: 85, vegetarian: true, serving_time: '12:00–2:30 PM', available: true },
    { id: 'thu-special', category: 'Lunch special', name: 'Fish curry meal', description: 'Fish curry with rice and a seasonal side.', price: 135, vegetarian: false, serving_time: '12:00–2:30 PM', available: true },
    { id: 'thu-snack', category: 'Snacks', name: 'Fruit and yogurt cup', description: 'Seasonal fruit with plain yogurt.', price: 50, vegetarian: true, serving_time: '3:00–5:00 PM', available: true }
  ],
  Friday: [
    { id: 'fri-breakfast', category: 'Breakfast', name: 'Masala omelette toast', description: 'Two-egg vegetable omelette with toasted bread.', price: 60, vegetarian: false, serving_time: '8:00–10:30 AM', available: true },
    { id: 'fri-lunch', category: 'Lunch', name: 'Vegetable biryani', description: 'Fragrant rice with vegetables, raita, and salan.', price: 95, vegetarian: true, serving_time: '12:00–2:30 PM', available: true },
    { id: 'fri-special', category: 'Lunch special', name: 'Paneer wrap', description: 'Spiced paneer and vegetables in a soft flatbread.', price: 90, vegetarian: true, serving_time: '12:00–2:30 PM', available: true },
    { id: 'fri-snack', category: 'Snacks', name: 'Corn chaat', description: 'Sweet corn with lime, herbs, and mild spices.', price: 45, vegetarian: true, serving_time: '3:00–5:00 PM', available: true }
  ],
  Saturday: [
    { id: 'sat-breakfast', category: 'Breakfast', name: 'Aloo paratha with curd', description: 'Potato-stuffed paratha served with curd and pickle.', price: 60, vegetarian: true, serving_time: '8:00–10:30 AM', available: true },
    { id: 'sat-lunch', category: 'Lunch', name: 'Rajma rice', description: 'Kidney bean curry with steamed rice and salad.', price: 85, vegetarian: true, serving_time: '12:00–2:30 PM', available: true },
    { id: 'sat-special', category: 'Lunch special', name: 'Chicken biryani', description: 'Chicken biryani with raita and a boiled egg.', price: 130, vegetarian: false, serving_time: '12:00–2:30 PM', available: true },
    { id: 'sat-snack', category: 'Snacks', name: 'Paneer roll', description: 'Paneer and vegetables wrapped in a toasted flatbread.', price: 70, vegetarian: true, serving_time: '3:00–5:00 PM', available: true }
  ]
};

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'https://zyngramcampushub.netlify.app',
    'https://saidumastanbi16.github.io'
  ]);
  const origin = _req.headers.origin;
  if (origin && (allowedOrigins.has(origin) || origin.startsWith('https://saidumastanbi16.github.io/'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

function publicUser(user) {
  if (!user) return null;
  const { password_hash, invite_token_hash, invite_expires_at, session_version, _id, ...safe } = user;
  return { ...safe, _id, id: String(_id) };
}
function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
class ResumePdfError extends Error {}
async function extractResumeText(buffer) {
  let document;
  try {
    document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
    if (document.numPages > 20) throw new ResumePdfError('Resume PDF must have 20 pages or fewer.');
    const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => 'str' in item ? item.str : '').join(' ');
    }));
    return { text: pages.join(' ').slice(0, 100_000), pageCount: document.numPages };
  } catch (error) {
    if (error instanceof ResumePdfError) throw error;
    throw new ResumePdfError('This PDF could not be read. Upload a readable, non-password-protected PDF.');
  } finally {
    await document?.destroy();
  }
}
function normalizeSkill(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function matchResumeSkills(resumeText, skills = []) {
  const normalizedResume = ` ${normalizeSkill(resumeText)} `;
  return [...new Set(skills.filter((skill) => {
    const normalizedSkill = normalizeSkill(skill);
    return normalizedSkill && normalizedResume.includes(` ${normalizedSkill} `);
  }))];
}
async function createZinId(name) {
  const firstName = name.trim().split(/\s+/)[0].replace(/[^a-z]/gi, '').toUpperCase();
  const prefix = firstName.slice(0, 2).padEnd(2, firstName[0] || 'Z');
  const suffix = firstName.slice(-2).padStart(2, firstName[0] || 'Z');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10)).join('');
    const zinId = `${prefix}${digits}${suffix}`;
    const [existingUser, existingRequest] = await Promise.all([
      users.findOne({ zin_id: zinId }, { projection: { _id: 1 } }),
      studentRegistrationRequests.findOne({ zin_id: zinId }, { projection: { _id: 1 } })
    ]);
    if (!existingUser && !existingRequest) return zinId;
  }
  throw new Error('A unique ZIN ID could not be generated. Please try again.');
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
function uniqueCourseRows(rows) {
  const seen = new Set();
  return [...rows].sort((a, b) => Number(Boolean(a.demo)) - Number(Boolean(b.demo))).filter((course) => {
    const title = String(course.title || '').trim().toLowerCase();
    if (!title || seen.has(title)) return false;
    seen.add(title);
    return true;
  });
}
async function coursesWithProgress(courseRows, learnerId) {
  if (!learnerId) return courseRows;
  const courseIds = courseRows.map((course) => course._id);
  const courseLessons = await lessons.find({ course_id: { $in: courseIds }, status: 'published' }, { projection: { _id: 1, course_id: 1 } }).toArray();
  const lessonIds = courseLessons.map((lesson) => lesson._id);
  const completed = await lessonProgress.find({ learner_id: learnerId, lesson_id: { $in: lessonIds } }, { projection: { lesson_id: 1 } }).toArray();
  const completedIds = new Set(completed.map((progress) => progress.lesson_id));
  const totalByCourse = new Map();
  for (const lesson of courseLessons) totalByCourse.set(lesson.course_id, (totalByCourse.get(lesson.course_id) || 0) + 1);
  const completedByCourse = new Map();
  for (const lesson of courseLessons) if (completedIds.has(lesson._id)) completedByCourse.set(lesson.course_id, (completedByCourse.get(lesson.course_id) || 0) + 1);
  return courseRows.map((course) => {
    const total = totalByCourse.get(course._id) || 0;
    const done = completedByCourse.get(course._id) || 0;
    return { ...course, progress: total ? Math.round(done / total * 100) : 0 };
  });
}
async function currentUser(req) {
  let payload;
  try {
    payload = jwt.verify(req.cookies.campus_session, secret, { issuer: 'zyngram-campus-hub' });
  } catch {
    return null;
  }
  const user = await users.findOne({ _id: payload.sub });
  if (user && (payload.sv ?? 0) !== (user.session_version ?? 0)) return null;
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
registerApiManagement({ app, db, requireUser, requireRoles, recordAudit });
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
export async function runUpcomingEventReminders(now = new Date()) {
  const start = now.toISOString();
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const upcoming = await events.find({
    starts_at: { $gt: start, $lte: cutoff },
    attendee_ids: { $exists: true, $ne: [] }
  }).toArray();
  for (const event of upcoming) {
    const alreadyReminded = new Set(event.reminder_user_ids || []);
    const attendeeIds = (event.attendee_ids || []).filter((id) => !alreadyReminded.has(id));
    await Promise.all(attendeeIds.map((userId) => createNotification(
      userId,
      'event_reminder',
      'Campus event reminder',
      `${event.title} starts ${new Date(event.starts_at).toLocaleString('en-IN')} at ${event.location}.`,
      event._id,
      `event-reminder:${event._id}:${userId}`
    )));
    if (attendeeIds.length) {
      await events.updateOne({ _id: event._id }, { $addToSet: { reminder_user_ids: { $each: attendeeIds } } });
    }
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
  const token = jwt.sign({ sub: user._id, sv: user.session_version ?? 0 }, secret, { expiresIn: '8h', issuer: 'zyngram-campus-hub' });
  res.cookie('campus_session', token, {
    httpOnly: true, secure: production, sameSite: production ? 'none' : 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/'
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
app.post('/api/admin/recover', async (req, res) => {
  const configuredToken = process.env.ADMIN_RECOVERY_TOKEN;
  if (!configuredToken || configuredToken.length < 32) return res.status(404).json({ error: 'Not found.' });
  const suppliedToken = req.get('x-admin-recovery-token') || '';
  const configuredBuffer = Buffer.from(configuredToken);
  const suppliedBuffer = Buffer.from(suppliedToken);
  const tokenMatches = suppliedBuffer.length === configuredBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, configuredBuffer);
  if (!tokenMatches) return res.status(401).json({ error: 'Recovery authorization failed.' });
  const tokenHash = crypto.createHash('sha256').update(configuredToken).digest('hex');
  const parsed = z.object({
    currentEmail: z.string().trim().email().max(254),
    newEmail: z.string().trim().email().max(254),
    newPassword: z.string().min(16).max(200)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide the current admin email, new email, and a new password of at least 16 characters.' });
  if (await users.countDocuments({ role: 'admin' }) !== 1) {
    return res.status(409).json({ error: 'Recovery requires exactly one existing administrator account.' });
  }
  try {
    await appSettings.updateOne(
      { key: 'admin_recovery_token_hashes', used_tokens: { $ne: tokenHash } },
      { $setOnInsert: { key: 'admin_recovery_token_hashes' }, $addToSet: { used_tokens: tokenHash } },
      { upsert: true }
    );
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'This recovery token has already been used.' });
    throw error;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = `scrypt$${salt}$${crypto.scryptSync(parsed.data.newPassword, salt, 64).toString('hex')}`;
  let result;
  try {
    result = await users.updateOne({
      role: 'admin',
      email: parsed.data.currentEmail.toLowerCase()
    }, {
      $set: {
        email: parsed.data.newEmail.toLowerCase(),
        password_hash: passwordHash,
        credential_set_at: new Date().toISOString()
      },
      $inc: { session_version: 1 },
      $unset: { invite_token_hash: '', invite_expires_at: '' }
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'The new email is already used by another account.' });
    throw error;
  }
  if (!result.modifiedCount) return res.status(409).json({ error: 'Admin account was not found for the supplied current email.' });
  await recordAudit('system:admin-recovery', 'admin.recover', 'user', parsed.data.newEmail.toLowerCase());
  res.json({ ok: true, email: parsed.data.newEmail.toLowerCase() });
});
app.post('/api/auth/login', async (req, res) => {
  const parsed = z.object({
    role: z.enum(roles),
    email: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(200)
  }).safeParse(req.body);
  if (!parsed.success || (parsed.success && parsed.data.role !== 'student' && !z.string().email().safeParse(parsed.data.email).success)) {
    return res.status(400).json({ error: 'Enter a valid campus email or student ZIN ID and password.' });
  }
  const identifier = parsed.data.email.toLowerCase();
  const user = await users.findOne(parsed.data.role === 'student' && !identifier.includes('@')
    ? { zin_id: identifier.toUpperCase() }
    : { email: identifier });
  const encoded = user?.password_hash || '';
  const [algorithm, salt, hash] = encoded.split('$');
  let passwordMatches = false;
  if (algorithm === 'scrypt' && salt && hash) {
    const actual = crypto.scryptSync(parsed.data.password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    passwordMatches = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  if (!user || user.role !== parsed.data.role || !passwordMatches) {
    if (parsed.data.role === 'student') {
      const registration = await studentRegistrationRequests.findOne({
        $or: [{ email: identifier }, { zin_id: identifier.toUpperCase() }],
        status: { $in: ['pending', 'rejected'] }
      }, { projection: { status: 1 } });
      if (registration?.status === 'pending') return res.status(403).json({ error: 'Your ZIN ID is waiting for administrator approval. You can sign in after your request is approved.' });
      if (registration?.status === 'rejected') return res.status(403).json({ error: 'Your student registration request was declined. Please contact campus support.' });
    }
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
  res.clearCookie('campus_session', { httpOnly: true, secure: production, sameSite: production ? 'none' : 'strict', path: '/' });
  res.json({ ok: true });
});
app.post('/api/auth/logout', requireUser, async (req, res) => {
  await recordAudit(req.user._id, 'sign_out', 'session', req.user._id);
  res.clearCookie('campus_session', { httpOnly: true, secure: production, sameSite: production ? 'none' : 'strict', path: '/' });
  res.json({ ok: true });
});
app.get('/api/auth/session', async (req, res) => res.json({ user: await currentUser(req) }));
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));
app.get('/api/dashboard', requireUser, async (req, res) => {
  const user = req.user;
  const courseFilter = user.role === 'trainer' ? { trainer_id: user._id } : {};
  const courseRows = await coursesWithProgress(uniqueCourseRows(await courses.find(courseFilter).sort({ next_session: 1 }).toArray()), user.role === 'student' ? user._id : null);
  const trainerIds = [...new Set(courseRows.map((course) => course.trainer_id).filter(Boolean))];
  const trainers = await users.find({ _id: { $in: trainerIds } }, { projection: { name: 1 } }).toArray();
  const trainerNames = new Map(trainers.map((trainer) => [trainer._id, trainer.name]));
  const courseList = courseRows.map((course) => ({ ...toApiDocument(course), trainer_name: trainerNames.get(course.trainer_id) || 'Campus trainer' }));
  const courseIds = courseRows.map((course) => course._id);
  const attendanceFilter = user.role === 'student' ? { user_id: user._id }
    : user.role === 'trainer' ? { course_id: { $in: courseIds } } : {};
  const attended = await attendance.find(attendanceFilter).toArray();
  const taskList = await listTasks(user);
  const learningActivity = user.role === 'student'
    ? await lessonProgress.find({ learner_id: user._id, completed_at: { $exists: true } }, { projection: { completed_at: 1 } }).toArray()
    : [];
  const streakDates = [...new Set(learningActivity.map((activity) => {
    const completedAt = new Date(activity.completed_at);
    return Number.isNaN(completedAt.getTime()) ? '' : completedAt.toISOString().slice(0, 10);
  }).filter(Boolean))];
  const todayKey = new Date().toISOString().slice(0, 10);
  let learningStreak = 0;
  const cursor = new Date(`${todayKey}T00:00:00.000Z`);
  if (!streakDates.includes(todayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (streakDates.includes(cursor.toISOString().slice(0, 10))) {
    learningStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
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
    learningStreak,
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
  const list = await coursesWithProgress(uniqueCourseRows(await courses.find(filter).sort({ title: 1 }).toArray()), req.user.role === 'student' ? req.user._id : null);
  const trainers = await users.find({ _id: { $in: list.map((course) => course.trainer_id).filter(Boolean) } }, { projection: { name: 1 } }).toArray();
  const names = new Map(trainers.map((trainer) => [trainer._id, trainer.name]));
  res.json(list.map((course) => ({ ...toApiDocument(course), trainer_name: names.get(course.trainer_id) || 'Campus trainer' })));
});
app.get('/api/course-learners', requireUser, requireRoles('trainer'), async (req, res) => {
  const parsed = z.object({ courseId: z.string().min(1) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a course to load its learners.' });
  const course = await courses.findOne({ _id: parsed.data.courseId, trainer_id: req.user._id });
  if (!course) return res.status(404).json({ error: 'Course not found in your assigned scope.' });
  const learners = await users.find({ role: 'student' }, {
    projection: { name: 1, avatar: 1, cohort: 1 }
  }).sort({ name: 1 }).toArray();
  res.json(learners.map((learner) => ({
    id: String(learner._id),
    name: learner.name,
    avatar: learner.avatar,
    cohort: learner.cohort
  })));
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
  let courseIds;
  if (req.user.role === 'student') {
    const [assignedCourseIds, availableCourses] = await Promise.all([
      tasks.distinct('course_id', { learner_id: req.user._id }),
      courses.find({}, { projection: { _id: 1 } }).toArray()
    ]);
    courseIds = [...new Set([...assignedCourseIds, ...availableCourses.map((course) => course._id)])];
  } else {
    courseIds = (await courses.find(req.user.role === 'trainer' ? { trainer_id: req.user._id } : {}, { projection: { _id: 1 } }).toArray()).map((course) => course._id);
  }
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
  const availableCourse = lesson ? await courses.findOne({ _id: lesson.course_id }, { projection: { _id: 1 } }) : null;
  if (!lesson || !availableCourse) return res.status(404).json({ error: 'Lesson not found in your learning paths.' });
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
  if (!course || !learner) return res.status(404).json({ error: 'Student or course is not in your assigned scope.' });
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
  const savedResume = req.user.role === 'student' ? await studentResumeFiles.findOne({ learner_id: req.user._id }) : null;
  const resumeText = savedResume ? (await extractResumeText(savedResume.data.value())).text : '';
  const applications = req.user.role === 'student'
    ? await internshipApplications.find({ learner_id: req.user._id, internship_id: { $in: rows.map((item) => item._id) } }).toArray()
    : placementStaff ? await internshipApplications.find({ internship_id: { $in: rows.map((item) => item._id) } }).sort({ applied_at: -1 }).toArray() : [];
  const learners = req.user.role === 'student' ? [] : await users.find({ _id: { $in: [...new Set(applications.map((item) => item.learner_id))] } }, { projection: { name: 1 } }).toArray();
  const names = new Map(learners.map((learner) => [learner._id, learner.name]));
  const courseNames = new Map((await courses.find({ _id: { $in: rows.map((item) => item.course_id).filter(Boolean) } }, { projection: { title: 1 } }).toArray()).map((course) => [course._id, course.title]));
  const opportunities = rows.map((item) => {
    const matchedSkills = req.user.role === 'student' && resumeText ? matchResumeSkills(resumeText, item.skills) : [];
    return { ...toApiDocument(item), course_title: courseNames.get(item.course_id) || 'All courses',
    ...(req.user.role === 'student' ? {
      resume_match: {
        recommended: matchedSkills.length > 0,
        matched_skills: matchedSkills,
        score: item.skills?.length ? Math.round((matchedSkills.length / item.skills.length) * 100) : 0
      }
    } : {}),
    application: req.user.role === 'student' ? (() => {
      const application = applications.find((record) => record.internship_id === item._id);
      return application ? { id: String(application._id), status: application.status, applied_at: application.applied_at, has_resume: Boolean(application.resume_id) } : null;
    })() : undefined,
    applications: !placementStaff ? undefined : applications.filter((application) => application.internship_id === item._id).map((application) => ({ ...toApiDocument(application), learner_name: names.get(application.learner_id) || 'Student', resume_url: `/api/internships/applications/${application._id}/resume` }))
  };
  });
  res.json(req.user.role === 'student'
    ? opportunities.sort((left, right) => Number(right.resume_match.recommended) - Number(left.resume_match.recommended) || left.apply_by.localeCompare(right.apply_by))
    : opportunities);
});
app.get('/api/student-resume', requireUser, requireRoles('student'), async (req, res) => {
  const resume = await studentResumeFiles.findOne({ learner_id: req.user._id }, { projection: { filename: 1, size: 1, uploaded_at: 1, page_count: 1, text_available: 1 } });
  res.json({ resume: resume ? {
    filename: resume.filename,
    size: resume.size,
    uploaded_at: resume.uploaded_at,
    page_count: resume.page_count,
    text_available: resume.text_available
  } : null });
});
app.get('/api/student-resume/file', requireUser, requireRoles('student'), async (req, res) => {
  const resume = await studentResumeFiles.findOne({ learner_id: req.user._id });
  if (!resume) return res.status(404).json({ error: 'Upload a resume before opening it.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(resume.data.value());
});
app.post('/api/student-resume', requireUser, requireRoles('student'), resumeUpload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF resume to upload (maximum 5 MB).' });
  if (req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ error: 'Resume must be a valid PDF file.' });
  }
  let parsedResume;
  try {
    parsedResume = await extractResumeText(req.file.buffer);
  } catch (error) {
    if (error instanceof ResumePdfError) return res.status(400).json({ error: error.message });
    throw error;
  }
  const uploadedAt = new Date().toISOString();
  await studentResumeFiles.updateOne({ learner_id: req.user._id }, {
    $set: {
      filename: req.file.originalname.replace(/[^\w.-]/g, '_').slice(-120) || 'resume.pdf',
      content_type: 'application/pdf',
      data: new Binary(req.file.buffer),
      size: req.file.size,
      page_count: parsedResume.pageCount,
      text_available: Boolean(parsedResume.text.trim()),
      uploaded_at: uploadedAt,
      updated_at: uploadedAt
    },
    $setOnInsert: { _id: `student-resume-${crypto.randomUUID()}`, created_at: uploadedAt }
  }, { upsert: true });
  const matches = parsedResume.text ? (await internships.find({}, { projection: { skills: 1 } }).toArray())
    .flatMap((opportunity) => matchResumeSkills(parsedResume.text, opportunity.skills)) : [];
  await recordAudit(req.user._id, 'student.resume.upload', 'student_resume', req.user._id, { size: req.file.size });
  res.json({
    ok: true,
    resume: {
      filename: req.file.originalname.replace(/[^\w.-]/g, '_').slice(-120) || 'resume.pdf',
      size: req.file.size,
      uploaded_at: uploadedAt,
      text_available: Boolean(parsedResume.text.trim()),
      matched_skills: [...new Set(matches)]
    }
  });
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
  const savedResume = req.file ? null : await studentResumeFiles.findOne({ learner_id: req.user._id });
  if (!req.file && !savedResume) return res.status(400).json({ error: 'Upload a resume PDF before applying.' });
  if (req.file && (req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-')) {
    return res.status(400).json({ error: 'Resume must be a valid PDF file.' });
  }
  const resumeBuffer = req.file?.buffer || savedResume.data.value();
  const appliedAt = new Date().toISOString();
  const application = { _id: `application-${crypto.randomUUID()}`, internship_id: item._id, learner_id: req.user._id, status: 'applied', applied_at: appliedAt, resume_id: `resume-${crypto.randomUUID()}` };
  await resumeFiles.insertOne({
    _id: application.resume_id, application_id: application._id, filename: req.file?.originalname || savedResume.filename,
    content_type: 'application/pdf', data: new Binary(resumeBuffer), size: resumeBuffer.length, created_at: appliedAt
  });
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
app.get('/api/clubs', requireUser, async (_req, res) => {
  const clubs = await Promise.all(campusClubs.map(async (club) => ({
    ...club,
    member_count: club.member_count + await clubMembershipRequests.countDocuments({ club_id: club.id, status: 'approved' })
  })));
  res.json(clubs);
});
app.get('/api/campus-map', requireUser, (_req, res) => res.json(campusMapLocations));
app.get('/api/library-catalog', requireUser, (req, res) => {
  const parsed = z.object({ q: z.string().trim().max(100).default('') }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Search text must be 100 characters or fewer.' });
  const query = parsed.data.q.toLowerCase();
  const results = query
    ? libraryCatalog.filter((book) => `${book.title} ${book.author} ${book.category} ${book.isbn}`.toLowerCase().includes(query))
    : libraryCatalog;
  res.json(results);
});
app.get('/api/course-reviews', requireUser, async (req, res) => {
  const courseFilter = req.user.role === 'trainer' ? { trainer_id: req.user._id } : {};
  const courseRows = await courses.find(courseFilter).sort({ title: 1 }).limit(200).toArray();
  const courseIds = courseRows.map((course) => course._id);
  if (!courseIds.length) return res.json([]);
  const reviews = await courseReviews.find({ course_id: { $in: courseIds } })
    .sort({ updated_at: -1 }).limit(1000).toArray();
  const reviewsByCourse = new Map();
  for (const review of reviews) {
    const list = reviewsByCourse.get(review.course_id) || [];
    list.push(review);
    reviewsByCourse.set(review.course_id, list);
  }
  res.json(courseRows.map((course) => {
    const courseReviewRows = reviewsByCourse.get(course._id) || [];
    const myReview = courseReviewRows.find((review) => review.user_id === req.user._id);
    const average = courseReviewRows.length
      ? courseReviewRows.reduce((total, review) => total + review.rating, 0) / courseReviewRows.length
      : 0;
    return {
      id: course._id,
      title: course.title,
      average_rating: average,
      review_count: courseReviewRows.length,
      my_review: myReview ? { rating: myReview.rating, comment: myReview.comment } : null,
      reviews: courseReviewRows.slice(0, 20).map((review) => ({
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        updated_at: review.updated_at,
        from_me: review.user_id === req.user._id
      }))
    };
  }));
});
app.get('/api/transport/updates', requireUser, async (_req, res) => {
  const updates = await transportUpdates.find({ status: 'active' }).sort({ created_at: -1 }).limit(100).toArray();
  const routeNames = new Map(campusTransportRoutes.map((route) => [route.id, route.name]));
  res.json({
    routes: campusTransportRoutes,
    updates: updates.map((update) => {
      const { created_by, ...fields } = update;
      return { ...toApiDocument(fields), route_name: routeNames.get(update.route_id) || 'All routes' };
    })
  });
});
app.get('/api/canteen/menu', requireUser, (req, res) => {
  const parsed = z.object({ day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a menu day from Monday to Saturday.' });
  res.json({
    day: parsed.data.day,
    hours: 'Monday–Saturday · 8:00 AM–5:00 PM',
    meals: canteenMenuByDay[parsed.data.day]
  });
});
app.post('/api/transport/updates', requireUser, requireRoles('coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({
    routeId: z.string().trim().min(1).max(40),
    type: z.enum(['delay', 'cancellation', 'information']),
    message: z.string().trim().min(5).max(300)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a route and update type, and enter a message between 5 and 300 characters.' });
  if (parsed.data.routeId !== 'all' && !campusTransportRoutes.some((route) => route.id === parsed.data.routeId)) {
    return res.status(400).json({ error: 'Choose a valid campus shuttle route.' });
  }
  const update = {
    _id: `transport-update-${crypto.randomUUID()}`,
    route_id: parsed.data.routeId === 'all' ? null : parsed.data.routeId,
    type: parsed.data.type,
    message: parsed.data.message,
    status: 'active',
    created_by: req.user._id,
    created_at: new Date().toISOString()
  };
  await transportUpdates.insertOne(update);
  await recordAudit(req.user._id, 'transport_update.create', 'transport_update', update._id);
  const { created_by, ...fields } = update;
  const routeName = campusTransportRoutes.find((route) => route.id === update.route_id)?.name || 'All routes';
  res.status(201).json({ ...toApiDocument(fields), route_name: routeName });
});
app.patch('/api/transport/updates/:id', requireUser, requireRoles('coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({ status: z.literal('resolved') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose resolved to close this transport notice.' });
  const update = await transportUpdates.findOne({ _id: req.params.id, status: 'active' });
  if (!update) return res.status(404).json({ error: 'Active transport update not found.' });
  const result = await transportUpdates.updateOne({ _id: update._id, status: 'active' }, {
    $set: { status: 'resolved', resolved_by: req.user._id, resolved_at: new Date().toISOString() }
  });
  if (!result.matchedCount) return res.status(409).json({ error: 'This transport update was already resolved.' });
  await recordAudit(req.user._id, 'transport_update.resolve', 'transport_update', update._id);
  res.json({ id: update._id, status: 'resolved' });
});
app.post('/api/course-reviews', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({
    courseId: z.string().trim().min(1).max(100),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(10).max(1000)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a 1–5 star rating and enter a comment between 10 and 1,000 characters.' });
  const course = await courses.findOne({ _id: parsed.data.courseId });
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  const now = new Date().toISOString();
  await courseReviews.updateOne(
    { course_id: course._id, user_id: req.user._id },
    { $set: { rating: parsed.data.rating, comment: parsed.data.comment, updated_at: now }, $setOnInsert: { _id: `course-review-${crypto.randomUUID()}`, created_at: now } },
    { upsert: true }
  );
  const review = await courseReviews.findOne({ course_id: course._id, user_id: req.user._id });
  await recordAudit(req.user._id, 'course_review.save', 'course', course._id);
  res.status(200).json({ id: review._id, rating: review.rating, comment: review.comment, updated_at: review.updated_at });
});
app.get('/api/room-bookings', requireUser, async (req, res) => {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
  if (!parsed.success || !isCalendarDate(parsed.data?.date || '')) {
    return res.status(400).json({ error: 'Choose a valid date to view room availability.' });
  }
  const bookings = await roomBookings.find({ date: parsed.data.date, status: 'booked' }).sort({ slot: 1 }).limit(100).toArray();
  res.json(bookings.map((booking) => {
    const { user_id, ...fields } = booking;
    return { ...toApiDocument(fields), created_by_me: user_id === req.user._id };
  }));
});
app.post('/api/room-bookings', requireUser, async (req, res) => {
  const parsed = z.object({
    roomId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: z.string().regex(/^(0[8-9]|1[0-9]):00$/),
    purpose: z.string().trim().min(3).max(120)
  }).safeParse(req.body);
  if (!parsed.success || !isCalendarDate(parsed.data?.date || '')) {
    return res.status(400).json({ error: 'Choose a room, a valid date and hourly slot, and enter a short purpose.' });
  }
  const room = bookableRooms.find((item) => item.id === parsed.data.roomId);
  if (!room) return res.status(400).json({ error: 'Choose a valid campus room or lab.' });
  const campusStart = new Date(`${parsed.data.date}T${parsed.data.slot}:00+05:30`);
  const campusEnd = new Date(campusStart.getTime() + 60 * 60 * 1000);
  const campusToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const maxDate = new Date(`${campusToday}T00:00:00.000Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 30);
  const requestedDay = new Date(`${parsed.data.date}T12:00:00.000Z`);
  if (requestedDay.getUTCDay() === 0 || campusStart <= new Date() || parsed.data.date > maxDate.toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Bookings must be for a future Monday–Saturday slot within the next 30 days.' });
  }
  const booking = {
    _id: `room-${crypto.randomUUID()}`,
    room_id: room.id,
    room_name: room.name,
    date: parsed.data.date,
    slot: parsed.data.slot,
    ends_slot: `${String(Number(parsed.data.slot.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    starts_at: campusStart.toISOString(),
    ends_at: campusEnd.toISOString(),
    purpose: parsed.data.purpose,
    user_id: req.user._id,
    status: 'booked',
    created_at: new Date().toISOString()
  };
  try {
    await roomBookings.insertOne(booking);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That room and time slot was just booked. Choose another available slot.' });
    throw error;
  }
  await recordAudit(req.user._id, 'room_booking.create', 'room_booking', booking._id);
  const { user_id, ...fields } = booking;
  res.status(201).json({ ...toApiDocument(fields), created_by_me: true });
});
app.delete('/api/room-bookings/:id', requireUser, async (req, res) => {
  const booking = await roomBookings.findOne({ _id: req.params.id, status: 'booked' });
  if (!booking) return res.status(404).json({ error: 'Active room booking not found.' });
  if (booking.user_id !== req.user._id && !['coordinator', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only the person who booked this room or campus staff can cancel it.' });
  }
  const cancelled = await roomBookings.updateOne({ _id: booking._id, status: 'booked' }, {
    $set: { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: req.user._id }
  });
  if (!cancelled.matchedCount) return res.status(409).json({ error: 'This booking was already cancelled.' });
  await recordAudit(req.user._id, 'room_booking.cancel', 'room_booking', booking._id);
  res.json({ ok: true });
});
app.get('/api/library-seat-bookings', requireUser, async (req, res) => {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
  if (!parsed.success || !isCalendarDate(parsed.data?.date || '')) {
    return res.status(400).json({ error: 'Choose a valid date to view library seat availability.' });
  }
  const bookings = await librarySeatBookings.find({ date: parsed.data.date, status: 'booked' }).sort({ slot: 1 }).limit(100).toArray();
  res.json(bookings.map((booking) => {
    const { user_id, ...fields } = booking;
    return { ...toApiDocument(fields), created_by_me: user_id === req.user._id };
  }));
});
app.post('/api/library-seat-bookings', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({
    seatId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: z.string().regex(/^(0[8-9]|1[0-9]):00$/)
  }).safeParse(req.body);
  if (!parsed.success || !isCalendarDate(parsed.data?.date || '')) {
    return res.status(400).json({ error: 'Choose a valid library seat, date, and hourly slot.' });
  }
  const seat = bookableLibrarySeats.find((item) => item.id === parsed.data.seatId);
  if (!seat) return res.status(400).json({ error: 'Choose a valid library seat.' });
  const campusStart = new Date(`${parsed.data.date}T${parsed.data.slot}:00+05:30`);
  const campusEnd = new Date(campusStart.getTime() + 60 * 60 * 1000);
  const campusToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const maxDate = new Date(`${campusToday}T00:00:00.000Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 30);
  const requestedDay = new Date(`${parsed.data.date}T12:00:00.000Z`);
  if (requestedDay.getUTCDay() === 0 || campusStart <= new Date() || parsed.data.date > maxDate.toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Bookings must be for a future Monday–Saturday slot within the next 30 days.' });
  }
  const booking = {
    _id: `library-seat-${crypto.randomUUID()}`,
    seat_id: seat.id,
    seat_name: seat.name,
    date: parsed.data.date,
    slot: parsed.data.slot,
    ends_slot: `${String(Number(parsed.data.slot.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    starts_at: campusStart.toISOString(),
    ends_at: campusEnd.toISOString(),
    user_id: req.user._id,
    status: 'booked',
    created_at: new Date().toISOString()
  };
  try {
    await librarySeatBookings.insertOne(booking);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That library seat was just booked. Choose another available seat or time.' });
    throw error;
  }
  await recordAudit(req.user._id, 'library_seat_booking.create', 'library_seat_booking', booking._id);
  const { user_id, ...fields } = booking;
  res.status(201).json({ ...toApiDocument(fields), created_by_me: true });
});
app.delete('/api/library-seat-bookings/:id', requireUser, async (req, res) => {
  const booking = await librarySeatBookings.findOne({ _id: req.params.id, status: 'booked' });
  if (!booking) return res.status(404).json({ error: 'Active library seat booking not found.' });
  if (booking.user_id !== req.user._id && !['coordinator', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only the person who booked this seat or campus staff can cancel it.' });
  }
  const cancelled = await librarySeatBookings.updateOne({ _id: booking._id, status: 'booked' }, {
    $set: { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: req.user._id }
  });
  if (!cancelled.matchedCount) return res.status(409).json({ error: 'This library seat booking was already cancelled.' });
  await recordAudit(req.user._id, 'library_seat_booking.cancel', 'library_seat_booking', booking._id);
  res.json({ ok: true });
});
app.get('/api/student-directory', requireUser, requireRoles('student'), async (req, res) => {
  const students = await users.find(
    { role: 'student', student_directory_visible: true, _id: { $ne: req.user._id } },
    { projection: { name: 1, cohort: 1, avatar: 1 } }
  ).sort({ name: 1 }).limit(200).toArray();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    visible: req.user.student_directory_visible === true,
    students: students.map((student) => ({
      id: String(student._id),
      name: student.name,
      cohort: student.cohort || 'Campus student',
      avatar: student.avatar || ''
    }))
  });
});
app.patch('/api/student-directory/visibility', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({ visible: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose whether your student directory profile should be visible.' });
  await users.updateOne({ _id: req.user._id, role: 'student' }, { $set: { student_directory_visible: parsed.data.visible } });
  await recordAudit(req.user._id, parsed.data.visible ? 'student_directory.opt_in' : 'student_directory.opt_out', 'student_profile', req.user._id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ visible: parsed.data.visible });
});
app.get('/api/club-memberships', requireUser, async (req, res) => {
  if (!['student', 'coordinator', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to review club membership applications.' });
  const filter = req.user.role === 'student' ? { applicant_id: req.user._id } : {};
  const applications = await clubMembershipRequests.find(filter).sort({ created_at: -1 }).limit(200).toArray();
  const applicantIds = [...new Set(applications.map((application) => application.applicant_id))];
  const applicants = req.user.role === 'student' ? [] : await users.find({ _id: { $in: applicantIds } }, { projection: { name: 1 } }).toArray();
  const applicantNames = new Map(applicants.map((applicant) => [applicant._id, applicant.name]));
  res.json(applications.map((application) => {
    const { applicant_id, reviewed_by, ...fields } = application;
    return {
      ...toApiDocument(fields),
      ...(req.user.role === 'student' ? {} : { applicant_name: applicantNames.get(applicant_id) || 'Student', applicant_id })
    };
  }));
});
app.post('/api/clubs/:clubId/membership', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({ motivation: z.string().trim().min(10).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Explain why you would like to join in 10 to 500 characters.' });
  const club = campusClubs.find((item) => item.id === req.params.clubId);
  if (!club) return res.status(404).json({ error: 'Campus club not found.' });
  const existing = await clubMembershipRequests.findOne({ club_id: club.id, applicant_id: req.user._id });
  if (existing && existing.status !== 'declined') return res.status(409).json({ error: `Your application is already ${existing.status}.` });
  const now = new Date().toISOString();
  if (existing) {
    await clubMembershipRequests.updateOne({ _id: existing._id, status: 'declined' }, {
      $set: { motivation: parsed.data.motivation, status: 'pending', created_at: now, updated_at: now },
      $unset: { reviewed_by: '', reviewed_at: '' }
    });
  } else {
    try {
      await clubMembershipRequests.insertOne({
        _id: `club-application-${crypto.randomUUID()}`,
        club_id: club.id,
        club_name: club.name,
        applicant_id: req.user._id,
        motivation: parsed.data.motivation,
        status: 'pending',
        created_at: now,
        updated_at: now
      });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: 'You already have an application for this club.' });
      throw error;
    }
  }
  const application = await clubMembershipRequests.findOne({ club_id: club.id, applicant_id: req.user._id });
  await recordAudit(req.user._id, 'club_membership.apply', 'club_membership_request', application._id);
  const { applicant_id, ...fields } = application;
  res.status(201).json(toApiDocument(fields));
});
app.patch('/api/club-memberships/:id', requireUser, requireRoles('coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({ status: z.enum(['approved', 'declined']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose approved or declined for this application.' });
  const application = await clubMembershipRequests.findOne({ _id: req.params.id });
  if (!application) return res.status(404).json({ error: 'Club membership application not found.' });
  if (application.status !== 'pending') return res.status(409).json({ error: 'This application has already been reviewed.' });
  const now = new Date().toISOString();
  const update = await clubMembershipRequests.updateOne({ _id: application._id, status: 'pending' }, {
    $set: { status: parsed.data.status, reviewed_by: req.user._id, reviewed_at: now, updated_at: now }
  });
  if (!update.matchedCount) return res.status(409).json({ error: 'This application has already been reviewed.' });
  const updated = await clubMembershipRequests.findOne({ _id: application._id });
  await createNotification(application.applicant_id, 'club_membership', 'Club application updated', `Your application to join ${application.club_name} was ${parsed.data.status}.`, application._id);
  await recordAudit(req.user._id, `club_membership.${parsed.data.status}`, 'club_membership_request', application._id);
  const applicant = await users.findOne({ _id: application.applicant_id }, { projection: { name: 1 } });
  const { applicant_id, ...fields } = updated;
  res.json({ ...toApiDocument(fields), applicant_name: applicant?.name || 'Student', applicant_id });
});
app.get('/api/events', requireUser, async (req, res) => {
  const rows = await events.find({}).sort({ starts_at: 1 }).toArray();
  res.json(rows.map((event) => {
    const { attendee_ids = [], reminder_user_ids, ...fields } = event;
    return {
      ...toApiDocument(fields),
      attendance_count: attendee_ids.length,
      is_attending: attendee_ids.includes(req.user._id)
    };
  }));
});
app.post('/api/events', requireUser, requireRoles('trainer', 'coordinator', 'admin'), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).default(''),
    location: z.string().trim().min(2).max(120),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime()
  }).safeParse(req.body);
  const startsAt = parsed.success ? new Date(parsed.data.startsAt) : null;
  const endsAt = parsed.success ? new Date(parsed.data.endsAt) : null;
  if (!parsed.success || !startsAt || !endsAt || startsAt <= new Date() || endsAt <= startsAt) {
    return res.status(400).json({ error: 'Enter an event name, location, a future start time, and an end time after it starts.' });
  }
  const event = {
    _id: `evt-${crypto.randomUUID()}`,
    title: parsed.data.title,
    description: parsed.data.description,
    location: parsed.data.location,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    attendee_ids: [],
    reminder_user_ids: [],
    created_by: req.user._id,
    created_at: new Date().toISOString()
  };
  await events.insertOne(event);
  await recordAudit(req.user._id, 'event.create', 'event', event._id);
  const { attendee_ids, reminder_user_ids, ...publicEvent } = event;
  res.status(201).json({ ...toApiDocument(publicEvent), attendance_count: 0, is_attending: false });
});
app.post('/api/events/:id/rsvp', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({ attending: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose whether you are attending this event.' });
  const event = await events.findOne({ _id: req.params.id });
  if (!event) return res.status(404).json({ error: 'Campus event not found.' });
  if (new Date(event.ends_at) <= new Date()) return res.status(400).json({ error: 'RSVP is closed because this event has ended.' });
  await events.updateOne(
    { _id: event._id },
    parsed.data.attending
      ? { $addToSet: { attendee_ids: req.user._id } }
      : { $pull: { attendee_ids: req.user._id } }
  );
  const updated = await events.findOne({ _id: event._id });
  await recordAudit(req.user._id, parsed.data.attending ? 'event.rsvp' : 'event.cancel_rsvp', 'event', event._id);
  const { attendee_ids = [], reminder_user_ids, ...fields } = updated;
  res.json({
    ...toApiDocument(fields),
    attendance_count: attendee_ids.length,
    is_attending: attendee_ids.includes(req.user._id)
  });
});
app.get('/api/lost-found', requireUser, async (req, res) => {
  const reports = await lostFoundItems.find({}).sort({ created_at: -1 }).limit(200).toArray();
  res.json(reports.map((report) => {
    const { reporter_id, ...fields } = report;
    return { ...toApiDocument(fields), created_by_me: reporter_id === req.user._id };
  }));
});
app.post('/api/lost-found', requireUser, async (req, res) => {
  const parsed = z.object({
    itemType: z.enum(['lost', 'found']),
    title: z.string().trim().min(2).max(100),
    category: z.string().trim().min(2).max(50),
    description: z.string().trim().min(5).max(1000),
    location: z.string().trim().min(2).max(120),
    reportedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).safeParse(req.body);
  if (!parsed.success || !isCalendarDate(parsed.data?.reportedOn || '') || parsed.data.reportedOn > new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Enter valid item details, a location, and a date no later than today.' });
  }
  const report = {
    _id: `lf-${crypto.randomUUID()}`,
    item_type: parsed.data.itemType,
    title: parsed.data.title,
    category: parsed.data.category,
    description: parsed.data.description,
    location: parsed.data.location,
    reported_on: parsed.data.reportedOn,
    status: 'open',
    reporter_id: req.user._id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await lostFoundItems.insertOne(report);
  await recordAudit(req.user._id, 'lost_found.create', 'lost_found_item', report._id);
  const { reporter_id, ...publicReport } = report;
  res.status(201).json({ ...toApiDocument(publicReport), created_by_me: true });
});
app.patch('/api/lost-found/:id/status', requireUser, async (req, res) => {
  const parsed = z.object({ status: z.enum(['open', 'resolved']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid Lost & Found report status.' });
  const report = await lostFoundItems.findOne({ _id: req.params.id });
  if (!report) return res.status(404).json({ error: 'Lost & Found report not found.' });
  if (report.reporter_id !== req.user._id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the person who posted this report or an administrator can change its status.' });
  }
  await lostFoundItems.updateOne({ _id: report._id }, { $set: { status: parsed.data.status, updated_at: new Date().toISOString() } });
  await recordAudit(req.user._id, `lost_found.${parsed.data.status}`, 'lost_found_item', report._id);
  const updated = await lostFoundItems.findOne({ _id: report._id });
  const { reporter_id, ...publicReport } = updated;
  res.json({ ...toApiDocument(publicReport), created_by_me: reporter_id === req.user._id });
});
app.get('/api/marketplace', requireUser, async (req, res) => {
  const listings = await marketplaceListings.find({}).sort({ created_at: -1 }).limit(200).toArray();
  res.json(listings.map((listing) => {
    const { seller_id, ...fields } = listing;
    return { ...toApiDocument(fields), created_by_me: seller_id === req.user._id };
  }));
});
app.post('/api/marketplace', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(2).max(100),
    category: z.string().trim().min(2).max(50),
    description: z.string().trim().min(5).max(1000),
    price: z.number().int().min(1).max(10_000_000),
    condition: z.enum(['new', 'like_new', 'good', 'fair']),
    location: z.string().trim().min(2).max(120)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter valid item details, a price in INR, condition, and pickup location.' });
  const listing = {
    _id: `market-${crypto.randomUUID()}`,
    ...parsed.data,
    status: 'available',
    seller_id: req.user._id,
    seller_name: req.user.name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await marketplaceListings.insertOne(listing);
  await recordAudit(req.user._id, 'marketplace.create', 'marketplace_listing', listing._id);
  const { seller_id, ...publicListing } = listing;
  res.status(201).json({ ...toApiDocument(publicListing), created_by_me: true });
});
app.patch('/api/marketplace/:id/status', requireUser, async (req, res) => {
  const parsed = z.object({ status: z.enum(['available', 'sold']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid marketplace listing status.' });
  const listing = await marketplaceListings.findOne({ _id: req.params.id });
  if (!listing) return res.status(404).json({ error: 'Marketplace listing not found.' });
  if (listing.seller_id !== req.user._id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the seller or an administrator can change this listing status.' });
  }
  await marketplaceListings.updateOne({ _id: listing._id }, { $set: { status: parsed.data.status, updated_at: new Date().toISOString() } });
  await recordAudit(req.user._id, `marketplace.${parsed.data.status}`, 'marketplace_listing', listing._id);
  const updated = await marketplaceListings.findOne({ _id: listing._id });
  const { seller_id, ...publicListing } = updated;
  res.json({ ...toApiDocument(publicListing), created_by_me: seller_id === req.user._id });
});
app.get('/api/study-groups', requireUser, async (req, res) => {
  const groups = await studyGroups.find({}).sort({ created_at: -1 }).limit(200).toArray();
  res.json(groups.map((group) => {
    const { member_ids = [], creator_id, ...fields } = group;
    return {
      ...toApiDocument(fields),
      member_count: member_ids.length,
      is_member: member_ids.includes(req.user._id),
      created_by_me: creator_id === req.user._id
    };
  }));
});
app.post('/api/study-groups', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(3).max(80),
    subject: z.string().trim().min(2).max(80),
    description: z.string().trim().min(5).max(500)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a group name, subject, and description within the stated limits.' });
  const group = {
    _id: `study-${crypto.randomUUID()}`,
    ...parsed.data,
    creator_id: req.user._id,
    member_ids: [req.user._id],
    created_at: new Date().toISOString()
  };
  await studyGroups.insertOne(group);
  await recordAudit(req.user._id, 'study_group.create', 'study_group', group._id);
  const { creator_id, member_ids, ...publicGroup } = group;
  res.status(201).json({ ...toApiDocument(publicGroup), member_count: 1, is_member: true, created_by_me: true });
});
app.post('/api/study-groups/:id/members', requireUser, requireRoles('student'), async (req, res) => {
  const group = await studyGroups.findOne({ _id: req.params.id });
  if (!group) return res.status(404).json({ error: 'Study group not found.' });
  await studyGroups.updateOne({ _id: group._id }, { $addToSet: { member_ids: req.user._id } });
  const updated = await studyGroups.findOne({ _id: group._id });
  await recordAudit(req.user._id, 'study_group.join', 'study_group', group._id);
  const { creator_id, member_ids = [], ...publicGroup } = updated;
  res.json({
    ...toApiDocument(publicGroup),
    member_count: member_ids.length,
    is_member: member_ids.includes(req.user._id),
    created_by_me: creator_id === req.user._id
  });
});
app.get('/api/study-groups/:id/messages', requireUser, requireRoles('student'), async (req, res) => {
  const group = await studyGroups.findOne({ _id: req.params.id }, { projection: { member_ids: 1 } });
  if (!group) return res.status(404).json({ error: 'Study group not found.' });
  if (!group.member_ids?.includes(req.user._id)) return res.status(403).json({ error: 'Join this study group to view its discussion.' });
  const messages = await studyGroupMessages.find({ group_id: group._id }).sort({ created_at: 1 }).limit(100).toArray();
  const authorIds = [...new Set(messages.map((entry) => entry.author_id))];
  const authors = await users.find({ _id: { $in: authorIds } }, { projection: { name: 1 } }).toArray();
  const authorNames = new Map(authors.map((author) => [author._id, author.name]));
  res.json(messages.map((entry) => {
    const { author_id, ...fields } = entry;
    return {
      ...toApiDocument(fields),
      author_name: authorNames.get(author_id) || 'Student',
      from_me: author_id === req.user._id
    };
  }));
});
app.post('/api/study-groups/:id/messages', requireUser, requireRoles('student'), async (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Write a message of up to 2,000 characters.' });
  const group = await studyGroups.findOne({ _id: req.params.id }, { projection: { _id: 1, member_ids: 1 } });
  if (!group) return res.status(404).json({ error: 'Study group not found.' });
  if (!group.member_ids?.includes(req.user._id)) return res.status(403).json({ error: 'Join this study group before posting a message.' });
  const entry = {
    _id: `study-message-${crypto.randomUUID()}`,
    group_id: group._id,
    author_id: req.user._id,
    message: parsed.data.message,
    created_at: new Date().toISOString()
  };
  await studyGroupMessages.insertOne(entry);
  await recordAudit(req.user._id, 'study_group.message', 'study_group', group._id);
  const { author_id, ...publicMessage } = entry;
  res.status(201).json({ ...toApiDocument(publicMessage), author_name: req.user.name, from_me: true });
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
app.post('/api/profile-change-requests', requireUser, async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(100),
    cohort: z.string().trim().min(2).max(100)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name and cohort.' });
  const pending = await profileChangeRequests.findOne({ user_id: req.user._id, status: 'pending' });
  if (pending) return res.status(409).json({ error: 'A profile change request is already waiting for administrator approval.' });
  const request = {
    _id: `profile-change-${crypto.randomUUID()}`,
    user_id: req.user._id,
    user_name: req.user.name,
    user_role: req.user.role,
    current: { name: req.user.name, cohort: req.user.cohort },
    requested: parsed.data,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  await profileChangeRequests.insertOne(request);
  const admins = await users.find({ role: 'admin' }, { projection: { _id: 1 } }).toArray();
  await Promise.all(admins.map((admin) => createNotification(
    admin._id,
    'profile_change_request',
    'Profile change request',
    `${req.user.name} requested profile changes.`,
    request._id,
    `profile-change-request:${request._id}`
  )));
  await recordAudit(req.user._id, 'profile_change.request', 'profile_change_request', request._id);
  res.status(201).json(toApiDocument(request));
});
app.get('/api/profile-change-requests', requireUser, requireRoles('admin'), async (_req, res) => {
  const rows = await profileChangeRequests.find().sort({ created_at: -1 }).limit(100).toArray();
  res.json(rows.map(toApiDocument));
});
app.patch('/api/profile-change-requests/:id', requireUser, requireRoles('admin'), async (req, res) => {
  const parsed = z.object({ status: z.enum(['approved', 'rejected']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose approve or reject.' });
  const request = await profileChangeRequests.findOne({ _id: req.params.id, status: 'pending' });
  if (!request) return res.status(404).json({ error: 'Pending profile change request not found.' });
  const now = new Date().toISOString();
  const claimed = await profileChangeRequests.updateOne(
    { _id: request._id, status: 'pending' },
    { $set: { status: parsed.data.status, reviewed_by: req.user._id, reviewed_at: now } }
  );
  if (!claimed.modifiedCount) return res.status(409).json({ error: 'This profile change request has already been reviewed.' });
  if (parsed.data.status === 'approved') {
    await users.updateOne(
      { _id: request.user_id },
      { $set: { name: request.requested.name, cohort: request.requested.cohort, avatar: request.requested.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() } }
    );
  }
  await createNotification(request.user_id, 'profile_change_request', 'Profile change request reviewed', `Your profile change request was ${parsed.data.status}.`, request._id);
  await recordAudit(req.user._id, `profile_change.${parsed.data.status}`, 'profile_change_request', request._id);
  res.json({ id: request._id, status: parsed.data.status });
});
app.post('/api/admin/demo-data', requireUser, requireRoles('admin'), async (req, res) => {
  const result = await provisionDemoData(db, req.user._id);
  if (!result.alreadyPresent) await recordAudit(req.user._id, 'demo.dataset.import', 'demo_dataset', 'campus-demo-v1');
  res.json({ ok: true, ...result });
});
app.post('/api/student-registration-requests', async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(100),
    password: z.string().min(12).max(200),
    cohort: z.string().trim().min(2).max(100).default('Cohort 08')
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your name and a password between 12 and 200 characters.' });
  const zinId = await createZinId(parsed.data.name);
  const email = `${zinId.toLowerCase()}@zyngram.com`;
  if (await users.findOne({ email })) return res.status(409).json({ error: 'An account already uses this ZIN ID. Please submit again.' });
  const now = new Date().toISOString();
  const { password, ...registrationFields } = parsed.data;
  const request = {
    _id: `registration-${crypto.randomUUID()}`,
    ...registrationFields,
    password_hash: createPasswordHash(password),
    zin_id: zinId,
    email,
    status: 'pending',
    created_at: now
  };
  try {
    await studentRegistrationRequests.insertOne(request);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'A registration request for this email is already awaiting review.' });
    throw error;
  }
  await recordAudit('system:public-registration', 'student_registration.request', 'student_registration_request', request._id);
  let notification;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  if (!adminEmail || !invitationMailConfigured()) {
    notification = { sent: false, message: 'Your request is saved, but administrator email notifications are not configured.' };
  } else {
    try {
      await sendStudentRegistrationNotification({ adminEmail, name: request.name, email, cohort: request.cohort, requestId: request._id });
      notification = { sent: true };
    } catch (error) {
      console.error('Student registration notification failed:', error);
      notification = { sent: false, message: 'Your request is saved, but the administrator email could not be delivered.' };
    }
  }
  res.status(201).json({ ok: true, requestId: request._id, zinId, email, notification });
});
app.get('/api/student-registration-requests', requireUser, requireRoles('admin'), async (_req, res) => {
  const requests = await studentRegistrationRequests.find({}, { projection: { password_hash: 0 } }).sort({ created_at: -1 }).toArray();
  res.json(requests.map(toApiDocument));
});
app.patch('/api/student-registration-requests/:id', requireUser, requireRoles('admin'), async (req, res) => {
  const parsed = z.object({ status: z.enum(['approved', 'rejected']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose approve or reject for this registration request.' });
  const registration = await studentRegistrationRequests.findOne({ _id: req.params.id, status: 'pending' });
  if (!registration) return res.status(404).json({ error: 'Pending registration request not found.' });
  const reviewedAt = new Date().toISOString();
  if (parsed.data.status === 'rejected') {
    const result = await studentRegistrationRequests.updateOne(
      { _id: registration._id, status: 'pending' },
      { $set: { status: 'rejected', reviewed_at: reviewedAt, reviewed_by: req.user._id } }
    );
    if (!result.modifiedCount) return res.status(409).json({ error: 'This registration request has already been reviewed.' });
    await recordAudit(req.user._id, 'student_registration.reject', 'student_registration_request', registration._id);
    return res.json({ id: registration._id, status: 'rejected' });
  }
  const person = {
    _id: `u-${crypto.randomUUID()}`,
    name: registration.name,
    email: registration.email,
    role: 'student',
    cohort: registration.cohort,
    avatar: registration.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    ...(registration.password_hash ? { password_hash: registration.password_hash } : { password_hash: null }),
    ...(registration.zin_id ? { zin_id: registration.zin_id } : {}),
    created_at: reviewedAt
  };
  const claimed = await studentRegistrationRequests.updateOne(
    { _id: registration._id, status: 'pending' },
    { $set: { status: 'approved', reviewed_at: reviewedAt, reviewed_by: req.user._id, user_id: person._id } }
  );
  if (!claimed.modifiedCount) return res.status(409).json({ error: 'This registration request has already been reviewed.' });
  try {
    await users.insertOne(person);
  } catch (error) {
    await studentRegistrationRequests.updateOne(
      { _id: registration._id, status: 'approved', reviewed_by: req.user._id },
      { $set: { status: 'pending' }, $unset: { reviewed_at: '', reviewed_by: '', user_id: '' } }
    );
    if (error.code === 11000) return res.status(409).json({ error: 'An account already uses this email address.' });
    throw error;
  }
  await recordAudit(req.user._id, 'student_registration.approve', 'student_registration_request', registration._id);
  res.json({ id: registration._id, status: 'approved', credentials_ready: Boolean(registration.password_hash), user: publicUser(person) });
});
app.get('/api/users', requireUser, requireRoles('admin'), async (_req, res) => {
  const allUsers = await users.find({}, { projection: { name: 1, email: 1, role: 1, cohort: 1, avatar: 1, zin_id: 1, created_at: 1, password_hash: 1 } }).sort({ role: 1, name: 1 }).toArray();
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
  const mailConfigured = invitationMailConfigured();
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
    if (mailConfigured) await sendInvitationEmail({ email: person.email, name: person.name, invitationUrl: url });
  } catch (error) {
    console.error('Invitation delivery failed:', error);
    await recordAudit(req.user._id, 'user.invite.manual', 'user', person._id, { email_delivery_failed: true });
    return res.json({
      ok: true,
      expires_at: expiresAt.toISOString(),
      manual_invitation_url: url,
      email_delivery_failed: true
    });
  }
  await recordAudit(req.user._id, mailConfigured ? 'user.invite' : 'user.invite.manual', 'user', person._id);
  res.json({
    ok: true,
    expires_at: expiresAt.toISOString(),
    ...(mailConfigured ? {} : production ? { manual_invitation_url: url } : { development_invitation_url: url })
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
  runUpcomingEventReminders().catch((error) => console.error('Event reminder job failed:', error));
  const eventReminderTimer = setInterval(() => runUpcomingEventReminders().catch((error) => console.error('Event reminder job failed:', error)), 15 * 60 * 1000);
  eventReminderTimer.unref();
  app.listen(port, () => console.log(`Campus Hub API listening on http://localhost:${port}`));
}

export { app, client, db };
