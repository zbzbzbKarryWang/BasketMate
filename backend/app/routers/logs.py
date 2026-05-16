from fastapi import APIRouter, Query, HTTPException
import os
from ..decorators import log_operation

router = APIRouter(prefix="/api/logs", tags=["logs"])

LOG_FILE = "/app/logs/app.log"

@router.get("/recent")
@log_operation("获取最近日志")
async def get_recent_logs(minutes: int = Query(10, ge=1, le=1440)):
    if not os.path.exists(LOG_FILE):
        return "No logs available."
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        recent_lines = lines[-minutes * 1000:]
        return "".join(recent_lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
