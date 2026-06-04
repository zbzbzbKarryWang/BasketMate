"""
BasketMate ReAct Agent — 厨房搭子

基于 LangGraph 的 create_react_agent 构建，支持流式输出（SSE）和
用户确认拦截机制。所有工具函数从 app.routers.ai_tools 加载。

架构：
    用户消息 → run_agent_with_confirmation() → SSE 事件流
                                               ├─ thought  (LLM 思考)
                                               ├─ tool_call (工具调用)
                                               ├─ confirmation (请求确认)
                                               ├─ text (最终回答)
                                               └─ done (结束)

确认机制：
    Agent 调用 ask_confirmation 工具时，生成器会 yield
    type=confirmation 事件并中断。调用方（SSE 路由）需
    等待用户响应后，将确认结果作为 ToolMessage 追加到
    消息历史中再次调用 run_agent_with_confirmation。
"""

import asyncio
import json
import os
import re
from pathlib import Path
from typing import AsyncGenerator, Dict, Any, List, Optional
from datetime import datetime

from langchain_core.messages import (
    HumanMessage, AIMessage, SystemMessage, ToolMessage, BaseMessage
)
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from ..logger import get_logger

logger = get_logger("basketmate.agent")

# =====================================================================
#  System Prompt 加载
# =====================================================================

_SYSTEM_PROMPT_CACHE: Optional[str] = None


def _load_system_prompt() -> str:
    """加载 Agent 系统指令，带缓存"""
    global _SYSTEM_PROMPT_CACHE
    if _SYSTEM_PROMPT_CACHE is not None:
        return _SYSTEM_PROMPT_CACHE

    prompt_paths = [
        Path(__file__).parent.parent.parent / "agent-system-prompt.md",
        Path(__file__).parent.parent.parent / "docs" / "agent-system-prompt.md",
    ]
    for p in prompt_paths:
        if p.exists():
            _SYSTEM_PROMPT_CACHE = p.read_text(encoding="utf-8")
            logger.info(f"[agent] 加载系统指令: {p}")
            return _SYSTEM_PROMPT_CACHE

    # 回退默认指令
    _SYSTEM_PROMPT_CACHE = """你是 BasketMate 的智能厨房助手"厨房搭子"。
你可以帮用户管理菜谱、食材库存、就餐计划、采购清单。

核心规则：
1. 任何写操作（创建、更新、删除）前必须调用 ask_confirmation 请求用户确认。
2. 只读操作（查询、统计）可以直接执行。
3. 工具返回 JSON，你需要解析并用自然语言向用户总结。
4. 复杂任务需分步调用多个工具，一步一步来。
5. 回答要简洁、友好，像真实的厨房伙伴。
6. 收到用户请求后，必须直接调用工具获取数据，然后根据工具返回的结果生成完整回答，不要只说"我去查一下"就停止。
7. 如果工具调用失败，请如实告知用户错误原因，并提供替代建议。"""
    return _SYSTEM_PROMPT_CACHE


# =====================================================================
#  ask_confirmation 工具
# =====================================================================

CONFIRMATION_MARKER = "__CONFIRMATION_NEEDED__"


@tool
def ask_confirmation(message: str) -> str:
    """
    请求用户确认写操作。

    参数：
        message: 向用户展示的确认信息，应清晰说明即将执行的操作

    返回：
        固定返回 "__CONFIRMATION_NEEDED__"，由流式生成器拦截后暂停执行，
        等待用户通过 SSE 返回确认/取消后继续。

    副作用：
        无直接副作用。生成器层会拦截此调用并挂起 Agent 执行。
    """
    return CONFIRMATION_MARKER


# =====================================================================
#  LLM 构建
# =====================================================================

def _create_llm():
    """根据环境变量创建 LLM 实例，兼容项目 .env 配置（LLM_API_URL / LLM_API_KEY）"""
    api_key = (
        os.getenv("LLM_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("DEEPSEEK_API_KEY")
        or ""
    )
    raw_url = (
        os.getenv("LLM_API_URL")
        or os.getenv("OPENAI_BASE_URL")
        or os.getenv("DEEPSEEK_BASE_URL")
        or ""
    )
    # 去掉 /chat/completions 后缀
    base_url = re.sub(r"/chat/completions/?$", "", raw_url) or None
    model = os.getenv("LLM_MODEL", "deepseek-chat")

    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0,
        streaming=True,
    )
    logger.info(f"[agent] LLM: model={model}, base_url={base_url}")
    return llm


