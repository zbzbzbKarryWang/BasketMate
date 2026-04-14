"use client"

import { useState } from 'react'
import { CalendarDays, ShoppingCart, Utensils, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import { useData } from '@/contexts/DataContext'
import { formatDate, getTodayString, getTomorrowString, getDayAfterTomorrowString } from '@/lib/mock-data'
import { ingredientStockOk } from '@/lib/ingredient-stock'
import { ConfirmModal } from '@/components/confirm-modal'

export function HomePage() {
  const { mealPlans, inventory, recipes, activePurchaseTask, error, connectionStatus } = useData()
  const { setActiveTab, setShowNewPlan } = useAppStore()
  const [showPlanFullError, setShowPlanFullError] = useState(false)
  const [showNoShoppingError, setShowNoShoppingError] = useState(false)
  const today = getTodayString()
  const tomorrow = getTomorrowString()
  const dayAfterTomorrow = getDayAfterTomorrowString()
  const todayPlan = mealPlans.find(p => p.date === today)
  
  // 计算是否有需购买项
  const hasShoppingItems = (activePurchaseTask?.pending_items?.length ?? 0) > 0 || (activePurchaseTask?.custom_items?.length ?? 0) > 0
  
  // 计算下一个无计划日期
  const getNextAvailableDate = () => {
    const planDates = new Set(mealPlans.map(p => p.date))
    
    if (!planDates.has(today)) return today
    if (!planDates.has(tomorrow)) return tomorrow
    if (!planDates.has(dayAfterTomorrow)) return dayAfterTomorrow
    return null
  }
  
  // 处理“吃什么”按钮点击
  const handleWhatsForDinner = () => {
    const nextDate = getNextAvailableDate()
    if (nextDate) {
      setActiveTab('plan')
      setShowNewPlan(true)
    } else {
      setShowPlanFullError(true)
    }
  }
  
  const handleGoShopping = () => {
    if (hasShoppingItems) {
      setActiveTab('shopping')
    } else {
      setShowNoShoppingError(true)
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* 顶部栏 */}
      <header className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10">
        <div className="flex items-center justify-center px-4 h-12">
          <div className="text-base font-semibold text-foreground">
            {formatDate(today)}
          </div>
        </div>
      </header>

      {connectionStatus === "error" && error && (
        <div
          className="mx-4 mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="status"
        >
          云端未连接：{error}
        </div>
      )}

      {/* 主内容区 */}
      <main className="flex-1 px-4 py-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              今日计划
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayPlan ? (
              <div className="space-y-4">
                {/* 早餐 */}
                {todayPlan.breakfast_recipe_id && (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <span className="text-2xl">🍽️</span>
                    <div>
                      <div className="text-xs text-muted-foreground">早餐</div>
                      <div className="font-medium">{recipes.find(r => r.id === todayPlan.breakfast_recipe_id)?.name || '未知早餐'}</div>
                    </div>
                  </div>
                )}
                
                {/* 正餐菜谱 */}
                {todayPlan.recipes.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Utensils className="w-3.5 h-3.5" />
                      正餐菜谱
                    </div>
                    <div className="space-y-2">
                      {todayPlan.recipes.map((recipe) => (
                        <div 
                          key={recipe.id}
                          className="p-3 bg-muted rounded-lg"
                        >
                          <div className="font-medium text-sm">{recipe.name}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
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
                                  {ing.name}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">今日无计划</p>
                <button 
                  type="button"
                  onClick={() => {
                    setActiveTab('plan')
                    setShowNewPlan(true)
                  }}
                  className="mt-3 text-sm text-primary hover:underline"
                >
                  制定计划
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 快捷操作卡片 */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setActiveTab('inventory')}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">查看库存</div>
                <div className="text-xs text-muted-foreground">管理食材</div>
              </div>
            </CardContent>
          </Card>
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow relative"
            onClick={handleGoShopping}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <div className="text-sm font-medium">采购清单</div>
                <div className="text-xs text-muted-foreground">去买菜</div>
              </div>
            </CardContent>
            {hasShoppingItems && (
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-destructive flex items-center justify-center text-xs text-white font-bold">
                •
              </div>
            )}
          </Card>
        </div>

        {/* 吃什么卡片 */}
        <Card 
          className="shadow-sm cursor-pointer hover:shadow-md transition-shadow mt-4"
          onClick={handleWhatsForDinner}
        >
          <CardContent className="flex items-center justify-center gap-2 p-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Utensils className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium">吃什么</span>
          </CardContent>
        </Card>
      </main>

      <ConfirmModal
        isOpen={showPlanFullError}
        title="提示"
        message="未来三天计划已满"
        onConfirm={() => setShowPlanFullError(false)}
        onCancel={() => setShowPlanFullError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showNoShoppingError}
        title="提示"
        message="今日无采购任务"
        onConfirm={() => setShowNoShoppingError(false)}
        onCancel={() => setShowNoShoppingError(false)}
        showCancelButton={false}
      />
    </div>
  )
}
