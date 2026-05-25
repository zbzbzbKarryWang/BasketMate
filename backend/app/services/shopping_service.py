from typing import List, Dict, Any, Optional
from datetime import datetime
from ..logger import get_logger

logger = get_logger("basketmate")


def parse_recipe_ingredients(ingredients: List[dict]) -> List[dict]:
    """解析菜谱食材引用"""
    result = []
    for ing in (ingredients or []):
        if isinstance(ing, dict):
            if "ingredient_id" in ing:
                result.append(ing)
            elif "name" in ing:
                result.append({"name": ing["name"], "quantity": ing.get("quantity", 0), "unit": ""})
    return result


def compute_pending_items(
    inventory: List[dict],
    recipe_map: Dict[str, dict],
    plan_rows: List[dict],
    prices: List[dict],
    blacklist: List[str],
    today: Optional[str] = None
) -> List[Dict[str, Any]]:
    """计算待购食材列表"""
    if not today:
        today = datetime.now().strftime("%Y-%m-%d")
    
    # 过滤日期 >= today 的计划
    filtered_plans = []
    for plan in filtered_plans:
        plan_date = plan.get("date", "")
        if plan_date and plan_date >= today:
            filtered_plans.append(plan)
    
    logger.info(f"[compute_pending_items] 开始计算待购项，原始计划数: {len(plan_rows)}, 过滤后计划数: {len(filtered_plans)}, 库存数: {len(inventory)}, 黑名单: {blacklist}")
    
    need_by_ing_id: Dict[str, float] = {}
    need_details: List[Dict[str, Any]] = []
    
    for plan in filtered_plans:
        if plan.get("breakfast_recipe_id"):
            recipe = recipe_map.get(plan["breakfast_recipe_id"])
            if recipe:
                for ing_ref in parse_recipe_ingredients(recipe.get("ingredients") or []):
                    ing_id = ing_ref.get("ingredient_id")
                    if ing_id:
                        qty = ing_ref.get("quantity", 0)
                        need_by_ing_id[ing_id] = need_by_ing_id.get(ing_id, 0) + qty
                        need_details.append({"plan_id": plan.get("id"), "recipe_id": plan["breakfast_recipe_id"], "ing_id": ing_id, "qty": qty, "type": "breakfast"})
        
        for meal_id in (plan.get("meal_ids") or []):
            recipe = recipe_map.get(meal_id)
            if recipe:
                for ing_ref in parse_recipe_ingredients(recipe.get("ingredients") or []):
                    ing_id = ing_ref.get("ingredient_id")
                    if ing_id:
                        qty = ing_ref.get("quantity", 0)
                        need_by_ing_id[ing_id] = need_by_ing_id.get(ing_id, 0) + qty
                        need_details.append({"plan_id": plan.get("id"), "recipe_id": meal_id, "ing_id": ing_id, "qty": qty, "type": "meal"})
    
    logger.info(f"[compute_pending_items] 食材需求汇总: {len(need_by_ing_id)} 种")
    for ing_id, qty in need_by_ing_id.items():
        logger.info(f"[compute_pending_items] 需求: ing_id={ing_id}, 总量={qty}")
    
    if not need_by_ing_id:
        logger.info("[compute_pending_items] 无食材需求，返回空列表")
        return []
    
    inventory_map = {row["id"]: row for row in inventory}
    logger.info(f"[compute_pending_items] 库存映射已构建，共 {len(inventory_map)} 条")
    
    # 预构建价格映射 {ingredient_id: (price, shop_name)}
    price_map: Dict[str, tuple] = {}
    for price in prices:
        ing_id = price.get("ingredient_id")
        if ing_id:
            p = price.get("price", 0)
            if ing_id not in price_map or p < price_map[ing_id][0]:
                price_map[ing_id] = (p, price.get("shop_name", "待定"))
    
    pending_items = []
    skipped_by_blacklist = []
    skipped_no_inventory = []
    skipped_enough_stock = []
    
    for ing_id, need_qty in need_by_ing_id.items():
        if ing_id in blacklist:
            skipped_by_blacklist.append(ing_id)
            continue
        ing = inventory_map.get(ing_id)
        if not ing:
            skipped_no_inventory.append(ing_id)
            continue
        stock = ing.get("quantity", 0)
        logger.info(f"[compute_pending_items] ing_id={ing_id}, 需求={need_qty}, 库存={stock}")
        if stock >= need_qty:
            skipped_enough_stock.append({"ing_id": ing_id, "need": need_qty, "stock": stock})
            continue
        
        need_purchase = need_qty - stock
        
        best_price, best_shop = price_map.get(ing_id, (None, "待定"))
        
        pending_items.append({
            "ingredient_id": ing_id,
            "ingredient_name": ing.get("name", "未知"),
            "need_quantity": need_purchase,
            "unit": "",
            "shop_name": best_shop,
            "price": best_price or 0,
            "checked": False
        })
    
    if skipped_by_blacklist:
        logger.info(f"[compute_pending_items] 被黑名单过滤: {skipped_by_blacklist}")
    if skipped_no_inventory:
        logger.info(f"[compute_pending_items] 库存中不存在: {skipped_no_inventory}")
    if skipped_enough_stock:
        logger.info(f"[compute_pending_items] 库存充足无需购买: {skipped_enough_stock}")
    
    logger.info(f"[compute_pending_items] 最终生成待购项: {len(pending_items)} 项")
    for item in pending_items:
        logger.info(f"[compute_pending_items] 待购: {item.get('ingredient_name')}, 数量={item.get('need_quantity')}")
    
    return pending_items


