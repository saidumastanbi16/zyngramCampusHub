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
const { app, client, db, runUpcomingExamReminders } = await import('../server/index.js');
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
  assert.equal((await request('/tasks', { method: 'POST', cookie: trainerLogin.cookie, body: {
    courseId: 'c-product', learnerId: 'u-unassigned-student', title: 'Wrong scope task', description: 'This student is not on the course.', dueDate: '2026-11-20'
  } })).status, 404);
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
  assert.equal((await request('/announcements', { cookie: unassignedLogin.cookie })).body.some((item) => item.id === trainerAnnouncement.body.id), false);
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
  assert.equal(trainerProgress.body.learners.some((learner) => learner.id === 'u-unassigned-student'), false);
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
  assert.equal((await request('/certificates', { cookie: studentCookie })).body.some((certificate) => certificate.course_id === 'c-product'), true);
  assert.equal((await request('/exams', { cookie: trainerLogin.cookie })).body.find((exam) => exam.id === createdExam.body.id).attempts[0].learner_name, 'Aarav Reddy');

  const internshipPayload = {
    title: 'Frontend engineering intern', organization: 'Zyngram Studio', description: 'Build and test accessible web features with the product team.', applyBy: '2026-12-01', courseId: 'c-product'
  };
  const placementPayload = {
    title: 'Product designer', organization: 'CampusWorks', description: 'Design and improve the student journey for a product team.', applyBy: '2026-12-10', courseId: 'c-product', type: 'placement', location: 'Hyderabad', workMode: 'Hybrid', stage: 'screening', salary: '₹12 LPA'
  };
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
  const application = await uploadResume(`/internships/${internship.body.id}/apply`, studentCookie);
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
  const registration = await request('/student-registration-requests', { method: 'POST', body: {
    name: 'New Campus Learner', email: 'new.campus.learner@example.test', cohort: 'Cohort 10'
  } });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.notification.sent, false);
  assert.match(registration.body.notification.message, /not configured/);
  assert.equal((await request('/student-registration-requests', { cookie: studentCookie })).status, 403);
  assert.equal((await request('/student-registration-requests')).status, 401);
  assert.equal((await request('/student-registration-requests', { method: 'POST', body: {
    name: 'Duplicate Request', email: 'new.campus.learner@example.test', cohort: 'Cohort 10'
  } })).status, 409);
  const pendingRegistrations = await request('/student-registration-requests', { cookie: adminLogin.cookie });
  assert.equal(pendingRegistrations.status, 200);
  assert.equal(pendingRegistrations.body.find((item) => item.id === registration.body.requestId)?.status, 'pending');
  const approvedRegistration = await request(`/student-registration-requests/${registration.body.requestId}`, {
    method: 'PATCH', cookie: adminLogin.cookie, body: { status: 'approved' }
  });
  assert.equal(approvedRegistration.status, 200);
  assert.equal(approvedRegistration.body.user.email, 'new.campus.learner@example.test');
  assert.equal(approvedRegistration.body.user.role, 'student');
  assert.equal('password_hash' in approvedRegistration.body.user, false);
  assert.equal((await request('/users', { cookie: adminLogin.cookie })).body.some((item) => item.email === 'new.campus.learner@example.test'), true);
  const rejectedRegistration = await request('/student-registration-requests', { method: 'POST', body: {
    name: 'Declined Candidate', email: 'declined.candidate@example.test', cohort: 'Cohort 10'
  } });
  assert.equal(rejectedRegistration.status, 201);
  assert.equal((await request(`/student-registration-requests/${rejectedRegistration.body.requestId}`, {
    method: 'PATCH', cookie: adminLogin.cookie, body: { status: 'rejected' }
  })).body.status, 'rejected');
  assert.equal((await request('/users', { cookie: adminLogin.cookie })).body.some((item) => item.email === 'declined.candidate@example.test'), false);
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
    learnerId: 'u-unassigned-student', unlockedWeek: 4, reason: 'This learner is not enrolled in my assigned course.'
  } })).status, 404);
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
    { courses: 3, tasks: 16, announcements: 2 }
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
