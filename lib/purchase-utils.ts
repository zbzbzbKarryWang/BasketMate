import { supabase } from "./supabaseClient"
import type { MealPlan, Recipe, InventoryItem, PriceItem, PendingItem, Shop } from "./types"
import { parseRecipeIngredients } from "./supabase-mappers"

/**
 * 从数据库获取最新数据并计算待购食材列表
 * @param blacklist 黑名单食材ID数组
 * @returns 待购食材列表
 */
export async function computePendingItemsFromDB(
  blacklist: string[]
): Promise<PendingItem[]> {
  // 获取所有食材
  const { data: ingRows, error: ingErr } = await supabase
    .from("ingredients")
    .select("*")
  if (ingErr) throw ingErr
  const inventory = (ingRows || []) as InventoryItem[]
  
  // 构建食材映射
  const inventoryMap = new Map<string, InventoryItem>()
  for (const item of inventory) {
    inventoryMap.set(item.id, item)
  }
  
  // 获取所有菜谱
  const { data: recipeRows, error: recErr } = await supabase
    .from("recipes")
    .select("*")
  if (recErr) throw recErr
  
  // 构建菜谱映射
  const recipeMap = new Map<string, any>()
  for (const row of recipeRows || []) {
    recipeMap.set(row.id, row)
  }
  
  // 获取所有计划
  const { data: planRows, error: planErr } = await supabase
    .from("plans")
    .select("*")
  if (planErr) throw planErr
  
  // 构建计划数组
  const mealPlans: MealPlan[] = []
  for (const row of planRows || []) {
    const recipes: Recipe[] = []
    const mealIds = (row.meal_ids as string[]) || []
    for (const id of mealIds) {
      const recipeRow = recipeMap.get(id)
      if (recipeRow) {
        const ingredientRefs = parseRecipeIngredients(recipeRow.ingredients)
        const ingredients = ingredientRefs.map(ref => {
          const ing = inventoryMap.get(ref.ingredient_id)
          return {
            name: ing?.name || "未知食材",
            quantity: ref.quantity,
            unit: ing?.unit || ""
          }
        })
        recipes.push({
          id: recipeRow.id,
          name: recipeRow.name,
          category: recipeRow.category,
          ingredients
        })
      }
    }
    
    mealPlans.push({
      id: row.id,
      date: row.date,
      breakfast_recipe_id: row.breakfast_recipe_id || undefined,
      recipes,
      shoppingListItems: 0
    })
  }
  
  // 获取所有价格
  const { data: priceRows, error: priceErr } = await supabase
    .from("prices")
    .select("*, shops(name)")
  if (priceErr) throw priceErr
  
  const priceList: PriceItem[] = (priceRows || []).map((row: any) => ({
    id: row.id,
    ingredient: row.ingredient_id,
    ingredient_id: row.ingredient_id,
    shop_id: row.shop_id,
    shop_name: row.shops?.name || "未知店铺",
    price: row.price
  }))
  
  // 获取所有店铺
  const { data: shopRows, error: shopErr } = await supabase
    .from("shops")
    .select("*")
  if (shopErr) throw shopErr
  const shops = (shopRows || []) as Shop[]
  
  // 调用原有的计算函数
  return computePendingItems(blacklist, mealPlans, inventory, priceList, shops)
}

/**
 * 计算待购食材列表
 * @param blacklist 黑名单食材ID数组
 * @param mealPlans 用餐计划数组
 * @param inventory 库存数组
 * @param priceList 价格数组
 * @param shops 店铺数组
 * @returns 待购食材列表
 */
