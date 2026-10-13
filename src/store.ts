import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { Character, Conversation, Message, Preferences, SavedState } from '../shared/types';
import { CHARACTER_LIBRARY_LIMIT, validateCharacter } from '../shared/characters';
import { LocalConversationRepository } from './repository';
const repository = new LocalConversationRepository();
const defaults: SavedState = {version:2,conversations:[],characters:[],selectedCharacterId:null,activeId:null,selectedModel:'',preferences:{theme:'system',language:'en-US',demo:false,muted:false}};
let saved: SavedState | null = null; let storageWarning: string | null = null;
try { saved = repository.load(); } catch { storageWarning = 'Browser storage is unavailable. Conversations will last for this session only.'; }
const slice = createSlice({name:'app',initialState:{...(saved || defaults),storageWarning},reducers:{
  create(state,action:PayloadAction<Conversation>) { state.conversations.unshift(action.payload); state.activeId = action.payload.id; },
  activate(state,action:PayloadAction<string|null>) { state.activeId = action.payload; },
  rename(state,action:PayloadAction<{id:string;title:string}>) { const c = state.conversations.find(c => c.id === action.payload.id); if (c) c.title = action.payload.title.trim().slice(0,160) || 'Untitled chat'; },
  remove(state,action:PayloadAction<string>) { state.conversations = state.conversations.filter(c => c.id !== action.payload); if (state.activeId === action.payload) state.activeId = null; },
  replaceMessages(state,action:PayloadAction<{id:string;messages:Message[]}>) { const c = state.conversations.find(c => c.id === action.payload.id); if (c) { c.messages = action.payload.messages; c.updatedAt = Date.now(); if (c.title === 'Untitled chat') c.title = c.messages.find(m => m.role === 'user')?.content.slice(0,60) || c.title; } },
  patchMessage(state,action:PayloadAction<{conversationId:string;id:string;patch:Partial<Message>}>) { const m = state.conversations.find(c => c.id === action.payload.conversationId)?.messages.find(m => m.id === action.payload.id); if (m) Object.assign(m,action.payload.patch); },
  model(state,action:PayloadAction<string>) { state.selectedModel = action.payload; },
  preferences(state,action:PayloadAction<Partial<Preferences>>) { Object.assign(state.preferences,action.payload); },
  saveCharacter(state,action:PayloadAction<Character>) {
    const character = validateCharacter(action.payload); const index = state.characters.findIndex(c=>c.id===character.id);
    if (index >= 0) state.characters[index] = character;
    else { if(state.characters.length >= CHARACTER_LIBRARY_LIMIT) throw new Error('Your library is full. Delete a character before adding another.'); state.characters.push(character); }
    state.selectedCharacterId = character.id;
  },
  selectCharacter(state,action:PayloadAction<string|null>) { state.selectedCharacterId = action.payload; },
  deleteCharacter(state,action:PayloadAction<string>) { state.characters = state.characters.filter(c=>c.id!==action.payload); if(state.selectedCharacterId===action.payload) state.selectedCharacterId=null; },
  warning(state,action:PayloadAction<string|null>) { state.storageWarning = action.payload; },
  clear(state) { state.conversations = []; state.characters = []; state.selectedCharacterId = null; state.activeId = null; },
}});
export const actions = slice.actions;
export const appReducer = slice.reducer;
export const store = configureStore({reducer:appReducer});
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
let timer: ReturnType<typeof setTimeout>;
let lastData = '';
store.subscribe(() => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const {storageWarning: _warning,...data} = store.getState();
    const serialized = JSON.stringify(data);
    if (serialized === lastData) return; lastData = serialized;
    try { repository.save(data); } catch { store.dispatch(actions.warning('Browser storage is full or blocked. Export your chats to keep a backup; recent changes may not survive refresh.')); }
  },800);
});
export function flushPersistence() {
  clearTimeout(timer); const {storageWarning: _warning,...data} = store.getState();
  try { repository.save(data); } catch { /* The UI reports failures via the debounced subscriber. */ }
}
if (typeof window !== 'undefined') { window.addEventListener('pagehide',flushPersistence); document.addEventListener('visibilitychange',() => { if (document.hidden) flushPersistence(); }); }
export function clearSavedData() { clearTimeout(timer); repository.clear(); store.dispatch(actions.clear()); }
