import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaProvider } from '../server/ollama.js';
import { relayStream } from '../server/services.js';
import type { ChatEvent } from '../shared/types.js';

const model = 'dolphin3:latest';
const request = {model,messages:[{role:'user' as const,content:'Hello'}]};
const catalog = () => Response.json({data:[{id:model},{id:'other:latest'}]});

test('local Ollama discovers installed allowed models and streams through the existing browser protocol without credentials',async()=>{
  const urls:string[]=[];let payload:any;
  const fetcher:typeof fetch = async(url,init={})=>{
    urls.push(String(url));assert.equal(new Headers(init.headers).has('Authorization'),false);
    if(String(url).endsWith('/models'))return catalog();
    payload=JSON.parse(String(init.body));
    return new Response('data: {"choices":[{"delta":{"content":"Hello back"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  };
  const provider = new OllamaProvider(fetcher,'http://127.0.0.1:11434/v1/',[model]);
  const signal = new AbortController().signal;
  const models = await provider.models(signal);
  assert.deepEqual(models.map(m=>m.id),[model]);assert.equal(models[0].free,true);
  const events:ChatEvent[]=[];
  await relayStream(await provider.stream(request,signal),signal,async event=>{events.push(event);});
  assert.deepEqual(events,[{type:'delta',text:'Hello back'},{type:'done'}]);
  assert.equal(payload.messages[0].role,'system');assert.deepEqual(payload.messages.at(-1),request.messages[0]);
  assert.equal(payload.stream,true);assert.equal(payload.max_tokens,256);assert.ok(urls.every(url=>url.startsWith('http://127.0.0.1:11434/v1/')));
});

test('missing and disallowed local models never start generation',async()=>{
  let calls=0;
  const provider=new OllamaProvider(async()=>{calls++;return Response.json({data:[]});},'http://localhost:11434/v1',[model]);
  await assert.rejects(provider.stream({...request,model:'not-allowed'},new AbortController().signal),/configured Ollama model/);
  assert.equal(calls,0);
  await assert.rejects(provider.stream(request,new AbortController().signal),/not installed/);assert.equal(calls,1);
});

test('Ollama failures give actionable errors without exposing upstream details',async()=>{
  const signal=new AbortController().signal;
  await assert.rejects(new OllamaProvider(async()=>{throw new Error('private network detail');},'http://localhost:11434/v1',[model]).models(signal),/Start the Ollama app/);
  await assert.rejects(new OllamaProvider(async()=>Response.json({data:'invalid'}),'http://localhost:11434/v1',[model]).models(signal),/invalid model list/);
  const provider=new OllamaProvider(async url=>String(url).endsWith('/models')?catalog():new Response('private backend details',{status:500}),'http://localhost:11434/v1',[model]);
  await assert.rejects(provider.stream(request,signal),/available memory/);
  const nonStreaming=new OllamaProvider(async url=>String(url).endsWith('/models')?catalog():Response.json({message:'not streaming'}),'http://localhost:11434/v1',[model]);
  await assert.rejects(nonStreaming.stream(request,signal),/valid stream/);
});

test('stopping an Ollama request aborts the upstream generation',async()=>{
  let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
  const provider=new OllamaProvider(async(url,init={})=>{
    if(String(url).endsWith('/models'))return catalog();
    return new Promise<Response>((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(init.signal!.reason),{once:true});started();});
  },'http://localhost:11434/v1',[model]);
  const controller=new AbortController();const work=provider.stream(request,controller.signal);
  await ready;controller.abort();await assert.rejects(work,{name:'AbortError'});
});
