import type { BreakfastOption, InventoryItem, MealPlan, PriceItem, Recipe, ShoppingItem } from '@/lib/types'

export type IngredientRow = {
  id: string
  name: string
  alias: string | null
  quantity: number
  added_at: string
}

export type PriceRow = {
  id: string
  ingredient_id: string
  shop_id: string
  price: number
  shops?: { name: string }
}

export type RecipeRow = {
  id: string
  name: string
  category: string
  ingredients: unknown
  notes: string | null
}

export type PlanRow = {
  id: string
  date: string
  breakfast_recipe_id: string | null
  meal_ids: string[] | null
  breakfast_wheel_extras: unknown
  breakfast_wheel_hidden_ids: string[] | null
}

export type ShoppingRow = {
  id: string
  ingredient_id: string | null
  shop_name: string
  need_quantity: number
  checked: boolean
  is_ephemeral: boolean | null
}

export type RecipeIngredientRef = {
  ingredient_id: string
  quantity: number
  name?: string
}

export function parseRecipeIngredients(raw: unknown): RecipeIngredientRef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null
      const o = x as Record<string, unknown>
      const id = (o.ingredient_id ?? o.ingredientId) as string | undefined
      const q = Number(o.quantity ?? 0)
      const n = o.name as string | undefined
      if (!id) return null
      return { ingredient_id: id, quantity: q, name: n }
    })
    .filter(Boolean) as RecipeIngredientRef[]
}

export function rowToInventoryItem(row: IngredientRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    alias: row.alias ?? undefined,
    quantity: row.quantity,
    addedAt: new Date(row.added_at),
  }
}

export function rowToPriceItem(
  row: PriceRow,
  nameByIngredientId: Map<string, string>
): PriceItem {
  return {
    id: row.id,
    ingredient: nameByIngredientId.get(row.ingredient_id) ?? row.ingredient_id,
    ingredient_id: row.ingredient_id,
    shop_id: row.shop_id,
    shop_name: row.shops?.name ?? '未知店铺',
    price: row.price,
  }
}

export function rowToRecipe(
  row: RecipeRow,
  nameByIngredientId: Map<string, string>
): Recipe {
  const refs = parseRecipeIngredients(row.ingredients)
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    ingredients: refs
      .map((r) => ({
        name: r.name ?? nameByIngredientId.get(r.ingredient_id) ?? '未知',
        quantity: r.quantity,
      })),
    notes: row.notes ?? undefined,
  }
}

export function parseBreakfastOption(raw: string | null): BreakfastOption | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t) return null
  try {
    const o = JSON.parse(t) as Record<string, unknown>
    if (o && typeof o.name === 'string') {
      return {
        id: String(o.id ?? ''),
        name: o.name,
        emoji: String(o.emoji ?? '🍽️'),
      }
    }
  } catch {
    /* legacy plain text */
    return { id: 'legacy', name: t, emoji: '🍽️' }
  }
  return null
}

export function serializeBreakfastOption(b: BreakfastOption | null): string | null {
  if (!b) return null
  return JSON.stringify({ id: b.id, name: b.name, emoji: b.emoji })
}

export function rowToMealPlan(
  row: PlanRow,
  recipesById: Map<string, Recipe>
): MealPlan {
  const mealIds = row.meal_ids ?? []
  const recipes = mealIds
    .map((id) => recipesById.get(id))
    .filter(Boolean) as Recipe[]

  return {
    id: row.id,
    date: row.date,
    breakfast_recipe_id: row.breakfast_recipe_id,
    recipes,
    shoppingListItems: recipes.reduce((a, r) => a + r.ingredients.length, 0),
  }
}

export function rowToShoppingItem(
  row: ShoppingRow,
  nameByIngredientId: Map<string, string>
): ShoppingItem {
  const name =
    (row.ingredient_id ? nameByIngredientId.get(row.ingredient_id) : null) ??
    '物品'
  return {
    id: row.id,
    name,
    quantity: row.need_quantity,
    price: 0,
    store: row.shop_name,
    checked: row.checked,
    isEphemeral: row.is_ephemeral || false,
  }
}
