"use client"

import { useState, useMemo, useEffect } from 'react'
import { Check, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { BreakfastPickerPanel } from '@/components/breakfast-picker-panel'
import { RecipeDrawer } from '@/components/recipe-drawer'
import { ConfirmModal } from '@/components/confirm-modal'
import { useData } from '@/contexts/DataContext'
import { formatDate, getRelativeDay, getTodayString, getTomorrowString } from '@/lib/mock-data'
import type { Recipe, BreakfastOption, MealPlan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ingredientStockOk } from '@/lib/ingredient-stock'

interface MealPlannerProps {
  targetDate: string
  editingPlan?: MealPlan | null
  onBack?: () => void
}

export function MealPlanner({ targetDate, editingPlan, onBack }: MealPlannerProps) {
  const { recipes, inventory, mealPlans, addPlan, updatePlan, recalculateAndPersistPurchaseTask } = useData()

  const [selectedBreakfastId, setSelectedBreakfastId] = useState<string | null>(
    editingPlan?.breakfast_recipe_id || null
  )
  const [selectedRecipes, setSelectedRecipes] = useState<Recipe[]>(
    editingPlan?.recipes || []
  )
  const [showRecipeDrawer, setShowRecipeDrawer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showBreakfastConfirm, setShowBreakfastConfirm] = useState(false)
  const [pendingBreakfastId, setPendingBreakfastId] = useState<string | null>(null)
  const [wheelExtras, setWheelExtras] = useState<BreakfastOption[]>([])
  const [wheelHiddenIds, setWheelHiddenIds] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(targetDate)
  const [showDateError, setShowDateError] = useState(false)
  const [showAllPlannedError, setShowAllPlannedError] = useState(false)
  const [showEditSuccess, setShowEditSuccess] = useState(false)
  const [showEditError, setShowEditError] = useState(false)
  const [showAddSuccess, setShowAddSuccess] = useState(false)
  const [showAddError, setShowAddError] = useState(false)
  const [showDatePlannedError, setShowDatePlannedError] = useState(false)

  const relativeDay = getRelativeDay(selectedDate)

  // 自动选择最近的未规划日期
  useEffect(() => {
    if (!editingPlan) {
      const nextThreeDays = getNextThreeDays()
      const firstUnplannedDate = nextThreeDays.find(date => !isDatePlanned(date))
      if (firstUnplannedDate) {
        setSelectedDate(firstUnplannedDate)
      }
    }
  }, [mealPlans, editingPlan])

  // 生成从今天开始的三天日期
  const getNextThreeDays = () => {
    const dates = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 3; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateString = `${year}-${month}-${day}`
      dates.push(dateString)
    }
    return dates
  }

  // 检查日期是否已有计划
  const isDatePlanned = (date: string) => {
    return mealPlans.some(plan => plan.date === date)
  }

  // 检查近三天是否都已计划
  const allThreeDaysPlanned = () => {
    const nextThreeDays = getNextThreeDays()
    return nextThreeDays.every(date => isDatePlanned(date))
  }

  const handleBreakfastChosenFromWheel = (id: string) => {
    setPendingBreakfastId(id)
    setShowBreakfastConfirm(true)
  }

  const confirmBreakfast = () => {
    if (pendingBreakfastId) {
      setSelectedBreakfastId(pendingBreakfastId)
    }
    setShowBreakfastConfirm(false)
    setPendingBreakfastId(null)
  }

  const toggleRecommendedRecipe = (recipe: Recipe) => {
    setSelectedRecipes((prev) => {
      const exists = prev.some((r) => r.id === recipe.id)
      if (exists) {
        return prev.filter((r) => r.id !== recipe.id)
      } else {
        return [...prev, recipe]
      }
    })
  }

  const handleConfirmMeal = async () => {
    if (!selectedDate) {
      setShowDateError(true)
      return
    }

    if (!editingPlan && allThreeDaysPlanned()) {
      setShowAllPlannedError(true)
      return
    }

    if (isDatePlanned(selectedDate) && !editingPlan) {
      setShowDatePlannedError(true)
      return
    }

    if (!selectedBreakfastId || selectedRecipes.length === 0) {
      return
    }

    setSaving(true)
    try {
      if (editingPlan) {
        await updatePlan(editingPlan.id, {
          breakfast_recipe_id: selectedBreakfastId,
          recipes: selectedRecipes,
        })
        await recalculateAndPersistPurchaseTask()
        setShowEditSuccess(true)
      } else {
        await addPlan({
          date: selectedDate,
          breakfast_recipe_id: selectedBreakfastId,
          recipes: selectedRecipes,
        });
        await recalculateAndPersistPurchaseTask()
        setShowAddSuccess(true)
      }
    } catch (error) {
      console.error('Failed to save plan:', error)
      if (editingPlan) {
        setShowEditError(true)
      } else {
        setShowAddError(true)
      }
    } finally {
      setSaving(false)
    }
  }

  const recommendedRecipes = useMemo(() => {
    const scored = recipes
      .map((recipe) => {
        const matchingIngredients = recipe.ingredients.filter((ing) => {
          const inventoryItem = inventory.find(
            (item) => item.name.toLowerCase() === ing.name.toLowerCase()
          )
          return inventoryItem && inventoryItem.quantity > 0
        })

        const matchScore =
          recipe.ingredients.length > 0
            ? matchingIngredients.length / recipe.ingredients.length
            : 0

        return {
          recipe,
          matchScore,
        }
      })
      .filter((r) => r.matchScore > 0)
      .sort((a, b) => {
        return b.matchScore - a.matchScore
      })
      .slice(0, 6)

    const inList = new Set(scored.map((r) => r.recipe.id))
    const extraFromSelection = selectedRecipes
      .filter((sr) => !inList.has(sr.id))
      .map((recipe) => ({
        recipe,
        matchScore: 0,
      }))

    return [...scored, ...extraFromSelection]
  }, [recipes, inventory, selectedRecipes])

  return (
    <div className="flex flex-col min-h-screen pb-20 max-w-full overflow-x-hidden bg-background">
      {/* 等待状态遮罩层 */}
      {saving && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground mt-3">保存中...</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold">
            {editingPlan ? `${formatDate(selectedDate)}${relativeDay ? `（${relativeDay}）` : ''} 的计划` : "制定计划"}
          </h1>
          {onBack && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
            >
              返回
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-4 w-full max-w-full box-border">
        <div className="flex flex-col gap-4">
          {/* 日期选择卡片 */}
          <Card className="shadow-sm gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">选择日期</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex flex-wrap gap-2">
                {getNextThreeDays().map((date) => {
                  const isPlanned = isDatePlanned(date)
                  const isSelected = selectedDate === date
                  const dayName = getRelativeDay(date)
                  const isDisabled = isPlanned || !!editingPlan
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => !isDisabled && setSelectedDate(date)}
                      disabled={isDisabled}
                      className={cn(
                        "px-4 py-2 rounded-lg border transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : isDisabled
                          ? "border-muted-foreground bg-muted text-muted-foreground cursor-not-allowed"
                          : "border-border hover:border-primary hover:bg-primary/5"
                      )}
                    >
                      <div className="text-sm font-medium">{formatDate(date)}</div>
                      {dayName && (
                        <div className="text-xs text-muted-foreground">{dayName}</div>
                      )}
                    </button>
                  )
                })}
              </div>

            </CardContent>
          </Card>

          <Card className="shadow-sm gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">早餐选择</CardTitle>
              {selectedBreakfastId && (
                <div className="text-sm text-primary flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  已选择: {recipes.find((r) => r.id === selectedBreakfastId)?.name || '未知早餐'}
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-2">
              <BreakfastPickerPanel
                selectedBreakfastId={selectedBreakfastId}
                onSelectedBreakfastIdChange={setSelectedBreakfastId}
                wheelExtras={wheelExtras}
                onWheelExtrasChange={setWheelExtras}
                wheelHiddenIds={wheelHiddenIds}
                onWheelHiddenIdsChange={setWheelHiddenIds}
                onBreakfastChosenFromWheel={handleBreakfastChosenFromWheel}
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">正餐推荐</CardTitle>
              <p className="text-xs text-muted-foreground">根据库存推荐</p>
            </CardHeader>
            <CardContent>
              {recommendedRecipes.length > 0 ? (
                <div className="space-y-2">
                  {recommendedRecipes.map(({ recipe }) => {
                    const availableIngredients = recipe.ingredients.filter((ing) => {
                      const inventoryItem = inventory.find(
                        (item) => item.name.toLowerCase() === ing.name.toLowerCase()
                      )
                      return inventoryItem && inventoryItem.quantity > 0
                    }).length
                    const totalIngredients = recipe.ingredients.length

                    return (
                      <button
                        key={recipe.id}
                        type="button"
                        onClick={() => toggleRecommendedRecipe(recipe)}
                        className={cn(
                          "w-full p-3 rounded-lg bg-[#F9F9F9] shadow-sm text-left transition-all",
                          selectedRecipes.some((r) => r.id === recipe.id)
                            ? "bg-primary/5"
                            : "hover:bg-[#F0F0F0]"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm">{recipe.name}</div>
                            <div className="text-xs text-muted-foreground mt-1 truncate">
                              {recipe.ingredients.map((i) => i.name).join(" · ")}
                            </div>
                            <div className="text-xs text-green-600 mt-1">
                              已有 {availableIngredients}/{totalIngredients} 种食材
                            </div>
                          </div>
                          <div
                            className={cn(
                              "w-8 h-8 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ml-4",
                              selectedRecipes.some((r) => r.id === recipe.id)
                                ? "border-primary bg-primary"
                                : "border-muted-foreground"
                            )}
                          >
                            {selectedRecipes.some((r) => r.id === recipe.id) && (
                              <Check className="w-4 h-4 text-primary-foreground" />
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无推荐，请先补充库存
                </p>
              )}

              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowRecipeDrawer(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  手动加菜
                </Button>
                <LoadingButton
                  className="flex-1"
                  onClick={() => void handleConfirmMeal()}
                  disabled={!selectedBreakfastId || selectedRecipes.length === 0}
                  isLoading={saving}
                  loadingText="保存中..."
                >
                  {editingPlan ? "保存修改" : "确认计划"}
                </LoadingButton>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <ConfirmModal
        isOpen={showBreakfastConfirm}
        title="确认早餐"
        message={`早餐为：${
          pendingBreakfastId 
            ? recipes.find((r) => r.id === pendingBreakfastId)?.name || 
              wheelExtras.find((e) => e.id === pendingBreakfastId)?.name || 
              ""
            : ""
        }`}
        onConfirm={confirmBreakfast}
        onCancel={() => {
          setShowBreakfastConfirm(false)
          setPendingBreakfastId(null)
        }}
      />

      <ConfirmModal
        isOpen={showDateError}
        title="提示"
        message="没有选择日期"
        onConfirm={() => setShowDateError(false)}
        onCancel={() => setShowDateError(false)}
      />

      <ConfirmModal
        isOpen={showAllPlannedError}
        title="提示"
        message="近三天都已做好规划，请删除计划再新建"
        onConfirm={() => setShowAllPlannedError(false)}
        onCancel={() => setShowAllPlannedError(false)}
      />

      <ConfirmModal
        isOpen={showEditSuccess}
        title="修改成功"
        message="计划修改成功"
        onConfirm={() => {
          setShowEditSuccess(false)
          onBack?.()
        }}
        onCancel={() => {
          setShowEditSuccess(false)
          onBack?.()
        }}
      />

      <ConfirmModal
        isOpen={showEditError}
        title="修改失败"
        message="修改失败，请重试"
        onConfirm={() => setShowEditError(false)}
        onCancel={() => setShowEditError(false)}
      />

      <ConfirmModal
        isOpen={showAddSuccess}
        title="提示"
        message="计划创建成功"
        onConfirm={() => {
          setShowAddSuccess(false)
          onBack?.()
        }}
        onCancel={() => {
          setShowAddSuccess(false)
          onBack?.()
        }}
      />

      <ConfirmModal
        isOpen={showAddError}
        title="提示"
        message="创建失败，请重试"
        onConfirm={() => setShowAddError(false)}
        onCancel={() => setShowAddError(false)}
      />

      <ConfirmModal
        isOpen={showDatePlannedError}
        title="提示"
        message="该日期已有计划，请选择其他日期"
        onConfirm={() => setShowDatePlannedError(false)}
        onCancel={() => setShowDatePlannedError(false)}
        showCancelButton={false}
      />

      <RecipeDrawer
        isOpen={showRecipeDrawer}
        onClose={() => setShowRecipeDrawer(false)}
        onConfirm={setSelectedRecipes}
        initialSelected={selectedRecipes}
      />
    </div>
  )
}
