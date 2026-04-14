"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient"
import { runGenerateShoppingList } from "@/lib/generate-shopping-list"

import type {
  BreakfastOption,
  InventoryItem,
  MealPlan,
  PriceItem,
  Recipe,
  ShoppingItem,
  Shop,
  PurchaseTask,
  PendingItem,
} from "@/lib/types"
import { computePendingItems, upsertActiveTask, getActivePurchaseTask, computePendingItemsFromDB } from "@/lib/purchase-utils"
import {
  type IngredientRow,
  type PlanRow,
  type PriceRow,
  type RecipeIngredientRef,
  type RecipeRow,
  type ShoppingRow,
  parseRecipeIngredients,
  rowToInventoryItem,
  rowToMealPlan,
  rowToPriceItem,
  rowToRecipe,
  rowToShoppingItem,
  serializeBreakfastOption,
} from "@/lib/supabase-mappers"

type ConnectionStatus = "unknown" | "ok" | "error"

type DataContextValue = {
  loading: boolean
  error: string | null
  connectionStatus: ConnectionStatus
  inventory: InventoryItem[]
  recipes: Recipe[]
  mealPlans: MealPlan[]
  priceList: PriceItem[]
  shops: Shop[]
  refresh: () => Promise<void>
  fetchIngredients: () => Promise<void>
  updateIngredient: (id: string, quantity: number) => Promise<void>
  deleteIngredient: (id: string) => Promise<void>
  addIngredient: (data: {
    name: string
    unit?: string
    quantity?: number
  }) => Promise<string>
  fetchPrices: () => Promise<void>
  addPrice: (data: {
    ingredient_id: string
    shop_id: string
    price: number
  }) => Promise<void>
  updatePrice: (id: string, patch: Partial<{ shop_id: string; price: number }>) => Promise<void>
  deletePrice: (id: string) => Promise<void>
  fetchShops: () => Promise<void>
  addShop: (data: { name: string }) => Promise<void>
  updateShop: (id: string, patch: Partial<{ name: string }>) => Promise<void>
  deleteShop: (id: string) => Promise<void>
  fetchRecipes: () => Promise<void>
  addRecipe: (recipe: Omit<Recipe, "id">) => Promise<void>
  updateRecipe: (id: string, patch: Partial<Recipe>) => Promise<void>
  deleteRecipe: (id: string) => Promise<void>
  fetchPlans: () => Promise<void>
  addPlan: (plan: Omit<MealPlan, "id" | "shoppingListItems">) => Promise<void>
  updatePlan: (id: string, patch: Partial<MealPlan>) => Promise<void>
  deletePlan: (id: string) => Promise<void>
  activePurchaseTask: PurchaseTask | null
  fetchActivePurchaseTask: () => Promise<void>
  recalculateAndPersistPurchaseTask: (locallyRemovedIds?: string[]) => Promise<void>
  addToPurchaseTask: (ingredientId: string) => Promise<void>
  completePurchase: (pendingItems: PendingItem[], customItems: any[], locallyRemovedIds: string[]) => Promise<void>
  clearPurchaseTask: (pendingItems: PendingItem[], customItems: any[]) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

function buildIngredientMaps(rows: IngredientRow[]) {
  const nameById = new Map<string, string>()
  const unitById = new Map<string, string>()
  for (const r of rows) {
    nameById.set(r.id, r.name)
    unitById.set(r.id, r.unit)
  }
  return { nameById, unitById }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("unknown")
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([])
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [activePurchaseTask, setActivePurchaseTask] = useState<PurchaseTask | null>(null)

  const resolveOrCreateIngredientId = useCallback(async (name: string) => {
    const n = name.trim()
    if (!n) return null
    const { data: found } = await supabase
      .from("ingredients")
      .select("id")
      .eq("name", n)
      .maybeSingle()
    if (found?.id) return found.id as string
    const { data: ins, error } = await supabase
      .from("ingredients")
      .insert({ name: n, unit: "份", quantity: 0 })
      .select("id")
      .single()
    if (error) throw error
    return ins.id as string
  }, [])

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError("未配置 Supabase 环境变量")
      setConnectionStatus("error")
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { error: ping } = await supabase.from("ingredients").select("id").limit(1)
      if (ping) throw ping
      setConnectionStatus("ok")

      const { data: ingRows, error: ingErr } = await supabase
        .from("ingredients")
        .select("*")
        .order("added_at", { ascending: false })
      if (ingErr) throw ingErr
      const ingredients = (ingRows ?? []) as IngredientRow[]
      const { nameById, unitById } = buildIngredientMaps(ingredients)
      setInventory(ingredients.map(rowToInventoryItem))

      const { data: recipeRows, error: recErr } = await supabase
        .from("recipes")
        .select("*")
        .order("name")
      if (recErr) throw recErr
      const rrows = (recipeRows ?? []) as RecipeRow[]
      const recipeUi = rrows.map((r) => rowToRecipe(r, nameById, unitById))
      setRecipes(recipeUi)
      const recipesById = new Map(recipeUi.map((r) => [r.id, r]))

      const { data: planRows, error: plErr } = await supabase
        .from("plans")
        .select("*")
        .order("date", { ascending: true })
      if (plErr) throw plErr
      setMealPlans(
        ((planRows ?? []) as PlanRow[]).map((row) =>
          rowToMealPlan(row, recipesById)
        )
      )

      const { data: priceRows, error: prErr } = await supabase
        .from("prices")
        .select("*, shops(name)")
      if (prErr) throw prErr
      setPriceList(
        ((priceRows ?? []) as any[]).map((row) => ({
          id: row.id,
          ingredient: nameById.get(row.ingredient_id) || row.ingredient_id,
          ingredient_id: row.ingredient_id,
          shop_id: row.shop_id,
          shop_name: row.shops?.name || "未知店铺",
          price: row.price,
        }))
      )

      const { data: shopRows, error: shopErr } = await supabase
        .from("shops")
        .select("*")
        .order("name")
      if (shopErr) throw shopErr
      setShops((shopRows ?? []) as Shop[])

      const activeTask = await getActivePurchaseTask()
      setActivePurchaseTask(activeTask as PurchaseTask | null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setConnectionStatus("error")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const recipeToRefs = useCallback(
    async (recipe: Pick<Recipe, "ingredients">) => {
      const refs: RecipeIngredientRef[] = []
      for (const ing of recipe.ingredients) {
        const id = await resolveOrCreateIngredientId(ing.name)
        if (!id) continue
        refs.push({ ingredient_id: id, quantity: Math.max(0, ing.quantity) })
      }
      return refs
    },
    [resolveOrCreateIngredientId]
  )

  const fetchIngredients = useCallback(async () => {
    await refresh()
  }, [refresh])

  const updateIngredient = useCallback(async (id: string, quantity: number) => {
    const { error } = await supabase
      .from("ingredients")
      .update({ quantity })
      .eq("id", id)
    if (error) throw error
    await refresh()
  }, [refresh])

  const deleteIngredient = useCallback(async (id: string) => {
    const { data: recipeRows, error: recipeErr } = await supabase
      .from("recipes")
      .select("id, ingredients")
    if (recipeErr) throw recipeErr

    for (const recipe of (recipeRows as any[])) {
      const ingredients = (recipe.ingredients as any[]) || []
      const updatedIngredients = ingredients.filter(
        (ing: any) => ing.ingredient_id !== id
      )
      if (updatedIngredients.length !== ingredients.length) {
        await supabase
          .from("recipes")
          .update({ ingredients: updatedIngredients })
          .eq("id", recipe.id)
      }
    }

    const { data: purchaseTasks, error: purchaseErr } = await supabase
      .from("purchase_tasks")
      .select("id, pending_items, removed_ingredient_ids")
      .eq("status", "active")
    if (!purchaseErr && purchaseTasks && purchaseTasks.length > 0) {
      for (const task of purchaseTasks) {
        const pendingItems = (task.pending_items as any[]) || []
        const removedIds = (task.removed_ingredient_ids as string[]) || []
        const updatedPendingItems = pendingItems.filter(
          (item: any) => item.ingredient_id !== id
        )
        const updatedRemovedIds = [...removedIds, id]
        await supabase
          .from("purchase_tasks")
          .update({
            pending_items: updatedPendingItems,
            removed_ingredient_ids: updatedRemovedIds
          })
          .eq("id", task.id)
      }
    }

    await supabase
      .from("ingredients")
      .delete()
      .eq("id", id)

    await refresh()
  }, [refresh])

  const addIngredient = useCallback(
    async (data: { name: string; unit?: string; quantity?: number }) => {
      const name = data.name.trim()
      const { data: existing } = await supabase
        .from("ingredients")
        .select("id, quantity")
        .eq("name", name)
        .maybeSingle()
      if (existing?.id) {
        // 如果食材已存在，更新数量
        const newQuantity = (existing.quantity as number) + (data.quantity ?? 0)
        await supabase
          .from("ingredients")
          .update({ quantity: newQuantity })
          .eq("id", existing.id)
        await refresh()
        return existing.id as string
      }
      const { data: ins, error } = await supabase
        .from("ingredients")
        .insert({
          name,
          unit: data.unit ?? "份",
          quantity: data.quantity ?? 0,
        })
        .select("id")
        .single()
      if (error) throw error
      await refresh()
      return ins.id as string
    },
    [refresh]
  )

  const fetchPrices = useCallback(async () => {
    await refresh()
  }, [refresh])

  const addPrice = useCallback(
    async (data: {
      ingredient_id: string
      shop_id: string
      price: number
    }) => {
      const { error } = await supabase.from("prices").insert(data)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const updatePrice = useCallback(
    async (
      id: string,
      patch: Partial<{ shop_id: string; price: number }>
    ) => {
      const { error } = await supabase.from("prices").update(patch).eq("id", id)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const deletePrice = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("prices").delete().eq("id", id)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const fetchShops = useCallback(async () => {
    await refresh()
  }, [refresh])

  const addShop = useCallback(
    async (data: { name: string }) => {
      const { error } = await supabase.from("shops").insert(data)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const updateShop = useCallback(
    async (
      id: string,
      patch: Partial<{ name: string }>
    ) => {
      const { error } = await supabase.from("shops").update(patch).eq("id", id)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const deleteShop = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("shops").delete().eq("id", id)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const fetchRecipes = useCallback(async () => {
    await refresh()
  }, [refresh])

  const addRecipe = useCallback(
    async (recipe: Omit<Recipe, "id">) => {
      const refs = await recipeToRefs(recipe)
      const { error } = await supabase.from("recipes").insert({
        name: recipe.name,
        category: recipe.category,
        ingredients: refs,
      })
      if (error) throw error
      await refresh()
    },
    [refresh, recipeToRefs]
  )

  const updateRecipe = useCallback(
    async (id: string, patch: Partial<Recipe>) => {
      const row: Record<string, unknown> = {}
      if (patch.name != null) row.name = patch.name
      if (patch.category != null) row.category = patch.category
      if (patch.ingredients != null) {
        row.ingredients = await recipeToRefs({
          ingredients: patch.ingredients,
        } as Recipe)
      }
      if (Object.keys(row).length) {
        const { error } = await supabase.from("recipes").update(row).eq("id", id)
        if (error) throw error
      }
      await refresh()
    },
    [refresh, recipeToRefs]
  )

  const deleteRecipe = useCallback(
    async (id: string) => {
      const { data: plans } = await supabase.from("plans").select("id, meal_ids")
      for (const p of plans ?? []) {
        const ids = (p.meal_ids as string[]) ?? []
        if (!ids.includes(id)) continue
        const next = ids.filter((x) => x !== id)
        await supabase.from("plans").update({ meal_ids: next }).eq("id", p.id)
      }
      const { error } = await supabase.from("recipes").delete().eq("id", id)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const fetchPlans = useCallback(async () => {
    await refresh()
  }, [refresh])

  const addPlan = useCallback(
    async (plan: Omit<MealPlan, "id" | "shoppingListItems">) => {
      const { error } = await supabase.from("plans").insert({
        date: plan.date,
        breakfast_recipe_id: plan.breakfast_recipe_id,
        meal_ids: plan.recipes.map((r) => r.id),
      })
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const updatePlan = useCallback(
    async (id: string, patch: Partial<MealPlan>) => {
      const row: Record<string, unknown> = {}
      if (patch.date != null) row.date = patch.date
      if (patch.breakfast_recipe_id !== undefined) {
        row.breakfast_recipe_id = patch.breakfast_recipe_id
      }
      if (patch.recipes != null) row.meal_ids = patch.recipes.map((r) => r.id)
      if (Object.keys(row).length) {
        const { error } = await supabase.from("plans").update(row).eq("id", id)
        if (error) throw error
      }
      await refresh()
    },
    [refresh]
  )

  const deletePlan = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id)
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const fetchActivePurchaseTask = useCallback(async () => {
    const task = await getActivePurchaseTask()
    setActivePurchaseTask(task as PurchaseTask | null)
  }, [])

  const recalculateAndPersistPurchaseTask = useCallback(async (locallyRemovedIds: string[] = []) => {
    const currentTask = activePurchaseTask
    const existingRemovedIds = currentTask?.removed_ingredient_ids || []
    const completeBlacklist = Array.from(new Set([...existingRemovedIds, ...locallyRemovedIds]))
    
    const newPendingItems = await computePendingItemsFromDB(completeBlacklist)
    
    await upsertActiveTask(newPendingItems, undefined, locallyRemovedIds)
    await fetchActivePurchaseTask()
  }, [activePurchaseTask, fetchActivePurchaseTask])

  const addToPurchaseTask = useCallback(async (ingredientId: string) => {
    let task = activePurchaseTask
    
    if (!task) {
      await upsertActiveTask([], [], [])
      task = (await getActivePurchaseTask()) as PurchaseTask
      setActivePurchaseTask(task)
    }
    
    const pendingItems = [...(task.pending_items || [])]
    const existingIndex = pendingItems.findIndex(item => item.ingredient_id === ingredientId)
    
    const ingredient = inventory.find(i => i.id === ingredientId)
    if (!ingredient) return
    
    const prices = priceList.filter(p => p.ingredient_id === ingredientId)
    prices.sort((a, b) => a.price - b.price)
    const bestPrice = prices[0]
    
    if (existingIndex >= 0) {
      if (!pendingItems[existingIndex].checked) {
        pendingItems[existingIndex].need_quantity += 1
      }
    } else {
      const removedIds = task.removed_ingredient_ids || []
      const newRemovedIds = removedIds.filter(id => id !== ingredientId)
      
      pendingItems.push({
        ingredient_id: ingredientId,
        name: ingredient.name,
        shop_id: bestPrice?.shop_id || null,
        shop_name: bestPrice?.shop_name || "待定",
        price: bestPrice?.price || 0,
        need_quantity: 1,
        unit: ingredient.unit,
        checked: false
      })
      
      await upsertActiveTask(pendingItems, task.custom_items, newRemovedIds.length < removedIds.length ? newRemovedIds : undefined)
      await fetchActivePurchaseTask()
      return
    }
    
    await upsertActiveTask(pendingItems, task.custom_items)
    await fetchActivePurchaseTask()
  }, [activePurchaseTask, inventory, priceList, fetchActivePurchaseTask])

  const completePurchase = useCallback(async (
    pendingItems: PendingItem[],
    customItems: any[],
    locallyRemovedIds: string[]
  ) => {
    const checkedItems = pendingItems.filter(item => item.checked)
    
    for (const item of checkedItems) {
      if (item.ingredient_id) {
        const { data: current } = await supabase
          .from("ingredients")
          .select("quantity")
          .eq("id", item.ingredient_id)
          .single()
        
        const currentQty = (current as any)?.quantity || 0
        const currentDate = new Date().toISOString()
        
        await supabase
          .from("ingredients")
          .update({
            quantity: currentQty + item.need_quantity,
            added_at: currentQty === 0 ? currentDate : undefined
          })
          .eq("id", item.ingredient_id)
      }
    }
    
    const task = activePurchaseTask
    if (task) {
      const mergedRemovedIds = Array.from(
        new Set([...(task.removed_ingredient_ids || []), ...locallyRemovedIds])
      )
      
      const remainingPending = pendingItems.filter(item => !item.checked)
      const remainingCustom = customItems.filter(item => !item.checked)
      
      if (remainingPending.length === 0 && remainingCustom.length === 0) {
        await supabase
          .from("purchase_tasks")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            pending_items: [],
            custom_items: [],
            removed_ingredient_ids: mergedRemovedIds
          })
          .eq("id", task.id)
      } else {
        await supabase
          .from("purchase_tasks")
          .update({
            pending_items: remainingPending,
            custom_items: remainingCustom,
            removed_ingredient_ids: mergedRemovedIds
          })
          .eq("id", task.id)
      }
    }
    
    await refresh()
  }, [activePurchaseTask, refresh])

  const clearPurchaseTask = useCallback(async (pendingItems: PendingItem[], customItems: any[]) => {
    const task = activePurchaseTask
    if (task) {
      const allRemovedIds = pendingItems
        .filter(item => item.ingredient_id)
        .map(item => item.ingredient_id)
      
      const mergedRemovedIds = Array.from(
        new Set([...(task.removed_ingredient_ids || []), ...allRemovedIds])
      )
      
      await supabase
        .from("purchase_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          pending_items: [],
          custom_items: [],
          removed_ingredient_ids: mergedRemovedIds
        })
        .eq("id", task.id)
    }
    
    await refresh()
  }, [activePurchaseTask, refresh])

  const value = useMemo<DataContextValue>(
    () => ({
      loading,
      error,
      connectionStatus,
      inventory,
      recipes,
      mealPlans,
      priceList,
      shops,
      refresh,
      fetchIngredients,
      updateIngredient,
      deleteIngredient,
      addIngredient,
      fetchPrices,
      addPrice,
      updatePrice,
      deletePrice,
      fetchShops,
      addShop,
      updateShop,
      deleteShop,
      fetchRecipes,
      addRecipe,
      updateRecipe,
      deleteRecipe,
      fetchPlans,
      addPlan,
      updatePlan,
      deletePlan,
      activePurchaseTask,
      fetchActivePurchaseTask,
      recalculateAndPersistPurchaseTask,
      addToPurchaseTask,
      completePurchase,
      clearPurchaseTask,
    }),
    [
      loading,
      error,
      connectionStatus,
      inventory,
      recipes,
      mealPlans,
      priceList,
      shops,
      activePurchaseTask,
      refresh,
      fetchIngredients,
      updateIngredient,
      deleteIngredient,
      addIngredient,
      fetchPrices,
      addPrice,
      updatePrice,
      deletePrice,
      fetchShops,
      addShop,
      updateShop,
      deleteShop,
      fetchRecipes,
      addRecipe,
      updateRecipe,
      deleteRecipe,
      fetchPlans,
      addPlan,
      updatePlan,
      deletePlan,
      fetchActivePurchaseTask,
      recalculateAndPersistPurchaseTask,
      addToPurchaseTask,
      completePurchase,
      clearPurchaseTask,
    ]
  )

  return (
    <DataContext.Provider value={value}>{children}</DataContext.Provider>
  )
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) {
    throw new Error("useData must be used within DataProvider")
  }
  return ctx
}
