import express from 'express';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { config } from './config.js';
import { HttpError, safeError } from './errors.js';
import { validateChat, validateImage, imageSizes } from './validation.js';
import { OpenRouterProvider, OpenAIImageProvider, relayStream, type ChatProvider, type ImageProvider } from './services.js';
import { OllamaProvider } from './ollama.js';
export function createApp(chat: ChatProvider = config.chatProvider === 'ollama' ? new OllamaProvider() : new OpenRouterProvider(), image: ImageProvider = new OpenAIImageProvider()) {
  const app = express(); app.disable('x-powered-by');
  app.use('/api', (req,res,next) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    if (req.headers.origin && req.headers.origin !== config.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return res.status(403).json({error:{code:'origin',message:'This origin is not allowed.'}});
    if (req.headers.origin === config.origin) { res.setHeader('Access-Control-Allow-Origin',config.origin); res.setHeader('Vary','Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods','GET, POST'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.sendStatus(204); return; }
    next();
  });
  app.use(express.json({limit:'256kb'}));
  const buckets = new Map<string,{start:number; count:number}>();
  app.use('/api',(req,res,next) => {
    const now = Date.now();
    for (const [key,value] of buckets) if (now - value.start >= 60000) buckets.delete(key);
    const key = req.ip || 'local'; const bucket = buckets.get(key) || {start:now,count:0};
    bucket.count++; buckets.set(key,bucket);
    if (bucket.count > 40 || buckets.size > 10000) { res.setHeader('Retry-After','60'); return res.status(429).json({error:{code:'rate_limit',message:'Too many requests. Please wait a minute.'}}); }
    next();
  });
  const health = () => ({chatConfigured:config.chatProvider === 'ollama' || config.chatKeys.length > 0, chatProvider:config.chatProvider, imageConfigured:Boolean(config.imageKey), imageModel:config.imageKey ? config.imageModel : null});
  app.get('/api/health',(_req,res) => res.json(health()));
  app.get('/api/models', async (_req,res,next) => { try { res.json({models:await chat.models(AbortSignal.timeout(15000)),defaultModel:config.defaultModel}); } catch(e) { next(e); } });
  app.get('/api/images/config',(_req,res) => res.json({configured:Boolean(config.imageKey),model:config.imageKey ? config.imageModel : null,sizes:imageSizes}));
  app.post('/api/chat',async (req,res,next) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(new DOMException('Request timed out','TimeoutError')),120000);
    const close = () => { if (!res.writableEnded) controller.abort(); }; res.on('close',close);
    try {
      const request = validateChat(req.body,config.allowedModels);
      const stream = await chat.stream(request,controller.signal);
      res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}); res.flushHeaders();
      await relayStream(stream,controller.signal,async event => {
        controller.signal.throwIfAborted();
        if (!res.write(`data: ${JSON.stringify(event)}\n\n`)) await once(res,'drain',{signal:controller.signal});
      });
      res.end();
    } catch(e) {
      if (res.destroyed) return;
      if (res.headersSent) { res.end(`data: ${JSON.stringify({type:'error',error:safeError(e).toJSON()})}\n\n`); }
      else next(e);
    } finally { clearTimeout(timer); res.off('close',close); controller.abort(); }
  });
  app.post('/api/images',async (req,res,next) => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out','TimeoutError')),180000);
    const close = () => { if (!res.writableEnded) controller.abort(); }; res.on('close',close);
    try { res.json(await image.generate(validateImage(req.body),controller.signal)); } catch(e) { if (!res.destroyed) next(e); }
    finally { clearTimeout(timeout); res.off('close',close); controller.abort(); }
  });
  app.use('/api',(_req,res) => res.status(404).json({error:{code:'not_found',message:'API endpoint not found.'}}));
  app.use(express.static(resolve('dist')));
  app.use((error: unknown,_req:express.Request,res:express.Response,_next:express.NextFunction) => {
    const bodyError = error as {type?:string};
    const clean = bodyError.type === 'entity.too.large' ? new HttpError(413,'payload_limit','Request is too large.') : bodyError.type === 'entity.parse.failed' ? new HttpError(400,'validation','Request body must be valid JSON.') : safeError(error);
    res.status(clean.status).json({error:clean.toJSON()});
  });
  return app;
}
