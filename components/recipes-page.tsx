"use client"

import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RecipeFormDialog, type RecipeFormValues } from '@/components/recipe-form-dialog'
import { ConfirmModal } from '@/components/confirm-modal'
import { useAppStore } from '@/lib/store'
import { useData } from '@/contexts/DataContext'
import type { Recipe } from '@/lib/types'
import { cn } from '@/lib/utils'
import { normalizeRecipeCategory, getCategoryLabel } from '@/lib/recipe-categories'

/** 菜谱卡片跳色用浅绿底 */
const RECIPE_ALT_BG = "#E1EEE1"

function stockSummary(need: number, invQty: number | undefined) {
  const stock = invQty ?? 0
  const ok = stock >= need
  return { text: `需要${need}个/库存${stock}个`, ok }
}

export function RecipesPage() {
  const activeTab = useAppStore((s) => s.activeTab)
  const pendingRecipeAdd = useAppStore((s) => s.pendingRecipeAdd)
  const setPendingRecipeAdd = useAppStore((s) => s.setPendingRecipeAdd)
  const {
    recipes,
    inventory,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    addIngredient,
    recalculateAndPersistPurchaseTask,
  } = useData()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showDeleteLoading, setShowDeleteLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showRecipeExistsError, setShowRecipeExistsError] = useState(false)
  const [showError, setShowError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (activeTab === 'recipes' && pendingRecipeAdd) {
      setFormMode('add')
      setEditingRecipe(null)
      setFormOpen(true)
      setPendingRecipeAdd(false)
    }
  }, [activeTab, pendingRecipeAdd, setPendingRecipeAdd])

  const invByName = useMemo(() => {
    const m = new Map<string, number>()
    inventory.forEach((i) => m.set(i.name, i.quantity))
    return m
  }, [inventory])

  const filteredRecipes = useMemo(() => {
    if (!searchQuery) return recipes
    const query = searchQuery.toLowerCase().trim()
    return recipes.filter(recipe => 
      recipe.name.toLowerCase().includes(query) ||
      recipe.ingredients.some(ing => ing.name.toLowerCase().includes(query))
    )
  }, [recipes, searchQuery])

  const ensureIngredientsExist = async (values: RecipeFormValues) => {
    const seen = new Set<string>()
    for (const ing of values.ingredients) {
      const key = ing.name.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      const exists = inventory.some((i) => i.name === key)
      if (!exists) {
        await addIngredient({ name: key, unit: '份', quantity: 0 })
      }
    }
  }

  const handleFormSubmit = async (values: RecipeFormValues) => {
    setIsSubmitting(true)
    try {
      const normalizedCategory = normalizeRecipeCategory(values.category)
      
      if (formMode === 'add') {
        // 检查菜谱名称是否已存在
        const existingRecipe = recipes.find(recipe => recipe.name === values.name)
        if (existingRecipe) {
          setShowRecipeExistsError(true)
          return
        }
        
        await addRecipe({
          name: values.name,
          category: normalizedCategory,
          ingredients: values.ingredients.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: '',
          })),
        })
      } else if (editingRecipe) {
        // 检查菜谱名称是否已被其他菜谱使用
        const existingRecipe = recipes.find(recipe => recipe.name === values.name && recipe.id !== editingRecipe.id)
        if (existingRecipe) {
          setShowRecipeExistsError(true)
          return
        }
        
        await updateRecipe(editingRecipe.id, {
          name: values.name,
          category: normalizedCategory,
          ingredients: values.ingredients.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: '',
          })),
        })
      }
      // 调用 recalculateAndPersistPurchaseTask() 刷新采购任务，因为菜谱的修改可能会影响计划需求
      await recalculateAndPersistPurchaseTask()
      setFormOpen(false)
      setShowSuccess(true)
    } catch (error) {
      console.error('保存菜谱失败:', error)
      setErrorMessage('保存失败，请重试')
      setShowError(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const openAdd = () => {
    setFormMode('add')
    setEditingRecipe(null)
    setFormOpen(true)
  }

  const openEdit = (r: Recipe) => {
    setFormMode('edit')
    setEditingRecipe(r)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <h1 className="text-lg font-semibold">菜谱</h1>
          <Button size="sm" className="gap-1 shrink-0" onClick={openAdd}>
            <Plus className="w-4 h-4" />
            添加新菜
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4">
        {/* 搜索框 */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索菜谱或食材..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-border shadow-sm"
            />
          </div>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm text-center">
            {searchQuery ? '没有找到匹配的菜谱' : '暂无菜谱，点击右上角添加新菜。'}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredRecipes.map((recipe, index) => {
              const isAlt = index % 2 === 1
              return (
                <Card
                  key={recipe.id}
                  className={cn(
                    "shadow-sm overflow-hidden border",
                    isAlt ? "border-[#c5d8c5]" : "border-border bg-card"
                  )}
                  style={isAlt ? { backgroundColor: RECIPE_ALT_BG } : undefined}
                >
                  <CardContent className="px-3 pt-1 pb-3 sm:px-3.5 sm:pb-3.5">
                    <div
                      className={cn(
                        "flex items-start justify-between gap-2 min-w-0 pb-2 border-b",
                        isAlt ? "border-[#1a2414]/12" : "border-border"
                      )}
                    >
                      <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <h3
                          className={cn(
                            "text-lg font-semibold leading-snug",
                            isAlt ? "text-[#1a2414]" : "text-foreground"
                          )}
                        >
                          {recipe.name}
                        </h3>
                        <span
                          className={cn(
                            "text-[10px] leading-none shrink-0 px-2 py-0.5 rounded-full",
                            recipe.category === 'breakfast' 
                              ? "bg-amber-100 text-amber-800"
                              : recipe.category === 'meal'
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-blue-100 text-blue-800"
                          )}
                        >
                          {getCategoryLabel(recipe.category)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-2.5 shrink-0 text-xs",
                          isAlt ? "text-[#2a3d26]/85" : "text-muted-foreground"
                        )}
                      >
                        <button
                          type="button"
                          className={cn(
                            "transition-colors",
                            isAlt
                              ? "hover:text-[#1a2414]"
                              : "hover:text-foreground"
                          )}
                          onClick={() => openEdit(recipe)}
                        >
                          修改
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "transition-colors",
                            isAlt
                              ? "hover:text-[#1a2414]"
                              : "hover:text-foreground"
                          )}
                          onClick={() => setDeleteId(recipe.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-2">
                      {recipe.ingredients.map((ing, idx) => {
                        const need = Math.max(1, Math.floor(ing.quantity))
                        const invQty = invByName.get(ing.name)
                        const { text, ok } = stockSummary(need, invQty)
                        return (
                          <div
                            key={idx}
                            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center text-sm"
                          >
                            <span
                              className={cn(
                                "truncate min-w-0 font-normal",
                                isAlt ? "text-[#1a2414]" : "text-foreground"
                              )}
                            >
                              {ing.name}
                            </span>
                            <span
                              className={cn(
                                "text-xs tabular-nums text-right whitespace-nowrap shrink-0",
                                ok
                                  ? isAlt
                                    ? "text-emerald-800"
                                    : "text-emerald-600 dark:text-emerald-400"
                                  : isAlt
                                    ? "text-red-700"
                                    : "text-destructive"
                              )}
                            >
                              {text}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* 回到顶部按钮 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-35 right-6 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="回到顶部"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>

      <RecipeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initialRecipe={editingRecipe}
        onSubmit={handleFormSubmit}
        isLoading={isSubmitting}
      />

      <ConfirmModal
        isOpen={!!deleteId}
        title="删除菜谱"
        message="确定删除该菜谱吗？相关计划中的引用也会被移除。"
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
        isLoading={showDeleteLoading}
        onConfirm={async () => {
          if (deleteId) {
            setShowDeleteLoading(true)
            try {
              await deleteRecipe(deleteId)
              // 调用 recalculateAndPersistPurchaseTask() 刷新采购任务，因为删除菜谱可能会影响计划需求
              await recalculateAndPersistPurchaseTask()
              setShowSuccess(true)
            } catch (error) {
              console.error('删除菜谱失败:', error)
              setErrorMessage('删除失败，请重试')
              setShowError(true)
            } finally {
              setShowDeleteLoading(false)
            }
          }
          setDeleteId(null)
        }}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmModal
        isOpen={showSuccess}
        title="提示"
        message="保存成功"
        onConfirm={() => setShowSuccess(false)}
        onCancel={() => setShowSuccess(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showRecipeExistsError}
        title="提示"
        message="菜谱已存在，无法添加"
        onConfirm={() => setShowRecipeExistsError(false)}
        onCancel={() => setShowRecipeExistsError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showError}
        title="提示"
        message={errorMessage}
        onConfirm={() => setShowError(false)}
        onCancel={() => setShowError(false)}
        showCancelButton={false}
      />
    </div>
  )
}
