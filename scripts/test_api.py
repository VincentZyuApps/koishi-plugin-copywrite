#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["requests"]
# ///
"""诊断 OpenAI 兼容接口：定位「返回内容为空」到底是谁的问题。

用法示例：
  uv run scripts/test_api.py \
    --base-url http://127.0.0.1:8000/v1 \
    --api-key sk-xxx \
    --model gpt-4o-mini \
    --prompt "请回复 ok"

配置优先级：命令行参数 > 环境变量。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

try:
    import requests
except ImportError:  # pragma: no cover
    print(
        "缺少 requests。请使用 `uv run scripts/test_api.py ...` 运行，"
        "或先执行 `uv pip install requests`。",
        file=sys.stderr,
    )
    raise SystemExit(2)


EXAMPLE = (
    "uv run scripts/test_api.py "
    '--base-url http://127.0.0.1:8000/v1 '
    "--api-key sk-xxx "
    "--model gpt-4o-mini "
    '--prompt "请回复 ok"'
)


def env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def build_endpoint(base_url: str) -> str:
    """与 src/llm/openai.ts 的 appendEndpoint 行为保持一致。"""
    base = base_url.strip().rstrip("/")
    parts = urlsplit(base)

    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError("baseURL 必须以 http:// 或 https:// 开头")

    path = parts.path.rstrip("/")

    if path.endswith("/chat/completions"):
        return urlunsplit(
            (parts.scheme, parts.netloc, path, parts.query, parts.fragment)
        )

    if path.endswith("/v1"):
        path += "/chat/completions"
    else:
        path += "/v1/chat/completions"

    return urlunsplit(
        (parts.scheme, parts.netloc, path, parts.query, parts.fragment)
    )


def extract_text(value: Any) -> str:
    """兼容 content 为字符串、对象、数组等多种返回形态。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("text", "content", "value"):
            nested = value.get(key)
            if isinstance(nested, str):
                return nested
            if isinstance(nested, (dict, list)):
                text = extract_text(nested)
                if text:
                    return text
        return ""
    if isinstance(value, list):
        return "".join(extract_text(item) for item in value)
    return ""


def preview(value: str, limit: int = 160) -> str:
    text = value.replace("\r", "").replace("\n", "\\n")
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def mask_key(key: str) -> str:
    if len(key) <= 8:
        return "***"
    return f"{key[:3]}***{key[-2:]}"


def analyze(data: Any) -> dict[str, Any]:
    info: dict[str, Any] = {
        "error": None,
        "finish_reason": None,
        "content": "",
        "reasoning": "",
        "usage": None,
        "choices": 0,
    }

    if not isinstance(data, dict):
        return info

    if data.get("error") is not None:
        info["error"] = data["error"]

    info["usage"] = data.get("usage")

    choices = data.get("choices")
    if isinstance(choices, list):
        info["choices"] = len(choices)
        if choices and isinstance(choices[0], dict):
            choice = choices[0]
            info["finish_reason"] = choice.get("finish_reason")
            message = choice.get("message") or choice.get("delta") or {}
            if isinstance(message, dict):
                info["content"] = extract_text(message.get("content"))
                info["reasoning"] = extract_text(
                    message.get("reasoning_content") or message.get("reasoning")
                )

    return info


def verdict(info: dict[str, Any]) -> str:
    if info["error"] is not None:
        return "接口返回了 error 字段（HTTP 200 也可能出现），请看上面的 error 内容"
    if not info["choices"]:
        return "响应里没有 choices，可能不是标准 OpenAI 格式"
    if info["content"].strip():
        return "成功拿到正文"
    if info["finish_reason"] == "length":
        return (
            "content 为空且 finish_reason=length：输出达到 max_tokens 上限，"
            "试试提高 --max-tokens（例如 8192）"
        )
    if info["reasoning"].strip():
        return "content 为空，但返回了 reasoning_content：模型只产出了思维链"
    if info["finish_reason"] == "content_filter":
        return "content 为空且 finish_reason=content_filter：被内容过滤/拒绝"
    return f"content 为空（finish_reason={info['finish_reason']}）"


