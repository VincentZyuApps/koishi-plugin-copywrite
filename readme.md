# koishi-plugin-copywrite

[![npm](https://img.shields.io/npm/v/koishi-plugin-copywrite?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-copywrite)

定型文生成器。给一段示例文案，再给一个主题，让大模型照着它的措辞和语气写一篇新的。

移植自 [nonebot-plugin-copywrite](https://github.com/Yan-Zero/nonebot-plugin-copywrite)，感谢原作者 [Yan-Zero](https://github.com/Yan-Zero) 的文案模板与 prompt 设计。

## 安装

```sh
yarn add koishi-plugin-copywrite
```

启用后会自动把内置模板释放到 `data/copywrite/presets/`，开箱即用。

## 指令

`/文案` 的别名为 `/模仿文案`。指令名与别名都可以在配置里修改（默认主指令 `copywrite`，别名 `文案`、`模仿文案`；汉语新解默认 `new-meaning`，别名 `汉语新解`）。

| 指令 | 说明 |
| --- | --- |
| `/文案` | 查看所有分类与模板 |
| `/文案 <类型>` | 查看该模板的说明 |
| `/文案 <类型> <关键词...> <主题>` | 生成文案 |
| `/文案 reload` | 重新扫描模板目录 |
| `/文案 reset` | 重新释放内置模板（覆盖同名文件） |
| `/文案 clone <原名> <新名>` | 复制一份模板到用户目录 |
| `/文案 rm <名字>` | 删除用户目录里的模板 |
| `/汉语新解 <词>` | 用全新角度解释一个词，输出图片 |

rename 之外的管理指令默认需要 Koishi 权限等级 3，`reload` / `reset` 为 4，均可在配置里调整。

## 模型接入

两种方式，在 `llmMode` 里选优先级：

- **ChatLuna**：装了 `koishi-plugin-chatluna` 就能直接选模型，`chatlunaModelMap` 可把模板里的模型名映射成 ChatLuna 的 `platform/model`。
- **自定义 API**：在 `customProviders` 里按模板的 `model` 字段配置 `baseURL` / `apiKey`，支持 OpenAI 兼容与 Anthropic 两种格式。

四种模式：仅 ChatLuna、仅自定义、先 ChatLuna 后自定义、先自定义后 ChatLuna。默认先 ChatLuna，没装则自动回退自定义。

自定义 API 的温度、最大 token 数和超时是全局配置，在「⚙️ 调用参数」里调整。

## 模板格式

```yaml
__category__: 分类名

文案名:
  examples:
    - |
      第一段示例
      第二段示例
  addition: "对模型的额外约束，可以用 {} 引用关键词。"
  model: gemini-2.5-flash-nothinking
  keywords: 1
  help: 这条文案的使用说明
```

放进 `data/copywrite/presets/` 就生效，目录被监听，改完保存即可，不用重启。

## 许可

[Apache-2.0](./LICENSE)。

本项目移植自 [nonebot-plugin-copywrite](https://github.com/Yan-Zero/nonebot-plugin-copywrite)
（作者 Yan-Zero，Apache-2.0），包含其文案模板 YAML、prompt 构造逻辑与「汉语新解」prompt
（prompt 原作者：李继刚）。

主要改动：Python → TypeScript，并针对 Koishi 重新实现指令与 LLM 接入层。详见 [NOTICE](./NOTICE)。
