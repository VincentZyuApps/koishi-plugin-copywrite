# test_api.py

诊断 OpenAI 兼容接口的小工具，用来定位「OpenAI 兼容接口返回内容为空」到底是哪一环：

- HTTP 状态、耗时、content-type
- `finish_reason`（`stop` / `length` / `content_filter` …）
- `content` 的长度与预览
- `reasoning_content` 的长度与预览
- `usage`
- HTTP 200 里夹带的 `error` 字段

脚本**不读取任何配置文件**，baseURL、apiKey、model、prompt 全部由命令行参数或环境变量传入。

## 前置

- [uv](https://docs.astral.sh/uv/)（本机已安装）
- 依赖只有 `requests`，由 uv 内联声明并自动准备，不会在插件目录留下 venv
- 需要代理时先设置：
  ```powershell
  $env:HTTP_PROXY="http://127.0.0.1:7890"
  $env:HTTPS_PROXY="http://127.0.0.1:7890"
  ```

## 必填项与优先级

**命令行参数 > 环境变量**

| 值 | 参数 | 环境变量 | 缺失行为 |
| --- | --- | --- | --- |
| baseURL | `--base-url` | `COPYWRITE_BASE_URL` | 报错退出（exit 2） |
| apiKey | `--api-key` | `COPYWRITE_API_KEY` | 报错退出（exit 2） |
| model | `--model` | `COPYWRITE_MODEL` | 报错退出（exit 2） |
| prompt | `--prompt` / `--prompt-file` | — | 报错退出（exit 2） |

`--prompt` 与 `--prompt-file` 只能二选一。

## 快速开始

```powershell
uv run scripts/test_api.py `
  --base-url http://127.0.0.1:8000/v1 `
  --api-key sk-xxx `
  --model gpt-4o-mini `
  --prompt "请回复 ok"
```

用环境变量传敏感信息：

```powershell
$env:COPYWRITE_BASE_URL="http://127.0.0.1:8000/v1"
$env:COPYWRITE_API_KEY="sk-xxx"
$env:COPYWRITE_MODEL="gpt-4o-mini"

uv run scripts/test_api.py --prompt "请回复 ok"
```

## 复现插件里的失败用例

插件开启 `verboseLog` 后，日志里会完整打印 `verbose prompt: ...`。把那一段 prompt 原文保存成 `prompt.txt`，然后：

```powershell
uv run scripts/test_api.py `
  --base-url http://laoke.vincentzyu233.cn:10102/v1 `
  --api-key sk-xxx `
  --model deepseek/deepseek-v4-flash-vision-exp `
  --prompt-file prompt.txt
```

提高输出上限再试：

```powershell
uv run scripts/test_api.py ... --prompt-file prompt.txt --max-tokens 8192
```

连续测 3 次看是否稳定复现：

```powershell
uv run scripts/test_api.py ... --prompt-file prompt.txt --repeat 3
```

流式测试（判断中转是否支持 SSE）：

```powershell
uv run scripts/test_api.py ... --prompt-file prompt.txt --stream
```

把原始响应保存下来：

```powershell
uv run scripts/test_api.py ... --prompt-file prompt.txt --dump response.json
```

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--base-url` | — | 接口地址，可带或不带 `/v1` |
| `--api-key` | — | API Key |
| `--model` | — | 模型名 |
| `--prompt` | — | 直接传 prompt |
| `--prompt-file` | — | 从 UTF-8 文件读取 prompt |
| `--max-tokens` | `2048` | 与插件「⚙️ 调用参数」默认值一致 |
| `--temperature` | `0.65` | 与插件默认值一致 |
| `--timeout` | `120` | 秒 |
| `--repeat` | `1` | 连续请求次数 |
| `--stream` | 关 | 使用 SSE 流式请求 |
| `--show-prompt` | 关 | 打印完整 prompt |
| `--dump` | — | 保存原始响应；`--repeat > 1` 时会带序号 |
| `--param` | — | 附加请求体顶层字段，可重复，如 `--param reasoning_effort=off` |
| `--params-file` | — | 从 JSON 对象文件读取附加字段；与 `--param` 同时使用时 `--param` 优先 |

## 关闭思考（reasoning_effort）

CommandCode / goat 上游接受 `reasoning_effort`，实测合法值为：

```text
off | low | medium | high | xhigh | max
```

`off` 会完全关闭思考，`reasoning_tokens` 为 0，普通文案不再被思维链吃满 `max_tokens`：

```powershell
uv run scripts/test_api.py `
  --base-url http://laoke.vincentzyu233.cn:10102/v1 `
  --api-key sk-xxx `
  --model deepseek/deepseek-v4-flash-vision-exp `
  --prompt-file prompt.txt `
  --param reasoning_effort=off
```

注意：

- `reasoning_effort=none` 是**无效值**，上游会返回 400，并提示合法值为 `off|low|medium|high|xhigh|max`
- PowerShell 5.1 会吃掉参数里的双引号，需要传 JSON 对象时请用 `--params-file`：
  ```powershell
  # params.json
  # {"reasoning_effort":"off"}
  uv run scripts/test_api.py ... --params-file params.json
  ```

## 输出怎么读

```text
endpoint      : http://.../v1/chat/completions
model         : xxx
apiKey        : sk-***xxx
prompt        : 1872 chars / 22 lines
max_tokens    : 2048    temperature: 0.65    stream: False

--- 第 1/1 次 ---
HTTP         : 200 (13240 ms)
content-type : application/json
choices      : 1
finish_reason: length
usage        : {"completion_tokens": 2048, ...}
content      : len=0 preview=''
reasoning    : len=1832 preview='...'
结论         : content 为空且 finish_reason=length：输出达到 max_tokens 上限……
```

常见结论：

| 现象 | 含义 |
| --- | --- |
| `error` 有值 | 接口在 HTTP 200 里返回了错误（限额、上游报错等） |
| `finish_reason=length` | 输出被 `max_tokens` 截断，提高 `--max-tokens` 再试 |
| `content` 空、`reasoning` 有内容 | 模型只产出了思维链，没有正文 |
| `finish_reason=content_filter` | 被内容过滤/拒绝 |
| `content` 非空 | 接口本身正常，问题在插件侧解析或配置 |

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 所有请求都拿到了非空 `content` |
| `1` | 请求失败、`error` 非空或 `content` 为空 |
| `2` | 参数缺失或无效 |

## 安全提示

- 脚本不会完整打印 API Key，只显示 `sk-***xx` 形式
- 不要把真实 Key 写进脚本、命令行历史或提交到仓库
- `--dump` 保存的响应可能包含模型输出，按需清理
