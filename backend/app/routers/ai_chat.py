"""
AI Chat SSE 流式路由

POST /api/ai/chat        — ReAct Agent 流式对话
POST /api/ai/chat/reset  — 重置会话历史
GET  /api/ai/chat/tools  — 列出可用工具

确认机制（两种模式）：
  A) 前端管理历史 [推荐]：
     1. 收到 type=confirmation 后，前端追加 AIMessage(tool_calls) + ToolMessage
     2. 前端重新 POST 完整 messages（不带 confirmation_response）
  B) 后端补全 [便捷]：
     1. 收到 type=confirmation 后，前端发送 confirmation_response="确认"
     2. 后端自动在 messages 末尾补上 AIMessage + ToolMessage
"""

import asyncio
import json
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..ai.agent import (
    run_agent_with_confirmation,
    _convert_messages,
    create_confirmation_tool_message,
)
from ..logger import get_logger
from .. import models as models

logger = get_logger("basketmate.ai_chat")
router = APIRouter(prefix="/api/ai", tags=["AI Chat"])


# =====================================================================
#  请求 / 响应模型
# =====================================================================

class ChatMessage(BaseModel):
    role: str  # user | assistant | ai | tool | system
    content: str = ""
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    confirmation_response: Optional[str] = Field(
        default=None,
        description="便捷模式：用户对上一次确认请求的响应"
    )
    session_id: str = Field(default="default")


class ChatResetRequest(BaseModel):
    session_id: str = "default"


# =====================================================================
#  辅助
# =====================================================================

def create_confirmation_tool_message(response: str, tool_call_id: str) -> "ToolMessage":
    """创建确认结果的 ToolMessage"""
    from langchain_core.messages import ToolMessage
    content = f"用户已{'确认' if response == '确认' else '取消'}"
    return ToolMessage(content=content, tool_call_id=tool_call_id, name="ask_confirmation")


def _has_confirmation_tool_result(messages: List[Dict]) -> bool:
    """检查消息列表中是否已包含 ask_confirmation 的 ToolMessage 结果"""
    for m in messages:
        if m.get("role") == "tool" and m.get("name") == "ask_confirmation":
            return True
    return False


def _find_last_ask_confirmation_tool_call(messages: List[Dict]) -> Optional[Dict]:
    """找到最近一次 ask_confirmation 的 tool_call 信息"""
    for m in reversed(messages):
        if m.get("role") in ("assistant", "ai"):
            for tc in m.get("tool_calls") or []:
                if tc.get("name") == "ask_confirmation":
                    return {
                        "id": tc.get("id", ""),
                        "message": tc.get("args", {}).get("message", ""),
                        "parent_msg": m,
                    }
    return None


def _inject_confirmation_messages(messages: List[Dict], confirmation_response: str) -> List[Dict]:
    """
    注入确认相关的消息。
    如果消息历史中已经有 ask_confirmation 的调用记录和结果，直接使用。
    如果没有（前端没有传递），则构造一个假的调用记录来模拟这个过程。
    """
    # 检查是否已有确认相关消息
    has_tool_result = _has_confirmation_tool_result(messages)
    has_tool_call = _find_last_ask_confirmation_tool_call(messages) is not None
    
    if has_tool_result:
        # 已有确认结果，不需要注入
        return messages
    
    if has_tool_call:
        # 有工具调用但没有结果，需要补全结果
        tc_info = _find_last_ask_confirmation_tool_call(messages)
        tool_call_id = tc_info["id"] if tc_info else f"call_{confirmation_response}_{id(messages)}"
        messages.append({
            "role": "tool",
            "name": "ask_confirmation",
            "content": f"用户已{'确认' if confirmation_response == '确认' else '取消'}",
            "tool_call_id": tool_call_id,
        })
        return messages
    
    # 没有确认相关消息，说明这是第一次确认请求
    # 构造假的 assistant 消息（包含 ask_confirmation 调用）
    tool_call_id = f"call_{confirmation_response}_{id(messages)}"
    assistant_msg = {
        "role": "assistant",
        "content": "",
        "tool_calls": [{
            "id": tool_call_id,
            "name": "ask_confirmation",
            "args": {"message": "确认执行操作？"},
        }],
    }
    # 找到最后一个 user 消息的位置
    insert_idx = 0
    for i, m in enumerate(messages):
        if m.get("role") == "user":
            insert_idx = i + 1
    
    # 插入 assistant 消息和 tool 消息
    messages.insert(insert_idx, assistant_msg)
    messages.insert(insert_idx + 1, {
        "role": "tool",
        "name": "ask_confirmation",
        "content": f"用户已{'确认' if confirmation_response == '确认' else '取消'}",
        "tool_call_id": tool_call_id,
    })
    
    return messages


