> 💡 推荐前往 [GitHub](https://github.com/VincentZyuApps/koishi-plugin-copywrite) 或 [Gitee](https://gitee.com/vincent-zyu/koishi-plugin-copywrite) 阅读 README，体验更好。

> **[📖 查看完整更新日志 →](./CHANGELOG.md)**

![koishi-plugin-copywrite](https://socialify.git.ci/VincentZyuApps/koishi-plugin-copywrite/image?description=1&font=Bitter&forks=1&issues=1&language=1&logo=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Ff%2Ff3%2FKoishi.js_Logo.png&name=1&owner=1&pattern=Plus&pulls=1&stargazers=1&theme=Auto)

# 📝 koishi-plugin-copywrite

[![npm](https://img.shields.io/npm/v/koishi-plugin-copywrite?style=flat-square&logo=npm)](https://www.npmjs.com/package/koishi-plugin-copywrite)
[![npm-download](https://img.shields.io/npm/dm/koishi-plugin-copywrite?style=flat-square&logo=npm)](https://npm-stat.com/charts.html?package=koishi-plugin-copywrite)

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/VincentZyuApps/koishi-plugin-copywrite)
[![Gitee](https://img.shields.io/badge/Gitee-C71D23?style=for-the-badge&logo=gitee&logoColor=white)](https://gitee.com/vincent-zyu/koishi-plugin-copywrite)

[![Koishi Forum](https://img.shields.io/badge/Koishi%20Forum-13787-5546A3?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAABU0lEQVR42p2UQSsFYRSGnxnqLuytKWKpKFkQNsS%2FsOHPWPADLCmxU5S7UzYWNrJR7lYiRF2FeWzOMKZ7mXHqNNP5vvP2nu%2B850CY2lP4X1K31ZbaDm%2BpO%2Bpyp5wfAXVEPfRvO1JHf4AVQGbUh7j4EZ4VkrNCXPVRnf3CUBN1SH2KC28VGOV3ntRhNclZHdcAKYM11QR1oVBOXctzFlNgBTC8qmXxPQEegbVeYApIgJT6tg%2F0AdMp0B%2FBpCabK2AAmAAa%2F2GRBft1oBFPkqTAba7LCiAfQC9wClwAY1HJHepuiO29Yrsf1Dn1uiDU3RTYCtTkl1Leg8k9MB4NGgReI28rV3azgyCz0og01Xl1Uz1QX8uCTELm3UbkTF1VJ9Wr0tn3iBSGdjYG0XivE3VN3VD31PM4a3cc2tIGGI0VkTO7rLxGuiy25ejmjfqsvkSXui62TxaK03td4FXTAAAAAElFTkSuQmCC&logoColor=white)](https://forum.koishi.xyz/t/topic/13787)

[![QQ群](https://img.shields.io/badge/QQ群-1085190201-12B7F5?style=flat-square&logo=qq&logoColor=white)](https://qm.qq.com/q/ZHj33L5cuC)

<h2>💬 交流反馈</h2>
<p>🐛 Bug 反馈 / 💡 建议 / 👨‍💻 插件开发交流，欢迎加群：</p>
<p>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>1085190201</b> 🎉</p>
<p>💡 在群里直接艾特我，回复的更快哦~ ✨</p>

## 📖 介绍

定型文生成器。给一段示例文案，再给一个主题，让大模型照着它的措辞和语气写一篇新的。

移植自 [nonebot-plugin-copywrite](https://github.com/Yan-Zero/nonebot-plugin-copywrite)，感谢原作者 [Yan-Zero](https://github.com/Yan-Zero) 的文案模板与 prompt 设计。

> **[📖 查看完整更新日志 →](./CHANGELOG.md)**

## 🖼️ 预览

> 你说得对，但是 koishi-plugin-copywrite 定型文生成器是由 Koishi 社区开发者打造的一款全新文案仿写插件。插件运行在一个被称作「示例文案」的语言世界中，在这里，被用户选中的人将被授予「主题」，导引措辞与语气之力。用户将扮演一位名为「生成器」的神秘角色，在自由的仿写中邂逅风格各异、腔调独特的示例文案们，和它们一起提炼句式、复刻语气，生成贴合主题的新文案——同时，逐步发掘「定型文生成」的真相。

![你说的对](https://cdn.jsdelivr.net/gh/VincentZyuApps/koishi-plugin-copywrite@main/docs/images/preview/preview-%E4%BD%A0%E8%AF%B4%E5%BE%97%E5%AF%B9.png)

👉 [查看更多预览](https://github.com/VincentZyuApps/koishi-plugin-copywrite/blob/main/docs/preview.md)

## 📦 安装

使用 Yarn：

```sh
yarn add koishi-plugin-copywrite
```

使用 npm：

```sh
npm install koishi-plugin-copywrite
```

启用后会自动把内置模板释放到 `data/copywrite/presets/`，开箱即用。

## 💬 指令

`/文案` 的别名为 `/模仿文案`。指令名与别名都可以在配置里修改（默认主指令 `copywrite`，别名 `文案`、`模仿文案`；汉语新解默认 `new-meaning`，别名 `汉语新解`）。

| 指令 | 说明 |
| --- | --- |
| `/文案` | 完整帮助：实时列出全部分类与模板，并附用法 |
| `/文案 --help` | 简洁的指令语法与选项说明 |
| `/文案 【类型】` | 查看该模板的说明 |
| `/文案 【类型】 【题材】` | 生成文案 |
| `/文案 【类型】 【关键词…】 【题材】` | 该模板需要多个关键词时按顺序填写 |
| `/文案 reload` | 重新扫描模板目录 |
| `/文案 reset` | 重新释放内置模板（覆盖同名文件） |
| `/文案 clone 【原名】 【新名】` | 复制一份模板到用户目录 |
| `/文案 rm 【名字】` | 删除用户目录里的模板 |
| `/汉语新解 【词】` | 用全新角度解释一个词，输出图片 |

管理指令默认需要 Koishi 权限等级：`clone` / `rm` 为 3，`reload` / `reset` 为 4，均可在配置里调整。

## 🎛️ 消息行为

- **引用触发消息**：`enableQuote`（默认开启）作用于所有指令回复，包括帮助、列表、错误与生成结果。
- **等待提示**：`enableWaitingHint`（默认开启）只在调用模型时发送「正在生成」提示，完成后自动撤回。
- **思考消息**：`sendReasoning`（默认关闭）开启后在正文之前单独发送模型的思考过程。
- **思考消息走 QQ Markdown**：`enableReasoningViaQQMarkdown`（默认关闭）仅对 `platform = qq` 生效，用 `> xxx` 引用块发送思考消息；正文始终是普通文本。
- **思考消息长度**：`reasoningMaxChars`（默认 `2222`）超出后保留开头 80%、结尾 20%，中间以「省略 N 字」代替。
- **QQ 官方 Bot 按钮**：`enableQQButtons`（默认开启）仅在 `platform = qq` 时，于帮助/生成结果后追加一条「查看文案 / 再来一条」按钮消息；群聊点击只会把指令填入输入框。按钮 JSON 可在 `qqButtonsJson` 里调整，支持变量 `${commandName}`、`${randomType}`；为空或 JSON 无效时不会发送按钮，并在聊天中提示。

## 🤖 模型接入

两种方式，在 `llmMode` 里选优先级：

- **ChatLuna**：装了 `koishi-plugin-chatluna` 就能直接选模型，`chatlunaModelMap` 可把模板里的模型名映射成 ChatLuna 的 `platform/model`。
- **自定义 API**：在 `customProviders` 里按模板的 `model` 字段配置 `baseURL` / `apiKey`，支持 OpenAI 兼容与 Anthropic 两种格式。

四种模式：仅 ChatLuna、仅自定义、先 ChatLuna 后自定义、先自定义后 ChatLuna。默认先 ChatLuna，没装则自动回退自定义。

自定义 API 的温度、最大 token 数、超时和思考等级是全局配置，在「⚙️ 调用参数」里调整。

思考等级支持 `auto` / `off` / `low` / `medium` / `high` / `xhigh` / `max`：

- `auto`：不发送 `reasoning_effort`，由上游决定
- `off`：关闭思考（CommandCode / goat 实测有效，`reasoning_tokens` 归零）
- 其余为具体强度；Anthropic 通道会映射为 `thinking.budget_tokens`

> 不同中转支持的取值可能不同。例如 CommandCode 只接受 `off|low|medium|high|xhigh|max`，传 `none` 会返回 400。

输出被思考截断（`finish_reason=length` 且正文为空）时，插件会自动兜底，两个开关可独立关闭：

- `retryWithoutReasoning`（默认开启）：先关闭思考重试一次
- `retryWithMoreTokens`（默认开启）：关闭思考仍失败时，把 `maxTokens` 翻倍重试一次（OpenAI 上限 10240）

## 📝 模板格式

```yaml
__category__: 分类名
__model__: sol          # 可选：该文件所有条目的默认模型

文案名:
  examples:
    - |
      第一段示例
      第二段示例
  addition: "对模型的额外约束，可以用 {} 引用关键词。"
  model: gemini-2.5-flash-nothinking   # 可选：覆盖文件级默认模型
  keywords: 1
  help: 这条文案的使用说明
```

- `__model__` 是文件级默认模型，条目内写了 `model` 时以条目为准。
- 模型名可以对应 `customProviders` 的 key，也可以用 `chatlunaModelMap` 映射到 ChatLuna。
- 放进 `data/copywrite/presets/` 就生效，目录被监听，改完保存即可，不用重启。

## 📄 许可

[Apache-2.0](./LICENSE)。

本项目移植自 [nonebot-plugin-copywrite](https://github.com/Yan-Zero/nonebot-plugin-copywrite)
（作者 Yan-Zero，Apache-2.0），包含其文案模板 YAML、prompt 构造逻辑与「汉语新解」prompt
（prompt 原作者：李继刚）。

主要改动：Python → TypeScript，并针对 Koishi 重新实现指令与 LLM 接入层。详见 [NOTICE](./NOTICE)。
