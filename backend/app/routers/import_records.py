from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import time
import base64
from .. import models
from .. import database
from ..dependencies import get_current_user, User
from ..decorators import log_operation
from ..logger import get_logger
from ..services.ocr_service import recognize_receipt, add_to_blacklist, load_ingredient_maps, load_blacklist

logger = get_logger("basketmate")

router = APIRouter(prefix="/api/import", tags=["import"])


class ImportUploadRequest(BaseModel):
    images: List[str]
    import_type: List[str]
    shop_name: Optional[str] = None


class ImportUploadFormData(BaseModel):
    import_type: str
    shop_name: Optional[str] = None


class ImportItemUpdate(BaseModel):
    items: List[dict]
    deleted_patterns: Optional[List[str]] = None


class ImportConfirmItem(BaseModel):
    name: str
    price: float
    quantity: int
    target_ingredient: Optional[str] = None


class ImportConfirmRequest(BaseModel):
    record_id: str
    items: List[ImportConfirmItem]
    deleted_patterns: List[str] = []


async def run_ocr_for_record(record_id: str, images: List[str]):
    """后台执行 OCR 识别并更新记录"""
    try:
        all_items = []
        for idx, image in enumerate(images):
            try:
                items = await recognize_receipt(image, idx)
                all_items.extend(items)
            except Exception as e:
                logger.error(f"[导入OCR] 第{idx}张图片识别失败: {e}")

        if not all_items:
            database.supabase.table("import_records").update({
                "status": "failed",
                "items": [],
            }).eq("id", record_id).execute()
            return

        database.supabase.table("import_records").update({
            "status": "pending",
            "items": all_items,
        }).eq("id", record_id).execute()

        logger.info(f"[导入OCR] 识别完成: record_id={record_id}, items_count={len(all_items)}")
    except Exception as e:
        logger.error(f"[导入OCR] 失败: record_id={record_id}, error={e}", exc_info=True)
        try:
            database.supabase.table("import_records").update({
                "status": "failed",
            }).eq("id", record_id).execute()
        except Exception:
            pass


@router.post("/upload", response_model=models.ApiResponse[dict])
@log_operation("上传小票图片")
async def upload_receipt(
    data: ImportUploadRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    if not data.images or len(data.images) == 0:
        return models.ApiResponse.error("请选择图片")

    if not data.import_type or len(data.import_type) == 0:
        return models.ApiResponse.error("请选择导入类型")

    if "price" in data.import_type and not data.shop_name:
        return models.ApiResponse.error("导入比价需要选择店铺")

    record_data = {
        "shop_name": data.shop_name,
        "import_type": data.import_type,
        "status": "identifying",
        "items": [],
        "image_count": len(data.images),
        "viewed": False,
    }

    try:
        response = database.supabase.table("import_records").insert(record_data).execute()
        record_id = response.data[0]["id"]

        background_tasks.add_task(run_ocr_for_record, record_id, data.images)

        return models.ApiResponse.ok({
            "record_id": record_id,
            "message": "已开始识别",
        })
    except Exception as e:
        logger.error(f"[导入上传] 失败: {e}", exc_info=True)
        return models.ApiResponse.error("上传失败")





@router.get("/records", response_model=models.ApiResponse[List[dict]])
@log_operation("获取导入记录列表")
async def get_import_records(current_user: User = Depends(get_current_user)):
    try:
        response = database.supabase.table("import_records").select("*").order("created_at", desc=True).execute()
        return models.ApiResponse.ok(response.data or [])
    except Exception as e:
        logger.error(f"[导入列表] 失败: {e}", exc_info=True)
        return models.ApiResponse.error("获取失败")


@router.get("/records/{record_id}", response_model=models.ApiResponse[dict])
@log_operation("获取导入记录详情")
async def get_import_record(record_id: str, current_user: User = Depends(get_current_user)):
    try:
        response = database.supabase.table("import_records").select("*").eq("id", record_id).single().execute()
        record = response.data

        database.supabase.table("import_records").update({"viewed": True}).eq("id", record_id).execute()

        return models.ApiResponse.ok(record)
    except Exception as e:
        logger.error(f"[导入详情] 失败: {e}", exc_info=True)
        return models.ApiResponse.error("获取失败")


@router.put("/records/{record_id}", response_model=models.ApiResponse[dict])
@log_operation("更新导入记录")
async def update_import_record(
    record_id: str,
    data: ImportItemUpdate,
    current_user: User = Depends(get_current_user),
):
    try:
        update_data = {
            "items": data.items,
        }
        # 如果有 deleted_patterns，也一并保存
        if hasattr(data, 'deleted_patterns') and data.deleted_patterns:
            update_data["deleted_patterns"] = data.deleted_patterns
        
        response = database.supabase.table("import_records").update(update_data).eq("id", record_id).execute()

        return models.ApiResponse.ok(response.data[0] if response.data else {})
    except Exception as e:
        logger.error(f"[更新导入记录] 失败: {e}", exc_info=True)
        return models.ApiResponse.error("更新失败")


async def _find_or_create_ingredient(name: str) -> str:
    """查找或创建食材，返回食材ID"""
    try:
        response = database.supabase.table("ingredients").select("id").eq("name", name).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]["id"]

        now_iso = datetime.now().isoformat()
        response = database.supabase.table("ingredients").insert({
            "name": name,
            "quantity": 0,
            "added_at": now_iso,
        }).execute()
        return response.data[0]["id"]
    except Exception:
        raise


