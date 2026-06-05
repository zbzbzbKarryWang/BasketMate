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
    """增量更新采购任务 - 调用 service 层函数"""
    shopping_service.update_pending_items_for_plan(database.supabase, plan_id, is_deleting)


def refresh_purchase_task():
    """刷新采购任务 - 调用 service 层函数"""
    shopping_service.refresh_purchase_task(database.supabase)


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
