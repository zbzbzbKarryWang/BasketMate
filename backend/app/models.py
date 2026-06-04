from pydantic import BaseModel
from typing import Optional, List, Any, Generic, TypeVar
from datetime import datetime

# IMPORTANT: ingredients 表的 unit 字段已永久废弃，以后任何代码都不应该再使用！
T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = ""
    data: Optional[T] = None
    
    @classmethod
    def ok(cls, data: T = None, message: str = "操作成功"):
        return cls(success=True, data=data, message=message)
    
    @classmethod
    def fail(cls, message: str, data: Any = None):
        return cls(success=False, message=message, data=data)
    
    @classmethod
    def error(cls, message: str, data: Any = None):
        """error() 作为 fail() 的别名，保持向后兼容"""
        return cls(success=False, message=message, data=data)


class PaginatedResponse(BaseModel, Generic[T]):
    is_success: bool = True
    message: Optional[str] = None
    data: Optional[dict] = None
    
    @classmethod
    def success(cls, items: List[T], total: int, message: str = None):
        return cls(is_success=True, data={"items": items, "total": total}, message=message)
    
    @classmethod
    def error(cls, message: str):
        return cls(is_success=False, message=message)


class IngredientBase(BaseModel):
    name: str
    quantity: float = 0
    alias: Optional[str] = None


class IngredientCreate(IngredientBase):
    pass


class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    alias: Optional[str] = None
    added_at: Optional[datetime] = None


class IngredientResponse(IngredientBase):
    id: str
    added_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class IngredientReference(BaseModel):
    ingredient_id: str
    quantity: float
    name: str


class IngredientRef(BaseModel):
    ingredient_id: str
    quantity: float
    name: str = ""


class BatchUpdateItem(BaseModel):
    id: str
    quantity: float


class Recipe(BaseModel):
    id: str
    name: str
    category: str
    ingredients: List[IngredientRef]


class RecipeBase(BaseModel):
    name: str
    category: str
    ingredients: List[IngredientReference]
    notes: Optional[str] = None


class RecipeCreate(RecipeBase):
    pass


class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    ingredients: Optional[List[IngredientReference]] = None
    notes: Optional[str] = None


class RecipeResponse(RecipeBase):
    id: str

    class Config:
        from_attributes = True


class PlanBase(BaseModel):
    date: str
    breakfast_recipe_id: Optional[str] = None
    meal_ids: List[str] = []


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    date: Optional[str] = None
    breakfast_recipe_id: Optional[str] = None
    meal_ids: Optional[List[str]] = None
    breakfast_wheel_extras: Optional[List[dict]] = None
    breakfast_wheel_hidden_ids: Optional[List[str]] = None


class PlanResponse(PlanBase):
    id: str
    shopping_list_items: int = 0

    class Config:
        from_attributes = True


class ShopBase(BaseModel):
    name: str


class ShopCreate(ShopBase):
    pass


class ShopUpdate(BaseModel):
    name: Optional[str] = None


class ShopResponse(ShopBase):
    id: str

    class Config:
        from_attributes = True


class PriceBase(BaseModel):
    ingredient_id: str
    shop_id: str
    price: float


class PriceCreate(PriceBase):
    pass


class PriceUpdate(BaseModel):
    shop_id: Optional[str] = None
    price: Optional[float] = None


class PriceResponse(PriceBase):
    id: str
    shop_name: Optional[str] = None

    class Config:
        from_attributes = True


class PendingItem(BaseModel):
    ingredient_id: str
    ingredient_name: Optional[str] = ""
    need_quantity: float = 0
    shop_name: Optional[str] = None
    price: float = 0
    checked: bool = False
    shop_id: Optional[str] = None


class CustomItem(BaseModel):
    id: str
    name: str
    need_quantity: float = 0
    shop_name: Optional[str] = None
    checked: bool = False


class CompletedItem(BaseModel):
    ingredient_id: Optional[str] = None
    ingredient_name: Optional[str] = ""
    need_quantity: float = 0
    is_custom: bool = False
    custom_id: Optional[str] = None


class CheckedItem(BaseModel):
    ingredient_id: Optional[str] = None
    ingredient_name: Optional[str] = ""
    need_quantity: float = 0
    is_custom: bool = False
    custom_id: Optional[str] = None


class PurchaseTaskResponse(BaseModel):
    id: str
    status: bool = False  # true=活跃, false=已完成
    pending_items: List[PendingItem] = []
    custom_items: List[CustomItem] = []
    completed_items: List[CompletedItem] = []
    removed_ingredient_ids: List[str] = []


class RefreshRequest(BaseModel):
    locally_removed_ids: Optional[List[str]] = None
    pending_items: Optional[List[dict]] = None
    custom_items: Optional[List[dict]] = None
    from_date: Optional[str] = None


class CompletePurchaseRequest(BaseModel):
    checked_items: List[CheckedItem] = []


class IngredientResolveRequest(BaseModel):
    name: str


class DeleteItemRequest(BaseModel):
    ingredient_id: str


class AddToTaskRequest(BaseModel):
    ingredient_id: str
