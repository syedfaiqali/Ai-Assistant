import type { ChatEvent, ChatRequest, ImageRequest, ImageResponse, Model } from '../shared/types.js';
import { SSEParser } from '../shared/sse.js';
import { config } from './config.js';
import { HttpError, providerError, safeError } from './errors.js';
import { setTimeout as delay } from 'node:timers/promises';
import { withAssistantIdentity } from './persona.js';
export interface ChatProvider { models(signal: AbortSignal): Promise<Model[]>; stream(request: ChatRequest, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>; }
export interface ImageProvider { generate(request: ImageRequest, signal: AbortSignal): Promise<ImageResponse>; }
export class OpenRouterProvider implements ChatProvider {
  private cache: {time:number; models:Model[]} | null = null;
  private preferredKey = 0;
  private keys: string[];
  constructor(private fetcher: typeof fetch = fetch, keys: readonly string[] = config.chatKeys) {
    this.keys = [...new Set(keys.map(key => key.trim()).filter(Boolean))].slice(0,3);
  }
  async models(signal: AbortSignal): Promise<Model[]> {
    if (this.cache && Date.now() - this.cache.time < 300000) return this.cache.models;
    // The public catalog requires no credential. A disabled primary key must not
    // prevent the browser from discovering models and using a healthy backup.
    const response = await this.fetcher('https://openrouter.ai/api/v1/models', {signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    if (!response.ok) throw providerError(response.status);
    const body = await response.json() as {data?: {id:string; name:string; context_length:number; pricing?: {prompt:string; completion:string}; architecture?:{input_modalities?:string[]; output_modalities?:string[]}}[]};
    if (!Array.isArray(body.data)) throw new HttpError(502,'catalog','The model catalog returned an invalid response.');
    const models = body.data.filter(m => config.allowedModels.includes(m.id) && m.architecture?.input_modalities?.includes('text') && m.architecture?.output_modalities?.includes('text')).map(m => ({id:m.id, name:m.name, free:m.pricing?.prompt === '0' && m.pricing?.completion === '0', contextLength:m.context_length, capabilities:{chat:true,image:false}}));
    this.cache = {time:Date.now(), models}; return models;
  }
  async stream(request: ChatRequest, signal: AbortSignal) {
    if (!this.keys.length) throw new HttpError(503,'setup','Live chat needs OPENROUTER_API_KEY in server/.env. You can enable Demo in Settings.');
    const models = await this.models(signal);
    if (!models.some(m => m.id === request.model)) throw new HttpError(404,'model_unavailable','This model is no longer in the provider catalog. Choose another configured model.');
    let lastError: HttpError = providerError(502);
    for (let offset = 0; offset < this.keys.length; offset++) {
      signal.throwIfAborted();
      const index = (this.preferredKey + offset) % this.keys.length;
      const attempt = new AbortController();
      const timeout = setTimeout(() => attempt.abort(new DOMException('Connection timed out','TimeoutError')),30000);
      let retryAfter = 0;
      try {
        const response = await this.fetcher('https://openrouter.ai/api/v1/chat/completions', {
          method:'POST', signal:AbortSignal.any([signal,attempt.signal]), headers:{Authorization:`Bearer ${this.keys[index]}`, 'Content-Type':'application/json'},
          body:JSON.stringify({model:request.model, messages:withAssistantIdentity(request.messages,request.character), stream:true, max_tokens:4096}),
        });
        if (response.ok) {
          if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
            await response.body?.cancel();
            throw new HttpError(502,'stream','The provider did not return a valid stream.');
          }
          this.preferredKey = index;
          // Never restart a returned stream with another credential. Partial
          // output and midstream failures are handled by relayStream as before.
          return response.body;
        }
        const header = response.headers.get('Retry-After');
        if (header) {
          const seconds = Number(header);
          retryAfter = Number.isFinite(seconds) ? Math.max(0,seconds*1000) : Math.max(0,Date.parse(header)-Date.now());
          if (!Number.isFinite(retryAfter)) retryAfter = 0;
        }
        let keyBudget = false;
        if (response.status === 403) {
          const body = await response.json().catch(() => null) as {error?:{metadata?:{limit_source?:string}}} | null;
          keyBudget = body?.error?.metadata?.limit_source === 'openrouter_key_limit';
        } else await response.body?.cancel();
        lastError = keyBudget ? new HttpError(403,'key_budget','The configured key has reached its spending limit.') : providerError(response.status);
        // Key-specific failures can use a backup. Shared rate limits, policy
        // blocks, workspace budgets and invalid requests are terminal.
        if (![401,402,408,500,502,503,504].includes(response.status) && !keyBudget) throw lastError;
      } catch(error) {
        signal.throwIfAborted();
        if (error instanceof HttpError && !['stream','provider_error'].includes(error.code)) throw error;
        lastError = safeError(error);
      } finally { clearTimeout(timeout); }
      if (offset < this.keys.length - 1) {
        // Honor provider backoff; never rotate keys to evade HTTP 429 limits.
        if (retryAfter > 30000) throw new HttpError(lastError.status,lastError.code,`${lastError.message} Try again after the provider's retry window.`);
        await delay(retryAfter || 150,undefined,{signal});
      }
    }
    throw new HttpError(lastError.status,lastError.code,`All configured chat keys failed. ${lastError.message}`);
  }
}
export class OpenAIImageProvider implements ImageProvider {
  constructor(private fetcher: typeof fetch = fetch) {}
  async generate(request: ImageRequest, signal: AbortSignal): Promise<ImageResponse> {
    if (!config.imageKey) throw new HttpError(503,'setup','Image generation needs OPENAI_IMAGE_API_KEY in server/.env. Image generation is billed separately from chat.');
    const response = await this.fetcher('https://api.openai.com/v1/images/generations', {method:'POST',signal,headers:{Authorization:`Bearer ${config.imageKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.imageModel, ...request, n:1, quality:'low', output_format:'png'})});
    if (!response.ok) {
      // Detect policy refusal without relaying raw messages or credential-bearing data.
      const body = await response.json().catch(() => null) as {error?:{code?:string}} | null;
      if (body?.error?.code === 'moderation_blocked' || body?.error?.code === 'content_policy_violation') throw providerError(403);
      throw providerError(response.status);
    }
    const body = await response.json() as {data?:{b64_json?:string}[]};
    const base64 = body.data?.[0]?.b64_json;
    if (!base64 || base64.length > 30000000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) throw new HttpError(502,'image_response','The provider did not return a valid image.');
    return {base64, mimeType:'image/png'};
  }
}
// Normalize upstream events into a small, credential-free browser protocol.
export async function relayStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal, emit: (event: ChatEvent) => Promise<void>) {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let complete = false; let textLength = 0;
  let events: ChatEvent[] = [];
  const parser = new SSEParser(data => {
    if (complete) return;
    if (data === '[DONE]') { complete = true; if (!textLength) throw new HttpError(502,'empty','The provider returned no text. Try again or choose another model.'); events.push({type:'done'}); return; }
    let chunk;
    try { chunk = JSON.parse(data); } catch { throw new HttpError(502,'stream','The provider returned malformed streaming data.'); }
    if (chunk.error) throw providerError(Number(chunk.error.code) || 502);
    const choice = chunk.choices?.[0];
    if (choice?.delta?.refusal || choice?.finish_reason === 'content_filter') throw providerError(403);
    if (choice?.finish_reason === 'error') throw providerError(502);
    if (typeof choice?.delta?.content === 'string' && choice.delta.content) {
      textLength += choice.delta.content.length;
      if (textLength > 100000) throw new HttpError(502,'response_limit','The response exceeded the configured limit. Partial text has been preserved.');
      events.push({type:'delta',text:choice.delta.content});
    }
  });
  const abort = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort',abort,{once:true});
  try {
    while (!complete) {
      signal.throwIfAborted(); const {value,done} = await reader.read();
      if (done) { parser.feed(decoder.decode()); parser.finish(); break; }
      try { parser.feed(decoder.decode(value,{stream:true})); }
      catch (error) { for (const event of events) await emit(event); events = []; throw error; }
      for (const event of events) await emit(event); events = [];
    }
    signal.throwIfAborted();
    if (!complete) throw new HttpError(502,'interrupted','The provider disconnected before completion. Partial text has been preserved.');
  } finally { signal.removeEventListener('abort',abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
