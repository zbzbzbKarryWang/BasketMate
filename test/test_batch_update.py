# 测试 /api/proxy/ingredients/batch-update-quantity
import time
import urllib.request
import json

BASE_URL = "http://127.0.0.1:8000"

# 1. 先获取一些食材 ID（不修改数据，只用于构造请求）
print("正在获取食材列表...")
try:
    with urllib.request.urlopen(f"{BASE_URL}/api/ingredients?limit=10") as resp:
        ingredients = json.loads(resp.read().decode())
except Exception as e:
    print(f"获取食材失败: {e}")
    exit(1)

if not ingredients:
    print("数据库中没有食材，无法测试")
    exit(1)

# 2. 构造批量更新请求（使用真实 ID，但数量设为原始数量，实际不改变数据）
batch_payload = []
for ing in ingredients[:5]:  # 只取前5个食材测试
    batch_payload.append({
        "id": ing["id"],
        "quantity": ing.get("quantity", 0)  # 保持原数量不变
    })

# 3. 发送 POST 请求到 batch-update-quantity
url = f"{BASE_URL}/api/ingredients/batch-update-quantity"
data = json.dumps(batch_payload).encode('utf-8')
req = urllib.request.Request(url, method="POST", data=data)
req.add_header('Content-Type', 'application/json')

print(f"正在测试批量更新 {len(batch_payload)} 条食材...")
start = time.time()
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        elapsed = time.time() - start
        print(f"[{resp.status}] 耗时: {elapsed:.2f}s")
        result = json.loads(resp.read().decode())
        print(f"更新结果: {result}")
except Exception as e:
    elapsed = time.time() - start
    print(f"[ERR] 请求失败，耗时: {elapsed:.2f}s")
    print(f"错误: {e}")