export default function LoginPage({ loginName, loginEmail, loginPassword, loginSignup, loginRemember, authStatus, onSignupToggle, onFormSubmit, onLoginNameChange, onLoginEmailChange, onLoginPasswordChange, onRememberChange }) {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>StudyBuddy</h1>
        <p>{authStatus}</p>
        <form onSubmit={onFormSubmit} className="login-form">
          <label>
            Name
            <input value={loginName} onChange={(e) => onLoginNameChange(e.target.value)} placeholder="Your friendly study name" />
          </label>
          <label>
            Email
            <input type="email" value={loginEmail} onChange={(e) => onLoginEmailChange(e.target.value)} placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input type="password" value={loginPassword} onChange={(e) => onLoginPasswordChange(e.target.value)} placeholder="••••••••" required />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={loginRemember} onChange={(e) => onRememberChange(e.target.checked)} />
            Remember me
          </label>
          <button type="submit" className="button primary">{loginSignup ? 'Sign up' : 'Login'}</button>
        </form>
        <div className="login-footer">
          <button type="button" className="link-button" onClick={() => onSignupToggle(!loginSignup)}>
            {loginSignup ? 'Already have an account? Login' : 'Create an account'}
          </button>
          <p>Requires Firebase config in .env to enable real sync.</p>
        </div>
      </section>
    </main>
  );
}
