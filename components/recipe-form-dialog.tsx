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
import { ConfirmModal } from '@/components/confirm-modal'
import type { Recipe } from '@/lib/types'
import {
  RECIPE_CATEGORIES,
  normalizeRecipeCategory,
  getCategoryLabel,
} from '@/lib/recipe-categories'
import { useData } from '@/contexts/DataContext'

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
  const { recipes, inventory } = useData()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('正餐')
  const [ingredients, setIngredients] = useState<RecipeFormIngredient[]>([
    emptyIngredient(),
  ])
  // 菜谱名称建议相关状态
  const [showRecipeSuggestions, setShowRecipeSuggestions] = useState(false)
  const [recipeSuggestions, setRecipeSuggestions] = useState<string[]>([])
  // 食材名称建议相关状态
  const [ingredientSuggestions, setIngredientSuggestions] = useState<Map<number, string[]>>(new Map())
  const [showIngredientSuggestions, setShowIngredientSuggestions] = useState<Map<number, boolean>>(new Map())
  // 提示框状态
  const [showRecipeExistsError, setShowRecipeExistsError] = useState(false)

  useEffect(() => {
    if (!open) {
      // 重置所有建议状态
      setShowRecipeSuggestions(false)
      setRecipeSuggestions([])
      setIngredientSuggestions(new Map())
      setShowIngredientSuggestions(new Map())
      setShowRecipeExistsError(false)
      return
    }
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

  // 处理菜谱名称输入变化
  const handleRecipeNameChange = (value: string) => {
    setName(value)
    
    // 当输入为空时，隐藏建议
    if (!value.trim()) {
      setShowRecipeSuggestions(false)
      setRecipeSuggestions([])
      return
    }
    
    // 匹配包含输入文字的菜谱
    const suggestions = recipes
      .filter(recipe => recipe.name.toLowerCase().includes(value.toLowerCase()))
      .map(recipe => recipe.name)
    
    if (suggestions.length > 0) {
      setRecipeSuggestions(suggestions)
      setShowRecipeSuggestions(true)
    } else {
      setShowRecipeSuggestions(false)
      setRecipeSuggestions([])
    }
  }

  // 处理选择菜谱建议
  const handleSelectRecipeSuggestion = (suggestion: string) => {
    setName(suggestion)
    setShowRecipeSuggestions(false)
    // 选择建议后，检查菜谱是否已存在
    const existingRecipe = recipes.find(
      recipe => recipe.name.toLowerCase() === suggestion.toLowerCase()
    )
    if (existingRecipe) {
      setShowRecipeExistsError(true)
    }
  }

  // 处理食材名称输入变化
  const handleIngredientNameChange = (index: number, value: string) => {
    updateIng(index, { name: value })
    
    // 当输入为空时，隐藏建议
    if (!value.trim()) {
      setIngredientSuggestions(prev => {
        const newMap = new Map(prev)
        newMap.delete(index)
        return newMap
      })
      setShowIngredientSuggestions(prev => {
        const newMap = new Map(prev)
        newMap.set(index, false)
        return newMap
      })
      return
    }
    
    // 匹配包含输入文字的食材
    const suggestions = inventory
      .filter(item => item.name.toLowerCase().includes(value.toLowerCase()))
      .map(item => item.name)
    
    if (suggestions.length > 0) {
      setIngredientSuggestions(prev => {
        const newMap = new Map(prev)
        newMap.set(index, suggestions)
        return newMap
      })
      setShowIngredientSuggestions(prev => {
        const newMap = new Map(prev)
        newMap.set(index, true)
        return newMap
      })
    } else {
      setIngredientSuggestions(prev => {
        const newMap = new Map(prev)
        newMap.delete(index)
        return newMap
      })
      setShowIngredientSuggestions(prev => {
        const newMap = new Map(prev)
        newMap.set(index, false)
        return newMap
      })
    }
  }

  // 处理选择食材建议
  const handleSelectIngredientSuggestion = (index: number, suggestion: string) => {
    updateIng(index, { name: suggestion })
    setShowIngredientSuggestions(prev => {
      const newMap = new Map(prev)
      newMap.set(index, false)
      return newMap
    })
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{mode === 'add' ? '添加新菜' : '修改菜谱'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <label className="text-xs text-muted-foreground">菜谱名称</label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => handleRecipeNameChange(e.target.value)}
                placeholder="例如：番茄炒蛋"
              />
              {/* 菜谱建议下拉框 */}
              {showRecipeSuggestions && recipeSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg z-10 max-h-40 overflow-y-auto">
                  {recipeSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                      onClick={() => handleSelectRecipeSuggestion(suggestion)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
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
                    <div className="relative flex-1 min-w-0 basis-[40%] sm:basis-auto">
                      <Input
                        className="w-full"
                        value={row.name}
                        onChange={(e) => handleIngredientNameChange(index, e.target.value)}
                        placeholder="食材名称"
                      />
                      {/* 食材建议下拉框 */}
                      {showIngredientSuggestions.get(index) && ingredientSuggestions.get(index)?.length && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg z-10 max-h-40 overflow-y-auto">
                          {ingredientSuggestions.get(index)?.map((suggestion, i) => (
                            <div
                              key={i}
                              className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                              onClick={() => handleSelectIngredientSuggestion(index, suggestion)}
                            >
                              {suggestion}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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

      {/* 菜谱已存在提示框 */}
      <ConfirmModal
        isOpen={showRecipeExistsError}
        title="提示"
        message="菜谱已存在，无法添加"
        onConfirm={() => setShowRecipeExistsError(false)}
        onCancel={() => setShowRecipeExistsError(false)}
        showCancelButton={false}
      />
    </>
  )
}
