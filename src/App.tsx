import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronLeft, Code2, Copy, Feather, Image, Menu, MessageSquare, Mic, MicOff, MoreHorizontal, PanelLeftClose, Plus, RefreshCw, Search, Settings2, Sparkles, Square, Sun, Volume2, VolumeX, X, Zap, Compass, Pencil, Trash2, Download, Users } from 'lucide-react';
import { actions, store, useAppDispatch, useAppSelector } from './store';
import type { Character, Conversation, Health, Message, Model } from '../shared/types';
import { buildHistory, getHealth, getModels, ProxyChatService } from './services/chat';
import { useVoice } from './hooks/useVoice';
import Modal from './components/Modal';
import LazyBoundary from './components/LazyBoundary';
import { APP_NAME } from './config';
import { createCharacterConversation } from '../shared/characters';
import CharacterAvatar from './components/CharacterAvatar';
const Markdown = lazy(()=>import('./components/Markdown'));
const ImageStudio = lazy(()=>import('./components/ImageStudio'));
const Settings = lazy(()=>import('./components/Settings'));
const Characters = lazy(()=>import('./components/Characters'));
const suggestions = [
  {icon:Feather,title:'Find the right words',text:'Write something worth reading',prompt:'Help me write a thoughtful email to reconnect with an old friend.'},
  {icon:Compass,title:'Explore an idea',text:'Follow your curiosity',prompt:'Brainstorm three interesting ideas for a small creative project.'},
  {icon:Code2,title:'Build something',text:'From a bug to a breakthrough',prompt:'Show me a simple TypeScript function with an example and explain how it works.'},
  {icon:Sun,title:'Make a little progress',text:'A plan for what comes next',prompt:'Help me organize my week into a realistic plan with time for rest.'},
];
function Mark({small=false}:{small?:boolean}) { return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><Sparkles size={small ? 16 : 22} strokeWidth={1.8}/></span>; }
function MessageBody({message}:{message:Message}) {
  if (message.role === 'user') return <p className="user-text" dir="auto">{message.content}</p>;
  if (message.status === 'streaming') return <div className="plain-response" dir="auto">{message.content || <span className="thinking"><span/>Thinking…</span>}</div>;
  return <LazyBoundary fallback={<div className="plain-response">{message.content}</div>}><Suspense fallback={<div className="plain-response">{message.content}</div>}><Markdown text={message.content}/></Suspense></LazyBoundary>;
}
export default function App() {
  const state = useAppSelector(s=>s); const dispatch = useAppDispatch();
  const [sidebar,setSidebar] = useState(true); const [mobileSidebar,setMobileSidebar] = useState(false); const [mode,setMode] = useState<'chat'|'image'|'characters'>('chat');
  const [search,setSearch] = useState(''); const [draft,setDraft] = useState(''); const [models,setModels] = useState<Model[]>([]); const [health,setHealth] = useState<Health|null>(null); const [connectionError,setConnectionError] = useState(''); const [checking,setChecking] = useState(true);
  const [settings,setSettings] = useState(false); const [dialog,setDialog] = useState<{kind:'rename'|'delete';id:string;title:string}|null>(null); const [rename,setRename] = useState('');
  const [editing,setEditing] = useState<string|null>(null); const [busyId,setBusyId] = useState<string|null>(null); const [composerError,setComposerError] = useState(''); const [copied,setCopied] = useState('');
  const generation = useRef<{controller:AbortController;conversationId:string;messageId:string;requestId:string}|null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null); const scroll = useRef<HTMLDivElement>(null); const navigation = useRef<HTMLElement>(null); const follow = useRef(true);
  const active = state.conversations.find(c=>c.id === state.activeId); const busy = !!busyId;
  const character = active?.character;
  const updatedCharacter = character ? state.characters.find(c=>c.id===character.id) : undefined;
  const voiceLanguage = character ? character.preferredLanguage === 'English' ? 'en-US' : 'ur-PK' : state.preferences.language;
  const voice = useVoice(voiceLanguage,state.preferences.muted,text=>{setDraft(d=>d ? `${d} ${text}` : text);textarea.current?.focus();});
  const checkConnection = useCallback(async (signal?:AbortSignal) => {
    setChecking(true);setConnectionError('');
    const results = await Promise.allSettled([getHealth(),getModels()]); if (signal?.aborted) return;
    if (results[0].status === 'fulfilled') setHealth(results[0].value); else {setHealth(null);setConnectionError(results[0].reason.message);}
    if (results[1].status === 'fulfilled') { const data = results[1].value; setModels(data.models);const selected = store.getState().selectedModel;
      if (!data.models.some(m=>m.id === selected)) dispatch(actions.model(data.models.some(m=>m.id === data.defaultModel) ? data.defaultModel : data.models[0]?.id || ''));
      if (!data.models.length) setConnectionError('No configured chat models are currently available. Update CHAT_MODEL_ALLOWLIST on the backend.');
    } else {setModels([]); setConnectionError(e=>e || results[1].status === 'rejected' && results[1].reason.message || 'Could not verify model availability.');}
    setChecking(false);
  },[dispatch]);
  useEffect(()=>{const c = new AbortController();void checkConnection(c.signal);return()=>c.abort();},[checkConnection]);
  useEffect(()=>{const media = window.matchMedia('(prefers-color-scheme: dark)'); const update = () => {document.documentElement.dataset.theme = state.preferences.theme === 'system' ? media.matches ? 'dark' : 'light' : state.preferences.theme;};update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[state.preferences.theme]);
  useEffect(()=>{if(follow.current && scroll.current)scroll.current.scrollTop = scroll.current.scrollHeight;},[active?.messages]);
  useEffect(()=>{follow.current = true;setEditing(null);setDraft('');setComposerError('');voice.stopSpeaking();voice.stopListening();},[state.activeId]);
  useEffect(()=>{const el = textarea.current;if(el){el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,180)}px`;}},[draft]);
  useEffect(()=>()=>generation.current?.controller.abort(),[]);
  useEffect(()=>{
    if(!mobileSidebar)return;
    const previous = document.activeElement as HTMLElement|null;
    const items = () => Array.from(navigation.current?.querySelectorAll<HTMLElement>('a,button,input,select') || []).filter(el=>!el.hasAttribute('disabled') && el.getClientRects().length);
    items()[0]?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){setMobileSidebar(false);return;}
      if(e.key==='Tab'){const list=items();const first=list[0];const last=list.at(-1);if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}}
    };
    window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('keydown',key);previous?.focus();};
  },[mobileSidebar]);
  function stop() {generation.current?.controller.abort();}
  function newChat() {setMode('chat');dispatch(actions.activate(null));setDraft('');setEditing(null);setMobileSidebar(false);textarea.current?.focus();}
  function switchChat(c:Conversation) {dispatch(actions.activate(c.id));setMode('chat');setMobileSidebar(false);}
  function startCharacterChat(character?:Character) {
    if(!character){dispatch(actions.selectCharacter(null));newChat();return;}
    if(state.conversations.length>=150){setComposerError('You have 150 saved chats. Export and delete some before starting another.');setMode('chat');return;}
    const conversation = createCharacterConversation(character,state.preferences.demo);
    dispatch(actions.selectCharacter(character.id));dispatch(actions.create(conversation));
    setMode('chat');setMobileSidebar(false);setDraft('');setEditing(null);voice.stopListening();voice.stopSpeaking();
  }
  async function generate(conversationId:string,source:Message[]) {
    if(generation.current)return;
    const current = store.getState(); const demo = current.preferences.demo;
    const id=crypto.randomUUID();const requestId=crypto.randomUUID();const controller = new AbortController();
    generation.current={controller,conversationId,messageId:id,requestId};setBusyId(conversationId);follow.current=true;
    const assistant:Message={id,role:'assistant',content:'',status:'streaming',createdAt:Date.now(),demo};
    dispatch(actions.replaceMessages({id:conversationId,messages:[...source,assistant]}));
    let text='';let frame:number|null=null;
    const valid = () => generation.current?.requestId === requestId;
    const patch = (p:Partial<Message>) => {if(valid())dispatch(actions.patchMessage({conversationId,id,patch:p}));};
    try {
      const snapshot=current.conversations.find(c=>c.id===conversationId)?.character;
      const request={model:current.selectedModel,messages:buildHistory(source,demo),...(snapshot ? {character:snapshot} : {})};
      const service = demo ? new (await import('./services/demo')).DemoChatService() : new ProxyChatService();
      await service.stream(request,controller.signal,delta=>{if(!valid() || controller.signal.aborted)return;text+=delta;if(frame===null)frame=requestAnimationFrame(()=>{frame=null;patch({content:text});});});
      controller.signal.throwIfAborted();patch({content:text,status:'complete'});
    }catch(e){patch({content:text,status:controller.signal.aborted ? 'stopped' : 'error',...(!controller.signal.aborted ? {error:e instanceof Error ? e.message : 'The request failed. Please try again.'} : {})});}
    finally{if(frame!==null)cancelAnimationFrame(frame);if(valid()){generation.current=null;setBusyId(null);}}
  }
  async function send(prompt = draft) {
    if(busy || !prompt.trim())return;
    if(!state.preferences.demo && (!health?.chatConfigured || !state.selectedModel || connectionError)){setComposerError(connectionError || 'Live chat needs backend setup. Open Settings to enable Demo, or add OPENROUTER_API_KEY to server/.env.');return;}
    if(prompt.length>12000){setComposerError('Keep your message under 12,000 characters.');return;}
    voice.stopListening();voice.stopSpeaking();setComposerError('');
    let c=active;let messages:Message[];
    if(!c){if(state.conversations.length>=150){setComposerError('You have 150 saved chats. Export and delete some before starting another.');return;}c={id:crypto.randomUUID(),title:'Untitled chat',messages:[],updatedAt:Date.now()};dispatch(actions.create(c));}
    const message:Message={id:editing || crypto.randomUUID(),role:'user',content:prompt.trim(),status:'complete',createdAt:Date.now(),demo:state.preferences.demo};
    if(editing){const index=c.messages.findIndex(m=>m.id===editing);if(index<0)return;messages=[...c.messages.slice(0,index),message];}
    else {if(c.messages.length>=498){setComposerError('This chat is full. Start a new chat.');return;}messages=[...c.messages,message];}
    setDraft('');setEditing(null);await generate(c.id,messages);
  }
  function retry(c:Conversation,index:number){if(busy)return;setComposerError('');if(!state.preferences.demo && (!health?.chatConfigured || !state.selectedModel || connectionError)){setComposerError(connectionError || 'Configure the backend or enable Demo in Settings.');return;}const source=c.messages.slice(0,index);const last=source.at(-1);if(last?.role==='user'){source[source.length-1]={...last,demo:state.preferences.demo};void generate(c.id,source);}}
  async function copy(message:Message){try{await navigator.clipboard.writeText(message.content);setCopied(message.id);setTimeout(()=>setCopied(''),2000);}catch{setComposerError('Clipboard access is unavailable. Select the message text to copy it.');}}
  const status = state.preferences.demo ? 'Demo mode' : checking ? 'Connecting' : health?.chatConfigured && !connectionError ? 'Live connection' : 'Setup needed';
  const filtered = state.conversations.filter(c=>c.title.toLowerCase().includes(search.toLowerCase()));
  return <div className={`app-shell ${sidebar ? '' : 'sidebar-collapsed'}`}>
    {mobileSidebar && <button className="drawer-overlay" aria-label="Close navigation" onClick={()=>setMobileSidebar(false)}/>}
    <aside ref={navigation} className={`sidebar ${mobileSidebar ? 'mobile-open' : ''}`} inert={!sidebar && !mobileSidebar ? true : undefined} aria-label="Conversation navigation">
      <div className="sidebar-brand"><a href="#" onClick={e=>{e.preventDefault();newChat();}}><Mark/><span>{APP_NAME}<span className="brand-dot">.</span></span></a><button className="icon-button sidebar-close" aria-label="Collapse sidebar" onClick={()=>{setSidebar(false);setMobileSidebar(false);}}><PanelLeftClose size={18}/></button></div>
      <button className="new-chat" onClick={newChat}><Plus size={19}/><span>New chat</span><span className="shortcut">＋</span></button>
      <nav className="mode-nav" aria-label="Workspace"><button className={mode==='chat'?'selected':''} onClick={()=>{setMode('chat');setMobileSidebar(false);}}><MessageSquare size={18}/>Chat<span className="nav-dot"/></button><button className={mode==='image'?'selected':''} onClick={()=>{setMode('image');setMobileSidebar(false);voice.stopSpeaking();voice.stopListening();}}><Image size={18}/>Image studio<span className="new-label">NEW</span></button><button className={mode==='characters'?'selected':''} onClick={()=>{setMode('characters');setMobileSidebar(false);voice.stopSpeaking();voice.stopListening();}}><Users size={18}/>Characters</button></nav>
      <div className="history-heading"><span>YOUR CONVERSATIONS</span><Search size={14}/></div><label className="search-box"><Search size={14}/><input aria-label="Search conversations" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chats…"/></label>
      <div className="conversation-list">{filtered.length>0 ? <><div className="history-period">Saved on this device</div>{filtered.map(c=><div key={c.id} className={`conversation-item ${c.id===state.activeId ? 'active':''}`}><button className="conversation-title" onClick={()=>switchChat(c)}><>{c.character ? <CharacterAvatar character={c.character}/> : <MessageSquare size={15}/>}</><span>{c.title}</span>{busyId===c.id && <span className="stream-dot" aria-label="Generating"/>}</button><button className="icon-button conversation-menu" aria-label={`Manage ${c.title}`} onClick={()=>{setDialog({kind:'rename',id:c.id,title:c.title});setRename(c.title);}}><MoreHorizontal size={16}/></button></div>)}</> : <div className="history-empty"><MessageSquare size={22}/><p>{search ? 'No matching chats' : 'Good conversations start here'}</p><span>{search ? 'Try a different title.' : 'Your chats will appear as you create them.'}</span></div>}</div>
      <div className="sidebar-footer"><div className="local-card"><span className="local-icon"><Zap size={17}/></span><div><strong>A little space to think</strong><p>Private on this device.</p></div></div><button className="settings-link" onClick={()=>setSettings(true)}><Settings2 size={17}/><span>Settings & preferences</span></button><div className="profile"><div className="avatar">Y</div><div><strong>Your workspace</strong><small>Personal · Local storage</small></div><span className="status-dot"/></div></div>
    </aside>
    <main className="main-panel" inert={mobileSidebar ? true : undefined}><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>{setMobileSidebar(true);setSidebar(true);}}><Menu size={20}/></button>{!sidebar&&<button className="icon-button desktop-menu" aria-label="Open sidebar" onClick={()=>setSidebar(true)}><Menu size={20}/></button>}<span className="workspace-label">{mode==='characters' ? 'Your character collection' : mode==='chat' ? character ? `Talking with ${character.name}` : 'Your thinking companion' : 'Your creative companion'}</span><span className="workspace-divider"/><div className="model-select"><Sparkles size={14}/><select aria-label="Chat model" disabled={!models.length || busy || mode!=='chat' || state.preferences.demo} value={state.selectedModel} onChange={e=>dispatch(actions.model(e.target.value))}>{state.preferences.demo ? <option value={state.selectedModel}>Demo · simulated</option> : !models.length ? <option value="">{checking ? 'Checking models…' : 'No verified model'}</option> : models.map(m=><option key={m.id} value={m.id}>{m.name}{m.free ? ' · Free' : ' · Paid'}</option>)}</select><ChevronDown size={12}/></div></div><div className="topbar-right"><span className={`connection-status ${status==='Live connection'?'live':''}`}><span/>{status}</span><button className="icon-button" aria-label="Open settings" onClick={()=>setSettings(true)}><Settings2 size={18}/></button></div></header>
      {state.storageWarning&&<div className="warning-banner" role="alert">{state.storageWarning}<button onClick={()=>setSettings(true)}>Export chats</button></div>}
      {mode==='characters' ? <div className="image-scroll"><LazyBoundary fallback={<p className="error-banner">Characters could not load. Refresh to try again.</p>}><Suspense fallback={<p className="loading-feature" role="status">Opening your character collection...</p>}><Characters onStart={startCharacterChat}/></Suspense></LazyBoundary></div> : mode==='image' ? <div className="image-scroll"><LazyBoundary fallback={<p className="error-banner">Image studio could not load. Refresh to try again.</p>}><Suspense fallback={<p className="loading-feature" role="status">Opening your image studio…</p>}><ImageStudio/></Suspense></LazyBoundary></div> : <>
        {character && <div className="active-character-bar"><CharacterAvatar character={character}/><div><strong>{character.name}</strong><span>Fictional AI persona · {character.preferredLanguage} · Saved snapshot{updatedCharacter && updatedCharacter.updatedAt !== character.updatedAt ? ' · Updates available' : !updatedCharacter ? ' · Removed from library' : ''}</span></div><button className="character-update-button" disabled={!updatedCharacter || busy} title={!updatedCharacter ? 'This character was deleted; the saved chat snapshot remains.' : undefined} onClick={()=>updatedCharacter && startCharacterChat(updatedCharacter)}>Start new chat with updated character <ArrowUpRight size={13}/></button></div>}
        <div className="chat-scroll" ref={scroll} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
          {!active?.messages.length ? character ? <section className="character-welcome"><CharacterAvatar character={character} large/><span className="persona-label">FICTIONAL AI PERSONA</span><h1>Meet {character.name}.</h1><p dir="auto">{character.personality || character.description}</p><span className="character-welcome-meta">{character.age} years · {character.preferredLanguage}{character.pronouns ? ' · '+character.pronouns : ''}</span><button className="secondary" onClick={()=>setMode('characters')}><Users size={15}/>Explore characters</button></section> : <section className="welcome"><div className="welcome-badge"><span/>A CLEARER MIND STARTS HERE</div><div className="welcome-symbol"><Sparkles size={42} strokeWidth={1.3}/><span className="orbit orbit-one"/><span className="orbit orbit-two"/></div><h1>A little thought.<br/><span>Endless possibilities.</span></h1><p className="welcome-subtitle">A space to ask, imagine, and figure things out.<br/>What’s on your mind today?</p><div className="suggestion-grid">{suggestions.map(s=><button className="suggestion" key={s.title} onClick={()=>{setDraft(s.prompt);textarea.current?.focus();}}><span className="suggestion-icon"><s.icon size={19}/></span><ArrowUpRight size={15} className="suggestion-arrow"/><strong>{s.title}</strong><span>{s.text}</span></button>)}</div><div className="welcome-footnote"><span className="mini-star">✧</span> Big ideas. Small questions. All welcome.</div></section> : <section className="messages" aria-label="Chat messages">{active.messages.map((message,index)=><article key={message.id} className={`message ${message.role}`}><div className="message-avatar">{message.role==='assistant'?character ? <CharacterAvatar character={character}/> : <Mark small/>:<div className="avatar">Y</div>}</div><div className="message-content"><div className="message-meta"><strong>{message.role==='assistant' ? character?.name || APP_NAME : 'You'}</strong>{message.role==='assistant' && character && <span className="persona-message-label">Fictional AI persona</span>}{message.demo&&<span className="demo-tag">DEMO</span>}<time>{new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div><MessageBody message={message}/>{message.error&&<div className="message-error" role="alert">{message.error}</div>}{message.status==='stopped'&&<p className="message-note">Generation stopped · partial response saved</p>}
            <div className="message-actions">{message.content&&<button aria-label="Copy message" title="Copy" onClick={()=>void copy(message)}>{copied===message.id?<Check size={14}/>:<Copy size={14}/>}</button>}{message.role==='user'&&<button disabled={busy} aria-label="Edit message" title="Edit message and regenerate" onClick={()=>{setEditing(message.id);setDraft(message.content);textarea.current?.focus();}}><Pencil size={14}/></button>}{message.role==='assistant'&&message.status!=='streaming'&&<><button aria-label={voice.speaking?'Stop read aloud':'Read aloud'} title={voice.speaking?'Stop read aloud':'Read aloud'} disabled={!message.content || !voice.speechSupported} onClick={()=>voice.speaking?voice.stopSpeaking():voice.speak(message.content)}>{voice.speaking?<VolumeX size={15}/>:<Volume2 size={15}/>}</button>{index===active.messages.length-1 && message.origin!=='character-greeting' && <button aria-label="Retry response" title="Retry" disabled={busy} onClick={()=>retry(active,index)}><RefreshCw size={14}/></button>}</>}</div></div></article>)}</section>}
        </div>
        <div className="composer-area">{!state.preferences.demo&&!checking&&(!health?.chatConfigured||connectionError)&&<div className="setup-bar"><span>{connectionError || 'Connect a provider to start, or explore in Demo mode.'}</span><button onClick={()=>setSettings(true)}>Settings <ArrowUpRight size={12}/></button><button className="icon-button" aria-label="Recheck connection" onClick={()=>void checkConnection()}><RefreshCw size={14}/></button></div>}{state.preferences.demo&&<div className="demo-banner"><span className="demo-tag">DEMO</span> Simulated responses · no AI provider is connected to this chat</div>}
          {editing&&<div className="editing-banner"><Pencil size={13}/><span>Editing this message removes all following messages.</span><button onClick={()=>{setEditing(null);setDraft('');}}>Cancel</button></div>}
          {(composerError||voice.error)&&<div className="error-banner" role="alert">{composerError||voice.error}<button className="icon-button" aria-label="Dismiss error" onClick={()=>{setComposerError('');voice.clearError();}}><X size={15}/></button></div>}
          <form className={`composer ${voice.listening?'listening':''}`} onSubmit={e=>{e.preventDefault();void send();}}><textarea ref={textarea} aria-label="Message" dir="auto" rows={1} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={12000} placeholder={voice.listening ? 'Listening… speak your thought' : `Message ${character?.name || APP_NAME}…`} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&window.matchMedia('(min-width: 768px)').matches){e.preventDefault();void send();}}}/><div className="composer-bottom"><div className="composer-tools"><button type="button" className={`tool-button ${voice.listening?'active':''}`} disabled={busy} aria-label={voice.listening?'Stop listening':'Use microphone'} title={!voice.recognitionSupported?'Speech recognition unavailable in this browser':'Use microphone'} onClick={()=>voice.listening?voice.stopListening():voice.startListening()}>{voice.listening?<MicOff size={17}/>:<Mic size={17}/>}</button><span className="tool-divider"/><button type="button" className="tool-button image-tool" onClick={()=>{setMode('image');voice.stopListening();voice.stopSpeaking();}}><Image size={16}/><span>Create an image</span></button></div><div className="send-controls"><span className="enter-hint">{voice.listening?'Listening…':busy?'Generating…':'↵ to send'}</span>{busy ? <button className="send-button stop-button" type="button" aria-label="Stop generation" onClick={stop}><Square size={15} fill="currentColor"/></button> : <button className="send-button" type="submit" disabled={!draft.trim()} aria-label={editing?'Save and regenerate':'Send message'}><ArrowUp size={19}/></button>}</div></div></form>
          <div className="composer-caption"><span>{APP_NAME} can make mistakes. Give important details a second look.</span><span className="local-indicator"><span/>Saved locally</span></div>
        </div></>}
    </main>
    {settings&&<LazyBoundary fallback={<Modal title="Settings could not load" onClose={()=>setSettings(false)}><p>Refresh the page to try again.</p></Modal>}><Suspense fallback={<Modal title="Opening settings…" onClose={()=>setSettings(false)}><p role="status">Just a moment.</p></Modal>}><Settings models={models} onClose={()=>setSettings(false)} onClear={()=>{stop();voice.stopSpeaking();}}/></Suspense></LazyBoundary>}
    {dialog&&<Modal title={dialog.kind==='rename'?'Manage conversation':'Delete conversation?'} onClose={()=>setDialog(null)}>{dialog.kind==='rename'?<><form onSubmit={e=>{e.preventDefault();dispatch(actions.rename({id:dialog.id,title:rename}));setDialog(null);}}><label className="rename-field">Conversation name<input autoFocus maxLength={160} value={rename} onChange={e=>setRename(e.target.value)}/></label><div className="modal-actions"><button className="danger-link" type="button" onClick={()=>setDialog({...dialog,kind:'delete'})}><Trash2 size={15}/>Delete chat</button><button className="primary" type="submit">Save name</button></div></form></>:<><p className="modal-description">“{dialog.title}” and its messages will be removed from this device.</p><div className="modal-actions"><button className="secondary" onClick={()=>setDialog(null)}>Keep chat</button><button className="danger" onClick={()=>{if(busyId===dialog.id)stop();dispatch(actions.remove(dialog.id));setDialog(null);}}>Delete chat</button></div></>}</Modal>}
  </div>;
}
