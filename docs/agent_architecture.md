# LLM Agent 架构与落地规划

本文定义在现有 Telegram Bot 工作流系统中接入 LLM 与 Agent 的目标架构、执行模型、安全边界和分阶段落地计划。核心结论是：保留现有确定性工作流引擎，同时新增受限 Agent 能力。Agent 可以把节点当作 tools 调用，也可以把工作流当作高级 tool 调用，但不能绕过权限、成本和审计边界。

## 目标

- 让 LLM 可以作为普通节点参与现有工作流，例如生成回复、分类意图、提取结构化数据。
- 让 Agent 可以动态选择并调用节点 tools，完成用户输入到结果输出的完整任务。
- 让 Agent 可以调用已有工作流，把稳定业务流程复用为高级 tool。
- 让 Agent 可以生成工作流草稿，但必须经过校验和人工确认后才能启用。
- 在 Cloudflare Workers 环境下实现可恢复、可审计、有限步数的 Agent Run，而不是依赖常驻内存进程。

## 非目标

- 不用 Agent 替代现有工作流引擎。支付、管理、菜单跳转等稳定业务仍应优先用显式工作流。
- 不允许 Agent 默认调用所有节点。所有 tool 必须经过 allowlist 和风险策略。
- 不允许 Agent 直接修改线上启用的工作流。它只能创建 draft 或提交变更建议。
- 不把 Bot Token、LLM API Key、支付 token 暴露给 WebUI 或 LLM 上下文。
- 第一阶段不强依赖 Cloudflare Agents SDK。当前项目已有 Durable Object，可以先用现有架构落地。

## 三层模型

### 1. 确定性工作流

现有工作流继续作为稳定执行层：

```text
trigger -> node -> branch/switch -> node -> send_message
```

特点：

- 控制线决定顺序。
- 数据通过 `{{ nodes.node_id.output }}` 或 `{{ variables.name }}` 引用。
- 执行结果可分析、可测试、可审计。
- 适合生产自动化、支付、权限、菜单、固定业务规则。

### 2. LLM 节点

LLM 节点是普通节点，只做一次模型调用或一次结构化转换：

```text
trigger_command -> llm_classify -> switch -> send_message
trigger_keyword -> llm_generate -> send_message
```

LLM 节点不直接接管全局调度。它输出 `text`、`json`、`label`、`confidence` 等结果，后续仍由工作流控制节点决定走向。

### 3. Agent 动态编排

Agent 是一个可恢复的动态执行器：

```text
用户输入 -> Agent Run -> LLM tool calling loop -> tools -> 最终结果
```

Agent 可以调用：

- 节点 tool：由现有节点定义自动转换。
- 工作流 tool：调用 `run_workflow` 或 `sub_workflow` 执行稳定流程。
- 内部 tool：例如 `analyze_workflow`、`save_workflow_draft`、`get_execution_log`。

Agent 本身也可以作为工作流节点：

```text
trigger_command -> llm_agent -> switch -> send_message
```

## 为什么 Worker 上可以做

Cloudflare Worker 不适合依赖内存里的无限循环，但适合事件驱动的可恢复任务：

- Worker 负责接收 Telegram webhook、WebUI API 和静态资源。
- Durable Object 负责持久化状态、串行化同一 bot/session 的操作、保存 Agent run trace。
- Cloudflare Workflows 适合长任务、多步重试、sleep、等待外部事件和长时间保留状态。
- Cloudflare Agents SDK 的 `runFiber` 可以作为后续可选方案，用于让 Agent 任务在 Durable Object eviction 后恢复。

第一版建议：

```text
短 Agent Run: Worker -> StateStore DO -> AgentRunner -> LLM/tools -> Telegram reply
长 Agent Run: Worker -> StateStore DO -> Cloudflare Workflow instance -> steps/tools -> Telegram reply
```

不要让 Telegram webhook 等待长时间模型推理。Webhook 处理应尽快落库和返回，后续由 DO 或 Workflow 继续执行并主动发送消息。

## 架构图

```text
Telegram / WebUI
      |
      v
Cloudflare Worker
      |
      v
StateStore Durable Object
      |
      +--> Deterministic Workflow Engine
      |       |
      |       +--> Node Handlers
      |
      +--> Agent Runner
              |
              +--> LLM Client
              +--> Tool Registry
              |       |
              |       +--> Node Tools
              |       +--> Workflow Tools
              |       +--> Internal Tools
              |
              +--> Agent Run Store / Trace
```

## Tool 抽象

现有节点已经天然接近 tool：

```ts
type NodeTool = {
  name: string;
  description: string;
  input_schema: JsonSchema;
  output_schema?: JsonSchema;
  risk_level: "read" | "write" | "send" | "admin" | "payment";
  side_effects: boolean;
  required_bindings?: string[];
  execute(input, context): Promise<ToolResult>;
};
```

