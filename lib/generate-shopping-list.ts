import type { SupabaseClient } from '@supabase/supabase-js'
import type { IngredientRow, RecipeRow } from '@/lib/supabase-mappers'
import { parseRecipeIngredients } from '@/lib/supabase-mappers'

/**
 * 根据 date >= fromDate 的计划汇总菜谱用量，减去库存，按比价选最低价店铺，写入 shopping_list（仅非临时行）。
 */
export async function runGenerateShoppingList(
  supabase: SupabaseClient,
  fromDate?: string
): Promise<void> {
  const minDate =
    fromDate ?? new Date().toISOString().slice(0, 10)

  const { data: plans, error: pe } = await supabase
    .from('plans')
    .select('meal_ids, breakfast_recipe_id')
    .gte('date', minDate)
  if (pe) throw pe

  const { data: ingredients, error: ie } = await supabase
    .from('ingredients')
    .select('*')
  if (ie) throw ie

  const { data: recipes, error: re } = await supabase.from('recipes').select('*')
  if (re) throw re

  const { data: prices, error: pre } = await supabase.from('prices').select('*, shops(name)')
  if (pre) throw pre

  const recipeById = new Map<string, RecipeRow>(
    (recipes ?? []).map((r) => [r.id, r as RecipeRow])
  )
  const stock = new Map<string, number>(
    (ingredients ?? []).map((i: IngredientRow) => [i.id, i.quantity])
  )
  const existingIngredientIds = new Set<string>(
    (ingredients ?? []).map((i: IngredientRow) => i.id)
  )

  const needByIngId = new Map<string, number>()

  for (const plan of plans ?? []) {
    // 处理正餐菜谱
    const ids = (plan.meal_ids as string[] | null) ?? []
    for (const mid of ids) {
      const recipe = recipeById.get(mid)
      if (!recipe) continue
      const lines = parseRecipeIngredients(recipe.ingredients)
      for (const line of lines) {
        if (existingIngredientIds.has(line.ingredient_id)) {
          needByIngId.set(
            line.ingredient_id,
            (needByIngId.get(line.ingredient_id) ?? 0) + line.quantity
          )
        }
      }
    }
    
    // 处理早餐菜谱
    const breakfastId = plan.breakfast_recipe_id as string | null
    if (breakfastId) {
      const recipe = recipeById.get(breakfastId)
      if (recipe) {
        const lines = parseRecipeIngredients(recipe.ingredients)
        for (const line of lines) {
          if (existingIngredientIds.has(line.ingredient_id)) {
            needByIngId.set(
              line.ingredient_id,
              (needByIngId.get(line.ingredient_id) ?? 0) + line.quantity
            )
          }
        }
      }
    }
  }

  const net = new Map<string, number>()
  for (const [id, need] of needByIngId) {
    const have = stock.get(id) ?? 0
    const n = Math.max(0, need - have)
    if (n > 0) net.set(id, n)
  }

  const best = new Map<string, { shop: string; price: number }>()
  for (const p of prices ?? []) {
    if (!net.has(p.ingredient_id)) continue
    const prev = best.get(p.ingredient_id)
    if (!prev || p.price < prev.price) {
      best.set(p.ingredient_id, { shop: (p as any).shops?.name || '待定', price: p.price })
    }
  }

  // 先获取所有购物清单记录
  const { data: shoppingItems, error: fetchErr } = await supabase
    .from('shopping_list')
    .select('id')
  if (fetchErr) throw fetchErr
  
  // 如果有记录，逐个删除
  if (shoppingItems && shoppingItems.length > 0) {
    for (const item of shoppingItems) {
      const { error: delErr } = await supabase
        .from('shopping_list')
        .delete()
        .eq('id', item.id)
      if (delErr) throw delErr
    }
  }

  const ingList = (ingredients ?? []) as IngredientRow[]
  const rows = [...net.entries()].map(([ingredientId, qty]) => {
    const b = best.get(ingredientId) ?? { shop: '待定', price: 0 }
    return {
      ingredient_id: ingredientId,
      shop_name: b.shop,
      need_quantity: qty,
      checked: false,
    }
  })

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('shopping_list').insert(rows)
    if (insErr) throw insErr
  }
}
