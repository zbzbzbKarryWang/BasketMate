from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from datetime import datetime
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..services import shopping_service
from ..decorators import log_operation
from ..logger import get_logger

logger = get_logger("basketmate")

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


def refresh_purchase_task():
    """刷新采购任务 - 调用 service 层函数"""
    shopping_service.refresh_purchase_task(database.supabase)


@router.get("/task", response_model=models.ApiResponse[models.PurchaseTaskResponse])
@log_operation("获取采购任务")
async def get_active_task(current_user: User = Depends(get_current_user)):
    """获取当前活跃的采购任务，只读查询，不修改任何数据"""
    start = time.time()
    
    active_task = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    
    if not active_task or not active_task.data:
        logger.info(f"[获取采购任务] 没有找到活动任务")
        print(f"[耗时] GET /shopping/task {time.time()-start:.2f}s", flush=True)
        return models.ApiResponse.ok({
            "id": "",
            "status": False,
            "pending_items": [],
            "custom_items": [],
            "completed_items": [],
            "removed_ingredient_ids": []
        })
    
    task_data = active_task.data
    task_id = task_data["id"]
    
    logger.info(f"[获取采购任务] 成功，待购项数量: {len(task_data.get('pending_items', []))}")
    print(f"[耗时] GET /shopping/task {time.time()-start:.2f}s", flush=True)
    
    return models.ApiResponse.ok({
        "id": task_id,
        "status": True,
        "pending_items": task_data.get("pending_items", []),
        "custom_items": task_data.get("custom_items", []),
        "completed_items": task_data.get("completed_items", []),
        "removed_ingredient_ids": task_data.get("removed_ingredient_ids", [])
    })


