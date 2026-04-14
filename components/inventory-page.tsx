'use client'

import { useState, useMemo, useEffect } from 'react'
import { ArrowUpDown, Save, Package, ChefHat, ShoppingCart, Search, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ConfirmModal } from '@/components/confirm-modal'
import { Input } from '@/components/ui/input'
import { useData } from '@/contexts/DataContext'
import { useRouter } from 'next/navigation'

type SortType = 'date-desc' | 'date-asc' | 'quantity-desc' | 'quantity-asc'

export function InventoryPage() {
  const { inventory, recipes, updateIngredient, addToPurchaseTask, deleteIngredient, addIngredient, recalculateAndPersistPurchaseTask } = useData()
  const [sortType, setSortType] = useState<SortType>('date-desc')
  const [hasChanges, setHasChanges] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successIngredientName, setSuccessIngredientName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showDeleteLoading, setShowDeleteLoading] = useState(false)
  const [showSaveError, setShowSaveError] = useState(false)
  const [showAddToPurchaseError, setShowAddToPurchaseError] = useState(false)
  const [showDeleteError, setShowDeleteError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddIngredientModal, setShowAddIngredientModal] = useState(false)
  const [newIngredientName, setNewIngredientName] = useState('')
  const [newIngredientQuantity, setNewIngredientQuantity] = useState(0)
  const [showAddSuccess, setShowAddSuccess] = useState(false)
  const [showAddError, setShowAddError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [showIngredientSuggestions, setShowIngredientSuggestions] = useState(false)
  const [ingredientSuggestions, setIngredientSuggestions] = useState<string[]>([])
  const [showEditIngredientModal, setShowEditIngredientModal] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<any>(null)
  const [editIngredientName, setEditIngredientName] = useState('')
  const [editIngredientDate, setEditIngredientDate] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [showEditSuccess, setShowEditSuccess] = useState(false)
  const [showEditError, setShowEditError] = useState(false)
  const router = useRouter()

  // 当 inventory 变化时，更新 quantities 状态
  useEffect(() => {
    const initialQuantities: Record<string, number> = {}
    inventory.forEach(item => {
      initialQuantities[item.id] = item.quantity
    })
    setQuantities(initialQuantities)
  }, [inventory])

  const sortedInventory = [...inventory].sort((a, b) => {
    if (sortType === 'date-desc') {
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    } else if (sortType === 'date-asc') {
      return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
    } else if (sortType === 'quantity-desc') {
      return b.quantity - a.quantity
    } else {
      return a.quantity - b.quantity
    }
  })

  const filteredInventory = useMemo(() => {
    if (!searchQuery) return sortedInventory
    const query = searchQuery.toLowerCase().trim()
    return sortedInventory.filter(item => 
      item.name.toLowerCase().includes(query)
    )
  }, [sortedInventory, searchQuery])

  // 根据库存推荐菜谱
  const recommendedRecipes = useMemo(() => {
    // 创建库存食材的映射，方便查找
    const inventoryMap = new Map<string, number>()
    inventory.forEach(item => {
      if (item.quantity > 0) {
        inventoryMap.set(item.name.toLowerCase(), item.quantity)
      }
    })
    
    // 计算每个菜谱的库存满足率
    const recipesWithScore = recipes.map(recipe => {
      let totalNeed = 0
      let totalHave = 0
      
      recipe.ingredients.forEach(ing => {
        totalNeed += ing.quantity
        const invQuantity = inventoryMap.get(ing.name.toLowerCase()) || 0
        totalHave += Math.min(invQuantity, ing.quantity)
      })
      
      // 计算满足率
      const satisfactionRate = totalNeed > 0 ? totalHave / totalNeed : 0
      
      return {
        ...recipe,
        satisfactionRate,
        hasIngredients: inventoryMap.size > 0,
      }
    })
    
    // 筛选出至少有一种食材在库存中，且满足率大于0的菜谱，按满足率排序
    return recipesWithScore
      .filter(r => r.hasIngredients && r.satisfactionRate > 0)
      .sort((a, b) => b.satisfactionRate - a.satisfactionRate)
      .slice(0, 4)
  }, [inventory, recipes])

  const handleQuantityChange = (id: string, delta: number) => {
    const item = inventory.find(i => i.id === id)
    if (item) {
      const currentQty = quantities[id]
      const newQuantity = Math.max(0, currentQty + delta)
      setQuantities(prev => ({
        ...prev,
        [id]: newQuantity
      }))
      setHasChanges(true)
    }
  }
  
  const handleQuantityInput = (id: string, value: string) => {
    if (value === '') {
      // 空字符串视为 0
      setQuantities(prev => ({
        ...prev,
        [id]: 0
      }))
      setHasChanges(true)
    } else {
      const numValue = parseFloat(value)
      if (!isNaN(numValue) && numValue >= 0) {
        setQuantities(prev => ({
          ...prev,
          [id]: numValue
        }))
        setHasChanges(true)
      }
    }
  }



  const handleSave = async () => {
    setIsSaving(true)
    try {
      // 收集所有修改的食材和数量
      const modifiedItems = []
      
      // 遍历所有数量，只更新那些被修改的项
      for (const [id, quantity] of Object.entries(quantities)) {
        const ingredient = inventory.find(i => i.id === id)
        if (ingredient && quantity !== ingredient.quantity) {
          const originalQuantity = ingredient.quantity
          const isIncrease = quantity > originalQuantity
          await updateIngredient(id, quantity)
          modifiedItems.push({ 
            name: ingredient.name, 
            quantity, 
            isIncrease 
          })
        }
      }
      
      // 调用 recalculateAndPersistPurchaseTask() 刷新采购任务
      await recalculateAndPersistPurchaseTask()
      // 重置状态
      setHasChanges(false)
      
      if (modifiedItems.length > 0) {
        setShowSaveSuccess(true)
      }
    } catch (error) {
      console.error('保存失败:', error)
      setShowSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  const formatDate = (date: Date) => {
    const d = new Date(date)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const handleAddToShoppingCart = async (item: typeof inventory[0]) => {
    try {
      await addToPurchaseTask(item.id)
      setSuccessIngredientName(item.name)
      setShowSuccessModal(true)
    } catch (error) {
      setShowAddToPurchaseError(true)
      console.error('添加到采购清单失败:', error)
    }
  }

  const handleIngredientNameChange = (value: string) => {
    setNewIngredientName(value)
    
    // 当输入为空时，隐藏建议
    if (!value.trim()) {
      setShowIngredientSuggestions(false)
      setIngredientSuggestions([])
      return
    }
    
    // 匹配包含输入文字的食材
    const suggestions = inventory
      .filter(item => item.name.toLowerCase().includes(value.toLowerCase()))
      .map(item => item.name)
    
    if (suggestions.length > 0) {
      setIngredientSuggestions(suggestions)
      setShowIngredientSuggestions(true)
    } else {
      setShowIngredientSuggestions(false)
      setIngredientSuggestions([])
    }
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setNewIngredientName(suggestion)
    setShowIngredientSuggestions(false)
    // 选择建议后，检查食材是否已存在
    const existingIngredient = inventory.find(
      item => item.name.toLowerCase() === suggestion.toLowerCase()
    )
    if (existingIngredient) {
      setErrorMessage('食材已存在')
      setShowAddError(true)
    }
  }

  const handleAddIngredient = async () => {
    // 验证输入
    if (!newIngredientName.trim()) {
      setErrorMessage('请输入食材名称')
      setShowAddError(true)
      return
    }

    // 检查食材是否已存在
    const existingIngredient = inventory.find(
      item => item.name.toLowerCase().trim() === newIngredientName.toLowerCase().trim()
    )

    if (existingIngredient) {
      setErrorMessage('食材已存在')
      setShowAddError(true)
      return
    }

    setIsAdding(true)
    try {
      // 添加新食材
      await addIngredient({
        name: newIngredientName.trim(),
        quantity: newIngredientQuantity,
        addedAt: new Date()
      })
      
      // 重置表单
      setNewIngredientName('')
      setNewIngredientQuantity(0)
      setShowAddIngredientModal(false)
      setShowAddSuccess(true)
      setShowIngredientSuggestions(false)
      setIngredientSuggestions([])
    } catch (error) {
      setErrorMessage('添加食材失败，请重试')
      setShowAddError(true)
      console.error('添加食材失败:', error)
    } finally {
      setIsAdding(false)
    }
  }

  const handleEditIngredient = (item: typeof inventory[0]) => {
    setEditingIngredient(item)
    setEditIngredientName(item.name)
    // 格式化日期为 YYYY-MM-DD 格式
    const date = new Date(item.addedAt)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    setEditIngredientDate(`${year}-${month}-${day}`)
    setShowEditIngredientModal(true)
  }

  const handleSaveEdit = async () => {
    // 验证输入
    if (!editIngredientName.trim()) {
      setErrorMessage('请输入食材名称')
      setShowEditError(true)
      return
    }

    // 检查食材名称是否已被其他食材使用
    const existingIngredient = inventory.find(
      item => item.name.toLowerCase().trim() === editIngredientName.toLowerCase().trim() && item.id !== editingIngredient.id
    )

    if (existingIngredient) {
      setErrorMessage('食材名称已存在')
      setShowEditError(true)
      return
    }

    setIsEditing(true)
    try {
      // 更新食材
      await updateIngredient(editingIngredient.id, quantities[editingIngredient.id] || editingIngredient.quantity, {
        name: editIngredientName.trim(),
        addedAt: new Date(editIngredientDate)
      })
      
      // 重置表单
      setEditingIngredient(null)
      setEditIngredientName('')
      setEditIngredientDate('')
      setShowEditIngredientModal(false)
      setShowEditSuccess(true)
    } catch (error) {
      setErrorMessage('修改食材失败，请重试')
      setShowEditError(true)
      console.error('修改食材失败:', error)
    } finally {
      setIsEditing(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* 顶部栏 */}
      <header className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="font-semibold">我的库存</h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSortType(prev => prev === 'quantity-desc' ? 'quantity-asc' : 'quantity-desc')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowUpDown className="w-4 h-4" />
              按数量
            </button>
            <button 
              onClick={() => setSortType(prev => prev === 'date-desc' ? 'date-asc' : 'date-desc')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowUpDown className="w-4 h-4" />
              按时间
            </button>
            <Button 
              size="sm" 
              onClick={() => setShowAddIngredientModal(true)}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              添加食材
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        {/* 搜索框 */}
        <div className="mb-4 sticky top-14 z-50 bg-background/90 backdrop-blur-sm p-2 rounded-md border border-border shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索食材..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-border shadow-sm"
            />
          </div>
        </div>

        {filteredInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Package className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">{searchQuery ? '没有找到匹配的食材' : '库存为空'}</p>
          </div>
        ) : (
          <Card className="shadow-sm p-0">
            <CardContent className="p-0">
              {/* 表头 */}
              <div className="flex items-center px-4 py-3 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
                <div className="flex-1 min-w-0">食材</div>
                <div className="w-32 text-center shrink-0">数量</div>
                <div className="w-24 text-center shrink-0">操作</div>
                <div className="w-20 text-center shrink-0">日期</div>
              </div>
              
              {/* 数据行 */}
              <div className="divide-y divide-border">
                {filteredInventory.map(item => {
                  const currentQty = quantities[item.id] || 0
                  return (
                    <div 
                      key={item.id}
                      className="flex items-center px-4 py-3"
                    >
                      <div className="flex-1 text-sm font-medium min-w-0">{item.name}</div>
                      
                      {/* 数量控制 */}
                      <div className="w-32 flex items-center justify-center gap-0.5 tabular-nums shrink-0">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, -1)}
                          className="text-sm text-muted-foreground hover:text-foreground px-1.5 py-1"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          value={currentQty}
                          onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                          className="w-12 text-center text-sm border border-border rounded px-1"
                        />
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, 1)}
                          className="text-sm text-muted-foreground hover:text-foreground px-1.5 py-1"
                        >
                          +
                        </button>
                      </div>
                      {/* 操作列 */}
                      <div className="w-24 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditIngredient(item)}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="修改"
                        >
                          <svg
                            className="w-4 h-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddToShoppingCart(item)}
                          className="p-1.5 text-green-500 hover:bg-green-50 rounded transition-colors"
                          title="加入购物车"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(item.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="删除"
                        >
                          <svg
                            className="w-4 h-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="w-20 text-center text-xs text-muted-foreground shrink-0">
                        {formatDate(item.addedAt)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 根据库存推荐菜谱 */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <ChefHat className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">根据库存推荐</h2>
          </div>
          {recommendedRecipes.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {recommendedRecipes.map(recipe => {
                const availableIngredients = recipe.ingredients.filter(ing => {
                  const inventoryItem = inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase())
                  return inventoryItem && inventoryItem.quantity >= ing.quantity
                }).length
                const totalIngredients = recipe.ingredients.length
                
                return (
                  <Card 
                    key={recipe.id} 
                    className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      router.push(`/plan/new?recipeId=${recipe.id}`)
                    }}
                  >
                    <CardContent className="py-1 px-3">
                      <div className="font-bold text-base mb-1">{recipe.name}</div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {recipe.ingredients.map((ing, idx) => {
                          const inventoryItem = inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase())
                          const ok = inventoryItem && inventoryItem.quantity >= ing.quantity
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
                      <div className="text-xs text-green-600">
                        已有 {availableIngredients}/{totalIngredients} 种食材
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">暂无推荐菜谱</p>
              <p className="text-xs mt-1">添加食材到库存后，系统会为您推荐合适的菜谱</p>
            </div>
          )}
        </div>
      </main>

      {/* 保存按钮 */}
      {hasChanges && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-background to-transparent pt-8">
          <div className="max-w-md mx-auto">
            <LoadingButton 
              className="w-full gap-2" 
              size="lg"
              onClick={handleSave}
              isLoading={isSaving}
              loadingText="保存中..."
            >
              <Save className="w-4 h-4" />
              保存更改
            </LoadingButton>
          </div>
        </div>
      )}
      
      {/* 成功添加提示 */}
      <ConfirmModal
        isOpen={showSuccessModal}
        title="添加成功"
        message={`${successIngredientName}已添加进采购清单中`}
        onConfirm={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        showCancelButton={false}
      />

      {/* 保存成功提示 */}
      <ConfirmModal
        isOpen={showSaveSuccess}
        title="提示"
        message="保存成功"
        onConfirm={() => setShowSaveSuccess(false)}
        onCancel={() => setShowSaveSuccess(false)}
        showCancelButton={false}
      />

      {/* 删除确认提示 */}
      <ConfirmModal
        isOpen={!!deleteId}
        title="删除食材"
        message="确定删除该食材吗？此操作不可撤销。"
        confirmText="删除"
        cancelText="取消"
        isLoading={showDeleteLoading}
        onConfirm={async () => {
          if (deleteId) {
            setShowDeleteLoading(true)
            try {
              await deleteIngredient(deleteId)
            } catch (error) {
              console.error('删除食材失败:', error)
              setShowDeleteError(true)
            } finally {
              setShowDeleteLoading(false)
              setDeleteId(null)
            }
          }
        }}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmModal
        isOpen={showSaveError}
        title="保存失败"
        message="保存失败，请重试"
        onConfirm={() => setShowSaveError(false)}
        onCancel={() => setShowSaveError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showAddToPurchaseError}
        title="添加失败"
        message="添加到采购清单失败"
        onConfirm={() => setShowAddToPurchaseError(false)}
        onCancel={() => setShowAddToPurchaseError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showDeleteError}
        title="删除失败"
        message="删除失败，请重试"
        onConfirm={() => setShowDeleteError(false)}
        onCancel={() => setShowDeleteError(false)}
        showCancelButton={false}
      />

      {/* 添加食材模态框 */}
      <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 ${showAddIngredientModal ? 'block' : 'hidden'}`}>
        <div className="bg-white rounded-lg w-full max-w-md p-6">
          <h3 className="font-semibold text-lg mb-4">添加食材</h3>
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium mb-1">食材名</label>
              <Input
                type="text"
                value={newIngredientName}
                onChange={(e) => handleIngredientNameChange(e.target.value)}
                placeholder="请输入食材名称"
              />
              {/* 食材建议下拉框 */}
              {showIngredientSuggestions && ingredientSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg z-10 max-h-40 overflow-y-auto">
                  {ingredientSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">数量</label>
              <Input
                type="text"
                value={newIngredientQuantity === 0 ? '' : newIngredientQuantity}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === '') {
                    setNewIngredientQuantity(0)
                  } else {
                    const numValue = parseFloat(value)
                    if (!isNaN(numValue) && numValue >= 0) {
                      setNewIngredientQuantity(numValue)
                    }
                  }
                }}
                placeholder="0"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowAddIngredientModal(false)
                  setNewIngredientName('')
                  setNewIngredientQuantity(0)
                }}
                className="flex-1"
                disabled={isAdding}
              >
                取消
              </Button>
              <LoadingButton 
                onClick={handleAddIngredient}
                className="flex-1"
                isLoading={isAdding}
                loadingText="添加中..."
              >
                确认
              </LoadingButton>
            </div>
          </div>
        </div>
      </div>

      {/* 添加成功提示 */}
      <ConfirmModal
        isOpen={showAddSuccess}
        title="添加成功"
        message="食材添加成功"
        onConfirm={() => setShowAddSuccess(false)}
        onCancel={() => setShowAddSuccess(false)}
        showCancelButton={false}
      />

      {/* 添加失败提示 */}
      <ConfirmModal
        isOpen={showAddError}
        title="添加失败"
        message={errorMessage}
        onConfirm={() => setShowAddError(false)}
        onCancel={() => setShowAddError(false)}
        showCancelButton={false}
      />

      {/* 修改食材模态框 */}
      <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 ${showEditIngredientModal ? 'block' : 'hidden'}`}>
        <div className="bg-white rounded-lg w-full max-w-md p-6">
          <h3 className="font-semibold text-lg mb-4">修改食材</h3>
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium mb-1">食材名</label>
              <Input
                type="text"
                value={editIngredientName}
                onChange={(e) => setEditIngredientName(e.target.value)}
                placeholder="请输入食材名称"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">日期</label>
              <Input
                type="date"
                value={editIngredientDate}
                onChange={(e) => setEditIngredientDate(e.target.value)}
              />
            </div>
            <div className="flex gap-3 mt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEditIngredientModal(false)
                  setEditingIngredient(null)
                  setEditIngredientName('')
                  setEditIngredientDate('')
                }}
                className="flex-1"
                disabled={isEditing}
              >
                取消
              </Button>
              <LoadingButton 
                onClick={handleSaveEdit}
                className="flex-1"
                isLoading={isEditing}
                loadingText="修改中..."
              >
                确认
              </LoadingButton>
            </div>
          </div>
        </div>
      </div>

      {/* 修改成功提示 */}
      <ConfirmModal
        isOpen={showEditSuccess}
        title="修改成功"
        message="食材修改成功"
        onConfirm={() => setShowEditSuccess(false)}
        onCancel={() => setShowEditSuccess(false)}
        showCancelButton={false}
      />

      {/* 修改失败提示 */}
      <ConfirmModal
        isOpen={showEditError}
        title="修改失败"
        message={errorMessage}
        onConfirm={() => setShowEditError(false)}
        onCancel={() => setShowEditError(false)}
        showCancelButton={false}
      />
    </div>
  )
}
