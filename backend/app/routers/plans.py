from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import List
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..services import shopping_service
from ..decorators import log_operation
from ..logger import get_logger

logger = get_logger("basketmate")

router = APIRouter(prefix="/api/plans", tags=["plans"])


def update_pending_items_for_plan(plan_id: str, is_deleting: bool = False):
    """增量更新采购任务 - 只重新计算指定计划的食材"""
    import time
    start = time.time()
    logger.info(f"[增量更新] 开始处理计划 {plan_id}, 删除模式={is_deleting}")
    
    try:
        if is_deleting:
            # 删除操作
            shopping_service.update_pending_items_with_sources(
                database.supabase,
                plan_id,
                'deleted'
            )
        else:
            # 创建或更新操作：先计算该计划的需求，再更新
            new_requirements = shopping_service.compute_pending_items_for_plan(
                database.supabase,
                plan_id
            )
            logger.info(f"[增量更新] 计划 {plan_id} 的食材需求: {new_requirements}")
            
            shopping_service.update_pending_items_with_sources(
                database.supabase,
                plan_id,
                'updated',  # 使用 'updated' 处理创建和更新
                new_requirements
            )
        
        total_ms = int((time.time() - start) * 1000)
        logger.info(f"[增量更新] 计划 {plan_id} 成功，耗时 {total_ms}ms")
    except Exception as e:
        logger.error(f"[增量更新] 计划 {plan_id} 失败: 错误={str(e)}", exc_info=True)
        # 失败时回退到全量刷新
        refresh_purchase_task()
        total_ms = int((time.time() - start) * 1000)
        logger.info(f"[增量更新] 计划 {plan_id} 回退到全量刷新，总耗时 {total_ms}ms")


