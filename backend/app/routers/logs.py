from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import List, Optional
import os
from collections import deque
from ..decorators import log_operation
from ..logger import get_logger

router = APIRouter(prefix="/api/logs", tags=["logs"])

LOG_FILE = "/logs/app.log"
FRONTEND_LOG_FILE = "/logs/frontend.log"
MAX_LINES = 500

class FrontendLogEntry(BaseModel):
    timestamp: str
    level: str
    message: str
    component: Optional[str] = "-"
    action: Optional[str] = "-"

class FrontendLogsUpload(BaseModel):
    logs: List[FrontendLogEntry]

@router.get("/recent", response_class=PlainTextResponse)
@log_operation("获取最近日志")
async def get_recent_logs(minutes: int = Query(10, ge=1, le=1440)):
    if not os.path.exists(LOG_FILE):
        return "No logs available."
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            total_lines = 0
            recent_lines = deque(maxlen=MAX_LINES)
            for line in f:
                total_lines += 1
                recent_lines.append(line)

        lines_list = list(recent_lines)
        if minutes * 1000 < len(lines_list):
            lines_list = lines_list[-minutes * 1000:]

        prefix = f"仅显示最近 {len(lines_list)} 行日志（共 {total_lines} 行）\n\n"
        return prefix + "".join(lines_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/frontend/upload")
@log_operation("上传前端日志")
async def upload_frontend_logs(data: FrontendLogsUpload):
    try:
        os.makedirs("/logs", exist_ok=True)
        with open(FRONTEND_LOG_FILE, "a", encoding="utf-8") as f:
            for log_entry in data.logs:
                timestamp = log_entry.timestamp
                level = log_entry.level
                message = log_entry.message
                component = log_entry.component or "-"
                action = log_entry.action or "-"
                formatted = f"{timestamp} [FRONTEND] [{level}] [{component}] [{action}] {message}\n"
                f.write(formatted)
        return {"success": True, "count": len(data.logs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/frontend", response_class=PlainTextResponse)
@log_operation("获取前端日志")
async def get_frontend_logs(minutes: int = Query(10, ge=1, le=1440)):
    if not os.path.exists(FRONTEND_LOG_FILE):
        return "暂无前端日志"
    try:
        with open(FRONTEND_LOG_FILE, "r", encoding="utf-8") as f:
            total_lines = 0
            recent_lines = deque(maxlen=MAX_LINES)
            for line in f:
                total_lines += 1
                recent_lines.append(line)

        lines_list = list(recent_lines)
        if minutes * 100 < len(lines_list):
            lines_list = lines_list[-minutes * 100:]

        prefix = f"仅显示最近 {len(lines_list)} 行前端日志（共 {total_lines} 行）\n\n"
        return prefix + "".join(lines_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))