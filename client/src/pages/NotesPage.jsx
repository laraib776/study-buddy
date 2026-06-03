import { assets } from '../utils/constants.js';
import SafeImage from '../components/SafeImage.jsx';

export default function NotesPage({ topic, notes, savedNotes, selectedNoteId, uploadedSrc, urlIn, displayedSources, onTopicChange, onNotesChange, onUrlChange, onUploadFile, onFetchUrl, onSaveNote, onNewNote, onSelectNote, onDeleteNote }) {
  return (
    <section className="notes-page">
      <div className="notes-sidebar">
        <div className="notes-panel">
          <h3>Saved notes</h3>
          {savedNotes.length === 0 ? (
            <div className="empty-state">No saved notes yet</div>
          ) : (
            savedNotes.map((note) => (
              <div key={note.id} className={`note-entry ${note.id === selectedNoteId ? 'active' : ''}`}>
                <button type="button" className="note-select" onClick={() => onSelectNote(note.id)}>
                  <strong>{note.topic}</strong>
                  <small>{note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : 'Saved earlier'}</small>
                </button>
                <button type="button" className="small-button" onClick={() => onDeleteNote(note.id)}>Delete</button>
              </div>
            ))
          )}
          <button type="button" className="button secondary" onClick={onNewNote}>New note</button>
        </div>
      </div>
      <div className="notes-editor">
        <div className="notes-meta">
          <label>
            Topic name
            <input value={topic} onChange={(e) => onTopicChange(e.target.value)} placeholder="Biology revision" />
          </label>
          <label>
            Notes / copy-paste source
            <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Paste lecture notes, article text, or a study script here..." rows={12} />
          </label>
          <div className="notes-actions">
            <button type="button" className="button primary" onClick={onSaveNote}>Save notes</button>
            <label className="file-upload">
              Upload file
              <input type="file" accept=".txt,.pdf,.doc,.docx" onChange={(e) => onUploadFile(e.target.files?.[0])} />
            </label>
          </div>
          <div className="notes-url">
            <input value={urlIn} onChange={(e) => onUrlChange(e.target.value)} placeholder="Enter URL to save a web source" />
            <button type="button" className="button secondary" onClick={onFetchUrl}>Save URL source</button>
          </div>
        </div>
        <div className="notes-source-list">
          <h3>Loaded sources</h3>
          {displayedSources.length === 0 ? (
            <div className="empty-state">No files or URLs added yet.</div>
          ) : (
            displayedSources.map((source) => (
              <div key={`${source.type}-${source.name}`} className="source-pill">
                <SafeImage src={assets.document} alt={source.type} fallback="notes" />
                <div>
                  <strong>{source.name}</strong>
                  <small>{source.type}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
