import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/';
process.env.MONGODB_DATABASE = `zyngram_campus_hub_test_${process.pid}`;
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.MAIL_HOST = '';
process.env.MAIL_USER = '';
process.env.MAIL_PASSWORD = '';
process.env.MAIL_FROM = '';
process.env.ADMIN_NOTIFICATION_EMAIL = '';
process.env.ADMIN_RECOVERY_TOKEN = 'test-only-admin-recovery-token-with-more-than-32-characters';
const { app, client, db, runUpcomingExamReminders, runUpcomingEventReminders } = await import('../server/index.js');
const password = 'sample-access-only-2026';

function passwordHash(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(value, salt, 64).toString('hex')}`;
}

let server;
let base;
before(async () => {
  await db.collection('users').insertMany([
    { _id: 'u-other-student', name: 'Sample Peer', email: 'peer@example.test', role: 'student', cohort: 'Cohort 08', avatar: 'SP', password_hash: null },
    { _id: 'u-unassigned-student', name: 'Unassigned Learner', email: 'unassigned@example.test', role: 'student', cohort: 'Cohort 09', avatar: 'UL', password_hash: null },
    { _id: 'u-other-trainer', name: 'Sample Faculty', email: 'faculty@example.test', role: 'trainer', cohort: 'Design faculty', avatar: 'SF', password_hash: null }
  ]);
  await db.collection('courses').insertOne({
    _id: 'c-other', title: 'Private faculty course', track: 'Research', trainer_id: 'u-other-trainer',
    duration: '2 weeks', progress: 20, next_session: 'Tomorrow', color: 'lilac'
  });
  await db.collection('tasks').insertMany([
    { _id: 't-private', learner_id: 'u-other-student', title: 'Peer-only task', course_id: 'c-product', due_date: '2026-10-20', status: 'todo', description: 'Private learner submission.' },
    { _id: 't-unassigned', learner_id: 'u-unassigned-student', title: 'Unassigned course task', course_id: 'c-other', due_date: '2026-10-21', status: 'in_review', description: 'Only the assigned trainer can review.' }
  ]);
  await db.collection('users').updateOne({ role: 'student' }, { $set: { password_hash: passwordHash(password) } });
  await db.collection('users').updateOne({ email: 'peer@example.test' }, { $set: { password_hash: passwordHash(password) } });
  await db.collection('users').updateOne({ email: 'unassigned@example.test' }, { $set: { password_hash: passwordHash(password) } });
  await db.collection('users').updateOne({ role: 'trainer' }, { $set: { password_hash: passwordHash(password) } });
  await db.collection('users').updateOne({ email: 'arjun.trainer@example.test' }, { $set: { password_hash: passwordHash(password) } });
  await db.collection('users').updateOne({ email: 'neha.trainer@example.test' }, { $set: { password_hash: passwordHash(password) } });
  await db.collection('users').updateOne({ role: 'coordinator' }, { $set: { password_hash: passwordHash(password) } });
  await db.collection('users').updateOne({ role: 'admin' }, { $set: { password_hash: passwordHash(password) } });
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.dropDatabase();
  await client.close();
});

async function request(path, { method = 'GET', body, cookie, recoveryToken } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(recoveryToken ? { 'X-Admin-Recovery-Token': recoveryToken } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${path}; received HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const setCookie = response.headers.get('set-cookie');
  return { status: response.status, body: result, cookie: setCookie?.split(';')[0] };
}
async function uploadResume(path, cookie) {
  const form = new FormData();
  form.append('resume', new Blob([Buffer.from('%PDF-1.7\nCampus Hub test resume')], { type: 'application/pdf' }), 'resume.pdf');
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  return { status: response.status, body: await response.json() };
}
function createPdf(text) {
  const stream = `BT /F1 14 Tf 50 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const crossReferenceOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return Buffer.from(pdf);
}
async function uploadStudentResume(path, cookie, buffer) {
  const form = new FormData();
  form.append('resume', new Blob([buffer], { type: 'application/pdf' }), 'student-resume.pdf');
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  return { status: response.status, body: await response.json() };
}
async function applyWithSavedResume(path, cookie) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: new FormData() });
  return { status: response.status, body: await response.json() };
}
async function uploadLessonFile(path, cookie) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('%PDF-1.7\nLesson handout')], { type: 'application/pdf' }), 'lesson-handout.pdf');
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  return { status: response.status, body: await response.json() };
}

