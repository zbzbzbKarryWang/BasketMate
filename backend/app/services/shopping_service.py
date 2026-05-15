from typing import List, Dict, Any, Optional
from datetime import datetime


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
    blacklist: List[str]
) -> List[Dict[str, Any]]:
    """计算待购食材列表"""
    need_by_ing_id: Dict[str, float] = {}
    
    for plan in plan_rows:
        if plan.get("breakfast_recipe_id"):
            recipe = recipe_map.get(plan["breakfast_recipe_id"])
            if recipe:
                for ing_ref in parse_recipe_ingredients(recipe.get("ingredients") or []):
                    ing_id = ing_ref.get("ingredient_id")
                    if ing_id:
                        need_by_ing_id[ing_id] = need_by_ing_id.get(ing_id, 0) + ing_ref.get("quantity", 0)
        
        for meal_id in (plan.get("meal_ids") or []):
            recipe = recipe_map.get(meal_id)
            if recipe:
                for ing_ref in parse_recipe_ingredients(recipe.get("ingredients") or []):
                    ing_id = ing_ref.get("ingredient_id")
                    if ing_id:
                        need_by_ing_id[ing_id] = need_by_ing_id.get(ing_id, 0) + ing_ref.get("quantity", 0)
    
    inventory_map = {row["id"]: row for row in inventory}
    
    # 预构建价格映射 {ingredient_id: (price, shop_name)}
    price_map: Dict[str, tuple] = {}
    for price in prices:
        ing_id = price.get("ingredient_id")
        if ing_id:
            p = price.get("price", 0)
            if ing_id not in price_map or p < price_map[ing_id][0]:
                price_map[ing_id] = (p, price.get("shop_name", "待定"))
    
    pending_items = []
    for ing_id, need_qty in need_by_ing_id.items():
        if ing_id in blacklist:
            continue
        ing = inventory_map.get(ing_id)
        if not ing:
            continue
        stock = ing.get("quantity", 0)
        if stock >= need_qty:
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
    
    return pending_items


def update_inventory_on_purchase(
    supabase_client,
    pending_items: List[Dict[str, Any]]
) -> None:
    """完成采购后更新库存"""
    if not pending_items:
        return
    
    updates = []
    for item in pending_items:
        ing_id = item.get("ingredient_id")
        need_qty = item.get("need_quantity", 0)
        if ing_id and need_qty:
            updates.append({"id": ing_id, "quantity": need_qty, "added_at": datetime.now().isoformat()})
    
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
