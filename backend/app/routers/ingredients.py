from fastapi import APIRouter, HTTPException, Depends
from typing import List
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..decorators import log_operation

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])


@router.get("", response_model=List[models.IngredientResponse])
@log_operation("获取食材列表")
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
@log_operation("获取食材详情")
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
@log_operation("创建食材")
async def create_ingredient(ingredient: models.IngredientCreate, current_user: User = Depends(get_current_user)):
    """创建新食材"""
    import time
    start = time.time()
    try:
        name = ingredient.name.strip() if ingredient.name else ""
        if not name:
            raise HTTPException(status_code=400, detail="食材名称不能为空")
        
        existing = database.supabase.table("ingredients").select("id, quantity").eq("name", name).maybe_single().execute()
        if existing and existing.data:
            old_qty = existing.data["quantity"]
            new_quantity = old_qty + (ingredient.quantity or 0)
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
@log_operation("更新食材")
async def update_ingredient(ingredient_id: str, ingredient: models.IngredientUpdate, current_user: User = Depends(get_current_user)):
    """更新食材（仅修改 quantity 时使用事务）"""
    import time
    from ..logger import get_logger
    logger = get_logger("basketmate")
    
    start = time.time()
    
    # 分离 quantity 和其他字段
    update_data = {}
    has_quantity = False
    new_quantity = None
    
    for k, v in ingredient.model_dump().items():
        if v is not None:
            if k == "quantity":
                has_quantity = True
                new_quantity = v
            elif k == "added_at":
                update_data[k] = v.isoformat()
            else:
                update_data[k] = v
    
    try:
        if has_quantity:
            # 修改 quantity，使用事务函数
            result = database.supabase.rpc("update_ingredient_safe", {
                "p_ingredient_id": ingredient_id,
                "p_new_quantity": new_quantity
            }).execute()
            
            if not result.data or not result.data[0].get("success"):
                raise HTTPException(status_code=500, detail="更新失败")
        else:
            # 不修改 quantity，直接更新其他字段
            if update_data:
                database.supabase.table("ingredients").update(update_data).eq("id", ingredient_id).execute()
        
        # 获取更新后的食材信息
        response = database.supabase.table("ingredients").select("*").eq("id", ingredient_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="食材不存在")
        
        print(f"[耗时] PUT /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[更新食材] 失败: 参数=ingredient_id={ingredient_id},quantity={new_quantity}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="更新食材失败")


@router.delete("/{ingredient_id}")
@log_operation("删除食材")
async def delete_ingredient(ingredient_id: str, current_user: User = Depends(get_current_user)):
    """删除食材（原子性操作）"""
    import time
    from ..logger import get_logger
    logger = get_logger("basketmate")
    
    start = time.time()
    
    try:
        # 调用原子性函数
        result = database.supabase.rpc("delete_ingredient_cascade", {
            "p_ingredient_id": ingredient_id
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="删除食材失败")
        
        print(f"[耗时] DELETE /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
        logger.info(f"[删除食材] 成功，recipe更新={result.data[0].get('recipes_updated')}, 待购项移除={result.data[0].get('items_removed')}")
        return {"message": "Ingredient deleted", "details": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[删除食材] 失败: 参数=ingredient_id={ingredient_id}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="删除食材失败")


@router.post("/resolve")
@log_operation("解析食材名称")
async def resolve_ingredient_id(
    request: models.IngredientResolveRequest,
    current_user: User = Depends(get_current_user)
):
    """根据名称解析或创建食材ID"""
    from ..logger import get_logger
    logger = get_logger("basketmate")
    
    import time
    start = time.time()
    
    resolved_name = request.name.strip()
    
    if not resolved_name:
        logger.warning(f"[resolve] 422 错误：name 参数为空")
        raise HTTPException(status_code=422, detail="name 参数不能为空")
    
    logger.info(f"[resolve] 解析食材名称: {resolved_name}")
    
    existing = database.supabase.table("ingredients").select("id").eq("name", resolved_name).maybe_single().execute()
    if existing.data:
        print(f"[耗时] POST /ingredients/resolve {time.time()-start:.2f}s", flush=True)
        return {"id": existing.data["id"]}
    
    response = database.supabase.table("ingredients").insert({"name": resolved_name, "quantity": 0}).select("id").single().execute()
    print(f"[耗时] POST /ingredients/resolve {time.time()-start:.2f}s", flush=True)
    return {"id": response.data["id"]}


@router.post("/batch-update-quantity")
@log_operation("批量更新食材数量")
async def batch_update_quantities(updates: List[models.BatchUpdateItem], current_user: User = Depends(get_current_user)):
    """批量更新食材数量（原子性操作）"""
    import time
    from ..logger import get_logger
    logger = get_logger("basketmate")
    
    start = time.time()
    
    # 转换为 RPC 需要的格式
    updates_json = [
        {"id": u.id, "quantity": u.quantity}
        for u in updates
        if u.id and u.quantity is not None
    ]
    
    if not updates_json:
        return {"message": "没有需要更新的项", "updated_count": 0}
    
    try:
        # 调用原子性函数
        result = database.supabase.rpc("batch_update_quantities_safe", {
            "p_updates": updates_json
        }).execute()
        
        if not result.data or not result.data[0].get("success"):
            raise HTTPException(status_code=500, detail="批量更新失败")
        
        print(f"[批量更新库存] 更新 {result.data[0].get('updated_count')} 条耗时 {time.time()-start:.2f}s", flush=True)
        logger.info(f"[批量更新库存] 成功，更新数量={result.data[0].get('updated_count')}")
        return {"message": f"Updated {result.data[0].get('updated_count')} ingredients", "details": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[批量更新库存] 失败: 参数=updates={updates_json}, 错误={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="批量更新失败")
