"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Plus, TrendingDown, Upload, X, Store, Save, Search } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmModal } from "@/components/confirm-modal"
import { useData } from "@/contexts/DataContext"
import { supabase } from "@/lib/supabaseClient"
import type { InventoryItem } from "@/lib/types"

function findIngredientByName(inventory: InventoryItem[], name: string): InventoryItem | undefined {
  return inventory.find(item => {
    if (item.name === name) return true
    if (item.alias) {
      const aliases = item.alias.split(/[、,，]/).filter(a => a.trim())
      return aliases.includes(name)
    }
    return false
  })
}

async function upsertPriceRow(
  ingredientId: string,
  shopId: string,
  price: number
) {
  const { data: row } = await supabase
    .from("prices")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .eq("shop_id", shopId)
    .maybeSingle()
  if (row?.id) {
    const { error } = await supabase
      .from("prices")
      .update({ price })
      .eq("id", row.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from("prices").insert({
      ingredient_id: ingredientId,
      shop_id: shopId,
      price,
    })
    if (error) throw error
  }
}

export function PricePage() {
  const { priceList, addIngredient, refresh, recalculateAndPersistPurchaseTask, inventory, shops, addShop } = useData()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedStore, setSelectedStore] = useState("")
  const [newStoreName, setNewStoreName] = useState("")
  const [isAddingStore, setIsAddingStore] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [prices, setPrices] = useState<Record<string, Record<string, number | string>>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState("")
  const [manualPrice, setManualPrice] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showUploadSuccess, setShowUploadSuccess] = useState(false)
  const [isAddingPrice, setIsAddingPrice] = useState(false)
  const [showAddPriceSuccess, setShowAddPriceSuccess] = useState(false)
  const [isAddingNewStore, setIsAddingNewStore] = useState(false)
  const [showAddStoreSuccess, setShowAddStoreSuccess] = useState(false)
  const [showAddStoreError, setShowAddStoreError] = useState(false)
  const [showCsvFormatError, setShowCsvFormatError] = useState(false)
  const [showUploadShopNotFoundError, setShowUploadShopNotFoundError] = useState(false)
  const [showUploadEmptyError, setShowUploadEmptyError] = useState(false)
  const [showUploadNoValidDataError, setShowUploadNoValidDataError] = useState(false)
  const [uploadSuccessCount, setUploadSuccessCount] = useState(0)
  const [uploadErrorMsg, setUploadErrorMsg] = useState("")
  const [showUploadError, setShowUploadError] = useState(false)
  const [showSaveError, setShowSaveError] = useState(false)
  const [showAddPriceError, setShowAddPriceError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  const allStores = useMemo(() => {
    // 计算每个店铺的价格数量
    const storePriceCounts = shops.map(shop => {
      const count = priceList.filter(item => item.shop_name === shop.name).length
      return { name: shop.name, count }
    })
    
    // 按照价格数量降序排序
    storePriceCounts.sort((a, b) => b.count - a.count)
    
    // 提取排序后的店铺名称
    return storePriceCounts.map(store => store.name)
  }, [shops, priceList])

  const allIngredients = useMemo(() => {
    return [...new Set(priceList.map((item) => item.ingredient))]
  }, [priceList])

  const filteredIngredients = useMemo(() => {
    if (!searchQuery) return allIngredients
    const query = searchQuery.toLowerCase().trim()
    return allIngredients.filter(ingredient => 
      ingredient.toLowerCase().includes(query)
    )
  }, [allIngredients, searchQuery])

  // 初始化 prices 状态
  useEffect(() => {
    const initialPrices: Record<string, Record<string, number | string>> = {}
    allIngredients.forEach((ingredient) => {
      initialPrices[ingredient] = {}
      allStores.forEach((store) => {
        const item = priceList.find(
          (p) => p.ingredient === ingredient && p.shop_name === store
        )
        initialPrices[ingredient][store] = item ? item.price : ""
      })
    })
    setPrices(initialPrices)
  }, [priceList, allIngredients, allStores])
  
  const priceMatrix = useMemo(() => {
    return prices
  }, [prices])

  const getLowestPrice = (ingredient: string) => {
    const prices = Object.values(priceMatrix[ingredient] || {}).filter(
      (p) => typeof p === 'number'
    ) as number[]
    return prices.length > 0 ? Math.min(...prices) : null
  }

  const handleAddStore = async () => {
    if (newStoreName.trim() && !allStores.includes(newStoreName.trim())) {
      setIsAddingNewStore(true)
      try {
        await addShop({ name: newStoreName.trim() })
        setSelectedStore(newStoreName.trim())
        setNewStoreName("")
        setIsAddingStore(false)
        setShowAddStoreSuccess(true)
      } catch (error) {
        console.error('添加店铺失败:', error)
        setShowAddStoreError(true)
      } finally {
        setIsAddingNewStore(false)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setUploadedFile(file)
      } else {
        setShowCsvFormatError(true)
      }
    }
  }

  const handleUpload = async () => {
    if (!selectedStore || !uploadedFile) return

    setIsUploading(true)
    try {
      const shop = shops.find(s => s.name === selectedStore)
      if (!shop) {
        setShowUploadShopNotFoundError(true)
        return
      }

      const text = await uploadedFile.text()
      const lines = text.split(/\r?\n/).filter(line => line.trim())
      
      if (lines.length === 0) {
        setShowUploadEmptyError(true)
        return
      }

      const startIndex = isNaN(parseFloat(lines[0].split(/[,;\t]/)[1]?.trim())) ? 1 : 0

      const validItems: { name: string; price: number }[] = []
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const parts = line.split(/[,;\t]/)
        if (parts.length < 2) continue

        const name = parts[0].trim()
        const priceStr = parts[1].trim()

        if (!name) continue

        const price = parseFloat(priceStr)
        if (isNaN(price) || price < 0) continue

        validItems.push({ name, price })
      }

      if (validItems.length === 0) {
        setShowUploadNoValidDataError(true)
        return
      }

      const ingredientIds = new Map<string, string>()

      await Promise.all(
        validItems.map(async (item) => {
          const { data: existing } = await supabase
            .from("ingredients")
            .select("id")
            .eq("name", item.name)
            .maybeSingle()

          if (existing?.id) {
            ingredientIds.set(item.name, existing.id)
          } else {
            const { data: inserted, error } = await supabase
              .from("ingredients")
              .insert({
                name: item.name,
                unit: "斤",
                quantity: 0,
              })
              .select("id")
              .single()

            if (error) throw error
            if (inserted?.id) {
              ingredientIds.set(item.name, inserted.id)
            }
          }
        })
      )

      await Promise.all(
        validItems.map(async (item) => {
          const ingredientId = ingredientIds.get(item.name)
          if (!ingredientId) return

          const { data: existingPrice } = await supabase
            .from("prices")
            .select("id")
            .eq("ingredient_id", ingredientId)
            .eq("shop_id", shop.id)
            .maybeSingle()

          if (existingPrice?.id) {
            await supabase
              .from("prices")
              .update({ price: item.price })
              .eq("id", existingPrice.id)
          } else {
            await supabase.from("prices").insert({
              ingredient_id: ingredientId,
              shop_id: shop.id,
              price: item.price,
            })
          }
        })
      )

      await refresh()
      setIsModalOpen(false)
      setSelectedStore("")
      setUploadedFile(null)
      setUploadSuccessCount(validItems.length)
      setShowUploadSuccess(true)
    } catch (error) {
      console.error('上传失败:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      setUploadErrorMsg(errorMsg)
      setShowUploadError(true)
    } finally {
      setIsUploading(false)
    }
  }

  const handleCancel = () => {
    setIsModalOpen(false)
    setSelectedStore("")
    setUploadedFile(null)
    setIsAddingStore(false)
    setNewStoreName("")
    setSelectedIngredient("")
    setManualPrice("")
  }
  
  const handlePriceChange = (ingredient: string, store: string, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0) {
      setPrices(prev => {
        const newPrices = { ...prev }
        if (!newPrices[ingredient]) {
          newPrices[ingredient] = {}
        }
        newPrices[ingredient][store] = numValue
        return newPrices
      })
      setHasChanges(true)
    } else if (value === "") {
      setPrices(prev => {
        const newPrices = { ...prev }
        if (!newPrices[ingredient]) {
          newPrices[ingredient] = {}
        }
        newPrices[ingredient][store] = ""
        return newPrices
      })
      setHasChanges(true)
    }
  }
  
  const handleSave = async () => {
    setIsSaving(true)
    try {
      // 遍历所有价格，更新到数据库
      for (const [ingredient, storePrices] of Object.entries(prices)) {
        for (const [storeName, price] of Object.entries(storePrices)) {
          if (typeof price === 'number') {
            // 查找食材 ID
            const ingredientId = findIngredientByName(inventory, ingredient)?.id
            // 查找店铺 ID
            const shop = shops.find(s => s.name === storeName)
            if (ingredientId && shop) {
              await upsertPriceRow(ingredientId, shop.id, price)
            }
          }
        }
      }
      // 调用 recalculateAndPersistPurchaseTask() 刷新采购任务
      await recalculateAndPersistPurchaseTask()
      // 刷新数据
      await refresh()
      // 重置状态
      setHasChanges(false)
      setShowSaveSuccess(true)
    } catch (error) {
      console.error('保存失败:', error)
      setShowSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleManualAdd = async () => {
    if (!selectedStore || !selectedIngredient || !manualPrice) return
    
    const price = parseFloat(manualPrice)
    if (isNaN(price) || price < 0) return
    
    setIsAddingPrice(true)
    try {
      // 查找店铺 ID
      const shop = shops.find(s => s.name === selectedStore)
      if (!shop) return
      
      // 查找或创建食材
      let ingredientId = findIngredientByName(inventory, selectedIngredient)?.id
      if (!ingredientId) {
        ingredientId = await addIngredient({
          name: selectedIngredient,
          unit: "份",
          quantity: 0,
        })
      }
      
      // 保存价格
      await upsertPriceRow(ingredientId, shop.id, price)
      
      // 刷新数据
      await refresh()
      
      // 重置状态
      setSelectedIngredient("")
      setManualPrice("")
      setShowAddPriceSuccess(true)
    } catch (error) {
      console.error('添加价格失败:', error)
      setShowAddPriceError(true)
    } finally {
      setIsAddingPrice(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <h1 className="text-lg font-semibold">价格对比</h1>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsModalOpen(true)}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            添加
          </Button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-4 pb-40">
        {/* 搜索框 */}
        <div className="mb-4">
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

        {filteredIngredients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <TrendingDown className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">{searchQuery ? '没有找到匹配的食材' : '暂无价格数据'}</p>
            <Button
              variant="link"
              onClick={() => setIsModalOpen(true)}
              className="mt-2"
            >
              添加第一条记录
            </Button>
          </div>
        ) : (
          <Card className="shadow-sm overflow-hidden py-0">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        食材名
                      </th>
                      {allStores.map((store) => (
                        <th
                          key={store}
                          className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {store}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredIngredients.map((ingredient) => {
                      const lowestPrice = getLowestPrice(ingredient)

                      return (
                        <tr
                          key={ingredient}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-3 py-3 font-medium whitespace-nowrap">
                            {ingredient}
                          </td>
                          {allStores.map((store) => {
                            const price = priceMatrix[ingredient]?.[store] || ""
                            const isLowest =
                              typeof price === 'number' &&
                              price === lowestPrice

                            return (
                              <td
                                key={store}
                                className={`px-3 py-3 text-center whitespace-nowrap ${
                                  isLowest ? "text-primary font-semibold" : ""
                                }`}
                              >
                                <Input
                                  type="number"
                                  value={price}
                                  onChange={(e) => handlePriceChange(ingredient, store, e.target.value)}
                                  step="0.1"
                                  min="0"
                                  className="w-20 text-center"
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* 回到顶部按钮 */}
      <button
        onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-35 right-6 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="回到顶部"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-card w-full max-w-md rounded-t-2xl animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-center">添加价格数据</h2>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">选择店铺</label>
                {!isAddingStore ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {allStores.map((store) => (
                        <button
                          key={store}
                          type="button"
                          onClick={() => setSelectedStore(store)}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                            selectedStore === store
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border hover:border-primary"
                          }`}
                        >
                          {store}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddingStore(true)}
                      className="gap-1"
                    >
                      <Store className="w-4 h-4" />
                      添加店铺
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入店铺名称"
                      value={newStoreName}
                      onChange={(e) => setNewStoreName(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <LoadingButton onClick={handleAddStore} size="sm" isLoading={isAddingNewStore} loadingText="添加中...">
                      确定
                    </LoadingButton>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddingStore(false)
                        setNewStoreName("")
                      }}
                    >
                      取消
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">上传价格表格</label>
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        fileInputRef.current?.click()
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {uploadedFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm text-foreground">
                          {uploadedFile.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setUploadedFile(null)
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          点击上传价格表格
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          仅支持 CSV 格式（第一列：食材名称，第二列：单价/元/斤）
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">手动添加价格</label>
                  <div className="space-y-2">
                    <Select value={selectedIngredient} onValueChange={setSelectedIngredient}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择食材" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map(item => (
                          <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="单价"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      step="0.01"
                      min="0"
                    />
                    <LoadingButton
                      className="w-full"
                      onClick={() => void handleManualAdd()}
                      disabled={!selectedStore || !selectedIngredient || !manualPrice}
                      isLoading={isAddingPrice}
                      loadingText="添加中..."
                    >
                      添加价格
                    </LoadingButton>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancel}
              >
                取消
              </Button>
              <LoadingButton
                className="flex-1"
                onClick={() => void handleUpload()}
                disabled={!selectedStore || !uploadedFile}
                isLoading={isUploading}
                loadingText="上传中..."
              >
                上传
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
      
      {/* 保存按钮 */}
      {hasChanges && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-background to-transparent pt-8">
          <div className="max-w-md mx-auto">
            <LoadingButton 
              className="w-full gap-2" 
              size="lg"
              onClick={() => void handleSave()}
              isLoading={isSaving}
              loadingText="保存中..."
            >
              <Save className="w-4 h-4" />
              保存更改
            </LoadingButton>
          </div>
        </div>
      )}
      
      {/* 保存成功提示 */}
      <ConfirmModal
        isOpen={showSaveSuccess}
        title="提示"
        message="保存成功"
        onConfirm={() => setShowSaveSuccess(false)}
        onCancel={() => setShowSaveSuccess(false)}
        showCancelButton={false}
      />
      
      {/* 上传成功提示 */}
      <ConfirmModal
        isOpen={showUploadSuccess}
        title="提示"
        message="上传成功"
        onConfirm={() => setShowUploadSuccess(false)}
        onCancel={() => setShowUploadSuccess(false)}
        showCancelButton={false}
      />
      
      {/* 添加价格成功提示 */}
      <ConfirmModal
        isOpen={showAddPriceSuccess}
        title="提示"
        message="价格添加成功"
        onConfirm={() => setShowAddPriceSuccess(false)}
        onCancel={() => setShowAddPriceSuccess(false)}
        showCancelButton={false}
      />
      
      {/* 添加店铺成功提示 */}
      <ConfirmModal
        isOpen={showAddStoreSuccess}
        title="提示"
        message="店铺添加成功"
        onConfirm={() => setShowAddStoreSuccess(false)}
        onCancel={() => setShowAddStoreSuccess(false)}
        showCancelButton={false}
      />
    </div>
  )
}
