import { themeCards, assets } from '../utils/constants.js';
import SafeImage from './SafeImage.jsx';

export default function SettingsModal({ visible, tabs, currentTab, onTabChange, themeCards, draftPrefs, profileDraft, displayNameDraft, onThemeChange, onProfileChange, onUploadPhoto, onSave, onClose, onLogout, onDeleteAccount, onIconChange, onDecorationSizeChange, onAddDecoration, onClearDecorations }) {
  if (!visible) return null;
  return (
    <div className="modal-backdrop">
      <div className="settings-modal">
        <div className="settings-header">
          <h3>Settings</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="settings-tabs">
          {tabs.map((tab) => (
            <button key={tab} type="button" className={tab === currentTab ? 'active' : ''} onClick={() => onTabChange(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-body">
          {currentTab === 'theme' && (
            <div className="settings-panel">
              <p>Pick a theme:</p>
              <div className="theme-grid">
                {themeCards.map((theme) => (
                  <button key={theme.id} type="button" className={`theme-card ${draftPrefs.theme === theme.id ? 'selected' : ''}`} onClick={() => onThemeChange(theme.id)}>
                    <SafeImage src={theme.image} alt={theme.title} fallback="star" />
                    <div>{theme.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {currentTab === 'account' && (
            <div className="settings-panel">
              <label>
                Display name
                <input value={displayNameDraft} onChange={(e) => onProfileChange('displayName', e.target.value)} />
              </label>
              <label>
                Tagline
                <input value={profileDraft.tagline || ''} onChange={(e) => onProfileChange('tagline', e.target.value)} />
              </label>
              <label>
                Upload avatar
                <input type="file" accept="image/*" onChange={(e) => onUploadPhoto(e.target.files?.[0])} />
              </label>
            </div>
          )}
          {currentTab === 'icons' && (
            <div className="settings-panel">
              <p>Icon shortcuts</p>
              <div className="icon-grid">
                {Object.entries(draftPrefs.icons || {}).map(([key, value]) => (
                  <label key={key} className="icon-entry">
                    <span>{key}</span>
                    <input value={value} onChange={(e) => onIconChange(key, e.target.value)} />
                  </label>
                ))}
              </div>
            </div>
          )}
          {currentTab === 'deco' && (
            <div className="settings-panel">
              <label>
                Decoration size
                <input type="range" min="24" max="84" value={draftPrefs.decorations?.[0]?.size || 54} onChange={(e) => onDecorationSizeChange(Number(e.target.value))} />
              </label>
              <button type="button" onClick={() => onAddDecoration('new', '✨')}>Add sparkle</button>
              <button type="button" onClick={onClearDecorations}>Clear decorations</button>
            </div>
          )}
          {currentTab === 'api' && (
            <div className="settings-panel">
              <p>This app uses a secure AI backend. Configure your server and Firebase to enable AI features.</p>
              <div className="api-sample">
                <SafeImage src={assets.server} alt="API" fallback="settings" />
              </div>
            </div>
          )}
        </div>
        <div className="settings-footer">
          <button type="button" className="button primary" onClick={onSave}>Save</button>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="button warning" onClick={onLogout}>Logout</button>
          <button type="button" className="button danger" onClick={onDeleteAccount}>Delete account</button>
        </div>
      </div>
    </div>
  );
}
