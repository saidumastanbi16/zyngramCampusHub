const demoUsers = [
  { id: 'demo-trainer-priya', name: 'Priya Nair', email: 'priya.demo@example.test', role: 'trainer', cohort: 'Teaching team · Demo' },
  { id: 'demo-trainer-arjun', name: 'Arjun Rao', email: 'arjun.trainer@example.test', role: 'trainer', cohort: 'Teaching team · Demo' },
  { id: 'demo-trainer-neha', name: 'Neha Varma', email: 'neha.trainer@example.test', role: 'trainer', cohort: 'Teaching team · Demo' },
  { id: 'demo-coordinator-kiran', name: 'Kiran Das', email: 'kiran.demo@example.test', role: 'coordinator', cohort: 'Hyderabad campus · Demo' },
  { id: 'demo-student-aarav', name: 'Aarav Reddy', email: 'aarav.demo@example.test', role: 'student', cohort: 'Cohort 08 · Demo' },
  ...['Mastan', 'Harini', 'Lokesh', 'Summi', 'Sumera', 'Hafiz', 'Azimina', 'Karishma', 'Parveen']
    .map((name) => ({ id: `demo-student-${name.toLowerCase()}`, name, email: `${name.toLowerCase()}.demo@example.test`, role: 'student', cohort: 'Cohort 08 · Demo' })),
  ...['Devika', 'Rahul', 'Sneha', 'Imran', 'Pooja', 'Nikhil']
    .map((name) => ({ id: `demo-student-${name.toLowerCase()}`, name: `${name} (fictional demo)`, email: `${name.toLowerCase()}.demo@example.test`, role: 'student', cohort: 'Cohort 08 · Demo' }))
];

const demoCourses = [
  { _id: 'demo-course-full-stack', title: 'Full Stack Web Development', track: 'Software Development', trainerEmail: 'priya.demo@example.test', duration: '16 weeks', progress: 35, next_session: 'Upcoming · Schedule with your trainer', color: 'lilac' },
  { _id: 'demo-course-digital-marketing', title: 'Digital Marketing', track: 'Marketing & Growth', trainerEmail: 'arjun.trainer@example.test', duration: '10 weeks', progress: 20, next_session: 'Upcoming · Schedule with your trainer', color: 'peach' },
  { _id: 'demo-course-finance', title: 'Finance Fundamentals', track: 'Finance & Accounting', trainerEmail: 'neha.trainer@example.test', duration: '12 weeks', progress: 15, next_session: 'Upcoming · Schedule with your trainer', color: 'mint' }
];

