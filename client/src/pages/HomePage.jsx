import { assets } from '../utils/constants.js';
import SafeImage from '../components/SafeImage.jsx';

export default function HomePage({ profile, todayData, avgQ, savedNotes, selectedNoteId, cards, quiz, focusSec, focusOn, progress, onGenerateCards, onGenerateQuiz, onStartOral, onStartBreak, onCompleteTopic }) {
  const minutes = Math.floor(focusSec / 60);
  return (
    <section className="home-page">
      <div className="home-hero">
        <div>
          <h1>Welcome back, {profile.displayName || 'Student'}.</h1>
          <p>Track progress, power through study sessions, and let AI help you revise smarter.</p>
        </div>
        <SafeImage src={assets.studyBuddy} alt="StudyBuddy" className="hero-image" fallback="star" />
      </div>
      <div className="home-summary-grid">
        <div className="summary-card">
          <h3>Today's study</h3>
          <p>{todayData.studyMin || 0} min focus</p>
          <p>{todayData.cards || 0} flashcards</p>
          <p>{avgQ}% average quiz</p>
        </div>
        <div className="summary-card">
          <h3>Daily streak</h3>
          <p>{Object.keys(progress).length} days tracked</p>
          <p>{todayData.completed ? 'Completed' : 'In progress'}</p>
        </div>
        <div className="summary-card">
          <h3>Saved material</h3>
          <p>{savedNotes.length} notes</p>
          <p>{cards.length} cards generated</p>
          <p>{quiz ? 'Quiz ready' : 'No quiz yet'}</p>
        </div>
      </div>
      <div className="quick-actions">
        <button type="button" className="button primary" onClick={() => onGenerateCards(selectedNoteId)}>
          Generate flashcards
        </button>
        <button type="button" className="button secondary" onClick={() => onGenerateQuiz(selectedNoteId)}>
          Generate quiz
        </button>
        <button type="button" className="button tertiary" onClick={() => onStartOral(selectedNoteId)}>
          Start oral practice
        </button>
      </div>
      <div className="home-focus-panel">
        <div>
          <h3>Focus session</h3>
          <p>{minutes} minutes {focusOn ? 'active' : 'paused'}</p>
        </div>
        <div className="focus-actions">
          <button type="button" className="button primary" onClick={() => onStartBreak('walk')}>Stretch break</button>
          <button type="button" className="button secondary" onClick={() => onStartBreak('rest')}>Rest break</button>
          <button type="button" className="button tertiary" onClick={() => onCompleteTopic()}>Finish topic</button>
        </div>
      </div>
    </section>
  );
}
