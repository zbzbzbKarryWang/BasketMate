"""
AI 工具模块 - BasketMate Agent 工具集

为 LangChain Agent 提供全部业务工具函数，覆盖用户画像、食材库存、
菜谱管理、计划管理、采购管理、价格比价、店铺管理、小票OCR、
日志查看和智能分析等模块。

@tool 装饰器用于 LangChain Agent 注册，无 LangChain 时使用无操作回退。
"""


# ========== 装饰器兼容层 ==========

try:
    from langchain.tools import tool as langchain_tool
except ImportError:
    def langchain_tool(func):
        """LangChain 未安装时的 no-op 回退装饰器"""
        func._is_tool = True
        return func


import json
import os
import re
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from .. import database
from ..database import get_supabase
from ..logger import get_logger
from ..services.user_profile_service import get_user_profile as _svc_get_profile

logger = get_logger("basketmate")

# =====================================================================
#  内部辅助函数
# =====================================================================

_USER_ID = "default"  # 单用户默认值


def _get_profile() -> dict:
    """获取或创建用户画像"""
    resp = database.supabase.table("user_profiles").select("*").eq("user_id", _USER_ID).maybe_single().execute()
    if resp and resp.data:
        return resp.data
    insert = database.supabase.table("user_profiles").insert({
        "user_id": _USER_ID,
        "favorite_recipes": [],
        "favorite_ingredients": [],
        "disliked_ingredients": []
    }).execute()
    if insert and insert.data:
        return insert.data[0]
    return {"id": "", "user_id": _USER_ID, "favorite_recipes": [], "favorite_ingredients": [], "disliked_ingredients": []}


def _update_profile(profile_id: str, updates: dict) -> dict:
    """更新用户画像"""
    resp = database.supabase.table("user_profiles").update(updates).eq("id", profile_id).execute()
    return (resp.data[0] if resp and resp.data else _get_profile())


def _append_to_profile_list(profile_id: str, field: str, value: str) -> dict:
    """向画像列表字段追加一个值（去重）"""
    profile = _get_profile()
    current = profile.get(field) or []
    if value not in current:
        current.append(value)
    return _update_profile(profile_id, {field: current})


def _remove_from_profile_list(profile_id: str, field: str, value: str) -> dict:
    """从画像列表字段移除一个值"""
    profile = _get_profile()
    current = profile.get(field) or []
    if value in current:
        current.remove(value)
    return _update_profile(profile_id, {field: current})


def _batch_fill_ingredient_names(recipes: List[dict]) -> None:
    """批量查询食材名称并填充到菜谱的 ingredients 数组中"""
    ids_set = set()
    for r in recipes:
        for ing in (r.get("ingredients") or []):
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            if ing_id:
                ids_set.add(ing_id)
    if not ids_set:
        return
    ing_resp = database.supabase.table("ingredients").select("id, name").in_("id", list(ids_set)).execute()
    id_name = {i["id"]: i["name"] for i in (ing_resp.data or [])}
    for r in recipes:
        filled = []
        for ing in (r.get("ingredients") or []):
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            filled.append({
                "ingredient_id": ing_id,
                "quantity": ing.get("quantity", 0),
                "name": id_name.get(ing_id, "未知食材")
            })
        r["ingredients"] = filled


# =====================================================================
#  一、用户画像 (8)
# =====================================================================

@langchain_tool
def get_user_profile() -> str:
    """
    获取当前用户画像，包含收藏菜谱、喜爱食材、忌口食材等偏好信息。

    参数：无

    返回：JSON 字符串，包含 favorite_recipes, favorite_ingredients, disliked_ingredients 等字段。

    副作用：无（只读）
    """
    profile = _get_profile()
    logger.info(f"[tool:get_user_profile] 获取成功")
    return json.dumps(profile, ensure_ascii=False, default=str)


