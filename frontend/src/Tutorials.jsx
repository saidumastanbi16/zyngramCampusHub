import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, Clock3, Code2, Download, GraduationCap, Search } from 'lucide-react';

const tutorialCourses = [
  {
    id: 'java', title: 'Java Programming', category: 'Programming', level: 'Beginner', duration: '6 lessons', accent: 'java',
    description: 'Learn the building blocks of Java, then put them together in a small command-line program.',
    lessons: [
      { title: 'Your first Java program', duration: '7 min', text: 'Java source code lives in classes. The main method is where a simple application begins. The file name should match the public class name.', code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, campus!");\n    }\n}', takeaway: 'Compile with javac Main.java, then run with java Main.' },
      { title: 'Variables and types', duration: '9 min', text: 'A variable gives a name to a value. Java checks types before a program runs, which helps catch accidental conversions early.', code: 'String learner = "Aarav";\nint completedLessons = 3;\ndouble attendanceRate = 0.92;\nboolean certificateReady = false;\n\nSystem.out.println(learner + " has " + completedLessons + " lessons left.");', takeaway: 'Use int for whole numbers, double for decimal values, boolean for true or false, and String for text.' },
      { title: 'Decisions with if and else', duration: '8 min', text: 'Use a condition when a program needs to choose between actions. A boolean expression is evaluated before one branch runs.', code: 'int score = 84;\nint passMark = 70;\n\nif (score >= passMark) {\n    System.out.println("Level unlocked");\n} else {\n    System.out.println("Review and try again");\n}', takeaway: 'The comparison operators ==, !=, <, <=, >, and >= produce a boolean result.' },
      { title: 'Repeat work with loops', duration: '10 min', text: 'Loops repeat a block of code. A for loop is useful when the number of repetitions is known; a while loop continues while its condition is true.', code: 'String[] topics = {"Types", "Conditions", "Loops"};\n\nfor (int index = 0; index < topics.length; index++) {\n    System.out.println((index + 1) + ". " + topics[index]);\n}', takeaway: 'Start at index zero for arrays, and stop before index reaches array.length.' },
      { title: 'Methods and reusable logic', duration: '9 min', text: 'A method names a unit of work. Parameters provide input, and a return type tells Java what value comes back.', code: 'static int lessonsRemaining(int total, int completed) {\n    return total - completed;\n}\n\npublic static void main(String[] args) {\n    int remaining = lessonsRemaining(6, 4);\n    System.out.println(remaining);\n}', takeaway: 'Keep methods focused: one clear task, meaningful parameter names, and an explicit return type.' },
      { title: 'Classes and objects', duration: '12 min', text: 'A class describes data and behavior. An object is one instance of that description. Fields hold state; constructors set initial values.', code: 'class Course {\n    String title;\n    int lessonCount;\n\n    Course(String title, int lessonCount) {\n        this.title = title;\n        this.lessonCount = lessonCount;\n    }\n}', takeaway: 'Create an object with new Course("Java Programming", 6), then access its fields or methods.' }
    ]
  },
  {
    id: 'python', title: 'Python Essentials', category: 'Programming', level: 'Beginner', duration: '4 lessons', accent: 'python',
    description: 'Get comfortable with values, branching, loops, and small reusable functions.',
    lessons: [
      { title: 'Values and variables', duration: '6 min', text: 'Python variables refer to values. The interpreter infers the value type, while clear names keep code readable.', code: 'learner = "Aarav"\nlessons_completed = 3\nprogress = 0.5\nprint(f"{learner}: {lessons_completed} lessons")', takeaway: 'Use snake_case for variable and function names.' },
      { title: 'Branching', duration: '7 min', text: 'if, elif, and else select a path. Indentation defines which statements belong to each branch.', code: 'score = 84\nif score >= 70:\n    print("Level unlocked")\nelse:\n    print("Try again")', takeaway: 'A colon starts a block; consistent indentation forms the block.' },
      { title: 'Loops and lists', duration: '8 min', text: 'Lists keep ordered values, and a for loop processes each value in turn.', code: 'topics = ["Types", "Loops", "Functions"]\nfor number, topic in enumerate(topics, start=1):\n    print(number, topic)', takeaway: 'enumerate is a clear way to get both an index and an item.' },
      { title: 'Write a function', duration: '8 min', text: 'Functions package reusable logic. Parameters are inputs; return sends a result back to the caller.', code: 'def lessons_remaining(total, completed):\n    return total - completed\n\nprint(lessons_remaining(4, 2))', takeaway: 'A function should have one clear responsibility.' }
    ]
  },
  {
    id: 'web', title: 'Web Foundations', category: 'Web development', level: 'Beginner', duration: '4 lessons', accent: 'web',
    description: 'Understand the pieces of a web page and make a small interface respond to user input.',
    lessons: [
      { title: 'Structure with HTML', duration: '6 min', text: 'HTML describes the meaning and structure of a page. Semantic elements make content easier to navigate and maintain.', code: '<main>\n  <h1>Course progress</h1>\n  <p>Three lessons completed.</p>\n  <button type="button">Continue</button>\n</main>', takeaway: 'Choose elements for their meaning, not only for their default appearance.' },
      { title: 'Style with CSS', duration: '8 min', text: 'CSS rules match elements and define how they look. Classes let you style a group of related elements.', code: '.progress {\n  width: 100%;\n  min-height: 12px;\n  background: #e5eee9;\n}\n\n.progress span {\n  display: block;\n  width: 60%;\n  background: #26735e;\n}', takeaway: 'Keep repeated colors and spacing in CSS custom properties.' },
      { title: 'Add behavior with JavaScript', duration: '9 min', text: 'JavaScript responds to events and updates the page. Attach behavior to a control the learner can activate.', code: 'const button = document.querySelector("button");\nbutton.addEventListener("click", () => {\n  button.textContent = "Lesson opened";\n});', takeaway: 'Use semantic controls and visible feedback for interactions.' },
      { title: 'Connect the pieces', duration: '10 min', text: 'A browser requests HTML, then loads CSS and JavaScript. The DOM represents the page structure that scripts can inspect.', code: '<link rel="stylesheet" href="styles.css">\n<script src="app.js" defer></script>', takeaway: 'The defer attribute lets HTML parsing finish before the script runs.' }
    ]
  }
];

function readProgress(userId) {
  try { return JSON.parse(localStorage.getItem(`campus-tutorial-progress:${userId}`) || '{}'); }
  catch { return {}; }
}
function printTutorialCertificate(course, learnerName, userId) {
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const popup = window.open('', '_blank', 'width=1000,height=760');
  if (!popup) return;
  const certificateId = `tutorial-${course.id}-${userId}`;
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(course.title)} certificate</title><style>
    @page{size:landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;padding:24px;background:#eef1ed;color:#16272b;font-family:Georgia,'Times New Roman',serif}.certificate{min-height:calc(100vh - 48px);padding:10mm;border:2px solid #b37a4c;outline:1px solid #b37a4c;outline-offset:-14px;display:grid;place-content:center;text-align:center;background:#fff}.brand{font:700 12px Arial,sans-serif;letter-spacing:3px;color:#31756c}.mark{margin:26px auto 4px;color:#b37a4c;font-size:28px}.eyebrow{font:700 10px Arial,sans-serif;letter-spacing:2px;color:#607570}.title{margin:10px 0 18px;font-size:42px;font-weight:400}.name{margin:8px 0;font-size:34px;color:#31756c}.course{max-width:780px;margin:12px auto;font-size:24px}.detail{margin-top:26px;font:12px Arial,sans-serif;color:#607570}.id{margin-top:8px;font:10px Arial,sans-serif;color:#85918d}@media print{body{padding:0;background:#fff}.certificate{min-height:180mm}}
    </style></head><body><main class="certificate"><div class="brand">ZYNGRAM · CAMPUS HUB</div><div class="mark">✳</div><div class="eyebrow">TUTORIAL COMPLETION</div><h1 class="title">This is proudly presented to</h1><div class="name">${escapeHtml(learnerName)}</div><p>for completing every lesson in</p><div class="course">${escapeHtml(course.title)}</div><p>${course.lessons.length} guided lessons · ${escapeHtml(course.category)}</p><div class="detail">Issued ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div><div class="id">Certificate ID · ${escapeHtml(certificateId)}</div></main></body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

export default function Tutorials({ user }) {
  const [selectedId, setSelectedId] = useState('');
  const [lessonIndex, setLessonIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState(() => readProgress(user.id));
  useEffect(() => {
    localStorage.setItem(`campus-tutorial-progress:${user.id}`, JSON.stringify(progress));
  }, [progress, user.id]);

  const selected = tutorialCourses.find((course) => course.id === selectedId);
  const visibleCourses = tutorialCourses.filter((course) => `${course.title} ${course.category} ${course.description}`.toLowerCase().includes(query.toLowerCase()));
  const completeLesson = (course) => {
    setProgress((current) => ({ ...current, [course.id]: [...new Set([...(current[course.id] || []), lessonIndex])] }));
  };

  if (selected) {
    const lesson = selected.lessons[lessonIndex];
    const completed = progress[selected.id] || [];
    const percentage = Math.round(completed.length / selected.lessons.length * 100);
    const courseComplete = completed.length === selected.lessons.length;
    return <div className="page-content tutorial-page">
      <button className="tutorial-back" onClick={() => setSelectedId('')}><ArrowLeft size={15} /> Tutorial library</button>
      <section className={`tutorial-detail-hero ${selected.accent}`}><div><p className="eyebrow">{selected.category} · {selected.level}</p><h1>{selected.title}</h1><p>{selected.description}</p></div><span className="tutorial-detail-mark"><Code2 size={27} />{selected.id.toUpperCase()}</span></section>
      <div className="tutorial-study-layout"><aside className="panel tutorial-lesson-list"><div className="tutorial-progress-heading"><span><b>Course progress</b><small>{completed.length} of {selected.lessons.length} lessons complete</small></span><strong>{percentage}%</strong></div><div className="progress-track" role="progressbar" aria-valuenow={percentage} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percentage}%` }} /></div>{selected.lessons.map((item, index) => <button className={`tutorial-lesson-choice ${index === lessonIndex ? 'active' : ''}`} key={item.title} onClick={() => setLessonIndex(index)}><span className={completed.includes(index) ? 'done' : ''}>{completed.includes(index) ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><span><b>{item.title}</b><small>{item.duration}</small></span></button>)}</aside>
        <article className="panel tutorial-lesson-content"><p className="eyebrow">LESSON {String(lessonIndex + 1).padStart(2, '0')} · {lesson.duration}</p><h2>{lesson.title}</h2><p>{lesson.text}</p><div className="tutorial-code-heading"><span>EXAMPLE</span><span>{selected.id === 'web' ? 'HTML · CSS · JS' : selected.id.toUpperCase()}</span></div><pre className="tutorial-code"><code>{lesson.code}</code></pre><p className="tutorial-takeaway"><GraduationCap size={17} /><span><b>Keep in mind</b>{lesson.takeaway}</span></p>{courseComplete && <div className="tutorial-certificate-ready"><Award size={19} /><span><b>Tutorial complete</b><small>Your course certificate is ready.</small></span><button className="button-secondary small" onClick={() => printTutorialCertificate(selected, user.name, user.id)}><Download size={14} /> Certificate</button></div>}<div className="tutorial-controls"><button className="button-secondary" disabled={lessonIndex === 0} onClick={() => setLessonIndex((current) => current - 1)}><ArrowLeft size={14} /> Previous</button><div>{completed.includes(lessonIndex) ? <span className="tutorial-complete-label"><Check size={14} /> Completed</span> : <button className="button-primary" onClick={() => completeLesson(selected)}>Mark complete <Check size={14} /></button>}</div><button className="button-dark" disabled={lessonIndex === selected.lessons.length - 1} onClick={() => setLessonIndex((current) => current + 1)}>Next lesson <ArrowRight size={14} /></button></div></article></div>
    </div>;
  }

  return <div className="page-content tutorial-page"><section className="tutorial-library-hero"><div><p className="eyebrow">LEARN AT YOUR OWN PACE</p><h1>Pick a topic.<br /><em>Build a skill.</em></h1><p>Short, practical tutorials with examples you can follow in order.</p></div><div className="tutorial-hero-mark"><BookOpen size={31} /><span>FIELD<br />NOTES</span></div></section><div className="tutorial-library-tools"><label className="tutorial-search"><Search size={17} /><input aria-label="Search tutorials" placeholder="Find a language or topic" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span>{visibleCourses.length} learning paths</span></div><div className="tutorial-course-grid">{visibleCourses.map((course) => {
    const completed = progress[course.id] || [];
    const percentage = Math.round(completed.length / course.lessons.length * 100);
    return <article className={`tutorial-course-card ${course.accent}`} key={course.id}><div className="tutorial-course-cover"><span>{course.category.toUpperCase()}</span><Code2 size={27} /><small>{course.id.toUpperCase()} · TUTORIAL</small></div><div className="tutorial-course-info"><div className="tutorial-course-meta"><span>{course.level}</span><span><Clock3 size={13} /> {course.duration}</span></div><h2>{course.title}</h2><p>{course.description}</p><div className="tutorial-card-progress"><div className="progress-track"><span style={{ width: `${percentage}%` }} /></div><small>{percentage ? `${percentage}% complete` : `${course.lessons.length} guided lessons`}</small></div><button className="button-dark full-width" onClick={() => { setSelectedId(course.id); setLessonIndex(0); }}>{percentage ? 'Continue tutorial' : 'Open tutorial'} <ArrowRight size={15} /></button></div></article>;
  })}{visibleCourses.length === 0 && <div className="panel empty-state"><BookOpen size={22} /><b>No tutorials found</b><span>Try a different topic.</span></div>}</div></div>;
}