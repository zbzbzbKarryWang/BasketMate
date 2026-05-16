from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from datetime import datetime
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..services import shopping_service
from ..decorators import log_operation
from ..logger import get_logger
from ..routers.plans import refresh_purchase_task as do_refresh

logger = get_logger("basketmate")

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


@router.get("/task", response_model=models.PurchaseTaskResponse)
@log_operation("获取采购任务")
async def get_active_task(current_user: User = Depends(get_current_user)):
    """获取当前活跃的采购任务（自动刷新）"""
    start = time.time()
    
    do_refresh()
    
    response = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    logger.info(f"[获取采购任务] 已刷新，待购项数量: {len(response.data.get('pending_items', []) if response and response.data else [])}")
    print(f"[耗时] GET /shopping/task {time.time()-start:.2f}s", flush=True)
    if not response or not response.data:
        return {
            "id": "",
            "status": "active",
            "pending_items": [],
            "custom_items": [],
            "removed_ingredient_ids": []
        }
    return response.data


@router.post("/task/refresh")
@log_operation("刷新采购清单")
async def refresh_purchase_task(request: models.RefreshRequest = None, current_user: User = Depends(get_current_user)):
    """重新计算并保存采购任务"""
    import time
    start = time.time()
    blacklist = request.locally_removed_ids if request else []
    
    t1 = time.time()
    ing_rows = database.supabase.table("ingredients").select("id, name, quantity").execute()
    inventory = ing_rows.data or []
    logger.info(f"[shopping] 库存数量: {len(inventory)}")
    for inv in inventory[:5]:
        logger.info(f"[shopping] 库存: id={inv.get('id')}, name={inv.get('name')}, qty={inv.get('quantity')}")
    print(f"[采购刷新-shopping] 查询食材 {len(inventory)} 条: {time.time()-t1:.2f}s", flush=True)
    
    t2 = time.time()
    recipe_rows = database.supabase.table("recipes").select("id, ingredients").execute()
    recipe_map = {row["id"]: row for row in (recipe_rows.data or [])}
    logger.info(f"[shopping] 菜谱数量: {len(recipe_map)}")
    for rid, r in recipe_map.items():
        ings = r.get("ingredients") or []
        logger.info(f"[shopping] 菜谱rid={rid}, 食材数={len(ings)}: {ings[:3]}")  # 只打印前3个
    print(f"[采购刷新-shopping] 查询菜谱 {len(recipe_map)} 条: {time.time()-t2:.2f}s", flush=True)
    
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    t3 = time.time()
    plan_rows = database.supabase.table("plans").select("id, date, breakfast_recipe_id, meal_ids").execute()
    logger.info(f"[shopping] 查询所有未删除计划，查询到 {len(plan_rows.data or [])} 条计划")
    for p in (plan_rows.data or []):
        logger.info(f"[shopping] 计划: id={p.get('id')}, date={p.get('date')}, breakfast={p.get('breakfast_recipe_id')}, meals={p.get('meal_ids')}")
    print(f"[采购刷新-shopping] 查询计划: {time.time()-t3:.2f}s", flush=True)
    
    t4 = time.time()
    price_rows = database.supabase.table("prices").select("id, ingredient_id, shop_id, price").execute()
    prices = price_rows.data or []
    print(f"[采购刷新-shopping] 查询价格 {len(prices)} 条: {time.time()-t4:.2f}s", flush=True)
    
    t5 = time.time()
    logger.info(f"[shopping refresh] 调用compute_pending_items: plan_rows数量={len(plan_rows.data or [])}, inventory数量={len(inventory)}, recipe_map数量={len(recipe_map)}, blacklist={blacklist}, today={today}")
    pending_items = shopping_service.compute_pending_items(
        inventory=inventory,
        recipe_map=recipe_map,
        plan_rows=(plan_rows.data or []),
        prices=prices,
        blacklist=blacklist,
        today=today
    )
    print(f"[采购刷新-shopping] 计算待购项: {time.time()-t5:.2f}s", flush=True)
    
    logger.info(f"[采购刷新] 最终待购项数量: {len(pending_items)}")
    if pending_items:
        logger.info(f"[采购刷新] 待购项详情: {pending_items[:3]}...")
    else:
        logger.warning("[采购刷新] 待购项为空！请检查计划汇总或库存对比逻辑")
    
    t6 = time.time()
    try:
        database.supabase.table("shopping_list").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except:
        pass
    
    if pending_items:
        items_to_insert = [{"ingredient_id": p.get("ingredient_id"), "need_quantity": p.get("need_quantity", 1), "ingredient_name": p.get("ingredient_name", ""), "shop_name": p.get("shop_name", "待定")} for p in pending_items]
        try:
            database.supabase.table("shopping_list").insert(items_to_insert).execute()
        except:
            pass
    
    task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()

    if not task or not task.data:
        if pending_items:
            result = database.supabase.table("purchase_tasks").insert({
                "status": "active",
                "pending_items": pending_items,
                "custom_items": [],
                "removed_ingredient_ids": blacklist
            }).execute()
            if not result:
                logger.error("[采购刷新] 创建purchase_tasks记录失败")
                raise Exception("创建采购任务失败")
            logger.info(f"[采购刷新] 已创建purchase_tasks记录")
        return {"pending_items": pending_items}

    # 如果待购项为空且存在活动任务，自动完成任务
    if not pending_items:
        result = database.supabase.table("purchase_tasks").update({
            "status": "completed",
            "completed_at": datetime.now().isoformat(),
            "pending_items": [],
            "custom_items": []
        }).eq("id", task.data["id"]).execute()
        if not result:
            logger.error(f"[采购刷新] 更新purchase_tasks状态失败，task_id={task.data['id']}")
            raise Exception("更新采购任务状态失败")
        logger.info(f"[采购刷新] 待购项为空，已自动完成任务")
    else:
        result = database.supabase.table("purchase_tasks").update({"pending_items": pending_items}).eq("id", task.data["id"]).execute()
        if not result:
            logger.error(f"[采购刷新] 更新pending_items失败，task_id={task.data['id']}")
            raise Exception("更新待购项失败")
        logger.info(f"[采购刷新] 已更新purchase_tasks表的pending_items")
    
    print(f"[采购刷新-shopping] 更新购物清单: {time.time()-t6:.2f}s", flush=True)
    
    print(f"[耗时] POST /shopping/task/refresh 总耗时: {time.time()-start:.2f}s", flush=True)
    return {"pending_items": pending_items}


