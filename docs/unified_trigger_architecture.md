# 统一触发器架构设计

> 将所有触发逻辑统一到工作流编辑器中

---

## 📋 概述

### 目标
将按钮触发、命令触发、事件触发统一为「触发器节点」，全部在工作流编辑器中配置。

### 核心改变
- **现在**：按钮/命令 → 绑定 workflow_id → 执行工作流
- **新架构**：工作流入口是触发器节点 → 定义触发条件 → 后续节点

### 设计决策

| 问题 | 决策 |
|------|------|
| **过滤条件** | 使用 `branch` 条件节点处理，不在触发器内置 |
| **多工作流响应** | 全部执行，按 priority 排序 |
| **触发器冲突** | 全部触发（匹配到的都执行） |
| **子工作流上下文** | 通过 `__trigger__` 变量传递原始信息 |
| **动态启用/禁用** | 支持，通过 `enabled` 参数 |

---

## 🎯 触发器节点类型

### 通用配置（所有触发器共有）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `priority` | number | 100 | 优先级，数字越大越先执行 |
| `enabled` | boolean | true | 是否启用 |

### 通用输出（所有触发器共有）

| 输出 | 类型 | 说明 |
|------|------|------|
| `chat_id` | string | 聊天 ID |
| `user_id` | string | 用户 ID |
| `message_id` | number | 消息 ID |
| `chat_type` | string | private / group / supergroup / channel |
| `username` | string | 用户名（如果有） |
| `full_name` | string | 用户全名 |

---

### 1. trigger_command
监听指定命令。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `command` | string | 命令名（如 `help`，无需斜杠） |
| `args_mode` | select | `auto` / `text` / `kv` / `json` |

| 输出 | 类型 | 说明 |
|------|------|------|
| `args` | object | 解析后的参数 |
| `raw_args` | string | 原始参数文本 |

---

### 2. trigger_keyword
监听关键词消息。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `keywords` | string | 逗号分隔的关键词 |
| `match_mode` | select | `contains` / `equals` / `startsWith` / `regex` |
| `case_sensitive` | boolean | 是否区分大小写 |

| 输出 | 类型 | 说明 |
|------|------|------|
| `text` | string | 完整消息文本 |
| `matched_keyword` | string | 匹配到的关键词 |

---

### 3. trigger_button
监听指定按钮点击。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `button_id` | select/string | 要监听的按钮 ID |
| `menu_id` | select/string | 可选，限定菜单范围 |

| 输出 | 类型 | 说明 |
|------|------|------|
| `button_text` | string | 按钮文本 |
| `callback_data` | string | 回调数据 |

---

### 4. trigger_message
监听所有消息或特定类型消息。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `message_type` | select | `all` / `text` / `photo` / `video` / `document` / `voice` |
| `chat_type` | select | `all` / `private` / `group` / `supergroup` |

| 输出 | 类型 | 说明 |
|------|------|------|
| `text` | string | 文本内容（如果有） |
| `file_id` | string | 文件 ID（如果有） |
| `caption` | string | 媒体描述（如果有） |

---

### 5. trigger_new_member
监听新成员加入。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `include_bot` | boolean | 是否包含 Bot 自己被加入 |

| 输出 | 类型 | 说明 |
|------|------|------|
| `new_members` | array | 新成员列表 |
| `first_member` | object | 第一个新成员 |

---

### 6. trigger_schedule（定时触发）
使用 Cloudflare Cron Triggers 定时触发。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `schedule_id` | string | 配置的定时任务 ID |

| 输出 | 类型 | 说明 |
|------|------|------|
| `scheduled_time` | number | 计划执行时间戳 |
| `cron` | string | cron 表达式 |

**实现说明**：
```toml
# wrangler.toml 配置 cron
[triggers]
crons = ["0 * * * *"]  # 每小时执行
```

```typescript
// Worker 入口
export default {
  async scheduled(event, env, ctx) {
    const store = env.STATE_STORE.get(...);
    await store.handleScheduledEvent(event.scheduledTime);
  }
}
```

---

### 7. trigger_http（HTTP 触发）
外部 HTTP 请求触发工作流。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `trigger_id` | string | 唯一标识（用于 URL） |
| `method` | select | `GET` / `POST` / `ANY` |
| `auth_required` | boolean | 是否需要认证 |

| 输出 | 类型 | 说明 |
|------|------|------|
| `body` | object | 请求体（JSON） |
| `headers` | object | 请求头 |
| `query` | object | URL 查询参数 |

**API 端点**：
```
POST /api/trigger/http/:trigger_id
GET  /api/trigger/http/:trigger_id
```

