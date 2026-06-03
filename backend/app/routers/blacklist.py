"""
黑名单管理路由
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime
from .. import database
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


@router.post("", response_model=BlacklistItem)
async def create_blacklist_item(item: BlacklistCreate):
    """
    添加黑名单模式
    """
    if not item.pattern.strip():
        raise HTTPException(status_code=400, detail="Pattern cannot be empty")
    
    try:
        response = database.supabase.table("blacklist").insert({
            "pattern": item.pattern.strip(),
            "created_at": datetime.now().isoformat(),
        }).execute()
        
        if response.data:
            new_item = response.data[0]
            # 实时更新内存中的黑名单
            add_to_blacklist(item.pattern.strip())
            return BlacklistItem(
                id=new_item.get("id"),
                pattern=new_item.get("pattern"),
                created_at=datetime.fromisoformat(new_item.get("created_at")),
            )
        raise HTTPException(status_code=500, detail="Failed to create blacklist item")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=list[BlacklistItem])
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
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{item_id}")
async def delete_blacklist_item(item_id: str):
    """
    删除黑名单模式
    """
    try:
        response = database.supabase.table("blacklist").delete().eq("id", item_id).execute()
        if response.data and len(response.data) > 0:
            return {"success": True, "message": "Deleted successfully"}
        raise HTTPException(status_code=404, detail="Item not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))