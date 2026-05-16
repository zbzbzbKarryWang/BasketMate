// 食材类型
export interface Ingredient {
  id: string
  name: string
  alias?: string
  quantity: number
  unit: string
  addedAt: Date
}

// 菜谱类型
export interface Recipe {
  id: string
  name: string
  category: string
  ingredients: { name: string; quantity: number }[]
  notes?: string
}

// 早餐选项
export interface BreakfastOption {
  id: string
  name: string
  emoji: string
}

// 用餐计划
export interface MealPlan {
  id: string
  date: string
  breakfast_recipe_id: string | null
  recipes: Recipe[]
  shoppingListItems: number
  /** 该计划在早餐转盘上临时追加的选项 */
  breakfastWheelExtras?: BreakfastOption[]
  /** 从默认转盘与本计划追加项中临时隐藏的选项 id */
  breakfastWheelHiddenIds?: string[]
}

// 库存项
export interface InventoryItem {
  id: string
  name: string
  alias?: string
  quantity: number
  unit: string
  addedAt: Date
}

// 采购项
export interface ShoppingItem {
  id: string
  name: string
  quantity: number
  unit: string
  price: number
  store: string
  checked: boolean
  /** 本次采购临时备忘，不计入库存与食材主数据 */
  isEphemeral?: boolean
}

// 店铺类型
export interface Shop {
  id: string
  name: string
  created_at: string
}

// 比价项
export interface PriceItem {
  id: string
  ingredient: string
  ingredient_id: string
  shop_id: string
  shop_name: string
  price: number
}

// 采购任务待购项
export interface PendingItem {
  ingredient_id: string
  ingredient_name: string
  shop_id: string | null
  shop_name: string
  price: number
  need_quantity: number
  unit: string
  checked: boolean
}

// 采购任务自定义项
export interface CustomItem {
  id: string
  name: string
  shop_name: string
  need_quantity: number
  checked: boolean
}

// 黑名单项类型
export interface RemovedItem {
  ingredient_id: string
  ingredient_name: string
}

// 采购任务类型
export interface PurchaseTask {
  id: string
  status: 'active' | 'completed'
  created_at: string
  completed_at: string | null
  pending_items: PendingItem[]
  custom_items: CustomItem[]
  removed_ingredient_ids: string[]
  removed_items?: RemovedItem[]
}
