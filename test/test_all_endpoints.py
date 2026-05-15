import time
import urllib.request
import json

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 60
SLOW_THRESHOLD = 2.0  # 超过2秒视为慢请求

# 所有需要测试的端点（无请求体的请求，body设为 None）
ENDPOINTS = [
    # 食材
    ("GET", "/api/ingredients", None),
    ("GET", "/api/ingredients?limit=5", None),
    ("POST", "/api/ingredients", {"name": "_perf_test_ing", "quantity": 0}),
    # 批量更新占位，稍后填充
    ("POST", "/api/ingredients/batch-update-quantity", None),
    # 菜谱
    ("GET", "/api/recipes", None),
    ("GET", "/api/recipes?limit=5", None),
    # 计划
    ("GET", "/api/plans", None),
    ("POST", "/api/plans", {"date": "2099-12-31", "breakfast_recipe_id": None, "meal_ids": []}),
    # 价格
    ("GET", "/api/prices", None),
    # 店铺
    ("GET", "/api/shops", None),
    # 采购
    ("GET", "/api/shopping/task", None),
    # 健康检查
    ("GET", "/api/health", None),
]

def request(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header('Content-Type', 'application/json')
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            elapsed = time.time() - start
            return resp.status, elapsed
    except Exception as e:
        elapsed = time.time() - start
        return str(e), elapsed

def get_ingredient_ids():
    try:
        with urllib.request.urlopen(f"{BASE_URL}/api/ingredients?limit=10") as resp:
            ingredients = json.loads(resp.read().decode())
            return [ing for ing in ingredients]
    except:
        return []

# 填充批量更新请求体
ingredients = get_ingredient_ids()
batch_body = [{"id": ing["id"], "quantity": ing.get("quantity", 0)} for ing in ingredients[:5]]

# 替换占位的批量更新请求
for i in range(len(ENDPOINTS)):
    method, path, _ = ENDPOINTS[i]
    if "batch-update-quantity" in path:
        ENDPOINTS[i] = (method, path, batch_body)
        break

print("开始全量 API 性能测试...\n")
slow_requests = []
for method, path, body in ENDPOINTS:
    status, elapsed = request(method, path, body)
    print(f"[{status}] {method} {path} → {elapsed:.2f}s")
    if elapsed > SLOW_THRESHOLD:
        slow_requests.append((method, path, elapsed))

# 清理测试计划（删除日期为 2099-12-31 的所有计划）
print("\n清理测试数据...")
try:
    req = urllib.request.Request(f"{BASE_URL}/api/plans?date=2099-12-31", method="GET")
    with urllib.request.urlopen(req) as resp:
        plans = json.loads(resp.read().decode())
        for plan in plans:
            try:
                del_req = urllib.request.Request(f"{BASE_URL}/api/plans/{plan['id']}", method="DELETE")
                urllib.request.urlopen(del_req)
            except:
                pass
except:
    pass

print("\n===== 慢请求汇总 (超过2秒) =====")
if slow_requests:
    for m, p, t in slow_requests:
        print(f"{m} {p} → {t:.2f}s")
else:
    print("所有接口性能正常！")