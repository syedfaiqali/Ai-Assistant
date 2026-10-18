import { createApp } from './app.js';
import { config } from './config.js';
import { APP_NAME } from '../shared/branding.js';
const server = createApp().listen(config.port, config.host, () => console.log(`${APP_NAME} API: http://${config.host}:${config.port} · chat ${config.chatProvider === 'ollama' ? 'local Ollama' : config.chatKeys.length ? 'OpenRouter configured' : 'needs setup'} · images ${config.imageKey ? 'configured' : 'needs setup'}`));
process.on('SIGINT', () => server.close()); process.on('SIGTERM', () => server.close());
