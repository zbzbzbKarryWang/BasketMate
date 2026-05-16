"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Plus, Check, ShoppingCart, ChevronDown, ChevronUp, Upload } from "lucide-react"
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

export function ShoppingPage() {
  const {
    activePurchaseTask,
    mealPlans,
    inventory,
    priceList,
    shops,
    recalculateAndPersistPurchaseTask,
    addToPurchaseTask,
    completePurchase,
    clearPurchaseTask,
    addIngredient,
    updateIngredient,
  } = useData()

  const [showRecipeDrawer, setShowRecipeDrawer] = useState(false)
  const [showAddItemDialog, setShowAddItemDialog] = useState(false)
  const [ephemeralName, setEphemeralName] = useState("")
  const [ephemeralQty, setEphemeralQty] = useState(1)
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set())
  
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [locallyRemovedIds, setLocallyRemovedIds] = useState<Set<string>>(new Set())
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
          const existingItem = inventory.find(item => 
            item.name.toLowerCase() === name.toLowerCase()
          )
          
          if (existingItem) {
            await updateIngredient(existingItem.id, existingItem.quantity + quantity, { addedAt: new Date() })
          } else {
            await addIngredient({ name, quantity })
          }
          successCount++
        } catch {
          errorCount++
        }
      }
      
      setImportResult({ success: successCount, failed: errorCount })
      setShowImportResult(true)
    } catch (err) {
      console.error('CSV upload error:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [inventory, addIngredient, updateIngredient])

  useEffect(() => {
    if (activePurchaseTask) {
      setPendingItems(activePurchaseTask.pending_items || [])
      setCustomItems(activePurchaseTask.custom_items || [])
      setLocallyRemovedIds(new Set())
      setHasUnsavedChanges(false)
    } else {
      setPendingItems([])
      setCustomItems([])
      setLocallyRemovedIds(new Set())
      setHasUnsavedChanges(false)
    }
  }, [activePurchaseTask])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    const storeSet = new Set<string>()
    pendingItems.forEach(item => {
      storeSet.add(item.shop_name || "待定")
    })
    customItems.forEach(item => {
      storeSet.add(item.shop_name || "待定")
    })
    setExpandedStores(storeSet)
  }, [pendingItems, customItems])

  const noPurchasePlan = !activePurchaseTask || 
    (pendingItems.length === 0 && customItems.length === 0)

  const allItems = [...pendingItems, ...customItems.map(item => ({
    ...item,
    ingredient_id: `custom-${item.id}`,
    shop_id: null,
    price: 0,
    unit: "",
    checked: item.checked
  }))]
  const visibleItems = allItems.filter(item => !locallyRemovedIds.has(item.ingredient_id))
  const checkedCount = visibleItems.filter(item => item.checked).length
  const listEmpty = visibleItems.length === 0
  const removedItems = allItems.filter(item => locallyRemovedIds.has(item.ingredient_id))
  const checkedItems = visibleItems.filter(item => item.checked)

  const groupedByStore = visibleItems.reduce(
    (acc, item) => {
      const store = item.shop_name || "待定"
      if (!acc[store]) acc[store] = []
      acc[store].push(item)
      return acc
    },
    {} as Record<string, PendingItem[]>
  )

  const handleQuantityChange = (ingredientId: string, delta: number) => {
    setPendingItems(prev => prev.map(item => {
      if (item.ingredient_id === ingredientId) {
        return {
          ...item,
          need_quantity: Math.max(1, item.need_quantity + delta)
        }
      }
      return item
    }))
    setHasUnsavedChanges(true)
  }

  const handleQuantityInput = (ingredientId: string, value: number) => {
    if (!isNaN(value) && value >= 0) {
      setPendingItems(prev => prev.map(item => {
        if (item.ingredient_id === ingredientId) {
          return {
            ...item,
            need_quantity: value
          }
        }
        return item
      }))
      setHasUnsavedChanges(true)
    }
  }

  const handleCustomQuantityChange = (id: string, delta: number) => {
    setCustomItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          need_quantity: Math.max(1, item.need_quantity + delta)
        }
      }
      return item
    }))
    setHasUnsavedChanges(true)
  }

  const handleCustomQuantityInput = (id: string, value: number) => {
    if (!isNaN(value) && value >= 0) {
      setCustomItems(prev => prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            need_quantity: value
          }
        }
        return item
      }))
      setHasUnsavedChanges(true)
    }
  }

  const handleToggleCheck = (ingredientId: string) => {
    if (ingredientId.startsWith("custom-")) {
      const customId = ingredientId.replace("custom-", "")
      setCustomItems(prev => prev.map(item => {
        if (item.id === customId) {
          return { ...item, checked: !item.checked }
        }
        return item
      }))
    } else {
      setPendingItems(prev => prev.map(item => {
        if (item.ingredient_id === ingredientId) {
          return { ...item, checked: !item.checked }
        }
        return item
      }))
    }
    setHasUnsavedChanges(true)
  }

  const handleDelete = (ingredientId: string) => {
    setLocallyRemovedIds(prev => new Set([...prev, ingredientId]))
    setHasUnsavedChanges(true)
  }

  const handleAddFromRecipe = async (recipes: Recipe[]) => {
    await recalculateAndPersistPurchaseTask(Array.from(locallyRemovedIds))
    setLocallyRemovedIds(new Set())
    setHasUnsavedChanges(false)
    setShowRecipeDrawer(false)
  }

  const confirmEphemeralAdd = () => {
    const name = ephemeralName.trim()
    if (!name) return
    const qty = Math.max(1, Math.floor(ephemeralQty))
    
    const newItem: CustomItem = {
      id: `temp-${Date.now()}`,
      name,
      shop_name: "待定",
      need_quantity: qty,
      checked: false
    }
    
    setCustomItems(prev => [...prev, newItem])
    setHasUnsavedChanges(true)
    setShowAddItemDialog(false)
    setEphemeralName("")
    setEphemeralQty(1)
    setShowAddItemSuccess(true)
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      await completePurchase(
        pendingItems,
        customItems,
        Array.from(locallyRemovedIds)
      )
      setShowCompleteSuccess(true)
    } catch (error) {
      console.error('Failed to complete shopping:', error)
      setShowCompleteError(true)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      await clearPurchaseTask(pendingItems, customItems)
      setPendingItems([])
      setCustomItems([])
      setLocallyRemovedIds(new Set())
      setHasUnsavedChanges(false)
      setShowClearConfirm(false)
      setShowClearSuccess(true)
    } catch (error) {
      console.error('Failed to clear shopping:', error)
      setShowClearError(true)
    } finally {
      setSaving(false)
    }
  }



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
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1 px-2"
            >
              <Upload className="w-4 h-4" />
              {uploading ? '导入中' : '导入'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEphemeralName("")
                setEphemeralQty(1)
                setShowAddItemDialog(true)
              }}
              className="gap-1 px-2"
            >
              <Plus className="w-4 h-4" />
              物品
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRecipeDrawer(true)}
              className="gap-1 px-2"
            >
              <Plus className="w-4 h-4" />
              菜
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4 pb-48 space-y-4">
        {listEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ShoppingCart className="w-12 h-12 mb-3 opacity-50" />
            {noPurchasePlan ? (
              <>
                <p className="text-sm font-medium text-foreground">今日无采购任务</p>
                <p className="text-xs mt-1 text-center px-4">
                  今日没有需要采购的食材。仍可通过「加菜」「加物品」自行备忘。
                </p>
              </>
            ) : (
              <>
                <p className="text-sm">采购清单为空</p>
                <Button
                  variant="link"
                  onClick={() => setShowRecipeDrawer(true)}
                  className="mt-2"
                >
                  从菜谱添加食材
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {removedItems.length > 0 && (
              <Card className="shadow-sm border-red-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-red-600">
                    已加入黑名单 ({removedItems.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {removedItems.map((item) => {
                      const isCustom = item.ingredient_id.startsWith("custom-")
                      return (
                        <span
                          key={item.ingredient_id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-50 text-red-600 line-through"
                        >
                          {isCustom ? item.name : item.ingredient_name}
                        </span>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {checkedItems.length > 0 && (
              <Card className="shadow-sm border-green-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    本次已采购 ({checkedItems.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {checkedItems.map((item) => {
                      const isCustom = item.ingredient_id.startsWith("custom-")
                      return (
                        <span
                          key={item.ingredient_id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 text-green-600"
                        >
                          {isCustom ? item.name : item.ingredient_name}
                          <span className="text-[10px] opacity-70">×{item.need_quantity}</span>
                        </span>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

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
                <Card key={store} className="shadow-sm">
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
                          const isCustom = item.ingredient_id.startsWith("custom-")
                          const currentQty = isCustom
                            ? (customItems.find(c => c.id === item.ingredient_id.replace("custom-", ""))?.need_quantity || 0)
                            : item.need_quantity

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
                                <span className="truncate">{isCustom ? item.name : item.ingredient_name}</span>
                                {isCustom && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0">
                                    临时
                                  </span>
                                )}
                              </div>
                            </div>

                              <div className="text-xs text-muted-foreground w-14 text-center shrink-0">
                                {item.price > 0 ? `¥${item.price}` : "-"}
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
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </>
        )}
      </main>

      {!listEmpty && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-background to-transparent pt-8">
          <div className="max-w-md mx-auto">
            <div className="flex gap-3">
              <LoadingButton
                className="flex-1 gap-2 bg-[#7FC58E] hover:bg-[#6FB07E] text-white"
                size="lg"
                onClick={() => setShowClearConfirm(true)}
                isLoading={saving}
                loadingText="清空中..."
              >
                清空剩余项
              </LoadingButton>
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
        onConfirm={(r) => void handleAddFromRecipe(r)}
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
              <div className="flex items-center gap-1 tabular-nums">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground px-2 py-1"
                  onClick={() =>
                    setEphemeralQty((q) => Math.max(1, Math.floor(q) - 1))
                  }
                >
                  −
                </button>
                <span className="w-8 text-center text-sm">{ephemeralQty}</span>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground px-2 py-1"
                  onClick={() => setEphemeralQty((q) => Math.floor(q) + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>
              取消
            </Button>
            <Button onClick={confirmEphemeralAdd}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        isOpen={showCompleteSuccess}
        title="采购成功"
        message="采购食材数据更新成功"
        onConfirm={() => {
          setShowCompleteSuccess(false)
        }}
        onCancel={() => {
          setShowCompleteSuccess(false)
        }}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showCompleteError}
        title="采购失败"
        message="采购食材数据更新失败"
        onConfirm={() => setShowCompleteError(false)}
        onCancel={() => setShowCompleteError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showClearConfirm}
        title="确认清空"
        message="确定要清空所有剩余项吗？此操作不可撤销。"
        onConfirm={() => void handleClear()}
        onCancel={() => setShowClearConfirm(false)}
      />

      <ConfirmModal
        isOpen={showClearSuccess}
        title="清空成功"
        message="清空完成"
        onConfirm={() => setShowClearSuccess(false)}
        onCancel={() => setShowClearSuccess(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showClearError}
        title="清空失败"
        message="清空失败，请重试"
        onConfirm={() => setShowClearError(false)}
        onCancel={() => setShowClearError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showAddItemSuccess}
        title="提示"
        message="物品已添加"
        onConfirm={() => setShowAddItemSuccess(false)}
        onCancel={() => setShowAddItemSuccess(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showImportResult}
        title="导入结果"
        message={`导入成功：${importResult.success} 项\n导入失败：${importResult.failed} 项`}
        onConfirm={() => setShowImportResult(false)}
        onCancel={() => setShowImportResult(false)}
        showCancelButton={false}
      />
    </div>
  )
}