def update_inventory_on_purchase(
    supabase_client,
    pending_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """完成采购后更新库存，返回更新信息"""
    if not pending_items:
        return []
    
    updates = []
    update_info = []
    for item in pending_items:
        ing_id = item.get("ingredient_id")
        ing_name = item.get("ingredient_name", "未知")
        need_qty = item.get("need_quantity", 0)
        if ing_id and need_qty:
            updates.append({"id": ing_id, "quantity": need_qty, "added_at": datetime.now().isoformat()})
            update_info.append({"name": ing_name, "quantity": need_qty})
    
    if updates:
        for update in updates:
            try:
                ing = supabase_client.table("ingredients").select("quantity").eq("id", update["id"]).single().execute()
                if ing.data:
                    new_qty = ing.data.get("quantity", 0) + update["quantity"]
                    supabase_client.table("ingredients").update({
                        "quantity": new_qty,
                        "added_at": update["added_at"]
                    }).eq("id", update["id"]).execute()
            except Exception as e:
                print(f"[错误] 更新库存失败: {str(e)}", flush=True)
    
    return update_info


def compute_pending_items_for_plan(
    supabase_client,
    plan_id: str
) -> Dict[str, float]:
    """
    增量计算单个计划的食材需求
    只查询该计划所需的菜谱，不查询所有菜谱和价格表
    返回格式: { ingredient_id: need_quantity }
    """
    need_by_ing_id: Dict[str, float] = {}
    
    # 获取计划详情
    plan_resp = supabase_client.table("plans").select("*").eq("id", plan_id).maybe_single().execute()
    plan = plan_resp.data
    if not plan:
        return need_by_ing_id
    
    # 收集该计划引用的所有菜谱ID
    recipe_ids = set()
    if plan.get("breakfast_recipe_id"):
        recipe_ids.add(plan["breakfast_recipe_id"])
    for meal_id in (plan.get("meal_ids") or []):
        recipe_ids.add(meal_id)
    
    if not recipe_ids:
        return need_by_ing_id
    
    # 只查询该计划引用的菜谱
    recipes = supabase_client.table("recipes").select("id, ingredients").in_("id", list(recipe_ids)).execute().data or []
    recipe_map = {r["id"]: r for r in recipes}
    
    # 计算食材需求
    if plan.get("breakfast_recipe_id"):
        recipe = recipe_map.get(plan["breakfast_recipe_id"])
        if recipe:
            for ing_ref in parse_recipe_ingredients(recipe.get("ingredients") or []):
                ing_id = ing_ref.get("ingredient_id")
                if ing_id:
                    qty = ing_ref.get("quantity", 0)
                    need_by_ing_id[ing_id] = need_by_ing_id.get(ing_id, 0) + qty
    
    for meal_id in (plan.get("meal_ids") or []):
        recipe = recipe_map.get(meal_id)
        if recipe:
            for ing_ref in parse_recipe_ingredients(recipe.get("ingredients") or []):
                ing_id = ing_ref.get("ingredient_id")
                if ing_id:
                    qty = ing_ref.get("quantity", 0)
                    need_by_ing_id[ing_id] = need_by_ing_id.get(ing_id, 0) + qty
    
    return need_by_ing_id


def update_pending_items_with_sources(
    supabase_client,
    plan_id: str,
    operation: str,  # 'created', 'updated', 'deleted'
    new_requirements: Optional[Dict[str, float]] = None
):
    """
    增量更新采购任务的待购项，跟踪需求来源
    
    pending_items 的结构：
    {
        "ingredient_id": "xxx",
        "ingredient_name": "xxx",
        "need_quantity": 2.0,
        "unit": "",
        "shop_name": "xxx",
        "price": 10.0,
        "checked": false,
        "sources": { "plan_id_1": 1.0, "plan_id_2": 1.0 }  # 新增字段
    }
    """
    # 获取当前活跃任务
    task = supabase_client.table("purchase_tasks").select("*").eq("status", "active").maybe_single().execute()
    if not task or not task.data:
        return
    
    task_data = task.data
    pending_items = task_data.get("pending_items", [])
    blacklist = task_data.get("removed_ingredient_ids", [])
    
    # 获取库存用于计算缺货量
    inventory = supabase_client.table("ingredients").select("id, name, quantity").execute().data or []
    inventory_map = {row["id"]: row for row in inventory}
    
    # 获取价格信息用于显示
    prices = supabase_client.table("prices").select("id, ingredient_id, shop_id, price").execute().data or []
    price_map: Dict[str, tuple] = {}
    for price in prices:
        ing_id = price.get("ingredient_id")
        if ing_id:
            p = price.get("price", 0)
            if ing_id not in price_map or p < price_map[ing_id][0]:
                price_map[ing_id] = (p, price.get("shop_name", "待定"))
    
    if operation in ('created', 'updated'):
        if not new_requirements:
            new_requirements = {}
        
        for ing_id, need_qty in new_requirements.items():
            if ing_id in blacklist:
                continue
            
            # 查找现有的待购项
            existing_item = next((item for item in pending_items if item.get("ingredient_id") == ing_id), None)
            
            if existing_item:
                # 更新现有项的 sources 和 need_quantity
                sources = existing_item.get("sources", {})
                old_qty = sources.get(plan_id, 0)
                
                # 更新来源
                sources[plan_id] = need_qty
                
                # 计算总需求量变化
                inventory_ing = inventory_map.get(ing_id)
                total_needed = sum(sources.values())
                stock = inventory_ing.get("quantity", 0) if inventory_ing else 0
                
                if total_needed <= stock:
                    # 库存充足，移除该项
                    pending_items = [item for item in pending_items if item.get("ingredient_id") != ing_id]
                else:
                    # 更新缺货量
                    existing_item["need_quantity"] = total_needed - stock
                    existing_item["sources"] = sources
            else:
                # 创建新的待购项
                inventory_ing = inventory_map.get(ing_id)
                if not inventory_ing:
                    continue
                
                stock = inventory_ing.get("quantity", 0)
                if need_qty <= stock:
                    continue  # 库存充足，不需要采购
                
                best_price, best_shop = price_map.get(ing_id, (None, "待定"))
                
                pending_items.append({
                    "ingredient_id": ing_id,
                    "ingredient_name": inventory_ing.get("name", "未知"),
                    "need_quantity": need_qty - stock,
                    "unit": "",
                    "shop_name": best_shop,
                    "price": best_price or 0,
                    "checked": False,
                    "sources": {plan_id: need_qty}
                })
    
    elif operation == 'deleted':
        new_pending_items = []
        
        for item in pending_items:
            sources = item.get("sources", {})
            if plan_id not in sources:
                # 该项不来自被删除的计划，保留
                new_pending_items.append(item)
                continue
            
            # 移除该计划的贡献
            removed_qty = sources.pop(plan_id)
            
            if not sources:
                # 没有其他来源了，移除该项
                continue
            
            # 更新总需求量
            inventory_ing = inventory_map.get(item.get("ingredient_id"))
            total_needed = sum(sources.values())
            stock = inventory_ing.get("quantity", 0) if inventory_ing else 0
            
            if total_needed <= stock:
                # 库存充足，移除该项
                continue
            
            # 更新缺货量
            item["need_quantity"] = total_needed - stock
            item["sources"] = sources
            new_pending_items.append(item)
        
        pending_items = new_pending_items
    
    # 保存更新后的任务
    supabase_client.table("purchase_tasks").update({
        "pending_items": pending_items
    }).eq("id", task_data["id"]).execute()
