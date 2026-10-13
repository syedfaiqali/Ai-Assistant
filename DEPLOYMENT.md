# GitHub → Render automatic deployment

Repository: https://github.com/syedfaiqali/Ai-Assistant

The root `render.yaml` deploys the built React UI and Express API together as one **Free Web Service**, on one HTTPS URL. Vite is only a development server; Render uses `npm start`, and Express serves `dist/` with same-origin `/api` endpoints. No extra frontend service, CORS migration, or database is needed. Node 24 and `HOST=0.0.0.0` are set; Render supplies `PORT`.

## Put the project on GitHub

Create/connect the empty GitHub repository above, then run from PowerShell:

```powershell
cd "C:\Projects\AI Chatbot"
git init -b main
git remote add origin https://github.com/syedfaiqali/Ai-Assistant.git
git add .
git status --short
git commit -m "Build Fiqqu assistant with custom characters and deployment config"
git push -u origin main
```

Skip `git init` and `git remote add` if the local repository is already connected. If GitHub already has commits, fetch and reconcile them first; do not force-push over existing work. Git may prompt you to sign in to GitHub. `.gitignore` excludes all actual `.env` files, dependencies, build output, npm caches and browser test profiles; only placeholder `.env.example` files belong in Git. Check that `server/.env` is absent from `git status` before committing. Keys must never be put in `render.yaml`, source files or commit messages.

## One-time Render setup

1. Sign in at https://dashboard.render.com and connect your GitHub account.
2. Choose **New → Blueprint**, select **syedfaiqali/Ai-Assistant**, and use **main** with the root **render.yaml**.
3. Confirm the service uses the **Free** compute plan and deploy it. The UI can be tried in Demo without provider credentials.
4. The deployment returns an HTTPS `onrender.com` URL. Use the literal URL from your dashboard; the service name alone does not guarantee a particular subdomain.
5. In **Environment**, set backend keys only when the hosted proxy has the access protection appropriate for its audience:
   - `OPENROUTER_API_KEY`, optionally `_2` and `_3` for your existing fallback.
   - `OPENAI_IMAGE_API_KEY` for optional image generation.
   - Optionally `FRONTEND_ORIGIN` to the exact deployed HTTPS URL; same-origin requests already work by default.
   - Model choices are set in `render.yaml`; edit those values there if managing settings through the Blueprint.
6. Save environment changes and redeploy. Never upload `server/.env` to GitHub.

Alternatively, choose **New → Web Service → Git Provider**, connect this repo and branch, set build command `npm ci --include=dev && npm test && npm run build && npm run check:bundle`, start command `npm start`, Free plan, Node 24, and `HOST=0.0.0.0`. Select **Auto-Deploy → On Commit**. Blueprint setup fills these settings automatically.

## Later updates

```powershell
git add .
git commit -m "Describe your changes"
git push
```

After the one-time GitHub/Render connection, a successful push to **main** automatically starts Render's install, tests, TypeScript/build, bundle checks, and deployment. You do not need to run a production frontend or backend terminal yourself. Failed builds do not publish the new version. Environment values are configured separately in Render and are not uploaded by pushing code.

## Free hosting and data limits

Render's free web service sleeps after 15 idle minutes; the next visit can take roughly a minute to wake it. Free instance hours, bandwidth and pipeline minutes have limits, and free services are intended for hobby/testing workloads, not production guarantees. Provider calls are separate: the selected Venice model is paid, and OpenAI image generation has its own charges. **Free hosting does not make AI usage free.**

Conversations and characters remain in each browser's localStorage; they do not automatically sync across devices. Your localhost browser data will not automatically move to a different deployed origin. Export your existing chats/characters before changing sites if you need a backup; there is no import feature in this phase.

The current proxy has basic IP rate limiting but **no user authentication or per-user billing quotas**. Before sharing a public URL that has paid provider credentials, add those protections. A private GitHub repository protects source access, not the public website or API. Until then, keep hosted provider keys unset and use Demo for public previews.

Official references: [Render Free](https://render.com/docs/free), [Blueprint fields](https://render.com/docs/blueprint-spec), [automatic deploys](https://render.com/docs/deploys), and [Web Services/port binding](https://render.com/docs/web-services).
