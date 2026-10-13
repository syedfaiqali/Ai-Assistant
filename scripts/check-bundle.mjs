import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { parseEnv } from 'node:util';
const backendEnv = parseEnv(await readFile('server/.env','utf8').catch(()=>''));
const secretNames = ['OPENROUTER_API_KEY','OPENROUTER_API_KEY_1','OPENROUTER_API_KEY_2','OPENROUTER_API_KEY_3','OPENAI_IMAGE_API_KEY'];
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json','utf8'));
const entry = manifest['index.html'];
let initial = 0;
const files = new Set();
function walk(chunk) { files.add(chunk.file); for(const css of chunk.css || [])files.add(css);for(const name of chunk.imports || [])walk(manifest[name]); }
walk(entry);
for(const file of files){const content=await readFile(`dist/${file}`);const size=gzipSync(content).length;initial+=size;console.log(`${file}: ${(size/1024).toFixed(1)} KiB gzip`);}
console.log(`Initial JS + CSS: ${(initial/1024).toFixed(1)} KiB gzip (budget 110 KiB)`);
if(initial>110*1024)throw new Error('Initial bundle exceeded budget');
for(const name of ['Markdown','Highlight','ImageStudio','Characters']){
 const chunk=Object.values(manifest).find(c=>c.name===name);
 if(!chunk || files.has(chunk.file))throw new Error(`${name} must be a lazy chunk`);
 console.log(`${name}: ${(gzipSync(await readFile(`dist/${chunk.file}`)).length/1024).toFixed(1)} KiB gzip, lazy`);
}
for(const file of await readdir('dist/assets')){
 if(!file.endsWith('.js'))continue;const source=await readFile(`dist/assets/${file}`,'utf8');
 for(const key of secretNames){
  for(const secret of [process.env[key],backendEnv[key]])if(secret && secret.length>8 && source.includes(secret))throw new Error('Provider secret found in frontend output');
 }
 if(/https:\/\/openrouter\.ai\/api\/v1|https:\/\/api\.openai\.com\/v1/.test(source))throw new Error('Direct provider URL found in frontend bundle');
}