@router.post("/task/complete", response_model=models.ApiResponse[models.PurchaseTaskResponse])
@log_operation("完成采购")
async def complete_purchase(request: models.CompletePurchaseRequest, current_user: User = Depends(get_current_user)):
    """完成采购 - 原子性操作"""
    start = time.time()
    
    task = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    if not task or not task.data:
        logger.warning("[完成采购] 没有找到活动任务")
        return models.ApiResponse.ok({
            "id": "",
            "status": False,  # false=已完成
            "pending_items": [],
            "custom_items": [],
            "completed_items": [],
            "removed_ingredient_ids": []
        })
    
    task_id = task.data["id"]
    checked_items = request.checked_items or []
    
    if not checked_items:
        return models.ApiResponse.ok({
            "id": task_id,
            "status": True,  # true=活跃
            "pending_items": task.data.get("pending_items", []),
            "custom_items": task.data.get("custom_items", []),
            "completed_items": task.data.get("completed_items", []),
            "removed_ingredient_ids": task.data.get("removed_ingredient_ids", [])
        })
    
    try:
        # 将 checked_items 转换为 RPC 需要的格式
        checked_items_json = [
            {
                "ingredient_id": item.ingredient_id,
                "ingredient_name": item.ingredient_name,
                "need_quantity": item.need_quantity,
                "is_custom": item.is_custom,
                "custom_id": item.custom_id
            }
            for item in checked_items
        ]
        
        # 调用原子性函数（返回 void）
        database.supabase.rpc("complete_purchase_task", {
            "p_task_id": task_id,
            "p_checked_items": checked_items_json
        }).execute()
        
        # 获取更新后的任务
        updated_task = database.supabase.table("purchase_tasks").select("*").eq("id", task_id).single().execute()
        if not updated_task or not updated_task.data:
            return models.ApiResponse.fail("获取更新后的任务失败")
        
        logger.info(f"[完成采购] 成功，勾选项数={len(checked_items_json)}")
        print(f"[耗时] POST /shopping/task/complete {time.time()-start:.2f}s", flush=True)
        
        return models.ApiResponse.ok({
            "id": task_id,
            "status": updated_task.data.get("status", True),
            "pending_items": updated_task.data.get("pending_items", []),
            "custom_items": updated_task.data.get("custom_items", []),
            "completed_items": updated_task.data.get("completed_items", []),
            "removed_ingredient_ids": updated_task.data.get("removed_ingredient_ids", [])
        })
        
    except Exception as e:
        logger.error(f"[完成采购] 失败: 参数=task_id={task_id},checked_items={len(checked_items_json)}, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("完成采购失败")


@router.post("/task/delete-item", response_model=models.ApiResponse[models.PurchaseTaskResponse])
@log_operation("删除采购项")
async def delete_item(request: models.DeleteItemRequest, current_user: User = Depends(get_current_user)):
    """删除单个采购项，加入黑名单"""
    start = time.time()
    
    ingredient_id = request.ingredient_id
    task = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    
    if not task or not task.data:
        logger.warning("[删除采购项] 没有找到活动任务")
        return models.ApiResponse.fail("没有找到活动任务")
    
    # 获取当前任务数据
    pending_items = task.data.get("pending_items", [])
    custom_items = task.data.get("custom_items", [])
    completed_items = task.data.get("completed_items", [])
    removed_ids = set(task.data.get("removed_ingredient_ids", []))
    
    # 添加到黑名单
    removed_ids.add(ingredient_id)
    
    # 从待购项中移除
    pending_items = [p for p in pending_items if p.get("ingredient_id") != ingredient_id]
    
    # 如果是临时物品，也从 custom_items 移除
    if ingredient_id.startswith("custom-"):
        custom_id = ingredient_id.replace("custom-", "")
        custom_items = [c for c in custom_items if c.get("id") != custom_id]
    
    # 更新任务
    removed_list = list(removed_ids)
    result = database.supabase.table("purchase_tasks").update({
        "pending_items": pending_items,
        "custom_items": custom_items,
        "removed_ingredient_ids": removed_list
    }).eq("id", task.data["id"]).execute()
    
    if not result:
        logger.error(f"[删除采购项] 更新purchase_tasks失败，task_id={task.data['id']}")
        return models.ApiResponse.fail("更新采购任务失败")
    
    logger.info(f"[删除采购项] 成功，ingredient_id={ingredient_id}")
    print(f"[耗时] POST /shopping/task/delete-item {time.time()-start:.2f}s", flush=True)
    
    return models.ApiResponse.ok({
        "id": task.data["id"],
        "status": True,  # true=活跃
        "pending_items": pending_items,
        "custom_items": custom_items,
        "completed_items": completed_items,
        "removed_ingredient_ids": removed_list
    })


@router.post("/task/clear", response_model=models.ApiResponse[models.PurchaseTaskResponse])
@log_operation("清空采购任务")
async def clear_task(current_user: User = Depends(get_current_user)):
    """清空所有待购项，将它们加入黑名单，标记任务为已完成"""
    start = time.time()
    
    task = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    
    if not task or not task.data:
        logger.warning("[清空采购任务] 没有找到活动任务")
        return models.ApiResponse.fail("没有找到活动任务")
    
    # 获取当前任务数据
    pending_items = task.data.get("pending_items", [])
    custom_items = task.data.get("custom_items", [])
    removed_ids = set(task.data.get("removed_ingredient_ids", []))
    
    # 将所有待购项的 ingredient_id 加入黑名单
    for item in pending_items:
        ingredient_id = item.get("ingredient_id")
        if ingredient_id:
            removed_ids.add(ingredient_id)
    
    # 将所有自定义项也加入黑名单
    for item in custom_items:
        custom_id = item.get("id")
        if custom_id:
            removed_ids.add(f"custom-{custom_id}")
    
    # 更新任务
    result = database.supabase.table("purchase_tasks").update({
        "pending_items": [],
        "custom_items": [],
        "removed_ingredient_ids": list(removed_ids),
        "status": False,  # false=已完成
        "completed_at": datetime.now().isoformat()
    }).eq("id", task.data["id"]).execute()
    
    if not result:
        logger.error(f"[清空采购任务] 更新purchase_tasks失败，task_id={task.data['id']}")
        return models.ApiResponse.fail("更新采购任务失败")
    
    logger.info(f"[清空采购任务] 成功")
    print(f"[耗时] POST /shopping/task/clear {time.time()-start:.2f}s", flush=True)
    
    return models.ApiResponse.ok({
        "id": task.data["id"],
        "status": False,  # false=已完成
        "pending_items": [],
        "custom_items": [],
        "completed_items": task.data.get("completed_items", []),
        "removed_ingredient_ids": list(removed_ids)
    })


@router.post("/task/refresh", response_model=models.ApiResponse[dict])
@log_operation("刷新采购清单")
async def refresh_purchase_task(request: models.RefreshRequest, current_user: User = Depends(get_current_user)):
    """重新计算并保存采购任务"""
    import time
    start = time.time()
    blacklist = request.locally_removed_ids or []
    
    try:
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
            logger.info(f"[shopping] 菜谱rid={rid}, 食材数={len(ings)}: {ings[:3]}")
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
        
        task = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
        
        # 检查 task 是否存在
        if not task or not task.data:
            # 没有活跃任务
            if pending_items:
                database.supabase.table("purchase_tasks").insert({
                    "status": True,  # true=活跃
                    "pending_items": pending_items,
                    "custom_items": [],
                    "completed_items": [],
                    "removed_ingredient_ids": blacklist
                }).execute()
                logger.info(f"[采购刷新] 已创建purchase_tasks记录")
            else:
                logger.info(f"[采购刷新] 无活跃任务且待购项为空，跳过")
        elif pending_items:
            # 有任务也有待购项，更新待购项
            database.supabase.table("purchase_tasks").update({"pending_items": pending_items}).eq("id", task.data["id"]).execute()
            logger.info(f"[采购刷新] 已更新purchase_tasks表的pending_items")
        else:
            # 待购项为空，保留原有 pending_items，不做更新
            logger.info(f"[采购刷新] 待购项为空，保留原有purchase_tasks数据不更新")
        
        print(f"[采购刷新-shopping] 更新购物清单: {time.time()-t6:.2f}s", flush=True)
        
        print(f"[耗时] POST /shopping/task/refresh 总耗时: {time.time()-start:.2f}s", flush=True)
        return models.ApiResponse.ok({"pending_items": pending_items})
        
    except Exception as e:
        logger.error(f"[刷新采购清单] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail("刷新采购清单失败")


@router.post("/task/add", response_model=models.ApiResponse[models.PurchaseTaskResponse])
@log_operation("添加食材到采购任务")
async def add_to_task(request: models.AddToTaskRequest, current_user: User = Depends(get_current_user)):
    """添加食材到采购任务"""
    start = time.time()
    task = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    
    if not task or not task.data:
        database.supabase.table("purchase_tasks").insert({
            "status": True,  # true=活跃
            "pending_items": [],
            "custom_items": [],
            "completed_items": [],
            "removed_ingredient_ids": []
        }).execute()
        task = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    
    if not task or not task.data:
        return models.ApiResponse.fail("创建采购任务失败")
    
    custom_items = task.data.get("custom_items", [])
    ing = database.supabase.table("ingredients").select("*").eq("id", request.ingredient_id).single().execute()
    if ing and ing.data:
        custom_items.append({
            "id": f"custom-{len(custom_items)}",
            "name": ing.data["name"],
            "need_quantity": 1,
            "shop_name": None,
            "checked": False
        })
        database.supabase.table("purchase_tasks").update({"custom_items": custom_items}).eq("id", task.data["id"]).execute()
    
    print(f"[耗时] POST /shopping/task/add {time.time()-start:.2f}s", flush=True)
    return models.ApiResponse.ok({
        "id": task.data["id"],
        "status": True,
        "pending_items": task.data.get("pending_items", []),
        "custom_items": custom_items,
        "completed_items": task.data.get("completed_items", []),
        "removed_ingredient_ids": task.data.get("removed_ingredient_ids", [])
    })