@langchain_tool
def update_user_profile(favorite_recipes: Optional[List[str]] = None,
                         favorite_ingredients: Optional[List[str]] = None,
                         disliked_ingredients: Optional[List[str]] = None) -> str:
    """
    批量更新用户画像偏好（覆盖写入）。
    不传的字段保持原值不变。

    参数：
        favorite_recipes: 收藏菜谱 ID 列表，传 None 不修改
        favorite_ingredients: 喜爱食材名称列表，传 None 不修改
        disliked_ingredients: 忌口食材名称列表，传 None 不修改

    返回：JSON 字符串，更新后的完整用户画像。

    副作用：修改数据库 user_profiles 表。
    """
    profile = _get_profile()
    pid = profile.get("id")
    if not pid:
        return json.dumps({"error": "用户画像不存在"}, ensure_ascii=False)

    updates = {}
    if favorite_recipes is not None:
        updates["favorite_recipes"] = favorite_recipes
    if favorite_ingredients is not None:
        updates["favorite_ingredients"] = favorite_ingredients
    if disliked_ingredients is not None:
        updates["disliked_ingredients"] = disliked_ingredients

    result = _update_profile(pid, updates)
    logger.info(f"[tool:update_user_profile] 更新字段: {list(updates.keys())}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def add_favorite_recipe(recipe_id: str) -> str:
    """
    将菜谱 ID 加入收藏列表（去重）。

    参数：
        recipe_id: 菜谱 ID

    返回：JSON 字符串，更新后的用户画像。

    副作用：修改数据库 user_profiles.favorite_recipes。
    """
    profile = _get_profile()
    pid = profile.get("id")
    result = _append_to_profile_list(pid, "favorite_recipes", recipe_id)
    logger.info(f"[tool:add_favorite_recipe] recipe_id={recipe_id}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def remove_favorite_recipe(recipe_id: str) -> str:
    """
    从收藏列表中移除指定菜谱 ID。

    参数：
        recipe_id: 菜谱 ID

    返回：JSON 字符串，更新后的用户画像。

    副作用：修改数据库 user_profiles.favorite_recipes。
    """
    profile = _get_profile()
    pid = profile.get("id")
    result = _remove_from_profile_list(pid, "favorite_recipes", recipe_id)
    logger.info(f"[tool:remove_favorite_recipe] recipe_id={recipe_id}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def add_favorite_ingredient(ingredient_name: str) -> str:
    """
    将食材名称加入喜爱列表（去重）。

    参数：
        ingredient_name: 食材名称

    返回：JSON 字符串，更新后的用户画像。

    副作用：修改数据库 user_profiles.favorite_ingredients。
    """
    profile = _get_profile()
    pid = profile.get("id")
    result = _append_to_profile_list(pid, "favorite_ingredients", ingredient_name)
    logger.info(f"[tool:add_favorite_ingredient] name={ingredient_name}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def remove_favorite_ingredient(ingredient_name: str) -> str:
    """
    从喜爱列表中移除指定食材名称。

    参数：
        ingredient_name: 食材名称

    返回：JSON 字符串，更新后的用户画像。

    副作用：修改数据库 user_profiles.favorite_ingredients。
    """
    profile = _get_profile()
    pid = profile.get("id")
    result = _remove_from_profile_list(pid, "favorite_ingredients", ingredient_name)
    logger.info(f"[tool:remove_favorite_ingredient] name={ingredient_name}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def add_disliked_ingredient(ingredient_name: str) -> str:
    """
    将食材名称加入忌口列表（去重）。

    参数：
        ingredient_name: 食材名称

    返回：JSON 字符串，更新后的用户画像。

    副作用：修改数据库 user_profiles.disliked_ingredients。
    """
    profile = _get_profile()
    pid = profile.get("id")
    result = _append_to_profile_list(pid, "disliked_ingredients", ingredient_name)
    logger.info(f"[tool:add_disliked_ingredient] name={ingredient_name}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def remove_disliked_ingredient(ingredient_name: str) -> str:
    """
    从忌口列表中移除指定食材名称。

    参数：
        ingredient_name: 食材名称

    返回：JSON 字符串，更新后的用户画像。

    副作用：修改数据库 user_profiles.disliked_ingredients。
    """
    profile = _get_profile()
    pid = profile.get("id")
    result = _remove_from_profile_list(pid, "disliked_ingredients", ingredient_name)
    logger.info(f"[tool:remove_disliked_ingredient] name={ingredient_name}")
    return json.dumps(result, ensure_ascii=False, default=str)


# =====================================================================
#  二、食材库存管理 (8)
# =====================================================================

@langchain_tool
def get_all_ingredients() -> str:
    """
    获取所有食材库存列表。

    参数：无

    返回：JSON 字符串，包含所有食材的 id、name、quantity、alias、added_at 等信息。

    副作用：无（只读）
    """
    resp = database.supabase.table("ingredients").select("*").execute()
    data = resp.data or []
    logger.info(f"[tool:get_all_ingredients] 共 {len(data)} 条")
    return json.dumps(data, ensure_ascii=False, default=str)


@langchain_tool
def search_ingredients(query: str) -> str:
    """
    按名称模糊搜索食材。

    参数：
        query: 搜索关键词，支持模糊匹配

    返回：JSON 字符串，匹配的食材列表（id、name）。

    副作用：无（只读）
    """
    if not query or not query.strip():
        return json.dumps([], ensure_ascii=False)
    resp = database.supabase.table("ingredients").select("id, name").ilike("name", f"%{query.strip()}%").execute()
    result = [{"id": r["id"], "name": r["name"]} for r in (resp.data or [])]
    logger.info(f"[tool:search_ingredients] query={query}, 结果数={len(result)}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def get_ingredient_by_id(ingredient_id: str) -> str:
    """
    按 ID 获取单个食材详情。

    参数：
        ingredient_id: 食材 ID

    返回：JSON 字符串，食材完整信息；不存在时返回错误信息。

    副作用：无（只读）
    """
    resp = database.supabase.table("ingredients").select("*").eq("id", ingredient_id).maybe_single().execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"食材不存在: {ingredient_id}"}, ensure_ascii=False)
    logger.info(f"[tool:get_ingredient_by_id] id={ingredient_id}")
    return json.dumps(resp.data, ensure_ascii=False, default=str)


@langchain_tool
def create_or_update_ingredient(name: str, quantity: float = 0, alias: Optional[str] = None) -> str:
    """
    创建或更新食材（按名称去重）。
    若食材已存在则累加数量，否则创建新食材。

    参数：
        name: 食材名称（必填）
        quantity: 数量，默认 0
        alias: 别名，可选

    返回：JSON 字符串，创建或更新后的食材信息。

    副作用：修改数据库 ingredients 表。
    """
    existing = database.supabase.table("ingredients").select("*").eq("name", name).maybe_single().execute()
    if existing and existing.data:
        new_qty = (existing.data.get("quantity") or 0) + quantity
        resp = database.supabase.table("ingredients").update({
            "quantity": new_qty,
            "alias": alias or existing.data.get("alias"),
        }).eq("id", existing.data["id"]).execute()
        logger.info(f"[tool:create_or_update_ingredient] 更新 name={name}, quantity={new_qty}")
        return json.dumps(resp.data[0] if resp and resp.data else existing.data, ensure_ascii=False, default=str)

    insert_resp = database.supabase.table("ingredients").insert({
        "name": name,
        "quantity": quantity,
        "alias": alias or None,
        "added_at": datetime.now().isoformat()
    }).execute()
    logger.info(f"[tool:create_or_update_ingredient] 创建 name={name}, quantity={quantity}")
    return json.dumps(insert_resp.data[0] if insert_resp and insert_resp.data else {}, ensure_ascii=False, default=str)


@langchain_tool
def update_ingredient(ingredient_id: str, name: Optional[str] = None,
                       quantity: Optional[float] = None, alias: Optional[str] = None) -> str:
    """
    更新指定食材的字段。

    参数：
        ingredient_id: 食材 ID（必填）
        name: 新名称，可选
        quantity: 新数量，可选
        alias: 新别名，可选

    返回：JSON 字符串，更新后的食材信息。

    副作用：修改数据库 ingredients 表。
    """
    updates = {}
    if name is not None:
        updates["name"] = name
    if quantity is not None:
        updates["quantity"] = quantity
    if alias is not None:
        updates["alias"] = alias
    if not updates:
        return json.dumps({"error": "没有提供任何更新字段"}, ensure_ascii=False)

    resp = database.supabase.table("ingredients").update(updates).eq("id", ingredient_id).execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"食材不存在: {ingredient_id}"}, ensure_ascii=False)
    logger.info(f"[tool:update_ingredient] id={ingredient_id}, updates={updates}")
    return json.dumps(resp.data[0], ensure_ascii=False, default=str)


@langchain_tool
def delete_ingredient(ingredient_id: str) -> str:
    """
    删除指定食材。

    参数：
        ingredient_id: 食材 ID

    返回：JSON 字符串，操作结果。

    副作用：删除数据库 ingredients 表中的记录。
    """
    resp = database.supabase.table("ingredients").delete().eq("id", ingredient_id).execute()
    success = bool(resp and resp.data)
    logger.info(f"[tool:delete_ingredient] id={ingredient_id}, success={success}")
    return json.dumps({"success": success, "ingredient_id": ingredient_id}, ensure_ascii=False)


@langchain_tool
def resolve_ingredient(name_or_id: str) -> str:
    """
    按名称或 ID 解析食材。先按 ID 精确查找，再按名称查找。

    参数：
        name_or_id: 食材名称或 ID

    返回：JSON 字符串，匹配的食材信息；未找到返回空。

    副作用：无（只读）
    """
    import re
    
    try:
        # 判断是否为 UUID 格式
        is_uuid = bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', name_or_id.lower()))
        
        if is_uuid:
            # 按 ID 查找
            resp = database.supabase.table("ingredients").select("*").eq("id", name_or_id).maybe_single().execute()
            if resp and resp.data:
                logger.info(f"[tool:resolve_ingredient] 按ID匹配: {name_or_id}")
                return json.dumps(resp.data, ensure_ascii=False, default=str)
        else:
            # 按名称查找（忽略大小写）
            resp = database.supabase.table("ingredients").select("*").ilike("name", f"%{name_or_id}%").maybe_single().execute()
            if resp and resp.data:
                logger.info(f"[tool:resolve_ingredient] 按名称匹配: {name_or_id}")
                return json.dumps(resp.data, ensure_ascii=False, default=str)

        logger.info(f"[tool:resolve_ingredient] 未找到食材: {name_or_id}")
        return json.dumps({
            "error": f"未找到名为「{name_or_id}」的食材",
            "suggestion": "请确认食材名称是否正确，或使用 create_ingredient 工具创建新食材记录（默认数量为0）"
        }, ensure_ascii=False)
        
    except Exception as e:
        logger.error(f"[tool:resolve_ingredient] 查询失败: {name_or_id}, 错误: {str(e)}")
        return json.dumps({
            "error": f"查询食材时发生错误: {str(e)}",
            "suggestion": "请稍后重试，或确认食材名称是否正确"
        }, ensure_ascii=False)


@langchain_tool
def batch_update_ingredients(items: str) -> str:
    """
    批量更新多个食材的数量。
    
    参数：
        items: JSON 字符串，格式为 [{"id": "xxx", "quantity": 1.5}, ...]

    返回：JSON 字符串，更新结果。

    副作用：修改数据库 ingredients 表中多条记录。
    """
    try:
        item_list = json.loads(items) if isinstance(items, str) else items
    except (json.JSONDecodeError, TypeError):
        return json.dumps({"error": "items 参数必须是有效的 JSON 数组字符串"}, ensure_ascii=False)

    results = []
    for item in item_list:
        ing_id = item.get("id")
        qty = item.get("quantity")
        if ing_id and qty is not None:
            resp = database.supabase.table("ingredients").update({"quantity": qty}).eq("id", ing_id).execute()
            results.append({"id": ing_id, "updated": bool(resp and resp.data)})

    logger.info(f"[tool:batch_update_ingredients] 更新 {len(results)} 条")
    return json.dumps({"updated_count": sum(1 for r in results if r["updated"]), "results": results}, ensure_ascii=False)


# =====================================================================
#  三、菜谱管理 (6)
# =====================================================================

@langchain_tool
def get_all_recipes(limit: int = 50) -> str:
    """
    获取所有菜谱列表，自动按用户画像过滤忌口食材，并按收藏和喜好排序。
    内部调用 get_user_profile 获取用户偏好。

    参数：
        limit: 返回数量上限，默认 50

    返回：JSON 字符串，过滤并排序后的菜谱列表，每个菜谱含 name、category、ingredients 等。

    副作用：无（只读）
    """
    db = get_supabase()
    profile = _get_profile()
    disliked = set(profile.get("disliked_ingredients") or [])
    favorites = set(profile.get("favorite_recipes") or [])
    fav_ingredients = set(profile.get("favorite_ingredients") or [])

    recipes_resp = db.table("recipes").select("id, name, category, ingredients, notes").limit(limit).execute()
    recipes = recipes_resp.data or []

    if not recipes:
        return json.dumps([], ensure_ascii=False)

    # 批量获取食材名称
    all_ing_ids = set()
    for r in recipes:
        for ing in (r.get("ingredients") or []):
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            if ing_id:
                all_ing_ids.add(ing_id)

    id_name = {}
    if all_ing_ids:
        ing_resp = db.table("ingredients").select("id, name").in_("id", list(all_ing_ids)).execute()
        id_name = {i["id"]: i["name"] for i in (ing_resp.data or [])}

    # 填充名称 + 过滤忌口
    filtered = []
    for r in recipes:
        ing_names = set()
        filled = []
        for ing in (r.get("ingredients") or []):
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            name = id_name.get(ing_id, "未知食材")
            ing_names.add(name)
            filled.append({"ingredient_id": ing_id, "quantity": ing.get("quantity", 0), "name": name})

        # 忌口过滤
        if disliked & ing_names:
            continue

        r["ingredients"] = filled
        r["is_favorite"] = r["id"] in favorites
        r["favorite_ingredient_count"] = len(fav_ingredients & ing_names)
        filtered.append(r)

    # 排序：收藏 > 喜爱食材匹配数多 > 名称
    filtered.sort(key=lambda x: (-(1 if x["is_favorite"] else 0), -x["favorite_ingredient_count"], x.get("name", "")))

    # 清理排序字段
    for r in filtered:
        r.pop("favorite_ingredient_count", None)

    logger.info(f"[tool:get_all_recipes] 共 {len(recipes)} 条，过滤忌口后 {len(filtered)} 条")
    return json.dumps(filtered, ensure_ascii=False, default=str)


@langchain_tool
def get_recipe_by_id(recipe_id: str) -> str:
    """
    按 ID 获取菜谱详情，包含食材明细（名称、数量）。

    参数：
        recipe_id: 菜谱 ID

    返回：JSON 字符串，菜谱完整信息，ingredients 数组含 name 字段。

    副作用：无（只读）
    """
    db = get_supabase()
    resp = db.table("recipes").select("*").eq("id", recipe_id).maybe_single().execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"菜谱不存在: {recipe_id}"}, ensure_ascii=False)

    recipe = resp.data
    _batch_fill_ingredient_names([recipe])
    logger.info(f"[tool:get_recipe_by_id] id={recipe_id}")
    return json.dumps(recipe, ensure_ascii=False, default=str)


@langchain_tool
def create_recipe(name: str, category: str, ingredients: str, notes: str = "") -> str:
    """
    创建新菜谱。

    参数：
        name: 菜谱名称（必填）
        category: 类别，如"中餐"、"西餐"、"汤品"等（必填）
        ingredients: JSON 字符串，格式 [{"ingredient_id": "xxx", "quantity": 1.5, "name": "xx"}, ...]（必填）
        notes: 备注，可选

    返回：JSON 字符串，创建后的菜谱信息。

    副作用：在数据库 recipes 表中插入新记录。
    """
    try:
        ing_list = json.loads(ingredients) if isinstance(ingredients, str) else ingredients
    except (json.JSONDecodeError, TypeError):
        return json.dumps({"error": "ingredients 必须是有效 JSON 数组"}, ensure_ascii=False)

    # 转换为数据库格式
    db_ingredients = []
    for ing in ing_list:
        db_ingredients.append({
            "ingredientId": ing.get("ingredient_id", ""),
            "quantity": ing.get("quantity", 0),
        })

    db = get_supabase()
    resp = db.table("recipes").insert({
        "name": name,
        "category": category,
        "ingredients": db_ingredients,
        "notes": notes
    }).execute()

    if not resp or not resp.data:
        return json.dumps({"error": "创建菜谱失败"}, ensure_ascii=False)

    result = resp.data[0]
    _batch_fill_ingredient_names([result])
    logger.info(f"[tool:create_recipe] name={name}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def update_recipe(recipe_id: str, name: Optional[str] = None, category: Optional[str] = None,
                   ingredients: Optional[str] = None, notes: Optional[str] = None) -> str:
    """
    更新菜谱信息。

    参数：
        recipe_id: 菜谱 ID（必填）
        name: 新名称，可选
        category: 新类别，可选
        ingredients: 新食材 JSON 数组字符串，格式同 create_recipe，可选
        notes: 新备注，可选

    返回：JSON 字符串，更新后的菜谱信息。

    副作用：修改数据库 recipes 表。
    """
    updates = {}
    if name is not None:
        updates["name"] = name
    if category is not None:
        updates["category"] = category
    if notes is not None:
        updates["notes"] = notes
    if ingredients is not None:
        try:
            ing_list = json.loads(ingredients) if isinstance(ingredients, str) else ingredients
        except (json.JSONDecodeError, TypeError):
            return json.dumps({"error": "ingredients 必须是有效 JSON 数组"}, ensure_ascii=False)
        db_ingredients = []
        for ing in ing_list:
            db_ingredients.append({
                "ingredientId": ing.get("ingredient_id", ""),
                "quantity": ing.get("quantity", 0),
            })
        updates["ingredients"] = db_ingredients

    if not updates:
        return json.dumps({"error": "没有提供任何更新字段"}, ensure_ascii=False)

    db = get_supabase()
    resp = db.table("recipes").update(updates).eq("id", recipe_id).execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"菜谱不存在: {recipe_id}"}, ensure_ascii=False)

    result = resp.data[0]
    _batch_fill_ingredient_names([result])
    logger.info(f"[tool:update_recipe] id={recipe_id}, updates={list(updates.keys())}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def delete_recipe(recipe_id: str) -> str:
    """
    删除指定菜谱。

    参数：
        recipe_id: 菜谱 ID

    返回：JSON 字符串，操作结果。

    副作用：删除数据库 recipes 表中的记录。
    """
    db = get_supabase()
    resp = db.table("recipes").delete().eq("id", recipe_id).execute()
    success = bool(resp and resp.data)
    logger.info(f"[tool:delete_recipe] id={recipe_id}, success={success}")
    return json.dumps({"success": success, "recipe_id": recipe_id}, ensure_ascii=False)


# ---- 菜谱推荐（保留原有逻辑） ----

@langchain_tool
def recommend_recipes_by_ingredients(ingredient_names: Optional[str] = None) -> str:
    """
    根据食材推荐菜谱。自动排除含忌口食材的菜谱，按收藏和喜爱食材匹配度排序。

    参数：
        ingredient_names: JSON 数组字符串，如 '["番茄","鸡蛋"]'，为空时使用全部库存食材

    返回：JSON 字符串，含 recipes 数组和 message 字段。

    副作用：无（只读）
    """
    db = get_supabase()
    profile = _get_profile()
    disliked = set(profile.get("disliked_ingredients") or [])
    favorite_recipes = set(profile.get("favorite_recipes") or [])
    favorite_ingredients = set(profile.get("favorite_ingredients") or [])

    # 解析食材名
    if ingredient_names:
        try:
            names = json.loads(ingredient_names) if isinstance(ingredient_names, str) else ingredient_names
        except (json.JSONDecodeError, TypeError):
            names = []
        target_names = [n.strip() for n in names if isinstance(n, str) and n.strip()]
    else:
        ing_resp = db.table("ingredients").select("name").gt("quantity", 0).execute()
        target_names = [i["name"] for i in (ing_resp.data or [])]

    if not target_names:
        return json.dumps({"recipes": [], "message": "没有可用的食材"}, ensure_ascii=False)

    all_r = db.table("recipes").select("id, name, category, ingredients").execute()
    recipes = all_r.data or []
    if not recipes:
        return json.dumps({"recipes": [], "message": "暂无菜谱数据"}, ensure_ascii=False)

    # 收集食材ID
    all_ids = set()
    r_ing_map = {}
    for r in recipes:
        r_ing_map[r["id"]] = []
        for ing in (r.get("ingredients") or []):
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            if ing_id:
                all_ids.add(ing_id)
                r_ing_map[r["id"]].append(ing_id)

    id_name = {}
    if all_ids:
        ir = db.table("ingredients").select("id, name").in_("id", list(all_ids)).execute()
        id_name = {i["id"]: i["name"] for i in (ir.data or [])}

    scored = []
    for r in recipes:
        rid = r["id"]
        ing_ids = r_ing_map.get(rid, [])
        r_names = set(id_name.get(iid, "") for iid in ing_ids)
        if disliked & r_names:
            continue
        matched = r_names & set(target_names)
        fav_match = r_names & favorite_ingredients
        score = (100 if rid in favorite_recipes else 0) + len(matched) * 5 + len(fav_match) * 10
        reasons = []
        if rid in favorite_recipes:
            reasons.append("收藏菜谱")
        if matched:
            reasons.append(f"匹配食材: {', '.join(list(matched)[:3])}")
        if fav_match:
            reasons.append(f"爱吃的: {', '.join(list(fav_match)[:3])}")
        full_ing = [{"ingredient_id": iid, "name": id_name.get(iid, "未知")} for iid in ing_ids]
        scored.append({
            "id": rid, "name": r.get("name"), "category": r.get("category", ""),
            "ingredients": full_ing, "match_reason": "；".join(reasons) if reasons else "适合口味",
            "_score": score
        })

    scored.sort(key=lambda x: x["_score"], reverse=True)
    result = scored[:10]
    for r in result:
        r.pop("_score", None)

    msg = f"为您找到 {len(result)} 道推荐菜谱"
    logger.info(f"[tool:recommend_recipes_by_ingredients] targets={target_names[:5]}, results={len(result)}")
    return json.dumps({"recipes": result, "message": msg}, ensure_ascii=False, default=str)


# =====================================================================
#  四、计划管理 (7)
# =====================================================================

@langchain_tool
def get_all_plans(limit: int = 30) -> str:
    """
    获取所有计划列表，按日期降序排列。

    参数：
        limit: 返回数量上限，默认 30

    返回：JSON 字符串，计划列表。

    副作用：无（只读）
    """
    resp = database.supabase.table("plans").select("*").order("date", desc=True).limit(limit).execute()
    data = resp.data or []
    logger.info(f"[tool:get_all_plans] 共 {len(data)} 条")
    return json.dumps(data, ensure_ascii=False, default=str)


@langchain_tool
def get_plan_by_id(plan_id: str) -> str:
    """
    按 ID 获取计划详情。

    参数：
        plan_id: 计划 ID

    返回：JSON 字符串，计划完整信息。

    副作用：无（只读）
    """
    resp = database.supabase.table("plans").select("*").eq("id", plan_id).maybe_single().execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"计划不存在: {plan_id}"}, ensure_ascii=False)
    logger.info(f"[tool:get_plan_by_id] id={plan_id}")
    return json.dumps(resp.data, ensure_ascii=False, default=str)