转换来源：

- `ModularActionDefinition.id` -> tool name
- `description` / `i18n.description` -> tool description
- `inputs` -> JSON schema
- `outputs` -> output schema / usage hint
- `runtime.sideEffects` -> side_effects
- `runtime.requiredBindings` -> binding check
- 自定义 metadata -> risk_level、confirmation policy、cost policy

## Tool 分类与风险策略

默认风险等级：

| 风险等级 | 示例 | 默认策略 |
| --- | --- | --- |
| `read` | `get_chat`、`get_chat_member`、`provide_existing_ids` | 可被 Agent 使用，但仍需 allowlist |
| `write` | `set_variable`、`cache_from_url`、`save_workflow_draft` | 需 allowlist，记录审计 |
| `send` | `send_message`、`send_document`、`show_notification` | 默认不开放，需显式授权 |
| `admin` | `ban_chat_member`、`promote_chat_member`、`pin_chat_message` | 需要二次确认或管理员策略 |
| `payment` | `send_invoice`、`answer_pre_checkout_query` | 默认禁止，必须专门配置 |

Agent profile 必须包含 tool allowlist：

```json
{
  "id": "support_agent",
  "allowed_tools": ["get_chat", "get_chat_member", "llm_classify", "run_workflow:support_reply"],
  "max_tool_calls": 8,
  "max_tokens": 4000,
  "allow_side_effects": false
}
```

对于 `send`、`admin`、`payment` 类 tool，建议支持三种模式：

- `deny`: 永不允许。
- `preview`: 只返回计划，不真实执行。
- `confirm`: 先向管理员或用户确认，再执行。
- `allow`: 仅对受信任 agent 和受限参数启用。

## Agent Run 生命周期

一个 Agent Run 是一次可恢复任务：

```text
created -> running -> waiting_tool -> running -> completed
created -> running -> waiting_confirmation -> running -> completed
created -> running -> failed
created -> running -> cancelled
```

基本循环：

1. 创建 `agent_run`，保存 user message、runtime、agent profile、budget。
2. 构建 LLM prompt，包含系统指令、会话摘要、用户输入、允许的 tools。
3. 调用 LLM。
4. 如果 LLM 返回 tool call，先验证 tool 名称、schema、权限、预算。
5. 执行 tool，保存 `agent_step` 和 `tool_result`。
6. 将 tool result 追加到上下文，继续下一轮。
7. 达到最终回答、最大步数、预算限制或错误时结束。
8. 如果来源是 Telegram，发送最终消息或错误消息。

所有 step 必须先落库再继续下一步，避免 Durable Object eviction 或 Worker 中断导致不可恢复。

## 状态模型

建议在 Durable Object 存以下记录：

```ts
type LlmProviderConfig = {
  id: string;
  name: string;
  type: "openai" | "gemini";
  base_url: string;
  api_key: string;
  enabled: boolean;
};

type LlmModelConfig = {
  id: string;
  provider_id: string;
  model: string;
  name: string;
  enabled: boolean;
};

type AgentProfile = {
  id: string;
  name: string;
  system_prompt: string;
  provider_id: string;
  model?: string;
  allowed_tools: string[];
  risk_policy: Record<string, "deny" | "preview" | "confirm" | "allow">;
  max_tool_calls: number;
  max_tokens: number;
  max_runtime_ms: number;
  memory_mode: "none" | "summary" | "recent";
};

type AgentSession = {
  id: string;
  agent_id: string;
  chat_id?: string;
  user_id?: string;
  memory_summary?: string;
  last_run_id?: string;
  updated_at: number;
};

type AgentRun = {
  id: string;
  agent_id: string;
  session_id?: string;
  status: "created" | "running" | "waiting_confirmation" | "completed" | "failed" | "cancelled";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  error?: string;
  created_at: number;
  updated_at: number;
};

type AgentStep = {
  id: string;
  run_id: string;
  index: number;
  kind: "llm" | "tool" | "confirmation" | "system";
  tool_name?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  started_at: number;
  finished_at?: number;
};
```

密钥建议：

- LLM API Key 存 Durable Object 后端状态，和 Bot Token 一样 API 永不回显。
- `/api/llm/config` 只返回 `has_api_key` 和 provider/model 元数据，不返回明文 key。
- `OPENAI_API_KEY`、`LLM_API_KEY` 只作为旧工作流 fallback，不作为新配置主路径。
- Prompt 和日志里默认脱敏 key、token、Authorization、Cookie。

## 新增节点规划

### `llm_generate`

普通生成节点。

输入：

- `llm_model`
- `system_prompt`
- `user_prompt`
- `temperature`
- `max_tokens`
- `response_mode`: `text` / `json`
- `json_schema`
- `fail_on_error`

