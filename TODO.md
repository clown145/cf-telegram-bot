# TODO - TG Button 框架待办事项

> 最后更新：2026-02-06

## 🔥 高优先级

### Webhook 管理
- [x] 添加 `POST /api/bot/webhook/set` 接口，调用 Telegram `setWebhook` API
- [x] 前端 Bot 配置页添加「设置 Webhook」按钮
- [x] 添加 `GET /api/bot/webhook/info` 接口，调用 `getWebhookInfo` 检查状态
- [x] Webhook 设置参数支持（secret_token / allowed_updates / drop_pending_updates）
- [x] WebUI 展示 webhook 信息（pending_update_count / last_error）

### 扩展消息类型
- [x] `send_video` 节点 - 发送视频
- [x] `send_document` 节点 - 发送文件/文档
- [x] `send_media_group` 节点 - 发送多媒体组（图片/视频混合）
  - [x] 媒体组条目支持独立 `parse_mode` / `caption`
  - [x] 媒体组支持音频/文档类型
  - [x] 媒体组数量上限（10）在 WebUI 提示

---

## 🟡 中优先级

### 消息功能增强
- [x] `send_audio` 节点 - 发送音频文件
- [x] `send_animation` 节点 - 发送 GIF 动画
- [x] `forward_message` 节点 - 转发消息
- [x] `copy_message` 节点 - 复制消息到其他聊天
- [x] 发送消息时支持 `reply_to_message_id` 参数（回复指定消息）

### Update 类型处理
- [x] 处理 `inline_query` Update（Inline 查询请求）
- [x] 处理 `chat_member` Update（成员加入/离开事件）
- [x] 处理 `my_chat_member` Update（Bot 被添加/移除）

### 权限与用户管理
- [x] `get_chat_member` 节点 - 获取用户在群组的权限
- [x] 添加条件判断：是否管理员、是否群主等
- [x] `get_chat` 节点 - 获取聊天信息

### 键盘类型扩展
- [ ] 支持 ReplyKeyboardMarkup（普通回复键盘）
- [ ] 支持 ReplyKeyboardRemove（移除键盘）
- [ ] 支持 ForceReply（强制回复）

---

## ⚙️ 工作流引擎优化

### 控制流节点
- [x] `for_each` 节点 - 遍历数组，对每个元素执行分支
- [x] `switch` 节点 - 多条件分支（类似 switch/case）
- [x] `try_catch` 节点 - 错误捕获，失败时走 error 分支
- [x] `sub_workflow` 节点 - 调用其他工作流（复用逻辑）
- [ ] `parallel` 节点 - 并行执行多个分支
- [ ] `random` 节点 - 随机选择分支

### 工作流编辑体验
- [x] 节点默认值自动填入（inputs.default + 常用模板）
- [ ] 节点预设模板库（可保存/复用配置）
- [x] 修复按钮重定向节点：target_button_id 下拉选择（options_source: 'buttons'）

### 数据处理节点
- [ ] `math` 节点 - 数学运算：加减乘除、取模、随机数
- [x] `string_ops` 节点 - 字符串操作：split/join/replace/substring/contains
- [ ] `array_ops` 节点 - 数组操作：length/push/pop/filter/map/find
- [x] `set_variable` 节点 - 显式设置/更新变量
- [x] `json_parse` 节点 - JSON 解析/stringify
- [ ] `date_time` 节点 - 日期时间操作：格式化、计算时差

### 模板引擎增强
- [ ] 逻辑运算符：`&&`, `||`, `!`
- [ ] 数学运算：`+`, `-`, `*`, `/`, `%`
- [ ] 三元表达式：`{{ a ? b : c }}`
- [ ] 默认值过滤器：`{{ value | default("无") }}`
- [ ] 字符串过滤器：`| upper`, `| lower`, `| trim`, `| length`
- [ ] 数组过滤器：`| first`, `| last`, `| join(",")`, `| size`

### 引擎核心优化
- [ ] 支持嵌套工作流调用（子工作流）
- [x] 添加工作流执行超时控制
- [x] 添加节点执行重试机制
- [ ] 优化拓扑排序支持并行分支
- [ ] 添加工作流版本管理

