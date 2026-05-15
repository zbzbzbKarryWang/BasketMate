from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


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
    added_at: datetime

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
    ingredient_name: str
    need_quantity: float
    shop_name: str
    price: float
    checked: bool = False


class CustomItem(BaseModel):
    id: str
    name: str
    need_quantity: float
    shop_name: Optional[str] = None
    checked: bool = False


class PurchaseTaskResponse(BaseModel):
    id: str
    status: str
    pending_items: List[PendingItem] = []
    custom_items: List[CustomItem] = []
    removed_ingredient_ids: List[str] = []


class RefreshRequest(BaseModel):
    locally_removed_ids: Optional[List[str]] = None


class CompletePurchaseRequest(BaseModel):
    pending_items: List[PendingItem]
    custom_items: List[CustomItem]
    locally_removed_ids: List[str]
