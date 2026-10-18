# Fiqqu

A small, polished React + TypeScript assistant with a minimal Express API. Text conversations live on your device; API credentials live only on the server. Change the shared app name in `shared/branding.ts` (and the HTML title/description in `index.html`).

For free hosting with automatic deployment from `syedfaiqali/Ai-Assistant`, see [DEPLOYMENT.md](DEPLOYMENT.md). The included `render.yaml` builds and serves frontend + backend in one Render Free Web Service; after one-time setup, pushing to `main` starts deployment.

## Run locally

Use Node **22.12+** or Node 24. From this folder:

```powershell
npm.cmd install
Copy-Item server/.env.example server/.env
# Edit server/.env to configure live providers; leave keys empty to explore Demo.
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. The API binds to **127.0.0.1:3001**. `npm` also works in shells that permit npm's script shim; Windows PowerShell with restricted execution policy should use `npm.cmd`.

No credentials? Open **Settings → Demo mode**. Demo responses are canned, explicitly labeled, and never silently substituted for failed live requests. Image generation has no fake demo results.

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run check:bundle
npm.cmd start
```

`build` checks frontend TypeScript and builds frontend + backend. `start` serves the production frontend and API together at **http://127.0.0.1:3001**. Separate development scripts: `dev:web`, `dev:server`. Restart the backend after changing its environment.

## Providers and configuration

### Local Ollama chat

On Windows, `powershell.exe -ExecutionPolicy Bypass -File scripts/setup-ollama.ps1` installs Ollama if needed, downloads the smaller `dolphin-phi:latest` first, tests a local response, and switches the app to it. It then resumes/downloads `dolphin3:latest` and adds it to the model dropdown after verification. The first model remains the default and usable during the second download. Override the queue with `-Model MODEL -NextModel NEXT_MODEL`. Other environment entries are preserved. Status and logs are under `test-results/ollama-setup-status.json` and `test-results/ollama-setup.log`; `activeChatModel` indicates a model already configured for chat while another downloads. Failed pulls retry up to three times; rerun the command to resume after that. Keep the computer on and connected. The installer is verified against its pinned SHA256 before running. Only run one setup at a time.