---

## 🟢 低优先级

### 更多消息类型
- [ ] `send_sticker` 节点 - 发送贴纸
- [ ] `send_location` 节点 - 发送位置
- [ ] `send_venue` 节点 - 发送地点
- [ ] `send_contact` 节点 - 发送联系人
- [ ] `send_poll` 节点 - 发送投票
- [ ] `send_dice` 节点 - 发送骰子/动画表情

### 管理功能
- [ ] `ban_chat_member` 节点 - 封禁用户
- [ ] `unban_chat_member` 节点 - 解封用户
- [ ] `restrict_chat_member` 节点 - 限制用户权限
- [ ] `promote_chat_member` 节点 - 提升用户为管理员
- [ ] `pin_chat_message` 节点 - 置顶消息
- [ ] `unpin_chat_message` 节点 - 取消置顶

### 支付功能
- [ ] 处理 `pre_checkout_query` Update
- [ ] 处理 `shipping_query` Update
- [ ] `send_invoice` 节点 - 发送支付请求

### Bot 配置
- [ ] `getMe` - 获取 Bot 信息并展示在 WebUI
- [ ] `deleteWebhook` - 删除 Webhook
- [ ] `setMyDescription` - 设置 Bot 描述
- [ ] `setMyShortDescription` - 设置 Bot 短描述
- [ ] `setChatMenuButton` - 设置菜单按钮

### 频道支持
- [ ] 处理 `channel_post` Update
- [ ] 处理 `edited_channel_post` Update

---

## 🧪 代码质量与基础设施

### 测试
- [x] 添加单元测试（节点 handler 测试）
- [x] 添加集成测试（API 端点测试）
- [x] 添加 E2E 测试（模拟 Telegram Update）

### 文档
- [ ] 编写节点使用文档
- [ ] 添加 API 文档（OpenAPI/Swagger）
- [ ] 添加部署指南
- [ ] 添加开发者指南（如何编写自定义节点）

### 监控与日志
- [x] 添加结构化执行日志系统（Observability）
- [x] 工作流执行时记录每个节点的输入输出
- [x] 记录节点执行耗时
- [x] 添加执行历史存储（最近 N 次执行记录）
- [x] WebUI 添加「执行日志」页面查看历史
- [ ] 添加错误追踪（可选 Sentry / Logflare）
- [ ] 添加执行统计（次数、成功率、平均耗时）

### 调试功能
- [x] 添加调试模式开关（WebUI 执行日志配置）
- [x] 调试模式下保存执行上下文（可配置包含 runtime / inputs / outputs）
- [ ] 工作流失败时保存错误现场（节点 ID、输入、堆栈）
- [ ] WebUI 添加「工作流调试器」：单步执行/断点
- [x] 添加「模拟执行」：不实际发送消息，仅展示结果
- [x] 添加节点执行预览（输入渲染后的参数）
- [ ] 失败通知：可选发送错误到指定 Telegram 用户/群

### 安全
- [x] Rate Limiting（防滥用）
- [x] 验证 Telegram Update 来源（secret_token）
- [ ] 敏感信息加密存储

---

## ✅ 已完成

- [x] Webhook 接收与处理
- [x] Inline Keyboard 按钮菜单系统
- [x] 工作流可视化编辑器（Drawflow）
- [x] 16 个内置节点
- [x] 等待用户输入（await_user_input）
- [x] HTTP 请求节点
- [x] R2 文件缓存
- [x] Token 认证
- [x] 中英文国际化
- [x] 命令注册（setMyCommands）
- [x] 命令参数解析
- [x] Thread/Topic 支持
- [x] 保存 Bot 配置时自动 setWebhook
- [x] Webhook 状态查询（getWebhookInfo）
- [x] 工作流测试（编辑器右上角运行测试 + 返回详情）
- [x] 触发器模拟测试（workflow / command / keyword / button）
- [x] 发送视频（send_video）
- [x] 发送文件（send_document）

---

## 📝 备注

- 自定义节点可放在 `cf/src/actions/nodes_custom/` 目录
- 参考 `_template/` 目录创建新节点
- R2 Bucket 需要预先在 Cloudflare 创建：`tg-button-cache`
