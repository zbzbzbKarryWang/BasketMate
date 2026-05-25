from fastapi import APIRouter, HTTPException, Depends
from typing import List
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..decorators import log_operation
from ..logger import get_logger

logger = get_logger("basketmate")

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("", response_model=List[models.PriceResponse])
@log_operation("获取价格列表")
async def get_prices(current_user: User = Depends(get_current_user)):
    """获取所有价格"""
    start = time.time()
    response = database.supabase.table("prices").select("*, shops(name)").execute()
    print(f"[耗时] GET /prices {time.time()-start:.2f}s", flush=True)
    return [
        {
            **item,
            "shop_name": item.get("shops", {}).get("name") if isinstance(item.get("shops"), dict) else None
        }
        for item in (response.data or [])
    ]


@router.get("/{price_id}", response_model=models.PriceResponse)
@log_operation("获取价格详情")
async def get_price(price_id: str, current_user: User = Depends(get_current_user)):
    """获取单个价格"""
    start = time.time()
    response = database.supabase.table("prices").select("*, shops(name)").eq("id", price_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Price not found")
    data = response.data
    data["shop_name"] = data.get("shops", {}).get("name") if isinstance(data.get("shops"), dict) else None
    print(f"[耗时] GET /prices/{price_id} {time.time()-start:.2f}s", flush=True)
    return data


@router.post("", response_model=models.PriceResponse)
@log_operation("创建价格")
async def create_price(price: models.PriceCreate, current_user: User = Depends(get_current_user)):
    """创建新价格（使用 upsert 逻辑）"""
    start = time.time()
    
    try:
        # 使用 upsert RPC 函数统一处理创建和更新
        result = database.supabase.rpc("upsert_price_with_refresh", {
            "p_ingredient_id": price.ingredient_id,
            "p_shop_id": price.shop_id,
            "p_price": price.price
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="创建价格失败")
        
        logger.info(f"[创建价格] 成功，ingredient={price.ingredient_id}, triggered_refresh={result.data[0].get('triggered_refresh')}")
        print(f"[耗时] POST /prices {time.time()-start:.2f}s", flush=True)
        
        # 返回创建的价格记录
        response = database.supabase.table("prices").select("*, shops(name)").eq("ingredient_id", price.ingredient_id).eq("shop_id", price.shop_id).maybe_single().execute()
        if response and response.data:
            data = response.data
            data["shop_name"] = data.get("shops", {}).get("name") if isinstance(data.get("shops"), dict) else None
            return data
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[创建价格] 失败: 参数=ingredient_id={price.ingredient_id},shop_id={price.shop_id},price={price.price}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="创建价格失败")


@router.put("/{price_id}", response_model=models.PriceResponse)
@log_operation("更新价格")
async def update_price(price_id: str, price: models.PriceUpdate, current_user: User = Depends(get_current_user)):
    """更新价格（联动更新采购清单）"""
    start = time.time()
    
    # 获取原价格信息（需要 ingredient_id 和 shop_id）
    existing = database.supabase.table("prices").select("ingredient_id, shop_id").eq("id", price_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Price not found")
    
    update_data = {k: v for k, v in price.model_dump().items() if v is not None}
    
    # 如果没有更新价格，直接更新其他字段
    if "price" not in update_data:
        try:
            response = database.supabase.table("prices").update(update_data).eq("id", price_id).execute()
            if not response.data:
                raise HTTPException(status_code=404, detail="Price not found")
            print(f"[耗时] PUT /prices/{price_id} {time.time()-start:.2f}s", flush=True)
            return response.data[0]
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[更新价格] 失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"更新价格失败: {str(e)}")
    
    try:
        # 如果更新了价格，使用 RPC 函数（包含联动更新采购清单逻辑）
        result = database.supabase.rpc("upsert_price_with_refresh", {
            "p_ingredient_id": existing.data["ingredient_id"],
            "p_shop_id": existing.data["shop_id"],
            "p_price": update_data["price"]
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="更新价格失败")
        
        logger.info(f"[更新价格] 联动更新采购清单，ingredient={existing.data['ingredient_id']}, triggered_refresh={result.data[0].get('triggered_refresh')}, affected={result.data[0].get('updated_count')}")
        print(f"[耗时] PUT /prices/{price_id} {time.time()-start:.2f}s", flush=True)
        
        # 返回更新后的价格记录
        response = database.supabase.table("prices").select("*, shops(name)").eq("id", price_id).maybe_single().execute()
        if response and response.data:
            data = response.data
            data["shop_name"] = data.get("shops", {}).get("name") if isinstance(data.get("shops"), dict) else None
            return data
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[更新价格] 失败: 参数=price_id={price_id},new_price={update_data.get('price')}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="更新价格失败")


@router.delete("/{price_id}")
@log_operation("删除价格")
async def delete_price(price_id: str, current_user: User = Depends(get_current_user)):
    """删除价格（原子性操作）"""
    start = time.time()
    
    try:
        # 调用原子性函数
        result = database.supabase.rpc("delete_price_with_refresh", {
            "p_price_id": price_id
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="删除价格失败")
        
        logger.info(f"[删除价格] 成功，ingredient={result.data[0].get('ingredient_id')}, 更新采购项={result.data[0].get('updated_count')}")
        print(f"[耗时] DELETE /prices/{price_id} {time.time()-start:.2f}s", flush=True)
        return {"message": "Price deleted", "details": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[删除价格] 失败: 参数=price_id={price_id}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="删除价格失败")


@router.post("/upsert")
@log_operation("Upsert价格")
async def upsert_price(price: models.PriceCreate, current_user: User = Depends(get_current_user)):
    """upsert 价格（原子性操作）"""
    start = time.time()
    
    try:
        # 调用原子性函数
        result = database.supabase.rpc("upsert_price_with_refresh", {
            "p_ingredient_id": price.ingredient_id,
            "p_shop_id": price.shop_id,
            "p_price": price.price
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="Upsert价格失败")
        
        logger.info(f"[Upsert价格] 成功，ingredient={price.ingredient_id}, min_price={result.data[0].get('min_price')}")
        print(f"[耗时] POST /prices/upsert {time.time()-start:.2f}s", flush=True)
        
        # 返回更新后的价格记录
        response = database.supabase.table("prices").select("*, shops(name)").eq("ingredient_id", price.ingredient_id).eq("shop_id", price.shop_id).maybe_single().execute()
        if response and response.data:
            data = response.data
            data["shop_name"] = data.get("shops", {}).get("name") if isinstance(data.get("shops"), dict) else None
            return data
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Upsert价格] 失败: 参数=ingredient_id={price.ingredient_id},shop_id={price.shop_id},price={price.price}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Upsert价格失败")
