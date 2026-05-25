from fastapi import APIRouter, HTTPException, Depends
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
    print(f"[采购刷新-plans] 更新购物清单: {time.time()-t6:.2f}s", flush=True)
    
    print(f"[采购刷新-plans] 总耗时: {time.time()-start:.2f}s", flush=True)


@router.get("", response_model=List[models.PlanResponse])
@log_operation("获取计划列表")
async def get_plans(current_user: User = Depends(get_current_user)):
    """获取所有计划"""
    start = time.time()
    response = database.supabase.table("plans").select("*").order("date").execute()
    print(f"[耗时] GET /plans {time.time()-start:.2f}s", flush=True)
    return response.data


@router.get("/{plan_id}", response_model=models.PlanResponse)
@log_operation("获取计划详情")
async def get_plan(plan_id: str, current_user: User = Depends(get_current_user)):
    """获取单个计划"""
    start = time.time()
    response = database.supabase.table("plans").select("*").eq("id", plan_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Plan not found")
    print(f"[耗时] GET /plans/{plan_id} {time.time()-start:.2f}s", flush=True)
    return response.data


@router.post("", response_model=models.PlanResponse)
@log_operation("创建计划")
async def create_plan(plan: models.PlanCreate, current_user: User = Depends(get_current_user)):
    """创建新计划（原子性操作）"""
    start = time.time()
    
    try:
        # 调用原子性函数
        result = database.supabase.rpc("create_plan_with_refresh", {
            "p_date": plan.date,
            "p_breakfast_recipe_id": plan.breakfast_recipe_id,
            "p_meal_ids": plan.meal_ids or []
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="创建计划失败")
        
        plan_id = result.data[0].get("plan_id")
        
        # 获取创建的计划详情
        response = database.supabase.table("plans").select("*").eq("id", plan_id).single().execute()
        print(f"[耗时] POST /plans 创建计划: {time.time()-start:.2f}s", flush=True)
        logger.info(f"[创建计划] 成功，plan_id={plan_id}")
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[创建计划] 失败: 参数=date={plan.date},breakfast={plan.breakfast_recipe_id},meals={plan.meal_ids}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="创建计划失败")


@router.put("/{plan_id}", response_model=models.PlanResponse)
@log_operation("更新计划")
async def update_plan(plan_id: str, plan: models.PlanUpdate, current_user: User = Depends(get_current_user)):
    """更新计划（原子性操作）"""
    start = time.time()
    
    try:
        # 调用原子性函数
        result = database.supabase.rpc("update_plan_with_refresh", {
            "p_plan_id": plan_id,
            "p_date": plan.date,
            "p_breakfast_recipe_id": plan.breakfast_recipe_id,
            "p_meal_ids": plan.meal_ids
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="更新计划失败")
        
        # 获取更新后的计划详情
        response = database.supabase.table("plans").select("*").eq("id", plan_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Plan not found")
        
        print(f"[耗时] PUT /plans/{plan_id} 更新计划: {time.time()-start:.2f}s", flush=True)
        logger.info(f"[更新计划] 成功，plan_id={plan_id}")
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[更新计划] 失败: 参数=plan_id={plan_id},date={plan.date},breakfast={plan.breakfast_recipe_id},meals={plan.meal_ids}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="更新计划失败")


@router.delete("/{plan_id}")
@log_operation("删除计划")
async def delete_plan(plan_id: str, current_user: User = Depends(get_current_user)):
    """删除计划（原子性操作）"""
    start = time.time()
    
    try:
        # 调用原子性函数
        result = database.supabase.rpc("delete_plan_with_refresh", {
            "p_plan_id": plan_id
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="删除计划失败")
        
        print(f"[耗时] DELETE /plans/{plan_id} 删除计划: {time.time()-start:.2f}s", flush=True)
        logger.info(f"[删除计划] 成功，plan_id={plan_id}，移除待购项={result.data[0].get('items_removed')}")
        return {"message": "Plan deleted", "details": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[删除计划] 失败: 参数=plan_id={plan_id}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="删除计划失败")
