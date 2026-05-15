from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
import time
from datetime import datetime, timedelta
import os
from .routers import ingredients, recipes, plans, prices, shops, shopping
from .logger import get_logger

logger = get_logger("basketmate")

app = FastAPI(
    title="BasketMate API",
    description="BasketMate 后端 API",
    version="1.0.0"
)


@app.middleware("http")
async def log_request_time(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(f'"{request.method} {request.url.path} {response.status_code} {duration_ms}ms"')
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingredients.router)
app.include_router(recipes.router)
app.include_router(plans.router)
app.include_router(prices.router)
app.include_router(shops.router)
app.include_router(shopping.router)


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


@app.get("/api/logs/recent")
async def get_recent_logs(minutes: int = 10):
    """获取最近 N 分钟的日志"""
    log_file = "/logs/app.log"
    if not os.path.exists(log_file):
        return PlainTextResponse("日志文件不存在", media_type="text/plain")
    
    cutoff_time = datetime.now() - timedelta(minutes=minutes)
    logs = []
    
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    log_time_str = line[:19]
                    log_time = datetime.strptime(log_time_str, "%Y-%m-%d %H:%M:%S")
                    if log_time >= cutoff_time:
                        logs.append(line.rstrip("\n"))
                except (ValueError, IndexError):
                    logs.append(line.rstrip("\n"))
    except Exception as e:
        return PlainTextResponse(f"读取日志失败: {str(e)}", media_type="text/plain")
    
    result = "\n".join(logs[-500:])
    return PlainTextResponse(result, media_type="text/plain")


@app.get("/")
async def root():
    return {"message": "BasketMate API", "docs": "/docs"}