export async function computePendingItems(
  blacklist: string[],
  mealPlans: MealPlan[],
  inventory: InventoryItem[],
  priceList: PriceItem[],
  shops: Shop[]
): Promise<PendingItem[]> {
  const ingredientMap = new Map<string, { name: string; unit: string; totalNeed: number }>()
  const inventoryMap = new Map<string, number>()
  const priceMap = new Map<string, { shop_id: string; shop_name: string; price: number }[]>()

  // 构建库存映射
  for (const item of inventory) {
    inventoryMap.set(item.id, item.quantity)
  }

  // 构建价格映射
  for (const price of priceList) {
    const existing = priceMap.get(price.ingredient_id) || []
    existing.push({ 
      shop_id: price.shop_id, 
      shop_name: price.shop_name, 
      price: price.price 
    })
    priceMap.set(price.ingredient_id, existing)
  }

  // 汇总所有计划的食材需求
  for (const plan of mealPlans) {
    if (plan.breakfast_recipe_id) {
      // 早餐食材需求
    }
    for (const recipe of plan.recipes) {
      for (const ing of recipe.ingredients) {
        const id = inventory.find(i => i.name === ing.name)?.id
        if (!id) continue
        
        const existing = ingredientMap.get(id)
        if (existing) {
          existing.totalNeed += ing.quantity
        } else {
          ingredientMap.set(id, {
            name: ing.name,
            unit: ing.unit,
            totalNeed: ing.quantity
          })
        }
      }
    }
  }

  const pendingItems: PendingItem[] = []
  
  for (const [ingredientId, data] of ingredientMap) {
    if (blacklist.includes(ingredientId)) continue

    const currentStock = inventoryMap.get(ingredientId) || 0
    const needQuantity = Math.max(0, data.totalNeed - currentStock)
    
    if (needQuantity <= 0) continue

    // 获取最低价店铺
    const prices = priceMap.get(ingredientId) || []
    let shopId: string | null = null
    let shopName = "待定"
    let minPrice = 0
    
    if (prices.length > 0) {
      prices.sort((a, b) => a.price - b.price)
      shopId = prices[0].shop_id
      shopName = prices[0].shop_name
      minPrice = prices[0].price
    }

    pendingItems.push({
      ingredient_id: ingredientId,
      shop_id: shopId,
      name: data.name,
      shop_name: shopName,
      price: minPrice,
      need_quantity: needQuantity,
      unit: data.unit,
      checked: false
    })
  }

  return pendingItems
}

/**
 * 更新或插入活跃的采购任务
 * @param newPendingItems 新的待购项列表
 * @param newCustomItems 新的自定义项列表（可选）
 * @param additionalRemovedIds 额外的删除ID数组（可选）
 */
export async function upsertActiveTask(
  newPendingItems: PendingItem[],
  newCustomItems?: any[],
  additionalRemovedIds?: string[]
) {
  const { data: existingTasks, error: findError } = await supabase
    .from("purchase_tasks")
    .select("*")
    .eq("status", "active")
    .limit(1)

  if (findError) throw findError

  if (existingTasks && existingTasks.length > 0) {
    const existing = existingTasks[0]
    const mergedRemovedIds = Array.from(
      new Set([...(existing.removed_ingredient_ids || []), ...(additionalRemovedIds || [])])
    )
    
    const updateData: any = {
      pending_items: newPendingItems,
      removed_ingredient_ids: mergedRemovedIds
    }
    
    if (newCustomItems !== null) {
      updateData.custom_items = newCustomItems || []
    }

    const { error: updateError } = await supabase
      .from("purchase_tasks")
      .update(updateData)
      .eq("id", existing.id)

    if (updateError) throw updateError
    return existing.id
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("purchase_tasks")
      .insert({
        status: "active",
        pending_items: newPendingItems,
        custom_items: newCustomItems || [],
        removed_ingredient_ids: additionalRemovedIds || []
      })
      .select("id")

    if (insertError) throw insertError
    return inserted?.[0]?.id
  }
}

/**
 * 获取活跃的采购任务
 */
export async function getActivePurchaseTask() {
  const { data, error } = await supabase
    .from("purchase_tasks")
    .select("*")
    .eq("status", "active")
    .limit(1)

  if (error) throw error
  return data?.[0] || null
}
