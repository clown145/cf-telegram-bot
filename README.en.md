# CF Telegram Bot

[中文](README.md) | English

A Telegram bot and WebUI deployed on Cloudflare Workers. The backend stores state in a Durable Object, the Vue WebUI is deployed as Worker Assets, and workflow nodes can handle Telegram updates, send messages/media, call sub-workflows, and cache files.

## Project Structure

- `cf/`: Cloudflare Worker backend. Entry point: `cf/src/index.ts`.
- `webui/`: Vue 3 admin UI. Build output goes to `webui_dist/`.
- `wrangler.toml`: Deployment configuration for the Worker, Assets, Durable Object, and R2 bindings.
- Durable Object `STATE_STORE`: Stores bot config, menus, buttons, workflows, pending user input, and execution logs.
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

5. Confirm the Worker bindings:

```text
Durable Object binding: STATE_STORE -> StateStore
R2 binding: FILE_BUCKET -> tg-button-cache
Assets binding: ASSETS -> webui_dist
```

If Cloudflare deploys from `wrangler.toml`, these bindings should be read from the config. If you configure them manually in the Dashboard, use the exact binding names above. Different names will make the Worker fail to find the bindings.

## Required Variables / Secrets

Use Cloudflare Secrets for sensitive values. Do not store them as plain variables.

```bash
wrangler secret put WEBUI_AUTH_TOKEN
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put OPENAI_API_KEY
```

- `WEBUI_AUTH_TOKEN`: Password for the WebUI. Configure this before sharing the WebUI. If it is empty, the backend allows all `/api/*` requests.
- `TELEGRAM_BOT_TOKEN`: Optional. You can also enter the token once in the WebUI Bot Config page. The WebUI never returns a saved token; leaving the token input empty will keep the existing token.
- `OPENAI_API_KEY`: Optional. Required only when using the `llm_generate` node. `LLM_API_KEY` is also supported.
- `OPENAI_BASE_URL`: Optional plain variable. OpenAI-compatible API base URL. Defaults to `https://api.openai.com/v1`.
- `OPENAI_DEFAULT_MODEL`: Optional plain variable. Used when the `llm_generate` node does not set a model.

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
