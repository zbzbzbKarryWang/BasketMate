from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.exceptions import RequestValidationError
import time
from datetime import datetime, timedelta
import os
from . import models as models
from .routers import ingredients, recipes, plans, prices, shops, shopping, logs, import_records, blacklist, user_profile, ai_chat
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
app.include_router(user_profile.router)
# ai_tools 是工具定义模块，不是路由，无需 include_router
# app.include_router(ai_tools.router)
app.include_router(ai_chat.router)


@app.get("/api/health")
@log_operation("健康检查")
async def health_check():
    """健康检查"""
    return models.ApiResponse.ok({"status": "ok"})


@app.get("/")
@log_operation("根路径")
async def root():
    return models.ApiResponse.ok({"message": "BasketMate API", "docs": "/docs"})


# ========== 统一异常处理器 ==========
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """处理参数验证异常"""
    logger.warning(f"[validation_error] {request.method} {request.url.path} - {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content=models.ApiResponse.fail(
            message="请求参数错误",
            data={"errors": exc.errors()}
        ).dict()
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """处理 HTTP 异常"""
    log_level = logger.error if exc.status_code >= 500 else logger.warning
    log_level(f"[http_exception] {request.method} {request.url.path} - {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content=models.ApiResponse.fail(message=str(exc.detail)).dict()
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """处理所有未捕获异常"""
    logger.error(f"[unhandled_exception] {request.method} {request.url.path} - {type(exc).__name__}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=models.ApiResponse.fail(message="服务器内部错误").dict()
    )