def dump_payload(path: str | None, index: int, total: int, text: str) -> None:
    if not path:
        return
    target = Path(path)
    if total > 1:
        target = target.with_name(f"{target.stem}.{index + 1}{target.suffix}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    print(f"已保存响应到 {target}")


def print_summary(
    status: int | None,
    elapsed: float,
    content_type: str | None,
    info: dict[str, Any],
    raw_text: str,
    data: Any,
) -> None:
    print(f"HTTP         : {status if status is not None else '-'}"
          f" ({elapsed * 1000:.0f} ms)")
    if content_type:
        print(f"content-type : {content_type}")
    print(f"choices      : {info['choices']}")
    print(f"finish_reason: {info['finish_reason']}")

    usage = info["usage"]
    if usage is None:
        print("usage        : -")
    else:
        print(f"usage        : {json.dumps(usage, ensure_ascii=False)}")

    print(f"content      : len={len(info['content'])}"
          f" preview={preview(info['content'])!r}")
    print(f"reasoning    : len={len(info['reasoning'])}"
          f" preview={preview(info['reasoning'])!r}")

    if info["error"] is not None:
        print(f"error        : {json.dumps(info['error'], ensure_ascii=False)}")

    if data is None and raw_text:
        print(f"raw          : {preview(raw_text, 400)!r}")

    print(f"结论         : {verdict(info)}")


def request_once(
    args: argparse.Namespace,
    endpoint: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    index: int,
) -> bool:
    print(f"--- 第 {index + 1}/{args.repeat} 次 ---")

    if args.stream:
        return request_stream(args, endpoint, headers, payload, index)

    started = time.perf_counter()
    try:
        response = requests.post(
            endpoint,
            json=payload,
            headers=headers,
            timeout=args.timeout,
        )
    except requests.RequestException as error:
        print(f"请求失败：{error}")
        print("结论         : 网络/连接错误，检查 baseURL、代理和接口是否存活")
        return False

    elapsed = time.perf_counter() - started
    content_type = response.headers.get("content-type", "")
    raw_text = response.text

    data: Any = None
    try:
        data = response.json()
    except ValueError:
        data = None

    info = analyze(data)
    print_summary(
        response.status_code,
        elapsed,
        content_type,
        info,
        raw_text,
        data,
    )

    dump_payload(
        args.dump,
        index,
        args.repeat,
        json.dumps(data, ensure_ascii=False, indent=2)
        if data is not None
        else raw_text,
    )

    return (
        response.status_code < 400
        and info["error"] is None
        and bool(info["content"].strip())
    )


def request_stream(
    args: argparse.Namespace,
    endpoint: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    index: int,
) -> bool:
    started = time.perf_counter()
    status: int | None = None
    content_type: str | None = None
    raw_lines: list[str] = []
    content_parts: list[str] = []
    reasoning_parts: list[str] = []
    finish_reasons: list[str] = []
    usage = None
    error_obj = None

    try:
        with requests.post(
            endpoint,
            json=payload,
            headers=headers,
            timeout=args.timeout,
            stream=True,
        ) as response:
            status = response.status_code
            content_type = response.headers.get("content-type", "")

            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    continue
                text = line.decode("utf-8", "replace") if isinstance(
                    line, bytes
                ) else line
                if not text.startswith("data:"):
                    raw_lines.append(text)
                    continue

                payload_str = text[5:].strip()
                if payload_str == "[DONE]":
                    break

                try:
                    chunk = json.loads(payload_str)
                except json.JSONDecodeError:
                    raw_lines.append(text)
                    continue

                if isinstance(chunk, dict):
                    if chunk.get("error") is not None:
                        error_obj = chunk["error"]
                    if chunk.get("usage") is not None:
                        usage = chunk["usage"]
                    for choice in chunk.get("choices") or []:
                        if not isinstance(choice, dict):
                            continue
                        delta = choice.get("delta") or {}
                        content_parts.append(extract_text(delta.get("content")))
                        reasoning_parts.append(
                            extract_text(
                                delta.get("reasoning_content")
                                or delta.get("reasoning")
                            )
                        )
                        if choice.get("finish_reason"):
                            finish_reasons.append(choice["finish_reason"])
    except requests.RequestException as error:
        print(f"流式请求失败：{error}")
        print("结论         : 网络/连接错误，或接口不接受 stream=true")
        return False

    elapsed = time.perf_counter() - started
    info = {
        "error": error_obj,
        "finish_reason": finish_reasons[-1] if finish_reasons else None,
        "content": "".join(content_parts),
        "reasoning": "".join(reasoning_parts),
        "usage": usage,
        "choices": 1 if content_parts or reasoning_parts else 0,
    }
    raw_text = "\n".join(raw_lines)
    print_summary(status, elapsed, content_type, info, raw_text, None)
    dump_payload(
        args.dump,
        index,
        args.repeat,
        json.dumps(
            {
                "content": info["content"],
                "reasoning": info["reasoning"],
                "finish_reasons": finish_reasons,
                "usage": usage,
                "error": error_obj,
                "raw_lines": raw_lines,
            },
            ensure_ascii=False,
            indent=2,
        ),
    )

    return (
        (status or 0) < 400
        and error_obj is None
        and bool(info["content"].strip())
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="诊断 OpenAI 兼容接口的返回内容（定位「内容为空」）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"示例：\n  {EXAMPLE}",
    )
    parser.add_argument("--base-url", help="接口地址，例如 http://host:port/v1")
    parser.add_argument("--api-key", help="API Key")
    parser.add_argument("--model", help="模型名，例如 gpt-4o-mini")
    parser.add_argument("--prompt", help="直接传入一段 prompt")
    parser.add_argument("--prompt-file", help="从文件读取 prompt（UTF-8）")
    parser.add_argument("--max-tokens", type=int, default=2048)
    parser.add_argument("--temperature", type=float, default=0.65)
    parser.add_argument("--timeout", type=float, default=120.0, help="秒")
    parser.add_argument("--repeat", type=int, default=1, help="连续请求次数")
    parser.add_argument("--stream", action="store_true", help="使用 SSE 流式请求")
    parser.add_argument("--show-prompt", action="store_true", help="打印完整 prompt")
    parser.add_argument("--dump", help="把原始响应保存到文件")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    base_url = args.base_url or env("COPYWRITE_BASE_URL")
    api_key = args.api_key or env("COPYWRITE_API_KEY")
    model = args.model or env("COPYWRITE_MODEL")

    missing: list[str] = []
    if not base_url:
        missing.append("baseURL（--base-url 或 COPYWRITE_BASE_URL）")
    if not api_key:
        missing.append("apiKey（--api-key 或 COPYWRITE_API_KEY）")
    if not model:
        missing.append("model（--model 或 COPYWRITE_MODEL）")
    if not args.prompt and not args.prompt_file:
        missing.append("prompt（--prompt 或 --prompt-file）")

    if missing:
        print("缺少必填参数：", file=sys.stderr)
        for item in missing:
            print(f"  - {item}", file=sys.stderr)
        print("\n示例：", file=sys.stderr)
        print(f"  {EXAMPLE}", file=sys.stderr)
        return 2

    if args.prompt and args.prompt_file:
        print("--prompt 和 --prompt-file 只能二选一。", file=sys.stderr)
        return 2

    if args.repeat < 1:
        print("--repeat 必须大于等于 1。", file=sys.stderr)
        return 2

    if args.prompt_file:
        try:
            prompt = Path(args.prompt_file).read_text(encoding="utf-8")
        except OSError as error:
            print(f"读取 prompt 文件失败：{error}", file=sys.stderr)
            return 2
    else:
        prompt = args.prompt

    try:
        endpoint = build_endpoint(base_url)
    except ValueError as error:
        print(f"baseURL 无效：{error}", file=sys.stderr)
        return 2

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
    }

    print(f"endpoint      : {endpoint}")
    print(f"model         : {model}")
    print(f"apiKey        : {mask_key(api_key)}")
    print(f"prompt        : {len(prompt)} chars / {prompt.count(chr(10)) + 1} lines")
    print(
        f"max_tokens    : {args.max_tokens}    "
        f"temperature: {args.temperature}    stream: {args.stream}"
    )
    if args.show_prompt:
        print("--- prompt begin ---")
        print(prompt)
        print("--- prompt end ---")
    print()

    results = [
        request_once(args, endpoint, headers, payload, index)
        for index in range(args.repeat)
    ]

    success = sum(1 for item in results if item)
    print()
    print(f"完成：{success}/{len(results)} 次拿到非空 content。")
    return 0 if success == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
