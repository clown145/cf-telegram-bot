# 工作流节点使用文档

本文面向 WebUI 使用者，说明工作流引擎的基本规则、数据引用方式、内置节点用途和常见组合。完整字段以 WebUI 节点配置弹窗为准。

## 核心模型

推荐把工作流拆成两层理解：

- 控制流：线决定执行顺序。普通节点默认有 `ctrl` 输入和 `next` 输出；分支节点会有 `true`、`false`、`case_1`、`error` 等控制输出。
- 数据流：节点输入用引用读取上游结果。推荐写 `{{ nodes.node_id.output }}`，例如 `{{ nodes.send_welcome.message_id }}`。
- 运行变量：`set_variable` 写入本次执行的 `runtime.variables`，后续用 `{{ variables.xxx }}` 读取。
- 触发上下文：触发器匹配 Telegram Update 后会注入 `__trigger__`，也可以用 `{{ __trigger__.type }}` 或 `{{ variables.__trigger__.raw_event.message.text }}`。
- 执行检查：WebUI 的检查/测试会返回 `workflow_analysis`。`SOURCE_AFTER_TARGET` 是硬错误，表示引用了后面才执行的节点；`SOURCE_NOT_GUARANTEED` 是警告，表示分支路径下该输出可能不存在。

编辑器仍支持把数据输出直接连到某个输入字段，但建议只在简单一对一赋值时使用。复杂流程优先使用引用和 `set_variable`，这样工作流更可读，也更容易检查依赖顺序。

## 连线规则

- 一条控制输出只应连接一个下游节点。比如同一个 `next` 同时连两个节点会被认为顺序不明确。
- 需要二选一时用 `branch`，需要多选一时用 `switch`，需要随机一路时用 `random`。
- 需要复用一段流程时用 `sub_workflow` 或 `run_workflow`，不要复制大量节点。
- 需要失败兜底时把高风险节点放在 `try_catch` 的 `try` 路径后，`catch` 路径接错误提示或补偿动作。
- 需要循环时用 `loop_counter` 或 `for_each`，并设置清晰的 `loop_key`，避免多个循环互相覆盖状态。

## 引用语法

常用运行时字段：

| 引用 | 含义 |
| --- | --- |
| `{{ runtime.chat_id }}` | 当前聊天 ID |
| `{{ runtime.user_id }}` | 当前用户 ID |
| `{{ runtime.message_id }}` | 当前消息 ID |
| `{{ runtime.thread_id }}` | 群组 topic/thread ID |
| `{{ runtime.username }}` | 用户名 |
| `{{ runtime.full_name }}` | 用户显示名 |
| `{{ runtime.callback_data }}` | 当前 callback data |
| `{{ variables.menu_id }}` | 当前菜单 ID |
| `{{ variables.button_id }}` | 当前按钮 ID |
| `{{ __trigger__.type }}` | 触发类型 |

引用节点输出：

```text
{{ nodes.node_id.output_name }}
{{ nodes.node_id.output_name.sub.path }}
{{ nodes.node_id.output_name[0].name }}
```

常用过滤器：

| 写法 | 说明 |
| --- | --- |
| `{{ value | default("无") }}` | 空值时给默认值 |
| `{{ value | tojson }}` | 转成 JSON 字符串 |
| `{{ value | urlencode }}` | URL 编码 |
| `{{ value | upper }}` / `{{ value | lower }}` | 大小写转换 |
| `{{ value | trim }}` | 去掉首尾空白 |
| `{{ items | size }}` / `{{ items | length }}` | 长度 |
| `{{ items | first }}` / `{{ items | last }}` | 第一个/最后一个 |
| `{{ items | join(",") }}` | 数组拼接 |

表达式支持 `&&`、`||`、`!`、`==`、`!=`、`>`、`>=`、`<`、`<=`、`+`、`-`、`*`、`/`、`%` 和三元表达式：

```text
{{ variables.score >= 60 ? "pass" : "fail" }}
{{ variables.role == "admin" || variables.role == "owner" }}
```

注意：普通模板会渲染成字符串。如果要保留对象或数组，优先使用配置面板里的引用/连线能力，或用 `json_parse` 在后续节点解析。

## 触发器节点

触发器负责决定哪个工作流入口会响应 Telegram Update。触发器通常放在工作流起点，后面接实际动作节点。

| 节点 | 用途 | 常用配置 |
| --- | --- | --- |
| `trigger_button` | 响应工作流按钮点击 | `button_id`、`menu_id`、`priority` |
| `trigger_command` | 响应 `/command` | `command`、`args_mode`、`priority` |
| `trigger_keyword` | 响应文本关键词 | `keywords`、`match_mode`、`case_sensitive` |
| `trigger_inline_query` | 响应 inline query | `query_pattern`、`match_mode` |
| `trigger_chat_member` | 成员加入/离开/状态变化 | `from_status`、`to_status`、`chat_type` |
| `trigger_my_chat_member` | Bot 自己被添加/移除/权限变化 | `from_status`、`to_status`、`chat_type` |
| `trigger_pre_checkout_query` | 支付确认事件 | `payload_pattern`、`currency` |
| `trigger_shipping_query` | 配送查询事件 | `payload_pattern`、`country_code` |
| `trigger_channel_post` | 频道新消息 | `chat_id`、`text_pattern` |
| `trigger_edited_channel_post` | 频道消息编辑 | `chat_id`、`text_pattern` |

