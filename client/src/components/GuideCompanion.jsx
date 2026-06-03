import SafeImage from './SafeImage.jsx';

export default function GuideCompanion({ guideLine, guideState, focusOn, docked, assets, onAction, onDockToggle }) {
  return (
    <section className={`guide-companion ${docked ? 'docked' : ''}`}>
      <div className="guide-card">
        <div className="guide-title">StudyBuddy</div>
        <p>{guideLine}</p>
        <div className="guide-controls">
          <button type="button" onClick={() => onAction('wave', 'Need a quick study boost? Try generating cards or a quiz.', true)}>Hint</button>
          <button type="button" onClick={onDockToggle}>{docked ? 'Undock' : 'Dock'}</button>
        </div>
      </div>
      <SafeImage src={focusOn ? assets.brain : assets.bubble} alt="Companion" className="guide-avatar" fallback="star" />
    </section>
  );
}
