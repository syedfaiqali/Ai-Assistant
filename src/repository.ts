import type { SavedState, Conversation, Message } from '../shared/types';
import { CHARACTER_LIBRARY_LIMIT, validateCharacter } from '../shared/characters';
export interface ConversationRepository { load(): SavedState | null; save(state: SavedState): void; clear(): void; }
export const STORAGE_KEY = 'luma.conversations.v1';
const statuses = ['complete','streaming','stopped','error'];
function isMessage(m: unknown): m is Message {
  if (!m || typeof m !== 'object') return false;
  const v = m as Message;
  return typeof v.id === 'string' && v.id.length < 100 && ['user','assistant'].includes(v.role) && typeof v.content === 'string' && v.content.length <= 100000 && statuses.includes(v.status) && Number.isFinite(v.createdAt) && (v.error === undefined || typeof v.error === 'string') && (v.demo === undefined || typeof v.demo === 'boolean') && (v.origin === undefined || v.origin === 'character-greeting' && v.role === 'assistant');
}
export function parseSaved(raw: string): SavedState | null {
  try {
    if (raw.length > 4000000) return null;
    const v = JSON.parse(raw) as Omit<SavedState,'version'> & {version: number};
    if (![1,2].includes(v.version) || !Array.isArray(v.conversations) || v.conversations.length > 150 || typeof v.selectedModel !== 'string' || v.selectedModel.length > 200 || !v.preferences || !['light','dark','system'].includes(v.preferences.theme) || !['en-US','ur-PK'].includes(v.preferences.language) || typeof v.preferences.demo !== 'boolean' || typeof v.preferences.muted !== 'boolean') return null;
    if (v.version === 2 && (!Array.isArray(v.characters) || v.characters.length > CHARACTER_LIBRARY_LIMIT)) return null;
    const characterIds = new Set<string>();
    const characters = v.version === 2 ? v.characters.map(value => {
      const character = validateCharacter(value);
      if(characterIds.has(character.id)) throw new Error('Duplicate character'); characterIds.add(character.id); return character;
    }) : [];
    const ids = new Set<string>();
    const conversations = v.conversations.map((c: Conversation) => {
      if (!c || typeof c.id !== 'string' || ids.has(c.id) || typeof c.title !== 'string' || c.title.length > 160 || !Number.isFinite(c.updatedAt) || !Array.isArray(c.messages) || c.messages.length > 500 || !c.messages.every(isMessage)) throw new Error('Invalid conversation');
      ids.add(c.id); const messageIds = new Set<string>();
      return {id:c.id,title:c.title,updatedAt:c.updatedAt,...(v.version === 2 && c.character ? {character:validateCharacter(c.character)} : {}),messages:c.messages.map(m => {
        if (messageIds.has(m.id)) throw new Error('Duplicate message'); messageIds.add(m.id);
        return {id:m.id,role:m.role,content:m.content,status:m.status === 'streaming' ? 'stopped' as const : m.status,createdAt:m.createdAt,...(m.error ? {error:m.error.slice(0,1000)} : {}),...(m.origin ? {origin:m.origin} : {}),demo:!!m.demo};
      })};
    });
    return {version:2,conversations,characters,selectedCharacterId:characters.some(c=>c.id===v.selectedCharacterId) ? v.selectedCharacterId : null,activeId:conversations.some(c => c.id === v.activeId) ? v.activeId : null,selectedModel:v.selectedModel,preferences:{theme:v.preferences.theme,language:v.preferences.language,demo:v.preferences.demo,muted:v.preferences.muted}};
  } catch { return null; }
}
export class LocalConversationRepository implements ConversationRepository {
  load() { const raw = localStorage.getItem(STORAGE_KEY); return raw ? parseSaved(raw) : null; }
  save(state: SavedState) {
    // Only explicitly selected text fields are persisted. Image bytes never enter storage.
    const textOnly = {...state,conversations:state.conversations.map(c => ({...c,messages:c.messages.map(({attachments: _attachments,...m}) => m)}))};
    const raw = JSON.stringify(textOnly);
    if (raw.length > 4000000) throw new Error('Storage limit');
    localStorage.setItem(STORAGE_KEY,raw);
  }
  clear() { localStorage.removeItem(STORAGE_KEY); }
}
