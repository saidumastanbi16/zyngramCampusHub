import 'dotenv/config';
import { client, databasePromise } from '../server/db.js';

const assignments = [
  {
    courseId: 'c-product',
    title: 'Build a responsive course landing page',
    description: 'Create a small full-stack learning portal page that lists at least three course modules and includes a working enquiry form. Make the layout usable on mobile and desktop, then share a live HTTPS link to your project.'
  },
  {
    courseId: 'c-ui',
    title: 'Create a digital marketing campaign plan',
    description: 'Choose a sample product and prepare a one-week digital campaign plan. Include the target audience, campaign goal, key message, two digital channels, sample post copy, and one measure of success. Share a viewable HTTPS link.'
  },
  {
    courseId: 'c-portfolio',
    title: 'Prepare a monthly budget and cash-flow summary',
    description: 'Create a sample monthly budget with income, at least five expense categories, savings, and an ending balance. Add a short note explaining one change that could improve the balance, then share a viewable HTTPS link.'
  }
];

let database;
try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This sample assignment script is disabled in production.');
  }

  database = await databasePromise;
  const users = database.collection('users');
  const courses = database.collection('courses');
  const tasks = database.collection('tasks');
  const auditLog = database.collection('audit_log');
  const studentAccounts = await users.find({ role: 'student' }).sort({ name: 1 }).toArray();
  const courseRows = await courses.find({ _id: { $in: assignments.map(({ courseId }) => courseId) } }).toArray();
  const availableCourses = new Map(courseRows.map((course) => [course._id, course]));
  const missingCourse = assignments.find(({ courseId }) => !availableCourses.has(courseId));
  if (missingCourse) throw new Error(`Required sample course ${missingCourse.courseId} is missing; no assignments were created.`);

  const admin = await users.findOne({ role: 'admin' }, { projection: { _id: 1 } });
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const newTasks = [];
  const auditEntries = [];
  const assigned = [];
  const skipped = [];

  for (let index = 0; index < studentAccounts.length; index += 1) {
    const student = studentAccounts[index];
    const existingUnsubmittedTask = await tasks.findOne({
      learner_id: student._id,
      status: 'todo'
    }, { projection: { _id: 1 } });
    if (existingUnsubmittedTask) {
      skipped.push(student.name);
      continue;
    }

    const assignment = assignments[index % assignments.length];
    const taskId = `task-career-project-${student._id}`;
    const course = availableCourses.get(assignment.courseId);
    const createdAt = new Date().toISOString();
    newTasks.push({
      _id: taskId,
      learner_id: student._id,
      title: assignment.title,
      course_id: course._id,
      due_date: dueDate,
      status: 'todo',
      description: assignment.description,
      submission_url: null,
      feedback: null,
      updated_at: createdAt
    });
    auditEntries.push({
      actor_id: admin?._id || 'system:local-demo-assignment',
      action: 'task.assign',
      entity: 'task',
      entity_id: taskId,
      created_at: createdAt
    });
    assigned.push({ student: student.name, assignment: assignment.title, course: course.title });
  }

  if (newTasks.length) {
    await tasks.insertMany(newTasks);
    await auditLog.insertMany(auditEntries);
  }

  console.log(`Assigned ${newTasks.length} sample task(s); ${skipped.length} student(s) already had an unsubmitted assignment.`);
  console.table(assigned);
  if (skipped.length) console.log(`Existing unsubmitted assignments retained for: ${skipped.join(', ')}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
