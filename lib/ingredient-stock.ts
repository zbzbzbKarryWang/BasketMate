export function ingredientStockOk(
  inventory: { name: string; quantity: number; alias?: string }[],
  ing: { name: string; quantity: number }
): boolean {
  const row = inventory.find((i) => {
    if (i.name === ing.name) return true
    if (i.alias) {
      const aliases = i.alias.split(/[、,，]/).filter(a => a.trim())
      return aliases.includes(ing.name)
    }
    return false
  })
  if (!row) return false
  return row.quantity >= Math.max(1, Math.floor(ing.quantity))
}
