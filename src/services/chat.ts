import type { ChatEvent, ChatRequest, Message, Model, Health } from '../../shared/types';
import { SSEParser } from '../../shared/sse';
export interface ChatService { stream(request:ChatRequest, signal:AbortSignal, onText:(text:string)=>void):Promise<void>; }
export interface TranscriptionService { transcribe(audio:Blob, language:string, signal:AbortSignal):Promise<string>; }
export interface SpeechService { speak(text:string,language:string):void; stop():void; }
export interface ImageService { generate(request: import('../../shared/types').ImageRequest, signal:AbortSignal):Promise<import('../../shared/types').ImageResponse>; }
export async function apiJSON<T>(url:string, options:RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(url,{...options,signal:options.signal || AbortSignal.timeout(20000)}); }
  catch(e) { if (options.signal?.aborted) throw e; throw new Error('Cannot reach the API server. Run npm run dev, then try again.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `The API request failed (${response.status}).`);
  if (!body) throw new Error('The server returned an invalid response.');
  return body as T;
}
export const getHealth = () => apiJSON<Health>('/api/health');
export const getModels = () => apiJSON<{models:Model[];defaultModel:string}>('/api/models');
export function buildHistory(messages:Message[], demo:boolean): ChatRequest['messages'] {
  const result:ChatRequest['messages'] = [];
  // Failed, stopped, and demo/live mismatched turns are never sent to a provider.
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'user' || !m.content.trim() || !!m.demo !== demo) continue;
    const next = messages[i+1];
    if (next?.role === 'assistant' && next.status === 'complete' && next.content.trim() && !!next.demo === demo) {
      result.push({role:'user',content:m.content},{role:'assistant',content:next.content}); i++;
    } else if (i === messages.length - 1) result.push({role:'user',content:m.content});
  }
  if (result.length > 80 || result.reduce((n,m)=>n+m.content.length,0) > 60000 || result.some(m => m.content.length > 12000)) throw new Error('This conversation exceeds the context limit. Start a new chat or edit an earlier message.');
  if (!result.length || result.at(-1)?.role !== 'user') throw new Error('A user message is required.');
  return result;
}
export class ProxyChatService implements ChatService {
  async stream(request:ChatRequest, signal:AbortSignal,onText:(text:string)=>void) {
    let response:Response;
    try { response = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal}); }
    catch(e) { if (signal.aborted) throw e; throw new Error('Cannot reach the API server. Check your connection and run npm run dev.'); }
    if (!response.ok) { const body = await response.json().catch(()=>null); throw new Error(body?.error?.message || `Chat failed (${response.status}).`); }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('The API did not return a valid stream.');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let done = false;
    const parser = new SSEParser(data => {
      const event = JSON.parse(data) as ChatEvent;
      if (event.type === 'error') throw new Error(event.error.message);
      if (event.type === 'delta' && typeof event.text === 'string') onText(event.text);
      if (event.type === 'done') done = true;
    });
    try {
      while (!done) { const chunk = await reader.read(); if (chunk.done) { parser.feed(decoder.decode()); parser.finish(); break; } parser.feed(decoder.decode(chunk.value,{stream:true})); }
      if (!done) throw new Error('The stream was interrupted. Partial text has been preserved.');
    } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  }
}