所有触发器都会输出 `event`，原始事件也会进入 `__trigger__`。常用引用：

```text
{{ nodes.trigger.event.raw_event.message.text }}
{{ __trigger__.raw_event.callback_query.from.id }}
{{ variables.__trigger__.raw_event.pre_checkout_query.id }}
```

## 控制流节点

| 节点 | 用途 | 主要输出 |
| --- | --- | --- |
| `branch` | 根据表达式走 true/false | `true`、`false`、`condition_passed` |
| `switch` | 根据值匹配最多 4 个 case | `case_1` 到 `case_4`、`default` |
| `try_catch` | 捕获后续节点异常 | `try`、`catch` |
| `loop_counter` | 固定次数循环 | `loop`、`done`、`loop_index` |
| `for_each` | 遍历数组 | `loop`、`done`、`item`、`index` |
| `random` | 随机选择一个分支 | `choice_1` 到 `choice_4` |
| `delay` | 延迟执行或透传数据 | `passthrough_output` |
| `sub_workflow` | 调用子工作流 | `success`、`error`、`subworkflow_variables` |
| `run_workflow` | 执行另一个工作流 | `success`、`error`、`subworkflow_variables` |

当前 `parallel_stages` 只是检查报告里的可并行性提示，实际执行仍按控制线串行推进；真正的 `parallel` 节点还在 TODO 中。

`try_catch` 的错误信息会写入引擎变量：

```text
{{ variables.__engine__.last_error }}
{{ variables.__engine__.last_error_node_id }}
```

## 数据处理节点

| 节点 | 用途 | 典型输出 |
| --- | --- | --- |
| `provide_static_string` | 输出固定字符串 | `output` |
| `concat_strings` | 拼接多个字符串 | `result`、`text` |
| `string_ops` | split/join/replace/substring/contains/trim/case/length | `result`、`text`、`items`、`contains` |
| `json_parse` | JSON parse/stringify | `result`、`text`、`is_valid` |
| `set_variable` | 设置/更新运行变量 | `variable_name`、`value` |
| `math` | 数学运算和随机数 | `result`、`number`、`text` |
| `array_ops` | 数组长度、增删、过滤、查找、映射 | `result`、`items`、`item`、`found` |
| `date_time` | 日期格式化、加减、时差、时间戳 | `result`、`timestamp`、`iso` |
| `provide_placeholders` | 输出常用模板占位符 | `chat_id_placeholder` 等 |
| `provide_existing_ids` | 输出已存在的菜单/按钮/工作流 ID | `menus`、`buttons`、`workflows` |
| `llm_generate` | 调用已启用的 LLM 模型生成文本或 JSON | `text`、`json`、`usage`、`is_valid` |

推荐把“临时计算值”放在数据节点输出里，把“后面很多节点都要用的值”用 `set_variable` 命名保存。

`llm_generate` 使用 WebUI 的 `LLM 配置` 页管理模型。先创建 OpenAI-compatible 或 Gemini provider，填写 API 地址和 Key，点击获取模型，再启用需要暴露给工作流的模型并保存。获取模型只会临时显示候选项，后端只持久化已启用模型；节点参数里的 `LLM 模型` 下拉也只显示已启用模型。API Key 只存在后端 Durable Object 状态中，不会回传给 WebUI。测试/预览模式不会真实调用模型。

## 消息与媒体节点

| 节点 | 用途 | 说明 |
| --- | --- | --- |
| `send_message` | 发送文本、图片或语音 | 支持 reply keyboard、remove keyboard、force reply |
| `update_message` | 更新当前菜单消息 | 常用于按钮菜单模式 |
| `edit_message_text` | 编辑指定消息文本 | 需要 `chat_id` 和 `message_id` |
| `edit_message_media` | 编辑指定媒体消息 | 支持图片/语音和 caption |
| `delete_message` | 删除指定消息 | 需要 `chat_id` 和 `message_id` |
| `send_document` | 发送文件 | source 可为 `r2://`、Telegram `file_id` 或 URL |
| `send_video` | 发送视频 | 输出 `message_id` |
| `send_audio` | 发送音频 | 输出 `message_id` |
| `send_animation` | 发送 GIF/动画 | 输出 `message_id` |
| `send_media_group` | 发送媒体组 | 最多 10 个条目 |
| `forward_message` | 转发消息 | 保留原消息来源 |
| `copy_message` | 复制消息 | 不显示原来源 |
| `send_sticker` | 发送贴纸 | 支持 `file_id` 或 URL |
| `send_location` | 发送位置 | 经纬度必填 |
| `send_venue` | 发送地点 | 经纬度、标题、地址必填 |
| `send_contact` | 发送联系人 | 电话和姓名必填 |
| `send_poll` | 发送投票/quiz | 选项支持 JSON、逗号或换行 |
| `send_dice` | 发送骰子/动画表情 | 输出 `dice_value` |

