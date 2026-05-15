import { apiGet, apiPost, apiPut } from "./api-client"
import type { PendingItem } from "./types"

export async function computePendingItemsFromDB(
  blacklist: string[]
): Promise<PendingItem[]> {
  const result = await apiPost<{ pending_items: PendingItem[] }>('/shopping/task/refresh', {
    locally_removed_ids: blacklist
  })
  return result.pending_items || []
}

export async function computePendingItems(
  blacklist: string[],
  mealPlans: any[],
  inventory: any[],
  priceList: any[],
  shops: any[]
): Promise<PendingItem[]> {
  return computePendingItemsFromDB(blacklist)
}

export async function upsertActiveTask(
  newPendingItems: PendingItem[],
  newCustomItems?: any[],
  additionalRemovedIds?: string[]
) {
  await apiPost('/shopping/task/refresh', {
    pending_items: newPendingItems,
    custom_items: newCustomItems || [],
    locally_removed_ids: additionalRemovedIds || []
  })
}

export async function getActivePurchaseTask() {
  try {
    const data = await apiGet<any>("/shopping/task")
    return data || null
  } catch (e) {
    return null
  }
}
