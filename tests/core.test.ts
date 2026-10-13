import test from 'node:test';
import assert from 'node:assert/strict';
import { SSEParser } from '../shared/sse.js';
import { relayStream } from '../server/services.js';
import { validateChat, validateImage } from '../server/validation.js';
import { parseSaved, LocalConversationRepository, STORAGE_KEY } from '../src/repository.js';
import { buildHistory } from '../src/services/chat.js';
import type { ChatEvent, Message, SavedState } from '../shared/types.js';
const encoder = new TextEncoder();
function bytesStream(text:string,step=1) { const bytes=encoder.encode(text);let i=0;return new ReadableStream<Uint8Array>({pull(c){if(i>=bytes.length){c.close();return;}c.enqueue(bytes.slice(i,i+step));i+=step;}}); }
test('SSE handles split CRLF, comments and multiline events',()=>{
  const data:string[]=[];const p=new SSEParser(v=>data.push(v));
  for(const c of ': comment\r\ndata: {"a":\r\ndata: 1}\r\n\r\ndata: [DONE]\n\n')p.feed(c);
  p.finish();assert.deepEqual(data,['{"a":\n1}','[DONE]']);
  const unfinished=new SSEParser(()=>{});unfinished.feed('data: {');assert.throws(()=>unfinished.finish());
});
test('relay streams Urdu split at every UTF-8 byte and finishes exactly once',async()=>{
  const events:ChatEvent[]=[];const text='السلام علیکم';
  await relayStream(bytesStream(`: heartbeat\n\ndata: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`),new AbortController().signal,async e=>{events.push(e);});
  assert.deepEqual(events,[{type:'delta',text},{type:'done'}]);
});
test('midstream errors keep partial content without successful completion',async()=>{
  const events:ChatEvent[]=[];
  await assert.rejects(relayStream(bytesStream('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"error":{"code":429,"message":"sensitive raw provider error"}}\n\n',10000),new AbortController().signal,async e=>{events.push(e);}),/rate limit/);
  assert.deepEqual(events,[{type:'delta',text:'partial'}]);
});
test('refusals, empty completions, malformed events and abrupt EOF are failures',async()=>{
  for(const text of ['data: {"choices":[{"delta":{"refusal":"policy"}}]}\n\n','data: [DONE]\n\n','data: invalid\n\n','data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'])
    await assert.rejects(relayStream(bytesStream(text),new AbortController().signal,async()=>{}));
});
test('aborting relay cancels the upstream reader while it waits for bytes',async()=>{
  let cancelled=false;let started!:()=>void;const ready=new Promise<void>(r=>started=r);
  const stream=new ReadableStream<Uint8Array>({start(){started();},cancel(){cancelled=true;}});
  const c=new AbortController();const work=relayStream(stream,c.signal,async()=>{});await ready;c.abort();await assert.rejects(work);assert.equal(cancelled,true);
});
test('request validation rejects URLs, oversized prompts, invalid roles and malformed history',()=>{
  const ok={model:'allowed',messages:[{role:'user',content:'Hello'}]};assert.deepEqual(validateChat(ok,['allowed']),ok);
  for(const value of [null,{...ok,model:'https://evil.test'},{...ok,url:'https://evil.test'},{...ok,messages:[{role:'system',content:'x'}]},{...ok,messages:[{role:'user',content:'x'.repeat(12001)}]},{...ok,messages:[{role:'user',content:'x'},{role:'user',content:'y'}]}])assert.throws(()=>validateChat(value,['allowed']));
  assert.throws(()=>validateImage({prompt:'x',size:'256x256'}));assert.throws(()=>validateImage({prompt:'x'.repeat(4001),size:'1024x1024'}));assert.throws(()=>validateImage({prompt:'x',size:'1024x1024',url:'http://evil.test'}));
});
const message=(role:Message['role'],content:string,status:Message['status']='complete',demo=false):Message=>({id:crypto.randomUUID(),role,content,status,demo,createdAt:1});
test('valid provider history excludes failed, interrupted and demo turns',()=>{
  const messages=[message('user','demo','complete',true),message('assistant','simulated','complete',true),message('user','bad'),message('assistant','partial','error'),message('user','good'),message('assistant','response'),message('user','next')];
  assert.deepEqual(buildHistory(messages,false),[{role:'user',content:'good'},{role:'assistant',content:'response'},{role:'user',content:'next'}]);
});
const saved:SavedState={version:2,characters:[],selectedCharacterId:null,conversations:[{id:'c',title:'Test',updatedAt:1,messages:[message('user','Hello'),message('assistant','partial','streaming')]}],activeId:'c',selectedModel:'allowed',preferences:{theme:'system',language:'ur-PK',demo:false,muted:false}};
test('persistence restores interrupted text safely and rejects corrupted or outdated data',()=>{
  const restored=parseSaved(JSON.stringify(saved));assert.equal(restored?.conversations[0].messages[1].status,'stopped');assert.equal(restored?.conversations[0].messages[1].content,'partial');
  for(const raw of ['{','null',JSON.stringify({...saved,version:3}),JSON.stringify({...saved,preferences:{}}),JSON.stringify({...saved,conversations:[null]})])assert.equal(parseSaved(raw),null);
});
test('repository strips attachments and propagates quota failures',()=>{
  const memory=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}});
  const repository=new LocalConversationRepository();const copy=structuredClone(saved);copy.conversations[0].messages[0].attachments=[{id:'image',kind:'image',name:'large',mimeType:'image/png'}];repository.save(copy);
  assert.equal(memory.get(STORAGE_KEY)?.includes('attachments'),false);assert.equal(repository.load()?.activeId,'c');repository.clear();assert.equal(repository.load(),null);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem(){throw new Error('QuotaExceededError');}}});assert.throws(()=>repository.save(saved),/Quota/);
});
