from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..decorators import log_operation
from ..logger import get_logger

logger = get_logger("basketmate")

router = APIRouter(prefix="/api/user/profile", tags=["user_profile"])


class UserProfileResponse(BaseModel):
    id: str
    user_id: str
    favorite_recipes: List[str] = []
    favorite_ingredients: List[str] = []
    disliked_ingredients: List[str] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class UserProfileUpdate(BaseModel):
    favorite_recipes: Optional[List[str]] = None
    favorite_ingredients: Optional[List[str]] = None
    disliked_ingredients: Optional[List[str]] = None


class RecipeIdRequest(BaseModel):
    recipe_id: str


class IngredientNameRequest(BaseModel):
    ingredient_name: str


def _get_or_create_profile() -> dict:
    """获取或创建用户画像"""
    response = database.supabase.table("user_profiles").select("*").eq("user_id", "default").maybe_single().execute()
    
    if response and response.data:
        return response.data
    
    # 创建默认画像
    insert_response = database.supabase.table("user_profiles").insert({
        "user_id": "default",
        "favorite_recipes": [],
        "favorite_ingredients": [],
        "disliked_ingredients": []
    }).execute()
    
    if insert_response and insert_response.data:
        return insert_response.data[0]
    
    return {
        "id": "",
        "user_id": "default",
        "favorite_recipes": [],
        "favorite_ingredients": [],
        "disliked_ingredients": []
    }


