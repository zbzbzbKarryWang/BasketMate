"use client"

import { useState, useEffect, useMemo } from 'react'
import { X, Search, Plus, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
import { useData } from '@/contexts/DataContext'
import type { Recipe } from '@/lib/types'
import { cn } from '@/lib/utils'
import { getCategoryLabel } from '@/lib/recipe-categories'
import { ingredientStockOk } from '@/lib/ingredient-stock'

interface RecipeDrawerProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selected: Recipe[]) => void
  initialSelected?: Recipe[]
}

export function RecipeDrawer({
  isOpen,
  onClose,
  onConfirm,
  initialSelected = [],
}: RecipeDrawerProps) {
  const { recipes, inventory } = useData()
  const navigateToRecipeAdd = useAppStore((s) => s.navigateToRecipeAdd)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>(initialSelected.map((r) => r.id))

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setSelected(initialSelected.map((r) => r.id))
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, initialSelected])

  const filteredRecipes = useMemo(() => {
    const q = search.trim()
    return recipes.filter(
      (r) =>
        !q ||
        r.name.includes(q) ||
        r.category.includes(q) ||
        r.ingredients.some((i) => i.name.includes(q))
    )
  }, [recipes, search])

  const toggleRecipe = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleConfirm = () => {
    const selectedRecipes = recipes.filter((r) => selected.includes(r.id))
    onConfirm(selectedRecipes)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">选择菜谱</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索菜谱..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredRecipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => toggleRecipe(recipe.id)}
              className={cn(
                "w-full p-3 rounded-lg border text-left transition-all",
                selected.includes(recipe.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{recipe.name}</div>
                  <div className="text-xs mt-0.5">
                    {getCategoryLabel(recipe.category)} ·{' '}
                    {recipe.ingredients.map((i, index) => (
                      <span key={index} className={cn(
                        ingredientStockOk(inventory, i) 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      )}>
                        {i.name} {Math.max(1, Math.floor(i.quantity))}
                        {index < recipe.ingredients.length - 1 && '、'}
                      </span>
                    ))}
                  </div>
                </div>
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                    selected.includes(recipe.id)
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  )}
                >
                  {selected.includes(recipe.id) && (
                    <Check className="w-3 h-3 text-primary-foreground" />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-border space-y-2">
          <Button
            variant="outline"
            className="w-full gap-2"
            type="button"
            onClick={() => {
              navigateToRecipeAdd()
              onClose()
            }}
          >
            <Plus className="w-4 h-4" />
            添加新菜谱
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button onClick={handleConfirm} className="flex-1">
              加入计划 ({selected.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
