import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { HttpError } from '../server/errors.js';
import type { ChatProvider, ImageProvider } from '../server/services.js';
const encoder=new TextEncoder();
test('API validates requests, sanitizes errors, streams incrementally and aborts upstream on disconnect',async()=>{
  const old=config.chatKeys;const oldImage=config.imageKey;config.chatKeys=['test-secret-never-expose'];config.imageKey='test-image-secret';
  let signal:AbortSignal|undefined;let fail=false;let calls=0;
  const chat:ChatProvider={async models(){return[{id:config.allowedModels[0],name:'Test',free:true,contextLength:4096,capabilities:{chat:true,image:false}}];},async stream(_req,s){calls++;if(fail)throw new Error(`secret ${config.chatKeys[0]}`);signal=s;return new ReadableStream({start(c){c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n'));}});}};
  const image:ImageProvider={async generate(){throw new HttpError(403,'refusal','The provider refused the image request.');}};
  const server=createApp(chat,image).listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post=(path:string,body:unknown,extra:Record<string,string>={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  try{
    const health=await(await fetch(url+'/api/health')).text();assert.ok(!health.includes('secret'));assert.ok(health.includes('chatConfigured'));
    const models=await(await fetch(url+'/api/models')).text();assert.ok(!models.includes('secret'));
    const body={model:config.allowedModels[0],messages:[{role:'user',content:'Hi'}]};
    assert.equal((await post('/api/chat',{...body,model:'arbitrary'})).status,400);assert.equal(calls,0);
    assert.equal((await post('/api/chat',body,{Origin:'https://evil.test'})).status,403);
    assert.equal((await post('/api/chat',{...body,messages:[{role:'user',content:'x'.repeat(300000)}]})).status,413);
    const malformed=await fetch(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);
    fail=true;const error=await post('/api/chat',body);assert.equal(error.status,502);assert.ok(!(await error.text()).includes('secret'));fail=false;
    const controller=new AbortController();const response=await fetch(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});assert.equal(response.status,200);
    const reader=response.body!.getReader();const first=await reader.read();assert.ok(new TextDecoder().decode(first.value).includes('first'));assert.equal(signal?.aborted,false);
    const aborted=new Promise<void>(r=>signal!.addEventListener('abort',()=>r(),{once:true}));controller.abort();
    await Promise.race([aborted,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Upstream did not abort')),1500))]);assert.equal(signal?.aborted,true);
    const refusal=await post('/api/images',{prompt:'test',size:'1024x1024'});assert.equal(refusal.status,403);assert.equal((await refusal.json()).error.code,'refusal');
    for(let i=0;i<42;i++)await fetch(url+'/api/health');const limited=await fetch(url+'/api/health');assert.equal(limited.status,429);
  }finally{config.chatKeys=old;config.imageKey=oldImage;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
