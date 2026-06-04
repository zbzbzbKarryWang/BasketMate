import time
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from typing import List, Optional
from app import models as models
from app.database import get_supabase
from app.models import Recipe
from app.decorators import log_operation
from app.services.user_profile_service import filter_recipes_by_preference, get_recipe_ingredient_names

router = APIRouter(prefix="/api/recipes", tags=["recipes"])

@router.get("")
@log_operation("获取菜谱列表")
async def get_recipes(
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(None, ge=0)
):
    start_total = time.time()
    db = get_supabase()

    query = db.table("recipes").select("*")
    if limit is not None:
        query = query.limit(limit)
    if offset is not None:
        query = query.offset(offset)
    recipes_resp = query.execute()
    recipes = recipes_resp.data or []

    if not recipes:
        print(f"[耗时] GET /recipes {time.time() - start_total:.2f}s", flush=True)
        return models.ApiResponse.ok([])

    ids_set = set()
    for recipe in recipes:
        ingredients = recipe.get("ingredients") or []
        for ing in ingredients:
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            if ing_id:
                ids_set.add(ing_id)

    id_name_map = {}
    if ids_set:
        batch_start = time.time()
        ing_resp = db.table("ingredients").select("id, name").in_("id", list(ids_set)).execute()
        print(f"[批量查询] {len(ids_set)} 个食材名耗时 {time.time() - batch_start:.2f}s", flush=True)
        for ing in (ing_resp.data or []):
            id_name_map[ing["id"]] = ing["name"]

    for recipe in recipes:
        filled_ingredients = []
        for ing in (recipe.get("ingredients") or []):
            ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
            filled_ingredients.append({
                "ingredient_id": ing_id,
                "quantity": ing.get("quantity", 0),
                "name": id_name_map.get(ing_id, "未知食材")
            })
        recipe["ingredients"] = filled_ingredients

    # 根据用户偏好过滤和排序
    recipes = filter_recipes_by_preference(recipes, id_name_map)

    print(f"[耗时] GET /recipes {time.time() - start_total:.2f}s", flush=True)
    return models.ApiResponse.ok(recipes)

@router.get("/{recipe_id}")
@log_operation("获取菜谱详情")
async def get_recipe(recipe_id: str):
    start = time.time()
    db = get_supabase()
    resp = db.table("recipes").select("*").eq("id", recipe_id).execute()
    if not resp.data:
        return JSONResponse(
            status_code=404,
            content=models.ApiResponse.fail("Recipe not found").dict()
        )

    recipe = resp.data[0]
    ingredients = recipe.get("ingredients") or []
    ids_set = {ing.get("ingredientId") or ing.get("ingredient_id") for ing in ingredients}

    id_name_map = {}
    if ids_set:
        ing_resp = db.table("ingredients").select("id, name").in_("id", list(ids_set)).execute()
        id_name_map = {ing["id"]: ing["name"] for ing in (ing_resp.data or [])}
        
    filled_ingredients = []
    for ing in ingredients:
        ing_id = ing.get("ingredientId") or ing.get("ingredient_id")
        filled_ingredients.append({
            "ingredient_id": ing_id,
            "quantity": ing.get("quantity", 0),
            "name": id_name_map.get(ing_id, "未知食材")
        })
    recipe["ingredients"] = filled_ingredients

    print(f"[耗时] GET /recipes/{recipe_id} {time.time()-start:.2f}s", flush=True)
    return models.ApiResponse.ok(recipe)
