import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { configuredChatKeys } from './chat-keys.js';
// Source lives in server/, compiled file in server/dist/server/.
const sourceEnv = fileURLToPath(new URL('./.env', import.meta.url));
const compiledEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(sourceEnv)) process.loadEnvFile(sourceEnv);
else if (existsSync(compiledEnv)) process.loadEnvFile(compiledEnv);
const defaultModel = process.env.DEFAULT_CHAT_MODEL || 'openrouter/free';
const supportedImageModels = ['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5'];
const imageModel = process.env.IMAGE_MODEL || 'gpt-image-1-mini';
if (!supportedImageModels.includes(imageModel)) throw new Error('IMAGE_MODEL must be a supported GPT image model. See server/.env.example.');
export const config = {
  chatKeys: configuredChatKeys(process.env), imageKey: process.env.OPENAI_IMAGE_API_KEY || '',
  defaultModel, allowedModels: (process.env.CHAT_MODEL_ALLOWLIST || defaultModel).split(',').map(s => s.trim()).filter(Boolean), imageModel,
  origin: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173', host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3001),
};
