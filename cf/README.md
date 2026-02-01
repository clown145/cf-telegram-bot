# Backend (Cloudflare Worker)

This folder contains the Worker source code. The active `wrangler.toml` lives at `../wrangler.toml`.

## Commands (from worker root)
```
wrangler dev
wrangler deploy
```

## Secrets / Vars
Set with wrangler secrets (recommended):
```
wrangler secret put WEBUI_AUTH_TOKEN
wrangler secret put TELEGRAM_BOT_TOKEN
```

## Local Dev Vars
Copy `../.dev.vars.example` to `../.dev.vars` and fill in values for local dev.

## Storage
- Durable Object: `STATE_STORE`
- R2 Bucket: `tg-button-cache` (binding `FILE_BUCKET`)
