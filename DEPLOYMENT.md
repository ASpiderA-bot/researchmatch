# ResearchMatch v2 — deployment & collaboration

Everything two people need to run, deploy, and work on this repo together.

---

## How it is deployed

The app is full-stack, so it ships as two halves:

```text
Browser
  └─ GitHub Pages  ─ static React build (this repo, Actions workflow)
        └─ fetch(VITE_API_BASE + /api/...)
              └─ Render free web service  ─ Express API (same repo, render.yaml)
                    └─ Groq / Gemini LLM + DuckDuckGo search
```

- **Frontend** → GitHub Pages: `https://asidera-bot.github.io/researchmatch/`
- **Backend** → Render: `https://researchmatch-api.onrender.com` (name set at service creation)
- **Local dev** needs neither: `npm run dev` serves UI + API together on `http://localhost:3000`.

`.env` (API keys) is gitignored and only ever lives on your machine and in Render's dashboard.

---

## Frontend: GitHub Pages

Workflow: `.github/workflows/deploy-pages.yml`

What one run does:

1. checkout → `npm ci` → `npm run lint` (typecheck, catches errors on both `src/` and `server/`)
2. `npx vite build --base=/researchmatch/` so assets resolve under the project URL
   (the workflow reads the repo name at run time, so a rename needs no workflow edit)
3. build-time `VITE_API_BASE` is injected from the repo variable of the same name
4. uploads `dist/` as a Pages artifact and deploys it

Triggers: **push to `main`**, or manually via **Actions → Deploy frontend to GitHub Pages → Run workflow**.

One-time setup (already done by whoever deploys first):

| Setting | Where | Value |
|---|---|---|
| Pages source | Repo → Settings → Pages → Source | **GitHub Actions** |
| `VITE_API_BASE` repo variable | Settings → Secrets and variables → Actions → Variables | `https://researchmatch-api.onrender.com` (no trailing slash) |

Shell equivalent:

```bash
gh variable set VITE_API_BASE --body "https://researchmatch-api.onrender.com"
```

If that variable is empty the built app calls `/api/...` on its own origin, which 404s on Pages —
so set it **before** the first deploy matters. Re-running a build without it is harmless locally.

## Backend: Render

`render.yaml` is a Render blueprint: **Dashboard → New → Blueprint → pick this repo**. Render then
builds and auto-deploys on every push to `main`.

Environment variables (blueprint sets the non-secret ones; add secrets in the Render dashboard):

| Var | Value | Notes |
|---|---|---|
| `GROQ_API_KEY` | *(secret)* | set in dashboard; `LLM_PROVIDER=groq` by default |
| `GEMINI_API_KEY` | *(secret)* | only needed for PDF resume parsing and Gemini mode |
| `LLM_PROVIDER` | `groq` | from blueprint |
| `CORS_ORIGIN` | `https://asidera-bot.github.io` | origin **only**, never a path; comma-separate multiple |
| `APP_URL` | the Pages URL | from blueprint |

Notes:

- Free-tier services sleep after idle; the first request after idle takes ~30–50 s (cold start).
  `GET /api/health` is the health check and returns `{"status":"ok","version":"2.0.0"}`.
- `CORS_ORIGIN` is an allowlist enforced in `server/middleware/cors.ts`. Local default is
  `http://localhost:3000,http://localhost:5173`. Misconfigured values are normalized to
  `scheme://host[:port]` in `server/utils/config.ts` because browsers never send a path in `Origin`.

---

## Local development

```bash
npm install
cp .env.example .env        # then paste your GROQ_API_KEY
npm run dev                 # UI + API on http://localhost:3000
npm run lint                # tsc --noEmit — run before every push
npm run build               # vite build + esbuild server bundle → dist/
```

First boot can take ~20 s while Vite re-optimizes deps. **Paste resume text, don't upload a PDF**
until the Gemini key is verified (PDF parsing always routes through Gemini).

---

## Working together

- **`main` is what deploys.** Ship through short-lived feature branches and a PR; both of us review
  before merge. Keep commits small and use the existing message style: `feat:`, `fix:`, `docs:`,
  `release:`.
- **Secrets never enter git.** `.env` is ignored — double-check with `git status` before staging.
  API keys go in Render's dashboard and each other's `.env`, nowhere else.
- **`local-only/` is gitignored** for private notes, drafts, and anything not meant for the repo.
  **`shared/`** holds docs and types you both need — it is pushed.
- **`STUDIO_HOUR.md` is a local session sheet** and is intentionally untracked; don't commit it.
- `orbit-wip` is a local-only branch from an abandoned dashboard pivot; leave it alone until we
  decide to split it out or drop it.

## Current work queue

The pipeline works end to end; the remaining problem is **LLM rate limits** — ~27 model calls per
search with no cache, retry, or batching, so 429s silently eat results.

| # | Task | Size |
|---|---|---|
| 1 | Verify Gemini key + `gemini-2.0-flash-lite` model name | 10 min |
| 2 | Disk cache for search / scrape / LLM calls (`server/services/cache.ts`) | 45 min |
| 3 | Exponential backoff on 429 (max 4 attempts) | 30 min |
| 4 | Auto fallback Gemini ↔ Groq on final rate limit | 25 min |
| 5 | Shrink per-run budget (`MAX_RESULTS` 24→10, `MAX_SEARCH_URLS` 8→6) — **done** | 10 min |
| 6 | Batch verification, 5 candidates per LLM call | 60 min |

Order of payoff: 2 → 3 → 4 → 5 → 6. Task 1 first because it decides whether the Gemini path works
at all.
