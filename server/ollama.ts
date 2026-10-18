import type { ChatRequest, Model } from '../shared/types.js';
import type { ChatProvider } from './services.js';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { withAssistantIdentity } from './persona.js';

export class OllamaProvider implements ChatProvider {
  private baseUrl: string;
  constructor(private fetcher: typeof fetch = fetch, baseUrl = config.ollamaBaseUrl, private allowedModels: readonly string[] = config.allowedModels) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('OLLAMA_BASE_URL must be an HTTP(S) API URL without credentials, query or fragment.');
    this.baseUrl = url.href.replace(/\/$/, '');
  }
  private async request(path:string, init:RequestInit, signal:AbortSignal) {
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, {...init, signal});
    } catch (error) {
      signal.throwIfAborted();
      throw new HttpError(503, 'ollama_connection', 'Cannot reach Ollama. Start the Ollama app and check OLLAMA_BASE_URL in server/.env.');
    }
  }
  async models(signal:AbortSignal):Promise<Model[]> {
    const response = await this.request('/models', {}, AbortSignal.any([signal, AbortSignal.timeout(10000)]));
    if (!response.ok) throw new HttpError(503, 'ollama_catalog', 'Could not list Ollama models. Check OLLAMA_BASE_URL and update Ollama.');
    const body = await response.json().catch(()=>null) as {data?:{id?:string}[]} | null;
    if (!Array.isArray(body?.data)) throw new HttpError(502, 'ollama_catalog', 'Ollama returned an invalid model list.');
    return body.data.filter((m):m is {id:string}=>typeof m?.id === 'string' && this.allowedModels.includes(m.id)).map(m=>({id:m.id,name:`${m.id} · Local`,free:true,contextLength:0,capabilities:{chat:true,image:false}}));
  }
  async stream(request:ChatRequest, signal:AbortSignal) {
    if (!this.allowedModels.includes(request.model)) throw new HttpError(404, 'model_unavailable', 'Choose a configured Ollama model.');
    const models = await this.models(signal);
    if (!models.some(m=>m.id === request.model)) throw new HttpError(404, 'model_unavailable', 'This Ollama model is not installed. Download it with ollama pull using the exact model name in server/.env.');
    const response = await this.request('/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:request.model,messages:withAssistantIdentity(request.messages,request.character,true),stream:true,max_tokens:256,temperature:0.5}),
    },signal);
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(response.status === 404 ? 404 : 502,'ollama_generation',response.status === 404 ? 'The Ollama model is no longer installed. Download it again or select another model.' : 'Ollama could not generate a reply. Check its logs and available memory, or try a smaller model.');
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel();
      throw new HttpError(502,'stream','Ollama did not return a valid stream.');
    }
    return response.body;
  }
}
