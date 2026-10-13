import type { ApiError } from '../shared/types.js';
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
  toJSON(): ApiError { return {code:this.code, message:this.message}; }
}
export function providerError(status: number) {
  const errors: Record<number, [string,string]> = {
    400:['invalid_request','The provider could not accept this request. Check your model or shorten the conversation.'],
    401:['provider_auth','The provider rejected the backend credential. Check server configuration.'],
    402:['quota','Provider credits are exhausted. Check your provider account.'],
    403:['refusal','The provider refused this request under its access or content policy.'],
    404:['model_unavailable','This model is unavailable. Choose another model.'],
    429:['rate_limit','Provider rate limit reached. Please wait before trying again.'],
    503:['provider_unavailable','No provider is currently available for this model. Try again later.'],
  };
  const [code, message] = errors[status] || ['provider_error','The provider failed to complete this request. Try again later.'];
  return new HttpError(status >= 400 && status < 600 ? status : 502, code, message);
}
export function safeError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return new HttpError(504,'timeout','The request timed out or was interrupted. Partial text has been preserved.');
  return new HttpError(502,'connection','Could not connect to the provider. Check your connection and server configuration.');
}
