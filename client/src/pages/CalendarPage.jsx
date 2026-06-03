export default function CalendarPage({ progress, calDate, selDay, calNoteDate, calNoteText, onCalDateChange, onSetSelDay, onCalNoteDateChange, onCalNoteTextChange }) {
  const days = Object.entries(progress).sort(([a], [b]) => b.localeCompare(a));
  return (
    <section className="calendar-page">
      <div className="calendar-sidebar">
        <h3>Study history</h3>
        {days.length === 0 ? (
          <div className="empty-state">No history yet</div>
        ) : (
          days.map(([date, entry]) => (
            <button key={date} type="button" className={`calendar-entry ${selDay === date ? 'active' : ''}`} onClick={() => onSetSelDay(date)}>
              <strong>{date}</strong>
              <p>{entry.studyMin || 0} min, {entry.cards || 0} cards</p>
            </button>
          ))
        )}
      </div>
      <div className="calendar-main">
        <div className="calendar-panel">
          <h3>Sticky note</h3>
          <label>
            Date
            <input type="date" value={calNoteDate} onChange={(e) => onCalNoteDateChange(e.target.value)} />
          </label>
          <label>
            Note
            <textarea value={calNoteText} onChange={(e) => onCalNoteTextChange(e.target.value)} rows={8} placeholder="Write a quick review, reminder, or personal study note." />
          </label>
        </div>
        <div className="calendar-preview">
          <h3>Selected day</h3>
          {selDay ? (
            <div className="day-summary">
              <p>{selDay}</p>
              <p>{progress[selDay]?.studyMin || 0} study minutes</p>
              <p>{progress[selDay]?.cards || 0} cards created</p>
              <p>{progress[selDay]?.quizScores?.slice(-1)[0] || 'No quiz score'}</p>
              <p>{progress[selDay]?.note || 'No sticky note'}</p>
            </div>
          ) : (
            <div className="empty-state">Choose a day from the left to view its summary.</div>
          )}
        </div>
      </div>
    </section>
  );
}
