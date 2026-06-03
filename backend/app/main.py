from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
import time
from datetime import datetime, timedelta
import os
from . import models as models
from .routers import ingredients, recipes, plans, prices, shops, shopping, logs, import_records, blacklist
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
app.include_router(logs.router)
app.include_router(import_records.router)
app.include_router(blacklist.router)


@app.get("/api/health")
@log_operation("健康检查")
async def health_check():
    """健康检查"""
    return models.ApiResponse.ok({"status": "ok"})


@app.get("/")
@log_operation("根路径")
async def root():
    return models.ApiResponse.ok({"message": "BasketMate API", "docs": "/docs"})
