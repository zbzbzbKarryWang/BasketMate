"""
测试百度 OCR API 和 LLM API 是否配置正确
"""
import os
import asyncio
import aiohttp
import json
from pathlib import Path

# 从 .env 文件加载环境变量
def load_env():
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()

load_env()

# 获取配置
BAIDU_OCR_API_KEY = os.environ.get("BAIDU_OCR_API_KEY", "")
BAIDU_OCR_SECRET_KEY = os.environ.get("BAIDU_OCR_SECRET_KEY", "")
LLM_API_URL = os.environ.get("LLM_API_URL", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")


async def test_baidu_access_token():
    """测试获取百度 OCR Access Token"""
    print("\n" + "="*60)
    print("测试 1: 获取百度 OCR Access Token")
    print("="*60)
    
    if not BAIDU_OCR_API_KEY or not BAIDU_OCR_SECRET_KEY:
        print("❌ 错误：未配置 BAIDU_OCR_API_KEY 或 BAIDU_OCR_SECRET_KEY")
        return None
    
    print(f"API Key: {BAIDU_OCR_API_KEY[:10]}...")
    print(f"Secret Key: {BAIDU_OCR_SECRET_KEY[:10]}...")
    
    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": BAIDU_OCR_API_KEY,
        "client_secret": BAIDU_OCR_SECRET_KEY,
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=params) as response:
                print(f"响应状态码: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    access_token = result.get("access_token")
                    if access_token:
                        print(f"✅ 成功获取 Access Token: {access_token[:20]}...")
                        return access_token
                    else:
                        print(f"❌ 响应中没有 access_token: {result}")
                        return None
                else:
                    text = await response.text()
                    print(f"❌ 获取失败: {text}")
                    return None
    except Exception as e:
        print(f"❌ 异常: {e}")
        return None


async def test_baidu_ocr(access_token: str):
    """测试百度 OCR 识别"""
    print("\n" + "="*60)
    print("测试 2: 百度 OCR 图片识别")
    print("="*60)
    
    if not access_token:
        print("❌ 跳过：没有有效的 Access Token")
        return
    
    # 使用一个简单的测试图片（1x1像素的白色PNG）
    test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQAWj2BYKgAAAABJRU5ErkJggg=="
    
    url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={access_token}"
    data = {
        "image": test_image_base64,
        "language_type": "CHN_ENG",
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=data) as response:
                print(f"响应状态码: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ OCR API 调用成功")
                    print(f"响应内容: {json.dumps(result, ensure_ascii=False, indent=2)}")
                else:
                    text = await response.text()
                    print(f"❌ OCR 调用失败: {text}")
    except Exception as e:
        print(f"❌ 异常: {e}")


async def test_llm_api():
    """测试 LLM API"""
    print("\n" + "="*60)
    print("测试 3: LLM API 调用")
    print("="*60)
    
    if not LLM_API_URL:
        print("❌ 错误：未配置 LLM_API_URL")
        return
    
    print(f"LLM API URL: {LLM_API_URL}")
    print(f"LLM API Key: {LLM_API_KEY[:10]}..." if LLM_API_KEY else "未配置 API Key")
    
    headers = {
        "Content-Type": "application/json",
    }
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    
    payload = {
        "model": "gpt-4",
        "messages": [
            {"role": "system", "content": "你是测试助手。"},
            {"role": "user", "content": "请回复'测试成功'"},
        ],
        "temperature": 0.1,
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(LLM_API_URL, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
                print(f"响应状态码: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    print(f"✅ LLM API 调用成功")
                    print(f"响应内容: {content}")
                else:
                    text = await response.text()
                    print(f"❌ LLM 调用失败: {text}")
    except asyncio.TimeoutError:
        print(f"❌ 超时：LLM API 响应超过30秒")
    except Exception as e:
        print(f"❌ 异常: {e}")


async def main():
    print("\n" + "="*60)
    print("开始测试百度 OCR API 和 LLM API")
    print("="*60)
    
    print("\n配置信息：")
    print(f"  BAIDU_OCR_API_KEY: {'已配置' if BAIDU_OCR_API_KEY else '未配置'}")
    print(f"  BAIDU_OCR_SECRET_KEY: {'已配置' if BAIDU_OCR_SECRET_KEY else '未配置'}")
    print(f"  LLM_API_URL: {LLM_API_URL if LLM_API_URL else '未配置'}")
    print(f"  LLM_API_KEY: {'已配置' if LLM_API_KEY else '未配置'}")
    
    # 测试百度 OCR
    access_token = await test_baidu_access_token()
    await test_baidu_ocr(access_token)
    
    # 测试 LLM
    await test_llm_api()
    
    print("\n" + "="*60)
    print("测试完成")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