test('auth, role boundaries, task feedback, announcement and admin flows', async () => {
  assert.equal((await request('/dashboard')).status, 401);
  const trainerAccounts = await request('/demo-users');
  assert.deepEqual(trainerAccounts.body.filter((user) => user.role === 'trainer').map((user) => user.name).sort(), ['Arjun Rao', 'Neha Varma', 'Priya Nair', 'Sample Faculty']);
  assert.equal((await request('/auth/login', { method: 'POST', body: { role: 'trainer', email: 'aarav.demo@example.test', password } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { role: 'student', email: 'aarav.demo@example.test', password: 'wrong-password' } })).status, 401);

  const studentLogin = await request('/auth/login', {
    method: 'POST',
    body: { role: 'student', email: 'aarav.demo@example.test', password }
  });

  assert.equal(studentLogin.status, 200);
  assert.match(studentLogin.cookie, /^campus_session=/);
  const studentCookie = studentLogin.cookie;
  const studentDashboard = await request('/dashboard', { cookie: studentCookie });
  assert.equal('userCounts' in studentDashboard.body.stats, false);
  assert.equal('system' in studentDashboard.body, false);
  assert.ok(Array.isArray(studentDashboard.body.tasks));
  assert.ok(studentDashboard.body.tasks.length > 0);

  const studentTasks = await request('/tasks', { cookie: studentCookie });
  assert.equal(studentTasks.status, 200);
  assert.ok(studentTasks.body.every((task) => task.learner_id === 'u-student'));
  assert.equal(studentTasks.body.some((task) => task.id === 't-private'), false);
  assert.equal((await request('/announcements', { method: 'POST', cookie: studentCookie, body: {
    title: 'Blocked update', body: 'Students cannot publish announcements.', audience: 'All learners', category: 'Campus'
  } })).status, 403);
  const supportTicket = await request('/support', { method: 'POST', cookie: studentCookie, body: {
    topic: 'Schedule & attendance', message: 'I need help understanding the date of my next course session.'
  } });
  assert.equal(supportTicket.status, 201);
  assert.equal(supportTicket.body.status, 'open');
  assert.equal((await request('/support', { cookie: studentCookie })).body.length, 1);
  const peerLogin = await request('/auth/login', { method: 'POST', body: {
    role: 'student', email: 'peer@example.test', password
  } });
  assert.equal(peerLogin.status, 200);
  assert.equal((await request('/support', { cookie: peerLogin.cookie })).body.length, 0);
  assert.equal((await request(`/support/${supportTicket.body.id}`, { method: 'PATCH', cookie: studentCookie, body: {
    status: 'resolved'
  } })).status, 403);
  assert.equal((await request('/support', { method: 'POST', cookie: studentCookie, body: {
    topic: 'Schedule & attendance', message: 'short'
  } })).status, 400);
  assert.equal((await request('/tasks/t-research/submit', { method: 'POST', cookie: studentCookie, body: {
    submissionUrl: 'http://example.test/work', note: ''
  } })).status, 400);
  const submitted = await request('/tasks/t-research/submit', { method: 'POST', cookie: studentCookie, body: {
    submissionUrl: 'https://example.test/work', note: 'Please review my research summary.'
  } });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.status, 'in_review');
  const resubmitted = await request('/tasks/t-research/submit', { method: 'POST', cookie: studentCookie, body: {
    submissionUrl: 'https://example.test/revised-work', note: 'I updated the mobile layout based on feedback.'
  } });
  assert.equal(resubmitted.status, 200);
  assert.equal(resubmitted.body.status, 'in_review');
  assert.equal(resubmitted.body.submission_url, 'https://example.test/revised-work');
  assert.equal(resubmitted.body.submission_note, 'I updated the mobile layout based on feedback.');

  const trainerLogin = await request('/auth/login', {
    method: 'POST',
    body: { role: 'trainer', email: 'priya.demo@example.test', password }
  });
  assert.equal(trainerLogin.status, 200);
  const allCourseStudents = await request('/course-learners?courseId=c-product', { cookie: trainerLogin.cookie });
  assert.equal(allCourseStudents.status, 200);
  assert.ok(allCourseStudents.body.some((learner) => learner.id === 'u-student'));
  assert.ok(allCourseStudents.body.some((learner) => learner.id === 'u-other-student'));
  assert.ok(allCourseStudents.body.some((learner) => learner.id === 'u-unassigned-student'));
  assert.equal((await request('/course-learners?courseId=c-product', { cookie: studentCookie })).status, 403);
  assert.equal((await request('/course-learners?courseId=c-other', { cookie: trainerLogin.cookie })).status, 404);
  const attendanceRoster = await request('/attendance/roster?courseId=c-product&date=2026-10-15', { cookie: trainerLogin.cookie });
  assert.equal(attendanceRoster.status, 200);
  assert.deepEqual(attendanceRoster.body.learners.map((learner) => learner.id).sort(), ['u-other-student', 'u-student']);
  const recordedAttendance = await request('/attendance', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product',
    sessionDate: '2026-10-15',
    records: [{ userId: 'u-student', status: 'present' }, { userId: 'u-other-student', status: 'late' }]
  } });
  assert.deepEqual(recordedAttendance.body, { ok: true, recorded: 2 });
  const correctedAttendance = await request('/attendance', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product',
    sessionDate: '2026-10-15',
    records: [{ userId: 'u-student', status: 'late' }]
  } });
  assert.deepEqual(correctedAttendance.body, { ok: true, recorded: 1 });
  const correctedStudentAttendance = await request('/attendance', { cookie: studentCookie });
  assert.equal(correctedStudentAttendance.body.filter((record) => record.session_date === '2026-10-15').length, 1);
  assert.equal(correctedStudentAttendance.body.find((record) => record.session_date === '2026-10-15').status, 'late');
  assert.equal((await request('/attendance', { method: 'POST', cookie: studentCookie, body: {
    courseId: 'c-product',
    sessionDate: '2026-10-16',
    records: [{ userId: 'u-student', status: 'present' }]
  } })).status, 403);
  assert.equal((await request('/attendance/roster?courseId=c-ui&date=2026-10-15', { cookie: trainerLogin.cookie })).status, 404);
  assert.equal((await request('/attendance', { cookie: studentCookie })).body.some((record) => record.session_date === '2026-10-15' && record.status === 'late'), true);
  assert.equal((await request('/attendance', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product',
    sessionDate: '2026-10-16',
    records: [{ userId: 'u-student', status: 'present' }, { userId: 'u-student', status: 'absent' }]
  } })).status, 400);
  assert.equal((await request('/attendance', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product',
    sessionDate: '2026-02-30',
    records: [{ userId: 'u-student', status: 'present' }]
  } })).status, 400);
  const trainerCourses = await request('/courses', { cookie: trainerLogin.cookie });
  assert.deepEqual(trainerCourses.body.map((course) => course.id), ['c-product']);
  assert.equal(trainerCourses.body[0].title, 'Full Stack Web Development');
  const trainerTasks = await request('/tasks', { cookie: trainerLogin.cookie });
  const submittedTask = trainerTasks.body.find((task) => task.id === 't-research');
  assert.equal(submittedTask.learner_name, 'Aarav Reddy');
  assert.equal(submittedTask.submission_url, 'https://example.test/revised-work');
  assert.equal(trainerTasks.body.some((task) => task.id === 't-unassigned'), false);
  const trainerDashboard = await request('/dashboard', { cookie: trainerLogin.cookie });
  assert.ok(trainerDashboard.body.courses.every((course) => course.trainer_id === 'u-trainer'));
  assert.ok(Array.isArray(trainerDashboard.body.tasks));
  assert.equal(trainerDashboard.body.tasks.some((task) => task.id === 't-research' && task.learner_name === 'Aarav Reddy'), true);
  assert.equal(trainerDashboard.body.tasks.some((task) => task.id === 't-unassigned'), false);
  assert.equal(trainerDashboard.body.stats.learners, 2);
  const lesson = await request('/lessons', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', title: 'Accessible forms', description: 'Labels and validation patterns.', weekNumber: 1, position: 1,
    resources: [{ type: 'link', title: 'Reference notes', url: 'https://example.test/forms-notes' }]
  } });
  assert.equal(lesson.status, 201);
  assert.equal((await request('/lessons', { cookie: studentCookie })).body.some((item) => item.id === lesson.body.id), true);
  const lessonFile = await uploadLessonFile(`/lessons/${lesson.body.id}/upload`, trainerLogin.cookie);
  assert.equal(lessonFile.status, 201);
  const updatedLesson = await request(`/lessons/${lesson.body.id}`, { method: 'PATCH', cookie: trainerLogin.cookie, body: {
    title: 'Accessible forms updated', description: 'Updated lesson notes.', resources: [...lesson.body.resources, lessonFile.body]
  } });
  assert.equal(updatedLesson.status, 200);
  assert.equal((await request('/lessons', { cookie: trainerLogin.cookie })).body.find((item) => item.id === lesson.body.id).resources.some((resource) => resource.url === lessonFile.body.url), true);
  const fileResponse = await fetch(new URL(lessonFile.body.url, base), { headers: { Cookie: studentCookie } });
  assert.equal(fileResponse.status, 200);
  assert.match(await fileResponse.text(), /^%PDF-/);
  assert.equal((await request(`/lessons/${lesson.body.id}/complete`, { method: 'POST', cookie: studentCookie })).status, 200);
  const completedLesson = (await request('/lessons', { cookie: studentCookie })).body.find((item) => item.id === lesson.body.id);
  assert.equal(completedLesson.completed, true);
  const secondLesson = await request('/lessons', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', title: 'Accessible form validation', description: 'Validate fields and describe errors clearly.', weekNumber: 2, position: 1
  } });
  assert.equal(secondLesson.status, 201);
  assert.equal((await request('/lessons', { cookie: studentCookie })).body.some((item) => item.id === secondLesson.body.id), false);
  const assignedTask = await request('/tasks', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', learnerId: 'u-student', title: 'Practice form validation', description: 'Add input validation and error text to a form.', dueDate: '2026-11-20'
  } });
  assert.equal(assignedTask.status, 201);
  assert.equal((await request('/tasks', { cookie: studentCookie })).body.some((task) => task.id === assignedTask.body.id), true);
  const unassignedLearnerTask = await request('/tasks', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', learnerId: 'u-unassigned-student', title: 'Wrong scope task', description: 'This student is not on the course.', dueDate: '2026-11-20'
  } });
  assert.equal(unassignedLearnerTask.status, 201);
  assert.equal(unassignedLearnerTask.body.learner_id, 'u-unassigned-student');
  const classStart = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const classEnd = new Date(classStart.getTime() + 60 * 60 * 1000);
  const classSession = await request('/class-sessions', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', topic: 'Accessible form lab', startsAt: classStart.toISOString(), endsAt: classEnd.toISOString(), meetingUrl: 'https://meet.example.test/forms'
  } });
  assert.equal(classSession.status, 201);
  assert.equal((await request('/class-sessions', { cookie: studentCookie })).body.some((session) => session.id === classSession.body.id), true);
  assert.equal((await request('/class-sessions', { method: 'POST', cookie: studentCookie, body: {
    courseId: 'c-product', topic: 'Unauthorized', startsAt: classStart.toISOString(), endsAt: classEnd.toISOString(), meetingUrl: 'https://meet.example.test/no'
  } })).status, 403);
  const liveCourseStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const liveCourseEnd = new Date(liveCourseStart.getTime() + 90 * 60 * 1000);
  const liveOffering = await request('/live-courses', { method: 'POST', cookie: trainerLogin.cookie, body: {
    title: 'Live React build workshop', category: 'Web engineering', description: 'Build a practical React feature with a trainer and get feedback during a guided live studio.',
    level: 'Intermediate', duration: '2 weeks', startsAt: liveCourseStart.toISOString(), endsAt: liveCourseEnd.toISOString(), capacity: 1,
    meetingUrl: 'https://meet.example.test/react-live'
  } });
  assert.equal(liveOffering.status, 201);
  assert.equal((await request('/live-courses', { method: 'POST', cookie: studentCookie, body: {} })).status, 403);
  const liveCatalog = await request('/live-courses', { cookie: studentCookie });
  const listedOffering = liveCatalog.body.find((course) => course.id === liveOffering.body.id);
  assert.equal(listedOffering.is_enrolled, false);
  assert.equal('meeting_url' in listedOffering, false);
  assert.equal((await request(`/live-courses/${liveOffering.body.id}/enroll`, { method: 'POST', cookie: studentCookie })).status, 201);
  assert.equal((await request(`/live-courses/${liveOffering.body.id}/enroll`, { method: 'POST', cookie: studentCookie })).status, 409);
  assert.equal((await request(`/live-courses/${liveOffering.body.id}/enroll`, { method: 'POST', cookie: peerLogin.cookie })).status, 409);
  await db.collection('live_courses').updateOne({ _id: liveOffering.body.id }, { $set: {
    starts_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), ends_at: new Date(Date.now() + 45 * 60 * 1000).toISOString()
  } });
  const liveListing = (await request('/live-courses', { cookie: studentCookie })).body.find((course) => course.id === liveOffering.body.id);
  assert.equal(liveListing.can_join, true);
  assert.equal(liveListing.meeting_url, 'https://meet.example.test/react-live');
  const recordingPayload = { recordingUrl: 'https://video.example.test/recordings/react-workshop' };
  assert.equal((await request(`/live-courses/${liveOffering.body.id}/recording`, { method: 'PATCH', cookie: trainerLogin.cookie, body: recordingPayload })).status, 409);
  assert.equal((await request(`/live-courses/${liveOffering.body.id}/recording`, { method: 'PATCH', cookie: peerLogin.cookie, body: recordingPayload })).status, 403);
  await db.collection('live_courses').updateOne({ _id: liveOffering.body.id }, { $set: { ends_at: new Date(Date.now() - 60 * 1000).toISOString() } });
  assert.equal((await request(`/live-courses/${liveOffering.body.id}/recording`, { method: 'PATCH', cookie: trainerLogin.cookie, body: recordingPayload })).status, 200);
  const recordedCourse = (await request('/live-courses', { cookie: studentCookie })).body.find((course) => course.id === liveOffering.body.id);
  assert.equal(recordedCourse.recording_available, true);
  assert.equal(recordedCourse.recording_url, recordingPayload.recordingUrl);
  const unregisteredCourse = (await request('/live-courses', { cookie: peerLogin.cookie })).body.find((course) => course.id === liveOffering.body.id);
  assert.equal('recording_url' in unregisteredCourse, false);
  assert.equal((await request(`/live-courses/${liveOffering.body.id}/recording`, { method: 'PATCH', cookie: trainerLogin.cookie, body: { recordingUrl: 'http://video.example.test/recording' } })).status, 400);
  const trainerAnnouncement = await request('/announcements', { method: 'POST', cookie: trainerLogin.cookie, body: {
    title: 'Week 1 form lab', body: 'Bring your accessible form practice to class.', audience: 'Assigned course', category: 'Learning', courseId: 'c-product'
  } });
  assert.equal(trainerAnnouncement.status, 201);
  assert.equal((await request('/announcements', { cookie: studentCookie })).body.some((item) => item.id === trainerAnnouncement.body.id), true);
  const unassignedLogin = await request('/auth/login', { method: 'POST', body: { role: 'student', email: 'unassigned@example.test', password } });
  assert.equal((await request('/announcements', { cookie: unassignedLogin.cookie })).body.some((item) => item.id === trainerAnnouncement.body.id), true);
  assert.equal((await request('/readiness/resume', { method: 'POST', cookie: studentCookie, body: { courseId: 'c-product', resumeUrl: 'https://example.test/aarav-resume.pdf' } })).status, 200);
  const readinessRecord = (await request('/readiness', { cookie: trainerLogin.cookie })).body.find((item) => item.learner_id === 'u-student' && item.course_id === 'c-product');
  assert.equal(readinessRecord.resume_url, 'https://example.test/aarav-resume.pdf');
  assert.equal((await request(`/readiness/u-student`, { method: 'PATCH', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', readinessStatus: 'ready_for_recommendation', score: 82, skills: ['React', 'Accessibility'], feedback: 'Strong portfolio; practice explaining tradeoffs.', resumeStatus: 'reviewed'
  } })).status, 200);
  const studentReadiness = (await request('/readiness', { cookie: studentCookie })).body;
  assert.equal(studentReadiness.find((item) => item.course_id === 'c-product').readiness_status, 'ready_for_recommendation');
  const mockInterview = await request('/mock-interviews', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', learnerId: 'u-student', topic: 'Frontend mock interview', startsAt: classStart.toISOString(), meetingUrl: 'https://meet.example.test/mock'
  } });
  assert.equal(mockInterview.status, 201);
  assert.equal((await request('/mock-interviews', { cookie: studentCookie })).body.some((item) => item.id === mockInterview.body.id), true);
  const trainerProgress = await request('/progress', { cookie: trainerLogin.cookie });
  assert.equal(trainerProgress.status, 200);
  assert.equal(trainerProgress.body.learners.some((learner) => learner.id === 'u-other-student'), true);
  assert.equal(trainerProgress.body.learners.some((learner) => learner.id === 'u-unassigned-student'), true);
  assert.equal((await request('/progress', { cookie: studentCookie })).status, 403);
  assert.equal((await request('/tasks/t-unassigned/feedback', { method: 'POST', cookie: trainerLogin.cookie, body: {
    feedback: 'This trainer is not assigned to the course.', status: 'complete'
  } })).status, 404);
  assert.equal((await request('/tasks/t-research/feedback', { method: 'POST', cookie: trainerLogin.cookie, body: {
    feedback: 'Please add a mobile layout check before approval.', status: 'changes_requested'
  } })).status, 200);
  const revisionRequest = (await request('/tasks', { cookie: studentCookie })).body.find((task) => task.id === 't-research');
  assert.equal(revisionRequest.review_status, 'changes_requested');
  assert.equal(revisionRequest.reviewer_name, 'Priya Nair');
  assert.ok(revisionRequest.reviewed_at);
  const revisedSubmission = await request('/tasks/t-research/submit', { method: 'POST', cookie: studentCookie, body: {
    submissionUrl: 'https://example.test/revised-work', note: 'I updated the mobile layout based on feedback.'
  } });
  assert.equal(revisedSubmission.status, 200);
  assert.equal((await request('/tasks/t-research/feedback', { method: 'POST', cookie: trainerLogin.cookie, body: {
    feedback: 'Clear findings. Add one quote to support the opportunity.', status: 'complete'
  } })).status, 200);
  const finalTask = (await request('/tasks', { cookie: studentCookie })).body.find((task) => task.id === 't-research');
  assert.equal(finalTask.status, 'complete');
  assert.match(finalTask.feedback, /Clear findings/);
  assert.ok(finalTask.reviewed_at);
  assert.equal(finalTask.reviewed_by, 'u-trainer');
  assert.equal(finalTask.submission_note, 'I updated the mobile layout based on feedback.');

  const createdExam = await request('/exams', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', title: 'Week 1 checkpoint', weekNumber: 1, dueDate: '2026-10-20',
    questions: [{ prompt: 'What does HTML describe?', options: ['Page structure', 'Database storage'], correctOption: 0 }]
  } });
  assert.equal(createdExam.status, 201);
  assert.equal(createdExam.body.questions[0].correctOption, undefined);
  assert.equal((await request('/exams', { cookie: studentCookie })).body.find((exam) => exam.id === createdExam.body.id).questions[0].options.length, 2);
  const weekTwoExam = await request('/exams', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', title: 'Week 2 checkpoint', weekNumber: 2, examDate: '2026-10-27', durationMinutes: 45, totalMarks: 20,
    syllabus: 'Accessible forms', instructions: 'Answer each question.', practiceMaterials: 'Review the forms lesson.',
    questions: [{ prompt: 'What improves form accessibility?', options: ['Labels', 'Placeholder only'], correctOption: 0 }]
  } });
  assert.equal(weekTwoExam.status, 201);
  assert.equal((await request(`/exams/${weekTwoExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: [0] } })).status, 423);
  const failedExam = await request(`/exams/${createdExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: [1] } });
  assert.deepEqual({ score: failedExam.body.score, passed: failedExam.body.passed }, { score: 0, passed: false });
  const passedExam = await request(`/exams/${createdExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: [0] } });
  assert.deepEqual({ score: passedExam.body.score, passed: passedExam.body.passed }, { score: 100, passed: true });
  assert.equal((await request('/lessons', { cookie: studentCookie })).body.some((item) => item.id === secondLesson.body.id), true);
  const studentLevels = await request('/learning-progress', { cookie: studentCookie });
  assert.equal(studentLevels.body.find((course) => course.course_id === 'c-product').completed_weeks.includes(1), true);
  assert.equal((await request('/exams', { cookie: studentCookie })).body.find((exam) => exam.id === weekTwoExam.body.id).locked, false);
  assert.equal((await request('/certificates', { cookie: studentCookie })).body.some((certificate) => certificate.course_id === 'c-product'), false);
  const passedWeekTwo = await request(`/exams/${weekTwoExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: [0] } });
  assert.equal(passedWeekTwo.body.passed, true);
  assert.equal((await request('/certificates', { cookie: studentCookie })).body.some((certificate) => certificate.course_id === 'c-product'), false);
  assert.equal((await request(`/lessons/${secondLesson.body.id}/complete`, { method: 'POST', cookie: studentCookie })).status, 200);
  const seededCourseLessons = (await request('/lessons?courseId=c-product', { cookie: studentCookie })).body;
  for (const lesson of seededCourseLessons) {
    if (!lesson.completed) await request(`/lessons/${lesson.id}/complete`, { method: 'POST', cookie: studentCookie });
  }
  assert.equal((await request('/certificates', { cookie: studentCookie })).body.some((certificate) => certificate.course_id === 'c-product'), true);
  assert.equal((await request('/exams', { cookie: trainerLogin.cookie })).body.find((exam) => exam.id === createdExam.body.id).attempts[0].learner_name, 'Aarav Reddy');

  const internshipPayload = {
    title: 'Frontend engineering intern', organization: 'Zyngram Studio', description: 'Build and test accessible web features with the product team.', applyBy: '2026-12-01', courseId: 'c-product', skills: ['React', 'JavaScript', 'Git']
  };
  const placementPayload = {
    title: 'Product designer', organization: 'CampusWorks', description: 'Design and improve the student journey for a product team.', applyBy: '2026-12-10', courseId: 'c-product', skills: ['Figma', 'UX Research'], type: 'placement', location: 'Hyderabad', workMode: 'Hybrid', stage: 'screening', salary: '₹12 LPA'
  };
  const resumeBeforeUpload = await request('/student-resume', { cookie: studentCookie });
  assert.equal(resumeBeforeUpload.status, 200);
  assert.equal(resumeBeforeUpload.body.resume, null);
  assert.equal((await request('/student-resume', { method: 'POST', cookie: trainerLogin.cookie })).status, 403);
  const invalidStudentResume = await uploadStudentResume('/student-resume', studentCookie, Buffer.from('%PDF-not-a-readable-pdf'));
  assert.equal(invalidStudentResume.status, 400);
  const uploadedStudentResume = await uploadStudentResume('/student-resume', studentCookie, createPdf('React JavaScript CSS Node.js'));
  assert.equal(uploadedStudentResume.status, 200);
  assert.equal(uploadedStudentResume.body.resume.text_available, true);
  assert.deepEqual(uploadedStudentResume.body.resume.matched_skills, []);
  const savedStudentResume = await request('/student-resume', { cookie: studentCookie });
  assert.equal(savedStudentResume.body.resume.filename, 'student-resume.pdf');
  assert.equal(savedStudentResume.body.resume.page_count, 1);
  assert.equal((await request('/student-resume/file', { cookie: peerLogin.cookie })).status, 404);
  const studentResumePdf = await fetch(`${base}/student-resume/file`, { headers: { Cookie: studentCookie } });
  assert.equal(studentResumePdf.status, 200);
  assert.equal(studentResumePdf.headers.get('content-type'), 'application/pdf');
  assert.match(await studentResumePdf.text(), /^%PDF-/);
  assert.equal((await request('/internships', { method: 'POST', cookie: trainerLogin.cookie, body: internshipPayload })).status, 403);
  const placementLogin = await request('/auth/login', { method: 'POST', body: {
    role: 'coordinator', email: 'kiran.demo@example.test', password
  } });
  const placementOpportunity = await request('/internships', { method: 'POST', cookie: placementLogin.cookie, body: placementPayload });
  assert.equal(placementOpportunity.status, 201);
  assert.equal(placementOpportunity.body.type, 'placement');
  assert.equal(placementOpportunity.body.stage, 'screening');
  const placementInList = (await request('/internships', { cookie: studentCookie })).body.find((item) => item.id === placementOpportunity.body.id);
  assert.equal(placementInList.type, 'placement');
  assert.equal(placementInList.location, 'Hyderabad');
  const internship = await request('/internships', { method: 'POST', cookie: placementLogin.cookie, body: internshipPayload });
  assert.equal(internship.status, 201);
  const recommendedOpportunities = await request('/internships', { cookie: studentCookie });
  assert.equal(recommendedOpportunities.body[0].id, internship.body.id);
  assert.deepEqual(recommendedOpportunities.body[0].resume_match.matched_skills, ['React', 'JavaScript']);
  assert.equal(recommendedOpportunities.body[0].resume_match.recommended, true);
  assert.equal(recommendedOpportunities.body.find((item) => item.id === placementOpportunity.body.id).resume_match.recommended, false);
  const application = await applyWithSavedResume(`/internships/${internship.body.id}/apply`, studentCookie);
  assert.equal(application.status, 201);
  assert.equal(application.body.has_resume, true);
  assert.equal((await uploadResume(`/internships/${internship.body.id}/apply`, studentCookie)).status, 409);
  const studentInternship = (await request('/internships', { cookie: studentCookie })).body.find((item) => item.id === internship.body.id);
  assert.equal(studentInternship.application.status, 'applied');
  assert.equal(studentInternship.application.has_resume, true);
  const resumeResponse = await fetch(`${base}/internships/applications/${application.body.id}/resume`, { headers: { Cookie: studentCookie } });
  assert.equal(resumeResponse.status, 200);
  assert.match(await resumeResponse.text(), /^%PDF-/);
  assert.equal((await request(`/internships/applications/${application.body.id}/resume`, { cookie: peerLogin.cookie })).status, 404);
  assert.equal((await request(`/internships/applications/${application.body.id}`, { method: 'PATCH', cookie: trainerLogin.cookie, body: { status: 'under_review' } })).status, 403);
  assert.equal((await request(`/internships/applications/${application.body.id}`, { method: 'PATCH', cookie: placementLogin.cookie, body: { status: 'under_review' } })).status, 200);
  assert.equal((await request(`/internships/applications/${application.body.id}`, { method: 'PATCH', cookie: placementLogin.cookie, body: { status: 'shortlisted' } })).status, 200);
  assert.equal((await request(`/internships/applications/${application.body.id}`, { method: 'PATCH', cookie: placementLogin.cookie, body: { status: 'selected' } })).status, 200);
  assert.equal((await request('/internships', { cookie: studentCookie })).body.find((item) => item.id === internship.body.id).application.status, 'selected');
  const studentNotifications = await request('/notifications', { cookie: studentCookie });
  assert.equal(studentNotifications.body.some((item) => item.type === 'exam_result'), true);
  assert.equal(studentNotifications.body.some((item) => item.type === 'exam'), true);
  assert.equal(studentNotifications.body.some((item) => item.type === 'internship_status'), true);
  assert.equal((await request(`/notifications/${studentNotifications.body[0].id}/read`, { method: 'PATCH', cookie: studentCookie })).status, 200);
  assert.equal((await request(`/notifications/${studentNotifications.body[0].id}/read`, { method: 'PATCH', cookie: peerLogin.cookie })).status, 404);
  const reminderDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await db.collection('exams').insertOne({ _id: 'exam-reminder-test', course_id: 'c-product', title: 'Reminder test', exam_date: reminderDate, duration_minutes: 35 });
  await runUpcomingExamReminders();
  await runUpcomingExamReminders();
  const reminders = await db.collection('notifications').find({ user_id: 'u-student', type: 'exam_reminder', entity_id: 'exam-reminder-test' }).toArray();
  assert.equal(reminders.length, 1);

  const arjunLogin = await request('/auth/login', {
    method: 'POST',
    body: { role: 'trainer', email: 'arjun.trainer@example.test', password }
  });
  assert.equal(arjunLogin.status, 200);
  const arjunCourses = (await request('/courses', { cookie: arjunLogin.cookie })).body;
  assert.deepEqual(arjunCourses.map((course) => course.id), ['c-ui']);
  assert.equal(arjunCourses[0].title, 'Digital Marketing');
  const arjunTasks = await request('/tasks', { cookie: arjunLogin.cookie });
  assert.deepEqual(arjunTasks.body.map((task) => task.id), ['t-wireframes']);
  assert.equal((await request('/dashboard', { cookie: arjunLogin.cookie })).body.stats.learners, 1);

  const nehaLogin = await request('/auth/login', {
    method: 'POST',
    body: { role: 'trainer', email: 'neha.trainer@example.test', password }
  });
  assert.equal(nehaLogin.status, 200);
  const nehaCourses = (await request('/courses', { cookie: nehaLogin.cookie })).body;
  assert.deepEqual(nehaCourses.map((course) => course.id), ['c-portfolio']);
  assert.equal(nehaCourses[0].title, 'Finance Fundamentals');
  assert.equal((await request('/attendance', { cookie: nehaLogin.cookie })).body.every((record) => record.course_id === 'c-portfolio'), true);
  assert.equal((await request('/dashboard', { cookie: nehaLogin.cookie })).body.stats.learners, 1);

  const coordinatorLogin = await request('/auth/login', {
    method: 'POST',
    body: { role: 'coordinator', email: 'kiran.demo@example.test', password }
  });
  assert.equal(coordinatorLogin.status, 200);
  const coordinatorDashboard = await request('/dashboard', { cookie: coordinatorLogin.cookie });
  assert.ok(Array.isArray(coordinatorDashboard.body.tasks));
  assert.equal(coordinatorDashboard.body.tasks.some((task) => task.learner_name === 'Sample Peer'), true);
  assert.equal((await request('/progress', { cookie: coordinatorLogin.cookie })).status, 200);
  const published = await request('/announcements', { method: 'POST', cookie: coordinatorLogin.cookie, body: {
    title: 'Open studio update', body: 'The campus studio opens Friday afternoon.', audience: 'Cohort 08', category: 'Campus'
  } });
  assert.equal(published.status, 201);

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: { role: 'admin', email: 'campushub@zyngram.com', password }
  });
  assert.equal(adminLogin.status, 200);
  const profileChange = await request('/profile-change-requests', {
    method: 'POST',
    cookie: studentCookie,
    body: { name: 'Mounika Updated', cohort: 'Cohort 08 Updated' }
  });
  assert.equal(profileChange.status, 201);
  const adminNotifications = await request('/notifications', { cookie: adminLogin.cookie });
  assert.equal(adminNotifications.body.some((item) => item.type === 'profile_change_request' && item.entity_id === profileChange.body.id), true);
  const profileRequests = await request('/profile-change-requests', { cookie: adminLogin.cookie });
  const profileRequest = profileRequests.body.find((item) => item.id === profileChange.body.id);
  assert.equal(profileRequest.status, 'pending');
  const approvedProfileChange = await request(`/profile-change-requests/${profileChange.body.id}`, {
    method: 'PATCH',
    cookie: adminLogin.cookie,
    body: { status: 'approved' }
  });
  assert.equal(approvedProfileChange.status, 200);
  assert.equal(approvedProfileChange.body.status, 'approved');
  const registration = await request('/student-registration-requests', { method: 'POST', body: {
    name: 'New Campus Learner', password: 'new-campus-password-2026', cohort: 'Cohort 10'
  } });
  assert.equal(registration.status, 201);
  assert.match(registration.body.zinId, /^NE\d{12}EW$/);
  assert.equal(registration.body.email, `${registration.body.zinId.toLowerCase()}@zyngram.com`);
  assert.equal(registration.body.notification.sent, false);
  assert.match(registration.body.notification.message, /not configured/);
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'student', email: registration.body.zinId, password: 'new-campus-password-2026'
  } })).status, 403);
  const learnersBeforeApproval = await request('/course-learners?courseId=c-product', { cookie: trainerLogin.cookie });
  assert.equal(learnersBeforeApproval.status, 200);
  assert.equal(learnersBeforeApproval.body.some((learner) => learner.name === 'New Campus Learner'), false);
  assert.equal((await request('/student-registration-requests', { cookie: studentCookie })).status, 403);
  assert.equal((await request('/student-registration-requests')).status, 401);
  assert.equal((await request('/student-registration-requests', { method: 'POST', body: {
    name: 'Short Password', password: 'short'
  } })).status, 400);
  const pendingRegistrations = await request('/student-registration-requests', { cookie: adminLogin.cookie });
  assert.equal(pendingRegistrations.status, 200);
  const pendingRegistration = pendingRegistrations.body.find((item) => item.id === registration.body.requestId);
  assert.equal(pendingRegistration?.status, 'pending');
  assert.equal(pendingRegistration?.zin_id, registration.body.zinId);
  assert.equal('password_hash' in pendingRegistration, false);
  const approvedRegistration = await request(`/student-registration-requests/${registration.body.requestId}`, {
    method: 'PATCH', cookie: adminLogin.cookie, body: { status: 'approved' }
  });
  assert.equal(approvedRegistration.status, 200);
  assert.equal(approvedRegistration.body.credentials_ready, true);
  assert.equal(approvedRegistration.body.user.email, registration.body.email);
  assert.equal(approvedRegistration.body.user.zin_id, registration.body.zinId);
  assert.equal(approvedRegistration.body.user.role, 'student');
  assert.equal('registration_approved_at' in approvedRegistration.body.user, false);
  assert.equal('password_hash' in approvedRegistration.body.user, false);
  const learnersAfterApproval = await request('/course-learners?courseId=c-product', { cookie: trainerLogin.cookie });
  assert.equal(learnersAfterApproval.body.some((learner) => learner.name === 'New Campus Learner'), true);
  const newLearnerTask = await request('/tasks', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', learnerId: approvedRegistration.body.user.id, title: 'First live learner task',
    description: 'Welcome this approved learner into the course with a first practice assignment.', dueDate: '2026-11-20'
  } });
  assert.equal(newLearnerTask.status, 201);
  assert.equal((await request('/progress', { cookie: trainerLogin.cookie })).body.learners.some((learner) => learner.name === 'New Campus Learner'), true);
  const approvedStudentLogin = await request('/auth/login', { method: 'POST', body: {
    role: 'student', email: registration.body.zinId, password: 'new-campus-password-2026'
  } });
  assert.equal(approvedStudentLogin.status, 200);
  assert.equal(approvedStudentLogin.body.user.zin_id, registration.body.zinId);
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'student', email: registration.body.email, password: 'new-campus-password-2026'
  } })).status, 200);
  const usersAfterApproval = await request('/users', { cookie: adminLogin.cookie });
  const createdStudent = usersAfterApproval.body.find((item) => item.email === registration.body.email);
  assert.equal(createdStudent?.zin_id, registration.body.zinId);
  assert.equal('password_hash' in createdStudent, false);
  const rejectedRegistration = await request('/student-registration-requests', { method: 'POST', body: {
    name: 'Declined Candidate', password: 'declined-candidate-2026', cohort: 'Cohort 10'
  } });
  assert.equal(rejectedRegistration.status, 201);
  assert.equal((await request(`/student-registration-requests/${rejectedRegistration.body.requestId}`, {
    method: 'PATCH', cookie: adminLogin.cookie, body: { status: 'rejected' }
  })).body.status, 'rejected');
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'student', email: rejectedRegistration.body.zinId, password: 'declined-candidate-2026'
  } })).status, 403);
  assert.equal((await request('/users', { cookie: adminLogin.cookie })).body.some((item) => item.email === rejectedRegistration.body.email), false);
  assert.deepEqual((await request('/exam-settings', { cookie: adminLogin.cookie })).body, { passMark: 70 });
  assert.equal((await request('/exam-settings', { method: 'PATCH', cookie: trainerLogin.cookie, body: { passMark: 60 } })).status, 403);
  assert.equal((await request('/exam-settings', { method: 'PATCH', cookie: adminLogin.cookie, body: { passMark: 60 } })).body.passMark, 60);
  assert.equal((await request('/exam-settings', { method: 'PATCH', cookie: adminLogin.cookie, body: { passMark: 101 } })).status, 400);
  const weekThreeExam = await request('/exams', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', title: 'Week 3 checkpoint', weekNumber: 3, examDate: '2026-11-03', durationMinutes: 30, totalMarks: 10,
    questions: [
      { prompt: 'Question one for the test?', options: ['Correct', 'Incorrect'], correctOption: 0 },
      { prompt: 'Question two for the test?', options: ['Correct', 'Incorrect'], correctOption: 0 }
    ]
  } });
  assert.equal(weekThreeExam.status, 201);
  const belowThreshold = await request(`/exams/${weekThreeExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: [0, 1] } });
  assert.equal(belowThreshold.body.score, 50);
  assert.equal(belowThreshold.body.passMark, 60);
  assert.equal(belowThreshold.body.passed, false);
  const weekFourExam = await request('/exams', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', title: 'Week 4 writing review', weekNumber: 4, examDate: '2026-11-10', durationMinutes: 40, totalMarks: 10,
    status: 'draft', questions: [{ type: 'descriptive', prompt: 'Explain one useful accessibility principle.', marks: 10 }]
  } });
  assert.equal(weekFourExam.status, 201);
  assert.equal((await request('/exams', { cookie: studentCookie })).body.some((exam) => exam.id === weekFourExam.body.id), false);
  assert.equal((await request(`/exams/${weekFourExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: ['Use labels for form controls.'] } })).status, 404);
  assert.equal((await request(`/exams/${weekFourExam.body.id}/publish`, { method: 'PATCH', cookie: trainerLogin.cookie })).status, 200);
  assert.equal((await request(`/exams/${weekFourExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: ['Use labels for form controls.'] } })).status, 423);
  assert.equal((await request('/student-progress/c-product/unlock', { method: 'PATCH', cookie: trainerLogin.cookie, body: {
    learnerId: 'u-student', unlockedWeek: 4, reason: 'Approved the learner remediation plan after review.'
  } })).status, 200);
  assert.equal((await request('/student-progress/c-product/unlock', { method: 'PATCH', cookie: trainerLogin.cookie, body: {
    learnerId: 'u-unassigned-student', unlockedWeek: 4, reason: 'Unlock this learner after reviewing their course progress.'
  } })).status, 200);
  const descriptiveSubmission = await request(`/exams/${weekFourExam.body.id}/attempt`, { method: 'POST', cookie: studentCookie, body: { answers: ['Use labels for form controls.'] } });
  assert.equal(descriptiveSubmission.body.pendingReview, true);
  assert.equal(descriptiveSubmission.body.score, null);
  const pendingGrade = (await request('/exams', { cookie: trainerLogin.cookie })).body.find((exam) => exam.id === weekFourExam.body.id).attempts[0];
  assert.equal(pendingGrade.grading_status, 'pending_review');
  const manualGrade = await request(`/exams/attempts/${pendingGrade.id}/grade`, { method: 'POST', cookie: trainerLogin.cookie, body: {
    descriptiveMarks: 6, feedback: 'Good principle; include a second example in the next response.'
  } });
  assert.deepEqual({ score: manualGrade.body.score, passed: manualGrade.body.passed }, { score: 60, passed: true });
  const adminDashboard = await request('/dashboard', { cookie: adminLogin.cookie });
  assert.equal(adminDashboard.body.stats.learners, 4);
  assert.ok(Array.isArray(adminDashboard.body.tasks));
  assert.equal(adminDashboard.body.tasks.some((task) => task.learner_name === 'Sample Peer'), true);
  assert.equal(adminDashboard.body.tasks.some((task) => task.id === 't-unassigned'), true);
  assert.deepEqual(adminDashboard.body.stats.userCounts, { students: 4, trainers: 4, coordinators: 1, admins: 1 });
  assert.deepEqual(adminDashboard.body.system, {
    environment: 'Development prototype',
    database: 'MongoDB connected',
    sessionHours: 8
  });
  const adminProgress = await request('/progress', { cookie: adminLogin.cookie });
  assert.equal(adminProgress.status, 200);
  assert.equal(adminProgress.body.learners.some((learner) => learner.id === 'u-unassigned-student'), true);
  assert.equal((await request('/users', { cookie: studentCookie })).status, 403);
  assert.equal((await request('/audit', { cookie: trainerLogin.cookie })).status, 403);
  const created = await request('/users', { method: 'POST', cookie: adminLogin.cookie, body: {
    name: 'Sample Learner', email: 'new.learner@example.test', role: 'student', cohort: 'Cohort 09'
  } });
  assert.equal(created.status, 201);
  assert.equal(created.body.email, 'new.learner@example.test');
  assert.equal('password_hash' in created.body, false);
  const persistedUsers = await request('/users', { cookie: adminLogin.cookie });
  assert.equal(persistedUsers.status, 200);
  assert.equal(persistedUsers.body.some((user) => user.id === created.body.id), true);
  assert.equal(persistedUsers.body.find((user) => user.id === created.body.id).email, 'new.learner@example.test');
  assert.equal('password_hash' in persistedUsers.body.find((user) => user.id === created.body.id), false);
  assert.equal((await request('/users', { cookie: studentCookie })).status, 403);
  assert.equal((await request('/users', { method: 'POST', cookie: adminLogin.cookie, body: {
    name: 'Duplicate Learner', email: 'new.learner@example.test', role: 'student', cohort: 'Cohort 09'
  } })).status, 409);
  assert.equal((await request(`/users/${created.body.id}/invite`, { method: 'POST', cookie: studentCookie })).status, 403);
  const invitation = await request(`/users/${created.body.id}/invite`, { method: 'POST', cookie: adminLogin.cookie });
  assert.equal(invitation.status, 200);
  const invitationToken = new URL(invitation.body.development_invitation_url).searchParams.get('invite');
  assert.ok(invitationToken);
  assert.equal((await request('/auth/accept-invite', { method: 'POST', body: {
    token: invitationToken, password: 'too-short'
  } })).status, 400);
  await db.collection('users').updateOne(
    { _id: created.body.id },
    { $set: { invite_expires_at: new Date(Date.now() - 1000) } }
  );
  assert.equal((await request('/auth/accept-invite', { method: 'POST', body: {
    token: invitationToken, password: 'a-secure-password-2026'
  } })).status, 400);
  const renewedInvitation = await request(`/users/${created.body.id}/invite`, { method: 'POST', cookie: adminLogin.cookie });
  assert.equal(renewedInvitation.status, 200);
  assert.equal((await request('/auth/accept-invite', { method: 'POST', body: {
    token: invitationToken, password: 'a-secure-password-2026'
  } })).status, 400);
  const renewedInvitationToken = new URL(renewedInvitation.body.development_invitation_url).searchParams.get('invite');
  assert.ok(renewedInvitationToken);
  const acceptedInvitation = await request('/auth/accept-invite', { method: 'POST', body: {
    token: renewedInvitationToken, password: 'a-secure-password-2026'
  } });
  assert.equal(acceptedInvitation.status, 200);
  assert.equal(acceptedInvitation.cookie, 'campus_session=');
  assert.equal((await request('/auth/accept-invite', { method: 'POST', body: {
    token: renewedInvitationToken, password: 'another-secure-password'
  } })).status, 400);
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'student', email: 'new.learner@example.test', password: 'a-secure-password-2026'
  } })).status, 200);
  const smtpFallbackUser = await request('/users', { method: 'POST', cookie: adminLogin.cookie, body: {
    name: 'SMTP Fallback Learner', email: 'smtp.fallback@example.test', role: 'student', cohort: 'Cohort 09'
  } });
  const originalMailSettings = Object.fromEntries(['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASSWORD', 'MAIL_FROM']
    .map((key) => [key, process.env[key]]));
  process.env.MAIL_HOST = 'smtp.gmail.com';
  process.env.MAIL_PORT = 'invalid';
  process.env.MAIL_USER = 'sender@example.test';
  process.env.MAIL_PASSWORD = 'test-only-smtp-secret';
  try {
    const fallbackInvitation = await request(`/users/${smtpFallbackUser.body.id}/invite`, { method: 'POST', cookie: adminLogin.cookie });
    assert.equal(fallbackInvitation.status, 200);
    assert.equal(fallbackInvitation.body.email_delivery_failed, true);
    const fallbackToken = new URL(fallbackInvitation.body.manual_invitation_url).searchParams.get('invite');
    assert.ok(fallbackToken);
    assert.equal((await request('/auth/accept-invite', { method: 'POST', body: {
      token: fallbackToken, password: 'another-secure-password-2026'
    } })).status, 200);
  } finally {
    for (const [key, value] of Object.entries(originalMailSettings)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const adminTickets = await request('/support', { cookie: adminLogin.cookie });
  assert.equal(adminTickets.status, 200);
  assert.equal(adminTickets.body.some((ticket) => ticket.id === supportTicket.body.id), true);
  assert.equal((await request(`/support/${supportTicket.body.id}`, { method: 'PATCH', cookie: adminLogin.cookie, body: {
    status: 'in_progress'
  } })).status, 200);
  assert.equal((await request('/support', { cookie: adminLogin.cookie })).body.find((ticket) => ticket.id === supportTicket.body.id).status, 'in_progress');
  assert.equal((await request('/audit', { cookie: adminLogin.cookie })).status, 200);
  assert.equal((await request('/admin/demo-data', { method: 'POST' })).status, 401);
  assert.equal((await request('/admin/demo-data', { method: 'POST', cookie: studentCookie })).status, 403);
  const demoImport = await request('/admin/demo-data', { method: 'POST', cookie: adminLogin.cookie });
  assert.equal(demoImport.status, 200);
  assert.deepEqual(
    { courses: demoImport.body.courses, tasks: demoImport.body.tasks, announcements: demoImport.body.announcements },
    { courses: 0, tasks: 16, announcements: 2 }
  );
  const demoUsers = await request('/users', { cookie: adminLogin.cookie });
  const mastan = demoUsers.body.find((person) => person.email === 'mastan.demo@example.test');
  assert.equal(mastan.role, 'student');
  assert.equal(mastan.account_status, 'setup required');
  assert.equal('password_hash' in mastan, false);
  assert.equal((await request('/tasks', { cookie: adminLogin.cookie })).body.filter((task) => task.demo).length, 16);
  const repeatDemoImport = await request('/admin/demo-data', { method: 'POST', cookie: adminLogin.cookie });
  assert.equal(repeatDemoImport.status, 200);
  assert.equal(repeatDemoImport.body.alreadyPresent, true);

  const recoveryBody = {
    currentEmail: 'campushub@zyngram.com',
    newEmail: 'recovered.admin@example.test',
    newPassword: 'new-private-admin-password-2026'
  };
  assert.equal((await request('/admin/recover', { method: 'POST', body: recoveryBody })).status, 401);
  const recoveredAdmin = await request('/admin/recover', {
    method: 'POST', body: recoveryBody, recoveryToken: process.env.ADMIN_RECOVERY_TOKEN
  });
  assert.equal(recoveredAdmin.status, 200);
  assert.deepEqual(recoveredAdmin.body, { ok: true, email: 'recovered.admin@example.test' });
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'admin', email: 'campushub@zyngram.com', password
  } })).status, 401);
  assert.equal((await request('/dashboard', { cookie: adminLogin.cookie })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'admin', email: 'recovered.admin@example.test', password: recoveryBody.newPassword
  } })).status, 200);
  assert.equal((await request('/admin/recover', {
    method: 'POST', body: recoveryBody, recoveryToken: process.env.ADMIN_RECOVERY_TOKEN
  })).status, 409);
  const nextRecoveryBody = {
    currentEmail: 'recovered.admin@example.test',
    newEmail: 'recovered.admin@example.test',
    newPassword: 'another-private-admin-password-2026'
  };
  const nextRecoveryToken = 'another-test-only-admin-recovery-token-with-more-than-32-characters';
  process.env.ADMIN_RECOVERY_TOKEN = nextRecoveryToken;
  assert.equal((await request('/admin/recover', {
    method: 'POST', body: nextRecoveryBody, recoveryToken: nextRecoveryToken
  })).status, 200);
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'admin', email: nextRecoveryBody.newEmail, password: recoveryBody.newPassword
  } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: {
    role: 'admin', email: nextRecoveryBody.newEmail, password: nextRecoveryBody.newPassword
  } })).status, 200);
});

test('campus event creation and student RSVP respect role and event state', async () => {
  assert.equal((await request('/events')).status, 401);
  const staffLogin = await request('/auth/demo', { method: 'POST', body: { role: 'coordinator' } });
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const staffCookie = staffLogin.cookie;
  const studentCookie = studentLogin.cookie;
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const eventInput = { title: 'Campus makers showcase', description: 'Student projects and demos.', location: 'Innovation Hall', startsAt, endsAt };

  assert.equal((await request('/events', { method: 'POST', cookie: studentCookie, body: eventInput })).status, 403);
  assert.equal((await request('/events', { method: 'POST', cookie: staffCookie, body: { ...eventInput, endsAt: startsAt } })).status, 400);
  const created = await request('/events', { method: 'POST', cookie: staffCookie, body: eventInput });
  assert.equal(created.status, 201);
  assert.equal(created.body.attendance_count, 0);
  assert.equal(created.body.is_attending, false);

  const rsvp = await request(`/events/${created.body.id}/rsvp`, {
    method: 'POST', cookie: studentCookie, body: { attending: true }
  });
  assert.equal(rsvp.status, 200);
  assert.equal(rsvp.body.is_attending, true);
  assert.equal(rsvp.body.attendance_count, 1);
  const duplicateRsvp = await request(`/events/${created.body.id}/rsvp`, {
    method: 'POST', cookie: studentCookie, body: { attending: true }
  });
  assert.equal(duplicateRsvp.body.attendance_count, 1);
  const eventsForStudent = await request('/events', { cookie: studentCookie });
  assert.equal(eventsForStudent.body.find((event) => event.id === created.body.id).is_attending, true);
  await runUpcomingEventReminders();
  const reminders = await request('/notifications', { cookie: studentCookie });
  assert.equal(reminders.body.filter((notification) => notification.entity_id === created.body.id && notification.type === 'event_reminder').length, 1);
  await runUpcomingEventReminders();
  const repeatedReminders = await request('/notifications', { cookie: studentCookie });
  assert.equal(repeatedReminders.body.filter((notification) => notification.entity_id === created.body.id && notification.type === 'event_reminder').length, 1);

  const cancelled = await request(`/events/${created.body.id}/rsvp`, {
    method: 'POST', cookie: studentCookie, body: { attending: false }
  });
  assert.equal(cancelled.body.is_attending, false);
  assert.equal(cancelled.body.attendance_count, 0);
});

test('Lost & Found reports are searchable by authorized users and status is owner-restricted', async () => {
  assert.equal((await request('/lost-found')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const otherStudentLogin = await request('/auth/login', {
    method: 'POST', body: { role: 'student', email: 'peer@example.test', password }
  });
  const studentCookie = studentLogin.cookie;
  const otherStudentCookie = otherStudentLogin.cookie;
  const reportInput = {
    itemType: 'found',
    title: 'Blue water bottle',
    category: 'Drinkware',
    description: 'Blue metal bottle left near the library entrance.',
    location: 'Library entrance',
    reportedOn: new Date().toISOString().slice(0, 10)
  };

  const invalidDate = await request('/lost-found', {
    method: 'POST', cookie: studentCookie, body: { ...reportInput, reportedOn: 'not-a-date' }
  });
  assert.equal(invalidDate.status, 400);
  const created = await request('/lost-found', { method: 'POST', cookie: studentCookie, body: reportInput });
  assert.equal(created.status, 201);
  assert.equal(created.body.item_type, 'found');
  assert.equal(created.body.status, 'open');
  assert.equal(created.body.created_by_me, true);
  assert.equal('reporter_id' in created.body, false);

  const reportList = await request('/lost-found', { cookie: otherStudentCookie });
  assert.equal(reportList.status, 200);
  assert.equal(reportList.body.find((item) => item.id === created.body.id).created_by_me, false);
  assert.equal((await request(`/lost-found/${created.body.id}/status`, {
    method: 'PATCH', cookie: otherStudentCookie, body: { status: 'resolved' }
  })).status, 403);
  const resolved = await request(`/lost-found/${created.body.id}/status`, {
    method: 'PATCH', cookie: studentCookie, body: { status: 'resolved' }
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'resolved');
  assert.equal(resolved.body.created_by_me, true);
});

test('student marketplace validates listings and restricts listing status to its seller', async () => {
  assert.equal((await request('/marketplace')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const otherStudentLogin = await request('/auth/login', {
    method: 'POST', body: { role: 'student', email: 'peer@example.test', password }
  });
  const trainerLogin = await request('/auth/demo', { method: 'POST', body: { role: 'trainer' } });
  const studentCookie = studentLogin.cookie;
  const otherStudentCookie = otherStudentLogin.cookie;
  const listingInput = {
    title: 'Used JavaScript textbook',
    category: 'Books',
    description: 'Well-kept textbook with a few highlighted pages.',
    price: 450,
    condition: 'good',
    location: 'Main campus library'
  };

  assert.equal((await request('/marketplace', { method: 'POST', cookie: trainerLogin.cookie, body: listingInput })).status, 403);
  assert.equal((await request('/marketplace', { method: 'POST', cookie: studentCookie, body: { ...listingInput, price: -1 } })).status, 400);
  const created = await request('/marketplace', { method: 'POST', cookie: studentCookie, body: listingInput });
  assert.equal(created.status, 201);
  assert.equal(created.body.price, 450);
  assert.equal(created.body.status, 'available');
  assert.equal(created.body.created_by_me, true);
  assert.equal('seller_id' in created.body, false);

  const listings = await request('/marketplace', { cookie: otherStudentCookie });
  assert.equal(listings.status, 200);
  assert.equal(listings.body.find((item) => item.id === created.body.id).created_by_me, false);
  assert.equal((await request(`/marketplace/${created.body.id}/status`, {
    method: 'PATCH', cookie: otherStudentCookie, body: { status: 'sold' }
  })).status, 403);
  const sold = await request(`/marketplace/${created.body.id}/status`, {
    method: 'PATCH', cookie: studentCookie, body: { status: 'sold' }
  });
  assert.equal(sold.status, 200);
  assert.equal(sold.body.status, 'sold');
  assert.equal(sold.body.created_by_me, true);
});

test('study groups require membership for private discussions and validate messages', async () => {
  assert.equal((await request('/study-groups')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const otherStudentLogin = await request('/auth/login', {
    method: 'POST', body: { role: 'student', email: 'peer@example.test', password }
  });
  const trainerLogin = await request('/auth/demo', { method: 'POST', body: { role: 'trainer' } });
  const studentCookie = studentLogin.cookie;
  const otherStudentCookie = otherStudentLogin.cookie;
  const groupInput = {
    name: 'JavaScript Study Circle',
    subject: 'JavaScript',
    description: 'Practice JavaScript fundamentals and review examples together.'
  };

  assert.equal((await request('/study-groups', { method: 'POST', cookie: trainerLogin.cookie, body: groupInput })).status, 403);
  assert.equal((await request('/study-groups', { method: 'POST', cookie: studentCookie, body: { ...groupInput, name: 'x' } })).status, 400);
  const created = await request('/study-groups', { method: 'POST', cookie: studentCookie, body: groupInput });
  assert.equal(created.status, 201);
  assert.equal(created.body.member_count, 1);
  assert.equal(created.body.is_member, true);
  assert.equal('member_ids' in created.body, false);

  assert.equal((await request(`/study-groups/${created.body.id}/messages`, { cookie: otherStudentCookie })).status, 403);
  assert.equal((await request(`/study-groups/${created.body.id}/messages`, {
    method: 'POST', cookie: otherStudentCookie, body: { message: 'Trying to post before joining.' }
  })).status, 403);
  const joined = await request(`/study-groups/${created.body.id}/members`, {
    method: 'POST', cookie: otherStudentCookie, body: {}
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.member_count, 2);
  assert.equal(joined.body.is_member, true);
  const posted = await request(`/study-groups/${created.body.id}/messages`, {
    method: 'POST', cookie: otherStudentCookie, body: { message: 'Which topic should we start with?' }
  });
  assert.equal(posted.status, 201);
  assert.equal(posted.body.author_name, 'Sample Peer');
  assert.equal(posted.body.from_me, true);
  assert.equal('author_id' in posted.body, false);
  const messages = await request(`/study-groups/${created.body.id}/messages`, { cookie: studentCookie });
  assert.equal(messages.status, 200);
  assert.equal(messages.body.length, 1);
  assert.equal(messages.body[0].from_me, false);
});

test('campus club directory requires sign-in and returns searchable club details', async () => {
  assert.equal((await request('/clubs')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const clubs = await request('/clubs', { cookie: studentLogin.cookie });
  assert.equal(clubs.status, 200);
  assert.ok(clubs.body.length >= 5);
  assert.ok(clubs.body.some((club) => club.category === 'Technology'));
  assert.ok(clubs.body.every((club) => club.name && club.description && club.meeting_day && club.location));
});

test('campus map requires sign-in and returns location and accessibility details', async () => {
  assert.equal((await request('/campus-map')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const locations = await request('/campus-map', { cookie: studentLogin.cookie });
  assert.equal(locations.status, 200);
  assert.ok(locations.body.length >= 5);
  assert.ok(locations.body.every((location) => location.id && location.name && location.category && location.description && location.hours));
  assert.ok(locations.body.every((location) => location.x >= 0 && location.x <= 100 && location.y >= 0 && location.y <= 100));
});

test('club membership applications support student status, staff review, and safe resubmission', async () => {
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const peerLogin = await request('/auth/login', { method: 'POST', body: { role: 'student', email: 'peer@example.test', password } });
  const coordinatorLogin = await request('/auth/demo', { method: 'POST', body: { role: 'coordinator' } });
  const trainerLogin = await request('/auth/demo', { method: 'POST', body: { role: 'trainer' } });
  const studentCookie = studentLogin.cookie;
  const peerCookie = peerLogin.cookie;
  const coordinatorCookie = coordinatorLogin.cookie;
  const clubs = await request('/clubs', { cookie: studentCookie });
  assert.equal(clubs.status, 200);
  const clubId = clubs.body[0].id;

  assert.equal((await request('/club-memberships')).status, 401);
  assert.equal((await request('/club-memberships', { cookie: trainerLogin.cookie })).status, 403);
  assert.equal((await request(`/clubs/${clubId}/membership`, {
    method: 'POST', cookie: studentCookie, body: { motivation: 'short' }
  })).status, 400);
  const application = await request(`/clubs/${clubId}/membership`, {
    method: 'POST', cookie: studentCookie, body: { motivation: 'I would like to learn and contribute to club activities.' }
  });
  assert.equal(application.status, 201);
  assert.equal(application.body.status, 'pending');
  assert.equal('applicant_id' in application.body, false);
  assert.equal((await request(`/clubs/${clubId}/membership`, {
    method: 'POST', cookie: studentCookie, body: { motivation: 'I want to join this club too.' }
  })).status, 409);

  const myApplications = await request('/club-memberships', { cookie: studentCookie });
  assert.equal(myApplications.body[0].id, application.body.id);
  const staffApplications = await request('/club-memberships', { cookie: coordinatorCookie });
  assert.equal(typeof staffApplications.body[0].applicant_name, 'string');
  assert.ok(staffApplications.body[0].applicant_name.length > 0);
  assert.equal((await request(`/club-memberships/${application.body.id}`, {
    method: 'PATCH', cookie: trainerLogin.cookie, body: { status: 'approved' }
  })).status, 403);
  const reviewed = await request(`/club-memberships/${application.body.id}`, {
    method: 'PATCH', cookie: coordinatorCookie, body: { status: 'approved' }
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.status, 'approved');
  assert.equal((await request(`/club-memberships/${application.body.id}`, {
    method: 'PATCH', cookie: coordinatorCookie, body: { status: 'declined' }
  })).status, 409);
  assert.equal((await request('/club-memberships', { cookie: studentCookie })).body[0].status, 'approved');

  const peerApplication = await request(`/clubs/${clubId}/membership`, {
    method: 'POST', cookie: peerCookie, body: { motivation: 'I hope to meet students with similar interests.' }
  });
  const declined = await request(`/club-memberships/${peerApplication.body.id}`, {
    method: 'PATCH', cookie: coordinatorCookie, body: { status: 'declined' }
  });
  assert.equal(declined.body.status, 'declined');
  const resubmitted = await request(`/clubs/${clubId}/membership`, {
    method: 'POST', cookie: peerCookie, body: { motivation: 'I would like to apply again and take part.' }
  });
  assert.equal(resubmitted.status, 201);
  assert.equal(resubmitted.body.id, peerApplication.body.id);
  assert.equal(resubmitted.body.status, 'pending');
});

test('student directory only lists opted-in peers and lets students control visibility', async () => {
  assert.equal((await request('/student-directory')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const peerLogin = await request('/auth/login', { method: 'POST', body: { role: 'student', email: 'peer@example.test', password } });
  const trainerLogin = await request('/auth/demo', { method: 'POST', body: { role: 'trainer' } });
  const studentCookie = studentLogin.cookie;
  const peerCookie = peerLogin.cookie;

  assert.equal((await request('/student-directory', { cookie: trainerLogin.cookie })).status, 403);
  assert.equal((await request('/student-directory/visibility', {
    method: 'PATCH', cookie: studentCookie, body: { visible: 'yes' }
  })).status, 400);
  const peerOptIn = await request('/student-directory/visibility', {
    method: 'PATCH', cookie: peerCookie, body: { visible: true }
  });
  assert.equal(peerOptIn.status, 200);
  assert.equal(peerOptIn.body.visible, true);

  const directory = await request('/student-directory', { cookie: studentCookie });
  assert.equal(directory.status, 200);
  assert.equal(directory.body.visible, false);
  assert.deepEqual(directory.body.students.map((person) => person.id), ['u-other-student']);
  assert.equal('email' in directory.body.students[0], false);
  assert.equal('password_hash' in directory.body.students[0], false);

  assert.equal((await request('/student-directory/visibility', {
    method: 'PATCH', cookie: studentCookie, body: { visible: true }
  })).body.visible, true);
  const peerDirectory = await request('/student-directory', { cookie: peerCookie });
  assert.equal(peerDirectory.body.visible, true);
  assert.deepEqual(peerDirectory.body.students.map((person) => person.id), ['u-student']);

  assert.equal((await request('/student-directory/visibility', {
    method: 'PATCH', cookie: peerCookie, body: { visible: false }
  })).body.visible, false);
  assert.deepEqual((await request('/student-directory', { cookie: studentCookie })).body.students, []);
});

test('room bookings prevent double booking and restrict cancellation to the owner', async () => {
  assert.equal((await request('/room-bookings?date=2026-11-12')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const peerLogin = await request('/auth/login', { method: 'POST', body: { role: 'student', email: 'peer@example.test', password } });
  const studentCookie = studentLogin.cookie;
  const peerCookie = peerLogin.cookie;
  const bookingDate = new Date();
  bookingDate.setDate(bookingDate.getDate() + 1);
  while (bookingDate.getDay() === 0) bookingDate.setDate(bookingDate.getDate() + 1);
  const date = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}-${String(bookingDate.getDate()).padStart(2, '0')}`;
  const bookingInput = { roomId: 'innovation-lab', date, slot: '19:00', purpose: 'Student project session' };

  assert.equal((await request('/room-bookings?date=2026-02-31', { cookie: studentCookie })).status, 400);
  assert.equal((await request('/room-bookings', {
    method: 'POST', cookie: studentCookie, body: { ...bookingInput, slot: '19:30' }
  })).status, 400);
  const created = await request('/room-bookings', { method: 'POST', cookie: studentCookie, body: bookingInput });
  assert.equal(created.status, 201);
  assert.equal(created.body.room_name, 'Innovation Lab');
  assert.equal(created.body.ends_slot, '20:00');
  assert.equal(created.body.created_by_me, true);
  assert.equal('user_id' in created.body, false);

  const schedule = await request(`/room-bookings?date=${date}`, { cookie: peerCookie });
  assert.equal(schedule.body.length, 1);
  assert.equal(schedule.body[0].created_by_me, false);
  assert.equal((await request('/room-bookings', { method: 'POST', cookie: peerCookie, body: bookingInput })).status, 409);
  assert.equal((await request(`/room-bookings/${created.body.id}`, {
    method: 'DELETE', cookie: peerCookie
  })).status, 403);
  assert.equal((await request(`/room-bookings/${created.body.id}`, {
    method: 'DELETE', cookie: studentCookie
  })).status, 200);

  const replacement = await request('/room-bookings', { method: 'POST', cookie: peerCookie, body: bookingInput });
  assert.equal(replacement.status, 201);
  assert.equal(replacement.body.created_by_me, true);
});

test('library catalogue requires sign-in and searches sample titles and subjects', async () => {
  assert.equal((await request('/library-catalog')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const cookie = studentLogin.cookie;
  const catalogue = await request('/library-catalog', { cookie });
  assert.equal(catalogue.status, 200);
  assert.equal(catalogue.body.length, 8);
  assert.ok(catalogue.body.every((book) => book.title && book.author && book.isbn && book.shelf));
  assert.equal(catalogue.body.some((book) => book.available_copies === 0), true);
  assert.deepEqual((await request('/library-catalog?q=robotics', { cookie })).body.map((book) => book.id), ['book-robotics']);
  assert.deepEqual((await request('/library-catalog?q=BUSINESS', { cookie })).body.map((book) => book.id), ['book-business-basics', 'book-marketing']);
  assert.equal((await request(`/library-catalog?q=${'x'.repeat(101)}`, { cookie })).status, 400);
});

test('library seat bookings prevent conflicts and restrict cancellation', async () => {
  assert.equal((await request('/library-seat-bookings?date=2026-11-12')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const peerLogin = await request('/auth/login', { method: 'POST', body: { role: 'student', email: 'peer@example.test', password } });
  const studentCookie = studentLogin.cookie;
  const peerCookie = peerLogin.cookie;
  const bookingDate = new Date();
  bookingDate.setDate(bookingDate.getDate() + 1);
  while (bookingDate.getDay() === 0) bookingDate.setDate(bookingDate.getDate() + 1);
  const date = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}-${String(bookingDate.getDate()).padStart(2, '0')}`;
  const bookingInput = { seatId: 'quiet-01', date, slot: '18:00' };
  assert.equal((await request('/library-seat-bookings', {
    method: 'POST', cookie: studentCookie, body: { ...bookingInput, slot: '18:30' }
  })).status, 400);
  assert.equal((await request('/library-seat-bookings', {
    method: 'POST', cookie: studentCookie, body: { ...bookingInput, seatId: 'unknown-seat' }
  })).status, 400);
  const created = await request('/library-seat-bookings', { method: 'POST', cookie: studentCookie, body: bookingInput });
  assert.equal(created.status, 201);
  assert.equal(created.body.seat_name, 'Quiet desk 01');
  assert.equal(created.body.ends_slot, '19:00');
  assert.equal(created.body.created_by_me, true);
  assert.equal('user_id' in created.body, false);

  const schedule = await request(`/library-seat-bookings?date=${date}`, { cookie: peerCookie });
  assert.equal(schedule.body.length, 1);
  assert.equal(schedule.body[0].created_by_me, false);
  assert.equal((await request('/library-seat-bookings', { method: 'POST', cookie: peerCookie, body: bookingInput })).status, 409);
  assert.equal((await request(`/library-seat-bookings/${created.body.id}`, {
    method: 'DELETE', cookie: peerCookie
  })).status, 403);
  assert.equal((await request(`/library-seat-bookings/${created.body.id}`, {
    method: 'DELETE', cookie: studentCookie
  })).status, 200);
  assert.equal((await request('/library-seat-bookings', {
    method: 'POST', cookie: peerCookie, body: bookingInput
  })).status, 201);
});

test('course reviews allow students to submit and update one anonymous review per course', async () => {
  assert.equal((await request('/course-reviews')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const peerLogin = await request('/auth/login', { method: 'POST', body: { role: 'student', email: 'peer@example.test', password } });
  const trainerLogin = await request('/auth/demo', { method: 'POST', body: { role: 'trainer' } });
  const studentCookie = studentLogin.cookie;
  const peerCookie = peerLogin.cookie;
  const trainerCookie = trainerLogin.cookie;
  const initial = await request('/course-reviews', { cookie: studentCookie });
  assert.equal(initial.status, 200);
  assert.ok(initial.body.some((course) => course.id === 'c-product'));
  assert.equal((await request('/course-reviews', {
    method: 'POST', cookie: trainerCookie, body: { courseId: 'c-product', rating: 5, comment: 'Really enjoyed this course.' }
  })).status, 403);
  assert.equal((await request('/course-reviews', {
    method: 'POST', cookie: studentCookie, body: { courseId: 'c-product', rating: 6, comment: 'Really enjoyed this course.' }
  })).status, 400);
  assert.equal((await request('/course-reviews', {
    method: 'POST', cookie: studentCookie, body: { courseId: 'missing-course', rating: 5, comment: 'Really enjoyed this course.' }
  })).status, 404);
  const first = await request('/course-reviews', {
    method: 'POST', cookie: studentCookie, body: { courseId: 'c-product', rating: 4, comment: 'Clear lessons and useful project work.' }
  });
  assert.equal(first.status, 200);
  const second = await request('/course-reviews', {
    method: 'POST', cookie: studentCookie, body: { courseId: 'c-product', rating: 5, comment: 'Excellent material and helpful examples.' }
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.id, first.body.id);
  const peerReview = await request('/course-reviews', {
    method: 'POST', cookie: peerCookie, body: { courseId: 'c-product', rating: 3, comment: 'Good introduction to the topic.' }
  });
  assert.equal(peerReview.status, 200);
  const updated = await request('/course-reviews', { cookie: studentCookie });
  const courseReview = updated.body.find((course) => course.id === 'c-product');
  assert.equal(courseReview.review_count, 2);
  assert.equal(courseReview.average_rating, 4);
  assert.equal(courseReview.my_review.rating, 5);
  assert.equal(courseReview.reviews.length, 2);
  assert.ok(courseReview.reviews.every((review) => !('user_id' in review)));
});

test('campus transport routes are visible to signed-in users and updates are staff-managed', async () => {
  assert.equal((await request('/transport/updates')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const coordinatorLogin = await request('/auth/demo', { method: 'POST', body: { role: 'coordinator' } });
  const studentCookie = studentLogin.cookie;
  const coordinatorCookie = coordinatorLogin.cookie;
  const initial = await request('/transport/updates', { cookie: studentCookie });
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body.routes.map((route) => route.id), ['north-route', 'east-route', 'campus-loop']);
  assert.ok(initial.body.routes.every((route) => route.stops.length > 0));
  const input = { routeId: 'north-route', type: 'delay', message: 'North route is running 15 minutes late.' };
  assert.equal((await request('/transport/updates', { method: 'POST', cookie: studentCookie, body: input })).status, 403);
  assert.equal((await request('/transport/updates', {
    method: 'POST', cookie: coordinatorCookie, body: { ...input, routeId: 'unknown-route' }
  })).status, 400);
  assert.equal((await request('/transport/updates', {
    method: 'POST', cookie: coordinatorCookie, body: { ...input, message: 'late' }
  })).status, 400);
  const created = await request('/transport/updates', { method: 'POST', cookie: coordinatorCookie, body: input });
  assert.equal(created.status, 201);
  assert.equal(created.body.route_name, 'North Gate Shuttle');
  assert.equal('created_by' in created.body, false);
  const visible = await request('/transport/updates', { cookie: studentCookie });
  assert.equal(visible.body.updates.length, 1);
  assert.equal(visible.body.updates[0].message, input.message);
  assert.equal((await request(`/transport/updates/${created.body.id}`, {
    method: 'PATCH', cookie: studentCookie, body: { status: 'resolved' }
  })).status, 403);
  assert.equal((await request(`/transport/updates/${created.body.id}`, {
    method: 'PATCH', cookie: coordinatorCookie, body: { status: 'invalid' }
  })).status, 400);
  assert.equal((await request(`/transport/updates/${created.body.id}`, {
    method: 'PATCH', cookie: coordinatorCookie, body: { status: 'resolved' }
  })).status, 200);
  assert.deepEqual((await request('/transport/updates', { cookie: studentCookie })).body.updates, []);
});

test('canteen menu requires sign-in and returns daily meal and dietary information', async () => {
  assert.equal((await request('/canteen/menu?day=Monday')).status, 401);
  const studentLogin = await request('/auth/demo', { method: 'POST', body: { role: 'student' } });
  const cookie = studentLogin.cookie;
  const monday = await request('/canteen/menu?day=Monday', { cookie });
  assert.equal(monday.status, 200);
  assert.equal(monday.body.day, 'Monday');
  assert.equal(monday.body.meals.length, 4);
  assert.ok(monday.body.meals.every((meal) => meal.name && meal.price > 0 && meal.serving_time));
  assert.ok(monday.body.meals.some((meal) => meal.vegetarian));
  assert.ok(monday.body.meals.some((meal) => !meal.vegetarian));
  assert.equal((await request('/canteen/menu?day=Sunday', { cookie })).status, 400);
});
