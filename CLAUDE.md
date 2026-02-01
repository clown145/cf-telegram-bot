# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个部署在 Cloudflare Workers 上的 Telegram Bot 按钮框架，提供可视化工作流编辑器，用户通过拖拽节点创建 Bot 交互逻辑。

## 常用命令

### 本地开发
```bash
# 后端开发（从 worker 根目录）
wrangler dev

# 前端开发
cd webui && npm install && npm run dev

# 部署
wrangler deploy
```

### 环境变量设置
```bash
wrangler secret put WEBUI_AUTH_TOKEN
wrangler secret put TELEGRAM_BOT_TOKEN
```

本地开发时，将 `.dev.vars.example` 复制为 `.dev.vars` 并填入值。

## 架构概览

### 后端架构 (cf/src/)

**核心组件：**

1. **StateStore** (`state-store.ts`) - Durable Object，管理所有状态
   - 按钮和菜单配置
   - 工作流定义
   - Bot 配置（token、webhook、命令）
   - 等待用户输入状态
   - 执行记录

2. **工作流引擎** (`engine/executor.ts`) - 执行工作流节点
   - 拓扑排序确定执行顺序
   - 模板引擎渲染变量（`{{ variable }}` 语法）
   - 支持控制流节点（branch、loop、switch、try_catch、for_each、sub_workflow）
   - 支持等待用户输入（await_user_input）

3. **模块化节点系统** (`actions/`)
   - `nodes_builtin/` - 23 个内置节点
   - `nodes_custom/` - 自定义节点目录
   - `handlers.ts` - 动作处理器注册表
   - `modularActions.ts` - 节点定义和元数据

**关键路由：**
- `/api/*` - API 端点，转发到 StateStore
- `/telegram/*` - Telegram API 代理，转发到 StateStore
- 静态资源通过 ASSETS binding 提供

### 前端架构 (webui/src/)

**技术栈：** Vue 3 + TypeScript + Pinia + Vue Router + Naive UI + Drawflow

**主要视图：**
- `LoginView.vue` - 登录页（X-Auth-Token 认证）
- `ButtonsView.vue` - 按钮管理页
- `WorkflowView.vue` - 工作流可视化编辑器
- `BotView.vue` - Bot 配置页

**关键服务：**
- `services/api.ts` - API 封装（带 401 自动跳转登录）
- `services/auth.ts` - 认证服务
- `stores/app.ts` - Pinia 状态管理

**Composables：**
- `useGlobalBridge.ts` - 全局 UI 桥接（模态框、通知）
- `workflow/useDragDrop.ts` - 拖拽功能
- `workflow/useDrawflow.ts` - Drawflow 编辑器
- `workflow/useNodePalette.ts` - 节点面板
- `workflow/useNodeUtils.ts` - 节点工具
- `workflow/useWorkflowManager.ts` - 工作流管理
- `workflow/useZoom.ts` - 缩放功能

## 内置节点列表 (cf/src/actions/nodes_builtin/)

| 节点 ID | 功能 |
|---------|------|
| `branch`, `loop_counter`, `for_each`, `switch`, `try_catch`, `sub_workflow` | 控制流 |
| `send_message`, `send_video`, `send_document`, `send_media_group` | 发送消息 |
| `edit_message_text`, `edit_message_media`, `delete_message` | 编辑/删除消息 |
| `await_user_input`, `delay`, `show_notification`, `update_message` | 交互控制 |
| `cache_from_url`, `provide_static_string`, `concat_strings`, `provide_placeholders`, `provide_existing_ids`, `redirect_trigger_button` | 数据处理 |

## 模板引擎

在节点配置中使用双大括号语法引用变量：
- `{{ chat_id }}` - 聊天 ID
- `{{ user_id }}` - 用户 ID
- `{{ variables.my_var }}` - 自定义变量
- `{{ message_id }}` - 消息 ID

**支持的过滤器：**
- `| tojson` - JSON 序列化
- `| urlencode` - URL 编码
- `| zip` - 压缩

**支持的比较运算符：**
- `==`, `!=`, `>`, `<`, `>=`, `<=`

## 存储资源

- **Durable Object**: `STATE_STORE` - 状态持久化
- **R2 Bucket**: `tg-button-cache` (binding `FILE_BUCKET`) - 文件缓存

## Telegram 回调前缀

回调数据前缀（`cf/src/telegram/constants.ts`）：
- `tgbtn:cmd:` - 命令
- `tgbtn:menu:` - 菜单
- `tgbtn:back:` - 返回
- `tgbtn:act:` - 动作
- `tgbtn:wf:` - 工作流
- `tgbtn:redirect:` - 重定向

## 待办事项与架构方向

参考 `TODO.md` 了解计划中的功能。重要方向：

1. **统一触发器架构** (`docs/unified_trigger_architecture.md`) - 计划将按钮、命令、事件触发统一为触发器节点
2. 更多消息类型节点（音频、动画、贴纸等）
3. 数据处理节点（数学运算、字符串操作）
4. 监控与日志系统（当前完全缺失）

## 添加自定义节点

1. 在 `cf/src/actions/nodes_custom/` 创建新目录
2. 参考 `_template/` 目录结构
3. 每个节点目录包含：
   - `definition.ts` - 节点定义（输入、输出、配置项）
   - `handler.ts` - 节点处理器（执行逻辑）
4. 在 `modularActions.ts` 中注册节点定义
5. 在 `handlers.ts` 中添加处理器（使用懒加载机制避免循环依赖）

## 懒加载机制

`handlers.ts` 使用懒加载机制来避免循环依赖问题。节点处理器按需动态导入。