from typing import List, Dict, Any, Optional
from ..logger import get_logger

logger = get_logger("basketmate")


def get_user_profile() -> Dict[str, Any]:
    """
    获取用户画像，返回包含 favorite_recipes, favorite_ingredients, disliked_ingredients 的字典
    如果不存在，返回默认空数组
    """
    from .. import database
    
    try:
        response = database.supabase.table("user_profiles").select("*").eq("user_id", "default").maybe_single().execute()
        
        if response and response.data:
            return {
                "favorite_recipes": response.data.get("favorite_recipes") or [],
                "favorite_ingredients": response.data.get("favorite_ingredients") or [],
                "disliked_ingredients": response.data.get("disliked_ingredients") or []
            }
        
        return {
            "favorite_recipes": [],
            "favorite_ingredients": [],
            "disliked_ingredients": []
        }
    except Exception as e:
        logger.error(f"[get_user_profile] 获取用户画像失败: {str(e)}")
        return {
            "favorite_recipes": [],
            "favorite_ingredients": [],
            "disliked_ingredients": []
        }


def filter_recipes_by_preference(
    recipes: List[Dict[str, Any]],
    ingredient_name_map: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    根据用户偏好过滤和排序菜谱
    
    过滤规则：
    - 如果菜谱的任意食材名称在 disliked_ingredients 中，排除该菜谱
    
    排序规则：
    - 优先：菜谱ID在 favorite_recipes 中的排最前
    - 其次：根据包含 favorite_ingredients 的数量降序排序
    
    参数：
    - recipes: 菜谱列表，每个菜谱包含 id, name, ingredients 等字段
    - ingredient_name_map: 食材ID到名称的映射 {ingredient_id: name}
    
    返回：
    - 过滤并排序后的菜谱列表
    """
    profile = get_user_profile()
    disliked_ingredients = set(profile.get("disliked_ingredients") or [])
    favorite_recipes = set(profile.get("favorite_recipes") or [])
    favorite_ingredients = set(profile.get("favorite_ingredients") or [])
    
    logger.info(f"[filter_recipes_by_preference] 忌口食材: {disliked_ingredients}")
    logger.info(f"[filter_recipes_by_preference] 喜爱菜谱: {favorite_recipes}")
    logger.info(f"[filter_recipes_by_preference] 喜爱食材: {favorite_ingredients}")
    
    # 计算每个菜谱的匹配分数和是否被过滤
    scored_recipes = []
    for recipe in recipes:
        recipe_id = recipe.get("id")
        ingredients_list = recipe.get("ingredients") or []
        
        # 获取菜谱的食材名称集合
        recipe_ingredient_names = set()
        for ing in ingredients_list:
            ing_id = ing.get("ingredient_id")
            if ing_id and ing_id in ingredient_name_map:
                recipe_ingredient_names.add(ingredient_name_map[ing_id])
            elif "name" in ing:
                recipe_ingredient_names.add(ing["name"])
        
        # 检查是否包含忌口食材
        has_disliked = bool(recipe_ingredient_names & disliked_ingredients)
        
        if has_disliked:
            logger.info(f"[filter_recipes_by_preference] 过滤菜谱 '{recipe.get('name')}' (包含忌口食材)")
            continue
        
        # 计算分数
        score = 0
        # 收藏的菜谱 +100 分
        if recipe_id in favorite_recipes:
            score += 100
        # 每个喜爱的食材 +1 分
        favorite_count = len(recipe_ingredient_names & favorite_ingredients)
        score += favorite_count
        
        recipe["_score"] = score
        recipe["_favorite_count"] = favorite_count
        scored_recipes.append(recipe)
    
    # 按分数降序排序
    scored_recipes.sort(key=lambda x: x.get("_score", 0), reverse=True)
    
    # 移除临时字段
    for recipe in scored_recipes:
        recipe.pop("_score", None)
        recipe.pop("_favorite_count", None)
    
    logger.info(f"[filter_recipes_by_preference] 过滤后菜谱数量: {len(scored_recipes)}")
    return scored_recipes


def get_recipe_ingredient_names(recipes: List[Dict[str, Any]]) -> Dict[str, str]:
    """
    从菜谱列表中提取所有食材ID，然后查询对应的名称
    返回 {ingredient_id: name} 映射
    """
    from .. import database
    
    # 收集所有食材ID
    ingredient_ids = set()
    for recipe in recipes:
        for ing in (recipe.get("ingredients") or []):
            ing_id = ing.get("ingredient_id")
            if ing_id:
                ingredient_ids.add(ing_id)
    
    if not ingredient_ids:
        return {}
    
    # 批量查询食材名称
    response = database.supabase.table("ingredients").select("id, name").in_("id", list(ingredient_ids)).execute()
    
    name_map = {}
    for ing in (response.data or []):
        name_map[ing["id"]] = ing["name"]
    
    return name_map
