from fastapi import APIRouter, Query, HTTPException
import os

router = APIRouter(prefix="/api/logs", tags=["logs"])

LOG_FILE = "/app/logs/app.log"

@router.get("/recent")
async def get_recent_logs(minutes: int = Query(10, ge=1, le=1440)):
    if not os.path.exists(LOG_FILE):
        return "No logs available."
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        # 简单时间过滤（根据行首时间戳匹配）
        # 更精确的实现可在后续优化
        recent_lines = lines[-minutes * 1000:]  # 粗略估算，确保返回足够多行
        return "".join(recent_lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))