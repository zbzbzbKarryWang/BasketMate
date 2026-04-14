export const RECIPE_CATEGORIES = ['早餐', '正餐', '其他'] as const

export type RecipeCategoryLabel = (typeof RECIPE_CATEGORIES)[number]

export const categoryMap: Record<RecipeCategoryLabel, string> = {
  '早餐': 'breakfast',
  '正餐': 'meal',
  '其他': 'snack'
}

export const reverseCategoryMap: Record<string, RecipeCategoryLabel> = {
  'breakfast': '早餐',
  'meal': '正餐',
  'snack': '其他'
}

export function normalizeRecipeCategory(c: string): string {
  if (c === '早餐' || c === '正餐' || c === '其他') {
    return categoryMap[c as RecipeCategoryLabel]
  }
  // 检查是否已经是英文值
  if (c === 'breakfast' || c === 'meal' || c === 'snack') {
    return c
  }
  return 'snack'
}

export function getCategoryLabel(c: string): RecipeCategoryLabel {
  if (c === '早餐' || c === '正餐' || c === '其他') {
    return c as RecipeCategoryLabel
  }
  // 将英文值转换为中文标签
  return reverseCategoryMap[c] || '其他'
}