# =====================================================================
#  工具加载
# =====================================================================

def _load_tools() -> list:
    """从 ai_tools 模块加载所有工具 + ask_confirmation"""
    from ..routers.ai_tools import get_all_tools as _get_biz_tools

    business_tools = _get_biz_tools()
    all_tools = [ask_confirmation] + business_tools
    logger.info(f"[agent] 已加载 {len(all_tools)} 个工具 (含 ask_confirmation)")
    return all_tools


# =====================================================================
#  消息格式转换
# =====================================================================

def _convert_messages(raw_messages: List[Dict]) -> List[BaseMessage]:
    """将前端 JSON 消息列表转换为 LangChain 消息对象"""
    converted = []
    for m in raw_messages:
        role = m.get("role", "user")
        content = m.get("content", "")

        if role == "user":
            converted.append(HumanMessage(content=content))
        elif role == "assistant" or role == "ai":
            # 恢复 tool_calls（如果有）
            tool_calls_data = m.get("tool_calls")
            if tool_calls_data:
                converted.append(AIMessage(
                    content=content or "",
                    tool_calls=tool_calls_data,
                ))
            else:
                converted.append(AIMessage(content=content))
        elif role == "tool":
            converted.append(ToolMessage(
                content=content,
                tool_call_id=m.get("tool_call_id", ""),
                name=m.get("name"),
            ))
        elif role == "system":
            converted.append(SystemMessage(content=content))

    return converted


# =====================================================================
#  主生成器：流式执行 Agent + 确认拦截
# =====================================================================

_llm_instance = None


def _get_llm():
    """懒加载单例 LLM"""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = _create_llm()
    return _llm_instance


def _build_agent():
    """构建 ReAct Agent"""
    llm = _get_llm()
    tools = _load_tools()
    agent = create_react_agent(llm, tools)
    logger.info("[agent] ReAct Agent 创建完成")
    return agent


