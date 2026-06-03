function CardTab({ cards, cardIdx, flipped, onFlip, onPrev, onNext, onRate }) {
  const card = cards[cardIdx] || { front: 'No cards yet', back: 'Create cards from your saved notes or upload a document.' };
  const total = cards.length || 1;
  const handleRate = (difficulty) => {
    onRate(difficulty);
    onNext();
  };
  return (
    <div className="study-cards card-drill">
      <div className="card-drill-top">
        <button type="button" className="icon-button" onClick={onPrev} aria-label="Previous card">&lsaquo;</button>
        <span>{card.tag || 'Flashcard'}</span>
        <strong>{cardIdx + 1}/{total}</strong>
      </div>
      <button type="button" className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={onFlip}>
        <span className="card-audio">&#128266;</span>
        <span className="flashcard-label">{flipped ? 'Answer' : 'Question'}</span>
        <span className="flashcard-text">{flipped ? card.back : card.front}</span>
      </button>
      <div className="card-choice-bar">
        <button type="button" className="card-choice no" onClick={() => handleRate('hard')} aria-label="Mark hard and next">&times;</button>
        <button type="button" className="card-choice yes" onClick={() => handleRate('easy')} aria-label="Mark easy and next">&#10003;</button>
      </div>
      <div className="card-hint">
        <p>Tap the card to flip, then choose if you remembered it.</p>
        <button type="button" className="small-button" onClick={onNext}>Skip</button>
      </div>
    </div>
  );
}

function QuizTab({ quiz, answers, onAnswerChange, onSubmit, submitted, score, qtab, onTabChange }) {
  if (!quiz) {
    return <div className="empty-state">No quiz generated yet. Create one from your notes.</div>;
  }
  return (
    <div className="study-quiz">
      <div className="quiz-tabs">
        {['mcq', 'tf', 'blanks', 'short'].map((tab) => (
          <button key={tab} type="button" className={qtab === tab ? 'active' : ''} onClick={() => onTabChange(tab)}>{tab.toUpperCase()}</button>
        ))}
      </div>
      <div className="quiz-group">
        {quiz[qtab]?.map((item, index) => (
          <div key={`${qtab}-${index}`} className="quiz-item">
            <p>{item.q}</p>
            {qtab === 'mcq' && item.opts?.map((opt, optIndex) => (
              <label key={`${index}-${optIndex}`} className="quiz-option">
                <input type="radio" name={`mcq-${index}`} checked={answers[`m${index}`] === optIndex} onChange={() => onAnswerChange(`m${index}`, optIndex)} />
                {opt}
              </label>
            ))}
            {qtab === 'tf' && [true, false].map((value) => (
              <label key={`${index}-${value}`} className="quiz-option">
                <input type="radio" name={`tf-${index}`} checked={answers[`t${index}`] === value} onChange={() => onAnswerChange(`t${index}`, value)} />
                {value ? 'True' : 'False'}
              </label>
            ))}
            {qtab === 'short' && (
              <textarea value={answers[`s${index}`] || ''} onChange={(e) => onAnswerChange(`s${index}`, e.target.value)} placeholder="Write your answer here" rows={3} />
            )}
            {qtab === 'blanks' && (
              <input type="text" value={answers[`b${index}`] || ''} onChange={(e) => onAnswerChange(`b${index}`, e.target.value)} placeholder="Type the missing term" />
            )}
          </div>
        ))}
      </div>
      <div className="quiz-actions">
        <button type="button" className="button primary" onClick={onSubmit}>Submit quiz</button>
        {submitted && score && <span className="quiz-score">Score: {score.pct}%</span>}
      </div>
    </div>
  );
}

function OralTab({ viva, vivaIn, speechOn, speechSupported, speechStatus, onInputChange, onSend, onToggleSpeech }) {
  return (
    <div className="study-oral">
      <div className="oral-chat">
        {viva.map((item, index) => (
          <div key={`${item.role}-${index}`} className={`chat-line ${item.role}`}>
            <strong>{item.role === 'examiner' ? 'Coach' : 'You'}</strong>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
      <textarea value={vivaIn} onChange={(e) => onInputChange(e.target.value)} placeholder="Type your answer here or use voice input" rows={5} />
      <div className="oral-actions">
        <button type="button" className="button primary" onClick={onSend}>Send answer</button>
        <button type="button" className="button secondary" onClick={onToggleSpeech}>{speechOn ? 'Stop voice input' : 'Voice answer'}</button>
      </div>
      {speechSupported && <div className="speech-status">{speechStatus || 'Tap voice to answer by speech'}</div>}
    </div>
  );
}

export default function StudyPage({ cards, cardIdx, flipped, quiz, answers, submitted, score, qtab, viva, vivaIn, speechOn, speechSupported, speechStatus, onStudyTabChange, studyTab, onFlip, onPrev, onNext, onRate, onAnswerChange, onSubmitQuiz, onSendViva, onToggleSpeech, onVivaChange, onStartOral }) {
  return (
    <section className="study-page">
      <div className="study-header">
        <h2>Study room</h2>
        <div className="study-tabs">
          {['cards', 'quiz', 'oral'].map((tab) => (
            <button key={tab} type="button" className={studyTab === tab ? 'active' : ''} onClick={() => onStudyTabChange(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {studyTab === 'cards' && (
        <CardTab cards={cards} cardIdx={cardIdx} flipped={flipped} onFlip={onFlip} onPrev={onPrev} onNext={onNext} onRate={onRate} />
      )}
      {studyTab === 'quiz' && (
        <QuizTab quiz={quiz} answers={answers} onAnswerChange={onAnswerChange} onSubmit={onSubmitQuiz} submitted={submitted} score={score} qtab={qtab} onTabChange={onStudyTabChange} />
      )}
      {studyTab === 'oral' && (
        <OralTab viva={viva} vivaIn={vivaIn} speechOn={speechOn} speechSupported={speechSupported} speechStatus={speechStatus} onInputChange={onVivaChange} onSend={onSendViva} onToggleSpeech={onToggleSpeech} />
      )}
      <div className="study-actions">
        <button type="button" className="button secondary" onClick={() => onStartOral()}>Start oral practice</button>
        <button type="button" className="button tertiary" onClick={() => onStudyTabChange('cards')}>Review cards</button>
      </div>
    </section>
  );
}
