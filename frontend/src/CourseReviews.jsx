import { useEffect, useState } from 'react';
import { BookOpen, MessageSquare, Star } from 'lucide-react';
import { apiUrl } from './api-base.js';

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

function RatingStars({ rating, label }) {
  return <span className="course-review-stars" aria-label={label}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < rating ? 'currentColor' : 'none'} />)}</span>;
}

export default function CourseReviews({ user, notify }) {
  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedCourse = courses.find((course) => course.id === selectedId);
  const isStudent = user.role === 'student';

  async function loadReviews() {
    const result = await api('/course-reviews');
    setCourses(result);
    setSelectedId((current) => current && result.some((course) => course.id === current) ? current : result[0]?.id || '');
  }

  useEffect(() => {
    let active = true;
    api('/course-reviews')
      .then((result) => { if (active) { setCourses(result); setSelectedId(result[0]?.id || ''); } })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setRating(selectedCourse?.my_review?.rating || 0);
    setComment(selectedCourse?.my_review?.comment || '');
    setError('');
  }, [selectedId, selectedCourse?.my_review?.rating, selectedCourse?.my_review?.comment]);

  async function submitReview(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/course-reviews', {
        method: 'POST',
        body: JSON.stringify({ courseId: selectedId, rating, comment })
      });
      await loadReviews();
      notify('Your course review was saved.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">LEARNER VOICES</p><h1>Course reviews.</h1><p className="heading-desc">Share thoughtful feedback and see what students say about their courses.</p></div></div>
    {error && !isStudent && <p className="error-message" role="alert">{error}</p>}
    {loading ? <div className="events-empty"><BookOpen size={20} /><p>Loading course reviews…</p></div>
      : courses.length ? <>
        <div className="course-review-course-picker"><label htmlFor="course-review-course">Choose a course</label><select id="course-review-course" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></div>
        {selectedCourse && <section className="course-review-layout">
          <div className="panel course-review-summary"><p className="eyebrow">STUDENT FEEDBACK</p><h2>{selectedCourse.title}</h2><div className="course-review-average"><strong>{selectedCourse.average_rating ? selectedCourse.average_rating.toFixed(1) : '—'}</strong><span><RatingStars rating={Math.round(selectedCourse.average_rating)} label={`${selectedCourse.average_rating.toFixed(1)} out of 5 stars`} /><small>{selectedCourse.review_count} {selectedCourse.review_count === 1 ? 'review' : 'reviews'}</small></span></div><p>Ratings and comments are shared with the campus community without displaying reviewer names.</p></div>
          {isStudent && <form className="panel course-review-form" onSubmit={submitReview}><p className="eyebrow">{selectedCourse.my_review ? 'UPDATE YOUR FEEDBACK' : 'ADD YOUR FEEDBACK'}</p><h2>{selectedCourse.my_review ? 'Edit your review.' : 'How was this course?'}</h2><fieldset><legend>Your rating</legend><div className="course-review-rating-input">{Array.from({ length: 5 }, (_, index) => <button type="button" className={index < rating ? 'selected' : ''} key={index} aria-label={`Rate ${index + 1} out of 5`} aria-pressed={rating === index + 1} onClick={() => setRating(index + 1)}><Star size={23} fill={index < rating ? 'currentColor' : 'none'} /></button>)}</div></fieldset><label htmlFor="course-review-comment">Your comments</label><textarea id="course-review-comment" required minLength={10} maxLength={1000} rows={4} placeholder="What worked well, and what could be improved?" value={comment} onChange={(event) => setComment(event.target.value)} />{error && <p className="error-message" role="alert">{error}</p>}<button className="button-dark" disabled={busy || rating < 1}>{busy ? 'Saving…' : selectedCourse.my_review ? 'Update review' : 'Submit review'} <MessageSquare size={15} /></button></form>}
          <section className="panel course-review-list"><div className="panel-heading"><div><p className="eyebrow">RECENT REVIEWS</p><h2>What learners shared</h2></div></div>{selectedCourse.reviews.length ? selectedCourse.reviews.map((review) => <article className="course-review-item" key={review.id}><div className="course-review-item-heading"><span><b>{review.from_me ? 'Your review' : 'Campus student'}</b><small>{new Date(review.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><RatingStars rating={review.rating} label={`${review.rating} out of 5 stars`} /></div><p>{review.comment}</p></article>) : <div className="events-empty"><MessageSquare size={20} /><h2>No reviews yet.</h2><p>Be the first to share feedback for this course.</p></div>}</section>
        </section>}
      </> : <div className="events-empty"><BookOpen size={20} /><h2>No courses available.</h2><p>Course feedback will appear when courses are added.</p></div>}
  </div>;
}