const demoAssignments = [
  { courseTitle: 'Full Stack Web Development', title: 'Build a responsive course landing page', description: 'Create a responsive learning portal landing page with at least three course modules and a working enquiry form.' },
  { courseTitle: 'Digital Marketing', title: 'Create a digital marketing campaign plan', description: 'Prepare a one-week campaign plan with a target audience, message, channels, sample post, and a measure of success.' },
  { courseTitle: 'Finance Fundamentals', title: 'Prepare a monthly budget summary', description: 'Create a sample monthly budget with income, expenses, savings, and a short cash-flow explanation.' }
];
const demoLessons = [
  { _id: 'lesson-demo-full-stack-html', courseTitle: 'Full Stack Web Development', title: 'HTML foundations', description: 'Build a semantic page structure with accessible HTML.', week_number: 1, position: 1, status: 'published', resources: [{ type: 'video', title: 'HTML crash course', url: 'https://www.youtube.com/watch?v=UB1O30fR-EE' }, { type: 'note', title: 'HTML element reference', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element' }] },
  { _id: 'lesson-demo-full-stack-css', courseTitle: 'Full Stack Web Development', title: 'Responsive CSS', description: 'Create adaptable layouts with modern CSS.', week_number: 2, position: 2, status: 'published', resources: [{ type: 'video', title: 'CSS crash course', url: 'https://www.youtube.com/watch?v=yfoY53QXEnI' }, { type: 'note', title: 'Responsive design guide', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design' }] },
  { _id: 'lesson-demo-full-stack-js', courseTitle: 'Full Stack Web Development', title: 'JavaScript essentials', description: 'Practice browser JavaScript, functions, and events.', week_number: 3, position: 3, status: 'published', resources: [{ type: 'video', title: 'JavaScript fundamentals', url: 'https://www.youtube.com/watch?v=PkZNo7MFNFg' }, { type: 'note', title: 'JavaScript reference', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide' }] },
  { _id: 'lesson-demo-marketing-audience', courseTitle: 'Digital Marketing', title: 'Audience research', description: 'Define customer segments and campaign objectives.', week_number: 1, position: 1, status: 'published', resources: [{ type: 'video', title: 'Target audience workshop', url: 'https://www.youtube.com/watch?v=LjS7Nb8FfSg' }, { type: 'note', title: 'Marketing audience guide', url: 'https://support.google.com/google-ads/answer/2497941' }] },
  { _id: 'lesson-demo-marketing-content', courseTitle: 'Digital Marketing', title: 'Content strategy', description: 'Plan channel content around a clear campaign message.', week_number: 2, position: 2, status: 'published', resources: [{ type: 'video', title: 'Digital marketing strategy', url: 'https://www.youtube.com/watch?v=bixR-KIJKYM' }, { type: 'note', title: 'Content strategy basics', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }] },
  { _id: 'lesson-demo-marketing-analytics', courseTitle: 'Digital Marketing', title: 'Campaign analytics', description: 'Measure reach, engagement, conversion, and return.', week_number: 3, position: 3, status: 'published', resources: [{ type: 'video', title: 'Marketing analytics overview', url: 'https://www.youtube.com/watch?v=9w8c0k6D9bE' }, { type: 'note', title: 'Campaign measurement', url: 'https://support.google.com/analytics/answer/9143382' }] },
  { _id: 'lesson-demo-finance-budget', courseTitle: 'Finance Fundamentals', title: 'Personal budgeting', description: 'Plan income, spending, savings, and flexible costs.', week_number: 1, position: 1, status: 'published', resources: [{ type: 'video', title: 'Budgeting fundamentals', url: 'https://www.youtube.com/watch?v=Qv8IfUFTXq8' }, { type: 'note', title: 'Budget planning guide', url: 'https://www.consumerfinance.gov/consumer-tools/budgeting/' }] },
  { _id: 'lesson-demo-finance-statements', courseTitle: 'Finance Fundamentals', title: 'Financial statements', description: 'Read income statements and understand cash flow.', week_number: 2, position: 2, status: 'published', resources: [{ type: 'video', title: 'Financial statements explained', url: 'https://www.youtube.com/watch?v=Z5K9P6ZP5Bw' }, { type: 'note', title: 'Financial statement basics', url: 'https://www.investopedia.com/terms/f/financial-statements.asp' }] },
  { _id: 'lesson-demo-finance-forecast', courseTitle: 'Finance Fundamentals', title: 'Cash-flow forecasting', description: 'Forecast monthly cash flow and manage uncertainty.', week_number: 3, position: 3, status: 'published', resources: [{ type: 'video', title: 'Cash flow tutorial', url: 'https://www.youtube.com/watch?v=Y0yM5v0M6hQ' }, { type: 'note', title: 'Cash flow guide', url: 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-budget-en-yes-i-can-spend-less/' }] }
];

const demoAnnouncements = [
  { _id: 'demo-announcement-welcome', title: 'Welcome to the demo campus', body: 'These fictional sample records help demonstrate the campus learning workflows.', audience: 'All learners', category: 'Demo update' },
  { _id: 'demo-announcement-learning', title: 'Explore your learning pathways', body: 'Browse your assigned learning path and check with a trainer for upcoming session details.', audience: 'All learners', category: 'Learning' }
];

export async function provisionDemoData(database, actorId) {
  const users = database.collection('users');
  const courses = database.collection('courses');
  const tasks = database.collection('tasks');
  const announcements = database.collection('announcements');
  const auditLog = database.collection('audit_log');

  const existingUsers = await users.find({ email: { $in: demoUsers.map((person) => person.email) } }).toArray();
  const usersByEmail = new Map(existingUsers.map((person) => [person.email, person]));
  const roleConflict = demoUsers.find((person) => {
    const existing = usersByEmail.get(person.email);
    return existing && existing.role !== person.role;
  });
  if (roleConflict) {
    throw new Error(`The existing account for ${roleConflict.email} has a different role; demo data was not imported.`);
  }
  const userOperations = [];
  for (const person of demoUsers) {
    if (usersByEmail.has(person.email)) continue;
    const created = {
      _id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      cohort: person.cohort,
      avatar: person.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      password_hash: null,
      created_at: new Date().toISOString(),
      demo: true
    };
    const result = await users.updateOne(
      { email: created.email },
      { $setOnInsert: created },
      { upsert: true }
    );
    const personRecord = result.upsertedCount
      ? created
      : await users.findOne({ email: created.email });
    usersByEmail.set(created.email, personRecord);
    if (result.upsertedCount) {
      userOperations.push({
        actor_id: actorId, action: 'demo.user.create', entity: 'user', entity_id: personRecord._id,
        created_at: created.created_at
      });
    }
  }

  const courseOperations = [];
  for (const course of demoCourses) {
    const trainer = usersByEmail.get(course.trainerEmail);
    const { trainerEmail, ...fields } = course;
    const document = { ...fields, trainer_id: trainer._id, demo: true };
    const result = await courses.updateOne(
      { title: document.title },
      { $setOnInsert: document },
      { upsert: true }
    );
    if (result.upsertedCount) {
      courseOperations.push({
        actor_id: actorId, action: 'demo.course.create', entity: 'course', entity_id: document._id,
        created_at: new Date().toISOString()
      });
    }
  }

  const preparedCourses = await courses.find({ title: { $in: demoCourses.map((course) => course.title) } }).toArray();
  const courseIdByTitle = new Map(preparedCourses.map((course) => [course.title, course._id]));
  if (courseIdByTitle.size !== demoCourses.length) throw new Error('A demo course could not be prepared; no student tasks were added.');
  const lessons = database.collection('lessons');
  for (const lesson of demoLessons) {
    const courseId = courseIdByTitle.get(lesson.courseTitle);
    const { courseTitle, ...fields } = lesson;
    await lessons.updateOne({ _id: lesson._id }, { $set: { ...fields, course_id: courseId, demo: true } }, { upsert: true });
  }
  const studentRecords = demoUsers.filter((person) => person.role === 'student').map((person) => usersByEmail.get(person.email));
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const taskOperations = [];
  for (const [index, learner] of studentRecords.entries()) {
    const assignment = demoAssignments[index % demoAssignments.length];
    const task = {
      _id: `demo-task-${learner._id}`,
      learner_id: learner._id,
      course_id: courseIdByTitle.get(assignment.courseTitle),
      title: assignment.title,
      description: assignment.description,
      due_date: dueDate,
      status: 'todo',
      submission_url: null,
      feedback: null,
      created_by: actorId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      demo: true
    };
    const { course_id, ...taskWithoutCourseId } = task;
    const result = await tasks.updateOne(
      { _id: task._id },
      { $set: { course_id: task.course_id }, $setOnInsert: taskWithoutCourseId },
      { upsert: true }
    );
    if (result.upsertedCount) {
      taskOperations.push({
        actor_id: actorId, action: 'demo.task.assign', entity: 'task', entity_id: task._id,
        created_at: task.created_at
      });
    }
  }

  const announcementOperations = [];
  for (const notice of demoAnnouncements) {
    const document = { ...notice, published_at: new Date().toISOString().slice(0, 10), demo: true, publisher_id: actorId };
    const result = await announcements.updateOne(
      { _id: document._id },
      { $setOnInsert: document },
      { upsert: true }
    );
    if (result.upsertedCount) {
      announcementOperations.push({
        actor_id: actorId, action: 'demo.announcement.create', entity: 'announcement', entity_id: document._id,
        created_at: new Date().toISOString()
      });
    }
  }

  const auditEntries = [...userOperations, ...courseOperations, ...taskOperations, ...announcementOperations];
  if (auditEntries.length) await auditLog.insertMany(auditEntries);
  return {
    users: userOperations.length,
    courses: courseOperations.length,
    tasks: taskOperations.length,
    announcements: announcementOperations.length,
    alreadyPresent: auditEntries.length === 0
  };
}
