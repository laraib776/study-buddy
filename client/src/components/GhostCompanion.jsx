export default function GhostCompanion({ ghostState, ghostRef, onBurst }) {
  return (
    <div className={`ghost-companion ${ghostState.ghostHidden ? 'hidden' : ''} ${ghostState.ghostBurst ? 'burst' : ''}`} ref={ghostRef}>
      <div className="ghost-body" onMouseEnter={onBurst}>👻</div>
      <div className="ghost-trail" />
    </div>
  );
}
