from fastapi import APIRouter, HTTPException, Depends
from typing import List
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("", response_model=List[models.PriceResponse])
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
async def create_price(price: models.PriceCreate, current_user: User = Depends(get_current_user)):
    """创建新价格"""
    start = time.time()
    response = database.supabase.table("prices").insert(price.model_dump()).execute()
    print(f"[耗时] POST /prices {time.time()-start:.2f}s", flush=True)
    return response.data[0]


@router.put("/{price_id}", response_model=models.PriceResponse)
async def update_price(price_id: str, price: models.PriceUpdate, current_user: User = Depends(get_current_user)):
    """更新价格"""
    start = time.time()
    update_data = {k: v for k, v in price.model_dump().items() if v is not None}
    response = database.supabase.table("prices").update(update_data).eq("id", price_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Price not found")
    print(f"[耗时] PUT /prices/{price_id} {time.time()-start:.2f}s", flush=True)
    return response.data[0]


@router.delete("/{price_id}")
async def delete_price(price_id: str, current_user: User = Depends(get_current_user)):
    """删除价格"""
    start = time.time()
    response = database.supabase.table("prices").delete().eq("id", price_id).execute()
    print(f"[耗时] DELETE /prices/{price_id} {time.time()-start:.2f}s", flush=True)
    return {"message": "Price deleted"}


@router.post("/upsert")
async def upsert_price(price: models.PriceCreate, current_user: User = Depends(get_current_user)):
    """ upsert 价格（存在则更新，不存在则创建）"""
    start = time.time()
    existing = database.supabase.table("prices").select("id").eq("ingredient_id", price.ingredient_id).eq("shop_id", price.shop_id).maybe_single().execute()
    if existing.data:
        response = database.supabase.table("prices").update({"price": price.price}).eq("id", existing.data["id"]).execute()
        print(f"[耗时] POST /prices/upsert {time.time()-start:.2f}s", flush=True)
        return response.data[0]
    else:
        response = database.supabase.table("prices").insert(price.model_dump()).execute()
        print(f"[耗时] POST /prices/upsert {time.time()-start:.2f}s", flush=True)
        return response.data[0]
