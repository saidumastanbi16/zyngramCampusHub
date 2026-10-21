import bcrypt from 'bcryptjs';
import db from '../server/db-sqlite.js';

console.log('Seeding SQLite database...');

// Clear existing data
db.prepare('DELETE FROM audit_logs').run();
db.prepare('DELETE FROM support_tickets').run();
db.prepare('DELETE FROM attendance').run();
db.prepare('DELETE FROM tasks').run();
db.prepare('DELETE FROM announcements').run();
db.prepare('DELETE FROM courses').run();
db.prepare('DELETE FROM users').run();

// Create users
const users = [
  { name: 'Priya Nair', email: 'priya.demo@example.test', role: 'trainer', cohort: 'Cohort A', avatar: 'PN' },
  { name: 'Arjun Rao', email: 'arjun.trainer@example.test', role: 'trainer', cohort: 'Cohort B', avatar: 'AR' },
  { name: 'Neha Varma', email: 'neha.trainer@example.test', role: 'trainer', cohort: 'Cohort C', avatar: 'NV' },
  { name: 'Admin User', email: 'admin@zyngram.test', role: 'admin', cohort: 'Staff', avatar: 'AD' },
  { name: 'Coordinator User', email: 'coordinator@zyngram.test', role: 'coordinator', cohort: 'Staff', avatar: 'CO' },
  { name: 'Student 1', email: 'student1@example.test', role: 'student', cohort: 'Cohort A', avatar: 'S1' },
  { name: 'Student 2', email: 'student2@example.test', role: 'student', cohort: 'Cohort B', avatar: 'S2' },
  { name: 'Student 3', email: 'student3@example.test', role: 'student', cohort: 'Cohort C', avatar: 'S3' },
];

const passwordHash = await bcrypt.hash('password123', 10);
const userIds = {};

for (const user of users) {
  const stmt = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, cohort, avatar)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(user.name, user.email, passwordHash, user.role, user.cohort, user.avatar);
  userIds[user.email] = result.lastInsertRowid;
  console.log(`Created user: ${user.name} (${user.role})`);
}

// Create courses
const courses = [
  { title: 'Full Stack Web Development', track: 'Product Engineering', trainer_id: userIds['priya.demo@example.test'], duration: '12 weeks', color: '#6e5b80' },
  { title: 'Digital Marketing', track: 'UI/UX Design', trainer_id: userIds['arjun.trainer@example.test'], duration: '8 weeks', color: '#65836f' },
  { title: 'Finance Fundamentals', track: 'Portfolio Management', trainer_id: userIds['neha.trainer@example.test'], duration: '10 weeks', color: '#e8a87c' },
];

const courseIds = {};
for (const course of courses) {
  const stmt = db.prepare(`
    INSERT INTO courses (title, track, trainer_id, duration, color, progress, next_session)
    VALUES (?, ?, ?, ?, ?, 65, '2026-10-20')
  `);
  const result = stmt.run(course.title, course.track, course.trainer_id, course.duration, course.color);
  courseIds[course.title] = result.lastInsertRowid;
  console.log(`Created course: ${course.title}`);
}

// Create tasks
const tasks = [
  { learner_id: userIds['student1@example.test'], course_id: courseIds['Full Stack Web Development'], title: 'Build a React App', due_date: '2026-10-25', status: 'todo', description: 'Create a simple React application with components' },
  { learner_id: userIds['student2@example.test'], course_id: courseIds['Digital Marketing'], title: 'Campaign Strategy', due_date: '2026-10-24', status: 'in_review', description: 'Design a marketing campaign for a product' },
  { learner_id: userIds['student3@example.test'], course_id: courseIds['Finance Fundamentals'], title: 'Budget Analysis', due_date: '2026-10-26', status: 'complete', description: 'Analyze a company budget and provide recommendations', feedback: 'Good analysis, consider adding more detail on cost savings.' },
];

for (const task of tasks) {
  const stmt = db.prepare(`
    INSERT INTO tasks (learner_id, course_id, title, due_date, status, description, feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(task.learner_id, task.course_id, task.title, task.due_date, task.status, task.description, task.feedback || null);
  console.log(`Created task: ${task.title}`);
}

// Create attendance
const attendance = [
  { user_id: userIds['student1@example.test'], course_id: courseIds['Full Stack Web Development'], session_date: '2026-10-15', status: 'present', recorded_by: userIds['priya.demo@example.test'] },
  { user_id: userIds['student2@example.test'], course_id: courseIds['Digital Marketing'], session_date: '2026-10-15', status: 'late', recorded_by: userIds['arjun.trainer@example.test'] },
  { user_id: userIds['student3@example.test'], course_id: courseIds['Finance Fundamentals'], session_date: '2026-10-15', status: 'present', recorded_by: userIds['neha.trainer@example.test'] },
];

for (const att of attendance) {
  const stmt = db.prepare(`
    INSERT INTO attendance (user_id, course_id, session_date, status, recorded_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(att.user_id, att.course_id, att.session_date, att.status, att.recorded_by);
  console.log(`Created attendance record`);
}

// Create announcements
const announcements = [
  { title: 'Welcome to Zyngram Campus Hub', body: 'We are excited to launch our new learning management platform. Explore the courses and modules available.', audience: 'all', category: 'general', publisher_id: userIds['coordinator@zyngram.test'] },
  { title: 'New Course Schedule', body: 'The course schedule for next week has been updated. Please check your dashboard.', audience: 'students', category: 'schedule', publisher_id: userIds['coordinator@zyngram.test'] },
];

for (const ann of announcements) {
  const stmt = db.prepare(`
    INSERT INTO announcements (title, body, audience, category, publisher_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(ann.title, ann.body, ann.audience, ann.category, ann.publisher_id);
  console.log(`Created announcement: ${ann.title}`);
}

// Create support tickets
const tickets = [
  { user_id: userIds['student1@example.test'], topic: 'Learning & coursework', message: 'I need help with the React assignment.', status: 'open' },
  { user_id: userIds['student2@example.test'], topic: 'Schedule & attendance', message: 'When is the next class session?', status: 'resolved' },
];

for (const ticket of tickets) {
  const stmt = db.prepare(`
    INSERT INTO support_tickets (user_id, topic, message, status)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(ticket.user_id, ticket.topic, ticket.message, ticket.status);
  console.log(`Created support ticket`);
}

console.log('Database seeded successfully!');
console.log('\nDemo credentials:');
console.log('All users: password123');
console.log('Admin: admin@zyngram.test');
console.log('Coordinator: coordinator@zyngram.test');
console.log('Trainers: priya.demo@example.test, arjun.trainer@example.test, neha.trainer@example.test');
console.log('Students: student1@example.test, student2@example.test, student3@example.test');
