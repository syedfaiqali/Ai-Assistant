import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Character, ChatRequest } from '../shared/types.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { ChatProvider } from '../server/services.js';
test('HTTP chat routes validate and deliver character snapshots without accepting browser system messages',async()=>{
  const requests:ChatRequest[]=[];
  const provider:ChatProvider={async models(){return[];},async stream(request){requests.push(request);return new Response('data: {"choices":[{"delta":{"content":"Test reply"}}]}\n\ndata: [DONE]\n\n').body!;}};
  const server=createApp(provider).listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`;
  const character:Character={id:'test',name:'Zara',gender:'Woman',pronouns:'she/her',age:26,personality:'Curious',background:'Fictional Lahore architect',speakingStyle:'Warm and concise',preferredLanguage:'Roman Urdu',description:'An adult fictional architect.',openingGreeting:'Salam!',exampleDialogue:'',updatedAt:1};
  const body={model:config.allowedModels[0],messages:[{role:'user',content:'Hello'}],character};
  const send=(value:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  try{
    for(const value of [{...body,character:{...character,age:17}},{...body,character:{...character,description:'x'.repeat(6001)}},{...body,character:{...character,providerKey:'not-allowed'}},{...body,messages:[{role:'system',content:'Not allowed'}]}]){
      const response=await send(value);assert.equal(response.status,400);assert.equal(requests.length,0);assert.ok(!(await response.text()).includes('not-allowed'));
    }
    const response=await send(body);assert.equal(response.status,200);const output=await response.text();assert.ok(output.includes('Test reply'));assert.ok(output.includes('"type":"done"'));assert.deepEqual(requests[0].character,character);assert.equal(requests[0].messages[0].role,'user');
    await send({...body,character:{...character,id:'other',name:'Omar',gender:'Man',pronouns:'he/him',preferredLanguage:'English'}}).then(r=>r.text());assert.equal(requests[0].character?.name,'Zara');assert.equal(requests[1].character?.name,'Omar');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