多数发送类节点都有 `chat_id`，默认可用 `{{ runtime.chat_id }}`。如果要回复用户消息，填 `reply_to_message_id` 为 `{{ runtime.message_id }}`。

## Telegram 交互、管理与支付节点

| 节点 | 用途 |
| --- | --- |
| `await_user_input` | 暂停工作流，等待用户下一条输入后继续 |
| `show_notification` | 对 callback query 显示 toast/alert |
| `redirect_trigger_button` | 将当前按钮触发重定向到另一个按钮/菜单逻辑 |
| `get_chat` | 获取聊天信息 |
| `get_chat_member` | 获取用户在群内状态和权限 |
| `check_member_role` | 根据成员状态判断是否管理员/群主/成员 |
| `ban_chat_member` | 封禁用户 |
| `unban_chat_member` | 解封用户 |
| `restrict_chat_member` | 限制用户权限 |
| `promote_chat_member` | 提升或更新管理员权限 |
| `pin_chat_message` | 置顶消息 |
| `unpin_chat_message` | 取消置顶 |
| `send_invoice` | 发送 Telegram 支付请求 |
| `answer_pre_checkout_query` | 接受或拒绝支付确认 |
| `answer_shipping_query` | 接受或拒绝配送查询 |

管理类节点需要 Bot 在目标群/频道拥有对应权限。支付类节点需要正确配置 Telegram 支付 provider token。

## 集成与缓存节点

| 节点 | 用途 | 说明 |
| --- | --- | --- |
| `cache_from_url` | 下载远程文件到 R2 | 输出 `file_path`，通常形如 `r2://...` |

典型用法：

```text
cache_from_url -> send_document
send_document.document_source = {{ nodes.cache_file.file_path }}
```

R2 binding 必须叫 `FILE_BUCKET`。如果只是用 Telegram `file_id` 或外部 URL 发送媒体，可以不经过 `cache_from_url`。

## 常见组合

命令回复：

```text
trigger_command(command=start) -> send_message
send_message.text = 欢迎，{{ runtime.full_name | default("用户") }}
```

LLM 生成回复：

```text
trigger_command -> llm_generate -> send_message
llm_generate.user_prompt = 用户说：{{ __trigger__.raw_event.message.text }}
send_message.text = {{ nodes.ai_reply.text }}
```

按钮分支：

```text
trigger_button -> branch -> send_message
branch.expression = {{ variables.button_id == "admin_panel" }}
```

等待用户输入：

```text
trigger_button -> await_user_input -> branch -> send_message
branch.expression = {{ nodes.await_name.user_input_status == "success" }}
send_message.text = 你输入的是：{{ nodes.await_name.user_input }}
```

权限检查：

```text
trigger_command -> get_chat_member -> check_member_role
check_member_role.true -> send_message
check_member_role.false -> send_message
```

错误兜底：

```text
try_catch.try -> cache_from_url -> send_document
try_catch.catch -> send_message
send_message.text = 执行失败：{{ variables.__engine__.last_error }}
```

支付确认：

```text
send_invoice
trigger_pre_checkout_query -> answer_pre_checkout_query
answer_pre_checkout_query.pre_checkout_query_id = {{ __trigger__.raw_event.pre_checkout_query.id }}
```

## 高级执行参数

节点参数里可以加入以下控制字段，执行前会被引擎读取并移除，不会传给节点 handler：

| 字段 | 说明 |
| --- | --- |
| `__timeout_ms` / `timeout_ms` / `timeout` | 节点超时毫秒数，最大 5 分钟 |
| `__retry_count` / `retry_count` | 失败重试次数，最大 10 次 |
| `__retry_delay_ms` / `retry_delay_ms` | 每次重试前等待毫秒数 |
| `__retry_backoff` / `retry_backoff` | `fixed` 或 `exponential` |

这些参数适合网络类节点或偶发失败的 Telegram 调用。不要给会产生重复副作用的节点随意加重试，例如支付、封禁、重复发送消息。

## 建模建议

- 优先让控制线表达业务顺序，让引用表达数据依赖。
- 给关键节点起稳定 ID，例如 `trigger_start`、`send_welcome`、`fetch_file`，后续引用会更清楚。
- 分支后的节点引用分支内输出时，要考虑另一条路径该值为空的情况，用 `default` 或先汇总到变量。
- 长流程拆成子工作流，主流程只保留触发、分支和关键动作。
- 先用模拟执行/节点预览检查渲染后的参数，再接真实 Telegram 操作。
- 不要把 Bot Token 写进节点配置。Bot Token 放 Worker Secret 或 Bot 配置页保存；WebUI 不会回显已保存 Token。