@langchain_tool
def search_plans_by_date(date_str: str) -> str:
    """
    按日期搜索计划。

    参数：
        date_str: 日期字符串，格式 YYYY-MM-DD

    返回：JSON 字符串，匹配的计划列表。

    副作用：无（只读）
    """
    resp = database.supabase.table("plans").select("*").eq("date", date_str).execute()
    data = resp.data or []
    logger.info(f"[tool:search_plans_by_date] date={date_str}, 结果数={len(data)}")
    return json.dumps(data, ensure_ascii=False, default=str)


@langchain_tool
def create_plan(date: str, breakfast_recipe_id: str = "", meal_ids: str = "[]") -> str:
    """
    创建新计划。
    创建成功后自动触发采购任务增量刷新。

    参数：
        date: 日期，格式 YYYY-MM-DD（必填）
        breakfast_recipe_id: 早餐菜谱 ID，可选
        meal_ids: JSON 数组字符串，午晚餐菜谱 ID 列表，如 '["id1","id2"]'

    返回：JSON 字符串，创建后的计划信息。

    副作用：在数据库 plans 表中插入记录，并触发采购任务刷新。
    """
    try:
        meal_list = json.loads(meal_ids) if isinstance(meal_ids, str) else meal_ids
    except (json.JSONDecodeError, TypeError):
        meal_list = []

    # 检查是否已存在
    existing = database.supabase.table("plans").select("id").eq("date", date).maybe_single().execute()
    if existing and existing.data:
        return json.dumps({"error": f"该日期已有计划: {date}"}, ensure_ascii=False)

    resp = database.supabase.table("plans").insert({
        "date": date,
        "breakfast_recipe_id": breakfast_recipe_id or None,
        "meal_ids": meal_list
    }).execute()

    if not resp or not resp.data:
        return json.dumps({"error": "创建计划失败"}, ensure_ascii=False)

    result = resp.data[0]

    # 触发采购刷新
    try:
        from ..routers.plans import refresh_purchase_task
        refresh_purchase_task()
        logger.info(f"[tool:create_plan] 已触发采购刷新")
    except Exception as e:
        logger.warning(f"[tool:create_plan] 采购刷新失败: {e}")

    logger.info(f"[tool:create_plan] date={date}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def update_plan(plan_id: str, date: Optional[str] = None,
                 breakfast_recipe_id: Optional[str] = None,
                 meal_ids: Optional[str] = None) -> str:
    """
    更新计划信息。
    更新成功后自动触发采购任务增量刷新。

    参数：
        plan_id: 计划 ID（必填）
        date: 新日期，可选
        breakfast_recipe_id: 新早餐菜谱 ID，可选
        meal_ids: 新午晚餐菜谱 ID JSON 数组，可选

    返回：JSON 字符串，更新后的计划信息。

    副作用：修改数据库 plans 表，并触发采购任务刷新。
    """
    updates = {}
    if date is not None:
        updates["date"] = date
    if breakfast_recipe_id is not None:
        updates["breakfast_recipe_id"] = breakfast_recipe_id
    if meal_ids is not None:
        try:
            updates["meal_ids"] = json.loads(meal_ids) if isinstance(meal_ids, str) else meal_ids
        except (json.JSONDecodeError, TypeError):
            return json.dumps({"error": "meal_ids 必须是有效 JSON 数组"}, ensure_ascii=False)

    if not updates:
        return json.dumps({"error": "没有提供任何更新字段"}, ensure_ascii=False)

    resp = database.supabase.table("plans").update(updates).eq("id", plan_id).execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"计划不存在: {plan_id}"}, ensure_ascii=False)

    result = resp.data[0]

    # 触发采购刷新
    try:
        from ..routers.plans import refresh_purchase_task
        refresh_purchase_task()
    except Exception as e:
        logger.warning(f"[tool:update_plan] 采购刷新失败: {e}")

    logger.info(f"[tool:update_plan] id={plan_id}, updates={list(updates.keys())}")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def delete_plan(plan_id: str) -> str:
    """
    删除指定计划。
    删除成功后自动触发采购任务增量刷新。

    参数：
        plan_id: 计划 ID

    返回：JSON 字符串，操作结果。

    副作用：删除数据库 plans 表中的记录，并触发采购任务刷新。
    """
    resp = database.supabase.table("plans").delete().eq("id", plan_id).execute()
    success = bool(resp and resp.data)

    if success:
        try:
            from ..routers.plans import refresh_purchase_task
            refresh_purchase_task()
        except Exception as e:
            logger.warning(f"[tool:delete_plan] 采购刷新失败: {e}")

    logger.info(f"[tool:delete_plan] id={plan_id}, success={success}")
    return json.dumps({"success": success, "plan_id": plan_id}, ensure_ascii=False)


