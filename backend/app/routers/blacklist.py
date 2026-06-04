"""
黑名单管理路由
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime
from .. import database
from .. import models as models
from ..services.ocr_service import add_to_blacklist

router = APIRouter(
    prefix="/api/blacklist",
    tags=["blacklist"],
    responses={404: {"description": "Not found"}},
)


class BlacklistCreate(BaseModel):
    pattern: str


class BlacklistItem(BaseModel):
    id: str
    pattern: str
    created_at: datetime


@router.post("", response_model=models.ApiResponse[BlacklistItem])
async def create_blacklist_item(item: BlacklistCreate):
    """
    添加黑名单模式
    """
    if not item.pattern.strip():
        return JSONResponse(
            status_code=400,
            content=models.ApiResponse.fail("Pattern cannot be empty").dict()
        )
    
    try:
        response = database.supabase.table("blacklist").insert({
            "pattern": item.pattern.strip(),
            "created_at": datetime.now().isoformat(),
        }).execute()
        
        if response.data:
            new_item = response.data[0]
            # 实时更新内存中的黑名单
            add_to_blacklist(item.pattern.strip())
            result = BlacklistItem(
                id=new_item.get("id"),
                pattern=new_item.get("pattern"),
                created_at=datetime.fromisoformat(new_item.get("created_at")),
            )
            return models.ApiResponse.ok(result, message="添加成功")
        return JSONResponse(
            status_code=500,
            content=models.ApiResponse.fail("Failed to create blacklist item").dict()
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content=models.ApiResponse.fail(str(e)).dict()
        )


@router.get("", response_model=models.ApiResponse[list[BlacklistItem]])
async def get_blacklist_items():
    """
    获取所有黑名单模式
    """
    try:
        response = database.supabase.table("blacklist").select("*").order("created_at", desc=True).execute()
        items = []
        for item in response.data or []:
            items.append(BlacklistItem(
                id=item.get("id"),
                pattern=item.get("pattern"),
                created_at=datetime.fromisoformat(item.get("created_at")),
            ))
        return models.ApiResponse.ok(items)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content=models.ApiResponse.fail(str(e)).dict()
        )


@router.delete("/{item_id}")
async def delete_blacklist_item(item_id: str):
    """
    删除黑名单模式
    """
    try:
        response = database.supabase.table("blacklist").delete().eq("id", item_id).execute()
        if response.data and len(response.data) > 0:
            return models.ApiResponse.ok(message="Deleted successfully")
        return JSONResponse(
            status_code=404,
            content=models.ApiResponse.fail("Item not found").dict()
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content=models.ApiResponse.fail(str(e)).dict()
        )