"use client"

import { useMemo } from 'react'
import { useData } from '@/contexts/DataContext'
import { SpinWheel } from '@/components/SpinWheel'
import type { BreakfastOption } from '@/lib/types'
import { cn } from '@/lib/utils'

interface BreakfastPickerPanelProps {
  selectedBreakfastId: string | null
  onSelectedBreakfastIdChange: (id: string | null) => void
  wheelExtras: BreakfastOption[]
  onWheelExtrasChange: (extras: BreakfastOption[]) => void
  wheelHiddenIds: string[]
  onWheelHiddenIdsChange: (ids: string[]) => void
  onBreakfastChosenFromWheel: (id: string) => void
}

export function BreakfastPickerPanel({
  selectedBreakfastId,
  onSelectedBreakfastIdChange,
  wheelExtras,
  onWheelExtrasChange,
  wheelHiddenIds,
  onWheelHiddenIdsChange,
  onBreakfastChosenFromWheel,
}: BreakfastPickerPanelProps) {
  const { recipes } = useData()
  
  const breakfastRecipes = useMemo(() => {
    return recipes.filter(r => r.category === 'breakfast')
  }, [recipes])
  
  const wheelOptions = useMemo(() => {
    const recipeOptions = breakfastRecipes.map(recipe => ({
      id: recipe.id,
      name: recipe.name,
      emoji: '🍽️'
    }))
    const allOptions = [...recipeOptions, ...wheelExtras]
    return allOptions.filter(option => !wheelHiddenIds.includes(option.id))
  }, [breakfastRecipes, wheelExtras, wheelHiddenIds])

  const handleSpinEnd = (selected: { id: string; name: string; emoji?: string }) => {
    onBreakfastChosenFromWheel(selected.id)
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground mb-2">点选早餐</p>
        <div className="flex flex-wrap gap-2">
          {breakfastRecipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => onSelectedBreakfastIdChange(recipe.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                selectedBreakfastId === recipe.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted/40 hover:bg-muted"
              )}
            >
              🍽️ {recipe.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">转盘选取</p>
        <div className="flex justify-center">
          <SpinWheel
            items={wheelOptions}
            onSpinEnd={handleSpinEnd}
            size={300}
          />
        </div>
      </div>
    </div>
  )
}
