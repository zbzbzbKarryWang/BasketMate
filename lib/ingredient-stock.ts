export function ingredientStockOk(
  inventory: { name: string; quantity: number }[],
  ing: { name: string; quantity: number }
): boolean {
  const row = inventory.find((i) => i.name === ing.name)
  if (!row) return false
  return row.quantity >= Math.max(1, Math.floor(ing.quantity))
}
