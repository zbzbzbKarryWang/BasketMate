import os
import asyncio
import aiohttp
import json

async def test():
    print("=" * 60)
    print("环境变量检查")
    print("=" * 60)
    
    baidu_key = os.environ.get("BAIDU_OCR_API_KEY", "")
    baidu_secret = os.environ.get("BAIDU_OCR_SECRET_KEY", "")
    llm_url = os.environ.get("LLM_API_URL", "")
    llm_key = os.environ.get("LLM_API_KEY", "")
    
    print(f"BAIDU_OCR_API_KEY: {baidu_key[:15] + '...' if baidu_key else '未配置'}")
    print(f"BAIDU_OCR_SECRET_KEY: {baidu_secret[:15] + '...' if baidu_secret else '未配置'}")
    print(f"LLM_API_URL: {llm_url if llm_url else '未配置'}")
    print(f"LLM_API_KEY: {llm_key[:15] + '...' if llm_key else '未配置'}")
    
    print("\n" + "=" * 60)
    print("测试 1: 获取百度 OCR Access Token")
    print("=" * 60)
    
    if not baidu_key or not baidu_secret:
        print("❌ 未配置百度 OCR API Key")
        return
    
    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": baidu_key,
        "client_secret": baidu_secret,
    }
    
    access_token = None
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=params) as response:
                print(f"响应状态码: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    access_token = result.get("access_token")
                    if access_token:
                        print(f"✅ 成功获取 Access Token: {access_token[:30]}...")
                    else:
                        print(f"❌ 响应中没有 access_token: {result}")
                else:
                    text = await response.text()
                    print(f"❌ 获取失败: {text}")
    except Exception as e:
        print(f"❌ 异常: {e}")
    
    print("\n" + "=" * 60)
    print("测试 2: 百度 OCR 图片识别")
    print("=" * 60)
    
    if access_token:
        test_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQAWj2BYKgAAAABJRU5ErkJggg=="
        ocr_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={access_token}"
        data = {"image": test_image, "language_type": "CHN_ENG"}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(ocr_url, data=data) as response:
                    print(f"响应状态码: {response.status}")
                    if response.status == 200:
                        result = await response.json()
                        print(f"✅ OCR API 调用成功")
                        print(f"响应: {json.dumps(result, ensure_ascii=False, indent=2)}")
                    else:
                        text = await response.text()
                        print(f"❌ OCR 调用失败: {text}")
        except Exception as e:
            print(f"❌ 异常: {e}")
    else:
        print("❌ 跳过：没有有效的 Access Token")
    
    print("\n" + "=" * 60)
    print("测试 3: LLM API 调用")
    print("=" * 60)
    
    if not llm_url:
        print("❌ 未配置 LLM_API_URL")
        return
    
    headers = {"Content-Type": "application/json"}
    if llm_key:
        headers["Authorization"] = f"Bearer {llm_key}"
    
    payload = {
        "model": "deepseek-v4-flash",
        "messages": [
            {"role": "system", "content": "你是测试助手。"},
            {"role": "user", "content": "请回复'测试成功'"},
        ],
        "temperature": 0.1,
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(llm_url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
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
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test())
