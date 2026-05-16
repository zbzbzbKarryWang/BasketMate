import functools
import inspect
from typing import Any, Callable
from .logger import get_logger

logger = get_logger("basketmate")


def log_operation(operation_name: str, log_args: bool = True, log_result: bool = True):
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            logger.info(f"[{operation_name}] 开始")
            
            if log_args:
                args_info = _extract_args(func, args, kwargs)
                if args_info:
                    logger.info(f"[{operation_name}] 参数: {args_info}")
            
            try:
                result = await func(*args, **kwargs)
                
                if log_result:
                    result_info = _extract_result(result)
                    if result_info:
                        logger.info(f"[{operation_name}] 结果: {result_info}")
                    else:
                        logger.info(f"[{operation_name}] 完成")
                else:
                    logger.info(f"[{operation_name}] 完成")
                    
                return result
            except Exception as e:
                logger.error(f"[{operation_name}] 失败: {str(e)}")
                raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            logger.info(f"[{operation_name}] 开始")
            
            if log_args:
                args_info = _extract_args(func, args, kwargs)
                if args_info:
                    logger.info(f"[{operation_name}] 参数: {args_info}")
            
            try:
                result = func(*args, **kwargs)
                
                if log_result:
                    result_info = _extract_result(result)
                    if result_info:
                        logger.info(f"[{operation_name}] 结果: {result_info}")
                    else:
                        logger.info(f"[{operation_name}] 完成")
                else:
                    logger.info(f"[{operation_name}] 完成")
                    
                return result
            except Exception as e:
                logger.error(f"[{operation_name}] 失败: {str(e)}")
                raise
        
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def _extract_args(func: Callable, args: tuple, kwargs: dict) -> str:
    try:
        sig = inspect.signature(func)
        param_names = list(sig.parameters.keys())
        
        info_parts = []
        
        for i, arg in enumerate(args):
            if i < len(param_names):
                param_name = param_names[i]
                if param_name in ('current_user', 'self'):
                    continue
                info_parts.append(f"{param_name}={_format_value(arg)}")
        
        for key, value in kwargs.items():
            if key in ('current_user', 'self'):
                continue
            info_parts.append(f"{key}={_format_value(value)}")
        
        return ", ".join(info_parts) if info_parts else ""
    except Exception:
        return ""


def _extract_result(result: Any) -> str:
    if result is None:
        return ""
    
    if isinstance(result, dict):
        if "id" in result:
            return f"id={result.get('id')}"
        keys = list(result.keys())[:3]
        return ", ".join([f"{k}={_format_value(result[k])}" for k in keys])
    
    if isinstance(result, list):
        if len(result) == 0:
            return "空列表"
        if len(result) == 1:
            return _extract_result(result[0])
        return f"共{len(result)}条"
    
    if hasattr(result, "data"):
        return _extract_result(result.data)
    
    return str(result)[:100]


def _format_value(value: Any) -> str:
    if value is None:
        return "None"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        if len(value) > 50:
            return f'"{value[:50]}..."'
        return f'"{value}"'
    if isinstance(value, (list, dict)):
        return str(value)[:100]
    if hasattr(value, "__dict__"):
        return str(value.__class__.__name__)
    return str(value)[:50]
