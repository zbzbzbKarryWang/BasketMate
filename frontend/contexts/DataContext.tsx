"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

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
import { upsertActiveTask, getActivePurchaseTask, computePendingItemsFromDB } from "@/lib/purchase-utils"
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
  updateIngredient: (id: string, quantity: number, additionalData?: Partial<{ name: string; addedAt: Date; alias?: string }>) => Promise<void>
  deleteIngredient: (id: string) => Promise<void>
  addIngredient: (data: {
    name: string
    unit?: string
    quantity?: number
    alias?: string
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
    try {
      const found = await apiGet<{ id: string } | null>(`/ingredients?name=${encodeURIComponent(n)}`)
      if (found && 'id' in found) return found.id
    } catch (e) {
      // not found, continue to create
    }
    try {
      const ins = await apiPost<{ id: string }>('/ingredients/resolve', { name: n })
      return ins.id
    } catch (e) {
      throw e
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ingRows = await apiGet<IngredientRow[]>('/ingredients')
      const ingredients = ingRows || []
      const { nameById, unitById } = buildIngredientMaps(ingredients)
      setInventory(ingredients.map(rowToInventoryItem))

      const recipeRows = await apiGet<RecipeRow[]>('/recipes')
      const rrows = recipeRows || []
      const recipeUi = rrows.map((r) => rowToRecipe(r, nameById, unitById))
      setRecipes(recipeUi)
      const recipesById = new Map(recipeUi.map((r) => [r.id, r]))

      const planRows = await apiGet<PlanRow[]>('/plans')
      setMealPlans(
        ((planRows || []) as PlanRow[]).map((row) =>
          rowToMealPlan(row, recipesById)
        )
      )

      const priceRows = await apiGet<any[]>('/prices')
      setPriceList(
        ((priceRows || []) as any[]).map((row) => ({
          id: row.id,
          ingredient: nameById.get(row.ingredient_id) || row.ingredient_id,
          ingredient_id: row.ingredient_id,
          shop_id: row.shop_id,
          shop_name: row.shop_name || "未知店铺",
          price: row.price,
        }))
      )

      const shopRows = await apiGet<Shop[]>('/shops')
      setShops((shopRows || []) as Shop[])

      const activeTask = await getActivePurchaseTask()
      setActivePurchaseTask(activeTask as PurchaseTask | null)
      setConnectionStatus("ok")
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

  const updateIngredient = useCallback(async (id: string, quantity: number, additionalData?: Partial<{ name: string; addedAt: Date; alias?: string }>) => {
    const updateData: Record<string, any> = { quantity }
    if (additionalData) {
      if (additionalData.name) updateData.name = additionalData.name
      if (additionalData.addedAt) updateData.added_at = additionalData.addedAt.toISOString()
      if (additionalData.alias !== undefined) updateData.alias = additionalData.alias || null
    }
    await apiPut(`/ingredients/${id}`, updateData)
    await refresh()
  }, [refresh])

  const deleteIngredient = useCallback(async (id: string) => {
    try {
      const recipeRows = await apiGet<any[]>('/recipes')
      for (const recipe of (recipeRows || [])) {
        const ingredients = (recipe.ingredients as any[]) || []
        const updatedIngredients = ingredients.filter(
          (ing: any) => ing.ingredient_id !== id
        )
        if (updatedIngredients.length !== ingredients.length) {
          await apiPut(`/recipes/${recipe.id}`, { ingredients: updatedIngredients })
        }
      }

      try {
        await apiDelete(`/ingredients/${id}`)
      } catch (e) {
        // might fail if already handled by cascade
      }
    } catch (e) {
      // ignore
    }
    await refresh()
  }, [refresh])

  const addIngredient = useCallback(
    async (data: { name: string; unit?: string; quantity?: number; alias?: string }) => {
      const name = data.name.trim()
      try {
        const existing = await apiGet<{ id: string; quantity: number } | null>(`/ingredients?name=${encodeURIComponent(name)}`)
        if (existing && 'id' in existing) {
          const newQuantity = (existing.quantity || 0) + (data.quantity ?? 0)
          await apiPut(`/ingredients/${existing.id}`, { quantity: newQuantity })
          await refresh()
          return existing.id
        }
      } catch (e) {
        // not found
      }
      const ins = await apiPost<{ id: string }>('/ingredients', {
        name,
        unit: data.unit ?? "份",
        quantity: data.quantity ?? 0,
        alias: data.alias ?? null,
      })
      await refresh()
      return ins.id
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
      await apiPost('/prices', data)
      await refresh()
    },
    [refresh]
  )

  const updatePrice = useCallback(
    async (
      id: string,
      patch: Partial<{ shop_id: string; price: number }>
    ) => {
      await apiPut(`/prices/${id}`, patch)
      await refresh()
    },
    [refresh]
  )

  const deletePrice = useCallback(
    async (id: string) => {
      await apiDelete(`/prices/${id}`)
      await refresh()
    },
    [refresh]
  )

  const fetchShops = useCallback(async () => {
    await refresh()
  }, [refresh])

  const addShop = useCallback(
    async (data: { name: string }) => {
      await apiPost('/shops', data)
      await refresh()
    },
    [refresh]
  )

  const updateShop = useCallback(
    async (
      id: string,
      patch: Partial<{ name: string }>
    ) => {
      await apiPut(`/shops/${id}`, patch)
      await refresh()
    },
    [refresh]
  )

  const deleteShop = useCallback(
    async (id: string) => {
      await apiDelete(`/shops/${id}`)
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
      await apiPost('/recipes', {
        name: recipe.name,
        category: recipe.category,
        ingredients: refs,
        notes: recipe.notes ?? null,
      })
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
      if (patch.notes !== undefined) row.notes = patch.notes || null
      if (Object.keys(row).length) {
        await apiPut(`/recipes/${id}`, row)
      }
      await refresh()
    },
    [refresh, recipeToRefs]
  )

  const deleteRecipe = useCallback(
    async (id: string) => {
      try {
        const plans = await apiGet<any[]>('/plans')
        for (const p of (plans || [])) {
          const ids = (p.meal_ids as string[]) ?? []
          if (!ids.includes(id)) continue
          const next = ids.filter((x) => x !== id)
          await apiPut(`/plans/${p.id}`, { meal_ids: next })
        }
      } catch (e) {
        // ignore
      }
      await apiDelete(`/recipes/${id}`)
      await refresh()
    },
    [refresh]
  )

  const fetchPlans = useCallback(async () => {
    await refresh()
  }, [refresh])

  const addPlan = useCallback(
    async (plan: Omit<MealPlan, "id" | "shoppingListItems">) => {
      await apiPost('/plans', {
        date: plan.date,
        breakfast_recipe_id: plan.breakfast_recipe_id,
        meal_ids: plan.recipes.map((r) => r.id),
      })
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
        await apiPut(`/plans/${id}`, row)
      }
      await refresh()
    },
    [refresh]
  )

  const deletePlan = useCallback(
    async (id: string) => {
      await apiDelete(`/plans/${id}`)
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
        ingredient_name: ingredient.name,
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
        try {
          const current = await apiGet<{ quantity: number }>(`/ingredients/${item.ingredient_id}`)
          const currentQty = current?.quantity || 0
          const currentDate = new Date().toISOString()
          
          await apiPut(`/ingredients/${item.ingredient_id}`, {
            quantity: currentQty + item.need_quantity,
            added_at: currentQty === 0 ? currentDate : undefined
          })
        } catch (e) {
          // ignore
        }
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
        await apiPost('/shopping/task/complete', {
          pending_items: [],
          custom_items: [],
          locally_removed_ids: mergedRemovedIds
        })
      } else {
        await upsertActiveTask(remainingPending, remainingCustom, mergedRemovedIds)
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
      
      await apiPost('/shopping/task/clear', {
        pending_items: [],
        custom_items: [],
        removed_ingredient_ids: mergedRemovedIds
      })
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