async def run_agent_with_confirmation(
    messages: List[BaseMessage],
    session_id: str = "default",
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    流式执行 Agent，遇到 ask_confirmation 时中断并 yield confirmation 事件。

    参数：
        messages: LangChain 消息列表（已含历史记录）
        session_id: 会话标识，用于日志追踪

    Yields:
        {"type": "thought", "content": "..."}      — LLM 思考/推理片段
        {"type": "tool_call", "name": "...", "input": {...}}  — 工具调用开始
        {"type": "tool_result", "name": "...", "result": "..."} — 工具调用结果
        {"type": "confirmation", "message": "...", "tool_call_id": "..."} — 需要用户确认
        {"type": "text", "content": "..."}          — 最终回答文本
        {"type": "done"}                            — 流结束
        {"type": "error", "message": "..."}         — 错误
    """
    start_time = datetime.now()
    
    # 记录用户消息
    user_message = ""
    for m in messages:
        if isinstance(m, HumanMessage):
            user_message = m.content[:500]
            break
    logger.info(f"[agent:{session_id}] 用户消息: {user_message}")
    logger.info(f"[agent:{session_id}] 开始执行，消息数={len(messages)}")

    try:
        agent = _build_agent()
        system_prompt = _load_system_prompt()

        current_tool_name = None
        current_tool_input = None
        tool_results = []  # 记录所有工具调用结果

        # 在消息开头添加 system prompt
        messages_with_system = [SystemMessage(content=system_prompt)] + messages

        async for event in agent.astream_events(
            {"messages": messages_with_system},
            version="v2",
            config={"configurable": {"thread_id": session_id}}
        ):
            kind = event.get("event", "")

            # ── LLM 流式输出（思考过程） ──
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    content = chunk.content
                    if isinstance(content, str) and content.strip():
                        yield {
                            "type": "thought",
                            "content": content
                        }

            # ── 工具调用开始 ──
            elif kind == "on_tool_start":
                tool_name = event.get("name", "unknown")
                tool_input = event.get("data", {}).get("input", {})
                current_tool_name = tool_name
                current_tool_input = tool_input

                # ask_confirmation 不会被 yield 为 tool_call，
                # 而是特殊处理为 confirmation 事件
                if tool_name == "ask_confirmation":
                    msg = tool_input.get("message", "确认执行此操作？")
                    tool_call_id = event.get("run_id", "")
                    logger.info(
                        f"[agent:{session_id}] 确认请求: {msg[:100]}"
                    )
                    yield {
                        "type": "confirmation",
                        "message": msg,
                        "tool_call_id": tool_call_id,
                    }
                    # 中断生成器 — 调用方负责追加 ToolMessage 后重新调用
                    return
                else:
                    # 详细记录工具调用
                    input_str = json.dumps(_safe_serialize_input(tool_input), ensure_ascii=False)[:200]
                    logger.info(
                        f"[agent:{session_id}] 工具调用: {tool_name}, 参数: {input_str}"
                    )
                    yield {
                        "type": "tool_call",
                        "name": tool_name,
                        "input": _safe_serialize_input(tool_input),
                    }

            # ── 工具调用结束 ──
            elif kind == "on_tool_end":
                tool_name = event.get("name", "unknown")
                output = event.get("data", {}).get("output")
                result_str = _safe_serialize_output(output)
                # 详细记录工具返回
                logger.info(
                    f"[agent:{session_id}] 工具完成: {tool_name}, 返回值: {result_str[:200]}"
                )
                tool_results.append({
                    "name": tool_name,
                    "input": current_tool_input,
                    "output": result_str
                })
                yield {
                    "type": "tool_result",
                    "name": tool_name,
                    "result": result_str[:1000],  # 截断过长结果
                }

            # ── 最终回答 ──
            elif kind == "on_chat_model_end":
                # 收集模型生成的最终消息
                output = event.get("data", {}).get("output")
                if output and hasattr(output, "content") and output.content:
                    if isinstance(output.content, str) and output.content.strip():
                        # 检查是否有工具调用
                        has_tool_calls = False
                        if hasattr(output, "tool_calls") and output.tool_calls:
                            has_tool_calls = True
                        
                        # 如果没有工具调用，这是最终回答
                        if not has_tool_calls:
                            logger.info(f"[agent:{session_id}] 最终回复: {output.content[:300]}")
                            yield {
                                "type": "text",
                                "content": output.content
                            }

        # ── 正常结束 ──
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"[agent:{session_id}] 执行完成，耗时 {elapsed:.1f}s，工具调用次数={len(tool_results)}")
        yield {"type": "done"}

    except Exception as e:
        logger.error(f"[agent:{session_id}] 执行失败: {e}", exc_info=True)
        yield {
            "type": "error",
            "message": f"Agent 执行出错: {str(e)}"
        }
        yield {"type": "done"}


def _safe_serialize_input(tool_input) -> Dict[str, Any]:
    """安全序列化工具输入参数"""
    if isinstance(tool_input, dict):
        result = {}
        for k, v in tool_input.items():
            try:
                if isinstance(v, (str, int, float, bool, type(None))):
                    result[k] = v
                else:
                    result[k] = json.dumps(v, ensure_ascii=False, default=str)
            except Exception:
                result[k] = str(v)[:200]
        return result
    return {"raw": str(tool_input)[:200]}


def _safe_serialize_output(output) -> str:
    """安全序列化工具输出"""
    if output is None:
        return ""
    if isinstance(output, str):
        return output
    try:
        return json.dumps(output, ensure_ascii=False, default=str)
    except Exception:
        return str(output)


def create_confirmation_tool_message(
    confirmation_response: str,
    tool_call_id: str,
) -> ToolMessage:
    """
    根据用户确认/取消构建 ToolMessage。

    参数：
        confirmation_response: "确认" 或 "取消"（或其他用户消息）
        tool_call_id: ask_confirmation 工具调用的 run_id

    返回：
        ToolMessage 实例，可追加到消息历史中
    """
    if confirmation_response in ("确认", "confirm", "yes", "ok", "是"):
        result = "用户已确认，操作可以继续执行。"
    else:
        result = f"用户取消了操作。原因: {confirmation_response}"

    return ToolMessage(
        content=result,
        tool_call_id=tool_call_id,
        name="ask_confirmation",
    )


def find_ask_confirmation_tool_call(messages: List[BaseMessage]) -> Optional[Dict]:
    """
    在消息列表中查找最近一次 ask_confirmation 的 AIMessage tool_call。

    返回：
        {"tool_call_id": "...", "message": "..."} 或 None
    """
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                if tc.get("name") == "ask_confirmation":
                    return {
                        "tool_call_id": tc.get("id", ""),
                        "message": tc.get("args", {}).get("message", "确认此操作？"),
                    }
    return None