# ---- 智能计划生成（保留原有逻辑） ----

@langchain_tool
def generate_meal_plan(strategy: str = "no_repeat", start_date: str = "tomorrow", days: int = 1) -> str:
    """
    生成多日菜谱计划草案（仅推荐，不创建实际计划）。
    
    ⚠️ 日期解析规则（重要）：
    - 'today': 今天
    - 'tomorrow': 明天  
    - 'day_after_tomorrow': 后天
    - 具体日期格式: 'YYYY-MM-DD'，必须是今天或以后的日期
    - 注意：只支持生成今天、明天、后天这三天的计划，不支持更远的日期
    
    ⚠️ 错误处理：
    - 如果用户请求的日期在过去（如"昨天"、"前天"或历史日期），返回错误提示
    - 如果用户请求的日期超出后天（如大后天或更远），返回错误提示
    
    参数：
        strategy: 策略，'inventory_first' 或 'no_repeat'（默认）
        start_date: 开始日期，'today'/'tomorrow'/'day_after_tomorrow' 或 'YYYY-MM-DD' 格式
        days: 生成天数，1-3（默认 1），从 start_date 开始计算
    
    示例：
        - generate_meal_plan(strategy="no_repeat", start_date="tomorrow", days=1)  # 明天1天
        - generate_meal_plan(strategy="inventory_first", start_date="today", days=1)  # 今天1天
        - generate_meal_plan(strategy="no_repeat", start_date="day_after_tomorrow", days=1)  # 后天1天
        - generate_meal_plan(strategy="no_repeat", start_date="2026-06-05", days=2)  # 具体日期2天

    返回：JSON 字符串，包含 days 数组（每日期/星期/早中晚菜谱）和 total_recipes_used。

    副作用：无（只读，不创建计划）
    """
    from datetime import date
    
    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_after_tomorrow = today + timedelta(days=2)
    
    # 解析开始日期
    if start_date == "today":
        actual_start_date = today
    elif start_date == "tomorrow":
        actual_start_date = tomorrow
    elif start_date == "day_after_tomorrow":
        actual_start_date = day_after_tomorrow
    else:
        try:
            actual_start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            return json.dumps({"error": f"无效的日期格式: {start_date}，请使用 'today'/'tomorrow'/'day_after_tomorrow' 或 'YYYY-MM-DD' 格式"}, ensure_ascii=False)
    
    # 检查日期是否在过去
    if actual_start_date < today:
        return json.dumps({
            "error": f"无法生成过去的计划。你请求的日期是 {actual_start_date}，但只能生成今天（{today}）及以后的计划。",
            "today": str(today),
            "suggestion": "请换个日期，比如今天、明天或后天。"
        }, ensure_ascii=False)
    
    # 检查日期是否超出后天
    if actual_start_date > day_after_tomorrow:
        return json.dumps({
            "error": f"超出可生成范围。你请求的日期是 {actual_start_date}，但目前只支持生成今天（{today}）、明天（{tomorrow}）、后天（{day_after_tomorrow}）这三天的计划。",
            "today": str(today),
            "tomorrow": str(tomorrow),
            "day_after_tomorrow": str(day_after_tomorrow),
            "suggestion": "请换个日期，或者只生成最近三天的计划。"
        }, ensure_ascii=False)
    
    # 限制最大天数
    if days < 1 or days > 3:
        return json.dumps({"error": "days 必须在 1-3 之间"}, ensure_ascii=False)
    
    # 检查结束日期是否超出范围
    end_date = actual_start_date + timedelta(days=days - 1)
    if end_date > day_after_tomorrow:
        available_days = (day_after_tomorrow - actual_start_date).days + 1
        if available_days < 1:
            return json.dumps({"error": "日期范围超出可生成范围"}, ensure_ascii=False)
        days = available_days
        end_date = day_after_tomorrow
    
    # 验证策略
    if strategy not in ("inventory_first", "no_repeat"):
        return json.dumps({"error": "strategy 必须为 'inventory_first' 或 'no_repeat'"}, ensure_ascii=False)

    db = get_supabase()
    profile = _get_profile()
    disliked = set(profile.get("disliked_ingredients") or [])
    favorite_recipes = set(profile.get("favorite_recipes") or [])
    favorite_ingredients = set(profile.get("favorite_ingredients") or [])

    def execute_with_retry(query_func, max_retries=3):
        """执行数据库查询，支持重试"""
        for attempt in range(max_retries):
            try:
                return query_func()
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"[tool:generate_meal_plan] 数据库查询失败，重试第 {attempt + 1} 次: {e}")
                    import time
                    time.sleep(0.5)
                    continue
                raise

    # 获取所有菜谱
    recipes_resp = execute_with_retry(lambda: db.table("recipes").select("id, name, category, ingredients").execute())
    all_recipes = recipes_resp.data or []
    if not all_recipes:
        return json.dumps({"days": [], "message": "暂无菜谱数据"}, ensure_ascii=False)

    # 获取库存食材
    inventory_resp = execute_with_retry(lambda: db.table("ingredients").select("id, name, added_at, quantity").gt("quantity", 0).execute())
    inventory_data = inventory_resp.data or []
    inventory_names = {i["name"] for i in inventory_data}
    inventory_id_to_name = {i["id"]: i["name"] for i in inventory_data}

    # 收集食材名称
    all_ids = set()
    r_ing_map = {}
    for r in all_recipes:
        r_ing_map[r["id"]] = []
        for ing in (r.get("ingredients") or []):
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            if ing_id:
                all_ids.add(ing_id)
                r_ing_map[r["id"]].append(ing_id)

    id_name = {}
    if all_ids:
        ir = execute_with_retry(lambda: db.table("ingredients").select("id, name, added_at, quantity").in_("id", list(all_ids)).execute())
        id_name = {i["id"]: i["name"] for i in (ir.data or [])}

    r_names_map = {}
    for rid, iids in r_ing_map.items():
        r_names_map[rid] = set(id_name.get(iid, "") for iid in iids)

    # 过滤忌口
    valid = [r for r in all_recipes if not (disliked & r_names_map.get(r["id"], set()))]
    if not valid:
        return json.dumps({"days": [], "message": "没有符合口味的菜谱"}, ensure_ascii=False)

    selected_ids = []
    reasons = {}

    if strategy == "inventory_first":
        # 库存优先：只推荐使用了库存食材的菜
        inventory_by_age = sorted(inventory_data, key=lambda x: x.get("added_at", ""))
        old_names = [i["name"] for i in inventory_by_age[:min(10, len(inventory_by_age))]]
        
        scores = []
        for r in valid:
            rid = r["id"]
            rn = r_names_map.get(rid, set())
            # 计算匹配的库存食材
            matched_inventory = rn & inventory_names
            # 计算匹配的早期库存食材（优先）
            matched_old = rn & set(old_names)
            
            if not matched_inventory:
                continue  # 跳过没有库存食材的菜
            
            # 得分：早期库存食材权重更高
            score = len(matched_old) * 20 + len(matched_inventory - set(old_names)) * 10
            # 收藏菜谱加分
            if rid in favorite_recipes:
                score += 50
            
            scores.append((rid, score, matched_inventory, matched_old))
        
        if not scores:
            return json.dumps({"days": [], "message": "库存中没有匹配的食材，无法生成库存优先计划"}, ensure_ascii=False)
        
        scores.sort(key=lambda x: x[1], reverse=True)
        for rid, sc, matched_inv, matched_old in scores[:days * 3]:
            selected_ids.append(rid)
            # 标注使用了哪些库存食材
            old_str = f"早期库存: {', '.join(matched_old)}" if matched_old else ""
            other_str = f"库存: {', '.join(matched_inv - matched_old)}" if matched_inv - matched_old else ""
            reason_parts = [p for p in [old_str, other_str] if p]
            reasons[rid] = " | ".join(reason_parts) + f"（得分{sc}）"
            
    else:
        # 偏好优先：标注每个菜的偏好原因
        five_ago = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
        recent = execute_with_retry(lambda: db.table("plans").select("breakfast_recipe_id, meal_ids").gte("date", five_ago).execute())
        used = set()
        freq = {}
        for p in (recent.data or []):
            if p.get("breakfast_recipe_id"):
                used.add(p["breakfast_recipe_id"])
                freq[p["breakfast_recipe_id"]] = freq.get(p["breakfast_recipe_id"], 0) + 1
            for mid in (p.get("meal_ids") or []):
                used.add(mid)
                freq[mid] = freq.get(mid, 0) + 1
        
        # 计算每道菜的偏好得分和原因
        scores_with_reason = []
        for r in valid:
            rid = r["id"]
            rn = r_names_map.get(rid, set())
            score = 0
            reason_parts = []
            
            # 1. 收藏菜谱
            if rid in favorite_recipes:
                score += 100
                reason_parts.append("❤️ 收藏菜谱")
            
            # 2. 使用了喜爱的食材
            matched_favorite = rn & favorite_ingredients
            if matched_favorite:
                score += 50
                reason_parts.append(f"⭐ 喜爱食材: {', '.join(matched_favorite)}")
            
            # 3. 近期未使用
            if rid not in used:
                score += 30
                reason_parts.append("🆕 近期未使用")
            else:
                # 近期使用次数少的排前面
                score -= freq.get(rid, 0) * 10
                reason_parts.append(f"🔄 近期使用{freq.get(rid, 0)}次")
            
            # 4. 使用了库存食材
            matched_inventory = rn & inventory_names
            if matched_inventory:
                score += 20
                reason_parts.append(f"📦 库存食材: {', '.join(list(matched_inventory)[:3])}")
            
            scores_with_reason.append((rid, score, " | ".join(reason_parts)))
        
        scores_with_reason.sort(key=lambda x: x[1], reverse=True)
        for rid, sc, reason in scores_with_reason[:days * 3]:
            selected_ids.append(rid)
            reasons[rid] = reason

    # 分配每日（从 actual_start_date 开始）
    result_days = []
    used_pool = set()
    cn = {"Monday": "周一", "Tuesday": "周二", "Wednesday": "周三", "Thursday": "周四", "Friday": "周五", "Saturday": "周六", "Sunday": "周日"}

    for d in range(days):
        dt = actual_start_date + timedelta(days=d)
        ds = dt.strftime("%Y-%m-%d")
        dn = cn.get(dt.strftime("%A"), ds)
        slots = []
        for mt in ["breakfast", "lunch", "dinner"]:
            rid = None
            rn = None
            slot_reason = None
            for sid in selected_ids:
                if sid not in used_pool:
                    rid = sid
                    rn = next((r["name"] for r in all_recipes if r["id"] == sid), None)
                    slot_reason = reasons.get(sid, "")
                    used_pool.add(sid)
                    break
            slots.append({
                "meal_type": mt, 
                "recipe_id": rid, 
                "recipe_name": rn,
                "reason": slot_reason
            })
        result_days.append({
            "date": ds, "day_name": dn, "slots": slots,
            "strategy": "库存优先" if strategy == "inventory_first" else "偏好优先"
        })

    logger.info(f"[tool:generate_meal_plan] strategy={strategy}, days={days}, recipes={len(used_pool)}")
    return json.dumps({
        "days": result_days,
        "total_recipes_used": len(used_pool),
        "message": f"已生成 {days} 天菜谱建议，共 {len(used_pool)} 道菜"
    }, ensure_ascii=False, default=str)