Install [Ollama for Windows](https://ollama.com/download/windows), leave the Ollama app running, and download a model with `ollama pull dolphin3`. Local inference uses your computer; there is no per-request provider charge. Model download size and runtime memory are different; speed and memory use depend on hardware and conversation length.

Set these values in `server/.env`:

```dotenv
CHAT_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
DEFAULT_CHAT_MODEL=dolphin3:latest
CHAT_MODEL_ALLOWLIST=dolphin3:latest
```

Use exact installed IDs from `ollama list`, including tags such as `:latest`. Restart `npm.cmd run dev`, open http://127.0.0.1:5173, disable Demo in Settings, and select the local model. The existing chat history, character profiles, streaming, Retry and Stop work through the same backend routes. Only installed models in the allowlist are offered. Ollama must run separately from the FE/BE development command. If the API cannot reach it, the UI reports a connection error; it never falls back to a paid provider. Keep the API on localhost for local use.

To return to OpenRouter, set `CHAT_PROVIDER=openrouter` and restore your OpenRouter `DEFAULT_CHAT_MODEL` and `CHAT_MODEL_ALLOWLIST`. Existing OpenRouter keys can stay in `server/.env` but are not sent to Ollama. Image studio continues to use its separate image provider. For hosted deployments, localhost refers to the hosting machine, not your PC.

Local requests use compact application instructions and cap generated replies at 256 tokens to reduce CPU latency. Character fields and conversation history are preserved. Model loading, large profiles and long histories still affect time to first text; the small Dolphin Phi model has a limited context and may produce poor answers. This optimization does not guarantee answer quality or cloud-level speed.

### Configuration reference

Place the real environment file at **`server/.env`**, next to `server/index.ts`. It is ignored by Git. Do not use `VITE_` variables for secrets. Environment variables supplied by the host take precedence.

| Variable | Purpose |
| --- | --- |
| `CHAT_PROVIDER` | `openrouter` (default) or `ollama` |
| `OLLAMA_BASE_URL` | Local API base URL; defaults to `http://127.0.0.1:11434/v1` |
| `OPENROUTER_API_KEY` | Primary backend chat credential (also accepts `_1` when this is empty) |
| `OPENROUTER_API_KEY_2`, `OPENROUTER_API_KEY_3` | Optional ordered backup credentials |
| `DEFAULT_CHAT_MODEL` | Initial model; defaults to `openrouter/free`, or `dolphin3:latest` for Ollama |
| `CHAT_MODEL_ALLOWLIST` | Comma-separated exact model IDs permitted by the API |
| `OPENAI_IMAGE_API_KEY` | Optional, separate backend image credential |
| `IMAGE_MODEL` | `gpt-image-1-mini` (default), `gpt-image-1`, or `gpt-image-1.5` |
| `FRONTEND_ORIGIN` | Allowed development frontend origin; defaults to `http://127.0.0.1:5173` |
| `HOST`, `PORT` | Bind host/port; default `127.0.0.1:3001` |

The server intersects the allowlist with the current OpenRouter catalog, caches it for five minutes, and rechecks on generation. Catalog presence is not a guarantee of account access, quota, or provider uptime. Select another permitted model or change backend configuration if a model disappears. Free models are labeled from catalog pricing; free usage is subject to provider quotas and availability. Keys are never rotated to bypass quotas.

### Automatic chat-key fallback

Put up to three keys under **different variable names** in `server/.env`; repeated `OPENROUTER_API_KEY=` lines would otherwise overwrite each other. Requests start with the primary credential, then try the second and third once each when a credential is invalid, has insufficient credits or a key-specific spending limit, or when a connection/temporary provider failure happens before streaming starts. A working backup becomes the preferred key for subsequent requests until the API restarts. Duplicate key values are tried only once. Each connection attempt has a 30-second timeout within the existing 120-second overall chat deadline; Stop cancels requests and backoff waits.

Fallback never increases account-wide credits or free-model quotas. HTTP 429 rate limits, policy refusals, workspace/guardrail budgets and invalid requests stop without rotating keys; provider Retry-After is honored on eligible failures. Three keys belonging to the same exhausted account will all fail. A key-specific budget is distinguished by the provider's `openrouter_key_limit` metadata; general 403 refusals never trigger another key. See [OpenRouter errors and budget metadata](https://openrouter.ai/docs/api_reference/errors-and-debugging) and [account limits](https://openrouter.ai/docs/api_reference/limits).

Once a stream is returned, the server does not restart it on another key. A broken stream preserves partial output and lets you retry explicitly, avoiding mixed or duplicate replies and extra hidden requests. A response's `max_tokens` length limit is separate from credential credits; changing keys does not extend that response. Keys are kept out of API responses, logs and frontend bundles. No additional dependency or frontend code is needed for fallback.

Current official references used for implementation: [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming), [model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), and [OpenAI image generation](https://developers.openai.com/api/reference/resources/images/methods/generate). The default free router was checked against the live catalog during development. Provider API contracts may change; availability is verified at runtime.

Chat uses `POST /api/chat`; model choices use `GET /api/models`; setup state uses `GET /api/health`. Images use only `GET /api/images/config` and `POST /api/images`, backed by OpenAI Images. GPT image models return base64 PNGs; the UI converts them to session-only Blob URLs. Supported canvases are square 1024×1024, landscape 1536×1024, and portrait 1024×1536. Image requests use low quality to control cost. Account access or verification may be required. **Free chat does not imply free images.**

The backend prepends a server-owned identity instruction from `server/persona.ts` to every live chat request: the assistant introduces itself as **Fiqqu, Faiq's personal model**, instead of a provider's stock greeting. The shared name in `shared/branding.ts` also controls UI labels and exports. This custom assistant name does not imply ownership or training of the underlying model; specific questions about the provider/developer should still receive honest answers. Browser-supplied system messages remain disallowed, and existing saved messages are not rewritten. The legacy browser storage key is retained so renaming the app preserves existing chats.

The browser calls same-origin `/api` paths only; Vite proxies them during development. Provider requests use native backend `fetch`, fixed URLs, timeouts, and disconnect cancellation. SSE framing handles comments, multiline data, split CRLF, and UTF-8 bytes split between reads. The backend normalizes deltas and errors rather than relaying raw provider payloads. Provider billing cancellation support varies even when the proxy aborts its connection.

## Interaction and persistence

### Custom fictional characters

**Fiqqu remains the default.** Open **Characters** in the sidebar to create, edit, preview, select, or delete up to 50 custom adult personas. Profiles contain name, optional uploaded avatar, self-described gender/pronouns, adult age (18–120), personality, background, speaking style, English/Urdu/Roman Urdu preference, detailed description, optional opening greeting and example dialogue. Gender affects natural grammatical self-reference, not personality stereotypes. Cards, previews, chat headers and assistant replies clearly label custom characters as fictional AI personas.

Use **Start chat** to create an independent conversation. The profile is copied into a conversation snapshot, and an authored opening greeting appears exactly once as a local message. Sending, editing and retrying use that chat's snapshot and valid history, never the currently selected library character. Greeting-only messages are excluded from provider history; the backend tells the model that the greeting has already been displayed. Existing conversations retain their snapshots after a character edit or deletion. **Start new chat with updated character** creates a new conversation from the latest library version; if the character was deleted, the existing snapshot still works and that update action is disabled. The normal **New chat** button starts Fiqqu, regardless of library selection.

Character data is held in Redux and persisted alongside conversations under schema **version 2**. The legacy storage key is preserved and version 1 Fiqqu conversations migrate without losing their history. JSON export now includes the library and conversation snapshots; **Clear saved data** confirms deletion of both. Avatars accept local PNG/JPEG/WebP files up to 2 MB and are cropped/compressed to 128×128 JPEGs capped at 24,000 data-URL characters. No avatar is fetched from a remote URL or sent upstream to the chat provider. The existing 4-million-character local storage limit applies across characters and conversations; export if storage is full.

Express validates every profile before generation. Field limits are defined once in `shared/characters.ts`; descriptions allow 6,000 characters, combined text allows 12,000, and unknown fields, unsupported languages, minors and oversized avatars are rejected. Backend application instructions and a JSON-serialized, explicitly untrusted character profile share one system message, so templates with a single system slot receive both. The displayed opening greeting is excluded from the provider profile. Profile data cannot set models, upstream URLs, request options or credentials. Example dialogues remain persona examples rather than fabricated real conversation turns. Character prompts do **not** change model/provider policies or guarantee unrestricted responses; the frontend displays actual streamed responses and sanitized provider errors without fixed refusal text or keyword censorship. Live roleplay quality still depends on the selected model. Demo character replies remain explicitly simulated.

- New, search, switch, rename, and confirmed deletion of chats. Settings includes JSON export and confirmed deletion of saved chats.
- Editing a user message removes everything after it and generates a replacement. Retry replaces the last assistant reply without duplicating the user turn.
- One generation at a time prevents overlap; switching conversations does not send or replace content. Stop preserves partial text, and stale response updates are guarded by request IDs.
- Only complete matching demo/live turn pairs and the latest user message enter provider history. Failed or stopped turns are retained locally but excluded from future requests.
- Storage uses a versioned, validated text-only schema. Interrupted streams restore as stopped. Invalid or outdated schemas are ignored; unknown saved fields are discarded. Storage-full or blocked-storage warnings invite export. Export is the supported backup method in this phase.
- Limits: 150 conversations, 500 messages per conversation; chat requests accept up to 80 alternating messages, 12,000 characters per message and 60,000 total. Large histories produce a clear error rather than silent truncation.
- Assistant Markdown loads after completion. Highlighting loads only when a fenced code block appears and includes JavaScript, TypeScript, Python, JSON, shell, CSS, and HTML/XML. Other languages render as copyable plain code. Raw HTML is disabled; remote Markdown images are rendered as text to avoid unexpected third-party image requests.
- Desktop: Enter sends, Shift+Enter creates a newline. Mobile: Enter creates a newline; tap Send. Browser voice input inserts editable text and never sends automatically.

## Browser voice

Feature-detected browser SpeechRecognition (including webkitSpeechRecognition) provides English and Urdu input. It typically requires HTTPS or localhost and browser permission; availability depends on the browser/device. Recognition may use the browser vendor's network service. Text input always remains available. Speech synthesis supplies Read Aloud, Stop, and mute; available Urdu voices and quality vary by device. Playback stops before listening to prevent feedback. This is speech-to-text → text chat → browser text-to-speech, not native realtime audio. `TranscriptionService` and `SpeechService` are typed extension points; any future credential-based speech provider must run through Express.

## Small bundle by design

No UI framework, animation package, provider SDK, font download, or image asset dependency. Tailwind compiles to CSS. Lucide uses named imports for tree shaking. Markdown/GFM, a limited Highlight.js core, image studio, settings, characters, and demo responses are separate lazy chunks. Streaming updates are batched at animation-frame boundaries; storage writes are debounced. All state in Redux is serializable; controllers, speech objects and image bytes stay outside Redux. No animations are required; reduced-motion preferences disable transitions.

`check:bundle` reads the Vite manifest, checks the initial JS + CSS against a **110 KiB gzip** budget, verifies the three main features are lazy, and checks for direct provider URLs or configured secret values in emitted JS. Keep the lockfile committed for reproducible installation. Tests use Node's built-in runner and mock upstream streams; no test framework is shipped.

## Architecture and future persistence

`shared/` holds request, response, conversation, attachment, model, and stream types. `src/repository.ts` defines `ConversationRepository`; localStorage is the current implementation. UI dispatches Redux actions, with persistence managed centrally by the store. A future asynchronous server repository should use Redux listener middleware or thunks to hydrate/save through Express without putting database calls in components. Implement MongoDB models, authenticated ownership checks, per-user access and per-user quotas in the backend; replace the repository adapter, leaving the conversation components intact. Separate typed chat, image, speech, and transcription services allow provider changes without coupling UI to credentials. No database or fake authentication is implemented now.

**Before exposing this proxy publicly, add authentication and per-user quotas.** Current origin checks and the basic 40-requests/minute IP limiter are for personal development, not identity or billing protection. Keep localhost binding unless you are intentionally configuring a secured deployment. Do not deploy only the static frontend and expect providers to work; the Express API is required.

## Verification and limits

`npm test` includes 31 passing checks for split SSE framing/UTF-8, policy refusals, midstream failure, incomplete streams, upstream reader cancellation, disconnect-driven cancellation, request validation, malicious origins, rate limiting, secret-free errors, character validation, HTTP character requests, history isolation, immutable snapshots, greeting behavior, migration, persistence recovery, quota propagation, and provider-history filtering. Frontend/backend TypeScript checks and production builds passed. The character feature adds no dependencies: the initial JS + CSS is about **98.7 KiB gzip**, with the character workspace in a separate **4.0 KiB gzip** lazy chunk. Actual browser speech, real mobile keyboards and live image generation still need device/provider testing.

Optional browser QA: start the built app with `npm.cmd start` in another terminal, then run `npm.cmd run test:browser`. The dependency-free CDP script uses installed Chrome on Windows; set `BROWSER_PATH` for another Chromium executable and `TEST_URL` for another local server URL (e.g. `http://127.0.0.1:5173` for Vite). It exercises demo interactions, themes, keyboard dialogs/drawer focus, search, rename, confirmed deletion, character creation/editing/deletion/selection, avatar uploads, adult-age checks, opening greetings, old/new snapshots, separate histories, refresh persistence, and layouts at 1440/768/375/320px. Mocked provider transport also checks the exact snapshots and valid histories serialized by the browser for send and retry, without paid calls. Screenshots are saved under ignored `test-results/`. This full suite passed during implementation. Separate live backend calls to the configured Venice model verified three fictional characters in Roman Urdu, English and Urdu, plus a follow-up in the first character's chat after requests for the others. Live roleplay consistency remains dependent on the selected model.