@router.post("/task/add")
@log_operation("添加食材到采购任务")
async def add_to_task(ingredient_id: str, current_user: User = Depends(get_current_user)):
    """添加食材到采购任务"""
    start = time.time()
    task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()

    if not task or not task.data:
        result = database.supabase.table("purchase_tasks").insert({
            "status": "active",
            "pending_items": [],
            "custom_items": [],
            "removed_ingredient_ids": []
        }).execute()
        if not result:
            logger.error("[添加食材] 创建purchase_tasks记录失败")
            raise Exception("创建采购任务失败")
        task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
        if not task or not task.data:
            logger.error("[添加食材] 创建purchase_tasks记录后查询失败")
            raise Exception("查询采购任务失败")

    custom_items = task.data.get("custom_items", [])
    ing = database.supabase.table("ingredients").select("*").eq("id", ingredient_id).single().execute()
    if ing and ing.data:
        custom_items.append({
            "id": f"custom-{len(custom_items)}",
            "name": ing.data["name"],
            "need_quantity": 1,
            "shop_name": None,
            "checked": False
        })
        result = database.supabase.table("purchase_tasks").update({"custom_items": custom_items}).eq("id", task.data["id"]).execute()
        if not result:
            logger.error(f"[添加食材] 更新custom_items失败，task_id={task.data['id']}")
            raise Exception("更新自定义项失败")
    
    print(f"[耗时] POST /shopping/task/add {time.time()-start:.2f}s", flush=True)
    return {"message": "Added to task"}


@router.post("/task/complete")
@log_operation("完成采购")
async def complete_purchase(request: models.CompletePurchaseRequest, current_user: User = Depends(get_current_user)):
    """完成采购"""
    start = time.time()
    update_info = shopping_service.update_inventory_on_purchase(
        database.supabase,
        request.pending_items
    )
    
    task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    if not task or not task.data:
        logger.warning("[完成采购] 没有找到活动任务")
    else:
        purchased_ids = {item.ingredient_id for item in request.pending_items}
        updated_pending = [p for p in task.data.get("pending_items", []) if p.get("ingredient_id") not in purchased_ids]

        custom_ids = {item.id for item in request.custom_items if item.checked}
        updated_custom = [c for c in task.data.get("custom_items", []) if c.get("id") not in custom_ids]

        removed_ids = list(set(task.data.get("removed_ingredient_ids", []) + request.locally_removed_ids))

        result = database.supabase.table("purchase_tasks").update({
            "pending_items": updated_pending,
            "custom_items": updated_custom,
            "removed_ingredient_ids": removed_ids
        }).eq("id", task.data["id"]).execute()
        if not result:
            logger.error(f"[完成采购] 更新purchase_tasks失败，task_id={task.data['id']}")
            raise Exception("更新采购任务失败")
    
    print(f"[耗时] POST /shopping/task/complete {time.time()-start:.2f}s", flush=True)
    return {"message": "Purchase completed"}


@router.post("/task/clear")
@log_operation("清空采购任务")
async def clear_task(pending_items: List[dict], custom_items: List[dict], current_user: User = Depends(get_current_user)):
    """清空采购任务"""
    start = time.time()
    task = database.supabase.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    if not task or not task.data:
        logger.warning("[清空任务] 没有找到活动任务")
    else:
        result = database.supabase.table("purchase_tasks").update({
            "pending_items": [],
            "custom_items": [],
            "removed_ingredient_ids": []
        }).eq("id", task.data["id"]).execute()
        if not result:
            logger.error(f"[清空任务] 更新purchase_tasks失败，task_id={task.data['id']}")
            raise Exception("清空采购任务失败")
    
    print(f"[耗时] POST /shopping/task/clear {time.time()-start:.2f}s", flush=True)
    return {"message": "Task cleared"}
