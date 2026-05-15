from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from datetime import datetime
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..services import shopping_service

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


@router.get("/task", response_model=models.PurchaseTaskResponse)
async def get_active_task(current_user: User = Depends(get_current_user)):
    """获取当前活跃的采购任务"""
    start = time.time()
    response = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    print(f"[耗时] GET /shopping/task {time.time()-start:.2f}s", flush=True)
    if not response.data:
        return {
            "id": "",
            "status": "active",
            "pending_items": [],
            "custom_items": [],
            "removed_ingredient_ids": []
        }
    return response.data


@router.post("/task/refresh")
async def refresh_purchase_task(request: models.RefreshRequest = None, current_user: User = Depends(get_current_user)):
    """重新计算并保存采购任务"""
    import time
    start = time.time()
    blacklist = request.locally_removed_ids if request else []
    
    t1 = time.time()
    ing_rows = database.supabase.table("ingredients").select("id, name, quantity").execute()
    inventory = ing_rows.data or []
    print(f"[采购刷新-shopping] 查询食材 {len(inventory)} 条: {time.time()-t1:.2f}s", flush=True)
    
    t2 = time.time()
    recipe_rows = database.supabase.table("recipes").select("id, ingredients").execute()
    recipe_map = {row["id"]: row for row in (recipe_rows.data or [])}
    print(f"[采购刷新-shopping] 查询菜谱 {len(recipe_map)} 条: {time.time()-t2:.2f}s", flush=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    t3 = time.time()
    plan_rows = database.supabase.table("plans").select("id, date, breakfast_recipe_id, meal_ids").gte("date", today).execute()
    print(f"[采购刷新-shopping] 查询计划: {time.time()-t3:.2f}s", flush=True)
    
    t4 = time.time()
    price_rows = database.supabase.table("prices").select("id, ingredient_id, shop_id, price").execute()
    prices = price_rows.data or []
    print(f"[采购刷新-shopping] 查询价格 {len(prices)} 条: {time.time()-t4:.2f}s", flush=True)
    
    t5 = time.time()
    pending_items = shopping_service.compute_pending_items(
        inventory=inventory,
        recipe_map=recipe_map,
        plan_rows=(plan_rows.data or []),
        prices=prices,
        blacklist=blacklist
    )
    print(f"[采购刷新-shopping] 计算待购项: {time.time()-t5:.2f}s", flush=True)
    
    t6 = time.time()
    try:
        database.supabase.table("shopping_list").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except:
        pass
    
    if pending_items:
        items_to_insert = [{"ingredient_id": p.get("ingredient_id"), "need_quantity": p.get("need_quantity", 1), "ingredient_name": p.get("name", ""), "shop_name": p.get("shop_name", "待定")} for p in pending_items]
        try:
            database.supabase.table("shopping_list").insert(items_to_insert).execute()
        except:
            pass
    print(f"[采购刷新-shopping] 更新购物清单: {time.time()-t6:.2f}s", flush=True)
    
    print(f"[耗时] POST /shopping/task/refresh 总耗时: {time.time()-start:.2f}s", flush=True)
    return {"pending_items": pending_items}


@router.post("/task/add")
async def add_to_task(ingredient_id: str, current_user: User = Depends(get_current_user)):
    """添加食材到采购任务"""
    start = time.time()
    task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    
    if not task.data:
        database.supabase.table("purchase_tasks").insert({
            "status": "active",
            "pending_items": [],
            "custom_items": [],
            "removed_ingredient_ids": []
        }).execute()
        task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    
    custom_items = task.data.get("custom_items", [])
    ing = database.supabase.table("ingredients").select("*").eq("id", ingredient_id).single().execute()
    if ing.data:
        custom_items.append({
            "id": f"custom-{len(custom_items)}",
            "name": ing.data["name"],
            "need_quantity": 1,
            "shop_name": None,
            "checked": False
        })
        database.supabase.table("purchase_tasks").update({"custom_items": custom_items}).eq("id", task.data["id"]).execute()
    
    print(f"[耗时] POST /shopping/task/add {time.time()-start:.2f}s", flush=True)
    return {"message": "Added to task"}


@router.post("/task/complete")
async def complete_purchase(request: models.CompletePurchaseRequest, current_user: User = Depends(get_current_user)):
    """完成采购"""
    start = time.time()
    shopping_service.update_inventory_on_purchase(
        database.supabase,
        request.pending_items
    )
    
    task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    if task.data:
        purchased_ids = {item.ingredient_id for item in request.pending_items}
        updated_pending = [p for p in task.data.get("pending_items", []) if p.get("ingredient_id") not in purchased_ids]
        
        custom_ids = {item.id for item in request.custom_items if item.checked}
        updated_custom = [c for c in task.data.get("custom_items", []) if c.get("id") not in custom_ids]
        
        removed_ids = list(set(task.data.get("removed_ingredient_ids", []) + request.locally_removed_ids))
        
        database.supabase.table("purchase_tasks").update({
            "pending_items": updated_pending,
            "custom_items": updated_custom,
            "removed_ingredient_ids": removed_ids
        }).eq("id", task.data["id"]).execute()
    
    print(f"[耗时] POST /shopping/task/complete {time.time()-start:.2f}s", flush=True)
    return {"message": "Purchase completed"}


@router.post("/task/clear")
async def clear_task(pending_items: List[dict], custom_items: List[dict], current_user: User = Depends(get_current_user)):
    """清空采购任务"""
    start = time.time()
    task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    if task.data:
        database.supabase.table("purchase_tasks").update({
            "pending_items": [],
            "custom_items": [],
            "removed_ingredient_ids": []
        }).eq("id", task.data["id"]).execute()
    
    return {"message": "Task cleared"}
