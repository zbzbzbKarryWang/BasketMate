"use client"

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { Recipe } from '@/lib/types'
import {
  RECIPE_CATEGORIES,
  normalizeRecipeCategory,
  getCategoryLabel,
} from '@/lib/recipe-categories'

export type RecipeFormIngredient = {
  name: string
  quantity: number
}

export type RecipeFormValues = {
  name: string
  category: string
  ingredients: RecipeFormIngredient[]
}

interface RecipeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'add' | 'edit'
  initialRecipe?: Recipe | null
  onSubmit: (values: RecipeFormValues) => void | Promise<void>
  isLoading?: boolean
}

const emptyIngredient = (): RecipeFormIngredient => ({
  name: '',
  quantity: 1,
})

export function RecipeFormDialog({
  open,
  onOpenChange,
  mode,
  initialRecipe,
  onSubmit,
  isLoading = false,
}: RecipeFormDialogProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('正餐')
  const [ingredients, setIngredients] = useState<RecipeFormIngredient[]>([
    emptyIngredient(),
  ])

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialRecipe) {
      setName(initialRecipe.name)
      setCategory(getCategoryLabel(initialRecipe.category))
      setIngredients(
        initialRecipe.ingredients.length
          ? initialRecipe.ingredients.map((i) => ({
              name: i.name,
              quantity: Math.max(1, Math.floor(i.quantity)),
            }))
          : [emptyIngredient()]
      )
    } else {
      setName('')
      setCategory('正餐')
      setIngredients([emptyIngredient()])
    }
  }, [open, mode, initialRecipe])

  const updateIng = (
    index: number,
    patch: Partial<RecipeFormIngredient>
  ) => {
    setIngredients((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }
  
  const handleQuantityChange = (index: number, delta: number) => {
    updateIng(index, {
      quantity: Math.max(0, ingredients[index].quantity + delta)
    })
  }
  
  const handleQuantityInput = (index: number, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0) {
      updateIng(index, { quantity: numValue })
    }
  }

  const addRow = () => setIngredients((prev) => [...prev, emptyIngredient()])

  const removeRow = (index: number) => {
    setIngredients((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)
    )
  }

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    const cleaned = ingredients
      .map((i) => ({
        ...i,
        name: i.name.trim(),
      }))
      .filter((i) => i.name.length > 0)
    if (!trimmedName || cleaned.length === 0) return
    await onSubmit({
      name: trimmedName,
      category: normalizeRecipeCategory(category),
      ingredients: cleaned.map((i) => ({
        ...i,
        quantity: Math.max(0, i.quantity),
      })),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? '添加新菜' : '修改菜谱'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">菜谱名称</label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：番茄炒蛋"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">分类</Label>
            <RadioGroup
              value={category}
              onValueChange={setCategory}
              className="flex flex-wrap gap-3"
            >
              {RECIPE_CATEGORIES.map((cat) => (
                <div key={cat} className="flex items-center gap-2">
                  <RadioGroupItem value={cat} id={`cat-${cat}`} />
                  <Label
                    htmlFor={`cat-${cat}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {cat}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">所需食材</span>
              <button
                type="button"
                className="text-xs text-primary hover:underline shrink-0"
                onClick={addRow}
              >
                加一行
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {ingredients.map((row, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap"
                >
                  <Input
                    className="flex-1 min-w-0 basis-[40%] sm:basis-auto"
                    value={row.name}
                    onChange={(e) => updateIng(index, { name: e.target.value })}
                    placeholder="食材名称"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground px-1.5 py-1 min-w-[1.75rem]"
                      onClick={() => handleQuantityChange(index, -1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={row.quantity}
                      onChange={(e) => handleQuantityInput(index, e.target.value)}
                      step="0.1"
                      min="0"
                      className="w-12 text-center text-sm border border-border rounded px-1"
                    />
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground px-1.5 py-1 min-w-[1.75rem]"
                      onClick={() => handleQuantityChange(index, 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive p-1 shrink-0"
                    aria-label="删除此行"
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              数量为整数，默认从 1 起算。若食材不在库存中，保存时会自动创建库存项（数量为 0）。
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            取消
          </Button>
          <LoadingButton onClick={() => void handleSubmit()} isLoading={isLoading} loadingText="保存中...">
            确认
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
