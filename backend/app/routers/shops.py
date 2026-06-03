from fastapi import APIRouter, HTTPException, Depends
from typing import List
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..decorators import log_operation
from ..logger import get_logger

logger = get_logger("basketmate")

router = APIRouter(prefix="/api/shops", tags=["shops"])


@router.get("", response_model=models.ApiResponse[List[models.ShopResponse]])
@log_operation("获取店铺列表")
async def get_shops(current_user: User = Depends(get_current_user)):
    """获取所有店铺"""
    start = time.time()
    response = database.supabase.table("shops").select("*").order("name").execute()
    print(f"[耗时] GET /shops {time.time()-start:.2f}s", flush=True)
    return models.ApiResponse.ok(response.data or [])


@router.get("/{shop_id}", response_model=models.ApiResponse[models.ShopResponse])
@log_operation("获取店铺详情")
async def get_shop(shop_id: str, current_user: User = Depends(get_current_user)):
    """获取单个店铺"""
    start = time.time()
    response = database.supabase.table("shops").select("*").eq("id", shop_id).single().execute()
    if not response.data:
        return models.ApiResponse.fail("店铺不存在")
    print(f"[耗时] GET /shops/{shop_id} {time.time()-start:.2f}s", flush=True)
    return models.ApiResponse.ok(response.data)


@router.post("", response_model=models.ApiResponse[models.ShopResponse])
@log_operation("创建店铺")
async def create_shop(shop: models.ShopCreate, current_user: User = Depends(get_current_user)):
    """创建新店铺"""
    start = time.time()
    try:
        response = database.supabase.table("shops").insert(shop.model_dump()).execute()
        print(f"[耗时] POST /shops {time.time()-start:.2f}s", flush=True)
        if response and response.data and len(response.data) > 0:
            return models.ApiResponse.ok(response.data[0])
        return models.ApiResponse.fail("创建店铺失败")
    except Exception as e:
        logger.error(f"[创建店铺] 失败: 参数=name={shop.name}, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("创建店铺失败")


@router.put("/{shop_id}", response_model=models.ApiResponse[models.ShopResponse])
@log_operation("更新店铺")
async def update_shop(shop_id: str, shop: models.ShopUpdate, current_user: User = Depends(get_current_user)):
    """更新店铺"""
    start = time.time()
    try:
        update_data = {k: v for k, v in shop.model_dump().items() if v is not None}
        response = database.supabase.table("shops").update(update_data).eq("id", shop_id).execute()
        if not response.data:
            return models.ApiResponse.fail("店铺不存在")
        print(f"[耗时] PUT /shops/{shop_id} {time.time()-start:.2f}s", flush=True)
        return models.ApiResponse.ok(response.data[0])
    except Exception as e:
        logger.error(f"[更新店铺] 失败: 参数=shop_id={shop_id}, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("更新店铺失败")


@router.delete("/{shop_id}", response_model=models.ApiResponse[dict])
@log_operation("删除店铺")
async def delete_shop(shop_id: str, current_user: User = Depends(get_current_user)):
    """删除店铺（原子性操作）"""
    start = time.time()
    
    try:
        # 调用原子性函数（返回 void）
        database.supabase.rpc("delete_shop_cascade", {
            "p_shop_id": shop_id
        }).execute()
        
        # 成功，不检查返回值
        print(f"[耗时] DELETE /shops/{shop_id} {time.time()-start:.2f}s", flush=True)
        logger.info(f"[删除店铺] 成功，shop_id={shop_id}")
        return models.ApiResponse.ok({"message": "店铺已删除"})
        
    except Exception as e:
        logger.error(f"[删除店铺] 失败: 参数=shop_id={shop_id}, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("删除店铺失败")
