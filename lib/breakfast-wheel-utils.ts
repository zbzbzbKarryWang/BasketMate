import { breakfastOptions } from '@/lib/mock-data'
import type { BreakfastOption } from '@/lib/types'

export function computeWheelOptions(
  extras: BreakfastOption[],
  hiddenIds: string[]
): BreakfastOption[] {
  const hidden = new Set(hiddenIds)
  const base = breakfastOptions.filter((o) => !hidden.has(o.id))
  const extra = extras.filter((o) => !hidden.has(o.id))
  return [...base, ...extra]
}
