import type { ChatRequest, ImageRequest } from '../shared/types.js';
import { HttpError } from './errors.js';
import { validateCharacter } from '../shared/characters.js';
export function validateChat(value: unknown, allowed: string[]): ChatRequest {
  const invalid = () => { throw new HttpError(400,'validation','Use an allowed model and 1–80 alternating text messages (up to 12,000 characters each and 60,000 total), ending with a user message.'); };
  if (!value || typeof value !== 'object') return invalid();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(k => !['model','messages','character'].includes(k))) return invalid();
  if (typeof body.model !== 'string' || !allowed.includes(body.model)) return invalid();
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 80) return invalid();
  let total = 0;
  const messages = body.messages.map((m: unknown, index: number) => {
    if (!m || typeof m !== 'object') return invalid();
    const item = m as Record<string, unknown>;
    if (Object.keys(item).some(k => !['role','content'].includes(k)) || item.role !== (index % 2 ? 'assistant' : 'user') || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 12000) return invalid();
    total += item.content.length;
    return {role:item.role as 'user'|'assistant', content:item.content};
  });
  if (total > 60000 || messages.at(-1)?.role !== 'user') return invalid();
  let character: ChatRequest['character'];
  if (body.character !== undefined) {
    try { character = validateCharacter(body.character); }
    catch(error) { throw new HttpError(400,'character_validation',error instanceof Error ? error.message : 'Character profile is invalid.'); }
  }
  return {model:body.model, messages,...(character ? {character} : {})};
}
export const imageSizes = ['1024x1024','1536x1024','1024x1536'] as const;
export function validateImage(value: unknown): ImageRequest {
  if (!value || typeof value !== 'object') throw new HttpError(400,'validation','An image prompt and supported size are required.');
  const b = value as Record<string, unknown>;
  if (Object.keys(b).some(k => !['prompt','size'].includes(k)) || typeof b.prompt !== 'string' || !b.prompt.trim() || b.prompt.length > 4000 || !imageSizes.includes(b.size as ImageRequest['size'])) throw new HttpError(400,'validation','Enter a prompt of 1–4,000 characters and a supported size.');
  return {prompt:b.prompt.trim(), size:b.size as ImageRequest['size']};
}
