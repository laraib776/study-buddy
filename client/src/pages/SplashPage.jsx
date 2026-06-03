export default function SplashPage({ message }) {
  return (
    <div className="splash-screen">
      <div className="splash-logo">StudyBuddy</div>
      <div className="splash-message">{message}</div>
      <div className="splash-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