# =====================================================================
#  SSE 流生成器
# =====================================================================

async def _stream(messages: List[Dict], session_id: str) -> str:
    lc_messages = _convert_messages(messages)
    logger.info(f"[ai_chat:{session_id}] 流式开始，消息数={len(lc_messages)}")
    try:
        async for event in run_agent_with_confirmation(lc_messages, session_id):
            event_type = event.get("type", "unknown")
            logger.info(f"[ai_chat:{session_id}] SSE 事件: {event_type}")
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    except Exception as e:
        logger.error(f"[ai_chat:{session_id}] 异常: {e}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"


# =====================================================================
#  路由
# =====================================================================

@router.post("/chat")
async def chat(req: ChatRequest, request: Request):
    """
    ReAct Agent 流式对话 (SSE)。

    请求体示例 — 新对话：
        { "messages": [{"role":"user","content":"冰箱里有什么?"}] }

    请求体示例 — 确认响应（B 模式便捷补全）：
        { "messages": [...原有历史...], "confirmation_response": "确认" }

    请求体示例 — 确认响应（A 模式前端已补全）：
        { "messages": [
            {"role":"user","content":"帮我规划"},
            {"role":"assistant","content":"","tool_calls":[
              {"id":"xxx","name":"ask_confirmation","args":{"message":"确认创建?"}}
            ]},
            {"role":"tool","name":"ask_confirmation","content":"用户已确认","tool_call_id":"xxx"}
          ] }

    SSE 事件类型：
        thought      — LLM 思考 token
        tool_call    — 工具调用（名称+参数）
        tool_result  — 工具返回结果
        confirmation — 需用户确认（流中断，等待重新请求）
        text         — 最终回答文本
        done         — 本次流结束
        error        — 错误信息
    """
    if await request.is_disconnected():
        return StreamingResponse(iter([]), media_type="text/event-stream")

    messages = [m.model_dump(exclude_none=True) for m in req.messages]
    
    # 记录请求体（不含图片等大内容）
    user_content = ""
    for m in messages:
        if m.get("role") == "user" and m.get("content"):
            user_content = m["content"][:200]
            break
    
    logger.info(f"[ai_chat:{req.session_id}] 收到请求，用户消息: {user_content}")
    logger.info(f"[ai_chat:{req.session_id}] 消息数: {len(messages)}, 确认响应: {req.confirmation_response or '无'}")

    # ── 便捷模式 B：后端自动补全确认 ToolMessage ──
    if req.confirmation_response:
        messages = _inject_confirmation_messages(messages, req.confirmation_response)
        logger.info(
            f"[ai_chat:{req.session_id}] "
            f"已注入确认消息，当前消息数: {len(messages)}"
        )

    return StreamingResponse(
        _stream(messages, req.session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/chat/reset", response_model=models.ApiResponse)
async def reset_chat(req: ChatResetRequest):
    """重置会话历史"""
    logger.info(f"[ai_chat:{req.session_id}] 重置会话")
    return models.ApiResponse.ok({"message": "会话已重置"})


@router.get("/chat/tools", response_model=models.ApiResponse)
async def list_tools():
    """列出所有可用工具（调试）"""
    from ..ai.agent import _load_tools
    tools = _load_tools()
    return models.ApiResponse.ok({
        "total": len(tools),
        "tools": [
            {"name": t.name, "description": (t.description or "")[:200]}
            for t in tools
        ],
    })