**调用示例**：
```bash
curl -X POST https://your-worker.dev/api/trigger/http/my_trigger \
  -H "X-Auth-Token: xxx" \
  -d '{"foo": "bar"}'
```

---

## 🔗 触发上下文

所有工作流执行时注入 `__trigger__` 变量，子工作流可访问：

```typescript
runtime.variables.__trigger__ = {
  type: "command",           // 触发类型
  node_id: "n1",             // 触发器节点 ID
  workflow_id: "wf1",        // 触发的工作流 ID
  timestamp: 1234567890,     // 触发时间戳
  raw_event: { ... },        // 原始事件数据
};
```

**模板中使用**：
```
{{ __trigger__.type }}
{{ __trigger__.raw_event.message.text }}
```

---

## 📊 优先级与执行顺序

### 默认优先级

| 触发器类型 | 默认优先级 |
|-----------|-----------|
| trigger_command | 100 |
| trigger_button | 100 |
| trigger_keyword | 50 |
| trigger_message | 10 |

### 执行规则

1. 收到事件后，查找所有匹配的触发器
2. 按 priority 降序排序
3. **全部执行**（不互斥）
4. 执行失败不影响其他工作流

---

## 🏗️ 实现步骤

### Phase 1: 基础架构（3-5 天）

#### 1.1 触发器节点文件结构
```
cf/src/actions/nodes_builtin/
├── trigger_command/
├── trigger_keyword/
├── trigger_button/
├── trigger_message/
├── trigger_new_member/
├── trigger_schedule/
└── trigger_http/
```

#### 1.2 触发器索引
```typescript
interface TriggerEntry {
  workflow_id: string;
  node_id: string;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface TriggerIndex {
  byCommand: Map<string, TriggerEntry[]>;
  byButton: Map<string, TriggerEntry[]>;
  byKeyword: TriggerEntry[];
  byMessage: TriggerEntry[];
  byEvent: TriggerEntry[];
  bySchedule: Map<string, TriggerEntry[]>;
  byHttp: Map<string, TriggerEntry[]>;
}
```

---

### Phase 2: Webhook 处理改造（2-3 天）

```typescript
async handleTelegramMessage(message) {
  // 1. 检查等待输入（保持不变）
  
  // 2. 构建触发上下文
  const triggerContext = {
    chat_id: message.chat.id,
    user_id: message.from.id,
    // ...
  };
  
  // 3. 匹配并执行触发器
  const index = await this.getTriggerIndex();
  const matches: TriggerEntry[] = [];
  
  // 3.1 命令触发器
  if (message.text?.startsWith('/')) {
    const cmd = parseCommand(message.text);
    matches.push(...(index.byCommand.get(cmd.name) || []));
  }
  
  // 3.2 关键词触发器
  for (const trigger of index.byKeyword) {
    if (matchKeyword(message.text, trigger.config)) {
      matches.push(trigger);
    }
  }
  
  // 3.3 按优先级排序并执行
  matches.sort((a, b) => b.priority - a.priority);
  for (const trigger of matches) {
    if (!trigger.enabled) continue;
    await this.startWorkflow(trigger.workflow_id, triggerContext);
  }
}
```

---

### Phase 3: 前端适配（2-3 天）

- 节点面板添加「触发器」分类
- 触发器节点特殊样式（紫色、无输入端口）
- 按钮/命令选择器组件

---

### Phase 4: 简化旧页面（1-2 天）

- 按钮页面移除 workflow_id
- 命令页面移除 workflow_id（保留用于 setMyCommands）

---

## 📅 时间估算

| 阶段 | 内容 | 时间 |
|------|------|------|
| Phase 1 | 基础架构 + 触发器节点 | 3-5 天 |
| Phase 2 | Webhook 处理改造 | 2-3 天 |
| Phase 3 | 前端适配 | 2-3 天 |
| Phase 4 | 简化旧页面 | 1-2 天 |
| **总计** | | **8-13 天** |

---

## 💡 实现优先级

| 批次 | 触发器 | 复杂度 |
|------|--------|--------|
| **第一批** | trigger_command, trigger_keyword | 🟢 简单 |
| **第二批** | trigger_button, trigger_message | 🟡 中等 |
| **第三批** | trigger_new_member | 🟢 简单 |
| **第四批** | trigger_schedule, trigger_http | 🟡 中等 |

---

## 📝 下一步

1. [ ] 创建 trigger_command 节点
2. [ ] 修改 handleTelegramMessage 检查触发器
3. [ ] 前端添加触发器节点
4. [ ] 测试命令触发工作流
5. [ ] 继续实现其他触发器
