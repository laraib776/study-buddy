export default function FocusPage({ focusSec, focusOn, todayData, onCompleteTopic, onStartBreak }) {
  const minutes = Math.floor(focusSec / 60);
  const seconds = focusSec % 60;
  return (
    <section className="focus-page">
      <div className="focus-card large">
        <h2>Focus timer</h2>
        <p>{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}</p>
        <div className="focus-actions">
          <button type="button" className="button primary" onClick={() => onStartBreak('walk')}>Take a walk break</button>
          <button type="button" className="button secondary" onClick={() => onStartBreak('rest')}>Rest break</button>
          <button type="button" className="button tertiary" onClick={onCompleteTopic}>Complete session</button>
        </div>
      </div>
      <div className="focus-summary">
        <h3>Today's performance</h3>
        <p>{todayData.studyMin || 0} minutes studied</p>
        <p>{todayData.cards || 0} flashcards created</p>
        <p>Quiz average: {todayData.quizScores?.slice(-1)[0] || 'none'}</p>
      </div>
    </section>
  );
}
