# 更新日志

## 0.1.5-beta.1+20261103

### ✨ 新功能

- `maxTokens` 默认值调整为 `5120`
- 截断重试改为文案与汉语新解共用：只要 `finish_reason=length` / `stop_reason=max_tokens` 就重试，不再要求正文为空
- 新增 `truncateBehavior` 单选框：
  - `partial`（默认）：返回最后一次半截内容
  - `error`：直接报错

### 🐛 修复

- 汉语新解被截断时不再笼统提示「没有返回 SVG」，而是提示输出被截断

### 📚 文档

- 预览图移动到 `docs/images/preview/copywrite/` 并同步 README / 预览页引用

---

## 0.1.5-rc.4+20261102

### 🐛 修复

- 修复本地 dev（`esbuild-register`）下本地模块动态 `import()` 触发的 `ERR_MODULE_NOT_FOUND`
- ChatLuna 模型 Schema 注册与 `qq:rawmarkdown` 兜底改为静态导入

### 📚 文档

- README 预览图上方新增「你说得对，但是……」示范文案

---

## 0.1.5-rc.3+20261102

### 📚 文档

- 新增 `CHANGELOG.md`，补齐从 `0.1.0-beta.1` 到 `0.1.5-rc.2` 的版本记录
- README 顶部与「介绍」段末新增更新日志入口
- `package.json.files` 纳入 `CHANGELOG.md`

---

## 0.1.5-rc.2+20261102

### 📚 文档

- README 的 Koishi Forum 徽章与链接从占位符 `xxxxx` 更新为 topic `13787`

---

## 0.1.5-rc.1+20261102

### 📚 文档

- README 安装区拆分为「使用 Yarn」「使用 npm」两个代码块

---

## 0.1.5-beta.4+20261102

### 🐛 修复

- 清理 `lib/` 中已删除模块残留的 `.d.ts`，避免 npm 包携带旧声明文件

---

## 0.1.5-beta.3+20261102

### ✨ 新功能

- 新增 QQ 官方 Bot 按钮消息：`查看文案` / `再来一条`
- 新增 `enableQQButtons`、`qqButtonsJson` 配置：
  - 支持 `${commandName}`、`${randomType}` 变量
  - 空值 / 非法 JSON / 结构错误时不发送按钮，并在聊天和 console 提示
- 按钮消息使用 Markdown 标题 + 引用块 + 蓝字 GitHub 链接

### 🧱 重构

- 合并 `qq-internal` / `qq-buttons` / `qq-markdown` 为 `src/qq.ts`
- 合并 `openai-response` 到 `src/llm/openai.ts`
- 合并 `reasoning-format` 到 `src/utils/reasoning.ts`
- `commands/` 精简为 `index`、`copywrite`、`newmeaning`
- 新增 `src/utils/`：`command`、`help`、`reasoning`、`reply`

### 🐛 修复

- `rm` 的确认提示补齐 `enableQuote` 引用

---

## 0.1.4-rc.2+20261102

### 🐛 修复

- 修复裸指令先发纯文本、再发只有引用消息的问题（`session.execute` 默认会自行发送）
- `--help` 改为只显示 Koishi 原生语法与选项

### 📚 文档

- 预览页补充「求真学生」截图

---

## 0.1.4-rc.1+20261102

### 📦 发布

- 发布 `0.1.4-rc.1` 候选版本

---

## 0.1.4-beta.11+20261102

### ✨ 新功能

- 思考被截断时自动关闭思考 / 提高 `maxTokens` 重试

### 📚 文档

- 新增预览页，预览图改为中文命名，补充「你说得对」「恩情」

---

## 0.1.3-beta.10+20261102

### 🐛 修复

- 修复 `reasoningMaxChars` 默认值与 `step` 冲突导致的配置校验错误

---

## 0.1.3-beta.9+20261102

### ✨ 新功能

- 新增 `reasoningEffort` 思考等级
- 新增 `sendReasoning` 思考消息、`reasoningMaxChars` 截断
- 新增 QQ Markdown 引用块思考消息
- Anthropic 支持 `thinking` budget 映射

---

## 0.1.2-beta.8+20261102

### ✨ 新功能

- 支持 YAML 文件级 `__model__` 默认模型
- 新增接口诊断脚本 `scripts/test_api.py`，支持附加请求参数

### 🔧 改进

- 同步《真拿你没办法》文案格式
- `.gitattributes` 让 Markdown/YAML 计入语言统计
- 仓库迁移到 `VincentZyuApps` 组织

### 📚 文档

- 新增「你说的对」预览图，统一插件描述与 emoji

---

## 0.1.2-beta.7+20261102

### ✨ 新功能

- 支持引用触发消息、等待提示（完成后自动撤回）
- 修复帮助用法对齐

---

## 0.1.1-beta.6+20261101

### ✨ 新功能

- 指令改为「类型 + 题材」参数
- 帮助与文案列表合并

---

## 0.1.1-beta.5+20261101

### 🔧 改进

- 精简自定义通道表头并补充多行说明

---

## 0.1.1-beta.4+20261101

### 🔧 改进

- 收窄自定义通道表格
- 抽出全局调用参数 `RequestDefaults`

---

## 0.1.1-beta.3+20261101

### ✨ 新功能

- 配置分组重构
- 支持自定义指令名 / 别名

---

## 0.1.0-beta.2+20261101

### ✨ 新功能

- 新增别名「模仿文案」
- YAML 计入语言统计

### 📚 文档

- 切换为 Apache-2.0，补充 `NOTICE` 署名

---

## 0.1.0-beta.1+20261101

### ✨ 新功能

- 首个版本：移植 nonebot-plugin-copywrite
  - 内置文案模板、prompt 构造
  - `copywrite` 生成指令
  - 汉语新解 SVG 卡片
  - OpenAI / Anthropic / ChatLuna 接入