输出：

- `text`
- `json`
- `raw`
- `usage`
- `is_valid`
- `error`

用途：

```text
trigger_keyword -> llm_generate -> send_message
```

### `llm_classify`

分类节点。

输入：

- `text`
- `labels`
- `instructions`
- `provider_id`
- `model`

输出：

- `label`
- `confidence`
- `reason`
- `json`

用途：

```text
trigger_command -> llm_classify -> switch -> send_message
```

### `llm_agent`

受限 Agent 节点。

输入：

- `agent_id`
- `system_prompt_override`
- `user_input`
- `allowed_tools_override`
- `max_tool_calls`
- `response_mode`: `text` / `json`
- `side_effect_mode`: `deny` / `preview` / `confirm` / `allow`

输出：

- `text`
- `json`
- `tool_calls`
- `tool_results`
- `usage`
- `run_id`
- `status`
- `error`

用途：

```text
trigger_command -> llm_agent -> send_message
```

## Workflow as Tool

稳定流程可以包装成高级 tool：

```json
{
  "name": "workflow.support_reply",
  "description": "根据用户问题执行客服回复流程",
  "input_schema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"]
  },
  "workflow_id": "support_reply"
}
```

执行时：

```text
Agent tool call -> run_workflow(workflow_id, variables) -> existing workflow engine -> tool result
```

好处：

- Agent 复用已经测试过的稳定流程。
- 高风险操作仍然被固定工作流包住。
- 工作流日志和 Agent tool trace 可以关联。

## Agent 生成工作流

Agent 可以根据自然语言生成 workflow JSON，但流程必须是 draft：

```text
用户描述需求
-> Agent 生成 workflow draft
-> analyzeWorkflowExecutionPlan
-> WebUI 展示节点、连线、风险提示
-> 人工确认
-> 启用工作流
```

内部 tools：

- `list_node_definitions`
- `analyze_workflow`
- `save_workflow_draft`
- `update_workflow_draft`
- `publish_workflow_draft`

默认只允许保存 draft，不允许直接 publish。

## WebUI 规划

新增 `AI / Agent` 页面：

- LLM 配置：创建 provider、配置名称/API 地址/API Key、获取模型、启用模型。
- Provider 格式：先支持 OpenAI-compatible 和 Gemini。
- API Key 输入但不回显，模型节点只引用已启用的 model id。
- 节点分类从节点定义动态生成；新增自定义分类不需要同步改前端枚举。
- Skill Pack 从当前节点定义动态生成，默认按节点分类分包；后续可在节点定义里覆盖 pack 元数据。
- Agent Profile：系统提示词、允许 tools、风险策略、预算限制。
- Session 列表：按 chat/user 查看记忆摘要和最近 run。
- Run Trace：展示 LLM step、tool call、tool result、usage、错误。
- Workflow Draft Review：展示 Agent 生成的工作流草稿、分析结果、风险标签和启用按钮。

工作流编辑器新增：

- `llm_generate`、`llm_classify`、`llm_agent` 节点。
- 节点参数里支持选择 provider/model。
- 测试模式默认可以设置为 mock，不真实消耗 LLM。
- 运行日志里可选择隐藏 prompt、response、tool input/output。

## 安全边界

必须实现：

- Tool allowlist：Agent 只能调用 profile 里允许的 tool。
- Schema validation：LLM 输出的 tool arguments 必须按 schema 校验。
- Risk policy：`send`、`admin`、`payment` 默认禁止或确认。
- Budget limits：每个 run 限制 tokens、tool calls、运行时长。
- Prompt injection 防护：不要把 secret、完整系统配置、未授权 tool 描述放入上下文。
- 日志脱敏：默认隐藏 API key、Bot Token、Authorization、Cookie。
- 幂等控制：发送消息、支付、封禁等副作用 tool 要记录 tool_call_id，避免重试重复执行。
- 权限隔离：WebUI 测试用户不能看到 provider key，不能默认启用危险 tools。

## 成本控制

建议限制项：

| 限制 | 默认值建议 |
| --- | --- |
| `max_tool_calls` | 5 到 10 |
| `max_runtime_ms` | 20 到 60 秒 |
| `max_input_tokens` | 4k 到 16k，按模型调整 |
| `max_output_tokens` | 512 到 2k |
| 每用户每日 run 数 | 可配置 |
| 每 agent 每日预算 | 可配置 |

对于 Telegram Bot，最容易失控的是用户频繁触发 Agent。需要把 rate limiting 扩展到 Agent Run 层。

## 短任务与长任务划分

短任务留在 Durable Object：

- 单次分类。
- 一次生成回复。
- 少量 read-only tool 调用。
- 运行时间可控、无需等待用户确认。

长任务交给 Cloudflare Workflows：

