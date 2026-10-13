export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error';
export interface Attachment { id: string; kind: 'image'; name: string; mimeType: string; }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; status: MessageStatus; createdAt: number; error?: string; demo?: boolean; attachments?: Attachment[]; origin?: 'character-greeting'; }
export interface Character {
  id: string; name: string; avatar?: string; gender: string; pronouns: string; age: number;
  personality: string; background: string; speakingStyle: string;
  preferredLanguage: 'English' | 'Urdu' | 'Roman Urdu'; description: string;
  openingGreeting: string; exampleDialogue: string; updatedAt: number;
}
export interface Conversation { id: string; title: string; messages: Message[]; updatedAt: number; character?: Character; }
export interface Preferences { theme: 'light' | 'dark' | 'system'; language: 'en-US' | 'ur-PK'; demo: boolean; muted: boolean; }
export interface SavedState { version: 2; conversations: Conversation[]; characters: Character[]; selectedCharacterId: string | null; activeId: string | null; selectedModel: string; preferences: Preferences; }
export interface Model { id: string; name: string; free: boolean; contextLength: number; capabilities: { chat: boolean; image: boolean }; }
export interface ChatRequest { model: string; messages: {role: 'user' | 'assistant'; content: string}[]; character?: Character; }
export interface ApiError { code: string; message: string; }
export type ChatEvent = {type:'delta'; text:string} | {type:'done'} | {type:'error'; error:ApiError};
export interface Health { chatConfigured: boolean; imageConfigured: boolean; imageModel: string | null; }
export interface ImageRequest { prompt: string; size: '1024x1024' | '1536x1024' | '1024x1536'; }
export interface ImageResponse { base64: string; mimeType: 'image/png'; }
