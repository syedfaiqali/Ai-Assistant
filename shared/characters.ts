import type { Character, Conversation } from './types.js';
export const CHARACTER_LIMITS = {name:80, gender:80, pronouns:80, personality:1000, background:2000, speakingStyle:1000, description:6000, openingGreeting:2000, exampleDialogue:3000} as const;
export const CHARACTER_TOTAL_LIMIT = 12000;
export const CHARACTER_AVATAR_LIMIT = 24000;
export const CHARACTER_LIBRARY_LIMIT = 50;
export function validateCharacter(value: unknown): Character {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A character profile is required.');
  const v = value as Record<string,unknown>;
  const fields = ['id','avatar','age','preferredLanguage','updatedAt',...Object.keys(CHARACTER_LIMITS)];
  if (Object.keys(v).some(key => !fields.includes(key))) throw new Error('Character profile contains unsupported fields.');
  if (typeof v.id !== 'string' || !v.id.trim() || v.id.length > 100 || typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt) || v.updatedAt < 0) throw new Error('Character metadata is invalid.');
  if (typeof v.age !== 'number' || !Number.isInteger(v.age) || v.age < 18 || v.age > 120) throw new Error('Characters must have an adult age from 18 to 120.');
  if (!['English','Urdu','Roman Urdu'].includes(v.preferredLanguage as string)) throw new Error('Choose English, Urdu, or Roman Urdu for the character.');
  let total = 0;
  const text: Record<string,string> = {};
  for (const [field,limit] of Object.entries(CHARACTER_LIMITS)) {
    if (typeof v[field] !== 'string' || (v[field] as string).length > limit) throw new Error(`${field} must be text of at most ${limit.toLocaleString()} characters.`);
    text[field] = (v[field] as string).trim(); total += text[field].length;
  }
  if (!text.name || !text.description) throw new Error('A character name and detailed description are required.');
  if (total > CHARACTER_TOTAL_LIMIT) throw new Error('Keep the combined character text under 12,000 characters.');
  if (v.avatar !== undefined && (typeof v.avatar !== 'string' || v.avatar.length > CHARACTER_AVATAR_LIMIT || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v.avatar))) throw new Error('Use a small uploaded PNG, JPEG, or WebP avatar.');
  return {id:v.id, ...text, age:v.age, preferredLanguage:v.preferredLanguage, updatedAt:v.updatedAt,...(v.avatar ? {avatar:v.avatar} : {})} as Character;
}
export function createCharacterConversation(character: Character, demo: boolean, now = Date.now()): Conversation {
  const snapshot = validateCharacter(character);
  return {id:crypto.randomUUID(), title:`Chat with ${snapshot.name}`, updatedAt:now, character:snapshot, messages:snapshot.openingGreeting ? [{id:crypto.randomUUID(),role:'assistant',content:snapshot.openingGreeting,status:'complete',createdAt:now,origin:'character-greeting',demo}] : []};
}
