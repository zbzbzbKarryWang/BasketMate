"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Plus, Check, ShoppingCart, ChevronDown, ChevronUp, Upload, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RecipeDrawer } from "@/components/recipe-drawer"
import { ConfirmModal } from "@/components/confirm-modal"
import { useData } from "@/contexts/DataContext"
import type { Recipe, PendingItem, CustomItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface CompletedItem {
  ingredient_id: string | null
  ingredient_name: string
  need_quantity: number
  is_custom: boolean
  custom_id: string | null
}

export function ShoppingPage() {
  const {
    inventory,
    recalculateAndPersistPurchaseTask,
  } = useData()

  const [showRecipeDrawer, setShowRecipeDrawer] = useState(false)
  const [showAddItemDialog, setShowAddItemDialog] = useState(false)
  const [ephemeralName, setEphemeralName] = useState("")
  const [ephemeralQty, setEphemeralQty] = useState(1)
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set())
  
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [completedItems, setCompletedItems] = useState<CompletedItem[]>([])
  const [removedIngredientIds, setRemovedIngredientIds] = useState<string[]>([])
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCompleteSuccess, setShowCompleteSuccess] = useState(false)
  const [showCompleteError, setShowCompleteError] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearSuccess, setShowClearSuccess] = useState(false)
  const [showClearError, setShowClearError] = useState(false)
  const [showAddItemSuccess, setShowAddItemSuccess] = useState(false)
  const [showImportResult, setShowImportResult] = useState(false)
  const [importResult, setImportResult] = useState({ success: 0, failed: 0 })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCsvUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return
    }
    
    setUploading(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(line => line.trim())
      
      if (lines.length < 2) {
        return
      }
      
      let successCount = 0
      let errorCount = 0
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim())
        if (parts.length < 2) continue
        
        const name = parts[0]
        const quantity = parseFloat(parts[1])
        
        if (!name || isNaN(quantity)) {
          errorCount++
          continue
        }
        
        try {
          const response = await fetch('/api/proxy/ingredients', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })
          if (response.ok) {
            const inventoryData = await response.json()
            const existingItem = inventoryData.find((item: any) => 
              item.name.toLowerCase() === name.toLowerCase()
            )
            
            if (existingItem) {
              await fetch(`/api/proxy/ingredients/${existingItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  quantity: existingItem.quantity + quantity,
                  added_at: new Date().toISOString()
                })
              })
            } else {
              await fetch('/api/proxy/ingredients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, quantity })
              })
            }
            successCount++
          }
        } catch {
          errorCount++
        }
      }
      
      setImportResult({ success: successCount, failed: errorCount })
      setShowImportResult(true)
      
      await recalculateAndPersistPurchaseTask()
      await refreshTask()
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }, [recalculateAndPersistPurchaseTask])

  const refreshTask = useCallback(async () => {
    try {
      const response = await fetch('/api/shopping/task')
      if (response.ok) {
        const apiResponse = await response.json()
        if (apiResponse.success) {
          const data = apiResponse.data || {}
          setPendingItems(data.pending_items || [])
          setCustomItems(data.custom_items || [])
          setCompletedItems(data.completed_items || [])
          setRemovedIngredientIds(data.removed_ingredient_ids || [])
          
          const allItems = [...(data.pending_items || []), ...(data.custom_items || [])]
          const stores = new Set(allItems.map(item => item.shop_name || "待定"))
          setExpandedStores(stores)
        }
      }
    } catch (error) {
      console.error('Failed to fetch purchase task:', error)
    }
  }, [])

  useEffect(() => {
    refreshTask()
  }, [refreshTask])

  const handleToggleCheck = useCallback((ingredientId: string) => {
    setPendingItems(prev => prev.map(item => 
      item.ingredient_id === ingredientId 
        ? { ...item, checked: !item.checked }
        : item
    ))
    setCustomItems(prev => prev.map(item => 
      `custom-${item.id}` === ingredientId 
        ? { ...item, checked: !item.checked }
        : item
    ))
    setHasUnsavedChanges(true)
  }, [])

  const handleQuantityChange = useCallback((ingredientId: string, delta: number) => {
    setPendingItems(prev => prev.map(item => 
      item.ingredient_id === ingredientId
        ? { ...item, need_quantity: Math.max(0.1, item.need_quantity + delta) }
        : item
    ))
    setHasUnsavedChanges(true)
  }, [])

  const handleQuantityInput = useCallback((ingredientId: string, value: number) => {
    setPendingItems(prev => prev.map(item => 
      item.ingredient_id === ingredientId
        ? { ...item, need_quantity: Math.max(0.1, value) }
        : item
    ))
    setHasUnsavedChanges(true)
  }, [])

  const handleCustomQuantityChange = useCallback((customId: string, delta: number) => {
    setCustomItems(prev => prev.map(item => 
      item.id === customId
        ? { ...item, need_quantity: Math.max(0.1, item.need_quantity + delta) }
        : item
    ))
    setHasUnsavedChanges(true)
  }, [])

  const handleCustomQuantityInput = useCallback((customId: string, value: number) => {
    setCustomItems(prev => prev.map(item => 
      item.id === customId
        ? { ...item, need_quantity: Math.max(0.1, value) }
        : item
    ))
    setHasUnsavedChanges(true)
  }, [])

  const handleDelete = useCallback(async (ingredientId: string) => {
    setSaving(true)
    try {
      const response = await fetch('/api/shopping/task/delete-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredient_id: ingredientId })
      })
      if (response.ok) {
        const apiResponse = await response.json()
        if (apiResponse.success) {
          const data = apiResponse.data || {}
          setPendingItems(data.pending_items || [])
          setCustomItems(data.custom_items || [])
          setCompletedItems(data.completed_items || [])
          setRemovedIngredientIds(data.removed_ingredient_ids || [])
        }
      }
    } catch (error) {
      console.error('Failed to delete item:', error)
    } finally {
      setSaving(false)
    }
  }, [])

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      const allItems = [...pendingItems, ...customItems]
      const checkedItems = allItems.filter(item => item.checked)
      
      const payload = checkedItems.map(item => {
        const isCustom = 'custom-' === item.ingredient_id.substring(0, 7)
        return {
          ingredient_id: isCustom ? null : item.ingredient_id,
          ingredient_name: isCustom ? item.name : (item as PendingItem).ingredient_name,
          need_quantity: item.need_quantity,
          is_custom: isCustom,
          custom_id: isCustom ? item.ingredient_id.replace("custom-", "") : null
        }
      })
      
      const response = await fetch('/api/shopping/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked_items: payload })
      })
      
      if (response.ok) {
        const apiResponse = await response.json()
        if (apiResponse.success) {
          const data = apiResponse.data || {}
          setPendingItems(data.pending_items || [])
          setCustomItems(data.custom_items || [])
          setCompletedItems(data.completed_items || [])
          setRemovedIngredientIds(data.removed_ingredient_ids || [])
          setHasUnsavedChanges(false)
          setShowCompleteSuccess(true)
        } else {
          setShowCompleteError(true)
        }
      } else {
        setShowCompleteError(true)
      }
    } catch (error) {
      console.error('Failed to complete purchase:', error)
      setShowCompleteError(true)
    } finally {
      setSaving(false)
    }
  }, [pendingItems, customItems])

  const handleClear = useCallback(async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/shopping/task/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const apiResponse = await response.json()
        if (apiResponse.success) {
          const data = apiResponse.data || {}
          setPendingItems(data.pending_items || [])
          setCustomItems(data.custom_items || [])
          setCompletedItems(data.completed_items || [])
          setRemovedIngredientIds(data.removed_ingredient_ids || [])
          setShowClearSuccess(true)
        } else {
          setShowClearError(true)
        }
      } else {
        setShowClearError(true)
      }
    } catch (error) {
      console.error('Failed to clear task:', error)
      setShowClearError(true)
    } finally {
      setSaving(false)
      setShowClearConfirm(false)
    }
  }, [])

  const handleAddCustomItem = useCallback(() => {
    if (!ephemeralName.trim()) return
    
    const newItem: CustomItem = {
      id: `custom-${Date.now()}`,
      name: ephemeralName.trim(),
      shop_name: "待定",
      need_quantity: ephemeralQty,
      checked: false
    }
    
    setCustomItems(prev => [...prev, newItem])
    setEphemeralName("")
    setEphemeralQty(1)
    setShowAddItemDialog(false)
    setShowAddItemSuccess(true)
  }, [ephemeralName, ephemeralQty])

  const handleAddFromRecipe = useCallback(async (recipe: Recipe) => {
    try {
      for (const ing of recipe.ingredients) {
        const existingIng = inventory.find(i => i.id === ing.ingredient_id)
        if (existingIng && existingIng.quantity <= 0) {
          await fetch('/api/shopping/task/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ingredient_id: ing.ingredient_id })
          })
        }
      }
      await refreshTask()
    } catch (error) {
      console.error('Failed to add from recipe:', error)
    }
    setShowRecipeDrawer(false)
  }, [inventory, refreshTask])

  const visibleItems = [...pendingItems, ...customItems]
  const checkedCount = visibleItems.filter(item => item.checked).length
  const listEmpty = visibleItems.length === 0

  // 判断是否显示"今日无采购任务"
  const showEmptyState = listEmpty && completedItems.length === 0 && removedIngredientIds.length === 0

  const groupedByStore: Record<string, (PendingItem | CustomItem)[]> = {}
  visibleItems.forEach(item => {
    const store = item.shop_name || "待定"
    if (!groupedByStore[store]) {
      groupedByStore[store] = []
    }
    groupedByStore[store].push(item)
  })

  return (
    <div className="flex flex-col h-full">
      {(saving || uploading) && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground mt-3">处理中...</p>
          </div>
        </div>
      )}

      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4 gap-2">
          <h1 className="text-lg font-semibold shrink-0">采购清单</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowRecipeDrawer(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-32">
        {listEmpty && completedItems.length === 0 && removedIngredientIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <ShoppingCart className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium mb-2">今日无采购任务</h2>
            <p className="text-sm text-muted-foreground mb-4">添加菜谱到今日计划，系统会自动生成采购清单</p>
            <Button onClick={() => setShowRecipeDrawer(true)}>
              <Plus className="w-4 h-4 mr-2" />
              添加菜谱
            </Button>
          </div>
        ) : (
          <>
            {Object.entries(groupedByStore).map(([store, items]) => {
              const storeItemsCount = items.length
              const isExpanded = expandedStores.has(store)

              if (storeItemsCount === 0) return null

              const toggleExpand = () => {
                setExpandedStores(prev => {
                  const newSet = new Set(prev)
                  if (isExpanded) {
                    newSet.delete(store)
                  } else {
                    newSet.add(store)
                  }
                  return newSet
                })
              }

              return (
                <Card key={store} className="shadow-sm mb-3">
                  <CardHeader className="pb-2 cursor-pointer" onClick={toggleExpand}>
                    <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
                      <span>{store}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{storeItemsCount}项</span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      <div className="space-y-2">
                        {items.map((item) => {
                          const isCustom = 'custom-' === item.ingredient_id.substring(0, 7)
                          const displayName = isCustom ? item.name : (item as PendingItem).ingredient_name
                          const currentQty = item.need_quantity

                          return (
                            <div
                              key={item.ingredient_id}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                                item.checked ? "bg-muted/30" : "bg-muted"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleCheck(item.ingredient_id)}
                                className={cn(
                                  "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                                  item.checked
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground"
                                )}
                              >
                                {item.checked && (
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                )}
                              </button>

                              <div
                                className={cn(
                                  "flex-1 text-sm min-w-0",
                                  item.checked && "line-through text-muted-foreground"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{displayName}</span>
                                  {isCustom && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0">
                                      临时
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="text-xs text-muted-foreground w-14 text-center shrink-0">
                                {(item as PendingItem).price > 0 ? `¥${(item as PendingItem).price}` : "-"}
                              </div>

                              <div className="flex items-center gap-0.5 shrink-0 tabular-nums">
                                <button
                                  type="button"
                                  onClick={() => isCustom
                                    ? handleCustomQuantityChange(item.ingredient_id.replace("custom-", ""), -1)
                                    : handleQuantityChange(item.ingredient_id, -1)
                                  }
                                  className="text-sm text-muted-foreground hover:text-foreground px-1 py-1 min-w-[1.5rem]"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  value={currentQty}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value)
                                    if (isCustom) {
                                      handleCustomQuantityInput(item.ingredient_id.replace("custom-", ""), value)
                                    } else {
                                      handleQuantityInput(item.ingredient_id, value)
                                    }
                                  }}
                                  step="0.1"
                                  min="0"
                                  className="w-14 text-center text-sm border border-border rounded px-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => isCustom
                                    ? handleCustomQuantityChange(item.ingredient_id.replace("custom-", ""), 1)
                                    : handleQuantityChange(item.ingredient_id, 1)
                                  }
                                  className="text-sm text-muted-foreground hover:text-foreground px-1 py-1 min-w-[1.5rem]"
                                >
                                  +
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDelete(item.ingredient_id)}
                                className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="删除此项"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}

            {removedIngredientIds.length > 0 && (
              <Card className="shadow-sm border-red-100 py-3 mt-3">
                <CardHeader className="pb-1 pt-0">
                  <CardTitle className="text-sm font-medium text-red-600 flex items-center gap-2">
                    <X className="w-4 h-4" />
                    已加入黑名单 ({removedIngredientIds.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {removedIngredientIds.map((id) => {
                      const invItem = inventory.find(i => i.id === id)
                      const name = invItem?.name || (id.startsWith("custom-") ? `临时物品(${id})` : id)
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-50 text-red-600 line-through"
                        >
                          {name}
                        </span>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {completedItems.length > 0 && (
              <Card className="shadow-sm border-green-100 py-3 mt-3">
                <CardHeader className="pb-1 pt-0">
                  <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    本次已采购 ({completedItems.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {completedItems.map((item) => (
                      <span
                        key={item.is_custom ? item.custom_id : item.ingredient_id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 text-green-600"
                      >
                        {item.ingredient_name}
                        <span className="text-[10px] opacity-70">×{item.need_quantity}</span>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      {!listEmpty && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-background to-transparent pt-8">
          <div className="max-w-md mx-auto">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setShowClearConfirm(true)}
                disabled={saving}
              >
                清空剩余项
              </Button>
              <LoadingButton
                className="flex-1 gap-2"
                size="lg"
                onClick={() => void handleComplete()}
                disabled={checkedCount === 0}
                isLoading={saving}
                loadingText="处理中..."
              >
                <Check className="w-4 h-4" />
                采购完成 ({checkedCount}/{visibleItems.length})
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      <RecipeDrawer
        isOpen={showRecipeDrawer}
        onClose={() => setShowRecipeDrawer(false)}
        onConfirm={handleAddFromRecipe}
        initialSelected={[]}
      />

      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>加物品</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            仅作为本次采购备忘，不会新建库存食材，也不会在采购完成后计入库存。
          </p>
          <div className="space-y-2">
            <Input
              value={ephemeralName}
              onChange={(e) => setEphemeralName(e.target.value)}
              placeholder="物品名称"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">数量</span>
              <input
                type="number"
                value={ephemeralQty}
                onChange={(e) => setEphemeralQty(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                className="w-20 text-center text-sm border border-border rounded px-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>
              取消
            </Button>
            <Button onClick={handleAddCustomItem} disabled={!ephemeralName.trim()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCompleteSuccess} onOpenChange={setShowCompleteSuccess}>
        <DialogContent className="sm:max-w-sm">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">采购完成</h3>
            <p className="text-sm text-muted-foreground">已更新库存</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCompleteSuccess(false)} className="w-full">
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCompleteError} onOpenChange={setShowCompleteError}>
        <DialogContent className="sm:max-w-sm">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">操作失败</h3>
            <p className="text-sm text-muted-foreground">请稍后重试</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCompleteError(false)} className="w-full">
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="确认清空"
        description="确定要清空所有待购项吗？清空后这些项将被加入黑名单，不会重新出现。"
        onConfirm={handleClear}
        confirmText="清空"
        cancelText="取消"
      />

      <Dialog open={showClearSuccess} onOpenChange={setShowClearSuccess}>
        <DialogContent className="sm:max-w-sm">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">清空完成</h3>
            <p className="text-sm text-muted-foreground">所有待购项已加入黑名单</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowClearSuccess(false)} className="w-full">
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearError} onOpenChange={setShowClearError}>
        <DialogContent className="sm:max-w-sm">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">操作失败</h3>
            <p className="text-sm text-muted-foreground">请稍后重试</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowClearError(false)} className="w-full">
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddItemSuccess} onOpenChange={setShowAddItemSuccess}>
        <DialogContent className="sm:max-w-sm">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">添加成功</h3>
            <p className="text-sm text-muted-foreground">已添加到采购清单</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowAddItemSuccess(false)} className="w-full">
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportResult} onOpenChange={setShowImportResult}>
        <DialogContent className="sm:max-w-sm">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">导入完成</h3>
            <p className="text-sm text-muted-foreground">
              成功: {importResult.success} 条，失败: {importResult.failed} 条
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowImportResult(false)} className="w-full">
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {hasUnsavedChanges && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg">
          有未保存的更改
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 h-20 bg-background border-t flex items-center justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void recalculateAndPersistPurchaseTask()
            void refreshTask()
          }}
          className="mb-4"
        >
          刷新采购清单
        </Button>
      </div>
    </div>
  )
}
