"use client"

import { useEffect, useMemo, useState } from 'react'
import { Plus, Calendar, ShoppingCart, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MealPlanner } from '@/components/meal-planner'
import { ConfirmModal } from '@/components/confirm-modal'
import { RecipeDrawer } from '@/components/recipe-drawer'
import { BreakfastPickerPanel } from '@/components/breakfast-picker-panel'
import { useAppStore } from '@/lib/store'
import { useData } from '@/contexts/DataContext'
import { apiPost } from '@/lib/api-client'
import {
  formatDate,
  getRelativeDay,
  getTodayString,
  getTomorrowString,
} from '@/lib/mock-data'
import type { MealPlan, Recipe, BreakfastOption, InventoryItem } from '@/lib/types'

function findInventoryItemByName(inventory: InventoryItem[], name: string): InventoryItem | undefined {
  const targetName = name.trim().toLowerCase()
  return inventory.find(item => {
    if (item.name.trim().toLowerCase() === targetName) return true
    if (item.alias) {
      const aliases = item.alias.split(/[、,，]/).filter(a => a.trim())
      return aliases.some(alias => alias.trim().toLowerCase() === targetName)
    }
    return false
  })
}
import { ingredientStockOk } from '@/lib/ingredient-stock'
import { getBreakfastEmojiById } from '@/lib/breakfast-emojis'

