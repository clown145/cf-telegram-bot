# CF Telegram Bot

[中文](README.md) | English

A Telegram bot and WebUI deployed on Cloudflare Workers. The backend stores core state in a Durable Object, stores custom Skills documents in D1, serves the Vue WebUI as Worker Assets, and workflow nodes can handle Telegram updates, send messages/media, call sub-workflows, and cache files.

## Project Structure

- `cf/`: Cloudflare Worker backend. Entry point: `cf/src/index.ts`.
- `webui/`: Vue 3 admin UI. Build output goes to `webui_dist/`.
- `wrangler.toml`: Deployment configuration for the Worker, Assets, Durable Object, D1, and R2 bindings.
- Durable Object `STATE_STORE`: Stores bot config, menus, buttons, workflows, pending user input, and execution logs.
- D1 `SKILLS_DB`: Stores the virtual file tree for custom Markdown Skills. The Worker initializes tables automatically; if it is not bound, Skills temporarily fall back to Durable Object storage.
- R2 bucket `tg-button-cache`: Used by `cache_from_url` and media-send nodes. It caches remote files as `r2://...` paths so the bot can upload them to Telegram later. If you do not use file caching or local media upload nodes, R2 is rarely used, but nodes that reference `FILE_BUCKET` still require the binding.

## Documentation

- [Workflow node guide](docs/nodes.md): Engine rules, reference syntax, built-in node quick reference, and common patterns. This document is currently in Chinese.
- [LLM Agent architecture plan](docs/agent_architecture.md): LLM nodes, Agent tool calling, Workflow as Tool, and the Cloudflare deployment model. This document is currently in Chinese.
- [Node category convention](docs/node_category_convention.md): Category guidance for custom nodes.

## Recommended Deployment

1. Fork this repository to your own GitHub account.
2. In Cloudflare Dashboard, open `Workers & Pages`, connect your GitHub repository, and create a Worker deployment.
3. Make sure Cloudflare uses the root `wrangler.toml`.
4. Create an R2 bucket. The default expected name is:

```text
tg-button-cache
```

5. Create a D1 database. Recommended name:

```text
cf-telegram-bot-skills
```

6. Confirm the Worker bindings:

```text
Durable Object binding: STATE_STORE -> StateStore
D1 binding: SKILLS_DB -> cf-telegram-bot-skills
R2 binding: FILE_BUCKET -> tg-button-cache
Assets binding: ASSETS -> webui_dist
```

If Cloudflare deploys from `wrangler.toml`, these bindings should be read from the config. If you configure them manually in the Dashboard, use the exact binding names above. Different names will make the Worker fail to find the bindings.

After binding D1, opening the WebUI `Skills` page once initializes the schema automatically. You can also call:

```text
POST /api/actions/skills/init
```

If D1 is not bound, Skills fall back to Durable Object storage, but production deployments should bind `SKILLS_DB`.

## Required Variables / Secrets

Use Cloudflare Secrets for sensitive values. Do not store them as plain variables.

```bash
wrangler secret put WEBUI_AUTH_TOKEN
wrangler secret put TELEGRAM_BOT_TOKEN
```

- `WEBUI_AUTH_TOKEN`: Password for the WebUI. Configure this before sharing the WebUI. If it is empty, the backend allows all `/api/*` requests.
- `TELEGRAM_BOT_TOKEN`: Optional. You can also enter the token once in the WebUI Bot Config page. The WebUI never returns a saved token; leaving the token input empty will keep the existing token.

LLM configuration does not need Cloudflare variables. Open the WebUI `LLM Config` page and create providers:

- `OpenAI-compatible`: set name, API base URL, API key, then fetch models.
- `Gemini`: set name, API base URL, API key, then fetch models.

API keys are stored server-side in Durable Object state. The API only returns `has_api_key`; plaintext keys are never sent back to the WebUI. `OPENAI_API_KEY` / `LLM_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_DEFAULT_MODEL` still work as a legacy fallback for old workflows, but new setups should use the WebUI provider/model config.

For local development:

```bash
cp .dev.vars.example .dev.vars
```

## Webhook Setup

After deployment, open your Worker URL, for example:

```text
https://your-worker.your-subdomain.workers.dev
```

In the WebUI:

1. Log in with `WEBUI_AUTH_TOKEN`.
2. Open `Bot Config`.
3. If `TELEGRAM_BOT_TOKEN` is not configured as a Secret, enter the bot token once and save.
4. Set the webhook URL to:

```text
https://your-worker.your-subdomain.workers.dev/telegram/webhook
```

5. Click `Set Webhook`.

Saving Bot Config or setting the webhook also syncs Telegram bot commands. If the command list is empty, the Worker calls `deleteMyCommands` to remove old commands left on Telegram.

## CLI Deployment

If you do not use Cloudflare Git deployments, deploy with Wrangler:

```bash
npm --prefix webui install
npm --prefix cf install
wrangler deploy
```

`wrangler.toml` includes this build command:

```bash
cd webui && npm install && npm run build
```

The WebUI build output is written to `webui_dist/` and published as Worker Assets.

## Common Issues

- WebUI login fails: Check that `WEBUI_AUTH_TOKEN` is configured. The browser sends it as the `X-Auth-Token` request header.
- You cannot see the WebUI secret value in Cloudflare: This is normal for Secrets. Cloudflare shows the secret name, not the plaintext value.
- Media nodes fail with `FILE_BUCKET not configured`: The R2 binding name must be `FILE_BUCKET`.
- Workflows or menus disappear: Confirm the Durable Object binding is `STATE_STORE`, the class is `StateStore`, and migrations are applied.
- Telegram still shows old slash commands: Save the command list in Bot Config, or clear the list and click Register/Set Webhook again.