def refresh_purchase_task():
    """刷新采购任务"""
    import time
    from datetime import datetime
    start = time.time()
    blacklist = []
    
    t1 = time.time()
    ing_rows = database.supabase.table("ingredients").select("id, name, quantity").execute()
    inventory = ing_rows.data or []
    logger.info(f"[plans shopping] 库存数量: {len(inventory)}")
    for inv in inventory[:5]:
        logger.info(f"[plans shopping] 库存: id={inv.get('id')}, name={inv.get('name')}, qty={inv.get('quantity')}")
    print(f"[采购刷新-plans] 查询食材 {len(inventory)} 条: {time.time()-t1:.2f}s", flush=True)
    
    t2 = time.time()
    recipe_rows = database.supabase.table("recipes").select("id, ingredients").execute()
    recipe_map = {row["id"]: row for row in (recipe_rows.data or [])}
    logger.info(f"[plans shopping] 菜谱数量: {len(recipe_map)}")
    for rid, r in recipe_map.items():
        ings = r.get("ingredients") or []
        logger.info(f"[plans shopping] 菜谱rid={rid}, 食材数={len(ings)}: {ings[:3]}")
    print(f"[采购刷新-plans] 查询菜谱 {len(recipe_map)} 条: {time.time()-t2:.2f}s", flush=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    t3 = time.time()
    plan_rows = database.supabase.table("plans").select("id, date, breakfast_recipe_id, meal_ids").execute()
    logger.info(f"[plans shopping] 查询所有未删除计划，查询到 {len(plan_rows.data or [])} 条计划")
    for p in (plan_rows.data or []):
        logger.info(f"[plans shopping] 计划: id={p.get('id')}, date={p.get('date')}, breakfast={p.get('breakfast_recipe_id')}, meals={p.get('meal_ids')}")
    print(f"[采购刷新-plans] 查询计划: {time.time()-t3:.2f}s", flush=True)
    
    t4 = time.time()
    price_rows = database.supabase.table("prices").select("id, ingredient_id, shop_id, price").execute()
    prices = price_rows.data or []
    print(f"[采购刷新-plans] 查询价格 {len(prices)} 条: {time.time()-t4:.2f}s", flush=True)
    
    t5 = time.time()
    logger.info(f"[plans shopping] 调用compute_pending_items: plan_rows数量={len(plan_rows.data or [])}, inventory数量={len(inventory)}, recipe_map数量={len(recipe_map)}, blacklist={blacklist}")
    pending_items = shopping_service.compute_pending_items(
        inventory=inventory,
        recipe_map=recipe_map,
        plan_rows=(plan_rows.data or []),
        prices=prices,
        blacklist=blacklist
    )
    print(f"[采购刷新-plans] 计算待购项: {time.time()-t5:.2f}s", flush=True)
    
    logger.info(f"[采购刷新-plans] 最终待购项数量: {len(pending_items)}")
    
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
            logger.info(f"[采购刷新-plans] 已创建purchase_tasks记录")
    elif not pending_items:
        # 有任务但待购项为空，标记为完成
        database.supabase.table("purchase_tasks").update({
            "status": False,  # false=已完成
            "completed_at": datetime.now().isoformat(),
            "pending_items": [],
            "custom_items": []
        }).eq("id", task.data["id"]).execute()
        logger.info(f"[采购刷新-plans] 待购项为空，已自动完成任务")
    else:
        # 有任务也有待购项，更新待购项
        database.supabase.table("purchase_tasks").update({"pending_items": pending_items}).eq("id", task.data["id"]).execute()
        logger.info(f"[采购刷新-plans] 已更新purchase_tasks表的pending_items")
    
    print(f"[采购刷新-plans] 更新购物清单: {time.time()-t6:.2f}s", flush=True)
    print(f"[采购刷新-plans] 总耗时: {time.time()-start:.2f}s", flush=True)


@router.get("", response_model=models.ApiResponse[List[models.PlanResponse]])
@log_operation("获取计划列表")
async def get_plans(current_user: User = Depends(get_current_user)):
    """获取所有计划"""
    start = time.time()
    response = database.supabase.table("plans").select("*").order("date").execute()
    print(f"[耗时] GET /plans {time.time()-start:.2f}s", flush=True)
    return JSONResponse(
        status_code=200,
        content=models.ApiResponse.ok(response.data).dict()
    )


@router.get("/{plan_id}", response_model=models.ApiResponse[models.PlanResponse])
@log_operation("获取计划详情")
async def get_plan(plan_id: str, current_user: User = Depends(get_current_user)):
    """获取单个计划"""
    start = time.time()
    response = database.supabase.table("plans").select("*").eq("id", plan_id).single().execute()
    if not response.data:
        return JSONResponse(
            status_code=404,
            content=models.ApiResponse.fail("计划不存在").dict()
        )
    print(f"[耗时] GET /plans/{plan_id} {time.time()-start:.2f}s", flush=True)
    return JSONResponse(
        status_code=200,
        content=models.ApiResponse.ok(response.data).dict()
    )


@router.post("", response_model=models.ApiResponse[models.PlanResponse])
@log_operation("创建计划")
async def create_plan(plan: models.PlanCreate, current_user: User = Depends(get_current_user)):
    """创建新计划（原子性操作）"""
    start = time.time()
    
    try:
        # 简单的直接创建（先跳过复杂的 RPC 调用，便于调试）
        insert_data = {
            "date": plan.date,
            "breakfast_recipe_id": plan.breakfast_recipe_id,
            "meal_ids": plan.meal_ids or []
        }
        
        response = database.supabase.table("plans").insert(insert_data).execute()
        
        if not response or not response.data or len(response.data) == 0:
            logger.error(f"[创建计划] 插入失败: {insert_data}")
            return JSONResponse(
                status_code=500,
                content=models.ApiResponse.fail("创建计划失败").dict()
            )
        
        plan_data = response.data[0]
        plan_id = plan_data.get("id")
        
        # 同步到采购任务
        logger.info(f"[创建计划] 开始同步计划 {plan_id} 到采购任务")
        update_pending_items_for_plan(plan_id)
        
        print(f"[耗时] POST /plans 创建计划: {time.time()-start:.2f}s", flush=True)
        logger.info(f"[创建计划] 成功，plan_id={plan_id}")
        return JSONResponse(
            status_code=200,
            content=models.ApiResponse.ok(plan_data).dict()
        )
        
    except Exception as e:
        logger.error(f"[创建计划] 失败: 参数=date={plan.date},breakfast={plan.breakfast_recipe_id},meals={plan.meal_ids}, 错误={str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content=models.ApiResponse.fail(f"创建计划失败: {str(e)}").dict()
        )


@router.put("/{plan_id}", response_model=models.ApiResponse[models.PlanResponse])
@log_operation("更新计划")
async def update_plan(plan_id: str, plan: models.PlanUpdate, current_user: User = Depends(get_current_user)):
    """更新计划（原子性操作）"""
    start = time.time()
    
    try:
        # 简单的直接更新（先跳过复杂的 RPC 调用，便于调试）
        update_data = {}
        if plan.date is not None:
            update_data["date"] = plan.date
        if plan.breakfast_recipe_id is not None:
            update_data["breakfast_recipe_id"] = plan.breakfast_recipe_id
        if plan.meal_ids is not None:
            update_data["meal_ids"] = plan.meal_ids
        
        response = database.supabase.table("plans").update(update_data).eq("id", plan_id).execute()
        
        if not response or not response.data or len(response.data) == 0:
            logger.error(f"[更新计划] 更新失败: plan_id={plan_id}")
            return JSONResponse(
                status_code=404,
                content=models.ApiResponse.fail("计划不存在").dict()
            )
        
        # 同步到采购任务
        logger.info(f"[更新计划] 开始同步计划 {plan_id} 到采购任务")
        update_pending_items_for_plan(plan_id)
        
        print(f"[耗时] PUT /plans/{plan_id} 更新计划: {time.time()-start:.2f}s", flush=True)
        logger.info(f"[更新计划] 成功，plan_id={plan_id}")
        return JSONResponse(
            status_code=200,
            content=models.ApiResponse.ok(response.data[0]).dict()
        )
        
    except Exception as e:
        logger.error(f"[更新计划] 失败: 参数=plan_id={plan_id},date={plan.date},breakfast={plan.breakfast_recipe_id},meals={plan.meal_ids}, 错误={str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content=models.ApiResponse.fail(f"更新计划失败: {str(e)}").dict()
        )


@router.delete("/{plan_id}", response_model=models.ApiResponse)
@log_operation("删除计划")
async def delete_plan(plan_id: str, current_user: User = Depends(get_current_user)):
    """删除计划（原子性操作）"""
    start = time.time()
    
    try:
        # 先同步采购任务（标记为删除）
        logger.info(f"[删除计划] 先从采购任务中移除计划 {plan_id}")
        update_pending_items_for_plan(plan_id, is_deleting=True)
        
        # 然后删除计划
        response = database.supabase.table("plans").delete().eq("id", plan_id).execute()
        
        if not response or not response.data or len(response.data) == 0:
            logger.error(f"[删除计划] 删除失败: plan_id={plan_id}")
            return JSONResponse(
                status_code=404,
                content=models.ApiResponse.fail("计划不存在").dict()
            )
        
        print(f"[耗时] DELETE /plans/{plan_id} 删除计划: {time.time()-start:.2f}s", flush=True)
        logger.info(f"[删除计划] 成功，plan_id={plan_id}")
        return JSONResponse(
            status_code=200,
            content=models.ApiResponse.ok(message="删除计划成功").dict()
        )
        
    except Exception as e:
        logger.error(f"[删除计划] 失败: 参数=plan_id={plan_id}, 错误={str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content=models.ApiResponse.fail(f"删除计划失败: {str(e)}").dict()
        )
