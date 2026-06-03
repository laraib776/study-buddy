import { assets } from '../utils/constants.js';
import SafeImage from './SafeImage.jsx';

export default function Sidebar({ profile, loginName, navItems, activeScreen, iconSize, icons, onNavigate, onSettings, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <SafeImage src={assets.logo} alt="StudyBuddy" className="brand-logo" fallback="star" />
        <div>
          <strong>{profile.displayName || loginName || 'StudyBuddy'}</strong>
          <p>{profile.tagline || 'Your focus partner'}</p>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-link ${item.id === activeScreen ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <SafeImage src={icons?.[item.icon] || assets[item.icon]} alt={item.label} width={iconSize} height={iconSize} fallback={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-actions">
        <button type="button" className="sidebar-action" onClick={onSettings}>Settings</button>
        <button type="button" className="sidebar-action secondary" onClick={onSignOut}>Sign out</button>
      </div>
    </aside>
  );
}
