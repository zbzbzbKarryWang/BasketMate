"use client"

import { useState, useMemo } from 'react'
import { CalendarDays, ShoppingCart, Utensils, Package, FileText, FolderOpen, FileUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import { useData } from '@/contexts/DataContext'
import { formatDate, getTodayString, getTomorrowString, getDayAfterTomorrowString } from '@/lib/mock-data'
import { ingredientStockOk } from '@/lib/ingredient-stock'
import { ConfirmModal } from '@/components/confirm-modal'
import { getBreakfastEmojiById } from '@/lib/breakfast-emojis'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function HomePage() {
  const { mealPlans, inventory, recipes, activePurchaseTask, error, connectionStatus } = useData()
  const { setActiveTab, setShowNewPlan } = useAppStore()
  const router = useRouter()

  const [showImportModal, setShowImportModal] = useState(false)
  const [importInventory, setImportInventory] = useState(true)
  const [importPrice, setImportPrice] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  const formatIngredientName = (name: string) => {
    const item = inventory.find(i => {
      if (i.name.toLowerCase() === name.toLowerCase()) return true
      if (i.alias) {
        const aliases = i.alias.split(/[、,，]/).filter(a => a.trim())
        return aliases.some(alias => alias.toLowerCase() === name.toLowerCase())
      }
      return false
    })
    if (!item?.alias) return name
    const aliases = item.alias.split(/[、,，]/).filter(a => a.trim())
    if (aliases.length === 0) return name
    return `${name}（${aliases.join('、')}）`
  }

  const [showPlanFullError, setShowPlanFullError] = useState(false)
  const [showNoShoppingError, setShowNoShoppingError] = useState(false)
  const today = getTodayString()
  const tomorrow = getTomorrowString()
  const dayAfterTomorrow = getDayAfterTomorrowString()
  const todayPlan = mealPlans.find(p => p.date === today)
  
  // 早餐食谱
  const breakfastRecipes = useMemo(() => {
    return recipes.filter(r => r.category === 'breakfast')
  }, [recipes])
  
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
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-center h-14 px-4">
          <h1 className="text-lg font-semibold">
            {formatDate(today)}
          </h1>
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

      <main className="flex-1 overflow-y-auto px-6 py-4 pb-16">
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
                    <span className="text-2xl">{getBreakfastEmojiById(todayPlan.breakfast_recipe_id, breakfastRecipes)}</span>
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

        {/* 导入操作卡片 */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setShowImportModal(true)}
          >
            <CardContent className="flex items-center justify-center gap-2 p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <FileUp className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">导入小票</span>
            </CardContent>
          </Card>
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push('/imports')}
          >
            <CardContent className="flex items-center justify-center gap-2 p-3">
              <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                <FolderOpen className="w-4 h-4 text-secondary" />
              </div>
              <span className="text-sm font-medium">查看导入</span>
            </CardContent>
          </Card>
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push('/logs')}
          >
            <CardContent className="flex items-center justify-center gap-2 p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">查看日志</span>
            </CardContent>
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

      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>导入小票</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="importInventory" 
                checked={importInventory}
                onCheckedChange={(checked) => setImportInventory(checked as boolean)}
              />
              <Label htmlFor="importInventory">导入库存</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="importPrice" 
                checked={importPrice}
                onCheckedChange={(checked) => setImportPrice(checked as boolean)}
              />
              <Label htmlFor="importPrice">导入比价</Label>
            </div>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id="file-upload"
                onChange={(e) => {
                  if (e.target.files) {
                    setSelectedFiles(Array.from(e.target.files))
                  }
                }}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <FileUp className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  点击选择图片或拖拽到此处
                </p>
                {selectedFiles.length > 0 && (
                  <p className="text-sm text-primary mt-2">
                    已选择 {selectedFiles.length} 张图片
                  </p>
                )}
              </label>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              取消
            </Button>
            <Button onClick={() => {
              console.log('确认导入', { importInventory, importPrice, selectedFiles })
              setShowImportModal(false)
            }}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
