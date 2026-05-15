from fastapi import APIRouter, HTTPException, Depends
from typing import List
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])


@router.get("", response_model=List[models.IngredientResponse])
async def get_ingredients(current_user: User = Depends(get_current_user)):
    """获取所有食材列表"""
    import time
    start = time.time()
    t1 = time.time()
    response = database.supabase.table("ingredients").select("*").execute()
    print(f"[耗时] GET /ingredients 查询: {time.time()-t1:.2f}s", flush=True)
    print(f"[耗时] GET /ingredients 总计: {time.time()-start:.2f}s (共 {len(response.data or [])} 条)", flush=True)
    return response.data


@router.get("/{ingredient_id}", response_model=models.IngredientResponse)
async def get_ingredient(ingredient_id: str, current_user: User = Depends(get_current_user)):
    """获取单个食材"""
    import time
    start = time.time()
    response = database.supabase.table("ingredients").select("*").eq("id", ingredient_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    print(f"[耗时] GET /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
    return response.data


@router.post("", response_model=models.IngredientResponse)
async def create_ingredient(ingredient: models.IngredientCreate, current_user: User = Depends(get_current_user)):
    """创建新食材"""
    import time
    start = time.time()
    try:
        name = ingredient.name.strip() if ingredient.name else ""
        if not name:
            raise HTTPException(status_code=400, detail="食材名称不能为空")
        
        # 检查是否已存在
        existing = database.supabase.table("ingredients").select("id, quantity").eq("name", name).maybe_single().execute()
        if existing and existing.data:
            new_quantity = existing.data["quantity"] + (ingredient.quantity or 0)
            response = database.supabase.table("ingredients").update({"quantity": new_quantity}).eq("id", existing.data["id"]).execute()
            if response and response.data:
                print(f"[耗时] POST /ingredients (更新) {time.time()-start:.2f}s", flush=True)
                return response.data[0]
            raise HTTPException(status_code=500, detail="更新食材失败：数据库无响应")
        
        insert_data = {
            "name": name,
            "quantity": ingredient.quantity if ingredient.quantity is not None else 0,
            "alias": ingredient.alias
        }
        response = database.supabase.table("ingredients").insert(insert_data).execute()
        if response and response.data:
            print(f"[耗时] POST /ingredients (新建) {time.time()-start:.2f}s", flush=True)
            return response.data[0]
        raise HTTPException(status_code=500, detail="创建食材失败：数据库无响应")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[错误] POST /ingredients: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=f"创建食材失败: {str(e)}")


@router.put("/{ingredient_id}", response_model=models.IngredientResponse)
async def update_ingredient(ingredient_id: str, ingredient: models.IngredientUpdate, current_user: User = Depends(get_current_user)):
    """更新食材"""
    import time
    start = time.time()
    update_data = {k: v for k, v in ingredient.model_dump().items() if v is not None}
    if "added_at" in update_data:
        update_data["added_at"] = update_data["added_at"].isoformat()
    
    response = database.supabase.table("ingredients").update(update_data).eq("id", ingredient_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    print(f"[耗时] PUT /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
    return response.data[0]


@router.delete("/{ingredient_id}")
async def delete_ingredient(ingredient_id: str, current_user: User = Depends(get_current_user)):
    """删除食材"""
    import time
    start = time.time()
    
    # 批量查询所有菜谱
    recipes = database.supabase.table("recipes").select("id, ingredients").execute()
    recipes_to_update = []
    
    for recipe in recipes.data or []:
        ingredients = recipe.get("ingredients") or []
        updated = [ing for ing in ingredients if ing.get("ingredient_id") != ingredient_id]
        if len(updated) != len(ingredients):
            recipes_to_update.append({"id": recipe["id"], "ingredients": updated})
    
    # 批量更新菜谱
    if recipes_to_update:
        try:
            for update_data in recipes_to_update:
                database.supabase.table("recipes").update({"ingredients": update_data["ingredients"]}).eq("id", update_data["id"]).execute()
        except Exception as e:
            print(f"[错误] 批量更新菜谱失败: {str(e)}", flush=True)
    
    # 批量查询采购任务
    tasks = database.supabase.table("purchase_tasks").select("id, pending_items, removed_ingredient_ids").eq("status", "active").execute()
    tasks_to_update = []
    
    for task in tasks.data or []:
        pending = task.get("pending_items") or []
        updated_pending = [item for item in pending if item.get("ingredient_id") != ingredient_id]
        removed_ids = task.get("removed_ingredient_ids") or []
        if ingredient_id not in removed_ids:
            removed_ids.append(ingredient_id)
        if len(updated_pending) != len(pending) or len(removed_ids) != len(task.get("removed_ingredient_ids", [])):
            tasks_to_update.append({
                "id": task["id"],
                "pending_items": updated_pending,
                "removed_ingredient_ids": removed_ids
            })
    
    # 批量更新采购任务
    if tasks_to_update:
        try:
            for update_data in tasks_to_update:
                database.supabase.table("purchase_tasks").update({
                    "pending_items": update_data["pending_items"],
                    "removed_ingredient_ids": update_data["removed_ingredient_ids"]
                }).eq("id", update_data["id"]).execute()
        except Exception as e:
            print(f"[错误] 批量更新采购任务失败: {str(e)}", flush=True)
    
    # 删除食材
    response = database.supabase.table("ingredients").delete().eq("id", ingredient_id).execute()
    
    print(f"[耗时] DELETE /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
    return {"message": "Ingredient deleted"}


@router.post("/resolve")
async def resolve_ingredient_id(name: str, current_user: User = Depends(get_current_user)):
    """根据名称解析或创建食材ID"""
    import time
    start = time.time()
    name = name.strip()
    if not name:
        return {"id": None}
    
    existing = database.supabase.table("ingredients").select("id").eq("name", name).maybe_single().execute()
    if existing.data:
        print(f"[耗时] POST /ingredients/resolve {time.time()-start:.2f}s", flush=True)
        return {"id": existing.data["id"]}
    
    response = database.supabase.table("ingredients").insert({"name": name, "quantity": 0}).select("id").single().execute()
    print(f"[耗时] POST /ingredients/resolve {time.time()-start:.2f}s", flush=True)
    return {"id": response.data["id"]}


@router.post("/batch-update-quantity")
async def batch_update_quantities(updates: List[models.BatchUpdateItem], current_user: User = Depends(get_current_user)):
    """批量更新食材数量"""
    import time
    start = time.time()
    
    if updates:
        upsert_data = []
        for update in updates:
            if update.id and update.quantity is not None:
                upsert_data.append({"id": update.id, "quantity": update.quantity})
        
        if upsert_data:
            try:
                database.supabase.table("ingredients").upsert(upsert_data, on_conflict="id").execute()
            except Exception as e:
                print(f"[错误] 批量更新食材失败: {str(e)}", flush=True)
    
    print(f"[批量更新库存] 更新 {len(updates)} 条耗时 {time.time()-start:.2f}s", flush=True)
    return {"message": f"Updated {len(updates)} ingredients"}
