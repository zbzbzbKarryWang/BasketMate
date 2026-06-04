#!/usr/bin/env python3
"""
测试统一 API 响应格式
测试所有 API 端点是否都返回统一的 {success, message, data} 格式
"""

import time
import urllib.request
import json
from typing import Any, Tuple

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30


def make_request(method: str, path: str, body: Any = None) -> Tuple[int, Any, float]:
    """发送请求并返回状态码、响应体和耗时"""
    url = f"{BASE_URL}{path}"
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header('Content-Type', 'application/json')
    
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            resp_body = resp.read().decode()
            elapsed = time.time() - start
            try:
                parsed = json.loads(resp_body)
            except:
                parsed = resp_body
            return resp.status, parsed, elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start
        try:
            parsed = json.loads(e.read().decode())
        except:
            parsed = None
        return e.code, parsed, elapsed
    except Exception as e:
        elapsed = time.time() - start
        return -1, str(e), elapsed


def validate_response(status: int, body: Any, endpoint: str) -> Tuple[bool, str]:
    """验证响应格式是否符合规范"""
    if isinstance(body, str):
        return False, f"响应不是 JSON: {body[:100]}"
    
    if not isinstance(body, dict):
        return False, f"响应不是对象类型: {type(body)}"
    
    # 检查必要字段
    if "success" not in body:
        return False, "缺少 'success' 字段"
    
    if "message" not in body:
        return False, "缺少 'message' 字段"
    
    if "data" not in body:
        return False, "缺少 'data' 字段"
    
    # 检查 success 类型
    if not isinstance(body["success"], bool):
        return False, f"'success' 应该是布尔类型，实际是: {type(body['success'])}"
    
    # 检查状态码和 success 的一致性
    if 200 <= status < 300:
        if not body["success"]:
            return False, f"状态码 {status} 是成功，但 success=False"
    else:
        if body.get("success", False):
            return False, f"状态码 {status} 是错误，但 success=True"
    
    return True, ""


def test_endpoint(method: str, path: str, body: Any = None) -> dict:
    """测试单个端点"""
    print(f"\n{'='*60}")
    print(f"测试: {method} {path}")
    print(f"{'='*60}")
    
    status, resp_body, elapsed = make_request(method, path, body)
    
    print(f"状态码: {status}")
    print(f"耗时: {elapsed:.2f}s")
    print(f"完整响应:")
    print(json.dumps(resp_body, ensure_ascii=False, indent=4))
    
    is_valid, error_msg = validate_response(status, resp_body, path)
    
    if is_valid:
        print(f"✅ 格式验证通过")
    else:
        print(f"❌ 格式验证失败: {error_msg}")
    
    return {
        "method": method,
        "path": path,
        "status": status,
        "is_valid": is_valid,
        "error_msg": error_msg,
        "elapsed": elapsed
    }


def main():
    print("="*80)
    print("BasketMate 统一 API 格式测试")
    print("="*80)
    
    # 测试端点列表
    endpoints = [
        # 根路径和健康检查
        ("GET", "/", None),
        ("GET", "/api/health", None),
        
        # 食材
        ("GET", "/api/ingredients", None),
        ("POST", "/api/ingredients", {"name": "测试食材临时", "quantity": 0}),
        
        # 菜谱
        ("GET", "/api/recipes", None),
        
        # 计划
        ("GET", "/api/plans", None),
        ("POST", "/api/plans", {"date": "2099-12-31", "breakfast_recipe_id": None, "meal_ids": []}),
        
        # 价格和店铺
        ("GET", "/api/prices", None),
        ("GET", "/api/shops", None),
        
        # 采购任务
        ("GET", "/api/shopping/task", None),
        
        # 用户画像
        ("GET", "/api/user/profile", None),
        
        # 黑名单
        ("GET", "/api/blacklist", None),
        
        # 导入记录
        ("GET", "/api/import/records", None),
        
        # 测试参数验证错误
        ("POST", "/api/ingredients", {"invalid_field": "test"}),
    ]
    
    results = []
    for method, path, body in endpoints:
        result = test_endpoint(method, path, body)
        results.append(result)
        time.sleep(0.2)  # 避免请求过快
    
    # 输出汇总
    print("\n" + "="*80)
    print("测试汇总")
    print("="*80)
    
    success_count = sum(1 for r in results if r["is_valid"])
    total_count = len(results)
    
    print(f"\n总测试数: {total_count}")
    print(f"✅ 通过: {success_count}")
    print(f"❌ 失败: {total_count - success_count}")
    
    if success_count == total_count:
        print("\n🎉 所有端点都通过格式验证！")
    else:
        print("\n❌ 以下端点验证失败:")
        for r in results:
            if not r["is_valid"]:
                print(f"  - {r['method']} {r['path']}: {r['error_msg']}")
    
    return 0 if success_count == total_count else 1


if __name__ == "__main__":
    exit(main())
