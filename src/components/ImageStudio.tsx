import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Download, Image, Square, Sparkles, WandSparkles } from 'lucide-react';
import { apiJSON, type ImageService } from '../services/chat';
import type { ImageRequest, ImageResponse } from '../../shared/types';
import { APP_NAME } from '../config';
class ProxyImageService implements ImageService {
  generate(request:ImageRequest,signal:AbortSignal) { return apiJSON<ImageResponse>('/api/images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal}); }
}
export default function ImageStudio() {
  const [config,setConfig] = useState<{configured:boolean;model:string|null;sizes:ImageRequest['size'][]}|null>(null);
  const [prompt,setPrompt] = useState(''); const [size,setSize] = useState<ImageRequest['size']>('1024x1024'); const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [url,setUrl] = useState('');
  const controller = useRef<AbortController|null>(null); const imageUrl = useRef('');
  useEffect(()=>{ const c = new AbortController(); apiJSON<typeof config>('/api/images/config',{signal:c.signal}).then(setConfig).catch(e=>{if(!c.signal.aborted)setError(e.message);}); return ()=>{c.abort();controller.current?.abort();if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);}; },[]);
  async function generate() {
    if (controller.current || !prompt.trim()) return;
    const c = new AbortController(); controller.current = c; setBusy(true);setError('');
    try { const result = await new ProxyImageService().generate({prompt:prompt.trim(),size},c.signal); c.signal.throwIfAborted();
      const bytes = Uint8Array.from(atob(result.base64),ch=>ch.charCodeAt(0)); const next = URL.createObjectURL(new Blob([bytes],{type:result.mimeType}));
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current); imageUrl.current = next; setUrl(next);
    } catch(e) { if(c.signal.aborted)setError('Image generation stopped.'); else setError(e instanceof Error ? e.message : 'Image generation failed.'); }
    finally {controller.current = null;setBusy(false);}
  }
  return <section className="image-studio"><div className="eyebrow"><Sparkles size={14}/> IMAGE STUDIO</div><h1>Picture the possibilities.</h1><p className="welcome-subtitle">Your imagination, with a little more room to play.</p>
    {!config && !error && <p className="status-note" role="status">Checking image provider…</p>}
    {config && !config.configured && <div className="setup-banner"><Image size={19}/><div><strong>Your studio is ready for setup</strong><p>Add OPENAI_IMAGE_API_KEY to server/.env and restart the API. Images are billed separately; free chat does not include free images.</p></div></div>}
    <div className="image-workspace"><div className="image-preview">{url ? <img src={url} alt={prompt}/> : <div><div className="image-placeholder-icon"><WandSparkles size={28}/></div><strong>{busy ? 'Creating your image…' : 'A canvas for your next idea'}</strong><p>{busy ? 'This can take a few minutes. You can stop anytime.' : 'Describe a scene, a mood, or something entirely new.'}</p></div>}</div>
      <form onSubmit={e=>{e.preventDefault();void generate();}}><label htmlFor="image-prompt">What do you have in mind?</label><textarea id="image-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={4000} placeholder="A quiet library on a rainy afternoon, warm light, watercolor illustration…" rows={4} disabled={busy}/><div className="image-options"><label>Canvas size<select value={size} disabled={busy || !config?.configured} onChange={e=>setSize(e.target.value as ImageRequest['size'])}>{(config?.sizes || ['1024x1024']).map(s=><option key={s} value={s}>{s === '1024x1024' ? 'Square · 1:1' : s === '1536x1024' ? 'Landscape · 3:2' : 'Portrait · 2:3'}</option>)}</select></label>{busy ? <button type="button" className="secondary" onClick={()=>controller.current?.abort()}><Square size={14}/>Stop</button> : <button type="submit" className="primary" disabled={!config?.configured || !prompt.trim()}><ArrowUp size={16}/>Generate</button>}</div></form>
    </div>{error && <p className="error-banner" role="alert">{error}</p>}{url && <a className="secondary download-image" href={url} download={`${APP_NAME.toLowerCase()}-creation.png`}><Download size={16}/>Download image</a>}<p className="privacy-caption">Prompts go only to the configured image provider. Images stay in this session; download to keep them.</p>
  </section>;
}
