  import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/';
const databaseName = process.env.MONGODB_DATABASE || 'zyngram_campus_hub';
const production = process.env.NODE_ENV === 'production';
export const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

const sampleUsers = [
  { _id: 'u-student', name: 'Aarav Reddy', email: 'aarav.demo@example.test', role: 'student', cohort: 'Cohort 08 · Career pathways', avatar: 'AR', password_hash: null },
  { _id: 'u-trainer', name: 'Priya Nair', email: 'priya.demo@example.test', role: 'trainer', cohort: 'Design faculty', avatar: 'PN', password_hash: null },
  { _id: 'u-trainer-arjun', name: 'Arjun Rao', email: 'arjun.trainer@example.test', role: 'trainer', cohort: 'Design faculty', avatar: 'AR', password_hash: null },
  { _id: 'u-trainer-neha', name: 'Neha Varma', email: 'neha.trainer@example.test', role: 'trainer', cohort: 'Design faculty', avatar: 'NV', password_hash: null },
  { _id: 'u-coordinator', name: 'Kiran Das', email: 'kiran.demo@example.test', role: 'coordinator', cohort: 'Hyderabad campus', avatar: 'KD', password_hash: null },
  { _id: 'u-admin', name: 'Admin', email: 'campushub@zyngram.com', role: 'admin', cohort: 'Campus operations', avatar: 'AD', password_hash: null }
];
const sampleCourses = [
  { _id: 'c-product', title: 'Full Stack Web Development', track: 'Software Development', trainer_id: 'u-trainer', duration: '16 weeks', progress: 72, next_session: 'Today · 2:30 PM', color: 'lilac' },
  { _id: 'c-ui', title: 'Digital Marketing', track: 'Marketing & Growth', trainer_id: 'u-trainer-arjun', duration: '10 weeks', progress: 48, next_session: 'Tomorrow · 11:00 AM', color: 'peach' },
  { _id: 'c-portfolio', title: 'Finance Fundamentals', track: 'Finance & Accounting', trainer_id: 'u-trainer-neha', duration: '12 weeks', progress: 86, next_session: 'Fri, Oct 16 · 3:00 PM', color: 'mint' }
];
const liveCourseStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
const sampleLiveCourses = [
  { _id: 'live-react-studio', title: 'React Product Build Studio', category: 'Web engineering', description: 'Build a polished product interface in a trainer-led weekly studio, from component planning through a working release.', level: 'Intermediate', duration: '4 weeks', starts_at: liveCourseStart.toISOString(), ends_at: new Date(liveCourseStart.getTime() + 90 * 60 * 1000).toISOString(), trainer_id: 'u-trainer', capacity: 30, enrolled_count: 8, status: 'published', meeting_url: null, created_at: new Date().toISOString() },
  { _id: 'live-data-storytelling', title: 'Data Storytelling Workshop', category: 'Data & analytics', description: 'Turn a small dataset into a clear narrative with practical chart critique and a guided presentation.', level: 'Beginner friendly', duration: '2 weeks', starts_at: new Date(liveCourseStart.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(), ends_at: new Date(liveCourseStart.getTime() + 2 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(), trainer_id: 'u-trainer-arjun', capacity: 24, enrolled_count: 11, status: 'published', meeting_url: null, created_at: new Date().toISOString() },
  { _id: 'live-interview-lab', title: 'Technical Interview Practice Lab', category: 'Career preparation', description: 'Work through timed problem-solving rounds and receive structured feedback from a campus trainer.', level: 'Intermediate', duration: '3 weeks', starts_at: new Date(liveCourseStart.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(), ends_at: new Date(liveCourseStart.getTime() + 4 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(), trainer_id: 'u-trainer-neha', capacity: 20, enrolled_count: 6, status: 'published', meeting_url: null, created_at: new Date().toISOString() }
];
const sampleTasks = [
  { _id: 't-research', learner_id: 'u-student', title: 'Build a responsive course landing page', course_id: 'c-product', due_date: '2026-10-16', status: 'todo', description: 'Create a responsive landing page with a reusable component and a working form.', submission_url: null, feedback: null, updated_at: new Date().toISOString() },
  { _id: 't-wireframes', learner_id: 'u-student', title: 'Plan a digital campaign', course_id: 'c-ui', due_date: '2026-10-14', status: 'in_review', description: 'Define a target audience, campaign message, and channel mix for a sample product.', submission_url: 'https://example.test/aarav-campaign', feedback: null, updated_at: new Date().toISOString() },
  { _id: 't-reflection', learner_id: 'u-student', title: 'Prepare a monthly budget', course_id: 'c-portfolio', due_date: '2026-10-12', status: 'complete', description: 'Build a sample monthly budget and explain the saving choices you made.', submission_url: 'https://example.test/aarav-budget', feedback: 'Your budget is clear and well organised. Add a short note about how you would adjust it for an unexpected expense.', updated_at: new Date().toISOString() }
];
const sampleAttendance = [
  ['c-product', '2026-10-12', 'present'], ['c-product', '2026-10-09', 'present'], ['c-product', '2026-10-07', 'present'],
  ['c-ui', '2026-10-13', 'present'], ['c-ui', '2026-10-10', 'late'], ['c-portfolio', '2026-10-08', 'present']
].map(([course_id, session_date, status], i) => ({ _id: `att-${i + 1}`, user_id: 'u-student', course_id, session_date, status }));
const sampleAnnouncements = [
  { _id: 'a-showcase', title: 'Career pathways showcase · registrations are open', body: 'Present a project from your learning pathway. Registration closes Thursday at 5 PM.', audience: 'All learners', published_at: '2026-10-13', category: 'Campus event' },
  { _id: 'a-office', title: 'Trainer office hours this week', body: 'Join a trainer for course questions and feedback on Friday at 3 PM in Studio B.', audience: 'Cohort 08', published_at: '2026-10-12', category: 'Learning' },
  { _id: 'a-network', title: 'Introducing the Zyngram alumni circle', body: 'Meet peers and alumni building thoughtful products across India.', audience: 'All learners', published_at: '2026-10-10', category: 'Community' }
];

export const databasePromise = client.connect().then(async () => {
  const database = client.db(databaseName);
  await Promise.all([
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
    database.collection('attendance').createIndex({ user_id: 1, course_id: 1, session_date: 1 }, { unique: true }),
    database.collection('tasks').createIndex({ learner_id: 1, due_date: 1 }),
    database.collection('tasks').createIndex({ course_id: 1, learner_id: 1 }),
    database.collection('lessons').createIndex({ course_id: 1, week_number: 1, position: 1 }),
    database.collection('lesson_files').createIndex({ lesson_id: 1, created_at: 1 }),
    database.collection('lesson_progress').createIndex({ learner_id: 1, lesson_id: 1 }, { unique: true }),
    database.collection('class_sessions').createIndex({ course_id: 1, start_at: 1 }),
    database.collection('student_readiness').createIndex({ learner_id: 1, course_id: 1 }, { unique: true }),
    database.collection('mock_interviews').createIndex({ learner_id: 1, starts_at: 1 }),
    database.collection('exams').createIndex({ course_id: 1, week_number: 1 }, { unique: true }),
    database.collection('exam_attempts').createIndex({ exam_id: 1, learner_id: 1, attempted_at: -1 }),
    database.collection('course_certificates').createIndex({ learner_id: 1, course_id: 1 }, { unique: true }),
    database.collection('live_courses').createIndex({ status: 1, starts_at: 1 }),
    database.collection('live_course_enrollments').createIndex({ live_course_id: 1, learner_id: 1 }, { unique: true }),
    database.collection('live_course_enrollments').createIndex({ learner_id: 1, enrolled_at: -1 }),
    database.collection('learning_weeks').createIndex({ course_id: 1, week_number: 1 }, { unique: true }),
    database.collection('student_progress').createIndex({ learner_id: 1, course_id: 1 }, { unique: true }),
    database.collection('notifications').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('notifications').createIndex({ user_id: 1, dedupe_key: 1 }, { unique: true, partialFilterExpression: { dedupe_key: { $type: 'string' } } }),
    database.collection('internship_applications').createIndex({ internship_id: 1, learner_id: 1 }, { unique: true }),
    database.collection('resume_files').createIndex({ application_id: 1 }, { unique: true }),
    database.collection('app_settings').createIndex({ key: 1 }, { unique: true }),
    database.collection('support_tickets').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('support_tickets').createIndex({ status: 1, created_at: -1 }),
    database.collection('users').createIndex({ invite_token_hash: 1 }, { sparse: true }),
    database.collection('audit_log').createIndex({ created_at: -1 })
  ]);
  await Promise.all([
    database.collection('internship_applications').updateMany({ status: 'accepted' }, { $set: { status: 'selected' } }),
    database.collection('internship_applications').updateMany({ status: 'declined' }, { $set: { status: 'rejected' } })
  ]);
  const users = database.collection('users');
  if (await users.countDocuments() === 0) {
    if (production) {
      const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
      const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || password.length > 200) {
        throw new Error('A valid BOOTSTRAP_ADMIN_EMAIL and a 12–200 character BOOTSTRAP_ADMIN_PASSWORD are required for a new production database.');
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      await users.insertOne({
        _id: `u-${crypto.randomUUID()}`,
        name: 'Campus Administrator',
        email,
        role: 'admin',
        cohort: 'Campus operations',
        avatar: 'CA',
        password_hash: `scrypt$${salt}$${hash}`
      });
    } else {
      await users.insertMany(sampleUsers);
      await database.collection('courses').insertMany(sampleCourses);
      await database.collection('tasks').insertMany(sampleTasks);
      await database.collection('attendance').insertMany(sampleAttendance);
      await database.collection('announcements').insertMany(sampleAnnouncements);
    }
  }
  if (!production) {
    const liveCourseCollection = database.collection('live_courses');
    await Promise.all(sampleLiveCourses.map(({ _id, starts_at, ends_at, status, ...details }) =>
      liveCourseCollection.updateOne({ _id }, { $set: { starts_at, ends_at, status }, $setOnInsert: details }, { upsert: true })
    ));
    await database.collection('users').updateOne(
      { _id: 'u-student', cohort: 'Cohort 08 · Product Design' },
      { $set: { cohort: 'Cohort 08 · Career pathways' } }
    );
    const courseCollection = database.collection('courses');
    await Promise.all(sampleCourses.map(({ _id, title, track, duration, next_session, color }) =>
      courseCollection.updateOne(
        { _id },
        { $set: { title, track, duration, next_session, color } }
      )));
    const taskCollection = database.collection('tasks');
    await Promise.all(sampleTasks.map(({ _id, title, description, submission_url, feedback }) =>
      taskCollection.updateOne(
        { _id },
        { $set: { title, description, submission_url, feedback } }
      )));
    const announcementCollection = database.collection('announcements');
    await Promise.all(sampleAnnouncements.slice(0, 2).map(({ _id, title, body }) =>
      announcementCollection.updateOne(
        { _id },
        { $set: { title, body } }
      )));
  }
  return database;
}).catch((error) => {
  if (error?.code === 8000 && /auth/i.test(error.message ?? '')) {
    throw new Error(
      'MongoDB authentication failed. Check the MONGODB_URI configured in Render: use the Atlas database user credentials (not your Atlas website login), confirm the password, and percent-encode reserved characters in the username or password.',
      { cause: error }
    );
  }
  throw error;
});