@router.post("/records/{record_id}/apply", response_model=models.ApiResponse[dict])
@log_operation("执行导入")
async def apply_import_record(record_id: str, current_user: User = Depends(get_current_user)):
    try:
        response = database.supabase.table("import_records").select("*").eq("id", record_id).single().execute()
        record = response.data

        if not record:
            return models.ApiResponse.error("记录不存在")

        if record.get("status") == "imported":
            return models.ApiResponse.error("已导入")

        import_type = record.get("import_type", [])
        items = record.get("items", [])
        shop_name = record.get("shop_name")

        shop_id = None
        if shop_name:
            shop_response = database.supabase.table("shops").select("id").eq("name", shop_name).limit(1).execute()
            if shop_response.data and len(shop_response.data) > 0:
                shop_id = shop_response.data[0]["id"]

        now_iso = datetime.now().isoformat()
        inventory_count = 0
        price_count = 0
        errors = []

        for item in items:
            ingredient_id = item.get("id")
            name = (item.get("name") or "").strip()
            if not ingredient_id or not name:
                continue

            price = float(item.get("price") or 0)
            quantity = float(item.get("quantity") or 1)

            try:
                if "inventory" in import_type:
                    existing = database.supabase.table("ingredients").select(
                        "quantity"
                    ).eq("id", ingredient_id).single().execute()
                    current_qty = float((existing.data or {}).get("quantity") or 0)
                    new_qty = current_qty + quantity

                    database.supabase.table("ingredients").update({
                        "quantity": new_qty,
                        "added_at": now_iso,
                    }).eq("id", ingredient_id).execute()
                    inventory_count += 1

                if "price" in import_type and shop_id and price > 0:
                    existing_price = database.supabase.table("prices").select("id").eq(
                        "ingredient_id", ingredient_id
                    ).eq("shop_id", shop_id).limit(1).execute()

                    if existing_price.data and len(existing_price.data) > 0:
                        database.supabase.table("prices").update({
                            "price": price,
                        }).eq("id", existing_price.data[0]["id"]).execute()
                    else:
                        database.supabase.table("prices").insert({
                            "ingredient_id": ingredient_id,
                            "shop_id": shop_id,
                            "price": price,
                        }).execute()
                    price_count += 1
            except Exception as e:
                errors.append(f"{name}: {str(e)}")
                logger.error(f"[执行导入] 单条失败: name={name}, error={e}")

        database.supabase.table("import_records").update({
            "status": "imported",
        }).eq("id", record_id).execute()

        result = {
            "inventory_count": inventory_count,
            "price_count": price_count,
            "errors": errors,
        }

        if errors:
            return models.ApiResponse.ok(result, message="部分导入成功")
        return models.ApiResponse.ok(result)
    except Exception as e:
        logger.error(f"[执行导入] 失败: {e}", exc_info=True)
        return models.ApiResponse.error("导入失败")


@router.post("/confirm", response_model=models.ApiResponse[dict])
@log_operation("确认导入")
async def confirm_import(
    request: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
):
    """
    确认导入：使用事务函数批量处理导入数据
    - 事务保证：任何步骤失败则全部回滚
    - 状态更新：成功则 status='imported'，失败则 status='failed'
    """
    try:
        record_id = request.record_id
        items = request.items
        deleted_patterns = request.deleted_patterns or []
        
        # 获取导入记录
        response = database.supabase.table("import_records").select("*").eq("id", record_id).single().execute()
        record = response.data
        
        if not record:
            return models.ApiResponse.fail("记录不存在")
        
        if record.get("status") == "imported":
            return models.ApiResponse.fail("已导入")
        
        import_type = record.get("import_type", [])
        shop_name = record.get("shop_name")
        
        # 获取店铺ID
        shop_id = None
        if shop_name:
            shop_response = database.supabase.table("shops").select("id").eq("name", shop_name).limit(1).execute()
            if shop_response.data and len(shop_response.data) > 0:
                shop_id = shop_response.data[0]["id"]
        
        # 准备参数
        items_json = [
            {
                "name": item.name,
                "price": float(item.price or 0),
                "quantity": int(item.quantity or 1),
                "target_ingredient": str(item.target_ingredient) if item.target_ingredient else None,
            }
            for item in items if item.name and item.name.strip()
        ]
        
        # 调用事务函数
        result = database.supabase.rpc("confirm_import_transaction", {
            "p_record_id": str(record_id),
            "p_deleted_patterns": deleted_patterns,
            "p_items": items_json,
            "p_import_type": import_type,
            "p_shop_id": str(shop_id) if shop_id else None,
        }).execute()
        
        result_data = result.data or {}
        
        if result_data.get("success"):
            # 重新加载食材映射和黑名单
            load_ingredient_maps()
            load_blacklist()
            
            logger.info(f"[确认导入] 成功: record_id={record_id}, blacklist={result_data.get('blacklist_count')}, new_ingredient={result_data.get('new_ingredient_count')}, inventory={result_data.get('inventory_count')}, price_insert={result_data.get('price_insert_count')}, price_update={result_data.get('price_update_count')}")
            
            return models.ApiResponse.ok({
                "blacklist_count": result_data.get("blacklist_count", 0),
                "new_ingredient_count": result_data.get("new_ingredient_count", 0),
                "inventory_count": result_data.get("inventory_count", 0),
                "alias_count": result_data.get("alias_count", 0),
                "price_insert_count": result_data.get("price_insert_count", 0),
                "price_update_count": result_data.get("price_update_count", 0),
            })
        else:
            # 事务失败，已自动回滚
            error_msg = result_data.get("error", "未知错误")
            logger.error(f"[确认导入] 事务失败: record_id={record_id}, error={error_msg}")
            return models.ApiResponse.fail(f"导入失败: {error_msg}")
    
    except Exception as e:
        logger.error(f"[确认导入] 失败: {e}", exc_info=True)
        # 更新状态为失败
        try:
            database.supabase.table("import_records").update({"status": "failed"}).eq("id", record_id).execute()
        except:
            pass
        return models.ApiResponse.error("导入失败")