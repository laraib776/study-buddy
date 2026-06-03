export default function Toast({ message, type = 'ok' }) {
  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
