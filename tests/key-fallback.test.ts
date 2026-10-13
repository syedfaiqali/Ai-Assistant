import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterProvider, relayStream } from '../server/services.js';
import { configuredChatKeys } from '../server/chat-keys.js';
import { config } from '../server/config.js';
import { safeError } from '../server/errors.js';
const keys = ['dummy-key-one','dummy-key-two','dummy-key-three'];
const request = {model:config.allowedModels[0],messages:[{role:'user' as const,content:'Hello'}]};
const success = () => new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
const catalog = () => Response.json({data:[{id:request.model,name:'Test',context_length:4096,pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}}]});
function provider(respond:(index:number,init:RequestInit)=>Promise<Response>|Response,credentials=keys) {
  const calls:string[]=[];let catalogAuthenticated=false;
  const fetcher:typeof fetch = async (url,init={}) => {
    if(String(url).endsWith('/models')){catalogAuthenticated=new Headers(init.headers).has('Authorization');return catalog();}
    calls.push(new Headers(init.headers).get('Authorization') || '');return respond(calls.length-1,init);
  };
  return {service:new OpenRouterProvider(fetcher,credentials),calls,isCatalogAuthenticated:()=>catalogAuthenticated};
}
test('key configuration supports three distinct names, legacy single key and duplicate removal',()=>{
  assert.deepEqual(configuredChatKeys({OPENROUTER_API_KEY:keys[0],OPENROUTER_API_KEY_2:keys[1],OPENROUTER_API_KEY_3:keys[2]}),keys);
  assert.deepEqual(configuredChatKeys({OPENROUTER_API_KEY_1:keys[0],OPENROUTER_API_KEY_2:keys[0]}),[keys[0]]);
  assert.deepEqual(configuredChatKeys({OPENROUTER_API_KEY:' ',OPENROUTER_API_KEY_2:keys[1]}),[keys[1]]);
});
test('primary success issues one request and catalog does not use an API key',async()=>{
  const p=provider(()=>success());await(await p.service.stream(request,new AbortController().signal)).cancel();assert.deepEqual(p.calls,[`Bearer ${keys[0]}`]);assert.equal(p.isCatalogAuthenticated(),false);
});
test('every provider attempt prepends the server-owned personal assistant identity without changing history',async()=>{
  const original=structuredClone(request);const bodies:{messages:{role:string;content:string}[]}[]=[];
  const p=provider((index,init)=>{bodies.push(JSON.parse(String(init.body)));return index===0?new Response('',{status:401}):success();});
  await(await p.service.stream(request,new AbortController().signal)).cancel();
  assert.equal(bodies.length,2);
  for(const body of bodies){assert.equal(body.messages[0].role,'system');assert.match(body.messages[0].content,/I'm Fiqqu, Faiq's personal model/);assert.match(body.messages[0].content,/answer honestly/);assert.deepEqual(body.messages.slice(1),original.messages);}
  assert.deepEqual(request,original);
});
test('invalid first key then exhausted second key use third, which becomes preferred',async()=>{
  const p=provider(i=>i===0?new Response('',{status:401}):i===1?new Response('',{status:402}):success());
  await(await p.service.stream(request,new AbortController().signal)).cancel();assert.deepEqual(p.calls,keys.map(k=>`Bearer ${k}`));
  await(await p.service.stream(request,new AbortController().signal)).cancel();assert.equal(p.calls[3],`Bearer ${keys[2]}`);
});
test('network and temporary provider failures can use the next credential',async()=>{
  const p=provider(i=>{if(i===0)throw new Error(`network failure contains ${keys[0]}`);return i===1?new Response('',{status:503}):success();});
  await(await p.service.stream(request,new AbortController().signal)).cancel();assert.equal(p.calls.length,3);
});
test('only key-specific 403 budget metadata allows fallback',async()=>{
  const p=provider(i=>i===0?Response.json({error:{metadata:{limit_source:'openrouter_key_limit'}}},{status:403}):success());
  await(await p.service.stream(request,new AbortController().signal)).cancel();assert.equal(p.calls.length,2);
  for(const source of ['openrouter_guardrail_budget','openrouter_workspace_budget',undefined]){
    const denied=provider(()=>Response.json({error:{metadata:{limit_source:source}}},{status:403}));
    await assert.rejects(denied.service.stream(request,new AbortController().signal),/refused/);assert.equal(denied.calls.length,1);
  }
});
test('shared rate limits, policy blocks and invalid requests do not rotate keys',async()=>{
  for(const status of [400,403,404,429]){
    const p=provider(()=>new Response('',{status}));await assert.rejects(p.service.stream(request,new AbortController().signal));assert.equal(p.calls.length,1);
  }
});
test('exhausting the pool returns a sanitized error and tries every distinct key only once',async()=>{
  const p=provider(()=>new Response('',{status:402}));let error:unknown;
  try{await p.service.stream(request,new AbortController().signal);}catch(e){error=e;}
  const clean=safeError(error);assert.equal(clean.code,'quota');assert.match(clean.message,/All configured chat keys failed/);assert.ok(keys.every(key=>!JSON.stringify(clean.toJSON()).includes(key)));assert.equal(p.calls.length,3);
  const duplicate=provider(()=>new Response('',{status:401}),[keys[0],keys[0]]);await assert.rejects(duplicate.service.stream(request,new AbortController().signal));assert.equal(duplicate.calls.length,1);
});
test('Stop during provider Retry-After cancels wait without requesting another key',async()=>{
  const p=provider(()=>new Response('',{status:503,headers:{'Retry-After':'10'}}));const c=new AbortController();
  const task=p.service.stream(request,c.signal);setTimeout(()=>c.abort(),50);await assert.rejects(task);assert.equal(p.calls.length,1);
});
test('client abort during a connection attempt never triggers fallback',async()=>{
  const p=provider((_i,init)=>new Promise((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(init.signal!.reason),{once:true});}));
  const c=new AbortController();const task=p.service.stream(request,c.signal);setTimeout(()=>c.abort(),30);await assert.rejects(task);assert.equal(p.calls.length,1);
});
test('midstream failure preserves partial text without issuing another request',async()=>{
  const p=provider(()=>new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"error":{"code":503}}\n\n',{headers:{'Content-Type':'text/event-stream'}}));const c=new AbortController();const stream=await p.service.stream(request,c.signal);const texts:string[]=[];
  await assert.rejects(relayStream(stream,c.signal,async e=>{if(e.type==='delta')texts.push(e.text);}));assert.deepEqual(texts,['partial']);assert.equal(p.calls.length,1);
});