@router.get("", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("获取用户画像")
async def get_profile(current_user: User = Depends(get_current_user)):
    """获取当前用户画像"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        print(f"[耗时] GET /user/profile {time.time()-start:.2f}s", flush=True)
        return models.ApiResponse.ok(profile)
    except Exception as e:
        logger.error(f"[获取用户画像] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"获取用户画像失败: {str(e)}")


@router.put("", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("更新用户画像")
async def update_profile(
    update_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """更新用户画像（覆盖更新）"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        profile_id = profile.get("id")
        
        if not profile_id:
            return models.ApiResponse.fail("用户画像不存在")
        
        # 构建更新数据
        update_dict = {}
        if update_data.favorite_recipes is not None:
            update_dict["favorite_recipes"] = update_data.favorite_recipes
        if update_data.favorite_ingredients is not None:
            update_dict["favorite_ingredients"] = update_data.favorite_ingredients
        if update_data.disliked_ingredients is not None:
            update_dict["disliked_ingredients"] = update_data.disliked_ingredients
        
        if not update_dict:
            return models.ApiResponse.ok(profile)
        
        # 更新
        response = database.supabase.table("user_profiles").update(update_dict).eq("id", profile_id).execute()
        
        if response and response.data:
            logger.info(f"[更新用户画像] 成功，更新字段: {list(update_dict.keys())}")
            print(f"[耗时] PUT /user/profile {time.time()-start:.2f}s", flush=True)
            return models.ApiResponse.ok(response.data[0])
        
        return models.ApiResponse.fail("更新用户画像失败")
        
    except Exception as e:
        logger.error(f"[更新用户画像] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"更新用户画像失败: {str(e)}")


# ========== 收藏菜谱 ==========

@router.post("/favorite-recipes/add", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("添加收藏菜谱")
async def add_favorite_recipe(
    request: RecipeIdRequest,
    current_user: User = Depends(get_current_user)
):
    """添加收藏菜谱到数组"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        profile_id = profile.get("id")
        favorites = list(profile.get("favorite_recipes") or [])
        
        if request.recipe_id not in favorites:
            favorites.append(request.recipe_id)
            response = database.supabase.table("user_profiles").update({
                "favorite_recipes": favorites
            }).eq("id", profile_id).execute()
            
            if response and response.data:
                logger.info(f"[添加收藏菜谱] 成功，recipe_id={request.recipe_id}")
                print(f"[耗时] POST /favorite-recipes/add {time.time()-start:.2f}s", flush=True)
                return models.ApiResponse.ok(response.data[0])
        
        return models.ApiResponse.ok(profile)
        
    except Exception as e:
        logger.error(f"[添加收藏菜谱] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"添加收藏菜谱失败: {str(e)}")


@router.post("/favorite-recipes/remove", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("移除收藏菜谱")
async def remove_favorite_recipe(
    request: RecipeIdRequest,
    current_user: User = Depends(get_current_user)
):
    """从数组中移除收藏菜谱"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        profile_id = profile.get("id")
        favorites = list(profile.get("favorite_recipes") or [])
        
        if request.recipe_id in favorites:
            favorites.remove(request.recipe_id)
            response = database.supabase.table("user_profiles").update({
                "favorite_recipes": favorites
            }).eq("id", profile_id).execute()
            
            if response and response.data:
                logger.info(f"[移除收藏菜谱] 成功，recipe_id={request.recipe_id}")
                print(f"[耗时] POST /favorite-recipes/remove {time.time()-start:.2f}s", flush=True)
                return models.ApiResponse.ok(response.data[0])
        
        return models.ApiResponse.ok(profile)
        
    except Exception as e:
        logger.error(f"[移除收藏菜谱] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"移除收藏菜谱失败: {str(e)}")


# ========== 喜爱食材 ==========

@router.post("/favorite-ingredients/add", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("添加喜爱食材")
async def add_favorite_ingredient(
    request: IngredientNameRequest,
    current_user: User = Depends(get_current_user)
):
    """添加喜爱食材到数组"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        profile_id = profile.get("id")
        favorites = list(profile.get("favorite_ingredients") or [])
        
        ingredient_name = request.ingredient_name.strip()
        if ingredient_name and ingredient_name not in favorites:
            favorites.append(ingredient_name)
            response = database.supabase.table("user_profiles").update({
                "favorite_ingredients": favorites
            }).eq("id", profile_id).execute()
            
            if response and response.data:
                logger.info(f"[添加喜爱食材] 成功，ingredient={ingredient_name}")
                print(f"[耗时] POST /favorite-ingredients/add {time.time()-start:.2f}s", flush=True)
                return models.ApiResponse.ok(response.data[0])
        
        return models.ApiResponse.ok(profile)
        
    except Exception as e:
        logger.error(f"[添加喜爱食材] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"添加喜爱食材失败: {str(e)}")


@router.post("/favorite-ingredients/remove", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("移除喜爱食材")
async def remove_favorite_ingredient(
    request: IngredientNameRequest,
    current_user: User = Depends(get_current_user)
):
    """从数组中移除喜爱食材"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        profile_id = profile.get("id")
        favorites = list(profile.get("favorite_ingredients") or [])
        
        ingredient_name = request.ingredient_name.strip()
        if ingredient_name in favorites:
            favorites.remove(ingredient_name)
            response = database.supabase.table("user_profiles").update({
                "favorite_ingredients": favorites
            }).eq("id", profile_id).execute()
            
            if response and response.data:
                logger.info(f"[移除喜爱食材] 成功，ingredient={ingredient_name}")
                print(f"[耗时] POST /favorite-ingredients/remove {time.time()-start:.2f}s", flush=True)
                return models.ApiResponse.ok(response.data[0])
        
        return models.ApiResponse.ok(profile)
        
    except Exception as e:
        logger.error(f"[移除喜爱食材] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"移除喜爱食材失败: {str(e)}")


# ========== 忌口食材 ==========

@router.post("/disliked-ingredients/add", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("添加忌口食材")
async def add_disliked_ingredient(
    request: IngredientNameRequest,
    current_user: User = Depends(get_current_user)
):
    """添加忌口食材到数组"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        profile_id = profile.get("id")
        disliked = list(profile.get("disliked_ingredients") or [])
        
        ingredient_name = request.ingredient_name.strip()
        if ingredient_name and ingredient_name not in disliked:
            disliked.append(ingredient_name)
            response = database.supabase.table("user_profiles").update({
                "disliked_ingredients": disliked
            }).eq("id", profile_id).execute()
            
            if response and response.data:
                logger.info(f"[添加忌口食材] 成功，ingredient={ingredient_name}")
                print(f"[耗时] POST /disliked-ingredients/add {time.time()-start:.2f}s", flush=True)
                return models.ApiResponse.ok(response.data[0])
        
        return models.ApiResponse.ok(profile)
        
    except Exception as e:
        logger.error(f"[添加忌口食材] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"添加忌口食材失败: {str(e)}")


@router.post("/disliked-ingredients/remove", response_model=models.ApiResponse[UserProfileResponse])
@log_operation("移除忌口食材")
async def remove_disliked_ingredient(
    request: IngredientNameRequest,
    current_user: User = Depends(get_current_user)
):
    """从数组中移除忌口食材"""
    import time
    start = time.time()
    
    try:
        profile = _get_or_create_profile()
        profile_id = profile.get("id")
        disliked = list(profile.get("disliked_ingredients") or [])
        
        ingredient_name = request.ingredient_name.strip()
        if ingredient_name in disliked:
            disliked.remove(ingredient_name)
            response = database.supabase.table("user_profiles").update({
                "disliked_ingredients": disliked
            }).eq("id", profile_id).execute()
            
            if response and response.data:
                logger.info(f"[移除忌口食材] 成功，ingredient={ingredient_name}")
                print(f"[耗时] POST /disliked-ingredients/remove {time.time()-start:.2f}s", flush=True)
                return models.ApiResponse.ok(response.data[0])
        
        return models.ApiResponse.ok(profile)
        
    except Exception as e:
        logger.error(f"[移除忌口食材] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"移除忌口食材失败: {str(e)}")