export function PlanPage() {
  const { mealPlans, inventory, recipes, activePurchaseTask, deletePlan, updatePlan, updateIngredient, recalculateAndPersistPurchaseTask, refresh } = useData()
  const { showNewPlan, setShowNewPlan } = useAppStore()

  const formatIngredientName = (name: string) => {
    const item = findInventoryItemByName(inventory, name)
    if (!item?.alias) return name
    const aliases = item.alias.split(/[、,，]/).filter(a => a.trim())
    if (aliases.length === 0) return name
    return `${name}（${aliases.join('、')}）`
  }

  const [showPlanner, setShowPlanner] = useState(false)
  const [plannerDate, setPlannerDate] = useState<string | undefined>()
  const [editingPlan, setEditingPlan] = useState<MealPlan | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false)
  const [showDeleteError, setShowDeleteError] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [showAllPlannedError, setShowAllPlannedError] = useState(false)
  const [completeConfirm, setCompleteConfirm] = useState<string | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)
  const [showCompleteSuccess, setShowCompleteSuccess] = useState(false)
  const [showCompleteError, setShowCompleteError] = useState(false)
  
  // 状态管理修改中的计划
  const [modifiedPlans, setModifiedPlans] = useState<Map<string, MealPlan>>(new Map())
  const [showBreakfastPicker, setShowBreakfastPicker] = useState<string | null>(null) // 计划ID
  const [showRecipePicker, setShowRecipePicker] = useState<string | null>(null) // 计划ID

  const todayStr = getTodayString()
  const todayMs = useMemo(
    () => new Date(todayStr + "T12:00:00").getTime(),
    [todayStr]
  )
  
  // 计算昨天的日期字符串（使用本地时间）
  const yesterdayStr = useMemo(() => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const year = yesterday.getFullYear()
    const month = String(yesterday.getMonth() + 1).padStart(2, '0')
    const day = String(yesterday.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])
  
  // 早餐食谱
  const breakfastRecipes = useMemo(() => {
    return recipes.filter(r => r.category === 'breakfast')
  }, [recipes])

  const sortedPlans = useMemo(() => {
    return [...mealPlans].sort((a, b) => {
      return new Date(a.date + "T12:00:00").getTime() - new Date(b.date + "T12:00:00").getTime()
    })
  }, [mealPlans])

  useEffect(() => {
    if (!showNewPlan) return
    setEditingPlan(null)
    setPlannerDate(getTomorrowString())
    setShowPlanner(true)
    setShowNewPlan(false)
  }, [showNewPlan, setShowNewPlan])

  const handleNewPlan = () => {
    // 检查近三天是否都已计划
    const today = new Date()
    const nextThreeDays = []
    for (let i = 0; i < 3; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      const dateString = date.toISOString().split('T')[0]
      nextThreeDays.push(dateString)
    }
    
    const allThreeDaysPlanned = nextThreeDays.every(date => {
      return mealPlans.some(plan => plan.date === date)
    })
    
    if (allThreeDaysPlanned) {
      setShowAllPlannedError(true)
      return
    }
    
    setEditingPlan(null)
    setPlannerDate(getTomorrowString())
    setShowPlanner(true)
  }

  const handleEditPlan = (plan: MealPlan) => {
    setEditingPlan(plan)
    setPlannerDate(plan.date)
    setShowPlanner(true)
  }

  const handleClosePlanner = () => {
    setShowPlanner(false)
    setEditingPlan(null)
  }

  const handleDeletePlan = async (planId: string) => {
    setIsDeleting(true)
    try {
      await Promise.all([
        deletePlan(planId),
        recalculateAndPersistPurchaseTask()
      ])
      setShowDeleteSuccess(true)
    } catch (error) {
      console.error('删除计划失败:', error)
      setShowDeleteError(true)
    } finally {
      setDeleteConfirm(null)
      setIsDeleting(false)
    }
  }
  
  // 计算已关联采购清单项数量
  const getShoppingItemsCount = (plan: MealPlan) => {
    if (!activePurchaseTask) return 0
    
    const pendingItems = (activePurchaseTask.pending_items || []).filter((item: any) => !item.checked)
    const pendingIngredientIds = new Set(pendingItems.map((item: any) => item.ingredient_id))
    
    const planIngredientIds = new Set<string>()
    
    if (plan.breakfast_recipe_id) {
      const breakfastRecipe = recipes.find(r => r.id === plan.breakfast_recipe_id)
      if (breakfastRecipe) {
        breakfastRecipe.ingredients.forEach(ing => {
          const invItem = findInventoryItemByName(inventory, ing.name)
          if (invItem) {
            planIngredientIds.add(invItem.id)
          }
        })
      }
    }
    plan.recipes.forEach(recipe => {
      recipe.ingredients.forEach(ing => {
        const invItem = findInventoryItemByName(inventory, ing.name)
        if (invItem) {
          planIngredientIds.add(invItem.id)
        }
      })
    })
    
    let count = 0
    planIngredientIds.forEach(id => {
      if (pendingIngredientIds.has(id)) {
        count++
      }
    })
    return count
  }
  
  // 处理修改早餐
  const handleModifyBreakfast = (planId: string) => {
    setShowBreakfastPicker(planId)
  }
  
  // 处理修改正餐
  const handleModifyRecipes = (planId: string) => {
    setShowRecipePicker(planId)
  }
  
  // 处理保存计划
  const handleSavePlan = async (planId: string) => {
    const modifiedPlan = modifiedPlans.get(planId)
    if (modifiedPlan) {
      await updatePlan(planId, modifiedPlan)
      await recalculateAndPersistPurchaseTask()
      setModifiedPlans(prev => {
        const newMap = new Map(prev)
        newMap.delete(planId)
        return newMap
      })
      setShowSaveSuccess(true)
    }
  }
  
  // 处理早餐选择
  const handleBreakfastSelected = (planId: string, breakfastId: string | null) => {
    setModifiedPlans(prev => {
      const newMap = new Map(prev)
      const plan = mealPlans.find(p => p.id === planId)
      if (plan) {
        newMap.set(planId, {
          ...plan,
          breakfast_recipe_id: breakfastId
        })
      }
      return newMap
    })
    setShowBreakfastPicker(null)
  }
  
  // 处理正餐选择
  const handleRecipesSelected = (planId: string, selectedRecipes: Recipe[]) => {
    setModifiedPlans(prev => {
      const newMap = new Map(prev)
      const plan = mealPlans.find(p => p.id === planId)
      if (plan) {
        newMap.set(planId, {
          ...plan,
          recipes: selectedRecipes
        })
      }
      return newMap
    })
    setShowRecipePicker(null)
  }
  
  // 处理完成计划
  const handleCompletePlan = async (planId: string) => {
    setIsCompleting(true)
    try {
      const plan = mealPlans.find(p => p.id === planId)
      if (!plan) {
        throw new Error('计划不存在')
      }
      
      // a. 获取该计划所需的所有食材及数量
      const ingredientNeeds = new Map<string, number>()
      
      // 处理早餐
      if (plan.breakfast_recipe_id) {
        const breakfastRecipe = recipes.find(r => r.id === plan.breakfast_recipe_id)
        if (breakfastRecipe) {
          breakfastRecipe.ingredients.forEach(ing => {
            const invItem = findInventoryItemByName(inventory, ing.name)
            if (invItem) {
              const currentNeed = ingredientNeeds.get(invItem.id) || 0
              ingredientNeeds.set(invItem.id, currentNeed + ing.quantity)
            }
          })
        }
      }
      
      // 处理正餐
      plan.recipes.forEach(recipe => {
        recipe.ingredients.forEach(ing => {
          const invItem = findInventoryItemByName(inventory, ing.name)
          if (invItem) {
            const currentNeed = ingredientNeeds.get(invItem.id) || 0
            ingredientNeeds.set(invItem.id, currentNeed + ing.quantity)
          }
        })
      })
      
      // b. 批量扣减库存
      const batchUpdates: { id: string; quantity: number }[] = []
      for (const [ingredientId, need] of ingredientNeeds) {
        const invItem = inventory.find(item => item.id === ingredientId)
        if (invItem) {
          const newQuantity = Math.max(0, invItem.quantity - need)
          batchUpdates.push({ id: ingredientId, quantity: newQuantity })
        }
      }
      if (batchUpdates.length > 0) {
        await apiPost('/ingredients/batch-update-quantity', batchUpdates)
      }
      
      // c. 更新采购清单（重新计算）
      await recalculateAndPersistPurchaseTask()
      
      // d. 删除计划
      await deletePlan(planId)
      
      // e. 刷新数据
      await refresh()
      
      setShowCompleteSuccess(true)
    } catch (error) {
      console.error('完成计划失败:', error)
      setShowCompleteError(true)
    } finally {
      setCompleteConfirm(null)
      setIsCompleting(false)
    }
  }

  if (showPlanner) {
    return (
      <MealPlanner
        key={editingPlan?.id ?? `new-${plannerDate ?? "plan"}`}
        targetDate={editingPlan?.date ?? plannerDate ?? getTodayString()}
        editingPlan={editingPlan}
        onBack={handleClosePlanner}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <h1 className="text-lg font-semibold">我的计划</h1>
          <Button size="sm" onClick={handleNewPlan} className="gap-1">
            <Plus className="w-4 h-4" />
            新建
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4 pb-16 space-y-3">
        {sortedPlans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Calendar className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">暂无计划</p>
            <Button variant="link" onClick={handleNewPlan} className="mt-2">
              创建第一个计划
            </Button>
          </div>
        ) : (
          sortedPlans.map((plan) => {
            const relativeDay = getRelativeDay(plan.date)
            const modifiedPlan = modifiedPlans.get(plan.id)
            const currentPlan = modifiedPlan || plan
            const isModified = !!modifiedPlan
            const shoppingItemsCount = getShoppingItemsCount(currentPlan)
            // 检查是否是今天之前的计划（不含今天）
            const isYesterdayOrToday = plan.date < todayStr

            return (
              <Card key={plan.id} className="shadow-sm relative">
                <CardContent className="px-3 pt-2 pb-3 sm:px-3.5 sm:pb-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-medium min-w-0 text-sm sm:text-base">
                      {formatDate(plan.date)}
                      {relativeDay && (
                        <span className="ml-2 text-sm text-primary">
                          {relativeDay}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditPlan(plan)}
                        className="text-xs h-7 px-2"
                      >
                        修改
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2 text-destructive border-destructive"
                        onClick={() => setDeleteConfirm(plan.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>

                  {currentPlan.breakfast_recipe_id && (
                    <div className="flex items-center py-2 border-b border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getBreakfastEmojiById(currentPlan.breakfast_recipe_id, breakfastRecipes)}</span>
                        <span className="text-sm">
                          早餐: {recipes.find(r => r.id === currentPlan.breakfast_recipe_id)?.name || '未知早餐'}
                        </span>
                      </div>
                    </div>
                  )}

                  {currentPlan.recipes.length > 0 && (
                    <div className="py-2 border-b border-border">
                      <div className="text-xs text-muted-foreground mb-2">
                        <span>正餐菜谱</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {currentPlan.recipes.map((recipe) => (
                          <div
                            key={recipe.id}
                            className="min-w-0 rounded-lg border border-border/80 bg-muted/30 p-2.5"
                          >
                            <div className="text-sm font-medium mb-1.5 truncate">
                              {recipe.name}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {recipe.ingredients.map((ing, idx) => {
                                const ok = ingredientStockOk(inventory, ing)
                                return (
                                  <span
                                    key={idx}
                                    className={
                                      ok
                                        ? "text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                                        : "text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                    }
                                  >
                                    {formatIngredientName(ing.name)}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    已关联采购清单项: {shoppingItemsCount}项
                  </div>
                </CardContent>
                
                {/* 完成计划按钮 */}
                {isYesterdayOrToday && (
                  <div className="absolute bottom-3 right-3">
                    <Button
                      size="sm"
                      className="text-xs h-7 px-2 bg-[#E6F4E9] hover:bg-[#E6F4E9]/90 text-green-700"
                      onClick={() => setCompleteConfirm(plan.id)}
                      disabled={isCompleting}
                    >
                      完成计划
                    </Button>
                  </div>
                )}
              </Card>
            )
          })
        )}
      </main>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="删除计划"
        message="确定要删除这个计划吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm) void handleDeletePlan(deleteConfirm)
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
      
      {/* 早餐选择器 */}
      {showBreakfastPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">修改早餐</h3>
              <button
                type="button"
                onClick={() => setShowBreakfastPicker(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <BreakfastPickerPanel
              selectedBreakfastId={modifiedPlans.get(showBreakfastPicker)?.breakfast_recipe_id || mealPlans.find(p => p.id === showBreakfastPicker)?.breakfast_recipe_id || null}
              onSelectedBreakfastIdChange={(id) => handleBreakfastSelected(showBreakfastPicker, id)}
              wheelExtras={[]}
              onWheelExtrasChange={() => {}}
              wheelHiddenIds={[]}
              onWheelHiddenIdsChange={() => {}}
              onBreakfastChosenFromWheel={(id) => handleBreakfastSelected(showBreakfastPicker, id)}
            />
          </div>
        </div>
      )}
      
      {/* 正餐选择器 */}
      <RecipeDrawer
        isOpen={!!showRecipePicker}
        onClose={() => setShowRecipePicker(null)}
        onConfirm={(recipes) => showRecipePicker && handleRecipesSelected(showRecipePicker, recipes)}
        initialSelected={modifiedPlans.get(showRecipePicker as string)?.recipes || mealPlans.find(p => p.id === showRecipePicker)?.recipes || []}
      />
      
      {/* 删除时的遮罩层 */}
      {isDeleting && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-white">删除中...</span>
          </div>
        </div>
      )}
      
      {/* 删除成功提示 */}
      <ConfirmModal
        isOpen={showDeleteSuccess}
        title="删除成功"
        message="计划已删除"
        onConfirm={() => setShowDeleteSuccess(false)}
        onCancel={() => setShowDeleteSuccess(false)}
        showCancelButton={false}
      />

      {/* 删除失败提示 */}
      <ConfirmModal
        isOpen={showDeleteError}
        title="删除失败"
        message="删除计划失败，请重试"
        onConfirm={() => setShowDeleteError(false)}
        onCancel={() => setShowDeleteError(false)}
        showCancelButton={false}
      />

      {/* 保存成功提示 */}
      <ConfirmModal
        isOpen={showSaveSuccess}
        title="保存成功"
        message="计划保存成功"
        onConfirm={() => setShowSaveSuccess(false)}
        onCancel={() => setShowSaveSuccess(false)}
        showCancelButton={false}
      />

      {/* 近三天已满提示 */}
      <ConfirmModal
        isOpen={showAllPlannedError}
        title="提示"
        message="近三天都已做好规划，请删除计划再新建"
        onConfirm={() => setShowAllPlannedError(false)}
        onCancel={() => setShowAllPlannedError(false)}
        showCancelButton={false}
      />
      
      {/* 完成计划确认框 */}
      <ConfirmModal
        isOpen={!!completeConfirm}
        title="完成计划"
        message="确定已完成该计划吗？系统将扣减对应食材库存，并从采购清单中移除相关需求。"
        confirmText="确定"
        cancelText="取消"
        onConfirm={() => {
          if (completeConfirm) void handleCompletePlan(completeConfirm)
        }}
        onCancel={() => setCompleteConfirm(null)}
      />
      
      {/* 完成计划时的遮罩层 */}
      {isCompleting && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-white">完成计划中...</span>
          </div>
        </div>
      )}
      
      {/* 完成计划成功提示 */}
      <ConfirmModal
        isOpen={showCompleteSuccess}
        title="完成成功"
        message="计划已完成，库存已更新"
        onConfirm={() => setShowCompleteSuccess(false)}
        onCancel={() => setShowCompleteSuccess(false)}
        showCancelButton={false}
      />
      
      {/* 完成计划失败提示 */}
      <ConfirmModal
        isOpen={showCompleteError}
        title="完成失败"
        message="操作失败，请重试"
        onConfirm={() => setShowCompleteError(false)}
        onCancel={() => setShowCompleteError(false)}
        showCancelButton={false}
      />
    </div>
  )
}