# =====================================================================
#  五、采购管理 (6)
# =====================================================================

@langchain_tool
def get_purchase_task() -> str:
    """
    获取当前活跃的采购任务（只读）。

    参数：无

    返回：JSON 字符串，含 id, status, pending_items, custom_items, completed_items, removed_ingredient_ids。
          无活跃任务时返回空数据。

    副作用：无（只读，不修改数据库）
    """
    resp = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    if not resp or not resp.data:
        logger.info(f"[tool:get_purchase_task] 无活跃任务")
        return json.dumps({
            "id": "", "status": False,
            "pending_items": [], "custom_items": [],
            "completed_items": [], "removed_ingredient_ids": []
        }, ensure_ascii=False)

    task = resp.data
    logger.info(f"[tool:get_purchase_task] 待购项 {len(task.get('pending_items', []))} 条")
    return json.dumps({
        "id": task["id"], "status": True,
        "pending_items": task.get("pending_items", []),
        "custom_items": task.get("custom_items", []),
        "completed_items": task.get("completed_items", []),
        "removed_ingredient_ids": task.get("removed_ingredient_ids", [])
    }, ensure_ascii=False, default=str)


@langchain_tool
def refresh_purchase_task() -> str:
    """
    刷新采购任务，重新计算所有今日及以后计划的待购食材。

    参数：无

    返回：JSON 字符串，刷新结果（含待购项数量）。

    副作用：更新数据库 purchase_tasks 表的 pending_items。
    """
    try:
        from ..routers.plans import refresh_purchase_task as do_refresh
        do_refresh()
        resp = database.supabase.table("purchase_tasks").select("pending_items").eq("status", True).maybe_single().execute()
        count = len(resp.data.get("pending_items", [])) if resp and resp.data else 0
        logger.info(f"[tool:refresh_purchase_task] 完成，待购项 {count} 条")
        return json.dumps({"success": True, "pending_count": count, "message": f"采购任务已刷新，共 {count} 个待购项"}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[tool:refresh_purchase_task] 失败: {e}", exc_info=True)
        return json.dumps({"success": False, "error": str(e)}, ensure_ascii=False)


@langchain_tool
def complete_purchase() -> str:
    """
    完成采购任务。
    将当前活跃任务标记为完成，扣除库存中对应食材数量，
    并自动将关联计划中的菜谱ID加入用户收藏、食材名加入喜爱列表（去重）。

    参数：无

    返回：JSON 字符串，操作结果。

    副作用：
        - 更新 purchase_tasks.status=false, completed_at=now
        - 调用 complete_purchase RPC 或逐条更新库存
        - 更新 user_profiles.favorite_recipes / favorite_ingredients
    """
    task_resp = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    if not task_resp or not task_resp.data:
        return json.dumps({"error": "没有活跃的采购任务"}, ensure_ascii=False)

    task = task_resp.data
    task_id = task["id"]
    pending = task.get("pending_items") or []
    custom = task.get("custom_items") or []
    completed = task.get("completed_items") or []

    # 1. 扣减库存：已完成的项才扣减
    for item in completed:
        ing_id = item.get("ingredient_id")
        qty = item.get("quantity", 0)
        if ing_id and qty > 0:
            try:
                ing = database.supabase.table("ingredients").select("quantity").eq("id", ing_id).maybe_single().execute()
                if ing and ing.data:
                    current_qty = ing.data.get("quantity", 0)
                    new_qty = max(0, current_qty - qty)
                    database.supabase.table("ingredients").update({"quantity": new_qty}).eq("id", ing_id).execute()
            except Exception as e:
                logger.warning(f"[tool:complete_purchase] 扣减库存失败 ing_id={ing_id}: {e}")

    # 2. 标记任务完成
    now = datetime.now().isoformat()
    database.supabase.table("purchase_tasks").update({
        "status": False,
        "completed_at": now
    }).eq("id", task_id).execute()

    # 3. 更新用户偏好：从关联计划中收集菜谱和食材
    try:
        profile = _get_profile()
        pid = profile.get("id")

        # 获取当前任务关联的计划
        plans_resp = database.supabase.table("plans").select("breakfast_recipe_id, meal_ids").gte("date", datetime.now().strftime("%Y-%m-%d")).execute()
        plans = plans_resp.data or []

        collected_recipes = set(profile.get("favorite_recipes") or [])
        collected_ingredients = set(profile.get("favorite_ingredients") or [])

        recipe_ids_to_fetch = set()
        for p in plans:
            if p.get("breakfast_recipe_id"):
                recipe_ids_to_fetch.add(p["breakfast_recipe_id"])
            for mid in (p.get("meal_ids") or []):
                recipe_ids_to_fetch.add(mid)

        if recipe_ids_to_fetch:
            recipes_resp = database.supabase.table("recipes").select("id, name, ingredients").in_("id", list(recipe_ids_to_fetch)).execute()
            for r in (recipes_resp.data or []):
                collected_recipes.add(r["id"])
                for ing in (r.get("ingredients") or []):
                    ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
                    # 获取食材名
                    if ing_id:
                        ing_info = database.supabase.table("ingredients").select("name").eq("id", ing_id).maybe_single().execute()
                        if ing_info and ing_info.data:
                            collected_ingredients.add(ing_info.data["name"])

        _update_profile(pid, {
            "favorite_recipes": list(collected_recipes),
            "favorite_ingredients": list(collected_ingredients)
        })
        logger.info(f"[tool:complete_purchase] 更新偏好: recipes={len(collected_recipes)}, ingredients={len(collected_ingredients)}")
    except Exception as e:
        logger.warning(f"[tool:complete_purchase] 更新偏好失败: {e}")

    logger.info(f"[tool:complete_purchase] task_id={task_id}")
    return json.dumps({"success": True, "message": "采购已完成，库存已更新，偏好已自动更新"}, ensure_ascii=False)


@langchain_tool
def delete_purchase_item(item_index: int, item_type: str = "pending") -> str:
    """
    从采购任务中删除指定项（移至已删除区域）。

    参数：
        item_index: 在 pending_items 或 custom_items 数组中的索引
        item_type: "pending" 或 "custom"，默认 "pending"

    返回：JSON 字符串，更新后的任务信息。

    副作用：修改数据库 purchase_tasks 表。
    """
    task_resp = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    if not task_resp or not task_resp.data:
        return json.dumps({"error": "没有活跃的采购任务"}, ensure_ascii=False)

    task = task_resp.data
    removed_ids = task.get("removed_ingredient_ids") or []

    if item_type == "pending":
        items = task.get("pending_items") or []
    elif item_type == "custom":
        items = task.get("custom_items") or []
    else:
        return json.dumps({"error": "item_type 必须为 'pending' 或 'custom'"}, ensure_ascii=False)

    if item_index < 0 or item_index >= len(items):
        return json.dumps({"error": f"索引 {item_index} 超出范围，共 {len(items)} 项"}, ensure_ascii=False)

    removed_item = items.pop(item_index)
    ing_id = removed_item.get("ingredient_id") or removed_item.get("id")
    if ing_id and ing_id not in removed_ids:
        removed_ids.append(ing_id)

    update_data = {"removed_ingredient_ids": removed_ids}
    if item_type == "pending":
        update_data["pending_items"] = items
    else:
        update_data["custom_items"] = items

    database.supabase.table("purchase_tasks").update(update_data).eq("id", task["id"]).execute()
    logger.info(f"[tool:delete_purchase_item] type={item_type}, index={item_index}")
    return json.dumps({"success": True, "message": f"已删除 {item_type}[{item_index}]"}, ensure_ascii=False)


@langchain_tool
def clear_purchase_task() -> str:
    """
    清空整个采购任务（标记为完成）。

    参数：无

    返回：JSON 字符串，操作结果。

    副作用：设置 purchase_tasks.status=false, completed_at=now。
    """
    task_resp = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    if not task_resp or not task_resp.data:
        return json.dumps({"error": "没有活跃的采购任务"}, ensure_ascii=False)

    task_id = task_resp.data["id"]
    now = datetime.now().isoformat()
    database.supabase.table("purchase_tasks").update({
        "status": False,
        "completed_at": now
    }).eq("id", task_id).execute()

    logger.info(f"[tool:clear_purchase_task] task_id={task_id}")
    return json.dumps({"success": True, "message": "采购任务已清空"}, ensure_ascii=False)


@langchain_tool
def add_to_purchase_task(item_name: str, quantity: float = 1.0, item_type: str = "custom") -> str:
    """
    向采购任务添加自定义项。

    参数：
        item_name: 物品名称（必填）
        quantity: 数量，默认 1.0
        item_type: "pending" 或 "custom"，默认 "custom"

    返回：JSON 字符串，更新后的任务信息。

    副作用：修改数据库 purchase_tasks 表的 pending_items 或 custom_items。
    """
    task_resp = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
    if not task_resp or not task_resp.data:
        # 自动创建任务
        database.supabase.table("purchase_tasks").insert({
            "status": True, "pending_items": [], "custom_items": [],
            "completed_items": [], "removed_ingredient_ids": []
        }).execute()
        task_resp = database.supabase.table("purchase_tasks").select("*").eq("status", True).maybe_single().execute()
        if not task_resp or not task_resp.data:
            return json.dumps({"error": "创建采购任务失败"}, ensure_ascii=False)

    task = task_resp.data
    items = task.get(f"{item_type}_items") or []
    items.append({"name": item_name, "quantity": quantity, "added_at": datetime.now().isoformat()})

    database.supabase.table("purchase_tasks").update({f"{item_type}_items": items}).eq("id", task["id"]).execute()
    logger.info(f"[tool:add_to_purchase_task] name={item_name}, qty={quantity}, type={item_type}")
    return json.dumps({"success": True, "message": f"已添加 '{item_name}' 到采购清单"}, ensure_ascii=False)


# =====================================================================
#  六、价格/比价 (3)
# =====================================================================

@langchain_tool
def get_all_prices() -> str:
    """
    获取所有价格记录（含店铺名称）。

    参数：无

    返回：JSON 字符串，价格列表，每条含 shop_name。

    副作用：无（只读）
    """
    resp = database.supabase.table("prices").select("*, shops(name)").execute()
    result = []
    for item in (resp.data or []):
        item["shop_name"] = item.get("shops", {}).get("name") if isinstance(item.get("shops"), dict) else None
        result.append(item)
    logger.info(f"[tool:get_all_prices] 共 {len(result)} 条")
    return json.dumps(result, ensure_ascii=False, default=str)


@langchain_tool
def create_or_update_price(ingredient_id: str, shop_id: str, price: float) -> str:
    """
    创建或更新价格记录（按 ingredient_id + shop_id 去重）。

    参数：
        ingredient_id: 食材 ID（必填）
        shop_id: 店铺 ID（必填）
        price: 价格（必填）

    返回：JSON 字符串，操作结果。

    副作用：修改数据库 prices 表，触发采购任务价格刷新。
    """
    try:
        database.supabase.rpc("upsert_price_with_refresh", {
            "p_ingredient_id": ingredient_id,
            "p_shop_id": shop_id,
            "p_price": price
        }).execute()
        logger.info(f"[tool:create_or_update_price] ingredient={ingredient_id}, shop={shop_id}, price={price}")
        return json.dumps({"success": True, "message": "价格已更新"}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[tool:create_or_update_price] 失败: {e}", exc_info=True)
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@langchain_tool
def delete_price(price_id: str) -> str:
    """
    删除指定价格记录。

    参数：
        price_id: 价格记录 ID

    返回：JSON 字符串，操作结果。

    副作用：删除数据库 prices 表中的记录。
    """
    resp = database.supabase.table("prices").delete().eq("id", price_id).execute()
    success = bool(resp and resp.data)
    logger.info(f"[tool:delete_price] id={price_id}, success={success}")
    return json.dumps({"success": success, "price_id": price_id}, ensure_ascii=False)


# =====================================================================
#  七、店铺管理 (4)
# =====================================================================

@langchain_tool
def get_all_shops() -> str:
    """
    获取所有店铺列表。

    参数：无

    返回：JSON 字符串，店铺列表。

    副作用：无（只读）
    """
    resp = database.supabase.table("shops").select("*").order("name").execute()
    data = resp.data or []
    logger.info(f"[tool:get_all_shops] 共 {len(data)} 条")
    return json.dumps(data, ensure_ascii=False, default=str)


@langchain_tool
def create_shop(name: str) -> str:
    """
    创建新店铺。

    参数：
        name: 店铺名称（必填）

    返回：JSON 字符串，创建后的店铺信息。

    副作用：在数据库 shops 表中插入记录。
    """
    resp = database.supabase.table("shops").insert({"name": name}).execute()
    if not resp or not resp.data:
        return json.dumps({"error": "创建店铺失败"}, ensure_ascii=False)
    logger.info(f"[tool:create_shop] name={name}")
    return json.dumps(resp.data[0], ensure_ascii=False, default=str)


@langchain_tool
def update_shop(shop_id: str, name: str) -> str:
    """
    更新店铺名称。

    参数：
        shop_id: 店铺 ID（必填）
        name: 新名称（必填）

    返回：JSON 字符串，更新后的店铺信息。

    副作用：修改数据库 shops 表。
    """
    resp = database.supabase.table("shops").update({"name": name}).eq("id", shop_id).execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"店铺不存在: {shop_id}"}, ensure_ascii=False)
    logger.info(f"[tool:update_shop] id={shop_id}, name={name}")
    return json.dumps(resp.data[0], ensure_ascii=False, default=str)


