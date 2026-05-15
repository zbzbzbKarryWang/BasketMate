# 测试接口耗时
import time
import urllib.request
import json

BASE_URL = "http://127.0.0.1:8000"

# 定义所有需要测试的端点（根据你的系统实际 API 调整）
ENDPOINTS = [
    # 食材
    ("GET", "/api/ingredients"),
    ("GET", "/api/ingredients?limit=5"),
    ("POST", "/api/ingredients", {"name": "测试食材", "quantity": 0}),
    # 菜谱
    ("GET", "/api/recipes"),
    ("GET", "/api/recipes?limit=5"),
    # 计划
    ("GET", "/api/plans"),
    ("POST", "/api/plans", {
        "date": "2026-12-31",
        "breakfast_recipe_id": None,
        "meal_ids": []
    }),
    # 价格
    ("GET", "/api/prices"),
    # 店铺
    ("GET", "/api/shops"),
    # 采购
    ("GET", "/api/shopping/task"),
    # 日志
    ("GET", "/api/logs/recent?minutes=1"),
    # 健康检查
    ("GET", "/api/health"),
]

def make_request(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header('Content-Type', 'application/json')
    try:
        start = time.time()
        with urllib.request.urlopen(req, timeout=120) as resp:
            elapsed = time.time() - start
            return resp.status, elapsed
    except Exception as e:
        elapsed = time.time() - start
        return str(e), elapsed

if __name__ == "__main__":
    for method, path, *body in ENDPOINTS:
        req_body = body[0] if body else None
        status, elapsed = make_request(method, path, req_body)
        print(f"[{status}] {method} {path} → {elapsed:.2f}s")