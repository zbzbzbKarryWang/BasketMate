from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
import time
from datetime import datetime, timedelta
import os
from .routers import ingredients, recipes, plans, prices, shops, shopping
from .logger import get_logger
from .decorators import log_operation

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
    
    status_code = response.status_code
    log_message = f'"{request.method} {request.url.path} {status_code} {duration_ms}ms"'
    
    if status_code >= 500:
        logger.error(log_message)
    elif status_code >= 400:
        logger.warning(log_message)
    else:
        logger.info(log_message)
    
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
@log_operation("健康检查")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


@app.get("/api/logs/recent")
@log_operation("获取最近日志")
async def get_recent_logs(minutes: int = 10, start_time: str = None, end_time: str = None):
    """获取最近 N 分钟的日志，或指定时间范围内的日志"""
    log_file = "/logs/app.log"
    if not os.path.exists(log_file):
        return PlainTextResponse("日志文件不存在", media_type="text/plain")
    
    now = datetime.now()
    cutoff_start = None
    cutoff_end = None
    
    if start_time:
        try:
            cutoff_start = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            try:
                cutoff_start = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                try:
                    cutoff_start = datetime.strptime(start_time, "%Y-%m-%d %H:%M")
                except ValueError:
                    try:
                        parsed = datetime.strptime(start_time, "%m-%d %H:%M:%S.%f")
                        cutoff_start = parsed.replace(year=now.year)
                    except ValueError:
                        try:
                            parsed = datetime.strptime(start_time, "%m-%d %H:%M:%S")
                            cutoff_start = parsed.replace(year=now.year)
                        except ValueError:
                            try:
                                parsed = datetime.strptime(start_time, "%m-%d %H:%M")
                                cutoff_start = parsed.replace(year=now.year)
                            except ValueError:
                                cutoff_start = now - timedelta(minutes=minutes)
    else:
        cutoff_start = now - timedelta(minutes=minutes)
    
    if end_time:
        try:
            cutoff_end = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            try:
                cutoff_end = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                try:
                    cutoff_end = datetime.strptime(end_time, "%Y-%m-%d %H:%M")
                except ValueError:
                    try:
                        parsed = datetime.strptime(end_time, "%m-%d %H:%M:%S.%f")
                        cutoff_end = parsed.replace(year=now.year)
                    except ValueError:
                        try:
                            parsed = datetime.strptime(end_time, "%m-%d %H:%M:%S")
                            cutoff_end = parsed.replace(year=now.year)
                        except ValueError:
                            try:
                                parsed = datetime.strptime(end_time, "%m-%d %H:%M")
                                cutoff_end = parsed.replace(year=now.year)
                            except ValueError:
                                cutoff_end = now
    
    logs = []
    
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    log_time_str = line[:23]
                    log_time = datetime.strptime(log_time_str, "%Y-%m-%d %H:%M:%S.%f")
                    if cutoff_start and log_time < cutoff_start:
                        continue
                    if cutoff_end and log_time > cutoff_end:
                        continue
                    logs.append(line.rstrip("\n"))
                except (ValueError, IndexError):
                    try:
                        log_time_str = line[:19]
                        log_time = datetime.strptime(log_time_str, "%Y-%m-%d %H:%M:%S")
                        if cutoff_start and log_time < cutoff_start:
                            continue
                        if cutoff_end and log_time > cutoff_end:
                            continue
                        logs.append(line.rstrip("\n"))
                    except (ValueError, IndexError):
                        logs.append(line.rstrip("\n"))
    except Exception as e:
        return PlainTextResponse(f"读取日志失败: {str(e)}", media_type="text/plain")
    
    result = "\n".join(logs[-500:])
    return PlainTextResponse(result, media_type="text/plain")


@app.get("/")
@log_operation("根路径")
async def root():
    return {"message": "BasketMate API", "docs": "/docs"}