@langchain_tool
def delete_shop(shop_id: str) -> str:
    """
    删除指定店铺（级联删除关联价格）。

    参数：
        shop_id: 店铺 ID

    返回：JSON 字符串，操作结果。

    副作用：调用 delete_shop_cascade RPC 原子性删除店铺和关联价格。
    """
    try:
        database.supabase.rpc("delete_shop_cascade", {"p_shop_id": shop_id}).execute()
        logger.info(f"[tool:delete_shop] id={shop_id}")
        return json.dumps({"success": True, "shop_id": shop_id, "message": "店铺已删除"}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[tool:delete_shop] 失败: {e}", exc_info=True)
        return json.dumps({"error": str(e)}, ensure_ascii=False)


# =====================================================================
#  八、小票 OCR/导入 (4)
# =====================================================================

@langchain_tool
def upload_receipt(image_base64: str, import_type: str = "receipt", shop_name: str = "") -> str:
    """
    上传小票图片进行 OCR 识别。

    参数：
        image_base64: Base64 编码的图片数据（必填）
        import_type: 导入类型，默认 "receipt"
        shop_name: 店铺名称，可选

    返回：JSON 字符串，含导入记录 ID 和初始状态。

    副作用：在数据库 import_records 表中创建记录，后台执行 OCR。
    """
    import uuid
    record_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    database.supabase.table("import_records").insert({
        "id": record_id,
        "status": "processing",
        "items": [],
        "import_type": import_type,
        "shop_name": shop_name or None,
        "created_at": now
    }).execute()

    logger.info(f"[tool:upload_receipt] record_id={record_id}, type={import_type}")

    # 同步执行 OCR（简化版）
    try:
        from ..services.ocr_service import recognize_receipt
        items = recognize_receipt(image_base64, 0)
        # recognize_receipt 是 async，此处简化处理
        import asyncio
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        items = loop.run_until_complete(recognize_receipt(image_base64, 0))

        database.supabase.table("import_records").update({
            "status": "pending",
            "items": items
        }).eq("id", record_id).execute()
    except Exception as e:
        logger.error(f"[tool:upload_receipt] OCR 失败: {e}")
        database.supabase.table("import_records").update({
            "status": "failed"
        }).eq("id", record_id).execute()

    return json.dumps({"record_id": record_id, "status": "processing", "message": "小票已上传，正在识别"}, ensure_ascii=False)


@langchain_tool
def get_import_records(limit: int = 10) -> str:
    """
    获取最近的导入记录列表。

    参数：
        limit: 返回数量，默认 10

    返回：JSON 字符串，导入记录列表。

    副作用：无（只读）
    """
    resp = database.supabase.table("import_records").select("*").order("created_at", desc=True).limit(limit).execute()
    data = resp.data or []
    logger.info(f"[tool:get_import_records] 共 {len(data)} 条")
    return json.dumps(data, ensure_ascii=False, default=str)


@langchain_tool
def get_import_record(record_id: str) -> str:
    """
    获取单条导入记录详情（含识别结果）。

    参数：
        record_id: 导入记录 ID

    返回：JSON 字符串，导入记录完整信息。

    副作用：无（只读）
    """
    resp = database.supabase.table("import_records").select("*").eq("id", record_id).maybe_single().execute()
    if not resp or not resp.data:
        return json.dumps({"error": f"导入记录不存在: {record_id}"}, ensure_ascii=False)
    logger.info(f"[tool:get_import_record] id={record_id}")
    return json.dumps(resp.data, ensure_ascii=False, default=str)


@langchain_tool
def confirm_import(record_id: str, confirmed_items: str, deleted_patterns: str = "[]") -> str:
    """
    确认导入：将识别结果中的食材正式添加到库存和价格表。

    参数：
        record_id: 导入记录 ID（必填）
        confirmed_items: JSON 数组字符串，格式 [{"name":"xx","price":1.5,"quantity":2,"target_ingredient":"xx"}, ...]
        deleted_patterns: JSON 数组字符串，要加入黑名单的识别错误模式，默认 []

    返回：JSON 字符串，操作结果。

    副作用：插入/更新 ingredients 和 prices 表，更新 import_records 状态为 confirmed。
    """
    try:
        items = json.loads(confirmed_items) if isinstance(confirmed_items, str) else confirmed_items
    except (json.JSONDecodeError, TypeError):
        return json.dumps({"error": "confirmed_items 必须是有效 JSON 数组"}, ensure_ascii=False)

    try:
        patterns = json.loads(deleted_patterns) if isinstance(deleted_patterns, str) else deleted_patterns
    except (json.JSONDecodeError, TypeError):
        patterns = []

    # 添加黑名单
    if patterns:
        try:
            from ..services.ocr_service import add_to_blacklist
            for p in patterns:
                add_to_blacklist(p)
        except Exception as e:
            logger.warning(f"[tool:confirm_import] 黑名单添加失败: {e}")

    results = []
    for item in items:
        name = item.get("target_ingredient") or item.get("name", "")
        price = item.get("price", 0)
        qty = item.get("quantity", 1)
        if not name:
            continue

        # 创建或更新食材
        existing = database.supabase.table("ingredients").select("id, quantity").eq("name", name).maybe_single().execute()
        if existing and existing.data:
            new_qty = (existing.data.get("quantity") or 0) + qty
            database.supabase.table("ingredients").update({"quantity": new_qty}).eq("id", existing.data["id"]).execute()
            results.append({"name": name, "action": "updated", "quantity": new_qty})
        else:
            ing_resp = database.supabase.table("ingredients").insert({
                "name": name, "quantity": qty, "added_at": datetime.now().isoformat()
            }).execute()
            results.append({"name": name, "action": "created", "quantity": qty})

    # 标记导入确认
    database.supabase.table("import_records").update({
        "status": "confirmed",
        "items": items
    }).eq("id", record_id).execute()

    logger.info(f"[tool:confirm_import] record={record_id}, items={len(results)}")
    return json.dumps({"success": True, "processed": len(results), "results": results}, ensure_ascii=False)


# =====================================================================
#  九、日志 (2)
# =====================================================================

@langchain_tool
def get_recent_logs(minutes: int = 10) -> str:
    """
    获取最近的后端服务器日志。

    参数：
        minutes: 查看最近 N 分钟的日志，默认 10

    返回：字符串，日志纯文本内容。

    副作用：无（只读）
    """
    import os
    from collections import deque
    log_file = "/logs/app.log"
    if not os.path.exists(log_file):
        return "暂无日志"
    with open(log_file, "r", encoding="utf-8") as f:
        lines = list(deque(f, maxlen=500))
    if minutes * 1000 < len(lines):
        lines = lines[-minutes * 1000:]
    logger.info(f"[tool:get_recent_logs] minutes={minutes}, lines={len(lines)}")
    return "".join(lines)


@langchain_tool
def get_frontend_logs(minutes: int = 10) -> str:
    """
    获取最近的前端日志。

    参数：
        minutes: 查看最近 N 分钟的日志，默认 10

    返回：字符串，前端日志纯文本内容。

    副作用：无（只读）
    """
    import os
    from collections import deque
    log_file = "/logs/frontend.log"
    if not os.path.exists(log_file):
        return "暂无前端日志"
    with open(log_file, "r", encoding="utf-8") as f:
        lines = list(deque(f, maxlen=500))
    if minutes * 100 < len(lines):
        lines = lines[-minutes * 100:]
    logger.info(f"[tool:get_frontend_logs] minutes={minutes}, lines={len(lines)}")
    return "".join(lines)


# =====================================================================
#  十、智能分析与联网 (4)
# =====================================================================

@langchain_tool
def check_inventory_alerts(days_threshold: int = 7) -> str:
    """
    检查库存中超期或低库存的食材，发出提醒。

    参数：
        days_threshold: 食材添加超过 N 天视为"超期"，默认 7 天

    返回：JSON 字符串，包含超期食材列表、低库存列表。

    副作用：无（只读）
    """
    threshold_date = (datetime.now() - timedelta(days=days_threshold)).isoformat()
    resp = database.supabase.table("ingredients").select("id, name, quantity, added_at").gt("quantity", 0).execute()
    items = resp.data or []

    expired = []  # 添加超过阈值的
    low_stock = []  # 数量 <= 1 的
    for item in items:
        added = item.get("added_at", "")
        if added and added < threshold_date:
            expired.append({"id": item["id"], "name": item["name"], "quantity": item["quantity"], "added_at": added, "days_since_added": (datetime.now() - datetime.fromisoformat(added.replace("Z", "+00:00"))).days if added else 0})
        if (item.get("quantity") or 0) <= 1 and (item.get("quantity") or 0) > 0:
            low_stock.append({"id": item["id"], "name": item["name"], "quantity": item["quantity"]})

    logger.info(f"[tool:check_inventory_alerts] 超期 {len(expired)} 条, 低库存 {len(low_stock)} 条")
    return json.dumps({
        "expired_count": len(expired),
        "expired_items": expired,
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock,
        "message": f"共 {len(expired)} 种食材添加超过 {days_threshold} 天，{len(low_stock)} 种食材库存不足"
    }, ensure_ascii=False, default=str)


@langchain_tool
def search_recipe_online(query: str) -> str:
    """
    联网搜索菜谱做法，通过博查搜索 API 获取中文搜索结果。

    参数：
        query: 搜索关键词，如"番茄炒蛋做法"

    返回：JSON 字符串，包含搜索结果列表。

    副作用：无（只读）
    """
    if not query or not query.strip():
        return json.dumps({"error": "请提供搜索关键词"}, ensure_ascii=False)

    api_key = os.getenv("BOCHAAI_API_KEY", "")
    if not api_key:
        logger.warning("[tool:search_recipe_online] BOCHAAI_API_KEY 未配置")
        return json.dumps({
            "results": [],
            "message": "在线搜索功能未配置 API Key，请在 .env 中设置 BOCHAAI_API_KEY。",
        }, ensure_ascii=False)

    try:
        import requests
        resp = requests.post(
            "https://api.bochaai.com/v1/web-search",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "query": f"{query.strip()} 做法 菜谱",
                "summary": True,
                "count": 5,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        web_pages = data.get("data", {}).get("webPages", {})
        raw_results = web_pages.get("value", [])
        results = []
        for r in raw_results[:5]:
            results.append({
                "title": r.get("name", ""),
                "link": r.get("url", ""),
                "snippet": r.get("summary", "") or r.get("snippet", ""),
            })

        logger.info(f"[tool:search_recipe_online] query={query}, results={len(results)}")
        return json.dumps({
            "results": results,
            "total": len(results),
            "message": f"找到 {len(results)} 条关于「{query}」的搜索结果",
        }, ensure_ascii=False)

    except requests.RequestException as e:
        logger.error(f"[tool:search_recipe_online] 请求失败: {e}")
        return json.dumps({
            "results": [],
            "message": f"搜索失败: {str(e)}",
        }, ensure_ascii=False)


@langchain_tool
def get_favorite_recipes_stats() -> str:
    """
    历史高频菜谱统计：分析历史计划中最常出现的菜谱。

    参数：无

    返回：JSON 字符串，按使用次数降序排列的菜谱统计列表。

    副作用：无（只读）
    """
    plans_resp = database.supabase.table("plans").select("breakfast_recipe_id, meal_ids").execute()
    plans = plans_resp.data or []

    freq = {}
    for p in plans:
        if p.get("breakfast_recipe_id"):
            rid = p["breakfast_recipe_id"]
            freq[rid] = freq.get(rid, 0) + 1
        for mid in (p.get("meal_ids") or []):
            freq[mid] = freq.get(mid, 0) + 1

    if not freq:
        return json.dumps({"stats": [], "message": "暂无历史数据"}, ensure_ascii=False)

    # 获取菜谱名称
    recipe_ids = list(freq.keys())
    recipes_resp = database.supabase.table("recipes").select("id, name, category").in_("id", recipe_ids).execute()
    name_map = {r["id"]: {"name": r["name"], "category": r.get("category", "")} for r in (recipes_resp.data or [])}

    stats = []
    for rid, count in sorted(freq.items(), key=lambda x: x[1], reverse=True):
        info = name_map.get(rid, {"name": "未知菜谱", "category": ""})
        stats.append({
            "recipe_id": rid,
            "name": info["name"],
            "category": info["category"],
            "usage_count": count
        })

    logger.info(f"[tool:get_favorite_recipes_stats] 共 {len(stats)} 条统计")
    return json.dumps({
        "stats": stats,
        "total_recipes": len(stats),
        "message": f"历史计划中共使用 {len(stats)} 道菜谱，最高频次 {stats[0]['usage_count']} 次"
    }, ensure_ascii=False, default=str)


@langchain_tool
def get_user_preference_summary() -> str:
    """
    获取用户偏好摘要：综合画像、高频菜谱、库存状况的汇总报告。

    参数：无

    返回：JSON 字符串，包含偏好摘要、高频菜谱 Top3、库存概况。

    副作用：无（只读）
    """
    # 1. 用户画像
    profile = _get_profile()

    # 2. 高频菜谱 Top3
    plans_resp = database.supabase.table("plans").select("breakfast_recipe_id, meal_ids").execute()
    freq = {}
    for p in (plans_resp.data or []):
        for rid in [p.get("breakfast_recipe_id")] + (p.get("meal_ids") or []):
            if rid:
                freq[rid] = freq.get(rid, 0) + 1
    top_ids = sorted(freq, key=freq.get, reverse=True)[:3]
    top_recipes = []
    if top_ids:
        r_resp = database.supabase.table("recipes").select("id, name, category").in_("id", top_ids).execute()
        for r in (r_resp.data or []):
            r["usage_count"] = freq.get(r["id"], 0)
            top_recipes.append(r)

    # 3. 库存概况
    ing_resp = database.supabase.table("ingredients").select("id, name, quantity").execute()
    total_types = len(ing_resp.data or [])
    total_qty = sum(i.get("quantity", 0) for i in (ing_resp.data or []))
    low_stock = [i["name"] for i in (ing_resp.data or []) if 0 < (i.get("quantity") or 0) <= 1]

    summary = {
        "favorite_recipes_count": len(profile.get("favorite_recipes") or []),
        "favorite_ingredients_count": len(profile.get("favorite_ingredients") or []),
        "disliked_ingredients_count": len(profile.get("disliked_ingredients") or []),
        "disliked_ingredients": profile.get("disliked_ingredients") or [],
        "top_recipes": top_recipes,
        "inventory": {
            "total_ingredient_types": total_types,
            "total_quantity": total_qty,
            "low_stock_items": low_stock
        }
    }

    logger.info(f"[tool:get_user_preference_summary] 生成摘要完成")
    return json.dumps(summary, ensure_ascii=False, default=str)


# =====================================================================
#  工具注册表 - 供 Agent 发现所有可用工具
# =====================================================================

# 按模块分类的工具函数引用列表，供 LangChain Agent 初始化时注册
TOOL_REGISTRY: List[str] = [
    # 用户画像 (8)
    "get_user_profile",
    "update_user_profile",
    "add_favorite_recipe",
    "remove_favorite_recipe",
    "add_favorite_ingredient",
    "remove_favorite_ingredient",
    "add_disliked_ingredient",
    "remove_disliked_ingredient",
    # 食材库存管理 (8)
    "get_all_ingredients",
    "search_ingredients",
    "get_ingredient_by_id",
    "create_or_update_ingredient",
    "update_ingredient",
    "delete_ingredient",
    "resolve_ingredient",
    "batch_update_ingredients",
    # 菜谱管理 (6)
    "get_all_recipes",
    "get_recipe_by_id",
    "create_recipe",
    "update_recipe",
    "delete_recipe",
    "recommend_recipes_by_ingredients",
    # 计划管理 (7)
    "get_all_plans",
    "get_plan_by_id",
    "search_plans_by_date",
    "create_plan",
    "update_plan",
    "delete_plan",
    "generate_meal_plan",
    # 采购管理 (6)
    "get_purchase_task",
    "refresh_purchase_task",
    "complete_purchase",
    "delete_purchase_item",
    "clear_purchase_task",
    "add_to_purchase_task",
    # 价格/比价 (3)
    "get_all_prices",
    "create_or_update_price",
    "delete_price",
    # 店铺管理 (4)
    "get_all_shops",
    "create_shop",
    "update_shop",
    "delete_shop",
    # 小票 OCR/导入 (4)
    "upload_receipt",
    "get_import_records",
    "get_import_record",
    "confirm_import",
    # 日志 (2)
    "get_recent_logs",
    "get_frontend_logs",
    # 智能分析与联网 (4)
    "check_inventory_alerts",
    "search_recipe_online",
    "get_favorite_recipes_stats",
    "get_user_preference_summary",
]


def get_all_tools():
    """
    获取所有已注册的工具函数对象列表。

    用于 LangChain Agent 初始化：
        from langchain.agents import initialize_agent
        tools = get_all_tools()
        agent = initialize_agent(tools, llm, ...)

    返回：List[Callable] 所有 @tool 装饰的函数对象
    """
    import sys
    current_module = sys.modules[__name__]
    tools = []
    for name in TOOL_REGISTRY:
        func = getattr(current_module, name, None)
        if func:
            tools.append(func)
    return tools