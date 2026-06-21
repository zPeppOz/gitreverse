# GitReverse

https://github.com/user-attachments/assets/f0cdb7b2-c6f0-4483-8a01-153170479f2e

Turn a **public GitHub repository** into a **single synthetic user prompt** that someone might paste into Cursor, Claude Code, Codex, etc. to vibe code the project from scratch.

The app pulls **repo metadata**, a **root file tree** (depth 1), and the **README**, then uses an LLM to produce one short, conversational prompt grounded in that context.

Paste a GitHub URL or `owner/repo` on the home page. You can also open **`/owner/repo`** (e.g. `/vercel/next.js`) for a shareable link that runs the same flow.

GitHub-style **`/owner/repo/tree/...`** URLs on this site **redirect to `/owner/repo`** so they do not 404. The reverse flow still uses the whole repo for now; **subfolder-aware** context (scoped to that path) is planned for a later change.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, GitHub API, Supabase (optional), Stripe (optional).

## Configuration

Copy `.env.example` to `.env.local` and fill in at least one LLM API key.

### Quick LLM (required)

The quick reverse endpoint supports four providers. Set **`GITREVERSE_QUICK_LLM`** to pin one, or leave it unset (`auto`) to let the app use whichever key it finds first:

| Provider | Key env var | Model env var | Default model |
|---|---|---|---|
| Grok (xAI) | `XAI_API_KEY` | `XAI_MODEL` | `grok-3` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `google/gemini-2.5-pro` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` | `AZURE_OPENAI_MODEL` | `gpt-5.4` |
| Google AI Studio | `GOOGLE_GENERATIVE_AI_API_KEY` | `GOOGLE_AI_STUDIO_MODEL` | `gemini-2.5-pro` |

In `auto` mode the order of preference is: Grok → OpenRouter → Azure → Google.

Azure quick reverse uses `gpt-5.4` by default with `AZURE_OPENAI_REASONING_EFFORT=medium`. Title generation also uses Azure and defaults to `gpt-5.4-mini` with reasoning disabled.

### Embeddings / library search

Prompt-cache embeddings and `/library` hybrid search now use Azure embeddings first:

- **`AZURE_OPENAI_EMBEDDING_MODEL`** — defaults to `text-embedding-3-small`
- **`AZURE_OPENAI_EMBEDDING_DIMENSIONS`** — defaults to `512`
- **`AZURE_OPENAI_EMBEDDING_DEPLOYMENT`** — optional explicit deployment name
- **`AZURE_OPENAI_DEPLOYMENT_NAME_MAP`** — optional `model=deployment` mapping when deployment names differ from model ids

If your Azure resource does not yet have an embedding deployment, you can temporarily set **`OPENAI_API_KEY`** as an embedding-only fallback while quick reverse and title generation stay on Azure.

### Other env vars

- **`GITHUB_TOKEN`** — optional; increases GitHub API rate limits.
- **`SUPABASE_URL`** + **`SUPABASE_PUBLISHABLE_KEY`** — optional; enables server-side caching of quick prompts in `prompt_cache` and exposes the `/library` page.
- **`VIEWS_IP_SALT`** — **required in production**. Generate one with `openssl rand -hex 32`. The app will refuse to start in production without a non-default value.

### GitHub Enterprise Server (optional)

By default the app talks to **github.com** (`https://api.github.com`). To use a self-hosted **GitHub Enterprise Server (GHE)** instance, set the host and the REST API base is derived automatically (`https://<host>/api/v3`):

- **`NEXT_PUBLIC_GITHUB_HOST`** — your GHE hostname, e.g. `ghe.example.com`. Using the `NEXT_PUBLIC_` prefix also lets pasted GHE repo URLs be recognized in the browser. `GITHUB_HOST` works as a server-only alternative.
- **`GITHUB_API_BASE_URL`** — optional explicit override if your API base differs from the derived `https://<host>/api/v3`.

#### Auth via GitHub App

Instead of a personal `GITHUB_TOKEN`, you can authenticate as a **GitHub App** (recommended for Enterprise). When all three values are set, the app signs a short-lived JWT with the App private key, exchanges it for an installation access token, caches it until it nears expiry, and uses it for every GitHub API call (works on both github.com and GHE):

- **`GITHUB_APP_ID`** — the App's numeric ID (or set `GITHUB_APP_CLIENT_ID`).
- **`GITHUB_APP_PRIVATE_KEY`** — the App's PEM private key. Literal `\n` escapes in a single-line value are supported.
- **`GITHUB_APP_INSTALLATION_ID`** — the installation to act as.

### Custom reverse (optional)

For **deep / focus** prompts, point the app at a backend service:

```
CUSTOM_REVERSE_SERVICE_URL=http://localhost:3001
```

## Routes

| Path | Description |
|---|---|
| `/` | Home — quick and custom reverse |
| `/library` | Browse cached quick prompts (requires Supabase) |
| `/history` | Your prompt history (profile menu when signed in; syncs to Supabase) |
| `/[owner]/[repo]` | Shareable quick-reverse link |
| `/[owner]/[repo]/deep` | Shareable deep-reverse link |
| `/[owner]/[repo]/[focus]` | Shareable manual-focus link |
| `/[owner]/[repo]/tree/...` | Redirects to `/[owner]/[repo]` |

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
pnpm build
pnpm start
pnpm lint
```