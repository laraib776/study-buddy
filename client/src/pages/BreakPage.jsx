export default function BreakPage({ breakType, breakSec, onEndBreak }) {
  const minutes = Math.floor(breakSec / 60);
  const seconds = breakSec % 60;
  const title = breakType === 'rest' ? 'Rest break' : breakType === 'food' ? 'Snack break' : 'Walk break';
  return (
    <section className="break-page">
      <div className="break-card">
        <h2>{title}</h2>
        <p>{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}</p>
        <p>Take a moment to breathe, move, or refill energy.</p>
        <button type="button" className="button primary" onClick={onEndBreak}>End break</button>
      </div>
      <div className="break-tips">
        <h3>Break tips</h3>
        <ul>
          <li>Look away from screens for 60 seconds</li>
          <li>Drink water or stretch your back</li>
          <li>Keep the session short and focused</li>
        </ul>
      </div>
    </section>
  );
}