- 需要等待确认、等待外部事件或长时间 sleep。
- 多轮 tool call 且步骤多。
- 需要可靠重试。
- 需要跨分钟/小时/天保持状态。

Cloudflare Workflows 的关键能力是每个 step 可以持久化状态，支持 sleep/retry/waitForEvent，并且等待时不消耗 CPU。Free 计划可用，但有每日请求、CPU、并发、存储和保留时间限制；重度 Agent 使用应按 Paid 计划设计。

## 实现模块建议

后端新增：

```text
cf/src/agents/
  agentRunner.ts
  llmClient.ts
  toolRegistry.ts
  toolSchemas.ts
  riskPolicy.ts
  promptBuilder.ts
  runStore.ts
```

节点新增：

```text
cf/src/actions/nodes_builtin/llm_generate/
cf/src/actions/nodes_builtin/llm_classify/
cf/src/actions/nodes_builtin/llm_agent/
```

WebUI 新增：

```text
webui/src/views/AgentsView.vue
webui/src/components/agents/
webui/src/services/agents.ts
```

API 新增：

```text
GET    /api/agents/providers
POST   /api/agents/providers
GET    /api/agents/profiles
POST   /api/agents/profiles
GET    /api/agents/runs
GET    /api/agents/runs/:id
POST   /api/agents/runs
POST   /api/agents/runs/:id/cancel
POST   /api/agents/confirmations/:id/approve
POST   /api/agents/confirmations/:id/reject
```

## 分阶段计划

### Phase 0: 文档与边界

产出：

- 本文档。
- TODO 拆分。
- 明确不默认开放危险 tools。

### Phase 1: LLM 基础节点

目标：

- 支持 `llm_generate`。
- 支持 OpenAI-compatible 和 Gemini provider。
- 支持 WebUI 创建 provider、获取模型、启用模型。
- preview 模式不真实调用模型，只返回渲染后的 prompt 摘要。
- 日志记录 usage 和脱敏后的 prompt。

验收：

- 工作流可以 `trigger_command -> llm_generate -> send_message`。
- WebUI 不回显 API key。
- 测试模式可运行且不消耗额度。

### Phase 2: Tool Registry

目标：

- 把内置节点定义转换为 tool definitions。
- 实现风险等级、allowlist、schema validation。
- 支持执行 read-only tools。

验收：

- `get_chat`、`get_chat_member` 等 read tool 可被 AgentRunner 调用。
- 未授权 tool 调用被拒绝并写入 trace。

### Phase 3: `llm_agent` 短任务

目标：

- 新增 `llm_agent` 节点。
- Agent Run 状态落 DO。
- 每一步 LLM/tool call 写 trace。
- 限制 `max_tool_calls`、`max_runtime_ms`、`max_tokens`。

验收：

- Agent 可基于用户输入调用 allowlist tools 并返回最终文本。
- DO 重启或中断后可根据已保存 step 判断 run 状态。

### Phase 4: Workflow as Tool

目标：

- 允许 Agent 调用指定工作流。
- 工作流输出转换成 tool result。
- Agent trace 关联 workflow execution trace。

验收：

- Agent 可以调用 `workflow.support_reply` 这类高级 tool。
- 高风险操作通过固定工作流包裹，而不是直接暴露原子危险节点。

### Phase 5: Workflow Draft 生成

目标：

- Agent 可以读取节点定义并生成 workflow draft。
- 后端自动调用 `analyzeWorkflowExecutionPlan`。
- WebUI 展示草稿、风险和分析报告。

验收：

- Agent 生成的工作流默认不启用。
- 用户确认后才能发布。

### Phase 6: Cloudflare Workflows 长任务

目标：

- 对长 Agent Run 使用 Cloudflare Workflows。
- 支持 confirmation、sleep、retry、waitForEvent。
- 支持长任务状态查询和取消。

验收：

- Agent 可暂停等待确认，再继续执行。
- Worker/DO eviction 不影响长任务最终完成。

## 推荐先做的最小版本

最小可用闭环：

```text
llm_generate 节点
-> OpenAI-compatible / Gemini LLM client
-> DO provider/model 配置
-> preview/mock 模式
-> 日志脱敏和 usage
```

第二步：

```text
toolRegistry
-> llm_agent 节点
-> read-only tools allowlist
-> Agent Run trace
```

不要第一版就做 Workflow Draft 生成、Cloudflare Workflows 长任务和危险 tool 执行。这些会引入太多安全和审计复杂度。

## 参考

- Cloudflare Workflows pricing: https://developers.cloudflare.com/workflows/reference/pricing/
- Cloudflare Workflows limits: https://developers.cloudflare.com/workflows/reference/limits/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Agents durable execution: https://developers.cloudflare.com/agents/api-reference/durable-execution/
