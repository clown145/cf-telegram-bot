# CF Telegram Bot

中文 | [English](README.en.md)

一个部署在 Cloudflare Workers 上的 Telegram Bot + WebUI。后端使用 Durable Object 存核心状态，D1 存自定义 Skills 文档，WebUI 作为 Worker Assets 一起部署，工作流节点可以发送消息、处理 Telegram Update、调用子工作流和缓存媒体文件。

## 组件说明

- `cf/`: Cloudflare Worker 后端，入口是 `cf/src/index.ts`。
- `webui/`: Vue 3 管理界面，构建产物输出到 `webui_dist/`。
- `wrangler.toml`: Cloudflare 部署配置，包含 Worker、Assets、Durable Object、Workflows、D1、R2 绑定。
- Durable Object `STATE_STORE`: 存 Bot 配置、菜单、按钮、工作流、等待输入状态、执行日志等核心数据。
- Cloudflare Workflow `TELEGRAM_UPDATE_WORKFLOW`: 耐久处理 Telegram webhook 后台任务，避免长 LLM/工具调用只依赖 `waitUntil`。
- D1 `SKILLS_DB`: 存自定义 Markdown Skills 的虚拟文件树。Worker 会自动建表；未绑定时会临时 fallback 到 Durable Object。
- R2 Bucket `tg-button-cache`: 给 `cache_from_url` 和媒体发送节点用，主要用于把远程文件缓存成 `r2://...` 路径，再交给 Telegram 上传。若不使用文件缓存/本地媒体上传，R2 用得少；但相关节点依赖 `FILE_BUCKET` 绑定。

## 文档

- [工作流节点使用文档](docs/nodes.md): 引擎规则、引用语法、内置节点速查和常见组合。
- [LLM Agent 架构与落地规划](docs/agent_architecture.md): LLM 节点、Agent tool 调用、Workflow as Tool 和 Cloudflare 落地方案。
- [节点分类约定](docs/node_category_convention.md): 自定义节点分类建议。

## 推荐部署流程

1. Fork 这个仓库到自己的 GitHub。
2. 在 Cloudflare Dashboard 里进入 `Workers & Pages`，连接你的 GitHub 仓库并创建 Worker 部署。
3. 确认部署使用仓库根目录的 `wrangler.toml`。
4. 创建 R2 Bucket，名字建议保持默认：

```text
tg-button-cache
```

5. 创建 D1 database，名字建议：

```text
cf-telegram-bot-skills
```

6. 确认 Worker 绑定包含：

```text
Durable Object binding: STATE_STORE -> StateStore
Workflow binding: TELEGRAM_UPDATE_WORKFLOW -> TelegramUpdateWorkflow
D1 binding: SKILLS_DB -> cf-telegram-bot-skills
R2 binding: FILE_BUCKET -> tg-button-cache
Assets binding: ASSETS -> webui_dist
```

如果 Cloudflare 是按 `wrangler.toml` 部署，以上绑定通常会从配置读取；如果你在 Dashboard 手动配置，就按上面的名字填，名字不一致代码会找不到绑定。

D1 绑定完成后，访问一次 WebUI 的 `Skills` 页会自动初始化表结构。也可以手动请求：

```text
POST /api/actions/skills/init
```

如果 D1 未绑定，Skills 会 fallback 到 Durable Object，但推荐生产环境绑定 `SKILLS_DB`。

Cloudflare Workflows 已包含在 Workers Free 和 Paid 计划中，免费计划下与 Workers 请求共享每天 100,000 次请求额度，并包含 1GB Workflow state。仓库默认开启 `TELEGRAM_UPDATE_WORKFLOW` 绑定；如果部署环境没有该绑定，代码会回退到原来的 `waitUntil` 后台处理。

## 必要环境变量 / Secrets

建议用 Cloudflare Secret，不要放普通明文变量。

```bash
wrangler secret put WEBUI_AUTH_TOKEN
wrangler secret put TELEGRAM_BOT_TOKEN
```

- `WEBUI_AUTH_TOKEN`: WebUI 登录密钥。必须配置；如果为空，后端会放行所有 `/api/*` 请求。
- `TELEGRAM_BOT_TOKEN`: 可选。也可以在 WebUI 的 Bot 配置页输入 Token。WebUI 不会回显已保存的 Token，留空保存不会覆盖旧 Token。

LLM 不需要在 Cloudflare 变量里配置。进入 WebUI 的 `LLM 配置` 页创建 provider，支持：

- `OpenAI-compatible`: 配置名称、API Base URL、API Key，然后点击获取模型。
- `Gemini`: 配置名称、API Base URL、API Key，然后点击获取模型。

API Key 会存到 Durable Object 后端状态中，接口只返回 `has_api_key`，不会把明文 key 传给 WebUI。`OPENAI_API_KEY` / `LLM_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_DEFAULT_MODEL` 仍作为旧工作流兼容 fallback，不推荐新配置继续使用。

本地开发可以复制：

```bash
cp .dev.vars.example .dev.vars
```

## Webhook 设置

部署成功后打开 Worker 域名，例如：

```text
https://your-worker.your-subdomain.workers.dev
```

进入 WebUI 后：

1. 用 `WEBUI_AUTH_TOKEN` 登录。
2. 打开 `Bot 配置`。
3. 如果没有配置 `TELEGRAM_BOT_TOKEN` Secret，就在 Bot Token 输入框填一次 Token 并保存。
4. Webhook 地址填：

```text
https://your-worker.your-subdomain.workers.dev/telegram/webhook
```

5. 点击 `设置 Webhook`。

保存配置或设置 Webhook 时，会同步覆盖 Telegram 远端命令；如果命令列表为空，会清空 Telegram 上残留的 Bot 命令。

## CLI 部署方式

如果不用 Dashboard Git 部署，也可以本地部署：

```bash
npm --prefix webui install
npm --prefix cf install
wrangler deploy
```

`wrangler.toml` 里配置了构建命令：

```bash
cd webui && npm install && npm run build
```

WebUI 构建输出会写到 `webui_dist/`，再作为 Worker Assets 发布。

## 常见问题

- WebUI 登录不了：检查 `WEBUI_AUTH_TOKEN` Secret 是否配置，浏览器输入的值会作为 `X-Auth-Token` 请求头发送。
- Cloudflare 变量列表看不到 WebUI 密钥：Secret 默认不显示明文，能看到名字但看不到值是正常的。
- 发送 R2 文件报 `FILE_BUCKET not configured`: R2 binding 名字必须是 `FILE_BUCKET`。
- 工作流、菜单丢失：确认 Durable Object binding 是 `STATE_STORE`，class 是 `StateStore`，并且 migrations 已应用。
- Telegram 还显示旧命令：到 WebUI 的 Bot 配置页保存一次指令列表，或清空列表后点击注册/设置 Webhook。
