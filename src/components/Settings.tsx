import { Download, ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Modal from './Modal';
import { actions, clearSavedData, store, useAppDispatch, useAppSelector } from '../store';
import type { Model } from '../../shared/types';
import { APP_NAME } from '../config';
export function downloadJSON() {
  const {conversations,characters} = store.getState(); const url = URL.createObjectURL(new Blob([JSON.stringify({version:2,conversations,characters},null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = `${APP_NAME.toLowerCase()}-chats-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function Settings({onClose,models,onClear}:{onClose:()=>void;models:Model[];onClear:()=>void}) {
  const {preferences,selectedModel} = useAppSelector(s=>s); const dispatch = useAppDispatch(); const [confirm,setConfirm] = useState(false); const [error,setError] = useState('');
  return <Modal title="Make yourself at home" onClose={onClose}><p className="muted modal-description">A few preferences for your thinking space.</p><div className="settings-fields">
    <label>Appearance<select value={preferences.theme} onChange={e=>dispatch(actions.preferences({theme:e.target.value as typeof preferences.theme}))}><option value="system">Match your device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <label>Chat model<select value={selectedModel} disabled={!models.length} onChange={e=>dispatch(actions.model(e.target.value))}>{!models.length && <option value="">No verified models available</option>}{models.map(m=><option key={m.id} value={m.id}>{m.name}{m.free ? ' · Free, limits apply' : ' · Paid'}</option>)}</select></label>
    <label>Voice language<select value={preferences.language} onChange={e=>dispatch(actions.preferences({language:e.target.value as typeof preferences.language}))}><option value="en-US">English</option><option value="ur-PK">اردو · Urdu</option></select></label>
    <label className="check-row"><span><strong>Demo mode</strong><small>Simulated chat responses. No API key required.</small></span><input type="checkbox" checked={preferences.demo} onChange={e=>dispatch(actions.preferences({demo:e.target.checked}))}/></label>
    <label className="check-row"><span><strong>Mute read aloud</strong><small>Microphone input remains available.</small></span><input type="checkbox" checked={preferences.muted} onChange={e=>{ dispatch(actions.preferences({muted:e.target.checked})); window.speechSynthesis?.cancel(); }}/></label>
  </div><p className="settings-note">Browser speech recognition and Urdu voice quality vary by device. Recognition may use your browser vendor’s service. Recognized text stays editable before you send it.</p>
  <div className="settings-actions"><button className="secondary" onClick={downloadJSON}><Download size={16}/>Export chats & characters</button><button className="danger-link" onClick={()=>setConfirm(true)}><Trash2 size={15}/>Clear saved data</button></div>
  {confirm && <div className="confirm-inline"><p>Delete all saved conversations and characters? Export first if you need a backup.</p><button className="danger" onClick={()=>{ try { onClear(); clearSavedData(); onClose(); } catch { setError('Browser storage could not be cleared. Check browser permissions.'); } }}>Delete saved data</button><button className="secondary" onClick={()=>setConfirm(false)}>Keep data</button></div>}{error && <p role="alert">{error}</p>}
  <div className="setup-note"><strong>Backend setup</strong><p>Live chat uses OpenRouter. Optional images use OpenAI and are billed separately. Add credentials only to <code>server/.env</code>, then restart the API.</p><a href="https://openrouter.ai/docs/api_reference/streaming" target="_blank" rel="noopener noreferrer">Provider documentation <ExternalLink size={12}/></a></div>
  </Modal>;
}
