import { apiPost } from "./api-client"

export async function runGenerateShoppingList(
  fromDate?: string
): Promise<void> {
  const minDate = fromDate ?? new Date().toISOString().slice(0, 10)
  
  await apiPost('/shopping/task/refresh', {
    from_date: minDate
  })
}
