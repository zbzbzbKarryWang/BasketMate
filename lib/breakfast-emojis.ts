// 早餐相关的emoji数组
export const breakfastEmojis = [
  '🍞', '🥐', '🥨', '🧀', '🥚', '🍳', '🥓', '🍖',
  '🌭', '🍔', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗',
  '🍿', '🥘', '🍝', '🍜'
]

// 获取早餐食谱的emoji
export function getBreakfastEmoji(recipeName: string, allBreakfastRecipes: { id: string; name: string }[]): string {
  // 按食谱名称排序，确保顺序一致
  const sortedRecipes = [...allBreakfastRecipes].sort((a, b) => a.name.localeCompare(b.name))
  const index = sortedRecipes.findIndex(recipe => recipe.name === recipeName)
  return index >= 0 ? breakfastEmojis[index % breakfastEmojis.length] : '🍽️'
}

// 根据食谱ID获取emoji
export function getBreakfastEmojiById(recipeId: string, allBreakfastRecipes: { id: string; name: string }[]): string {
  const recipe = allBreakfastRecipes.find(r => r.id === recipeId)
  if (!recipe) return '🍽️'
  return getBreakfastEmoji(recipe.name, allBreakfastRecipes)
}