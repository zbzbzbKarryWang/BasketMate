from fastapi import APIRouter, HTTPException, Depends
from typing import List
import time
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..decorators import log_operation

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])


@router.get("", response_model=models.ApiResponse[List[models.IngredientResponse]])
@log_operation("获取食材列表")
async def get_ingredients(current_user: User = Depends(get_current_user)):
    """获取所有食材列表"""
    from ..logger import get_logger
    logger = get_logger("basketmate")
    from datetime import datetime
    
    import time
    start = time.time()
    try:
        t1 = time.time()
        response = database.supabase.table("ingredients").select("*").execute()
        print(f"[耗时] GET /ingredients 查询: {time.time()-t1:.2f}s", flush=True)
        
        # 处理日期字段，确保格式正确
        data = response.data or []
        for item in data:
            if 'added_at' in item and item['added_at']:
                # 确保 added_at 是字符串格式
                if isinstance(item['added_at'], datetime):
                    item['added_at'] = item['added_at'].isoformat()
        
        print(f"[耗时] GET /ingredients 总计: {time.time()-start:.2f}s (共 {len(data)} 条)", flush=True)
        return models.ApiResponse.ok(data)
    except Exception as e:
        logger.error(f"[获取食材列表] 失败: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"获取食材失败: {str(e)}")


@router.get("/search", response_model=models.ApiResponse[List[dict]])
@log_operation("搜索食材")
async def search_ingredients(q: str, current_user: User = Depends(get_current_user)):
    """搜索食材（模糊匹配名称和别名）"""
    from ..logger import get_logger
    logger = get_logger("basketmate")
    
    import time
    start = time.time()
    
    if not q or not q.strip():
        return models.ApiResponse.ok([])
    
    query = q.strip()
    
    try:
        logger.info(f"[搜索食材] 开始，关键词: {query}")
        
        # 使用 ilike 进行模糊搜索
        response = database.supabase.table("ingredients").select("id, name").ilike("name", f"%{query}%").execute()
        
        results = []
        for item in response.data or []:
            results.append({
                "id": item.get("id"),
                "name": item.get("name"),
            })
        
        logger.info(f"[搜索食材] 完成，关键词: {query}，结果数: {len(results)}，耗时: {time.time()-start:.2f}s")
        return models.ApiResponse.ok(results)
    
    except Exception as e:
        logger.error(f"[搜索食材] 失败，关键词: {query}，错误: {str(e)}", exc_info=True)
        return models.ApiResponse.fail(f"搜索失败: {str(e)}")


@router.get("/{ingredient_id}", response_model=models.ApiResponse[models.IngredientResponse])
@log_operation("获取食材详情")
async def get_ingredient(ingredient_id: str, current_user: User = Depends(get_current_user)):
    """获取单个食材"""
    import time
    start = time.time()
    response = database.supabase.table("ingredients").select("*").eq("id", ingredient_id).single().execute()
    if not response.data:
        return models.ApiResponse.fail("食材不存在")
    print(f"[耗时] GET /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
    return models.ApiResponse.ok(response.data)


@router.post("", response_model=models.ApiResponse[models.IngredientResponse])
@log_operation("创建食材")
async def create_ingredient(ingredient: models.IngredientCreate, current_user: User = Depends(get_current_user)):
    """创建新食材"""
    from ..logger import get_logger
    logger = get_logger("basketmate")
    
    import time
    start = time.time()
    try:
        name = ingredient.name.strip() if ingredient.name else ""
        if not name:
            return models.ApiResponse.fail("食材名称不能为空")
        
        existing = database.supabase.table("ingredients").select("id, quantity").eq("name", name).maybe_single().execute()
        if existing and existing.data:
            old_qty = existing.data["quantity"]
            new_quantity = old_qty + (ingredient.quantity or 0)
            response = database.supabase.table("ingredients").update({"quantity": new_quantity}).eq("id", existing.data["id"]).execute()
            if response and response.data:
                print(f"[耗时] POST /ingredients (更新) {time.time()-start:.2f}s", flush=True)
                return models.ApiResponse.ok(response.data[0])
            return models.ApiResponse.fail("更新食材失败：数据库无响应")
        
        insert_data = {
            "name": name,
            "quantity": ingredient.quantity if ingredient.quantity is not None else 0,
            "alias": ingredient.alias
        }
        response = database.supabase.table("ingredients").insert(insert_data).execute()
        if response and response.data:
            print(f"[耗时] POST /ingredients (新建) {time.time()-start:.2f}s", flush=True)
            return models.ApiResponse.ok(response.data[0])
        return models.ApiResponse.fail("创建食材失败：数据库无响应")
    except Exception as e:
        logger.error(f"[创建食材] 失败: 参数={insert_data}, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("创建食材失败")


@router.put("/{ingredient_id}", response_model=models.ApiResponse[models.IngredientResponse])
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
            # 修改 quantity，使用事务函数（返回 void）
            database.supabase.rpc("update_ingredient_safe", {
                "p_ingredient_id": ingredient_id,
                "p_new_quantity": new_quantity
            }).execute()
        else:
            # 不修改 quantity，直接更新其他字段
            if update_data:
                database.supabase.table("ingredients").update(update_data).eq("id", ingredient_id).execute()
        
        # 获取更新后的食材信息
        response = database.supabase.table("ingredients").select("*").eq("id", ingredient_id).single().execute()
        if not response.data:
            return models.ApiResponse.fail("食材不存在")
        
        print(f"[耗时] PUT /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
        logger.info(f"[更新食材] 成功，ingredient_id={ingredient_id}, quantity={new_quantity}")
        return models.ApiResponse.ok(response.data)
        
    except Exception as e:
        logger.error(f"[更新食材] 失败: 参数=ingredient_id={ingredient_id},quantity={new_quantity}, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("更新食材失败")


@router.delete("/{ingredient_id}", response_model=models.ApiResponse)
@log_operation("删除食材")
async def delete_ingredient(ingredient_id: str, current_user: User = Depends(get_current_user)):
    """删除食材（原子性操作）"""
    import time
    from ..logger import get_logger
    logger = get_logger("basketmate")
    
    start = time.time()
    
    try:
        # 调用原子性函数（返回 void）
        database.supabase.rpc("delete_ingredient_cascade", {
            "p_ingredient_id": ingredient_id
        }).execute()
        
        print(f"[耗时] DELETE /ingredients/{ingredient_id} {time.time()-start:.2f}s", flush=True)
        logger.info(f"[删除食材] 成功，ingredient_id={ingredient_id}")
        return models.ApiResponse.ok(message="删除食材成功")
        
    except Exception as e:
        logger.error(f"[删除食材] 失败: 参数=ingredient_id={ingredient_id}, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("删除食材失败")


@router.post("/resolve", response_model=models.ApiResponse[dict])
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
        return models.ApiResponse.fail("name 参数不能为空")
    
    logger.info(f"[resolve] 解析食材名称: {resolved_name}")
    
    existing = database.supabase.table("ingredients").select("id").eq("name", resolved_name).maybe_single().execute()
    if existing and existing.data:
        print(f"[耗时] POST /ingredients/resolve {time.time()-start:.2f}s", flush=True)
        return models.ApiResponse.ok({"id": existing.data["id"]})
    
    response = database.supabase.table("ingredients").insert({"name": resolved_name, "quantity": 0}).select("id").single().execute()
    if response and response.data:
        print(f"[耗时] POST /ingredients/resolve {time.time()-start:.2f}s", flush=True)
        return models.ApiResponse.ok({"id": response.data["id"]})
    return models.ApiResponse.fail("解析食材失败")


@router.post("/batch-update-quantity", response_model=models.ApiResponse[dict])
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
        return models.ApiResponse.ok({"message": "没有需要更新的项", "updated_count": 0})
    
    try:
        # 调用原子性函数（返回 void）
        database.supabase.rpc("batch_update_quantities_safe", {
            "p_updates": updates_json
        }).execute()
        
        print(f"[批量更新库存] 更新 {len(updates_json)} 条耗时 {time.time()-start:.2f}s", flush=True)
        logger.info(f"[批量更新库存] 成功，更新数量={len(updates_json)}")
        return models.ApiResponse.ok({"message": f"成功更新 {len(updates_json)} 条记录", "updated_count": len(updates_json)})
        
    except Exception as e:
        logger.error(f"[批量更新库存] 失败: 参数=updates={len(updates_json)}项, 错误={str(e)}", exc_info=True)
        return models.ApiResponse.fail("批量更新失败")
